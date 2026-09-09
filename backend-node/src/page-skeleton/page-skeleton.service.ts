import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import sharp from 'sharp';
// pngjs：纯 JS、极宽容的 PNG 解码器，作为 sharp/libvips 拒读某些 PNG（特定色型 / iCCP / 高位深 / Display P3 等）时的兜底
import { PNG } from 'pngjs';
// archiver 与 screen-layout 模块保持一致的引用方式（CommonJS）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ZipArchive } = require('archiver');
import axios from 'axios';
import { TasksService } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { VisionAgent } from '../ai-engine/agents/vision-agent';
import { getProviderPool } from '../ai-engine/utils/provider-pool';
import { resolveVisionConfig } from '../ai-engine/utils/ai-defaults';
import { AiConfigService } from '../config/config.service';
import { resolveFrontendWorkspacePath } from '../config/backend-root';

const PAGE_ROOT = path.join(__dirname, '../../workspace', 'vue3-pages');

/** 区域类型 */
type Region = 'header' | 'footer' | 'left' | 'right' | 'center';
interface SkeletonComponent {
  name: string;
  region: Region;
  type: string;
  heightRatio: number;
  placeholder: boolean;
  note?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}
interface SkeletonLayout {
  title: string;
  headerH: number;
  footerH: number;
  leftSidebarW: number;
  rightSidebarW: number;
  centerPlaceholder: boolean;
  theme: {
    bg: string;
    panel: string;
    text: string;
    accent: string;
    header: string;
    footer: string;
  };
}
interface SkeletonStructure {
  layout: SkeletonLayout;
  components: SkeletonComponent[];
}

function ok(data: any, source = 'page-skeleton') {
  return { success: true, code: 0, message: 'ok', data, source };
}

/** 防路径穿越：仅允许字母数字与 - _ */
function safeSeg(seg: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(seg)) {
    throw new BadRequestException(`非法标识符: ${seg}`);
  }
  return seg;
}

/** 校验 page 目录确实位于 vue3-pages/{groupId}/{pageId} 之下，防穿越 */
function assertInsidePageRoot(absPath: string, groupId: string, pageId: string) {
  const base = path.join(PAGE_ROOT, groupId, pageId);
  const rel = path.relative(base, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ForbiddenException('路径越权');
  }
}

@Injectable()
export class PageSkeletonService {
  private readonly logger = new Logger(PageSkeletonService.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly aiConfigService: AiConfigService,
    private readonly progressService: ProgressService,
  ) {}

  // ============================================================
  // 对外服务方法
  // ============================================================

  /** 创建：截图(multipart) 或 figmaUrl → 登记 running 任务 → 立即返回 → 后台异步生成（真实分步进度经 SSE 推送） */
  async create(
    userId: string,
    payload: { groupId: string; name?: string; figmaUrl?: string },
    file?: any,
  ): Promise<any> {
    const groupId = safeSeg(payload.groupId);
    const pageId = 'page-' + crypto.randomBytes(6).toString('hex');
    const isFigma = !!payload.figmaUrl;

    // 先登记 running 任务（与组件生成管线对齐），前端任务详情页据此订阅 SSE 实时进度
    this.tasksService.createTask(
      pageId,
      {
        taskType: 'page-skeleton',
        componentName: payload.name?.trim() || '未命名页面',
        groupId,
        userId,
        sourceType: isFigma ? 'figma' : 'screenshot',
      },
      'running',
    );

    // 立即返回 pageId，后台异步执行生成（含真实分步进度）
    const result = ok({
      id: pageId,
      name: payload.name?.trim() || '未命名页面',
      groupId,
      userId,
      status: 'running',
      downloadUrl: `/api/page-skeleton/${groupId}/${pageId}/download`,
    });

    void this.generateFromImage(pageId, groupId, userId, {
      name: payload.name,
      figmaUrl: payload.figmaUrl,
      buffer: file?.buffer,
      isFigma,
    }).catch((e: any) => {
      this.logger.error(`[page-skeleton] 异步生成未捕获异常 pageId=${pageId}`, e?.stack || e);
    });

    return result;
  }

  /**
   * 后台异步生成：真实分步进度通过 ProgressService 回写任务（SSE 实时推送 + 持久化到 task.progress）。
   * 失败时标记 failed（前端可基于磁盘已存 screenshot.png 重试，见 retry）。
   */
  private async generateFromImage(
    pageId: string,
    groupId: string,
    userId: string,
    opts: { name?: string; figmaUrl?: string; buffer?: Buffer; isFigma: boolean },
  ): Promise<void> {
    const sessionId = pageId;
    try {
      // 1) 输入源
      this.progressService.sendProgress(sessionId, {
        stage: 'input',
        status: 'running',
        message: opts.isFigma ? '准备 Figma 渲染图…' : '准备截图输入…',
      });

      let imageBuffer: Buffer;
      let imageW = 0;
      let imageH = 0;
      const sourceType: 'screenshot' | 'figma' = opts.isFigma ? 'figma' : 'screenshot';
      const sourceUrl = opts.figmaUrl || '';

      if (opts.isFigma) {
        this.progressService.sendLog(sessionId, 'info', '下载 Figma 节点渲染图…');
        const dl = await this.renderFigmaImage(opts.figmaUrl!);
        imageBuffer = dl.buffer;
        imageW = dl.width;
        imageH = dl.height;
      } else if (opts.buffer && opts.buffer.length) {
        this.progressService.sendLog(sessionId, 'info', '读取上传截图…');
        imageBuffer = opts.buffer;
      } else {
        throw new BadRequestException('缺少截图文件或 figmaUrl');
      }

      // 2) 消毒 + 尺寸
      this.progressService.sendProgress(sessionId, {
        stage: 'sanitize',
        status: 'running',
        message: '图像消毒与尺寸解析…',
      });
      if (!imageW || !imageH) {
        try {
          const meta = await sharp(imageBuffer).metadata();
          imageW = meta.width || 0;
          imageH = meta.height || 0;
        } catch {
          imageW = 0;
          imageH = 0;
        }
      }
      imageBuffer = await this.sanitizeImageBuffer(imageBuffer);
      if (!imageW || !imageH) {
        const meta = await sharp(imageBuffer).metadata();
        imageW = meta.width || 1440;
        imageH = meta.height || 810;
      }

      const tmpPath = path.join(os.tmpdir(), `ps-${pageId}.png`);
      await fsp.writeFile(tmpPath, imageBuffer);

      // 3) vision 布局分析
      const visionCfg = await this.getVisionConfig(userId);
      const visionModel = visionCfg?.model || '未知视觉模型';
      this.progressService.sendProgress(sessionId, {
        stage: 'analyze',
        status: 'running',
        message: '调用视觉模型分析页面布局…',
        meta: { model: visionModel },
      });
      const { structure, model } = await this.analyzeLayout(tmpPath, imageW, imageH, userId);
      const resolvedModel = model && model !== '未知视觉模型' ? model : visionModel;
      const name = opts.name?.trim() || structure.layout.title || '未命名页面';
      // 显式登记模型名，使生成日志显示「[model]」前缀（模仿组件生成管线）
      this.progressService.sendLog(sessionId, 'info', `视觉模型分析完成（${resolvedModel}）`, { model: resolvedModel });

      // 4) 渲染目录
      this.progressService.sendProgress(sessionId, {
        stage: 'render',
        status: 'running',
        message: `渲染页面骨架与 ${structure.components.length} 个面板组件…`,
      });
      const folder = path.join(PAGE_ROOT, groupId, pageId);
      await this.renderPageFiles(folder, {
        pageId,
        groupId,
        userId,
        name,
        imageW,
        imageH,
        sourceType,
        sourceUrl,
        structure,
        screenshotBuffer: imageBuffer,
      });

      // 5) 完成
      this.progressService.sendProgress(sessionId, {
        stage: 'done',
        status: 'running',
        message: '页面骨架生成完成',
      });
      try {
        await fsp.unlink(tmpPath);
      } catch {}

      this.progressService.sendComplete(sessionId, {
        success: true,
        id: pageId,
        name,
        groupId,
        userId,
        path: `vue3-pages/${groupId}/${pageId}`,
        downloadUrl: `/api/page-skeleton/${groupId}/${pageId}/download`,
        // 实际使用的视觉模型：前端「AI 模型」侧栏与日志共用（模仿组件生成）
        _completionModels: { visionModel: resolvedModel },
      });
    } catch (e: any) {
      this.logger.error(`[page-skeleton] 生成失败 pageId=${pageId}`, e?.stack || e);
      this.progressService.sendError(sessionId, e);
    }
  }

  /** 失败重试：基于磁盘已保存的 screenshot.png 重新分析 + 渲染（无需重新上传） */
  async retry(userId: string, pageId: string, groupId: string): Promise<any> {
    const folder = this.resolveFolder(userId, groupId, pageId);
    const meta = await this.readMeta(folder, userId);
    const shotPath = path.join(folder, 'screenshot.png');
    if (!fs.existsSync(shotPath)) {
      throw new NotFoundException('未找到原始截图，无法重试（请重新创建）');
    }
    const imageBuffer = await fsp.readFile(shotPath);

    // 重置任务为 running（覆盖旧记录，清空 progress）
    this.tasksService.createTask(
      pageId,
      {
        taskType: 'page-skeleton',
        componentName: meta.name || '未命名页面',
        groupId,
        userId,
        sourceType: (meta as any)?.source?.type || 'screenshot',
      },
      'running',
    );

    void this.generateFromImage(pageId, groupId, userId, {
      name: meta.name,
      figmaUrl: undefined,
      buffer: imageBuffer,
      isFigma: false,
    }).catch((e: any) => {
      this.logger.error(`[page-skeleton] 重试未捕获异常 pageId=${pageId}`, e?.stack || e);
    });

    return ok({ id: pageId, groupId, status: 'running', retried: true });
  }

  /** 列出当前用户全部页面（跨分组扫描，按 userId 过滤） */
  async list(userId: string, groupId?: string): Promise<any> {
    const groups = groupId
      ? [safeSeg(groupId)]
      : (await this.safeReaddir(PAGE_ROOT));
    const items: any[] = [];
    for (const g of groups) {
      const groupDir = path.join(PAGE_ROOT, g);
      if (!fs.existsSync(groupDir)) continue;
      const pageIds = await this.safeReaddir(groupDir);
      for (const pid of pageIds) {
        const metaPath = path.join(groupDir, pid, 'page-meta.json');
        if (!fs.existsSync(metaPath)) continue;
        try {
          const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
          if (meta.creatorId && meta.creatorId !== userId) continue;
          items.push({
            id: pid,
            name: meta.name,
            groupId: g,
            source: meta.source,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
          });
        } catch {}
      }
    }
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return ok(items);
  }

  /** 取单个页面：meta + structure + 各文件内容 */
  async getOne(userId: string, pageId: string, groupId: string): Promise<any> {
    const folder = this.resolveFolder(userId, groupId, pageId);
    const meta = await this.readMeta(folder, userId);
    const structure = (meta as any).structure;
    const read = async (rel: string) => {
      const p = path.join(folder, rel);
      assertInsidePageRoot(p, safeSeg(groupId), pageId);
      return fs.existsSync(p) ? await fsp.readFile(p, 'utf8') : '';
    };
    return ok({
      id: pageId,
      meta,
      structure,
      files: {
        'index.vue': await read('index.vue'),
        'components': await this.readComponents(folder),
        '组件清单.md': await read('组件清单.md'),
      },
    });
  }

  /** 更新：改名 或 改 structure 后重渲染 */
  async update(userId: string, pageId: string, groupId: string, patch: any): Promise<any> {
    const folder = this.resolveFolder(userId, groupId, pageId);
    const meta = await this.readMeta(folder, userId);
    let needRerender = false;

    if (typeof patch.name === 'string' && patch.name.trim()) {
      meta.name = patch.name.trim();
    }
    if (patch.structure && typeof patch.structure === 'object') {
      meta.structure = patch.structure;
      needRerender = true;
    }
    meta.updatedAt = new Date().toISOString();
    await fsp.writeFile(path.join(folder, 'page-meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    if (needRerender) {
      const dims = (meta as any).source || {};
      await this.renderPageFiles(folder, {
        pageId,
        groupId,
        userId,
        name: meta.name,
        imageW: dims.imageW || 1440,
        imageH: dims.imageH || 810,
        sourceType: dims.type || 'screenshot',
        sourceUrl: dims.url || '',
        structure: meta.structure,
        // 不覆盖原截图
        skipScreenshot: true,
        screenshotBuffer: Buffer.alloc(0),
      });
    }
    return ok({ id: pageId, name: meta.name, updatedAt: meta.updatedAt });
  }

  /** 下载 ZIP：index.vue + components/ + 组件清单.md + styles */
  async downloadZip(userId: string, pageId: string, groupId: string): Promise<Buffer> {
    const folder = this.resolveFolder(userId, groupId, pageId);
    await this.readMeta(folder, userId); // 校验归属

    return new Promise((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (e: Error) => reject(e));

      const addIfExists = (rel: string, zipName: string) => {
        const p = path.join(folder, rel);
        if (fs.existsSync(p)) archive.append(fs.readFileSync(p), { name: zipName });
      };

      addIfExists('index.vue', 'index.vue');
      addIfExists('组件清单.md', '组件清单.md');
      addIfExists('resources/styles/index.less', 'resources/styles/index.less');

      // components/*
      const compDir = path.join(folder, 'components');
      if (fs.existsSync(compDir)) {
        for (const f of fs.readdirSync(compDir)) {
          if (f.endsWith('.vue')) {
            archive.append(fs.readFileSync(path.join(compDir, f)), { name: `components/${f}` });
          }
        }
      }
      archive.finalize();
    });
  }

  /** 删除：任务记录 + 磁盘目录 同删 */
  async remove(userId: string, pageId: string, groupId: string): Promise<any> {
    const folder = this.resolveFolder(userId, groupId, pageId);
    await this.readMeta(folder, userId); // 校验归属

    // 1) 删磁盘产物（含 .mc-gen 缓存）
    await fsp.rm(folder, { recursive: true, force: true });
    // 2) 删任务记录（含归属校验）
    await this.tasksService.removeTask(pageId, userId);
    return ok({ id: pageId, deleted: true });
  }

  // ============================================================
  // 页面文件管理（Playground 编辑用，作用于 vue3-pages/{groupId}/{pageId}）
  // ============================================================

  /** 解析页面目录：优先 backend-node/workspace，回退前端 workspace（与预览端点保持一致） */
  private resolvePageDir(groupId: string, pageId: string): string {
    const roots = [
      path.join(PAGE_ROOT, groupId, pageId),
      path.join(resolveFrontendWorkspacePath(), 'vue3-pages', groupId, pageId),
    ];
    for (const r of roots) {
      if (fs.existsSync(r)) return r;
    }
    return roots[0];
  }

  /** 防穿越：absPath 必须位于 dir 之内 */
  private assertInsideDir(absPath: string, dir: string) {
    const rel = path.relative(dir, absPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ForbiddenException('路径越权');
    }
  }

  private async walkDir(absDir: string, baseDir: string): Promise<any[]> {
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    const nodes: any[] = [];
    for (const e of entries) {
      if (e.name === '.mc-gen' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const abs = path.join(absDir, e.name);
      const rel = path.relative(baseDir, abs).split(path.sep).join('/');
      if (e.isDirectory()) {
        // 与组件接口一致：返回扁平文件列表（目录不单独成节点，由前端按 path 重建树）
        nodes.push(...(await this.walkDir(abs, baseDir)));
      } else {
        const ext = path.extname(e.name).toLowerCase();
        let type = 'text';
        if (ext === '.vue') type = 'vue';
        else if (ext === '.js' || ext === '.ts') type = 'javascript';
        else if (ext === '.json') type = 'json';
        else if (ext === '.md') type = 'markdown';
        else if (ext === '.less' || ext === '.css') type = 'css';
        else if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext)) type = 'image';
        nodes.push({ name: e.name, path: rel, type });
      }
    }
    return nodes;
  }

  async listPageFiles(groupId: string, pageId: string): Promise<any> {
    const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
    if (!fs.existsSync(dir)) throw new NotFoundException('页面不存在');
    // 与组件接口一致：返回 { success, files }（由全局拦截器包一层后 demo 读 data.data.files）
    return { success: true, files: await this.walkDir(dir, dir) };
  }

  async readPageFile(groupId: string, pageId: string, filePath: string): Promise<any> {
    const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
    const abs = path.join(dir, filePath);
    this.assertInsideDir(abs, dir);
    if (!fs.existsSync(abs) || !(await fsp.stat(abs)).isFile()) {
      throw new NotFoundException('文件不存在');
    }
    const isBinary = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(filePath);
    // 仅文本读取内容；二进制由控制器按需 sendFile（raw=1），与组件 /file 接口行为一致
    const content = isBinary ? '' : await fsp.readFile(abs, 'utf8');
    return { isBinary, absPath: abs, content };
  }

  async writePageFile(groupId: string, pageId: string, filePath: string, content: string): Promise<any> {
    const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
    const abs = path.join(dir, filePath);
    this.assertInsideDir(abs, dir);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content ?? '', 'utf8');
    return { path: filePath, written: true };
  }

  async createPageFolder(groupId: string, pageId: string, filePath: string): Promise<any> {
    const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
    const abs = path.join(dir, filePath);
    this.assertInsideDir(abs, dir);
    await fsp.mkdir(abs, { recursive: true });
    return { path: filePath, created: true };
  }

  async renamePageFile(groupId: string, pageId: string, oldPath: string, newPath: string): Promise<any> {
    const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
    const absOld = path.join(dir, oldPath);
    const absNew = path.join(dir, newPath);
    this.assertInsideDir(absOld, dir);
    this.assertInsideDir(absNew, dir);
    await fsp.mkdir(path.dirname(absNew), { recursive: true });
    await fsp.rename(absOld, absNew);
    return { oldPath, newPath, renamed: true };
  }

  async deletePageFile(groupId: string, pageId: string, filePath: string): Promise<any> {
    const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
    const abs = path.join(dir, filePath);
    this.assertInsideDir(abs, dir);
    if (!fs.existsSync(abs)) throw new NotFoundException('文件不存在');
    const st = await fsp.stat(abs);
    if (st.isDirectory()) await fsp.rm(abs, { recursive: true });
    else await fsp.unlink(abs);
    return { path: filePath, deleted: true };
  }

  // ============================================================
  // 内部：vision 分析
  // ============================================================

  /** 解析 vision 配置：优先用运行时供应商池（用户整体配置的模型），回退全局/用户 AI 配置（UI 配置的视觉模型） */
  private async getVisionConfig(userId?: string): Promise<{ apiKey: string; baseURL: string; model: string; providerType: string; providerId?: string } | null> {
    const pooled = getProviderPool().pick('vision');
    if (pooled && pooled.apiKey) {
      return {
        apiKey: pooled.apiKey,
        baseURL: pooled.baseURL || '',
        model: pooled.model || '',
        providerType: pooled.providerType || 'auto',
        providerId: pooled.id,
      };
    }
    const cfg = resolveVisionConfig(await this.aiConfigService.getMergedAiConfig(userId));
    if (cfg && cfg.apiKey) {
      return {
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL || '',
        model: cfg.model || '',
        providerType: cfg.providerType || 'auto',
      };
    }
    return null;
  }

  /**
   * 图片容错消毒：把任意（可能让 libvips 拒读的）图片统一重编码为安全 JPEG，
   * 供 vision-agent / sharp 稳定读取。规避部分 PNG（特定色型 / iCCP / 高位深 / Display P3 等）
   * 触发 "vipspng: libpng read error" 被上层包成 400 的问题。
   */
  private async sanitizeImageBuffer(buf: Buffer): Promise<Buffer> {
    if (!buf || buf.length < 64) {
      throw new BadRequestException('图片内容为空或过小，请重新选择截图');
    }
    // 1) 先尝试用 sharp 直接读取（绝大多数正常截图走这里）
    try {
      await sharp(buf).metadata();
      return await sharp(buf)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      // sharp 读取失败（libpng read error 等）→ 走 pngjs 兜底解码
    }
    // 2) pngjs 兜底：宽容解码任意 PNG 为原始像素，再交给 sharp 重编码为安全 JPEG
    try {
      const png = PNG.sync.read(buf);
      // pngjs v7 不暴露 channels，8-bit PNG 下 bpp(每像素字节数) 等价于通道数
      const channels = png.bpp; // 1/2/3/4
      if (![1, 2, 3, 4].includes(channels)) {
        throw new Error('unsupported png layout channels=' + channels);
      }
      return await sharp(png.data, {
        raw: { width: png.width, height: png.height, channels },
      })
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch (e: any) {
      throw new BadRequestException(
        '图片无法解析（格式不受支持或已损坏），请换一张 PNG/JPG 截图后重试',
      );
    }
  }

  private async analyzeLayout(imagePath: string, w: number, h: number, userId?: string): Promise<{ structure: SkeletonStructure; model: string }> {
    const cfg = await this.getVisionConfig(userId);
    if (!cfg) {
      throw new BadRequestException('未配置 vision 模型，请在全局配置中添加可用的视觉模型');
    }
    let agent: VisionAgent;
    try {
      agent = new VisionAgent(cfg);
    } catch (e: any) {
      throw new BadRequestException('vision 模型初始化失败: ' + (e.message || String(e)));
    }

    const prompt = this.buildAnalysisPrompt(w, h);
    let raw: string;
    try {
      raw = await agent.analyzeImage(imagePath, prompt, {});
    } catch (e: any) {
      throw new BadRequestException('vision 分析失败: ' + (e.message || String(e)));
    }

    const json = this.extractJson(raw);
    if (!json || !json.layout) {
      throw new BadRequestException('vision 返回结构无法解析');
    }
    const structure = this.normalizeStructure(json, w, h);
    return { structure, model: cfg.model || '未知视觉模型' };
  }

  private buildAnalysisPrompt(w: number, h: number): string {
    return `你是一个大屏/页面布局分析专家。请分析这张截图，输出整页的"骨架结构"（只分析布局与组件划分，不实现细节）。

图片尺寸约为 ${w}×${h} 像素（仅作比例参考）。

请严格识别以下区域（若存在）：
- 顶部标题栏(header)：通常横跨整页顶部，包含页面大标题和日期/天气/用户信息。
- 底部(footer)：通常横跨整页底部，包含统计摘要或导航。
- 左侧栏(left)：页面左侧纵向排列的数据面板，宽度约占 20-26%。
- 右侧栏(right)：页面右侧纵向排列的数据面板，宽度约占 20-26%。
- 中间主体(center)：页面中央区域。若中间是地图/GIS/数字孪生/三维场景/大幅可视化底图，请标记为压底占位（centerPlaceholder=true），不需要实现细节；若中间是常规面板列表，则 centerPlaceholder=false。

对每个区域，拆分成若干"面板组件"，每个组件给出：中文显示名称(name)、所属区域(region)、类型(type: card/chart-line/chart-bar/chart-pie/list/map/table/custom)、高度占比(heightRatio，同一区域内各组件之和约等于100)、是否占位(placeholder，地图/GIS/孪生为true)、备注(note)，以及相对于整张图的包围盒(bbox: {x,y,width,height}，0-100的百分比)。

区域判定必须依据组件包围盒的水平中心点：
- 中心点 x < 35% → 必须属于 left（左侧栏）。
- 中心点 x > 65% → 必须属于 right（右侧栏）。
- 35% ≤ 中心点 x ≤ 65% 且不是地图/GIS/孪生底图 → 属于 center（中间常规面板）。
- 35% ≤ 中心点 x ≤ 65% 且是地图/GIS/孪生底图 → 属于 center，placeholder=true，type=map。

宽度与布局建议：
- 若中间是地图/大屏底图，请把 leftSidebarW 和 rightSidebarW 设为 22-26，确保中间区域占满剩余空间。
- 若设计稿明显只有左右两列、无中间地图，请把 centerPlaceholder 设为 false，并将所有面板分配到 left/right。
- 严禁把所有面板都堆到 left 或 center；左右两侧应各自有独立面板。

同时给出主题色(theme)：背景(bg)、面板(panel)、文字(text)、强调(accent)、头部(header)、底部(footer)，用 16 进制色值。科技/深色大屏请用深色主题（如 #0b1c22 / #112d3b / #dcebf0 / #35c4ff / #0a2633 / #0a2633）；浅色后台请用浅色系默认。

仅返回 JSON（可用 \`\`\`json 包裹），结构如下：
{
  "layout": {
    "title": "页面标题",
    "headerH": 60, "footerH": 36,
    "leftSidebarW": 22, "rightSidebarW": 22,
    "centerPlaceholder": true,
    "theme": { "bg":"#0b1c22","panel":"#112d3b","text":"#dcebf0","accent":"#35c4ff","header":"#0a2633","footer":"#0a2633" }
  },
  "components": [
    { "name":"当日总流量","region":"left","type":"card","heightRatio":15,"placeholder":false,"note":"卡片","bbox":{"x":4,"y":12,"width":18,"height":10} },
    { "name":"地图区域","region":"center","type":"map","heightRatio":100,"placeholder":true,"note":"不实现，仅占位","bbox":{"x":22,"y":12,"width":56,"height":76} }
  ]
}`;
  }

  private extractJson(raw: string): any {
    if (!raw) return null;
    let s = raw.trim();
    const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (m) s = m[1];
    try {
      return JSON.parse(s);
    } catch {
      // 尝试截取第一个 { 到最后一个 }
      const a = s.indexOf('{');
      const b = s.lastIndexOf('}');
      if (a >= 0 && b > a) {
        try {
          return JSON.parse(s.slice(a, b + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private normalizeStructure(json: any, w: number, h: number): SkeletonStructure {
    const L = json.layout || {};
    const theme = L.theme || {};
    const layout: SkeletonLayout = {
      title: L.title || '未命名页面',
      headerH: Number(L.headerH) || 60,
      footerH: Number(L.footerH) || 36,
      leftSidebarW: Number(L.leftSidebarW) || 22,
      rightSidebarW: Number(L.rightSidebarW) || 22,
      centerPlaceholder: L.centerPlaceholder !== false,
      theme: {
        bg: theme.bg || '#eef4f6',
        panel: theme.panel || '#ffffff',
        text: theme.text || '#1d4a5e',
        accent: theme.accent || '#a7cbdb',
        header: theme.header || '#dcebf0',
        footer: theme.footer || '#dcebf0',
      },
    };
    const validRegions: Region[] = ['header', 'footer', 'left', 'right', 'center'];
    const components: SkeletonComponent[] = Array.isArray(json.components)
      ? json.components.map((c: any, i: number) => {
          const bbox =
            c.bbox &&
            typeof c.bbox.x === 'number' &&
            typeof c.bbox.y === 'number' &&
            typeof c.bbox.width === 'number' &&
            typeof c.bbox.height === 'number'
              ? {
                  x: Number(c.bbox.x) || 0,
                  y: Number(c.bbox.y) || 0,
                  width: Number(c.bbox.width) || 0,
                  height: Number(c.bbox.height) || 0,
                }
              : undefined;
          return {
            name: String(c.name || `组件${i + 1}`),
            region: validRegions.includes(c.region) ? c.region : 'left',
            type: String(c.type || 'custom'),
            heightRatio: Math.max(2, Number(c.heightRatio) || 20),
            placeholder: !!c.placeholder,
            note: c.note ? String(c.note) : '',
            bbox,
          };
        })
      : [];
    return this.rebalanceRegions({ layout, components });
  }

  /**
   * 根据 bbox 中心点强制校正 region，避免 vision 把右侧组件错分到 left/center。
   * 规则：x_center < 35% → left；x_center > 65% → right；中间按类型判断。
   * 同时当 centerPlaceholder=true 时，把 center 中非 map 组件按 x 重新分配到 left/right。
   */
  private rebalanceRegions(s: SkeletonStructure): SkeletonStructure {
    const L = s.layout;
    const components = s.components.map((c) => {
      const b = c.bbox;
      if (!b || b.width <= 0 || b.height <= 0) return c;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      let region: Region = c.region;

      // header/footer 通常贴近顶部/底部，优先按 y 判断
      if (cy < 12 && b.y < 8) region = 'header';
      else if (cy > 88 && b.y + b.height > 92) region = 'footer';
      else if (cx < 35) region = 'left';
      else if (cx > 65) region = 'right';
      else region = 'center';

      return { ...c, region };
    });

    // 若中间是地图占位，center 里只允许保留 map 组件；其余按 bbox 重新分配
    if (L.centerPlaceholder) {
      const fixed: SkeletonComponent[] = components.map((c) => {
        if (c.region !== 'center') return c;
        if (c.type === 'map' || c.placeholder) return c;
        const b = c.bbox;
        const cx = b ? b.x + b.width / 2 : 50;
        const newRegion: Region = cx < 50 ? 'left' : 'right';
        return { ...c, region: newRegion };
      });
      return { layout: L, components: fixed };
    }

    return { layout: L, components };
  }

  // ============================================================
  // 内部：目录渲染（公司 Vue3 规范）
  // ============================================================

  private async renderPageFiles(
    folder: string,
    opt: {
      pageId: string;
      groupId: string;
      userId: string;
      name: string;
      imageW: number;
      imageH: number;
      sourceType: 'screenshot' | 'figma';
      sourceUrl: string;
      structure: SkeletonStructure;
      screenshotBuffer: Buffer;
      skipScreenshot?: boolean;
    },
  ) {
    await fsp.mkdir(path.join(folder, 'components'), { recursive: true });
    await fsp.mkdir(path.join(folder, 'resources', 'styles'), { recursive: true });
    await fsp.mkdir(path.join(folder, '.mc-gen', 'cache'), { recursive: true });

    const { structure } = opt;

    // index.vue
    const indexVue = this.buildIndexVue(structure, opt.imageW, opt.imageH);
    await fsp.writeFile(path.join(folder, 'index.vue'), indexVue, 'utf8');

    // 子组件
    const regions: Region[] = ['header', 'left', 'right', 'center', 'footer'];
    let compIdx = 0;
    for (const region of regions) {
      const comps = structure.components.filter((c) => c.region === region);
      for (const c of comps) {
        compIdx += 1;
        const compName = `Panel${compIdx}`;
        const compVue = this.buildComponentVue(compName, c);
        await fsp.writeFile(path.join(folder, 'components', `${compName}.vue`), compVue, 'utf8');
      }
    }

    // 样式
    await fsp.writeFile(
      path.join(folder, 'resources', 'styles', 'index.less'),
      this.buildLess(structure),
      'utf8',
    );

    // 组件清单 MD
    await fsp.writeFile(path.join(folder, '组件清单.md'), this.buildMd(structure), 'utf8');

    // 截图（除非跳过）
    if (!opt.skipScreenshot && opt.screenshotBuffer && opt.screenshotBuffer.length) {
      await fsp.writeFile(path.join(folder, 'screenshot.png'), opt.screenshotBuffer);
    }

    // meta
    const meta = {
      id: opt.pageId,
      name: opt.name,
      groupId: opt.groupId,
      creatorId: opt.userId,
      source: {
        type: opt.sourceType,
        url: opt.sourceUrl,
        imageW: opt.imageW,
        imageH: opt.imageH,
      },
      structure,
      requirementDoc: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await fsp.writeFile(path.join(folder, 'page-meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    // 缓存：vision 原始 + 调试 prompt
    await fsp.writeFile(
      path.join(folder, '.mc-gen', 'cache', 'vision-response.txt'),
      JSON.stringify(structure, null, 2),
      'utf8',
    );
  }

  /** index.vue：vw/vh 自适应（基线=原图 W×H），地图压底 + 侧栏浮层，CODE-002 规范 */
  private buildIndexVue(s: SkeletonStructure, W: number, H: number): string {
    const L = s.layout;
    const vw = (px: number) => `calc(${px} * var(--vw))`;
    const vh = (px: number) => `calc(${px} * var(--vh))`;

    const byRegion = (r: Region) => s.components.filter((c) => c.region === r);
    const headerComps = byRegion('header');
    const leftComps = byRegion('left');
    const rightComps = byRegion('right');
    const centerComps = byRegion('center');
    const footerComps = byRegion('footer');

    // 统一面板命名：与 renderPageFiles（写盘）及 import 顺序严格一致（header→left→right→center→footer），
    // 避免 footerBlock 提前 compute 导致计数器错位、模板面板指向错误组件。
    const nameByComp = new Map<SkeletonComponent, string>();
    {
      const order: Region[] = ['header', 'left', 'right', 'center', 'footer'];
      let i = 0;
      for (const r of order) {
        for (const c of s.components.filter((cc) => cc.region === r)) {
          i += 1;
          nameByComp.set(c, `Panel${i}`);
        }
      }
    }

    const renderPanel = (c: SkeletonComponent) => {
      const compName = nameByComp.get(c) || 'Panel1';
      return `          <section class="c-monitor-panel" :class="{ 'is-placeholder': ${!!c.placeholder} }" style="height:${c.heightRatio}%">
            <${compName} />
          </section>`;
    };

    const imports = Array.from(nameByComp.values())
      .map((n) => `import ${n} from './components/${n}.vue'`)
      .join('\n');

    const titleText = this.esc(L.title || '未命名页面');
    const headerInner = headerComps.length
      ? headerComps.map(renderPanel).join('\n')
      : `      <div class="dh-header__title">${titleText}</div>`;
    const headerBlock = `    <!-- 头部 -->
    <header class="dh-header" :style="{ height: '${vh(L.headerH)}', background: '${L.theme.header}' }">
${headerInner}
    </header>`;

    const footerBlock = footerComps.length
      ? `    <!-- 底部 -->
    <footer class="dh-footer" :style="{ height: '${vh(L.footerH)}', background: '${L.theme.footer}' }">
${footerComps.map(renderPanel).join('\n')}
    </footer>`
      : `    <!-- 底部 -->
    <footer class="dh-footer" :style="{ height: '${vh(L.footerH)}', background: '${L.theme.footer}' }"></footer>`;

    const centerBlock = L.centerPlaceholder
      ? `      <!-- 中间：地图/GIS/孪生 压底占位 -->
      <div class="dh-map-layer">
        <div class="dh-map-grid" />
        <div class="dh-map-markers">
          <div class="dh-map-marker">占位</div>
        </div>
      </div>`
      : `      <!-- 中间主体 -->
      <main class="dh-center">
${centerComps.map(renderPanel).join('\n')}
      </main>`;

    return `<template>
  <div class="dh-page-root">
${headerBlock}
    <div class="dh-main">
      <aside class="dh-left" :style="{ width: '${L.leftSidebarW}%', background:'${L.theme.panel}' }">
${leftComps.map(renderPanel).join('\n')}
      </aside>
${centerBlock}
      <aside class="dh-right" :style="{ width: '${L.rightSidebarW}%', background:'${L.theme.panel}' }">
${rightComps.map(renderPanel).join('\n')}
      </aside>
    </div>
${footerBlock}
  </div>
</template>

<script setup lang="ts">
${imports}
</script>

<style lang="less" scoped>
@import './resources/styles/index.less';

.dh-page-root {
  --vw: calc(100vw / ${W});
  --vh: calc(100vh / ${H});
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${L.theme.bg};
  color: ${L.theme.text};
  overflow: hidden;
}

.dh-header,
.dh-footer {
  flex-shrink: 0;
}

.dh-main {
  position: relative;
  flex: 1;
  display: flex;
  justify-content: space-between;
  min-height: 0;
}

.dh-left,
.dh-right {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: calc(8 * var(--vh));
  padding: calc(8 * var(--vh)) calc(8 * var(--vw));
  overflow: hidden;
  box-shadow: 0 0 calc(12 * var(--vw)) rgba(0, 0, 0, 0.08);
}

.dh-left { border-right: 1px solid ${L.theme.accent}; }
.dh-right {
  border-left: 1px solid ${L.theme.accent};
  margin-left: auto;
}

.dh-header {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.dh-header__title {
  font-size: calc(24 * var(--vw));
  font-weight: 700;
  letter-spacing: calc(2 * var(--vw));
  color: ${L.theme.text};
  text-shadow: 0 0 calc(10 * var(--vw)) ${L.theme.accent};
}

.dh-map-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 50% 50%, ${this.fadeColor(L.theme.panel, 0.25)} 0%, transparent 60%),
    ${L.theme.bg};
  overflow: hidden;
}

.dh-map-grid {
  position: absolute;
  inset: -10%;
  background-image:
    linear-gradient(${this.fadeColor(L.theme.accent, 0.12)} 1px, transparent 1px),
    linear-gradient(90deg, ${this.fadeColor(L.theme.accent, 0.12)} 1px, transparent 1px);
  background-size: calc(40 * var(--vw)) calc(40 * var(--vh));
  transform: perspective(600px) rotateX(45deg);
  opacity: 0.35;
  pointer-events: none;
}

.dh-map-markers {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: calc(12 * var(--vh));
}

.dh-map-marker {
  padding: calc(8 * var(--vh)) calc(16 * var(--vw));
  border-radius: calc(4 * var(--vw));
  background: ${this.fadeColor(L.theme.panel, 0.7)};
  border: 1px solid ${this.fadeColor(L.theme.accent, 0.4)};
  color: ${L.theme.text};
  font-size: calc(13 * var(--vw));
  text-align: center;
  box-shadow: 0 0 calc(12 * var(--vw)) ${this.fadeColor(L.theme.accent, 0.25)};
}

.dh-center {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: calc(8 * var(--vh));
  min-width: 0;
}

.c-monitor-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.c-monitor-panel.is-placeholder {
  opacity: 0.6;
}
</style>
`;
  }

  /** 子组件占位骨架：组件内部统一只显示"占位" */
  private buildComponentVue(compName: string, _c: SkeletonComponent): string {
    return `<template>
  <div class="${compName} c-monitor-panel">
    <div class="c-monitor-placeholder">占位</div>
  </div>
</template>

<script setup lang="ts">
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.${compName} {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: @panel;
  border-radius: calc(4 * var(--vw));
  box-shadow: 0 0 calc(10 * var(--vw)) rgba(0, 0, 0, 0.12);
  overflow: hidden;

  .c-monitor-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 0;
    color: @text;
    font-size: calc(14 * var(--vw));
    font-weight: 600;
    opacity: 0.72;
  }
}
</style>
`;
  }

  /** 共享样式（c-monitor 前缀，CODE-003 兼容） */
  private buildLess(s: SkeletonStructure): string {
    const t = s.layout.theme;
    return `// 页面骨架共享样式（c-monitor 前缀，遵循公司 Vue3 规范）
@text: ${t.text};
@accent: ${t.accent};
@panel: ${t.panel};
@bg: ${t.bg};

.c-monitor-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: @text;
}

.c-monitor-panel__title {
  font-weight: 500;
  color: @text;
}

.c-monitor-placeholder {
  color: @text;
  border: 1px dashed @accent;
}
`;
  }

  private buildMd(s: SkeletonStructure): string {
    const rows = s.components
      .map(
        (c, i) =>
          `| ${i + 1} | ${c.name} | ${c.region} | ${c.type} | ${c.heightRatio}% | ${c.placeholder ? '是（占位）' : '否'} | ${c.note || ''} |`,
      )
      .join('\n');
    return `# ${s.layout.title} · 组件清单

> 由大屏骨架生成器自动分析产出（vision 分析 + 骨架渲染）。

## 布局参数
- 头部高度：${s.layout.headerH}px
- 底部高度：${s.layout.footerH}px
- 左侧栏宽：${s.layout.leftSidebarW}%
- 右侧栏宽：${s.layout.rightSidebarW}%
- 中间压底占位：${s.layout.centerPlaceholder ? '是（地图/GIS/孪生）' : '否'}

## 主题色
| 角色 | 色值 |
|------|------|
| 背景 | ${s.layout.theme.bg} |
| 面板 | ${s.layout.theme.panel} |
| 文字 | ${s.layout.theme.text} |
| 强调 | ${s.layout.theme.accent} |
| 头部 | ${s.layout.theme.header} |
| 底部 | ${s.layout.theme.footer} |

## 组件面板
| 序号 | 名称 | 区域 | 类型 | 高度占比 | 占位 | 备注 |
|------|------|------|------|---------|------|------|
${rows}
`;
  }

  // ============================================================
  // 内部：figna URL → 渲染图（fast-follow，受 FIGMA_TOKEN 约束）
  // ============================================================

  private async renderFigmaImage(figmaUrl: string): Promise<{ buffer: Buffer; width: number; height: number }> {
    // Figma Token：优先全局配置（设置→模型配置），回退环境变量
    const aiCfg = (this.aiConfigService.getAiConfig() as any) || {};
    const figmaToken = aiCfg.figmaToken || process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN;
    if (!figmaToken) {
      throw new BadRequestException(
        '未配置 Figma Token，请在「设置 → 模型配置」中配置 Figma Token，或设置环境变量 FIGMA_ACCESS_TOKEN',
      );
    }

    // 动态加载 FigmaConnector 类并实例化（连接器导出的是 class，非模块级函数）
    let FigmaConnector: any;
    try {
      const mod = await import('../ai-engine/roles/figma-connector.js');
      FigmaConnector = mod.FigmaConnector || mod.default?.FigmaConnector || mod.default;
    } catch (e: any) {
      throw new BadRequestException('figma 连接器不可用: ' + (e.message || String(e)));
    }
    if (typeof FigmaConnector !== 'function') {
      throw new BadRequestException('figma 连接器未导出 FigmaConnector');
    }

    // 解析 fileKey + nodeId（figma URL 中 node-id 以 "-" 分隔，getImageUrl 内部会转成 ":"）
    const m = figmaUrl.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
    const nodeM = figmaUrl.match(/[?&]node-id=([0-9A-Za-z-]+)/);
    if (!m) throw new BadRequestException('无法解析 figma URL');
    const fileKey = m[1];
    const nodeId = nodeM ? nodeM[1] : undefined;
    if (!nodeId) throw new BadRequestException('figma URL 缺少 node-id 参数');

    const connector = new FigmaConnector({ figmaToken });
    const imageUrl = await connector.getImageUrl(fileKey, nodeId);
    const resp = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(resp.data);
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width || 1440, height: meta.height || 810 };
  }

  // ============================================================
  // 内部：工具
  // ============================================================

  private esc(s: string): string {
    return String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch] as string));
  }

  /** 把 #rrggbb 按 alpha 转成 rgba(...) 字符串（用于 LESS/SVG 模板中动态透明度） */
  private fadeColor(hex: string, alpha: number): string {
    const h = String(hex || '#000000').replace('#', '');
    const parse = (seg: string) => parseInt(seg.length === 1 ? seg + seg : seg, 16);
    let r: number, g: number, b: number;
    if (h.length === 3) {
      r = parse(h[0]); g = parse(h[1]); b = parse(h[2]);
    } else if (h.length === 6) {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    } else {
      return `rgba(0,0,0,${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private async readComponents(folder: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const compDir = path.join(folder, 'components');
    if (fs.existsSync(compDir)) {
      for (const f of fs.readdirSync(compDir)) {
        if (f.endsWith('.vue')) out[f] = await fsp.readFile(path.join(compDir, f), 'utf8');
      }
    }
    return out;
  }

  private async safeReaddir(p: string): Promise<string[]> {
    try {
      return (await fsp.readdir(p)).filter((x) => !x.startsWith('.'));
    } catch {
      return [];
    }
  }

  /** 解析并校验 folder 归属，返回绝对路径 */
  private resolveFolder(userId: string, groupId: string, pageId: string): string {
    const g = safeSeg(groupId);
    const p = safeSeg(pageId);
    const folder = path.join(PAGE_ROOT, g, p);
    // 防穿越：必须在 PAGE_ROOT 之内
    const rel = path.relative(PAGE_ROOT, folder);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ForbiddenException('非法路径');
    }
    return folder;
  }

  private async readMeta(folder: string, userId: string): Promise<any> {
    const metaPath = path.join(folder, 'page-meta.json');
    if (!fs.existsSync(metaPath)) {
      throw new NotFoundException('页面不存在');
    }
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    if (meta.creatorId && meta.creatorId !== userId) {
      throw new ForbiddenException('无权访问该页面');
    }
    return meta;
  }
}
