import { Injectable } from '@nestjs/common';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { createHash, randomUUID } from 'crypto';
import { dirname, isAbsolute, join, posix, resolve, sep } from 'path';
import { tempComponentsDir, customComponentsDir } from '../config/backend-root';
import { renameWithCopyFallback } from '../ai-engine/utils/rename-with-copy-fallback.js';
import { validateVueSfc } from '../ai-engine/utils/sfc-syntax-validation.js';

export type TaskCodeSnapshotStatus = 'candidate' | 'validating' | 'last-good' | 'rejected' | 'partial';

export interface TaskCodeSnapshotFile {
  path: string;
  size: number;
  hash: string;
  /** 文件行数（文本文件按换行符统计；二进制/图片通常为 0 或 1） */
  lines?: number;
}

export interface TaskCodeSnapshotValidation {
  semantics?: 'pending' | 'passed' | 'warning' | 'blocked';
  sfc?: 'pending' | 'passed' | 'warning' | 'blocked';
  less?: 'pending' | 'passed' | 'warning' | 'blocked';
  runtime?: 'pending' | 'passed' | 'warning' | 'blocked';
  /** 🛡️ #131：L0-B 结构门禁结论（blocked ⇒ 禁止晋升 last-good，停留候选供人工审查） */
  structure?: 'pending' | 'passed' | 'warning' | 'blocked';
}

export interface TaskCodeSnapshotManifest {
  version: 1;
  sessionId: string;
  componentId: string;
  groupId?: string;
  target: 'microcode' | 'vue3';
  revision: string;
  status: TaskCodeSnapshotStatus;
  createdAt: string;
  stage?: string;
  files: TaskCodeSnapshotFile[];
  validation?: TaskCodeSnapshotValidation;
  lastGoodRevision?: string;
  rejectionReason?: string;
  /** 🛡️ P2#5 缺失文件清单：partial 快照下「关键应有文件 − 已生成文件」的确定性推导结果。 */
  missingFiles?: string[];
  /** 用户编辑写回的来源 revision，仅用于审计，不参与路径解析。 */
  parentRevision?: string;
  /** 写回来源，例如 playground。 */
  editSource?: string;
  /** 🆕 2026-11-12 精修续跑溯源：本快照所属「精修任务」的 sessionId。
   *  仅精修快照（stage=refine-baseline / refine-candidate）会写入，用于把精修任务与其
   *  基线/候选快照精确配对，从而在前端展示「本次精修具体改了哪些文件」。非精修快照为 undefined。 */
  refineSessionId?: string;
}

/** 🆕 2026-11-12 精修续跑溯源：单个文件的精修差异（供前端「精修改动明细」面板渲染）。 */
export interface RefineDiffLine {
  type: 'add' | 'del' | 'ctx';
  /** 内容行（不含换行）；ctx/del 取基线行，add 取候选行 */
  text: string;
  /** 基线行号（del/ctx 有值） */
  oldLine?: number;
  /** 候选行号（add/ctx 有值） */
  newLine?: number;
}

export interface RefineChange {
  path: string;
  /** modified=内容有差异；added=候选新增；removed=候选删除 */
  type: 'modified' | 'added' | 'removed';
  baselineLines: number;
  candidateLines: number;
  baselineSize: number;
  candidateSize: number;
  /** 行级统一 diff；added/removed 时为整文件增删，modified 时为差异片段（含上下文） */
  diff: RefineDiffLine[];
}

export interface CreateTaskCodeSnapshotInput {
  sessionId: string;
  componentId: string;
  groupId?: string;
  target: 'microcode' | 'vue3';
  stage?: string;
  files: Record<string, string | Buffer>;
  /** 🆕 2026-11-12 精修续跑溯源：精修任务 sessionId，写入 manifest.refineSessionId。 */
  refineSessionId?: string;
}

interface SnapshotPointer {
  revision: string;
  updatedAt: string;
}

const MAX_FILE_COUNT = 200;
const MAX_SINGLE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
// 图片文件独立限制（PNG/JPG 无损压缩后容易超过 2MB）
const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXT_RE = /\.(png|jpg|jpeg|gif|webp|svg)$/i;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const SAFE_REVISION = /^r-[a-f0-9-]{36}$/;

/**
 * 统计文本行数。
 * 空文件返回 0；否则按换行符数量统计，最后一行无换行也计为一行。
 */
function countLines(content: string | Buffer): number {
  const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
  if (text.length === 0) return 0;
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lines++;
  }
  if (!text.endsWith('\n')) lines++;
  return lines;
}

/**
 * 🆕 2026-11-12 精修续跑溯源：基于 LCS 的行级统一 diff（unified diff，含上下文）。
 * 用于「精修改动明细」面板展示每个文件的具体增删内容。
 * - aText/bText 为基线/候选文件全文；
 * - context 为差异片段前后保留的上下文行数（默认 3）；
 * - 返回 { type: add|del|ctx, text, oldLine?, newLine? } 序列，前端直接按 type 着色即可。
 * 复杂度 O(n*m)，组件文件均很小（<1000 行），无性能风险。
 */
function unifiedLineDiff(aText: string, bText: string, context = 3): RefineDiffLine[] {
  const a = aText.split('\n');
  const b = bText.split('\n');
  const n = a.length;
  const m = b.length;

  // LCS 长度 DP（仅长度，回溯时再判定）
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  type Op = { type: 'eq' | 'del' | 'add'; text: string; oldLine?: number; newLine?: number };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'eq', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i], oldLine: i + 1 });
      i++;
    } else {
      ops.push({ type: 'add', text: b[j], newLine: j + 1 });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: 'del', text: a[i], oldLine: i + 1 });
    i++;
  }
  while (j < m) {
    ops.push({ type: 'add', text: b[j], newLine: j + 1 });
    j++;
  }

  // 把 ops 转成统一 diff：保留 change 前后各 context 行上下文
  const out: RefineDiffLine[] = [];
  let ctxBuf: Op[] = [];
  let sawChange = false;
  const flushCtx = (max: number) => {
    const take = ctxBuf.slice(-max);
    for (const c of take) out.push({ type: 'ctx', text: c.text, oldLine: c.oldLine, newLine: c.newLine });
    ctxBuf = [];
  };
  for (const op of ops) {
    if (op.type === 'eq') {
      ctxBuf.push(op);
    } else {
      if (!sawChange) {
        flushCtx(context); // change 前的上下文
        sawChange = true;
      } else {
        flushCtx(context); // 两个 change 之间的上下文
      }
      out.push({ type: op.type, text: op.text, oldLine: op.oldLine, newLine: op.newLine });
    }
  }
  if (sawChange) flushCtx(context); // 末尾上下文
  return out;
}

/**
 * 🛡️ LLM Markdown 围栏泄漏剥离（样式文件专用）。
 * 根因（mc-max-1787920019327-5bbaf158 实锤）：生成角色 onFilesReady 传出的内存 files map
 * 可能携带模型输出泄漏的围栏行（行首 ```），落盘版会被 writeFiles 前的 _sanitizeFileContent
 * 清洗，但内存版未经清洗 —— 快照把污染版冻结，磁盘/workspace 却是干净的 → 后端门禁通过、
 * 任务显示完成，前端预览编译 index.less @import 展开污染版报 "Unrecognised input"。
 * .less/.css 不存在合法的行首围栏行，剥离恒安全；.vue/.js 不处理（script 模板字符串可合法含 ```，
 * 由 SFC 语义门禁与 LESS 门禁的 vue style 块路径兜底）。
 */
const STRIP_STYLE_FENCE_RE = /^[ \t]*```[^\r\n]*$/gm;
function sanitizeStyleFenceLeak(path: string, content: Buffer): Buffer {
  if (/\.(?:less|css)$/i.test(path)) {
    const text = content.toString('utf-8');
    const stripped = text.replace(STRIP_STYLE_FENCE_RE, '');
    return stripped === text ? content : Buffer.from(stripped, 'utf-8');
  }
  // 🛡️ #2（2026-08-29）：.vue 尾部垃圾兜底——闭合标签之后的 ``` 围栏 + 说明文字泄漏。
  // 与 ai-engine/utils/llm-tail-garbage.js 的 .vue 规则同源（SFC 顶层闭合标签后只允许
  // 空白与 <!-- --> 注释）。快照数据源与落盘数据源必须同清洗级别，恢复/快照 ≠ 可信。
  if (/\.vue$/i.test(path)) {
    const text = content.toString('utf-8');
    const lines = text.split('\n');
    const closeRe = /^[ \t]*<\/(?:template|script|style)>[ \t]*$/;
    let lastClose = -1;
    for (let i = 0; i < lines.length; i++) {
      if (closeRe.test(lines[i])) lastClose = i;
    }
    if (lastClose >= 0 && lastClose < lines.length - 1) {
      const tail = lines.slice(lastClose + 1).join('\n').trim();
      // 尾部非空白、且不是合法顶层注释 → 截断
      if (tail && !/^<!--[\s\S]*-->$/.test(tail)) {
        return Buffer.from(
          lines.slice(0, lastClose + 1).join('\n') + '\n',
          'utf-8',
        );
      }
    }
  }
  return content;
}

import { collectMissingVueImports } from '../ai-engine/utils/vue-import-closure.js';

/**
 * 抽出 SFC 里的「相对 .vue」静态 import specifier。
 *
 * 实现收口在 ai-engine/utils/vue-import-closure.js（与快照推送守卫共用单一事实源）。
 * 此处仅再导出，保证既有消费方（单测 / 其他调用点）import 路径稳定。
 */
export {
  extractRelativeVueImports,
  resolveRelativeModulePath,
  collectMissingVueImports,
} from '../ai-engine/utils/vue-import-closure.js';

@Injectable()
export class TaskCodeSnapshotService {
  private readonly root = resolve(tempComponentsDir, '.task-code-snapshots');

  constructor() {
    mkdirSync(this.root, { recursive: true });
  }

  createCandidate(input: CreateTaskCodeSnapshotInput): TaskCodeSnapshotManifest {
    this.assertSafeId(input.sessionId, 'sessionId');
    this.assertSafeId(input.componentId, 'componentId');
    if (input.groupId) this.assertSafeId(input.groupId, 'groupId');

    const entries = Object.entries(input.files);
    if (entries.length === 0) throw new Error('候选快照没有可保存的文件');
    if (entries.length > MAX_FILE_COUNT) {
      throw new Error(`候选快照文件数超过限制：${entries.length}/${MAX_FILE_COUNT}`);
    }

    const revision = `r-${randomUUID()}`;
    const sessionDir = this.getSessionDir(input.sessionId);
    const revisionsDir = resolve(sessionDir, 'revisions');
    const tempDir = resolve(revisionsDir, `.tmp-${revision}-${randomUUID()}`);
    const revisionDir = resolve(revisionsDir, revision);
    mkdirSync(tempDir, { recursive: true });

    const files: TaskCodeSnapshotFile[] = [];
    let totalBytes = 0;

    try {
      for (const [rawPath, rawContent] of entries) {
        const path = this.normalizeRelativePath(rawPath);
        const rawBuffer = Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(rawContent, 'utf8');
        const content = sanitizeStyleFenceLeak(path, rawBuffer);
        
        // 图片文件使用独立的大小限制（PNG/JPG 无损压缩后容易超过 2MB）
        const isImage = IMAGE_EXT_RE.test(path);
        const sizeLimit = isImage ? MAX_IMAGE_FILE_BYTES : MAX_SINGLE_FILE_BYTES;
        
        if (content.byteLength > sizeLimit) {
          throw new Error(`文件超过单文件限制：${path} (${(content.byteLength / 1024 / 1024).toFixed(2)}MB > ${(sizeLimit / 1024 / 1024).toFixed(2)}MB)`);
        }
        totalBytes += content.byteLength;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error('候选快照总大小超过限制');

        const absolutePath = this.resolveInside(tempDir, path);
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, content, { flag: 'wx' });
        files.push({
          path,
          size: content.byteLength,
          hash: createHash('sha256').update(content).digest('hex'),
          lines: countLines(content),
        });
      }

      files.sort((a, b) => a.path.localeCompare(b.path));
      const lastGoodRevision = this.readPointer(input.sessionId, 'last-good')?.revision;
      const manifest: TaskCodeSnapshotManifest = {
        version: 1,
        sessionId: input.sessionId,
        componentId: input.componentId,
        groupId: input.groupId,
        target: input.target,
        revision,
        status: 'candidate',
        createdAt: new Date().toISOString(),
        stage: input.stage,
        refineSessionId: input.refineSessionId,
        files,
        validation: {
          semantics: 'pending',
          sfc: 'pending',
          less: 'pending',
          runtime: 'pending',
        },
        lastGoodRevision,
      };
      writeFileSync(resolve(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
      });
      // 🛡️ 2026-11-03：EPERM rename 风暴下降级为复制落名，保证快照可用。
      renameWithCopyFallback(tempDir, revisionDir, { label: '候选快照 revision 落名' });
      this.writePointer(input.sessionId, 'candidate', revision);
      return manifest;
    } catch (error) {
      // 清理失败不应掩盖原始错误（如 safe-delete 钩子拦截批量删除时）
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch { /* ignore cleanup failure */ }
      throw error;
    }
  }

  /**
   * 获取当前仍可作为候选预览源的 revision。
   * rejected 版本只保留作审计，不能继续成为默认预览源。
   */
  getCandidateManifest(sessionId: string): TaskCodeSnapshotManifest | null {
    const pointer = this.readPointer(sessionId, 'candidate');
    if (!pointer) return null;
    const manifest = this.getManifest(sessionId, pointer.revision);
    return manifest.status === 'candidate' || manifest.status === 'validating'
      ? manifest
      : null;
  }

  /**
   * 获取默认的最新可预览快照。候选正在验证时优先返回候选，
   * 候选被拒绝或已晋级后回退到 last-good，避免 rejected 污染预览。
   */
  getLatestManifest(sessionId: string): TaskCodeSnapshotManifest | null {
    return this.getCandidateManifest(sessionId) || this.getLastGoodManifest(sessionId);
  }

  getLastGoodManifest(sessionId: string): TaskCodeSnapshotManifest | null {
    const pointer = this.readPointer(sessionId, 'last-good');
    return pointer ? this.getManifest(sessionId, pointer.revision) : null;
  }

  /**
   * 判定某 revision 是否「可渲染」（index.vue 含 <template> 块 **且** import 闭包完整）。
   * 背景：生成末轮偶尔退化，只产出 <script setup> 而丢失 <template>/<style>，
   * 形成「看起来完成、实际无法预览」的不完整候选 revision。这类 revision 若直接作为
   * 预览源，前端加载 resources/styles/index.css 等资源会 404（组件资源加载失败）。
   * 通过检测 index.vue 是否含 <template> 识别不完整 revision，交由调用方回退到 last-good。
   *
   * 🛡️ 2026-09-15（mc-max-1789446564243-f64ecbed 实锤 · 补 import 闭包判据）：
   * 原判据只看 <template>，漏掉「模板完整但 import 悬空」的生成中间态 ——
   * 子组件**并行**生成，index.vue（已 import ContentSubT/ChartSection/ContentIndicator）
   * 先于某个子组件 chunk 完成就被推成 candidate，其 body 有 <template>（判定通过）
   * 但 `package/components/ContentIndicator.vue` 既不在 manifest 也不在磁盘
   * → 前端 getFile 拉该文件 404 → 预览报
   * 「组件文件缺失或路径不正确（groupId / componentId 不匹配）。原始错误：找不到文件: …」。
   * 这类 revision 属**不完整产物**，必须与「缺 template」同等对待：不作为预览源，回退 last-good。
   *
   * 判据取「传递闭包」而非只看 index.vue 一层：index.vue → 子组件 → 孙组件同样可能出现
   * 悬空 import（chunk 一次输出多文件时同批次缺失）。事实源 = manifest.files + revision 磁盘。
   */
  private isRenderableRevision(sessionId: string, revision: string): boolean {
    try {
      const manifest = this.getManifest(sessionId, revision);
      const idx = manifest.files.find((f) => f.path === 'package/index.vue');
      if (!idx) return false;
      const revisionDir = this.getRevisionDir(sessionId, revision);
      const absolutePath = this.resolveInside(revisionDir, 'package/index.vue');
      if (!existsSync(absolutePath)) return false;
      const content = readFileSync(absolutePath, 'utf-8');
      if (!/<template[\s>]/.test(content)) return false;
      // 🔴 2026-11-11（真机 mc-lite-1794398124528-997fd90f）：必须传**绝对路径**。
      // 传相对路径 'package/index.vue' 会走 validateVueSfc 的「内存阶段」分支，把相对
      // @import 剥掉，连带剥掉 theme-vars.less 的变量定义 ⇒ 报 `variable @fontSize is
      // undefined` 假阳性 ⇒ 本 revision 被判不可渲染 ⇒ resolvePreviewRevision 返回 null
      // ⇒ readPreviewFile/readFile 抛「结构无效，且没有可回退的有效版本」⇒ 前端「查看代码」
      // 显示 Request failed with status code 422（curl 实测复现）。
      // revision 目录已落盘且 resources/styles 齐全，绝对路径模式会完整编译真实 @import
      // 依赖链：这不是放宽判据，反而比剥 import 的内存模式更严格。
      const sfcValidation = validateVueSfc(content, absolutePath);
      if (!sfcValidation.valid) return false;
      return this.isVueImportClosureComplete(revisionDir, manifest, 'package/index.vue');
    } catch {
      return false;
    }
  }

  /**
   * 相对 .vue import 的传递闭包是否全部落地。
   *
   * 判据实现收口在 `ai-engine/utils/vue-import-closure.js#collectMissingVueImports`
   * —— 与快照推送守卫（chunk-snapshot-pusher）共用同一套遍历，禁止两侧各写一套
   * （判据漂移会出现「推送放行但预览拒绝」的割裂）。
   * 这里只注入「磁盘 + manifest」这一侧的事实源。
   */
  private isVueImportClosureComplete(
    revisionDir: string,
    manifest: TaskCodeSnapshotManifest,
    entryPath: string,
  ): boolean {
    const known = new Set((manifest.files || []).map((f) => f.path));
    const readFile = (path: string): string | null => {
      if (!known.has(path)) return null; // 清单里没有 → 悬空
      try {
        return readFileSync(this.resolveInside(revisionDir, path), 'utf-8');
      } catch {
        return null; // 越界 / 磁盘缺失 / 非法文件 → 视为不完整
      }
    };
    return collectMissingVueImports(entryPath, readFile).length === 0;
  }

  /**
   * 解析预览应使用的 revision：请求版本不可渲染时回退到可渲染的 last-good；
   * 若不存在可用版本则返回 null，调用方必须给出明确错误，不得继续读取畸形 SFC。
   */
  private resolvePreviewRevision(sessionId: string, revision: string): string | null {
    if (this.isRenderableRevision(sessionId, revision)) return revision;
    const lastGood = this.getLastGoodManifest(sessionId);
    if (lastGood && this.isRenderableRevision(sessionId, lastGood.revision)) {
      return lastGood.revision;
    }
    return null;
  }

  /**
   * 为「发布到 workspace / 强制预览」挑选一个可发布的产物目录。
   *
   * 背景：publishToWorkspace 原先只在 temp 中间目录与 workspace 里找产物，而 temp 目录
   * 会被清理 —— 历史失败任务点「强制预览」直接 500（产物目录不存在），用户因此
   * 即便有完整快照也看不到任何效果。
   *
   * revision 目录本身就是完整的组件产物目录（package/ + declare.json + resources/），
   * 无需再复制一遍，直接交给 copyToWorkspace 即可。
   * 顺序 candidate → partial → last-good，取第一个含 package/index.vue 的。
   */
  resolvePublishSourceDir(sessionId: string): { dir: string; revision: string } | null {
    const order: Array<'candidate' | 'partial' | 'last-good'> = ['candidate', 'partial', 'last-good'];
    for (const type of order) {
      const pointer = this.readPointer(sessionId, type);
      if (!pointer?.revision) continue;
      try {
        const dir = this.getRevisionDir(sessionId, pointer.revision);
        if (existsSync(resolve(dir, 'package', 'index.vue'))) {
          return { dir, revision: pointer.revision };
        }
      } catch {
        // revision 格式非法 / 目录缺失：换下一个候选，不让它中断发布流程
      }
    }
    return null;
  }

  getManifest(sessionId: string, revision: string): TaskCodeSnapshotManifest {
    const revisionDir = this.getRevisionDir(sessionId, revision);
    const manifestPath = resolve(revisionDir, 'manifest.json');
    if (!existsSync(manifestPath)) throw new Error('代码快照不存在');
    const stat = lstatSync(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('代码快照清单非法');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as TaskCodeSnapshotManifest;
    if (manifest.sessionId !== sessionId || manifest.revision !== revision) {
      throw new Error('代码快照清单与请求不匹配');
    }
    return manifest;
  }

  /**
   * 非抛版本的存在性探测：用于 code-snapshots 接口在「内存任务缺失」时降级放行判断。
   * Lite 组件（截图生成）可能从未向内存任务表注册 Task，仅落盘快照；
   * 此时只要磁盘 manifest 真实存在，即可交给 readPreviewFile 做完整性校验后返回。
   */
  hasManifest(sessionId: string, revision: string): boolean {
    try {
      this.getManifest(sessionId, revision);
      return true;
    } catch {
      return false;
    }
  }

  readPreviewFile(sessionId: string, revision: string, rawPath: string): Buffer {
    const effective = this.resolvePreviewRevision(sessionId, revision);
    if (!effective) {
      throw new Error('该代码快照结构无效，且没有可回退的有效版本');
    }
    const manifest = this.getManifest(sessionId, effective);
    if (!['candidate', 'validating', 'last-good', 'partial'].includes(manifest.status)) {
      throw new Error('该代码快照未通过预览状态校验');
    }
    return this.readFileContentOrFallback(sessionId, effective, rawPath);
  }

  /**
   * 🛡️ 2026-11-11 治本：查看代码 = 纯文本读取，与「预览可渲染」判据解耦。
   *
   * 病灶：readFile 与 readPreviewFile 共用 resolvePreviewRevision（后者要求
   * validateVueSfc 完整编译 LESS @import 链 + Vue import 闭包）。max 历史产物的
   * resources/styles/index.less 常带生成期语法损坏（裸属性、回答正文混入 CSS），
   * 于是「点开看源码」也被判「结构无效，且没有可回退的有效版本」→ 前端 422。
   * 31 个真机 max 会话复现，其中 18 个在旧判据下本可读。
   *
   * 解耦后：
   *  - readPreviewFile（controller 的 preview=1，预览 runtime 唯一取源）保持严格判据
   *    与 manifest.status 校验，坏产物仍不进预览，安全性不变；
   *  - readFile 只校验 manifest 合法 + 文件在清单内 + 路径不越界 + 文件类型 + 完整性
   *    （均由 getManifest / readFileContentOrFallback 内部承担），不做语法判定；
   *  - 不再静默回退到 last-good：查看哪个 revision 就读哪个 revision 的文本，
   *    消除「选 A 版本却显示 B 版本代码」的语义错位。
   *
   * 不修产物、不加白名单、不降低预览判据。历史 .less 语法损坏属生成期写盘门禁/
   * 自愈链的独立根治项，本次不碰。
   */
  readFile(sessionId: string, revision: string, rawPath: string): Buffer {
    this.getManifest(sessionId, revision);
    return this.readFileContentOrFallback(sessionId, revision, rawPath);
  }

  /**
   * 🛡️ 预览读取 + workspace 同路径回退（安全网，2026-08-31）
   *
   * 背景：快照是「生成时刻的不可变产物」，某些文件（早期产物 / 中间 revision /
   * 未被 mergeFromDisk 并入的资源）可能不在本 revision 内，导致预览 404、组件空白。
   * 但同一组件的 workspace 副本（`customComponentsDir/{componentId}/`）通常已随发布/强制预览同步，
   * 含完整 `resources/styles`、`_figma-size.json` 等。此处做逐文件降级：
   * 快照内读不到（文件不存在/路径越界）时，尝试回退 workspace 同路径文件。
   *
   * 注意：仅用于预览读取（readFile/readPreviewFile）；离线质量校验（exportRevisionFiles）
   * 与用户编辑写回（createEditedCandidate）仍走 readManifestFile，不会被 workspace 污染。
   */
  private readFileContentOrFallback(
    sessionId: string,
    revision: string,
    rawPath: string,
  ): Buffer {
    const manifest = this.getManifest(sessionId, revision);
    try {
      return this.readManifestFile(manifest, sessionId, revision, rawPath);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (/快照文件不存在|文件不存在/.test(msg)) {
        const ws = this.resolveWorkspaceFile(sessionId, revision, rawPath);
        if (ws) {
          console.warn(
            `[TaskCodeSnapshot] 预览文件在快照中缺失，回退 workspace 同路径：${sessionId}/${revision}/${rawPath}`,
          );
          return ws;
        }
      }
      throw err;
    }
  }

  /**
   * 解析 workspace 同路径文件（customComponentsDir/{componentId}/{path}）。
   * 越界/缺失/符号链接/非文件一律返回 null，交由上层抛原始 404。
   */
  private resolveWorkspaceFile(
    sessionId: string,
    revision: string,
    rawPath: string,
  ): Buffer | null {
    try {
      const manifest = this.getManifest(sessionId, revision);
      const componentId = manifest.componentId;
      if (!componentId) return null;
      const rel = this.normalizeRelativePath(rawPath);
      const baseDir = resolve(customComponentsDir, componentId);
      const abs = resolve(baseDir, ...rel.split('/'));
      // 越界保护：必须仍在 customComponentsDir/{componentId} 之下
      if (!`${abs}${sep}`.startsWith(`${resolve(baseDir)}${sep}`)) return null;
      if (!existsSync(abs)) return null;
      const stat = lstatSync(abs);
      if (!stat.isFile() || stat.isSymbolicLink()) return null;
      return readFileSync(abs);
    } catch {
      return null;
    }
  }

  /**
   * 按 revision 原样导出全部文本文件内容（**不做** preview 回退）。
   *
   * readFile 会经 resolvePreviewRevision 在「候选不可渲染」时静默回退到 last-good，
   * 用于预览是正确的，但用于「重新校验用户手改后的候选」会把被改的 revision 悄悄换成旧版本，
   * 导致校验结果与实际编辑内容不符。离线质量校验必须读原 revision。
   */
  exportRevisionFiles(sessionId: string, revision: string): Record<string, string> {
    // 先做一次整表对账：一次性修好漂移的索引，避免逐文件读取时反复写 manifest。
    this.reconcileRevisionIntegrity(sessionId, revision);
    const manifest = this.getManifest(sessionId, revision);
    const result: Record<string, string> = {};
    for (const file of manifest.files || []) {
      result[file.path] = this
        .readManifestFile(manifest, sessionId, revision, file.path)
        .toString('utf-8');
    }
    return result;
  }

  /**
   * 🆕 精修事务（治本·回滚保护）：把组件产物目录（outputPath）当前内容冻结为一个 candidate revision。
   * 仅冻结代码类文件（.vue/.less/.css/.js/.ts/.json/.html/.md），跳过图片与二进制资源，
   * 因为精修只改代码、资源保持不变；回滚时只覆盖代码，保留资源不被破坏。
   * 用于「精修前基线」与「精修后候选」两次冻结。复用既有 createCandidate 的清洗 / 大小限制 / 指针逻辑。
   */
  freezeOutputPath(
    outputPath: string,
    meta: {
      sessionId: string;
      componentId: string;
      groupId?: string;
      target: 'microcode' | 'vue3';
      stage?: string;
      /** 🆕 2026-11-12 精修续跑溯源：精修任务 sessionId，写入 manifest 以便精确配对基线/候选。 */
      refineSessionId?: string;
    },
  ): TaskCodeSnapshotManifest {
    this.assertSafeId(meta.sessionId, 'sessionId');
    this.assertSafeId(meta.componentId, 'componentId');
    if (meta.groupId) this.assertSafeId(meta.groupId, 'groupId');

    const CODE_EXT_RE = /\.(vue|less|css|js|ts|json|html|md|svg)$/i;
    const SKIP_DIRS = new Set(['.checkpoint', '.mc-gen', '.cache', 'node_modules']);
    const files: Record<string, string> = {};

    const walk = (dir: string, base: string) => {
      if (!existsSync(dir)) return;
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        const full = join(dir, name);
        const rel = base ? `${base}/${name}` : name;
        let st: any;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          if (SKIP_DIRS.has(name)) continue;
          walk(full, rel);
        } else if (CODE_EXT_RE.test(name)) {
          try {
            files[rel] = readFileSync(full, 'utf-8');
          } catch {
            // 读取失败（符号链接/权限）跳过，不让它中断冻结
          }
        }
      }
    };
    walk(outputPath, '');

    if (Object.keys(files).length === 0) {
      throw new Error('产物目录无可冻结的代码文件');
    }

    return this.createCandidate({
      sessionId: meta.sessionId,
      componentId: meta.componentId,
      groupId: meta.groupId,
      target: meta.target,
      stage: meta.stage || 'refine',
      refineSessionId: meta.refineSessionId,
      files,
    });
  }

  /**
   * 🆕 精修事务（治本·回滚保护）：把指定 baseline revision 的代码文件写回 outputPath，覆盖精修产生的改动。
   * 只回写该 revision 中存在的代码文件（冻结时已跳过图片），资源文件原样保留。
   * 用于「精修后质量门禁未通过 / LESS 编译失败」时，将组件恢复到精修前状态 —— 保证「再跑一次精修不会更糟」。
   */
  restoreOutputPath(sessionId: string, revision: string, outputPath: string): void {
    this.assertSafeId(sessionId, 'sessionId');
    const files = this.exportRevisionFiles(sessionId, revision);
    for (const [relPath, content] of Object.entries(files)) {
      const dest = this.resolveInside(outputPath, relPath);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content, 'utf-8');
    }
  }

  /**
   * 🆕 2026-11-12 精修续跑溯源：计算某次精修「基线快照 → 候选快照」的文件级差异，
   * 供前端「精修改动明细」面板展示「这次精修具体改了哪些内容」。
   * - baselineRev / candidateRev 为同一 source session 下的两个 revision；
   * - 返回按 modified→added→removed、同型按路径排序的差异列表，每个文件含行级统一 diff。
   *   超大文件（>800 行差异）的 diff 截断，避免响应体过大（列表仍展示，点开可见截断提示）。
   */
  computeRefineDiff(
    sessionId: string,
    baselineRev: string,
    candidateRev: string,
  ): RefineChange[] {
    this.assertSafeId(sessionId, 'sessionId');
    const base = this.getManifest(sessionId, baselineRev);
    const cand = this.getManifest(sessionId, candidateRev);
    const bMap = new Map(base.files.map((f) => [f.path, f]));
    const cMap = new Map(cand.files.map((f) => [f.path, f]));
    const MAX_DIFF_LINES = 800;

    const readText = (rev: string, path: string): string => {
      const buf = this.readFile(sessionId, rev, path);
      return Buffer.isBuffer(buf) ? buf.toString('utf-8') : String(buf);
    };

    const changes: RefineChange[] = [];
    for (const cf of cand.files) {
      const bf = bMap.get(cf.path);
      if (!bf) {
        const content = readText(candidateRev, cf.path);
        const diff = unifiedLineDiff('', content).slice(0, MAX_DIFF_LINES);
        changes.push({
          path: cf.path,
          type: 'added',
          baselineLines: 0,
          candidateLines: cf.lines ?? 0,
          baselineSize: 0,
          candidateSize: cf.size,
          diff,
        });
        continue;
      }
      if (bf.hash !== cf.hash) {
        const bContent = readText(baselineRev, cf.path);
        const cContent = readText(candidateRev, cf.path);
        const diff = unifiedLineDiff(bContent, cContent).slice(0, MAX_DIFF_LINES);
        changes.push({
          path: cf.path,
          type: 'modified',
          baselineLines: bf.lines ?? 0,
          candidateLines: cf.lines ?? 0,
          baselineSize: bf.size,
          candidateSize: cf.size,
          diff,
        });
      }
    }
    for (const bf of base.files) {
      if (!cMap.has(bf.path)) {
        const content = readText(baselineRev, bf.path);
        const diff = unifiedLineDiff(content, '').slice(0, MAX_DIFF_LINES);
        changes.push({
          path: bf.path,
          type: 'removed',
          baselineLines: bf.lines ?? 0,
          candidateLines: 0,
          baselineSize: bf.size,
          candidateSize: 0,
          diff,
        });
      }
    }

    const order: Record<RefineChange['type'], number> = { modified: 0, added: 1, removed: 2 };
    changes.sort((x, y) => order[x.type] - order[y.type] || x.path.localeCompare(y.path));
    return changes;
  }

  /**
   * 仅回写质量校验结论，不改变 revision 状态。
   * 与 markCandidateDegraded 的区别：后者会写入 rejectionReason 并把状态钉成 candidate，
   * 而「用户手改后重新校验」既可能通过也可能失败，状态应保持原样由上层决定。
   */
  updateValidation(
    sessionId: string,
    revision: string,
    validation: TaskCodeSnapshotValidation,
    rejectionReason?: string,
  ): TaskCodeSnapshotManifest {
    return this.updateManifest(sessionId, revision, {
      validation,
      rejectionReason: rejectionReason ? rejectionReason.slice(0, 1000) : undefined,
    });
  }

  private readManifestFile(
    manifest: TaskCodeSnapshotManifest,
    sessionId: string,
    revision: string,
    rawPath: string,
  ): Buffer {
    const path = this.normalizeRelativePath(rawPath);
    if (!manifest.files.some((file) => file.path === path)) throw new Error('快照文件不存在');

    const revisionDir = this.getRevisionDir(sessionId, revision);
    const absolutePath = this.resolveInside(revisionDir, path);
    const stat = lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('快照文件非法');
    const content = readFileSync(absolutePath);
    const expected = manifest.files.find((file) => file.path === path);
    if (!expected) throw new Error('快照文件不存在');
    const actualHash = createHash('sha256').update(content).digest('hex');
    if (expected.hash !== actualHash) {
      // 🛡️ 索引漂移自愈（见 reconcileRevisionIntegrity 注释）。
      // 直接 fail-closed 的后果是「产物已同步、事务已提交，但预览一片空白」且无任何人工修复入口。
      this.repairFileEntry(sessionId, revision, path, content.byteLength, actualHash);
    }
    return content;
  }

  /**
   * 🛡️ 快照完整性对账：以**磁盘内容为准**回写 manifest 的 size/hash。
   *
   * 背景（mc-1788138863742-f9bd0808 实锤）：上一轮排查为修复 LESS-COMPILE-001，直接把
   * 快照里的 `resources/styles/common.less` 补全右大括号并写回磁盘，但 manifest.json 里
   * 的 size/hash 仍是旧值（2885 → 2887）。readManifestFile 的 fail-closed 完整性校验
   * 因此恒抛「快照文件完整性校验失败」，连带 readPreviewFile 一起失败 —— 表现就是
   * 「质量预览产物已同步到 workspace / 事务已提交，但前端 iframe 依然一片空白」。
   *
   * 原则：revision 目录本身就是不可变快照的**内容载体**，manifest 只是它的索引。
   * 二者漂移时，错的那一方是索引（revision 目录只能由本服务写入，外部直改属异常场景）。
   * 因此以磁盘为准回写索引并 WARN 留痕；文件缺失 / 符号链接 / 目录等真实非法情况仍 fail-closed。
   *
   * @returns 发生漂移并被修正的文件清单（相对路径 + 大小变化）
   */
  reconcileRevisionIntegrity(sessionId: string, revision: string): string[] {
    const manifest = this.getManifest(sessionId, revision);
    const revisionDir = this.getRevisionDir(sessionId, revision);
    const drifted: string[] = [];
    const nextFiles = (manifest.files || []).map((file) => {
      let absolutePath: string;
      try {
        absolutePath = this.resolveInside(revisionDir, file.path);
      } catch {
        return file; // 越界项：保持原样，交由读取时的路径校验拦截
      }
      if (!existsSync(absolutePath)) return file;
      let content: Buffer;
      try {
        const stat = lstatSync(absolutePath);
        if (!stat.isFile() || stat.isSymbolicLink()) return file;
        content = readFileSync(absolutePath);
      } catch {
        return file;
      }
      const hash = createHash('sha256').update(content).digest('hex');
      if (hash === file.hash && content.byteLength === file.size) return file;
      drifted.push(`${file.path}(${file.size}->${content.byteLength})`);
      return { ...file, size: content.byteLength, hash };
    });
    if (drifted.length === 0) return [];
    console.warn(
      `[TaskCodeSnapshot] 完整性漂移已对账（以磁盘为准回写 manifest）：${sessionId}/${revision} :: ${drifted.join(', ')}`,
    );
    this.updateManifest(sessionId, revision, { files: nextFiles });
    return drifted;
  }

  /**
   * 🔒 R1（2026-09-01）：终态同源刷新——把 outputPath 的指定文件同步进 revision 目录
   * 并回写 manifest（哈希/大小；缺失则新增条目）。
   *
   * 背景：phase2 的 precompileCss 在 candidate 创建之后继续清洗磁盘
   * resources/styles/*.less（theme-vars :root 包裹、LLM 污染剥离），导致快照 revision
   * 停在清洗前版本，与 workspace（磁盘发布）分叉。此处以磁盘终态为准刷新 revision，
   * 保持「快照 revision == 磁盘终态」的单一事实源语义。
   *
   * @returns 实际刷新的相对路径列表（无变化返回空数组）
   */
  refreshRevisionFilesFromDisk(
    sessionId: string,
    revision: string,
    outputPath: string,
    relPaths: string[],
  ): string[] {
    const manifest = this.getManifest(sessionId, revision);
    const revisionDir = this.getRevisionDir(sessionId, revision);
    const refreshed: string[] = [];
    const files = [...(manifest.files || [])];
    for (const rel of relPaths) {
      let srcAbs: string;
      let dstAbs: string;
      try {
        srcAbs = this.resolveInside(outputPath, rel);
        dstAbs = this.resolveInside(revisionDir, rel);
      } catch {
        continue; // 越界路径：跳过
      }
      if (!existsSync(srcAbs)) continue;
      let content: Buffer;
      try {
        const stat = lstatSync(srcAbs);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        content = readFileSync(srcAbs);
      } catch {
        continue;
      }
      const hash = createHash('sha256').update(content).digest('hex');
      const idx = files.findIndex((f) => f.path === rel);
      if (
        idx >= 0 &&
        files[idx].hash === hash &&
        files[idx].size === content.byteLength
      ) {
        continue; // 内容一致，无需刷新
      }
      mkdirSync(dirname(dstAbs), { recursive: true });
      writeFileSync(dstAbs, content);
      const entry: TaskCodeSnapshotFile = {
        path: rel,
        size: content.byteLength,
        hash,
        lines: countLines(content),
      };
      if (idx >= 0) files[idx] = entry;
      else files.push(entry);
      refreshed.push(rel);
    }
    if (refreshed.length > 0) {
      this.updateManifest(sessionId, revision, { files });
      console.warn(
        `[TaskCodeSnapshot] 终态同源刷新（以磁盘为准）：${sessionId}/${revision} :: ${refreshed.join(', ')}`,
      );
    }
    return refreshed;
  }

  /** 单文件索引修正：整表对账太重，读取路径上只修命中的那一项。 */
  private repairFileEntry(
    sessionId: string,
    revision: string,
    filePath: string,
    size: number,
    hash: string,
  ): void {
    try {
      const manifest = this.getManifest(sessionId, revision);
      const nextFiles = (manifest.files || []).map((file) =>
        file.path === filePath ? { ...file, size, hash } : file,
      );
      console.warn(
        `[TaskCodeSnapshot] 索引漂移自愈：${sessionId}/${revision}/${filePath}（size=${size}）已按磁盘内容回写 manifest`,
      );
      this.updateManifest(sessionId, revision, { files: nextFiles });
    } catch (err: any) {
      // 回写失败不掩盖读取结果：本次内容已经拿到，交给下次对账或人工介入。
      console.warn(`[TaskCodeSnapshot] 索引漂移回写失败（非致命）：${err?.message || err}`);
    }
  }

  markValidating(
    sessionId: string,
    revision: string,
    validation: TaskCodeSnapshotValidation,
  ): TaskCodeSnapshotManifest {
    return this.updateManifest(sessionId, revision, {
      status: 'validating',
      validation,
    });
  }

  publishLastGood(
    sessionId: string,
    revision: string,
    validation: TaskCodeSnapshotValidation,
  ): TaskCodeSnapshotManifest {
    const manifest = this.updateManifest(sessionId, revision, {
      status: 'last-good',
      validation,
      lastGoodRevision: revision,
      rejectionReason: undefined,
    });
    this.writePointer(sessionId, 'last-good', revision);
    // candidate 指针只代表“待验证版本”。晋级后清掉它，避免下一次查询
    // 把已发布版本误当作仍在验证中的候选版本。
    this.clearPointer(sessionId, 'candidate', revision);
    // 组件已正式晋级 last-good，旧的半成品（partial）标记一并作废，避免失败兜底误判。
    this.clearPointer(sessionId, 'partial', revision);
    return manifest;
  }

  /**
   * 质量门禁未通过但产物仍可预览时，保留 candidate 指针供人工审查/编辑。
   * 与 rejectCandidate 的区别：质量问题不等于文件不可用，不能把可见性一起回滚。
   */
  markCandidateDegraded(
    sessionId: string,
    revision: string,
    reason: string,
    validation: TaskCodeSnapshotValidation,
  ): TaskCodeSnapshotManifest {
    const lastGoodRevision = this.readPointer(sessionId, 'last-good')?.revision;
    return this.updateManifest(sessionId, revision, {
      status: 'candidate',
      validation,
      lastGoodRevision,
      rejectionReason: reason.slice(0, 1000),
    });
  }

  rejectCandidate(
    sessionId: string,
    revision: string,
    reason: string,
    validation: TaskCodeSnapshotValidation,
  ): TaskCodeSnapshotManifest {
    const lastGoodRevision = this.readPointer(sessionId, 'last-good')?.revision;
    const manifest = this.updateManifest(sessionId, revision, {
      status: 'rejected',
      validation,
      lastGoodRevision,
      rejectionReason: reason.slice(0, 1000),
    });
    // rejected 是不可预览终态，作废可能残留的 partial 指针，避免失败兜底误读被拒版本。
    this.clearPointer(sessionId, 'partial', revision);
    return manifest;
  }

  /**
   * 🛡️ P1 半成品抢救：生成失败时把已生成的部分快照标记为 partial（可预览、可进 PG 手动补全）。
   * 与 rejectCandidate 的区别：rejected 是「校验未通过、不可预览」；partial 是「生成不完整但文件保留、可预览」。
   * 磁盘文件不删除（rejectCandidate 也不删），仅状态改为 partial 使 readPreviewFile 放行。
   */
  markPartial(
    sessionId: string,
    revision: string,
    reason: string,
    validation: TaskCodeSnapshotValidation,
  ): TaskCodeSnapshotManifest {
    const lastGoodRevision = this.readPointer(sessionId, 'last-good')?.revision;
    // 🛡️ P2#5 缺失文件清单：从「关键应有文件 − 已生成文件」确定性推导。
    // microcode 必需 declare.json + package/index.vue（组件可注册+可渲染的硬性条件，与 hasMicrocodeEntryFile 对齐）；
    // vue3 仅必需 package/index.vue（无 declare.json）。子组件缺失由前端 componentStructure 补充展示。
    const current = this.getManifest(sessionId, revision);
    const existingPaths = new Set((current.files || []).map((f) => f.path));
    const requiredFiles = current.target === 'vue3'
      ? ['package/index.vue']
      : ['declare.json', 'package/index.vue'];
    const missingFiles = requiredFiles.filter((f) => !existingPaths.has(f));

    const manifest = this.updateManifest(sessionId, revision, {
      status: 'partial',
      validation,
      lastGoodRevision,
      rejectionReason: reason.slice(0, 1000),
      missingFiles,
    });
    // 🛡️ 写入 partial 指针，使 getPartialManifest / hasTaskArtifacts 兜底可独立定位半成品，
    // 而非依赖 candidate 指针（candidate 可能已被下一次 attempt 覆盖）。
    this.writePointer(sessionId, 'partial', revision);
    return manifest;
  }

  /**
   * 获取最新 partial（半成品可预览/可进 PG）manifest。
   * 仅返回 status === 'partial' 的快照；无则返回 null。
   * 供失败任务 artifactReady 兜底、预览源解析与前端「不完整」标签使用。
   */
  getPartialManifest(sessionId: string): TaskCodeSnapshotManifest | null {
    const pointer = this.readPointer(sessionId, 'partial');
    if (!pointer) return null;
    const manifest = this.getManifest(sessionId, pointer.revision);
    return manifest.status === 'partial' ? manifest : null;
  }

  /**
   * 列出某任务的全部快照版本（含 last-good / candidate / partial / rejected），按时间倒序。
   * 用于「版本历史 + 一键回滚」：前端据此渲染版本列表，选定后调 rollbackToRevision。
   *
   * 设计约束：
   *  1. 只读磁盘 revisions 目录，不触碰任何指针与 manifest。
   *  2. 单条损坏（manifest 非法 / 目录缺失）静默跳过，不让历史列表被一条坏数据拖垮。
   */
  listRevisions(sessionId: string): TaskCodeSnapshotManifest[] {
    this.assertSafeId(sessionId, 'sessionId');
    const revisionsDir = resolve(this.getSessionDir(sessionId), 'revisions');
    if (!existsSync(revisionsDir)) return [];
    const entries = readdirSync(revisionsDir, { withFileTypes: true });
    const manifests: TaskCodeSnapshotManifest[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !SAFE_REVISION.test(entry.name)) continue;
      try {
        manifests.push(this.getManifest(sessionId, entry.name));
      } catch {
        // 非法/损坏的 revision 目录直接跳过
      }
    }
    manifests.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return manifests;
  }

  /**
   * 一键回滚：把 last-good 指针重定向到目标历史 revision，使其成为新的预览/发布源。
   *
   * 语义（单一事实源）：last-good 指针即「当前版本」。重定向后，预览读取
   * （resolvePreviewRevision 回退）与发布源解析（resolvePublishSourceDir）都自然指向
   * 回滚目标，无需再复制产物。同时清掉 candidate/partial 指针，避免回退到未回滚的
   * 候选或半成品版本。
   *
   * 只允许回滚到「可预览状态」且「渲染完整」的版本（与 readPreviewFile 的放行口径一致）：
   * candidate / validating / last-good / partial；rejected 是「校验未通过、不可预览」终态，拒绝。
   */
  rollbackToRevision(sessionId: string, revision: string): TaskCodeSnapshotManifest {
    const manifest = this.getManifest(sessionId, revision);
    if (!['candidate', 'validating', 'last-good', 'partial'].includes(manifest.status)) {
      throw new Error('该版本已拒绝或不可预览，无法回滚');
    }
    if (!this.isRenderableRevision(sessionId, revision)) {
      throw new Error('该版本产物不完整（缺 index.vue 或子组件 import 悬空），无法回滚');
    }
    this.writePointer(sessionId, 'last-good', revision);
    this.clearPointer(sessionId, 'candidate');
    this.clearPointer(sessionId, 'partial');
    return this.updateManifest(sessionId, revision, {
      status: 'last-good',
      lastGoodRevision: revision,
      rejectionReason: undefined,
    });
  }

  /**
   * 将用户对快照的修改写回为新的不可变 candidate revision。
   * 只允许修改来源 revision 中已有的文件，禁止借此创建任意路径或跨任务写入。
   */
  createEditedCandidate(
    sessionId: string,
    revision: string,
    filePath: string,
    content: string | Buffer,
    editSource = 'playground',
  ): TaskCodeSnapshotManifest {
    this.assertSafeId(sessionId, 'sessionId');
    const source = this.getManifest(sessionId, revision);
    if (!['candidate', 'partial', 'validating', 'last-good'].includes(source.status)) {
      throw new Error('该代码快照当前不可编辑');
    }
    const normalizedPath = this.normalizeRelativePath(filePath);
    if (!source.files.some((file) => file.path === normalizedPath)) {
      throw new Error('只能编辑当前快照中已存在的文件');
    }

    const files: Record<string, Buffer> = {};
    for (const file of source.files) {
      files[file.path] = this.readManifestFile(source, sessionId, revision, file.path);
    }
    files[normalizedPath] = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const next = this.createCandidate({
      sessionId,
      componentId: source.componentId,
      groupId: source.groupId,
      target: source.target,
      stage: 'playground-edit',
      files,
    });
    return this.updateManifest(sessionId, next.revision, {
      parentRevision: revision,
      editSource: String(editSource || 'playground').slice(0, 100),
      rejectionReason: undefined,
    });
  }

  /**
   * 🛡️ 2026-09-03（产物面板漂移治本）：基于既有快照派生新 candidate revision。
   *
   * 根因：任务详情「产物代码」面板只读任务快照（candidate/partial/lastGood，生成期
   * 冻结的不可变 revision），而 bind-api 只写 workspace → 面板看不到 api/*.mjs 与
   * 注入代码，与 Playground 预览/下载产物漂移。
   *
   * 语义：overlay = 覆盖基线同名文件 + 新增基线没有的文件；baseRevision 缺省取当前
   * 最新可预览快照（candidate → last-good）。parentRevision 指回基线，可审计可对照，
   * 快照不可变语义不破（不改写既有 revision）。
   *
   * @returns 新 manifest；无基线快照（组件未经 phase2 快照链路）返回 null，调用方静默跳过。
   */
  createOverlayCandidate(
    sessionId: string,
    overlayFiles: Record<string, string | Buffer>,
    opts: { stage: string; editSource: string; baseRevision?: string },
  ): TaskCodeSnapshotManifest | null {
    this.assertSafeId(sessionId, 'sessionId');
    const base = opts.baseRevision
      ? this.getManifest(sessionId, opts.baseRevision)
      : this.getLatestManifest(sessionId);
    if (!base) return null;

    const files: Record<string, Buffer> = {};
    for (const file of base.files) {
      files[file.path] = this.readFile(sessionId, base.revision, file.path);
    }
    for (const [rawPath, content] of Object.entries(overlayFiles)) {
      files[rawPath] = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    }
    const next = this.createCandidate({
      sessionId,
      componentId: base.componentId,
      groupId: base.groupId,
      target: base.target,
      stage: opts.stage,
      files,
    });
    return this.updateManifest(sessionId, next.revision, {
      parentRevision: base.revision,
      editSource: String(opts.editSource || '').slice(0, 100),
    });
  }

  private updateManifest(
    sessionId: string,
    revision: string,
    patch: Partial<TaskCodeSnapshotManifest>,
  ): TaskCodeSnapshotManifest {
    const manifest = this.getManifest(sessionId, revision);
    const next = { ...manifest, ...patch, revision, sessionId };
    const manifestPath = resolve(this.getRevisionDir(sessionId, revision), 'manifest.json');
    const tempPath = `${manifestPath}.tmp-${randomUUID()}`;
    writeFileSync(tempPath, JSON.stringify(next, null, 2), { encoding: 'utf8', flag: 'wx' });
    renameWithCopyFallback(tempPath, manifestPath, { label: '快照 manifest 原子写' });
    return next;
  }

  private getSessionDir(sessionId: string): string {
    this.assertSafeId(sessionId, 'sessionId');
    return resolve(this.root, sessionId);
  }

  private getRevisionDir(sessionId: string, revision: string): string {
    if (!SAFE_REVISION.test(revision)) throw new Error('revision 格式非法');
    return resolve(this.getSessionDir(sessionId), 'revisions', revision);
  }

  private readPointer(sessionId: string, type: 'candidate' | 'last-good' | 'partial'): SnapshotPointer | null {
    const pointerPath = resolve(this.getSessionDir(sessionId), `${type}.json`);
    if (!existsSync(pointerPath)) return null;
    const stat = lstatSync(pointerPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('快照指针非法');
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as SnapshotPointer;
    if (!SAFE_REVISION.test(pointer.revision)) throw new Error('快照指针 revision 非法');
    return pointer;
  }

  private writePointer(sessionId: string, type: 'candidate' | 'last-good' | 'partial', revision: string): void {
    if (!SAFE_REVISION.test(revision)) throw new Error('revision 格式非法');
    const sessionDir = this.getSessionDir(sessionId);
    mkdirSync(sessionDir, { recursive: true });
    const pointerPath = resolve(sessionDir, `${type}.json`);
    const tempPath = `${pointerPath}.tmp-${randomUUID()}`;
    writeFileSync(
      tempPath,
      JSON.stringify({ revision, updatedAt: new Date().toISOString() }, null, 2),
      { encoding: 'utf8', flag: 'wx' },
    );
    renameWithCopyFallback(tempPath, pointerPath, { label: '快照 pointer 原子写' });
  }

  private clearPointer(
    sessionId: string,
    type: 'candidate' | 'last-good' | 'partial',
    expectedRevision?: string,
  ): void {
    const pointerPath = resolve(this.getSessionDir(sessionId), `${type}.json`);
    if (!existsSync(pointerPath)) return;
    const current = this.readPointer(sessionId, type);
    if (expectedRevision && current?.revision !== expectedRevision) return;
    // 指针清理是非关键簿记：可能因环境 safe-delete 钩子（单轮批量删除阈值）拦截 rmSync 而抛错，
    // 绝不能因此把「已成功生成的组件」翻成失败态。删除失败仅留痕告警，下次写入会被覆盖。
    try {
      rmSync(pointerPath, { force: true });
    } catch (err: any) {
      console.warn(
        `[TaskCodeSnapshot] clearPointer 非致命：删除 ${pointerPath} 失败 - ${err?.message || err}`,
      );
    }
  }

  private assertSafeId(value: string, label: string): void {
    if (!SAFE_ID.test(value)) throw new Error(`${label} 格式非法`);
  }

  private normalizeRelativePath(rawPath: string): string {
    const path = String(rawPath || '').replaceAll('\\', '/').trim();
    if (!path || path.includes('\0') || isAbsolute(path)) throw new Error('快照文件路径非法');
    const normalized = posix.normalize(path);
    if (
      normalized === '.' ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.startsWith('/') ||
      normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      throw new Error(`快照文件路径越界：${rawPath}`);
    }
    return normalized;
  }

  private resolveInside(root: string, relativePath: string): string {
    const normalizedRoot = `${resolve(root)}${sep}`;
    const absolutePath = resolve(root, ...relativePath.split('/'));
    if (!`${absolutePath}${sep}`.startsWith(normalizedRoot)) {
      throw new Error(`快照文件路径越界：${relativePath}`);
    }
    return absolutePath;
  }
}
