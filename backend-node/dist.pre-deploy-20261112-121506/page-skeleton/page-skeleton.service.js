"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var PageSkeletonService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageSkeletonService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const fsp = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const os = __importStar(require("os"));
const sharp_1 = __importDefault(require("sharp"));
const pngjs_1 = require("pngjs");
const { ZipArchive } = require('archiver');
const axios_1 = __importDefault(require("axios"));
const tasks_service_1 = require("../tasks/tasks.service");
const progress_service_1 = require("../progress/progress.service");
const vision_agent_1 = require("../ai-engine/agents/vision-agent");
const ai_defaults_1 = require("../ai-engine/utils/ai-defaults");
const config_service_1 = require("../config/config.service");
const backend_root_1 = require("../config/backend-root");
const PAGE_ROOT = path.join(__dirname, '../../workspace', 'vue3-pages');
function ok(data, source = 'page-skeleton') {
    return { success: true, code: 0, message: 'ok', data, source };
}
function safeSeg(seg) {
    if (!/^[A-Za-z0-9_-]+$/.test(seg)) {
        throw new common_1.BadRequestException(`非法标识符: ${seg}`);
    }
    return seg;
}
function assertInsidePageRoot(absPath, groupId, pageId) {
    const base = path.join(PAGE_ROOT, groupId, pageId);
    const rel = path.relative(base, absPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new common_1.ForbiddenException('路径越权');
    }
}
let PageSkeletonService = PageSkeletonService_1 = class PageSkeletonService {
    tasksService;
    aiConfigService;
    progressService;
    logger = new common_1.Logger(PageSkeletonService_1.name);
    constructor(tasksService, aiConfigService, progressService) {
        this.tasksService = tasksService;
        this.aiConfigService = aiConfigService;
        this.progressService = progressService;
    }
    async create(userId, payload, file) {
        const groupId = safeSeg(payload.groupId);
        const pageId = 'page-' + crypto.randomBytes(6).toString('hex');
        const isFigma = !!payload.figmaUrl;
        this.tasksService.createTask(pageId, {
            taskType: 'page-skeleton',
            componentName: payload.name?.trim() || '未命名页面',
            groupId,
            userId,
            sourceType: isFigma ? 'figma' : 'screenshot',
        }, 'running');
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
        }).catch((e) => {
            this.logger.error(`[page-skeleton] 异步生成未捕获异常 pageId=${pageId}`, e?.stack || e);
        });
        return result;
    }
    async generateFromImage(pageId, groupId, userId, opts) {
        const sessionId = pageId;
        try {
            this.progressService.sendProgress(sessionId, {
                stage: 'input',
                status: 'running',
                message: opts.isFigma ? '准备 Figma 渲染图…' : '准备截图输入…',
            });
            let imageBuffer;
            let imageW = 0;
            let imageH = 0;
            const sourceType = opts.isFigma ? 'figma' : 'screenshot';
            const sourceUrl = opts.figmaUrl || '';
            if (opts.isFigma) {
                this.progressService.sendLog(sessionId, 'info', '下载 Figma 节点渲染图…');
                const dl = await this.renderFigmaImage(opts.figmaUrl);
                imageBuffer = dl.buffer;
                imageW = dl.width;
                imageH = dl.height;
            }
            else if (opts.buffer && opts.buffer.length) {
                this.progressService.sendLog(sessionId, 'info', '读取上传截图…');
                imageBuffer = opts.buffer;
            }
            else {
                throw new common_1.BadRequestException('缺少截图文件或 figmaUrl');
            }
            this.progressService.sendProgress(sessionId, {
                stage: 'sanitize',
                status: 'running',
                message: '图像消毒与尺寸解析…',
            });
            if (!imageW || !imageH) {
                try {
                    const meta = await (0, sharp_1.default)(imageBuffer).metadata();
                    imageW = meta.width || 0;
                    imageH = meta.height || 0;
                }
                catch {
                    imageW = 0;
                    imageH = 0;
                }
            }
            imageBuffer = await this.sanitizeImageBuffer(imageBuffer);
            if (!imageW || !imageH) {
                const meta = await (0, sharp_1.default)(imageBuffer).metadata();
                imageW = meta.width || 1440;
                imageH = meta.height || 810;
            }
            const tmpPath = path.join(os.tmpdir(), `ps-${pageId}.png`);
            await fsp.writeFile(tmpPath, imageBuffer);
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
            this.progressService.sendLog(sessionId, 'info', `视觉模型分析完成（${resolvedModel}）`, { model: resolvedModel });
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
            this.progressService.sendProgress(sessionId, {
                stage: 'done',
                status: 'running',
                message: '页面骨架生成完成',
            });
            try {
                await fsp.unlink(tmpPath);
            }
            catch { }
            this.progressService.sendComplete(sessionId, {
                success: true,
                id: pageId,
                name,
                groupId,
                userId,
                path: `vue3-pages/${groupId}/${pageId}`,
                downloadUrl: `/api/page-skeleton/${groupId}/${pageId}/download`,
                _completionModels: { visionModel: resolvedModel },
            });
        }
        catch (e) {
            this.logger.error(`[page-skeleton] 生成失败 pageId=${pageId}`, e?.stack || e);
            this.progressService.sendError(sessionId, e);
        }
    }
    async retry(userId, pageId, groupId) {
        const folder = this.resolveFolder(userId, groupId, pageId);
        const meta = await this.readMeta(folder, userId);
        const shotPath = path.join(folder, 'screenshot.png');
        if (!fs.existsSync(shotPath)) {
            throw new common_1.NotFoundException('未找到原始截图，无法重试（请重新创建）');
        }
        const imageBuffer = await fsp.readFile(shotPath);
        this.tasksService.createTask(pageId, {
            taskType: 'page-skeleton',
            componentName: meta.name || '未命名页面',
            groupId,
            userId,
            sourceType: meta?.source?.type || 'screenshot',
        }, 'running');
        void this.generateFromImage(pageId, groupId, userId, {
            name: meta.name,
            figmaUrl: undefined,
            buffer: imageBuffer,
            isFigma: false,
        }).catch((e) => {
            this.logger.error(`[page-skeleton] 重试未捕获异常 pageId=${pageId}`, e?.stack || e);
        });
        return ok({ id: pageId, groupId, status: 'running', retried: true });
    }
    async list(userId, groupId) {
        const groups = groupId
            ? [safeSeg(groupId)]
            : (await this.safeReaddir(PAGE_ROOT));
        const items = [];
        for (const g of groups) {
            const groupDir = path.join(PAGE_ROOT, g);
            if (!fs.existsSync(groupDir))
                continue;
            const pageIds = await this.safeReaddir(groupDir);
            for (const pid of pageIds) {
                const metaPath = path.join(groupDir, pid, 'page-meta.json');
                if (!fs.existsSync(metaPath))
                    continue;
                try {
                    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
                    if (meta.creatorId && meta.creatorId !== userId)
                        continue;
                    items.push({
                        id: pid,
                        name: meta.name,
                        groupId: g,
                        source: meta.source,
                        createdAt: meta.createdAt,
                        updatedAt: meta.updatedAt,
                    });
                }
                catch { }
            }
        }
        items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        return ok(items);
    }
    async getOne(userId, pageId, groupId) {
        const folder = this.resolveFolder(userId, groupId, pageId);
        const meta = await this.readMeta(folder, userId);
        const structure = meta.structure;
        const read = async (rel) => {
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
    async update(userId, pageId, groupId, patch) {
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
            const dims = meta.source || {};
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
                skipScreenshot: true,
                screenshotBuffer: Buffer.alloc(0),
            });
        }
        return ok({ id: pageId, name: meta.name, updatedAt: meta.updatedAt });
    }
    async downloadZip(userId, pageId, groupId) {
        const folder = this.resolveFolder(userId, groupId, pageId);
        await this.readMeta(folder, userId);
        return new Promise((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const chunks = [];
            archive.on('data', (c) => chunks.push(c));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (e) => reject(e));
            const addIfExists = (rel, zipName) => {
                const p = path.join(folder, rel);
                if (fs.existsSync(p))
                    archive.append(fs.readFileSync(p), { name: zipName });
            };
            addIfExists('index.vue', 'index.vue');
            addIfExists('组件清单.md', '组件清单.md');
            addIfExists('resources/styles/index.less', 'resources/styles/index.less');
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
    async remove(userId, pageId, groupId) {
        const folder = this.resolveFolder(userId, groupId, pageId);
        await this.readMeta(folder, userId);
        await fsp.rm(folder, { recursive: true, force: true });
        await this.tasksService.removeTask(pageId, userId);
        return ok({ id: pageId, deleted: true });
    }
    resolvePageDir(groupId, pageId) {
        const roots = [
            path.join(PAGE_ROOT, groupId, pageId),
            path.join((0, backend_root_1.resolveFrontendWorkspacePath)(), 'vue3-pages', groupId, pageId),
        ];
        for (const r of roots) {
            if (fs.existsSync(r))
                return r;
        }
        return roots[0];
    }
    assertInsideDir(absPath, dir) {
        const rel = path.relative(dir, absPath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            throw new common_1.ForbiddenException('路径越权');
        }
    }
    async walkDir(absDir, baseDir) {
        const entries = await fsp.readdir(absDir, { withFileTypes: true });
        const nodes = [];
        for (const e of entries) {
            if (e.name === '.mc-gen' || e.name === 'node_modules' || e.name.startsWith('.'))
                continue;
            const abs = path.join(absDir, e.name);
            const rel = path.relative(baseDir, abs).split(path.sep).join('/');
            if (e.isDirectory()) {
                nodes.push(...(await this.walkDir(abs, baseDir)));
            }
            else {
                const ext = path.extname(e.name).toLowerCase();
                let type = 'text';
                if (ext === '.vue')
                    type = 'vue';
                else if (ext === '.js' || ext === '.ts')
                    type = 'javascript';
                else if (ext === '.json')
                    type = 'json';
                else if (ext === '.md')
                    type = 'markdown';
                else if (ext === '.less' || ext === '.css')
                    type = 'css';
                else if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext))
                    type = 'image';
                nodes.push({ name: e.name, path: rel, type });
            }
        }
        return nodes;
    }
    async listPageFiles(groupId, pageId) {
        const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
        if (!fs.existsSync(dir))
            throw new common_1.NotFoundException('页面不存在');
        return { success: true, files: await this.walkDir(dir, dir) };
    }
    async readPageFile(groupId, pageId, filePath) {
        const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
        const abs = path.join(dir, filePath);
        this.assertInsideDir(abs, dir);
        if (!fs.existsSync(abs) || !(await fsp.stat(abs)).isFile()) {
            throw new common_1.NotFoundException('文件不存在');
        }
        const isBinary = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(filePath);
        const content = isBinary ? '' : await fsp.readFile(abs, 'utf8');
        return { isBinary, absPath: abs, content };
    }
    async writePageFile(groupId, pageId, filePath, content) {
        const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
        const abs = path.join(dir, filePath);
        this.assertInsideDir(abs, dir);
        await fsp.mkdir(path.dirname(abs), { recursive: true });
        await fsp.writeFile(abs, content ?? '', 'utf8');
        return { path: filePath, written: true };
    }
    async createPageFolder(groupId, pageId, filePath) {
        const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
        const abs = path.join(dir, filePath);
        this.assertInsideDir(abs, dir);
        await fsp.mkdir(abs, { recursive: true });
        return { path: filePath, created: true };
    }
    async renamePageFile(groupId, pageId, oldPath, newPath) {
        const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
        const absOld = path.join(dir, oldPath);
        const absNew = path.join(dir, newPath);
        this.assertInsideDir(absOld, dir);
        this.assertInsideDir(absNew, dir);
        await fsp.mkdir(path.dirname(absNew), { recursive: true });
        await fsp.rename(absOld, absNew);
        return { oldPath, newPath, renamed: true };
    }
    async deletePageFile(groupId, pageId, filePath) {
        const dir = this.resolvePageDir(safeSeg(groupId), safeSeg(pageId));
        const abs = path.join(dir, filePath);
        this.assertInsideDir(abs, dir);
        if (!fs.existsSync(abs))
            throw new common_1.NotFoundException('文件不存在');
        const st = await fsp.stat(abs);
        if (st.isDirectory())
            await fsp.rm(abs, { recursive: true });
        else
            await fsp.unlink(abs);
        return { path: filePath, deleted: true };
    }
    async getVisionConfig(userId) {
        const cfg = (0, ai_defaults_1.resolveVisionConfig)(await this.aiConfigService.getMergedAiConfig(userId));
        if (cfg && cfg.apiKey) {
            return {
                apiKey: cfg.apiKey,
                baseURL: cfg.baseURL || '',
                model: cfg.model || '',
                providerType: cfg.providerType || 'auto',
                providerId: cfg.providerId,
            };
        }
        return null;
    }
    async sanitizeImageBuffer(buf) {
        if (!buf || buf.length < 64) {
            throw new common_1.BadRequestException('图片内容为空或过小，请重新选择截图');
        }
        try {
            await (0, sharp_1.default)(buf).metadata();
            return await (0, sharp_1.default)(buf)
                .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 82 })
                .toBuffer();
        }
        catch {
        }
        try {
            const png = pngjs_1.PNG.sync.read(buf);
            const channels = png.bpp;
            if (![1, 2, 3, 4].includes(channels)) {
                throw new Error('unsupported png layout channels=' + channels);
            }
            return await (0, sharp_1.default)(png.data, {
                raw: { width: png.width, height: png.height, channels },
            })
                .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 82 })
                .toBuffer();
        }
        catch (e) {
            throw new common_1.BadRequestException('图片无法解析（格式不受支持或已损坏），请换一张 PNG/JPG 截图后重试');
        }
    }
    async analyzeLayout(imagePath, w, h, userId) {
        const cfg = await this.getVisionConfig(userId);
        if (!cfg) {
            throw new common_1.BadRequestException('未配置 vision 模型，请在全局配置中添加可用的视觉模型');
        }
        let agent;
        try {
            agent = new vision_agent_1.VisionAgent(cfg);
        }
        catch (e) {
            throw new common_1.BadRequestException('vision 模型初始化失败: ' + (e.message || String(e)));
        }
        const prompt = this.buildAnalysisPrompt(w, h);
        let raw;
        try {
            raw = await agent.analyzeImage(imagePath, prompt, {});
        }
        catch (e) {
            throw new common_1.BadRequestException('vision 分析失败: ' + (e.message || String(e)));
        }
        const json = this.extractJson(raw);
        if (!json || !json.layout) {
            throw new common_1.BadRequestException('vision 返回结构无法解析');
        }
        const structure = this.normalizeStructure(json, w, h);
        return { structure, model: cfg.model || '未知视觉模型' };
    }
    buildAnalysisPrompt(w, h) {
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
    extractJson(raw) {
        if (!raw)
            return null;
        let s = raw.trim();
        const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (m)
            s = m[1];
        try {
            return JSON.parse(s);
        }
        catch {
            const a = s.indexOf('{');
            const b = s.lastIndexOf('}');
            if (a >= 0 && b > a) {
                try {
                    return JSON.parse(s.slice(a, b + 1));
                }
                catch {
                    return null;
                }
            }
            return null;
        }
    }
    normalizeStructure(json, w, h) {
        const L = json.layout || {};
        const theme = L.theme || {};
        const layout = {
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
        const validRegions = ['header', 'footer', 'left', 'right', 'center'];
        const components = Array.isArray(json.components)
            ? json.components.map((c, i) => {
                const bbox = c.bbox &&
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
    rebalanceRegions(s) {
        const L = s.layout;
        const components = s.components.map((c) => {
            const b = c.bbox;
            if (!b || b.width <= 0 || b.height <= 0)
                return c;
            const cx = b.x + b.width / 2;
            const cy = b.y + b.height / 2;
            let region = c.region;
            if (cy < 12 && b.y < 8)
                region = 'header';
            else if (cy > 88 && b.y + b.height > 92)
                region = 'footer';
            else if (cx < 35)
                region = 'left';
            else if (cx > 65)
                region = 'right';
            else
                region = 'center';
            return { ...c, region };
        });
        if (L.centerPlaceholder) {
            const fixed = components.map((c) => {
                if (c.region !== 'center')
                    return c;
                if (c.type === 'map' || c.placeholder)
                    return c;
                const b = c.bbox;
                const cx = b ? b.x + b.width / 2 : 50;
                const newRegion = cx < 50 ? 'left' : 'right';
                return { ...c, region: newRegion };
            });
            return { layout: L, components: fixed };
        }
        return { layout: L, components };
    }
    async renderPageFiles(folder, opt) {
        await fsp.mkdir(path.join(folder, 'components'), { recursive: true });
        await fsp.mkdir(path.join(folder, 'resources', 'styles'), { recursive: true });
        await fsp.mkdir(path.join(folder, '.mc-gen', 'cache'), { recursive: true });
        const { structure } = opt;
        const indexVue = this.buildIndexVue(structure, opt.imageW, opt.imageH);
        await fsp.writeFile(path.join(folder, 'index.vue'), indexVue, 'utf8');
        const regions = ['header', 'left', 'right', 'center', 'footer'];
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
        await fsp.writeFile(path.join(folder, 'resources', 'styles', 'index.less'), this.buildLess(structure), 'utf8');
        await fsp.writeFile(path.join(folder, '组件清单.md'), this.buildMd(structure), 'utf8');
        if (!opt.skipScreenshot && opt.screenshotBuffer && opt.screenshotBuffer.length) {
            await fsp.writeFile(path.join(folder, 'screenshot.png'), opt.screenshotBuffer);
        }
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
        await fsp.writeFile(path.join(folder, '.mc-gen', 'cache', 'vision-response.txt'), JSON.stringify(structure, null, 2), 'utf8');
    }
    buildIndexVue(s, W, H) {
        const L = s.layout;
        const vw = (px) => `calc(${px} * var(--vw))`;
        const vh = (px) => `calc(${px} * var(--vh))`;
        const byRegion = (r) => s.components.filter((c) => c.region === r);
        const headerComps = byRegion('header');
        const leftComps = byRegion('left');
        const rightComps = byRegion('right');
        const centerComps = byRegion('center');
        const footerComps = byRegion('footer');
        const nameByComp = new Map();
        {
            const order = ['header', 'left', 'right', 'center', 'footer'];
            let i = 0;
            for (const r of order) {
                for (const c of s.components.filter((cc) => cc.region === r)) {
                    i += 1;
                    nameByComp.set(c, `Panel${i}`);
                }
            }
        }
        const renderPanel = (c) => {
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
    buildComponentVue(compName, _c) {
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
    buildLess(s) {
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
    buildMd(s) {
        const rows = s.components
            .map((c, i) => `| ${i + 1} | ${c.name} | ${c.region} | ${c.type} | ${c.heightRatio}% | ${c.placeholder ? '是（占位）' : '否'} | ${c.note || ''} |`)
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
    async renderFigmaImage(figmaUrl) {
        const figmaToken = process.env.FIGMA_ACCESS_TOKEN;
        if (!figmaToken) {
            throw new common_1.BadRequestException('未配置 Figma Token，请在「设置 → 模型配置」中配置 Figma Token，或设置环境变量 FIGMA_ACCESS_TOKEN');
        }
        let FigmaConnector;
        try {
            const mod = await import('../ai-engine/roles/figma-connector.js');
            FigmaConnector = mod.FigmaConnector || mod.default?.FigmaConnector || mod.default;
        }
        catch (e) {
            throw new common_1.BadRequestException('figma 连接器不可用: ' + (e.message || String(e)));
        }
        if (typeof FigmaConnector !== 'function') {
            throw new common_1.BadRequestException('figma 连接器未导出 FigmaConnector');
        }
        const m = figmaUrl.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
        const nodeM = figmaUrl.match(/[?&]node-id=([0-9A-Za-z-]+)/);
        if (!m)
            throw new common_1.BadRequestException('无法解析 figma URL');
        const fileKey = m[1];
        const nodeId = nodeM ? nodeM[1] : undefined;
        if (!nodeId)
            throw new common_1.BadRequestException('figma URL 缺少 node-id 参数');
        const connector = new FigmaConnector({ figmaToken });
        const imageUrl = await connector.getImageUrl(fileKey, nodeId);
        const resp = await axios_1.default.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(resp.data);
        const meta = await (0, sharp_1.default)(buffer).metadata();
        return { buffer, width: meta.width || 1440, height: meta.height || 810 };
    }
    esc(s) {
        return String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
    }
    fadeColor(hex, alpha) {
        const h = String(hex || '#000000').replace('#', '');
        const parse = (seg) => parseInt(seg.length === 1 ? seg + seg : seg, 16);
        let r, g, b;
        if (h.length === 3) {
            r = parse(h[0]);
            g = parse(h[1]);
            b = parse(h[2]);
        }
        else if (h.length === 6) {
            r = parseInt(h.slice(0, 2), 16);
            g = parseInt(h.slice(2, 4), 16);
            b = parseInt(h.slice(4, 6), 16);
        }
        else {
            return `rgba(0,0,0,${alpha})`;
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    async readComponents(folder) {
        const out = {};
        const compDir = path.join(folder, 'components');
        if (fs.existsSync(compDir)) {
            for (const f of fs.readdirSync(compDir)) {
                if (f.endsWith('.vue'))
                    out[f] = await fsp.readFile(path.join(compDir, f), 'utf8');
            }
        }
        return out;
    }
    async safeReaddir(p) {
        try {
            return (await fsp.readdir(p)).filter((x) => !x.startsWith('.'));
        }
        catch {
            return [];
        }
    }
    resolveFolder(userId, groupId, pageId) {
        const g = safeSeg(groupId);
        const p = safeSeg(pageId);
        const folder = path.join(PAGE_ROOT, g, p);
        const rel = path.relative(PAGE_ROOT, folder);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            throw new common_1.ForbiddenException('非法路径');
        }
        return folder;
    }
    async readMeta(folder, userId) {
        const metaPath = path.join(folder, 'page-meta.json');
        if (!fs.existsSync(metaPath)) {
            throw new common_1.NotFoundException('页面不存在');
        }
        const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
        if (meta.creatorId && meta.creatorId !== userId) {
            throw new common_1.ForbiddenException('无权访问该页面');
        }
        return meta;
    }
};
exports.PageSkeletonService = PageSkeletonService;
exports.PageSkeletonService = PageSkeletonService = PageSkeletonService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        config_service_1.AiConfigService,
        progress_service_1.ProgressService])
], PageSkeletonService);
//# sourceMappingURL=page-skeleton.service.js.map