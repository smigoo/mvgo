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
var ProjectPipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectPipelineService = void 0;
exports.normalizeProjectOwner = normalizeProjectOwner;
const common_1 = require("@nestjs/common");
const node_child_process_1 = require("node:child_process");
const crypto = __importStar(require("node:crypto"));
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const yaml = __importStar(require("js-yaml"));
const { ZipArchive } = require('archiver');
const s2_contract_freezer_1 = require("./stages/s2-contract-freezer");
const s3_codegen_1 = require("./stages/s3-codegen");
const s4_vuegen_1 = require("./stages/s4-vuegen");
const config_service_1 = require("../../config/config.service");
const figma_client_js_1 = require("../../ai-engine/tools/figma/figma-client.js");
const figma_unit_splitter_1 = require("./units/figma-unit-splitter");
const html_unit_splitter_1 = require("./units/html-unit-splitter");
const unit_contract_1 = require("./units/unit-contract");
const SCANNER_PATH = path.resolve(__dirname, 'scanner/s0-scan.js');
const SCANNER_MD5 = '52b7788b33e800c3d1a19b291c6b8e9d';
const ACTION_LABEL = {
    list: '查询/列表',
    create: '新增/创建',
    detail: '详情/编辑',
    update: '更新',
    delete: '删除',
    other: '其他',
};
const ACTION_REGION_MAP = {
    list: ['table', 'list'],
    detail: ['detailLink', 'link'],
    create: ['createButton', 'button', 'form'],
    update: ['detailLink', 'link', 'form'],
    delete: ['createButton', 'button', 'link'],
    other: ['table', 'list', 'createButton', 'button', 'detailLink', 'link', 'form'],
};
const RUNS_ROOT = process.env.PROJECT_RUNS_ROOT
    ? path.resolve(process.env.PROJECT_RUNS_ROOT)
    : path.resolve(__dirname, '../../../data/project-runs');
const RUN_ID_RX = /^pj-\d{8}-\d{6}-[a-f0-9]{6}$/;
const SCAN_TIMEOUT_MS = 180_000;
const STDOUT_CAP = 1_000_000;
const OWNER_ID_RX = /^[0-9a-fA-F]{24}$/;
function normalizeProjectOwner(userId) {
    if (typeof userId !== 'string')
        return undefined;
    const value = userId.trim();
    return OWNER_ID_RX.test(value) ? value : undefined;
}
const SHOT_LAUNCH_TIMEOUT_MS = 15_000;
const SHOT_GOTO_TIMEOUT_MS = 8_000;
const SHOT_SCREENSHOT_TIMEOUT_MS = 8_000;
const SHOT_CLOSE_TIMEOUT_MS = 3_000;
const SHOT_TOTAL_BUDGET_MS = 20_000;
const SHOT_READY_TIMEOUT_MS = 1_500;
const SHOT_SETTLE_TIMEOUT_MS = 1_500;
const SHOT_BUDGET_TRACE = Symbol('shotBudgetTrace');
const VISION_SYNC_BUDGET_MS = 45_000;
const ENRICH_STALE_MS = 15 * 60_000;
const PICK_TIMEOUT_MS = 300_000;
const BROWSE_MAX_ENTRIES = 500;
const BROWSE_SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'target',
    '.venv',
    '__pycache__',
    '.next',
    '.nuxt',
    'coverage',
]);
const ARTIFACT_WHITELIST = [
    'spec/project.manifest.json',
    'spec/endpoints.json',
    'spec/conflicts.md',
    'spec/decisions.md',
    'spec/freeze-report.json',
    'spec/openapi.local.yaml',
    'doc/REQUIREMENTS.draft.md',
    'doc/FRONTEND-DESIGN.draft.md',
    'doc/BACKEND-DESIGN.draft.md',
    'doc/REQUIREMENTS.md',
    'spec/feature-details.json',
    'spec/components.json',
    'generated/**',
    'spec/shots/**',
];
let ProjectPipelineService = ProjectPipelineService_1 = class ProjectPipelineService {
    aiConfig;
    logger = new common_1.Logger(ProjectPipelineService_1.name);
    shotInflight = new Map();
    enrichInflight = new Set();
    constructor(aiConfig) {
        this.aiConfig = aiConfig;
    }
    health() {
        const scannerExists = fs.existsSync(SCANNER_PATH);
        let scannerMd5 = null;
        if (scannerExists) {
            scannerMd5 = crypto
                .createHash('md5')
                .update(fs.readFileSync(SCANNER_PATH))
                .digest('hex');
        }
        let runsRootWritable = false;
        let runsRootError = null;
        let probeCleanupError = null;
        try {
            fs.mkdirSync(RUNS_ROOT, { recursive: true });
            const probe = path.join(RUNS_ROOT, '.write-probe');
            const stamp = `${process.pid}:${Date.now()}`;
            fs.writeFileSync(probe, stamp);
            const back = fs.readFileSync(probe, 'utf8');
            if (back !== stamp)
                throw new Error('写回读不一致（目录不可写或磁盘异常）');
            runsRootWritable = true;
            try {
                fs.unlinkSync(probe);
            }
            catch (e) {
                probeCleanupError = e.message;
            }
        }
        catch (e) {
            runsRootError = e.message;
        }
        return {
            engine: 'ai-engine-v3/project',
            milestone: 'M1（S0 扫描 + S2 契约冻结）',
            node: process.execPath,
            runsRoot: RUNS_ROOT,
            scanner: {
                path: SCANNER_PATH,
                exists: scannerExists,
                md5: scannerMd5,
                expectedMd5: SCANNER_MD5,
                md5Match: scannerMd5 === SCANNER_MD5,
            },
            runsRootWritable,
            runsRootError,
            probeCleanupError,
            ok: scannerExists && scannerMd5 === SCANNER_MD5 && runsRootWritable,
            note: '扫描器与 outputs/s0-scan.cjs 逐字节一致（md5 相同）；不一致说明引擎被改过，需重新验证。',
        };
    }
    inspect(projectDir) {
        const raw = String(projectDir ?? '').trim();
        if (!raw)
            throw new common_1.BadRequestException('projectDir 不能为空');
        if (!path.isAbsolute(raw)) {
            throw new common_1.BadRequestException(`必须传绝对路径（当前收到 "${raw}"）。后端按本机文件系统读取，` +
                '相对路径会落到服务进程的 cwd 上，不可控。');
        }
        const resolved = path.resolve(raw);
        const exists = fs.existsSync(resolved);
        const isDirectory = exists && fs.statSync(resolved).isDirectory();
        if (!exists) {
            return {
                projectDir: raw,
                resolvedPath: resolved,
                exists: false,
                isDirectory: false,
                readable: false,
                totalFiles: 0,
                totalBytes: 0,
                topLevel: [],
                byExt: [],
                hint: '路径不存在。请确认填的是**运行后端那台机器**上的绝对路径。',
            };
        }
        if (!isDirectory) {
            return {
                projectDir: raw,
                resolvedPath: resolved,
                exists: true,
                isDirectory: false,
                readable: false,
                totalFiles: 0,
                totalBytes: 0,
                topLevel: [],
                byExt: [],
                hint: '这是一个文件而不是目录。请填项目根目录。',
            };
        }
        let readable = true;
        let readError = null;
        try {
            fs.readdirSync(resolved);
        }
        catch (e) {
            readable = false;
            readError = e.message;
        }
        const topLevel = readable
            ? fs
                .readdirSync(resolved, { withFileTypes: true })
                .slice(0, 200)
                .map((d) => {
                const full = path.join(resolved, d.name);
                let size = 0;
                let childCount = 0;
                try {
                    if (d.isDirectory())
                        childCount = fs.readdirSync(full).length;
                    else
                        size = fs.statSync(full).size;
                }
                catch {
                }
                return {
                    name: d.name,
                    type: d.isDirectory() ? 'dir' : 'file',
                    size,
                    childCount,
                };
            })
            : [];
        const byExtMap = new Map();
        let totalFiles = 0;
        let totalBytes = 0;
        const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '.DS_Store']);
        const walk = (dir, depth) => {
            if (depth > 3 || totalFiles > 20000)
                return;
            let entries = [];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const d of entries) {
                if (SKIP.has(d.name))
                    continue;
                const full = path.join(dir, d.name);
                if (d.isDirectory()) {
                    walk(full, depth + 1);
                }
                else {
                    totalFiles++;
                    let size = 0;
                    try {
                        size = fs.statSync(full).size;
                    }
                    catch {
                    }
                    totalBytes += size;
                    const ext = (path.extname(d.name) || '(无扩展名)').toLowerCase();
                    const cur = byExtMap.get(ext) ?? { count: 0, bytes: 0 };
                    cur.count++;
                    cur.bytes += size;
                    byExtMap.set(ext, cur);
                }
            }
        };
        if (readable)
            walk(resolved, 1);
        const byExt = [...byExtMap.entries()]
            .map(([ext, v]) => ({ ext, ...v }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);
        return {
            projectDir: raw,
            resolvedPath: resolved,
            exists: true,
            isDirectory: true,
            readable,
            readError,
            totalFiles,
            totalBytes,
            topLevel,
            byExt,
            hint: readable
                ? '体量统计深度 ≤ 3 且跳过 .git / node_modules / dist，仅作印象用；坑位识别请跑 S0。'
                : '目录不可读（权限问题），S0 扫描同样会失败。',
        };
    }
    async pickDirectory(defaultDir) {
        const platform = process.platform;
        const start = this.pickStartDir(defaultDir);
        let cmd;
        let args;
        if (platform === 'darwin') {
            const prompt = '选择项目目录（后端会按此路径只读扫描）';
            const loc = start ? ` default location (POSIX file ${JSON.stringify(start)})` : '';
            cmd = 'osascript';
            args = ['-e', `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)}${loc})`];
        }
        else if (platform === 'win32') {
            cmd = 'powershell.exe';
            args = [
                '-NoProfile',
                '-STA',
                '-Command',
                'Add-Type -AssemblyName System.Windows.Forms | Out-Null;' +
                    '$d = New-Object System.Windows.Forms.FolderBrowserDialog;' +
                    "$d.Description = '选择项目目录'; $d.ShowNewFolderButton = $true;" +
                    "if ($d.ShowDialog() -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
            ];
        }
        else if (this.hasBin('zenity')) {
            cmd = 'zenity';
            args = ['--file-selection', '--directory', '--title=选择项目目录'];
            if (start)
                args.push(`--filename=${start}${path.sep}`);
        }
        else if (this.hasBin('kdialog')) {
            cmd = 'kdialog';
            args = ['--getexistingdirectory', start || os.homedir()];
        }
        else {
            return {
                ok: false,
                unsupported: true,
                platform,
                reason: '本机没有 osascript / powershell / zenity / kdialog，无法拉起系统目录对话框。',
            };
        }
        return await new Promise((resolve) => {
            let out = '';
            let err = '';
            let settled = false;
            let child;
            try {
                child = (0, node_child_process_1.spawn)(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            }
            catch (e) {
                resolve({ ok: false, unsupported: true, platform, reason: e.message });
                return;
            }
            const done = (payload) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                resolve(payload);
            };
            const timer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                }
                catch {
                }
                done({
                    ok: false,
                    timedOut: true,
                    platform,
                    reason: `系统对话框 ${PICK_TIMEOUT_MS / 1000}s 内没有返回（可能被切到后台，或系统拦下了弹窗权限）。`,
                });
            }, PICK_TIMEOUT_MS);
            child.stdout?.on('data', (d) => {
                if (out.length < 8192)
                    out += d.toString();
            });
            child.stderr?.on('data', (d) => {
                if (err.length < 8192)
                    err += d.toString();
            });
            child.on('error', (e) => {
                done({ ok: false, unsupported: true, platform, reason: e.message });
            });
            child.on('close', (code) => {
                const picked = out.trim();
                if (code === 0 && picked) {
                    done({ ok: true, path: path.resolve(picked), platform });
                    return;
                }
                if (/-128/.test(err) || /cancel/i.test(err)) {
                    done({ ok: false, cancelled: true, platform });
                    return;
                }
                done({ ok: false, platform, reason: (err.trim() || `exit code ${code}`).slice(0, 400) });
            });
        });
    }
    browseDirectory(rawPath) {
        const raw = String(rawPath ?? '').trim();
        if (!raw)
            return this.listBrowseRoots();
        if (!path.isAbsolute(raw)) {
            throw new common_1.BadRequestException(`必须传绝对路径（收到 "${raw}"）。`);
        }
        const resolved = path.resolve(raw);
        let stat;
        try {
            stat = fs.statSync(resolved);
        }
        catch {
            throw new common_1.BadRequestException(`路径不存在：${resolved}`);
        }
        if (!stat.isDirectory())
            throw new common_1.BadRequestException(`这不是一个目录：${resolved}`);
        let dirents;
        try {
            dirents = fs.readdirSync(resolved, { withFileTypes: true });
        }
        catch (e) {
            throw new common_1.BadRequestException(`目录读不出来（权限？）：${e.message}`);
        }
        const entries = [];
        let fileCount = 0;
        let skipped = 0;
        for (const d of dirents) {
            if (!d.isDirectory()) {
                fileCount++;
                continue;
            }
            if (BROWSE_SKIP_DIRS.has(d.name)) {
                skipped++;
                continue;
            }
            const full = path.join(resolved, d.name);
            let childDirs = 0;
            let childFiles = 0;
            try {
                for (const c of fs.readdirSync(full, { withFileTypes: true })) {
                    if (c.isDirectory())
                        childDirs++;
                    else
                        childFiles++;
                }
            }
            catch {
            }
            entries.push({
                name: d.name,
                path: full,
                hidden: d.name.startsWith('.'),
                isGitRepo: fs.existsSync(path.join(full, '.git')),
                hasProjectJson: fs.existsSync(path.join(full, 'mvgo.project.json')),
                childDirs,
                childFiles,
            });
        }
        entries.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const parent = path.dirname(resolved);
        return {
            path: resolved,
            name: path.basename(resolved) || resolved,
            parent: parent === resolved ? null : parent,
            parentName: parent === resolved ? null : path.basename(parent),
            isGitRepo: fs.existsSync(path.join(resolved, '.git')),
            hasProjectJson: fs.existsSync(path.join(resolved, 'mvgo.project.json')),
            fileCountAtThisLevel: fileCount,
            skippedDirs: skipped,
            truncated: entries.length > BROWSE_MAX_ENTRIES,
            totalEntries: entries.length,
            entries: entries.slice(0, BROWSE_MAX_ENTRIES),
        };
    }
    listBrowseRoots() {
        const home = os.homedir();
        const roots = [];
        const push = (name, p, tag) => {
            try {
                if (fs.statSync(p).isDirectory())
                    roots.push({ name, path: p, tag });
            }
            catch {
            }
        };
        for (const p of this.recentProjectDirs()) {
            push(path.basename(p) || p, p, '最近用过');
        }
        push('主目录', home);
        push('桌面', path.join(home, 'Desktop'));
        push('文档', path.join(home, 'Documents'));
        push('下载', path.join(home, 'Downloads'));
        if (process.platform === 'darwin') {
            push('用户目录', '/Users');
            push('外接卷 / 挂载点', '/Volumes');
        }
        else if (process.platform === 'win32') {
            for (const L of 'CDEFGHIJ')
                push(`${L}:\\`, `${L}:\\`);
        }
        else {
            push('根目录', '/');
            push('用户目录', '/home');
            push('挂载点', '/mnt');
        }
        push('后端所在目录', process.cwd(), '后端');
        push('临时目录', os.tmpdir());
        const seen = new Set();
        const uniq = roots.filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true)));
        return { path: '', name: '起始位置', parent: null, roots: true, entries: uniq };
    }
    recentProjectDirs() {
        try {
            const dirs = this.listRuns()
                .runs.map((r) => r.projectDir)
                .filter((p) => typeof p === 'string' && path.isAbsolute(p));
            return [...new Set(dirs)].slice(0, 5);
        }
        catch {
            return [];
        }
    }
    pickStartDir(defaultDir) {
        const raw = String(defaultDir ?? '').trim();
        if (raw && path.isAbsolute(raw)) {
            try {
                if (fs.statSync(raw).isDirectory())
                    return raw;
            }
            catch {
            }
        }
        return null;
    }
    hasBin(bin) {
        const dirs = String(process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
        for (const d of dirs) {
            try {
                fs.accessSync(path.join(d, bin), fs.constants.X_OK);
                return true;
            }
            catch {
            }
        }
        return false;
    }
    async scan(projectDir, note, userId, opts) {
        const info = this.inspect(projectDir);
        if (!info.exists)
            throw new common_1.BadRequestException(`项目目录不存在：${info.resolvedPath}`);
        if (!info.isDirectory)
            throw new common_1.BadRequestException(`不是目录：${info.resolvedPath}`);
        if (!info.readable) {
            throw new common_1.BadRequestException(`目录不可读：${info.readError ?? ''}`);
        }
        if (!fs.existsSync(SCANNER_PATH)) {
            throw new common_1.BadRequestException(`扫描器缺失：${SCANNER_PATH}（dist 未拷 assets？）`);
        }
        const runId = this.newRunId();
        const outDir = path.join(RUNS_ROOT, runId);
        fs.mkdirSync(outDir, { recursive: true });
        const t0 = Date.now();
        const res = await this.runScanner(info.resolvedPath, outDir);
        const durationMs = Date.now() - t0;
        if (res.code === 2) {
            throw new common_1.BadRequestException(`扫描器拒绝该目录：${(res.stderr || res.stdout).trim()}`);
        }
        if (!fs.existsSync(path.join(outDir, 'spec', 'project.manifest.json'))) {
            throw new common_1.BadRequestException(`扫描未产出 manifest（exit=${res.code}）：${(res.stderr || res.stdout).slice(0, 800)}`);
        }
        fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify({
            runId,
            ownerId: normalizeProjectOwner(userId) ?? null,
            projectDir: info.resolvedPath,
            note: note ?? null,
            createdAt: new Date().toISOString(),
            durationMs,
            exitCode: res.code,
            scannerMd5: SCANNER_MD5,
            stdoutTail: res.stdout.slice(-4000),
        }, null, 2) + '\n');
        this.logger.log(`[S0] runId=${runId} dir=${info.resolvedPath} exit=${res.code} ${durationMs}ms owner=${normalizeProjectOwner(userId) ?? 'anonymous'}`);
        const view = await this.inspectRun(runId, userId, opts);
        const enrichCfg = opts?.enrich === 'sync' ? null : await this.resolveTextConfigSafe(userId);
        const featureEnrich = this.startFeatureEnrichment(runId, outDir, enrichCfg, opts);
        return {
            durationMs,
            exitCode: res.code,
            stdout: res.stdout,
            ...view,
            featureEnrich,
        };
    }
    runScanner(projectDir, outDir) {
        return new Promise((resolve) => {
            const env = { ...process.env };
            delete env.NODE_OPTIONS;
            const child = (0, node_child_process_1.spawn)(process.execPath, [SCANNER_PATH, projectDir, '--out', outDir], { cwd: RUNS_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            let settled = false;
            const finish = (code, extra) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                resolve({
                    code,
                    stdout: stdout.slice(0, STDOUT_CAP),
                    stderr: extra ? extra + (stderr ? '\n' + stderr : '') : stderr.slice(0, STDOUT_CAP),
                });
            };
            const timer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                }
                catch {
                }
                finish(-1, `扫描超时（${SCAN_TIMEOUT_MS}ms）`);
            }, SCAN_TIMEOUT_MS);
            child.stdout?.on('data', (b) => {
                if (stdout.length < STDOUT_CAP)
                    stdout += b.toString('utf8');
            });
            child.stderr?.on('data', (b) => {
                if (stderr.length < STDOUT_CAP)
                    stderr += b.toString('utf8');
            });
            child.on('error', (e) => finish(-1, e.message));
            child.on('close', (code) => finish(code ?? -1));
        });
    }
    newRunId() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        const stamp = d.getFullYear() +
            p(d.getMonth() + 1) +
            p(d.getDate()) +
            '-' +
            p(d.getHours()) +
            p(d.getMinutes()) +
            p(d.getSeconds());
        return `pj-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
    }
    assertRunId(runId) {
        if (!RUN_ID_RX.test(String(runId ?? ''))) {
            throw new common_1.BadRequestException(`非法 runId：${JSON.stringify(runId)}`);
        }
    }
    resolveRunDir(runId, userId) {
        this.assertRunId(runId);
        const dir = path.join(RUNS_ROOT, runId);
        if (!fs.existsSync(dir))
            throw new common_1.NotFoundException(`运行不存在：${runId}`);
        const owner = normalizeProjectOwner(this.readRunMeta(dir)?.ownerId);
        if (owner && owner !== normalizeProjectOwner(userId)) {
            this.logger.warn(`[owner] 拒绝访问 runId=${runId}：归属不一致（caller=${userId ?? 'anonymous'}）`);
            throw new common_1.NotFoundException(`运行不存在：${runId}`);
        }
        return dir;
    }
    readRunMeta(dir) {
        try {
            return JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
        }
        catch {
            return null;
        }
    }
    listRuns(userId) {
        fs.mkdirSync(RUNS_ROOT, { recursive: true });
        const me = normalizeProjectOwner(userId);
        const runs = fs
            .readdirSync(RUNS_ROOT, { withFileTypes: true })
            .filter((d) => d.isDirectory() && RUN_ID_RX.test(d.name))
            .map((d) => {
            const full = path.join(RUNS_ROOT, d.name);
            let createdAt = null;
            let projectDir = null;
            let note = null;
            let ownerId = null;
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(full, 'run.json'), 'utf8'));
                createdAt = meta.createdAt ?? null;
                projectDir = meta.projectDir ?? null;
                note = meta.note ?? null;
                ownerId = normalizeProjectOwner(meta.ownerId) ?? null;
            }
            catch {
            }
            const st = fs.statSync(full);
            return {
                runId: d.name,
                createdAt: createdAt ?? st.mtime.toISOString(),
                projectDir,
                note,
                ownerId,
                frozen: fs.existsSync(path.join(full, 'spec', 'openapi.local.yaml')),
            };
        })
            .filter((r) => (r.ownerId === null ? true : me !== undefined && r.ownerId === me))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .slice(0, 30);
        return { runsRoot: RUNS_ROOT, total: runs.length, runs };
    }
    deleteRun(runId, userId) {
        const dir = this.resolveRunDir(runId, userId);
        const bytes = this.measureDir(dir);
        fs.rmSync(dir, { recursive: true, force: true });
        if (fs.existsSync(dir)) {
            throw new Error(`删除后目录仍存在：${dir}（权限不足或文件被占用？）`);
        }
        this.logger.warn(`已删除运行 ${runId}（${bytes} 字节）：${dir}`);
        return { deleted: runId, bytes, dir };
    }
    measureDir(dir) {
        let total = 0;
        const walk = (d) => {
            let entries = [];
            try {
                entries = fs.readdirSync(d, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const ent of entries) {
                const full = path.join(d, ent.name);
                if (ent.isDirectory()) {
                    walk(full);
                }
                else if (ent.isFile()) {
                    try {
                        total += fs.statSync(full).size;
                    }
                    catch {
                    }
                }
            }
        };
        walk(dir);
        return total;
    }
    async inspectRun(runId, userId, opts) {
        const dir = this.resolveRunDir(runId, userId);
        const readJson = (rel) => {
            try {
                return JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
            }
            catch {
                return null;
            }
        };
        const readText = (rel) => {
            try {
                return fs.readFileSync(path.join(dir, rel), 'utf8');
            }
            catch {
                return null;
            }
        };
        const manifest = readJson('spec/project.manifest.json');
        const endpoints = readJson('spec/endpoints.json');
        const conflictsMd = readText('spec/conflicts.md') ?? '';
        const parsed = this.parseConflictsMd(conflictsMd);
        const decisions = this.readDecisions(runId);
        const artifacts = ARTIFACT_WHITELIST.map((rel) => {
            const full = path.join(dir, rel);
            try {
                const st = fs.statSync(full);
                return { name: rel, exists: true, bytes: st.size, mtime: st.mtime.toISOString() };
            }
            catch {
                return { name: rel, exists: false, bytes: 0, mtime: null };
            }
        });
        const s0 = manifest?.S0 ?? null;
        const s1 = manifest?.S1 ?? null;
        return {
            runId,
            dir,
            projectDir: manifest?.projectRoot ?? null,
            scannedAt: manifest?.scannedAt ?? null,
            elapsedMs: manifest?.elapsedMs ?? null,
            s0: s0
                ? {
                    docs: s0.docs,
                    html: s0.html,
                    frontend: s0.frontend,
                    backend: s0.backend,
                    projectJson: s0.projectJson,
                    git: s0.git,
                    missing: s0.missing,
                    gate: s0.gate,
                    readOnly: s0.readOnly,
                }
                : null,
            s1: s1
                ? {
                    sources: s1.sources,
                    alignment: s1.alignment,
                    envelopeShapes: s1.envelopeShapes,
                    envelope: s1.envelope,
                    sourceHashes: s1.sourceHashes,
                    gaps: s1.gaps,
                    gate: s1.gate,
                }
                : null,
            endpoints: {
                total: endpoints?.total ?? 0,
                declaredPrefix: endpoints?.declaredPrefix ?? null,
                byConfidence: endpoints?.byConfidence ?? {},
                list: (endpoints?.endpoints ?? []).map((e) => ({
                    path: e.path,
                    verb: e.verb,
                    sources: e.sources,
                    confidence: e.confidence,
                    flags: e.flags,
                })),
            },
            featureDetails: await this.loadOrBuildFeatureDetails(dir, s0, s1, endpoints, manifest?.projectRoot ?? null, userId, opts),
            conflicts: parsed.conflicts,
            gaps: parsed.gaps,
            missing: manifest?.missing ?? [],
            decisions,
            artifacts,
            frozen: artifacts.find((a) => a.name === 'spec/openapi.local.yaml')?.exists === true,
            featureEnrich: this.deriveFeatureEnrichStatus(dir),
            briefing: this.buildBriefing(s0, s1, endpoints, manifest?.projectRoot ?? null),
        };
    }
    buildBriefing(s0, s1, endpoints, projectRoot) {
        const docPath = s0?.docs?.files?.[0]?.path ?? null;
        const docStem = docPath ? path.basename(docPath).replace(/\.[^./\\]+$/, '') : '';
        const title = docStem.split('_')[0]?.trim() ||
            (projectRoot ? path.basename(projectRoot) : '') ||
            '未命名项目';
        const feBase = Array.isArray(s0?.frontend?.bases) ? s0.frontend.bases[0] : null;
        const feParts = [feBase?.name ?? feBase?.dir ?? ''];
        if (feBase?.vite)
            feParts.push('Vite');
        const frontend = feParts.filter(Boolean).join(' · ') || '未识别前端基座';
        const beBase = Array.isArray(s0?.backend?.bases) ? s0.backend.bases[0] : null;
        const beParts = [beBase?.artifactId ?? beBase?.dir ?? ''];
        if (beBase?.springBoot)
            beParts.push('Spring Boot');
        if (beBase?.javaVersion)
            beParts.push(`Java ${beBase.javaVersion}`);
        const backend = beParts.filter(Boolean).join(' · ') || '未识别后端基座';
        const { features, featuresFrom } = this.extractFeatures(s1, s0);
        const descBits = [];
        const docCount = Array.isArray(s0?.docs?.files) ? s0.docs.files.length : 0;
        const pageCount = Array.isArray(s0?.html?.pages) ? s0.html.pages.length : 0;
        if (docCount)
            descBits.push(`${docCount} 份需求文档`);
        if (pageCount)
            descBits.push(`${pageCount} 个原型页面`);
        descBits.push(`${Number(endpoints?.total ?? 0)} 个 API 端点`);
        return {
            title,
            desc: descBits.join(' · '),
            frontend,
            backend,
            features,
            featuresFrom,
        };
    }
    async loadOrBuildFeatureDetails(dir, s0, s1, endpoints, projectRoot, userId, opts) {
        const file = path.join(dir, 'spec', 'feature-details.json');
        try {
            const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (cached && typeof cached === 'object') {
                const feats = Object.values(cached);
                const anyShot = feats.some((f) => Array.isArray(f?.shots) && f.shots.length);
                if (anyShot || !this.shotsDirHasPng(dir))
                    return cached;
                this.logger.warn('feature-details 缓存命中但截图缺失，且磁盘已有 PNG → 强制重建（自愈）');
            }
        }
        catch {
        }
        const built = await this.buildFeatureDetails(dir, s0, s1, endpoints, projectRoot, userId, opts);
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, JSON.stringify(built, null, 2) + '\n');
        }
        catch {
        }
        return built;
    }
    async buildFeatureDetails(dir, s0, s1, endpoints, projectRoot, userId, opts) {
        const { features, featurePoints } = this.extractFeatures(s1, s0);
        const epList = Array.isArray(endpoints?.endpoints) ? endpoints.endpoints : [];
        const pages = (s0?.html?.pages ?? []).map((p) => String(p?.path ?? ''));
        const htmlPages = Array.isArray(s0?.html?.pages) ? s0.html.pages : [];
        const declaredPrefix = (endpoints?.declaredPrefix && String(endpoints.declaredPrefix).trim()) || '/api';
        const cfg = await this.resolveTextConfigSafe(userId);
        const aiEnabled = !!cfg;
        const visionCfg = opts?.vision === true ? await this.resolveVisionConfigSafe(userId) : null;
        const visionT0 = Date.now();
        const visionDeadline = visionT0 + VISION_SYNC_BUDGET_MS;
        const pageAcc = this.createPageAccessor(projectRoot, htmlPages);
        const details = {};
        for (const f of features) {
            const related = this.matchEndpoints(f, epList);
            details[f] = {
                feature: f,
                description: `「${f}」是需求文档中定义的功能模块，需在前后端协同实现。`,
                featurePoints: featurePoints[f] || [],
                relatedEndpoints: related,
                suggestedEndpoints: related.length
                    ? []
                    : this.deriveSuggestedEndpoints(f, declaredPrefix, aiEnabled),
                relatedPages: this.matchPages(f, pages),
                pageDevNote: '',
            };
        }
        const shotT0 = Date.now();
        const shotMap = visionCfg
            ? await this.captureShots(dir, projectRoot, htmlPages, { deadline: visionDeadline })
            : this.planShotPaths(projectRoot, htmlPages);
        const shotMs = Date.now() - shotT0;
        const shotTrace = shotMap[SHOT_BUDGET_TRACE];
        this.logger.log(`[scan] 截图策略 ${JSON.stringify({
            runId: path.basename(dir),
            mode: visionCfg ? 'capture' : 'plan',
            pages: htmlPages.length,
            planned: Object.keys(shotMap).length,
            elapsedMs: shotMs,
            budgetLeftMs: visionCfg ? Math.max(0, visionDeadline - Date.now()) : null,
            bounded: visionCfg ? !!shotTrace?.bounded : null,
            truncatedBy: visionCfg ? shotTrace?.truncatedBy ?? null : null,
            paint: visionCfg
                ? {
                    readyMs: shotTrace?.paintReadyMs ?? null,
                    evaluate1Ms: shotTrace?.paintEvaluate1Ms ?? null,
                    evaluate2Ms: shotTrace?.paintEvaluate2Ms ?? null,
                }
                : null,
        })}`);
        for (const f of features) {
            const d = details[f];
            d.shots = (d.relatedPages || []).map((p) => shotMap[p]).filter(Boolean);
            d.coverage = this.computeCoverage(f, d.featurePoints || [], d.relatedPages || [], projectRoot, htmlPages, pageAcc);
        }
        const visionCovT0 = Date.now();
        const visionCovDeadline = visionDeadline;
        let coverDone = 0;
        let coverAborted = false;
        if (visionCfg) {
            for (const f of features) {
                if (Date.now() > visionCovDeadline) {
                    coverAborted = true;
                    break;
                }
                const d = details[f];
                if (!Array.isArray(d.featurePoints) || !d.featurePoints.length || !d.shots?.length)
                    continue;
                const shotAbs = d.shots.map((s) => path.join(dir, s)).filter((p) => fs.existsSync(p));
                coverDone += 1;
                try {
                    const visionVerdicts = await this.enrichCoverageWithVision(f, d.featurePoints, shotAbs, visionCfg);
                    if (visionVerdicts && visionVerdicts.length) {
                        const covered = visionVerdicts.filter((v) => v.status === 'covered').length;
                        const missing = visionVerdicts.filter((v) => v.status === 'missing').length;
                        d.coverage = {
                            points: visionVerdicts,
                            summary: missing > 0
                                ? `${covered}/${visionVerdicts.length} 功能点视觉命中原型，${missing} 个疑似缺失`
                                : `${covered}/${visionVerdicts.length} 功能点视觉命中原型`,
                            byVision: true,
                        };
                    }
                }
                catch (err) {
                    this.logger.warn(`视觉覆盖比对失败，沿用确定性基线：${err?.message ?? err}`);
                }
            }
        }
        this.logger.log(`[scan] 视觉覆盖增强 ${JSON.stringify({
            enabled: !!visionCfg,
            features: features.length,
            done: coverDone,
            aborted: coverAborted,
            budgetMs: VISION_SYNC_BUDGET_MS,
            elapsedMs: Date.now() - visionCovT0,
        })}`);
        const enrichNow = opts?.enrich === 'sync';
        this.logger.log(`[scan] 功能增强 ${JSON.stringify({
            runId: path.basename(dir),
            mode: enrichNow ? 'sync' : 'defer',
            aiEnabled,
            model: cfg?.model ?? null,
        })}`);
        if (cfg && enrichNow) {
            try {
                const enriched = await this.enrichFeaturesWithLLM(features, epList, pages, cfg);
                this.applyEnrichment(details, enriched, epList);
            }
            catch (err) {
                this.logger.warn(`LLM 派生功能详情失败，沿用确定性结果：${err?.message ?? err}`);
            }
        }
        await this.attachEndpointLocations(details, features, htmlPages, projectRoot, pageAcc);
        const visionLocT0 = Date.now();
        const visionLocDeadline = visionDeadline;
        let locDone = 0;
        let locAborted = false;
        if (visionCfg) {
            for (const f of features) {
                if (Date.now() > visionLocDeadline) {
                    locAborted = true;
                    break;
                }
                const d = details[f];
                const eps = [...(d.relatedEndpoints || []), ...(d.suggestedEndpoints || [])].filter((e) => !(e.locations && e.locations.length));
                if (!eps.length || !d.shots?.length)
                    continue;
                const shotAbs = d.shots.map((s) => path.join(dir, s)).filter((p) => fs.existsSync(p));
                if (!shotAbs.length)
                    continue;
                locDone += 1;
                try {
                    const boxes = await this.enrichEndpointLocationsWithVision(eps, shotAbs, visionCfg);
                    if (boxes && Object.keys(boxes).length) {
                        const apply = (list) => (list || []).map((e) => {
                            const b = boxes[this.endpointAction(e)];
                            return b ? { ...e, visionBox: b } : e;
                        });
                        d.relatedEndpoints = apply(d.relatedEndpoints);
                        d.suggestedEndpoints = apply(d.suggestedEndpoints);
                    }
                }
                catch (err) {
                    this.logger.warn(`视觉接口定位失败，沿用 L1 文字定位：${err?.message ?? err}`);
                }
            }
        }
        this.logger.log(`[scan] 视觉接口定位 ${JSON.stringify({
            enabled: !!visionCfg,
            features: features.length,
            done: locDone,
            aborted: locAborted,
            budgetMs: VISION_SYNC_BUDGET_MS,
            elapsedMs: Date.now() - visionLocT0,
        })}`);
        return details;
    }
    async attachEndpointLocations(details, features, htmlPages, projectRoot, pageAcc) {
        for (const f of features) {
            const d = details[f];
            if (!d)
                continue;
            const eps = [...(d.relatedEndpoints || []), ...(d.suggestedEndpoints || [])];
            if (!eps.length || !(d.relatedPages || []).length)
                continue;
            const locMap = await this.locateEndpointsInPages(eps, htmlPages, d.relatedPages, projectRoot, pageAcc);
            const attach = (list) => (list || []).map((e) => ({ ...e, locations: locMap[this.epKey(e)] || [] }));
            d.relatedEndpoints = attach(d.relatedEndpoints);
            d.suggestedEndpoints = attach(d.suggestedEndpoints);
        }
    }
    applyEnrichment(details, enriched, epList) {
        for (const f of Object.keys(details)) {
            const e = enriched?.[f];
            if (!e || typeof e !== 'object')
                continue;
            const d = details[f];
            if (e.description)
                d.description = String(e.description);
            if (Array.isArray(e.relatedEndpointPaths)) {
                d.relatedEndpoints = this.matchEndpointsByPaths(e.relatedEndpointPaths, epList);
            }
            if (Array.isArray(e.suggestedEndpoints) && e.suggestedEndpoints.length) {
                d.suggestedEndpoints = [];
                for (const s of e.suggestedEndpoints) {
                    if (!s || !s.path)
                        continue;
                    d.suggestedEndpoints.push({
                        path: String(s.path),
                        verb: String(s.verb || 'GET').toUpperCase(),
                        confidence: 'candidate',
                        sources: ['doc-inferred'],
                        inferred: true,
                        note: s.note || '由功能描述 AI 推导，待人工确认',
                    });
                }
            }
            if (Array.isArray(e.relatedPagePaths)) {
                d.relatedPages = e.relatedPagePaths.map((p) => String(p)).filter(Boolean);
            }
            if (e.pageDevNote)
                d.pageDevNote = String(e.pageDevNote);
        }
    }
    readRunJson(dir, rel) {
        try {
            return JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
        }
        catch {
            return null;
        }
    }
    patchRunMeta(dir, patch) {
        const meta = this.readRunMeta(dir) ?? {};
        try {
            fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ ...meta, ...patch }, null, 2) + '\n');
        }
        catch (e) {
            this.logger.warn(`run.json 状态写入失败：${e?.message ?? e}`);
        }
    }
    deriveFeatureEnrichStatus(dir) {
        const fe = this.readRunMeta(dir)?.featureEnrich;
        if (!fe || typeof fe !== 'object')
            return null;
        if (fe.status === 'pending' || fe.status === 'running') {
            const age = Date.now() - Date.parse(String(fe.startedAt ?? ''));
            if (Number.isFinite(age) && age > ENRICH_STALE_MS) {
                return { ...fe, status: 'stale', note: '后台任务状态已过期（服务可能重启过）' };
            }
        }
        return fe;
    }
    startFeatureEnrichment(runId, dir, cfg, opts) {
        const startedAt = new Date().toISOString();
        if (opts?.enrich === 'sync') {
            const done = { status: 'done', mode: 'sync', startedAt, finishedAt: startedAt };
            this.patchRunMeta(dir, { featureEnrich: done });
            return done;
        }
        if (!cfg) {
            const skipped = {
                status: 'skipped',
                mode: 'async',
                startedAt,
                finishedAt: startedAt,
                note: '未配置文本模型，功能描述按确定性模板生成',
            };
            this.patchRunMeta(dir, { featureEnrich: skipped });
            return skipped;
        }
        if (this.enrichInflight.has(runId)) {
            const running = { status: 'running', mode: 'async', startedAt };
            this.patchRunMeta(dir, { featureEnrich: running });
            return running;
        }
        const pending = { status: 'pending', mode: 'async', model: cfg.model, startedAt, finishedAt: null };
        this.patchRunMeta(dir, { featureEnrich: pending });
        this.enrichInflight.add(runId);
        void this.runFeatureEnrichment(runId, dir, cfg).catch((err) => {
            this.enrichInflight.delete(runId);
            this.logger.warn(`[scan] 功能增强后台任务异常 runId=${runId}：${err?.message ?? err}`);
        });
        return pending;
    }
    async runFeatureEnrichment(runId, dir, cfg) {
        const t0 = Date.now();
        this.patchRunMeta(dir, {
            featureEnrich: { status: 'running', mode: 'async', model: cfg.model, startedAt: new Date().toISOString() },
        });
        try {
            const manifest = this.readRunJson(dir, 'spec/project.manifest.json');
            const endpoints = this.readRunJson(dir, 'spec/endpoints.json');
            const details = this.readRunJson(dir, 'spec/feature-details.json');
            if (!details || typeof details !== 'object') {
                throw new Error('spec/feature-details.json 缺失或损坏，无法增强');
            }
            const s0 = manifest?.S0 ?? null;
            const s1 = manifest?.S1 ?? null;
            const projectRoot = manifest?.projectRoot ?? null;
            const { features } = this.extractFeatures(s1, s0);
            const epList = Array.isArray(endpoints?.endpoints) ? endpoints.endpoints : [];
            const htmlPages = Array.isArray(s0?.html?.pages) ? s0.html.pages : [];
            const pages = htmlPages.map((p) => String(p?.path ?? ''));
            const prevPages = {};
            for (const f of features)
                prevPages[f] = JSON.stringify(details[f]?.relatedPages || []);
            const enriched = await this.enrichFeaturesWithLLM(features, epList, pages, cfg);
            this.applyEnrichment(details, enriched, epList);
            const changed = features.filter((f) => details[f] && JSON.stringify(details[f]?.relatedPages || []) !== prevPages[f]);
            if (changed.length) {
                const shotMap = this.planShotPaths(projectRoot, htmlPages);
                const pageAcc = this.createPageAccessor(projectRoot, htmlPages);
                for (const f of changed) {
                    const d = details[f];
                    d.shots = (d.relatedPages || []).map((p) => shotMap[p]).filter(Boolean);
                    if (d.coverage?.byVision !== true) {
                        d.coverage = this.computeCoverage(f, d.featurePoints || [], d.relatedPages || [], projectRoot, htmlPages, pageAcc);
                    }
                }
            }
            await this.attachEndpointLocations(details, features, htmlPages, projectRoot, this.createPageAccessor(projectRoot, htmlPages));
            fs.writeFileSync(path.join(dir, 'spec', 'feature-details.json'), JSON.stringify(details, null, 2) + '\n');
            const elapsedMs = Date.now() - t0;
            this.patchRunMeta(dir, {
                featureEnrich: {
                    status: 'done',
                    mode: 'async',
                    model: cfg.model,
                    startedAt: new Date(Date.now() - elapsedMs).toISOString(),
                    finishedAt: new Date().toISOString(),
                    elapsedMs,
                    features: features.length,
                    llmKeys: Object.keys(enriched || {}).length,
                    pagesRepointed: changed.length,
                },
            });
            this.logger.log(`[scan] 功能增强 完成 ${JSON.stringify({
                runId,
                elapsedMs,
                features: features.length,
                llmKeys: Object.keys(enriched || {}).length,
                pagesRepointed: changed.length,
            })}`);
        }
        catch (err) {
            const elapsedMs = Date.now() - t0;
            this.patchRunMeta(dir, {
                featureEnrich: {
                    status: 'failed',
                    mode: 'async',
                    model: cfg.model,
                    finishedAt: new Date().toISOString(),
                    elapsedMs,
                    error: String(err?.message ?? err).slice(0, 300),
                },
            });
            this.logger.warn(`[scan] 功能增强 失败 ${JSON.stringify({ runId, elapsedMs, error: String(err?.message ?? err).slice(0, 200) })}：沿用确定性结果`);
        }
        finally {
            this.enrichInflight.delete(runId);
        }
    }
    extractFeatures(s1, s0) {
        const FEATURE_CAP = 8;
        const features = [];
        const featurePoints = {};
        let featuresFrom = '';
        const headings = Array.isArray(s1?.sources?.doc?.headings)
            ? s1.sources.doc.headings
            : [];
        let currentModule = '';
        for (const h of headings) {
            const no = String(h?.no ?? '').trim();
            const raw = String(h?.title ?? '').trim();
            if (/^\d+\.\d+$/.test(no)) {
                if (raw.includes('模块')) {
                    const name = raw
                        .replace(/^\s*[\d.]+\s*/, '')
                        .replace(/模块\s*$/, '')
                        .trim();
                    if (name && !features.includes(name))
                        features.push(name);
                    if (name) {
                        currentModule = name;
                        featurePoints[name] = featurePoints[name] || [];
                    }
                    if (features.length >= FEATURE_CAP)
                        break;
                }
            }
            else if (/^\d+\.\d+\.\d+$/.test(no) && currentModule) {
                const pt = raw.replace(/^\s*[\d.]+\s*/, '').trim();
                if (pt)
                    (featurePoints[currentModule] = featurePoints[currentModule] || []).push(pt);
            }
        }
        if (features.length) {
            featuresFrom = '需求文档 · 模块章节';
        }
        else {
            for (const p of s0?.html?.pages ?? []) {
                const name = path
                    .basename(String(p?.path ?? ''))
                    .replace(/\.[^./\\]+$/, '')
                    .trim();
                if (!name)
                    continue;
                if (/^(index|main|home|login|app)$/i.test(name))
                    continue;
                if (!features.includes(name))
                    features.push(name);
                if (features.length >= FEATURE_CAP)
                    break;
            }
            if (features.length)
                featuresFrom = '原型页面';
        }
        return { features, featuresFrom, featurePoints };
    }
    matchEndpoints(feature, epList) {
        const tokens = this.featureTokens(feature);
        const out = [];
        for (const e of epList) {
            const p = String(e?.path ?? '').toLowerCase();
            if (tokens.some((t) => t && p.includes(t))) {
                out.push({ path: e.path, verb: e.verb, confidence: e.confidence, sources: e.sources });
            }
        }
        return out;
    }
    matchEndpointsByPaths(paths, epList) {
        const set = new Set(paths.map((p) => String(p).toLowerCase()));
        const out = [];
        for (const e of epList) {
            if (set.has(String(e?.path ?? '').toLowerCase())) {
                out.push({ path: e.path, verb: e.verb, confidence: e.confidence, sources: e.sources });
            }
        }
        return out;
    }
    matchPages(feature, pages) {
        const tokens = this.featureTokens(feature);
        const fLow = feature.toLowerCase();
        return pages.filter((p) => {
            const lower = p.toLowerCase();
            if (tokens.some((t) => t && lower.includes(t)))
                return true;
            if (feature && lower.includes(fLow))
                return true;
            const base = path.basename(p).toLowerCase();
            const baseNoExt = base.replace(/\.[^.]+$/, '');
            if (baseNoExt.includes(fLow) || fLow.includes(baseNoExt))
                return true;
            return false;
        });
    }
    endpointAction(e) {
        const verb = String(e?.verb || '').toUpperCase();
        const p = String(e?.path || '').toLowerCase();
        if (verb === 'GET' && p.includes('/:id'))
            return 'detail';
        if (verb === 'GET')
            return 'list';
        if (verb === 'POST')
            return 'create';
        if (verb === 'PUT' || verb === 'PATCH')
            return 'update';
        if (verb === 'DELETE')
            return 'delete';
        return 'other';
    }
    epKey(e) {
        return `${String(e?.verb || '').toUpperCase()}|${String(e?.path || '')}`;
    }
    detectUiRegions(html, pageRel) {
        const out = [];
        let doc;
        try {
            const { JSDOM } = require('jsdom');
            const dom = new JSDOM(html);
            doc = dom.window.document;
        }
        catch {
            return out;
        }
        const near = (el) => {
            let t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
            if (t.length >= 2)
                return t;
            let h = el;
            for (let i = 0; i < 5 && h; i++) {
                h = h.previousElementSibling;
                if (h && /^(H1|H2|H3|H4|H5|H6)$/.test(h.tagName)) {
                    const ht = (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
                    if (ht)
                        return ht;
                }
            }
            return t;
        };
        const sel = (el) => {
            const id = el.id ? '#' + el.id : '';
            const cls = el.className && typeof el.className === 'string'
                ? '.' + el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
                : '';
            return el.tagName.toLowerCase() + (id || cls);
        };
        const CREATE_RX = /(新增|新建|创建|添加|add|create|new)/i;
        const DETAIL_RX = /(详情|查看|编辑|修改|detail|edit|view)/i;
        doc.querySelectorAll('table').forEach((el) => {
            out.push({ elementType: 'table', text: near(el), selector: sel(el), hint: '表格(列表区)', page: pageRel });
        });
        doc.querySelectorAll('ul,ol').forEach((el) => {
            if ((el.querySelectorAll('li') || []).length >= 3) {
                out.push({ elementType: 'list', text: near(el), selector: sel(el), hint: '列表', page: pageRel });
            }
        });
        doc.querySelectorAll('button,a,[role="button"],.btn,span.btn,div.btn').forEach((el) => {
            const txt = ((el.textContent || '') +
                ' ' +
                (el.getAttribute('title') || '') +
                ' ' +
                (el.getAttribute('aria-label') || ''))
                .replace(/\s+/g, ' ')
                .trim();
            if (CREATE_RX.test(txt)) {
                out.push({ elementType: 'createButton', text: txt.slice(0, 40), selector: sel(el), hint: '新增/创建按钮', page: pageRel });
            }
            else if (DETAIL_RX.test(txt)) {
                out.push({ elementType: 'detailLink', text: txt.slice(0, 40), selector: sel(el), hint: '详情/编辑入口', page: pageRel });
            }
            else if (el.tagName === 'A') {
                out.push({ elementType: 'link', text: txt.slice(0, 40), selector: sel(el), hint: '链接', page: pageRel });
            }
        });
        doc.querySelectorAll('form').forEach((el) => {
            out.push({ elementType: 'form', text: near(el), selector: sel(el), hint: '表单', page: pageRel });
        });
        return out;
    }
    createPageAccessor(projectRoot, htmlPages) {
        const textCache = new Map();
        const lowerCache = new Map();
        const regionCache = new Map();
        const abs = (rel) => {
            const hit = (htmlPages || []).find((h) => String(h?.path ?? h) === rel);
            return path.join(projectRoot || '', String(hit?.path ?? rel));
        };
        const text = (rel) => {
            let v = textCache.get(rel);
            if (v === undefined) {
                try {
                    v = fs.readFileSync(abs(rel), 'utf8');
                }
                catch {
                    v = '';
                }
                textCache.set(rel, v);
            }
            return v;
        };
        const lower = (rel) => {
            let v = lowerCache.get(rel);
            if (v === undefined) {
                v = text(rel).toLowerCase();
                lowerCache.set(rel, v);
            }
            return v;
        };
        const regions = (rel) => {
            let v = regionCache.get(rel);
            if (v === undefined) {
                const html = text(rel);
                v = html ? this.detectUiRegions(html, rel) : [];
                regionCache.set(rel, v);
            }
            return v;
        };
        return { text, lower, regions };
    }
    async locateEndpointsInPages(endpoints, htmlPages, relatedPages, projectRoot, pages) {
        const result = {};
        for (const e of endpoints)
            result[this.epKey(e)] = [];
        if (!projectRoot ||
            !Array.isArray(htmlPages) ||
            !htmlPages.length ||
            !Array.isArray(relatedPages) ||
            !relatedPages.length) {
            return result;
        }
        const acc = pages ?? this.createPageAccessor(projectRoot, htmlPages);
        const regions = [];
        for (const rp of relatedPages)
            regions.push(...acc.regions(rp));
        for (const e of endpoints) {
            const wanted = ACTION_REGION_MAP[this.endpointAction(e)] || ACTION_REGION_MAP.other;
            result[this.epKey(e)] = regions.filter((r) => wanted.includes(r.elementType));
        }
        return result;
    }
    async enrichEndpointLocationsWithVision(endpoints, shotAbsPaths, cfg) {
        const images = [];
        for (const p of shotAbsPaths.slice(0, 2)) {
            try {
                const b = fs.readFileSync(p);
                images.push('data:image/png;base64,' + b.toString('base64'));
            }
            catch {
            }
        }
        if (!images.length || !endpoints.length)
            return null;
        const actions = [...new Set(endpoints.map((e) => this.endpointAction(e)))].map((a) => ({
            action: a,
            label: ACTION_LABEL[a] || a,
        }));
        const sys = '你是 UI 接口定位助手。给定一张产品原型截图和一组接口操作（list=查询/列表区, create=新增/创建按钮, ' +
            'detail=详情/编辑入口），判断每个操作在截图里对应的 UI 控件，返回其归一化 bounding box（x,y,w,h 均为 0~1，' +
            '以图片左上角为原点）。只输出 JSON：{boxes:[{action:string,x:number,y:number,w:number,h:number}]}。无法定位则忽略该 action。';
        const user = '操作列表：\n' + actions.map((a) => `- ${a.action} (${a.label})`).join('\n');
        const raw = await this.callVisionJson(sys, user, images, cfg).catch(() => null);
        const arr = raw?.boxes;
        if (!Array.isArray(arr))
            return null;
        const out = {};
        for (const b of arr) {
            if (!b || !b.action)
                continue;
            const x = Number(b.x);
            const y = Number(b.y);
            const w = Number(b.w);
            const h = Number(b.h);
            if ([x, y, w, h].some((n) => !isFinite(n) || n < 0 || n > 1))
                continue;
            out[String(b.action)] = {
                action: b.action,
                label: ACTION_LABEL[b.action] || b.action,
                x,
                y,
                w,
                h,
            };
        }
        return Object.keys(out).length ? out : null;
    }
    featureTokens(feature) {
        const ascii = String(feature)
            .split(/[^a-zA-Z0-9]+/)
            .map((s) => s.toLowerCase())
            .filter((s) => s.length >= 2);
        return ascii;
    }
    featureSlug(feature) {
        const parts = String(feature)
            .toLowerCase()
            .split(/[^a-z0-9]+/i)
            .map((s) => s.trim())
            .filter((s) => /^[a-z0-9]+$/i.test(s) && s.length >= 1);
        const slug = parts.join('-');
        return slug || 'resource';
    }
    deriveSuggestedEndpoints(feature, declaredPrefix, aiEnabled) {
        const slug = this.featureSlug(feature);
        const prefix = declaredPrefix && declaredPrefix.trim() ? declaredPrefix.trim() : '/api';
        const aiTag = aiEnabled ? 'AI 已参与命名' : '未配置 AI 模型，按 REST 约定占位';
        const tpls = [
            { verb: 'GET', suffix: '', action: '查询/列表' },
            { verb: 'GET', suffix: '/:id', action: '详情' },
            { verb: 'POST', suffix: '', action: '创建' },
        ];
        return tpls.map((t) => ({
            path: `${prefix}/${slug}${t.suffix}`,
            verb: t.verb,
            confidence: 'candidate',
            sources: ['doc-inferred'],
            inferred: true,
            note: `由功能「${feature}」推导（${t.action}）· ${aiTag}，待人工确认资源名与路径`,
        }));
    }
    shotName(rel) {
        return (String(rel)
            .replace(/\.[^./\\]+$/, '')
            .replace(/[\\/]+/g, '_')
            .replace(/[^\w一-龥.\-]+/g, '_') + '.png');
    }
    shotsDirHasPng(dir) {
        const shotsDir = path.join(dir, 'spec', 'shots');
        if (!fs.existsSync(shotsDir))
            return false;
        try {
            return fs.readdirSync(shotsDir).some((f) => /\.png$/i.test(f));
        }
        catch {
            return false;
        }
    }
    planShotPaths(projectRoot, htmlPages) {
        const map = {};
        if (!projectRoot || !Array.isArray(htmlPages))
            return map;
        for (const p of htmlPages) {
            const rel = String(p?.path ?? p ?? '');
            if (!rel)
                continue;
            if (!fs.existsSync(path.join(projectRoot, rel)))
                continue;
            map[rel] = `spec/shots/${this.shotName(rel)}`;
        }
        return map;
    }
    async waitForPaint(page, budgetLeftMs) {
        const stats = {
            paintReadyMs: 0,
            paintEvaluate1Ms: null,
            paintEvaluate2Ms: null,
        };
        const deadline = Date.now() + Math.max(0, budgetLeftMs);
        const left = () => deadline - Date.now();
        if (budgetLeftMs <= 0)
            return stats;
        const cap = Math.min(SHOT_READY_TIMEOUT_MS, Math.max(1, left()));
        const readyT0 = Date.now();
        await page
            .waitForFunction(() => {
            const rs = document.readyState;
            if (rs !== 'complete' && rs !== 'interactive')
                return false;
            const chartMounts = document.querySelectorAll('[data-chart],[class*="chart"]');
            if (chartMounts.length) {
                let sized = false;
                for (const el of Array.from(chartMounts)) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                        sized = true;
                        break;
                    }
                }
                if (!sized)
                    return false;
                if (!document.querySelector('canvas'))
                    return false;
            }
            return true;
        }, { timeout: cap, polling: 100 })
            .catch(() => {
        });
        stats.paintReadyMs = Date.now() - readyT0;
        const eval1Left = left();
        if (eval1Left <= 0)
            return stats;
        const settleCap = Math.max(100, Math.min(SHOT_SETTLE_TIMEOUT_MS, eval1Left));
        const eval1T0 = Date.now();
        await this.withBudget(page.evaluate((maxMs) => {
            const canvases = Array.from(document.querySelectorAll('canvas'));
            if (!canvases.length)
                return true;
            const sig = () => canvases
                .map((c) => {
                try {
                    return c.toDataURL('image/png').length;
                }
                catch {
                    return -1;
                }
            })
                .join(',');
            return new Promise((resolve) => {
                const start = Date.now();
                let last = sig();
                let same = 0;
                const tick = () => {
                    const cur = sig();
                    if (cur === last)
                        same++;
                    else
                        same = 0;
                    last = cur;
                    if (same >= 3)
                        return resolve(true);
                    if (Date.now() - start >= maxMs)
                        return resolve(false);
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            });
        }, settleCap), Math.min(settleCap, eval1Left), 'paint-evaluate#1').catch(() => {
        });
        stats.paintEvaluate1Ms = Date.now() - eval1T0;
        const eval2Left = left();
        if (eval2Left <= 0)
            return stats;
        const eval2T0 = Date.now();
        await this.withBudget(page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))), eval2Left, 'paint-evaluate#2').catch(() => {
        });
        stats.paintEvaluate2Ms = Date.now() - eval2T0;
        return stats;
    }
    async withBudget(p, ms, label) {
        const guarded = Promise.resolve(p);
        guarded.catch(() => { });
        let timer;
        try {
            return await Promise.race([
                guarded,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`[budget] ${label} 超时（${Math.max(0, Math.round(ms))}ms）`)), Math.max(0, ms));
                }),
            ]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    async closeBrowserSafely(browser) {
        try {
            await Promise.race([
                Promise.resolve(browser.close()).catch(() => { }),
                new Promise((r) => setTimeout(r, SHOT_CLOSE_TIMEOUT_MS)),
            ]);
        }
        catch {
        }
        try {
            const proc = typeof browser.process === 'function' ? browser.process() : null;
            if (proc && proc.exitCode === null && !proc.killed)
                proc.kill('SIGKILL');
        }
        catch {
        }
    }
    async captureShots(dir, projectRoot, htmlPages, opts) {
        const map = {};
        const trace = {
            bounded: false,
            truncatedBy: null,
            paintReadyMs: null,
            paintEvaluate1Ms: null,
            paintEvaluate2Ms: null,
        };
        Object.defineProperty(map, SHOT_BUDGET_TRACE, { value: trace, enumerable: false });
        if (!projectRoot || !Array.isArray(htmlPages) || !htmlPages.length)
            return map;
        const shotsDir = path.join(dir, 'spec', 'shots');
        fs.mkdirSync(shotsDir, { recursive: true });
        let have = 0;
        for (const p of htmlPages) {
            const rel = String(p?.path ?? p);
            const safe = this.shotName(rel);
            if (fs.existsSync(path.join(shotsDir, safe))) {
                map[rel] = `spec/shots/${safe}`;
                have++;
            }
        }
        if (have >= Math.min(htmlPages.length, 12))
            return map;
        const ownDeadline = Date.now() + SHOT_TOTAL_BUDGET_MS;
        const deadline = typeof opts?.deadline === 'number' ? Math.min(ownDeadline, opts.deadline) : ownDeadline;
        trace.bounded = true;
        let browser;
        try {
            const puppeteer = require('puppeteer');
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
                timeout: Math.max(1000, Math.min(SHOT_LAUNCH_TIMEOUT_MS, deadline - Date.now())),
                protocolTimeout: SHOT_GOTO_TIMEOUT_MS + SHOT_SCREENSHOT_TIMEOUT_MS,
            });
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
            const CAP = 12;
            let n = 0;
            for (const p of htmlPages) {
                if (n >= CAP)
                    break;
                const rel = String(p?.path ?? p);
                const safe = this.shotName(rel);
                if (map[rel]) {
                    n++;
                    continue;
                }
                const abs = path.join(projectRoot, rel);
                const out = path.join(shotsDir, safe);
                try {
                    if (!fs.existsSync(abs))
                        continue;
                    const gotoLeft = deadline - Date.now();
                    if (gotoLeft <= 0) {
                        if (!trace.truncatedBy)
                            trace.truncatedBy = 'goto';
                        break;
                    }
                    await this.withBudget(Promise.resolve(page.goto('file://' + abs, {
                        waitUntil: 'load',
                        timeout: Math.max(1000, Math.min(SHOT_GOTO_TIMEOUT_MS, gotoLeft)),
                    })).catch(() => { }), gotoLeft, 'goto').catch(() => {
                        if (!trace.truncatedBy)
                            trace.truncatedBy = 'goto';
                    });
                    const paintLeft = deadline - Date.now();
                    if (paintLeft <= 0) {
                        if (!trace.truncatedBy)
                            trace.truncatedBy = 'waitForPaint';
                        break;
                    }
                    const paint = await this.waitForPaint(page, paintLeft);
                    trace.paintReadyMs = paint.paintReadyMs;
                    trace.paintEvaluate1Ms = paint.paintEvaluate1Ms;
                    trace.paintEvaluate2Ms = paint.paintEvaluate2Ms;
                    const shotLeft = deadline - Date.now();
                    if (shotLeft <= 0) {
                        if (!trace.truncatedBy)
                            trace.truncatedBy = 'screenshot';
                        break;
                    }
                    await this.withBudget(Promise.resolve(page.screenshot({ path: out, fullPage: true })).catch(() => { }), shotLeft, 'screenshot').catch(() => {
                        if (!trace.truncatedBy)
                            trace.truncatedBy = 'screenshot';
                    });
                    if (fs.existsSync(out))
                        map[rel] = `spec/shots/${safe}`;
                }
                catch {
                }
                n++;
            }
        }
        catch (e) {
            this.logger.warn(`原型截图失败（降级为无截图）：${e?.message ?? e}`);
        }
        finally {
            if (browser)
                await this.closeBrowserSafely(browser);
        }
        return map;
    }
    computeCoverage(_feature, points, relatedPages, projectRoot, htmlPages, pages) {
        if (!Array.isArray(points) || !points.length) {
            return { points: [], summary: '该功能无细分功能点', byVision: false };
        }
        const acc = pages ?? this.createPageAccessor(projectRoot, htmlPages);
        const blob = (relatedPages || []).map((rp) => acc.lower(rp)).join('\n');
        const result = points.map((pt) => {
            const tokens = String(pt)
                .toLowerCase()
                .split(/[^一-龥a-z0-9]+/i)
                .filter((t) => t.length >= 2);
            let hits = 0;
            for (const t of tokens)
                if (blob.includes(t))
                    hits++;
            let status = 'partial';
            if (tokens.length === 0)
                status = 'partial';
            else if (hits === 0)
                status = 'missing';
            else if (hits >= Math.ceil(tokens.length / 2))
                status = 'covered';
            return { text: pt, status };
        });
        const covered = result.filter((r) => r.status === 'covered').length;
        const missing = result.filter((r) => r.status === 'missing').length;
        return {
            points: result,
            summary: missing > 0
                ? `${covered}/${result.length} 功能点命中原型，${missing} 个疑似缺失`
                : `${covered}/${result.length} 功能点命中原型`,
            byVision: false,
        };
    }
    async resolveTextConfigSafe(userId) {
        try {
            const merged = await this.aiConfig.getMergedAiConfig(userId);
            const mode = merged?.modelMode === 'unified' ? 'unified' : 'text';
            const model = merged?.[`${mode}Model`] || merged?.unifiedModel || merged?.textModel;
            const apiKey = merged?.[`${mode}ApiKey`] || merged?.unifiedApiKey || merged?.textApiKey;
            const baseURL = merged?.[`${mode}BaseURL`] || merged?.unifiedBaseURL || merged?.textBaseURL;
            const providerType = merged?.[`${mode}ProviderType`] || merged?.unifiedProviderType || undefined;
            if (!model || !apiKey)
                return null;
            return {
                model: String(model),
                apiKey: String(apiKey),
                baseURL: baseURL ? String(baseURL) : '',
                providerType: providerType ? String(providerType) : undefined,
            };
        }
        catch {
            return null;
        }
    }
    async resolveVisionConfigSafe(userId) {
        try {
            const merged = await this.aiConfig.getMergedAiConfig(userId);
            const mode = merged?.modelMode === 'unified' ? 'unified' : 'text';
            const model = merged?.visionModel ||
                merged?.[`${mode}Model`] ||
                merged?.unifiedModel ||
                merged?.textModel;
            const apiKey = merged?.visionApiKey ||
                merged?.[`${mode}ApiKey`] ||
                merged?.unifiedApiKey ||
                merged?.textApiKey;
            const baseURL = merged?.visionBaseURL ||
                merged?.[`${mode}BaseURL`] ||
                merged?.unifiedBaseURL ||
                merged?.textBaseURL;
            const providerType = merged?.visionProviderType || merged?.[`${mode}ProviderType`] || undefined;
            if (!model || !apiKey)
                return null;
            return {
                model: String(model),
                apiKey: String(apiKey),
                baseURL: baseURL ? String(baseURL) : '',
                providerType: providerType ? String(providerType) : undefined,
            };
        }
        catch {
            return null;
        }
    }
    async callVisionJson(system, textPrompt, imageDataUrls, cfg) {
        const base = (cfg.baseURL || '').replace(/\/+$/, '');
        const url = `${base}/chat/completions`;
        if (!/^https?:\/\//.test(url))
            throw new Error('baseURL 无效，无法调用视觉模型');
        const content = [{ type: 'text', text: textPrompt }];
        for (const d of imageDataUrls.slice(0, 4)) {
            content.push({ type: 'image_url', image_url: { url: d } });
        }
        const body = {
            model: cfg.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content },
            ],
            temperature: 0.2,
            stream: false,
        };
        const attempt = async () => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 60_000);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${cfg.apiKey}`,
                    },
                    body: JSON.stringify(body),
                    signal: ctrl.signal,
                });
                if (!res.ok)
                    throw new Error(`Vision HTTP ${res.status}`);
                const j = (await res.json());
                const c = j?.choices?.[0]?.message?.content ?? '';
                return this.extractJson(c);
            }
            finally {
                clearTimeout(timer);
            }
        };
        try {
            return await attempt();
        }
        catch (e) {
            return await attempt();
        }
    }
    async enrichCoverageWithVision(feature, points, shotAbsPaths, cfg) {
        const images = [];
        for (const p of shotAbsPaths.slice(0, 3)) {
            try {
                const b = fs.readFileSync(p);
                images.push('data:image/png;base64,' + b.toString('base64'));
            }
            catch {
            }
        }
        if (!images.length || !points.length)
            return null;
        const sys = '你是 UI 覆盖审查助手。给定一张产品原型截图和该功能的功能点列表，判断每个功能点是否在截图中' +
            '可见/被实现。只输出 JSON：{verdicts:[{point:string,status:"covered"|"partial"|"missing",reason:string}]}。' +
            'covered=清晰可见已实现；partial=部分/疑似；missing=未发现。';
        const user = `功能：${feature}\n功能点：\n` + points.map((p, i) => `${i + 1}. ${p}`).join('\n');
        const raw = await this.callVisionJson(sys, user, images, cfg).catch(() => null);
        const arr = raw?.verdicts;
        if (!Array.isArray(arr))
            return null;
        const map = {};
        for (const v of arr) {
            if (v && v.point)
                map[String(v.point)] = v;
        }
        const out = points
            .map((pt) => {
            const m = map[String(pt)];
            if (!m)
                return null;
            const st = m.status === 'covered' || m.status === 'partial' || m.status === 'missing'
                ? m.status
                : 'partial';
            return { text: pt, status: st, reason: m.reason || '' };
        })
            .filter((x) => Boolean(x));
        return out.length ? out : null;
    }
    async enrichFeaturesWithLLM(features, epList, pages, cfg) {
        const sys = '你是接口与页面需求分析助手。根据项目的功能模块列表、已扫描到的接口、原型页面，' +
            '为每个功能模块推断：功能简介、相关接口（在给定接口里挑）、建议新增接口（若文档只讲了功能没给路径）、' +
            '相关页面、页面开发需求简介。只输出 JSON，键为功能名，值为对象：' +
            '{description:string, relatedEndpointPaths:string[], ' +
            'suggestedEndpoints:[{path:string,verb:string,note:string}], ' +
            'relatedPagePaths:string[], pageDevNote:string}。path 用 REST 风格（如 /api/xxx），' +
            'verb 取 GET/POST/PUT/DELETE。未扫描到接口时 relatedEndpointPaths 可为空。';
        const user = JSON.stringify({
            features,
            endpoints: epList.map((e) => ({ path: e.path, verb: e.verb })),
            pages,
        });
        const raw = await this.callChatJson(sys, user, cfg);
        return raw && typeof raw === 'object' ? raw : {};
    }
    async callChatJson(system, user, cfg) {
        const base = (cfg.baseURL || '').replace(/\/+$/, '');
        const url = `${base}/chat/completions`;
        if (!/^https?:\/\//.test(url))
            throw new Error('baseURL 无效，无法调用 LLM');
        const body = {
            model: cfg.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            temperature: 0.2,
            stream: false,
        };
        const attempt = async () => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 60_000);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${cfg.apiKey}`,
                    },
                    body: JSON.stringify(body),
                    signal: ctrl.signal,
                });
                if (!res.ok)
                    throw new Error(`LLM HTTP ${res.status}`);
                const j = (await res.json());
                const content = j?.choices?.[0]?.message?.content ?? '';
                return this.extractJson(content);
            }
            finally {
                clearTimeout(timer);
            }
        };
        try {
            return await attempt();
        }
        catch (e) {
            return await attempt();
        }
    }
    extractJson(s) {
        if (!s)
            return null;
        let t = s.trim();
        const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence)
            t = fence[1].trim();
        const a = t.indexOf('{');
        const b = t.lastIndexOf('}');
        if (a >= 0 && b > a)
            t = t.slice(a, b + 1);
        return JSON.parse(t);
    }
    async getUnits(runId, userId, opts) {
        const dir = this.resolveRunDir(runId, userId);
        if (opts?.refresh !== true) {
            const cached = this.readUnits(dir, runId);
            if (cached && this.unitsCacheMatchesInput(cached, dir)) {
                this.logger.log(`[units] ${JSON.stringify({
                    runId,
                    mode: 'cache',
                    units: cached.units.length,
                    degraded: cached.degraded?.code ?? null,
                    persisted: false,
                })}`);
                return { ...cached, cached: true };
            }
            if (cached) {
                const s0 = this.readManifest(dir)?.S0 ?? null;
                this.logger.log(`[units] ${JSON.stringify({
                    runId,
                    mode: 'stale',
                    reason: 'input-changed',
                    cachedFigmaUrl: cached.source?.figmaUrl ?? null,
                    expectedKey: this.computeUnitInputKey((0, figma_unit_splitter_1.readProjectFigmaUrl)(s0), this.htmlPageRels(s0)),
                    cachedKey: cached.source?.inputKey ?? null,
                })}`);
            }
        }
        return { ...(await this.buildUnits(runId, dir, userId)), cached: false };
    }
    readUnits(dir, runId) {
        let raw = null;
        try {
            raw = JSON.parse(fs.readFileSync(path.join(dir, 'spec', 'components.json'), 'utf8'));
        }
        catch {
            return null;
        }
        if (raw?.version !== unit_contract_1.UNIT_CONTRACT_VERSION)
            return null;
        if (raw.runId !== runId) {
            this.logger.warn(`components.json 的 runId=${raw.runId} 与目录 ${runId} 不一致，按无缓存重算`);
            return null;
        }
        const errs = (0, unit_contract_1.validateUnitContract)(raw);
        if (errs.length) {
            this.logger.warn(`components.json 形状不合格，按无缓存重算：${errs.slice(0, 3).join('；')}`);
            return null;
        }
        if (raw.degraded && !(0, unit_contract_1.isCacheableDegraded)(raw.degraded.code))
            return null;
        return raw;
    }
    readManifest(dir) {
        try {
            return JSON.parse(fs.readFileSync(path.join(dir, 'spec', 'project.manifest.json'), 'utf8'));
        }
        catch {
            return null;
        }
    }
    htmlPageRels(s0) {
        const pages = s0?.html?.pages;
        if (!Array.isArray(pages))
            return [];
        const rels = pages
            .map((pg) => String((pg && typeof pg === 'object' ? pg.path : pg) ?? '').trim())
            .filter(Boolean);
        return [...new Set(rels)].sort();
    }
    computeUnitInputKey(figmaUrl, pageRels) {
        if (figmaUrl)
            return (0, unit_contract_1.unitInputKeyFigma)(figmaUrl);
        if (pageRels.length)
            return (0, unit_contract_1.unitInputKeyHtml)(pageRels);
        return unit_contract_1.UNIT_INPUT_KEY_NONE;
    }
    unitsCacheMatchesInput(cached, dir) {
        const s0 = this.readManifest(dir)?.S0 ?? null;
        const key = this.computeUnitInputKey((0, figma_unit_splitter_1.readProjectFigmaUrl)(s0), this.htmlPageRels(s0));
        return key === cached.source?.inputKey;
    }
    async buildUnits(runId, dir, userId) {
        const t0 = Date.now();
        const readJson = (rel) => {
            try {
                return JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
            }
            catch {
                return null;
            }
        };
        const manifest = readJson('spec/project.manifest.json');
        const s0 = manifest?.S0 ?? null;
        const figmaUrl = (0, figma_unit_splitter_1.readProjectFigmaUrl)(s0);
        const features = this.readUnitFeatures(dir, s0, manifest?.S1 ?? null);
        const token = await this.resolveFigmaTokenSafe(userId);
        const htmlPageRels = this.htmlPageRels(s0);
        const inputKey = this.computeUnitInputKey(figmaUrl, htmlPageRels);
        const branch = figmaUrl ? 'figma' : htmlPageRels.length ? 'html' : 'none';
        this.logger.log(`[units] ${JSON.stringify({
            runId,
            mode: 'dispatch',
            branch,
            figmaUrl: figmaUrl ?? null,
            htmlPages: htmlPageRels.length,
        })}`);
        const contract = branch === 'html'
            ? (0, html_unit_splitter_1.splitHtmlUnits)({
                runId,
                inputKey,
                pages: htmlPageRels,
                features,
                onLog: (payload) => this.logger.log(`[units] ${JSON.stringify(payload)}`),
            })
            : await (0, figma_unit_splitter_1.splitFigmaUnits)({
                runId,
                inputKey,
                figmaUrl,
                figmaUrlAbsenceNote: (0, figma_unit_splitter_1.figmaLinkAbsenceNote)(s0),
                features,
                tokenAvailable: !!token,
                onLog: (payload) => this.logger.log(`[units] ${JSON.stringify(payload)}`),
            }, {
                getNode: (fileKey, nodeId) => {
                    try {
                        return new figma_client_js_1.FigmaClient({ token: token }).getNode(fileKey, nodeId);
                    }
                    catch (e) {
                        return Promise.reject(e);
                    }
                },
            });
        const errs = (0, unit_contract_1.validateUnitContract)(contract);
        const cacheable = !contract.degraded || (0, unit_contract_1.isCacheableDegraded)(contract.degraded.code);
        let persisted = false;
        if (errs.length) {
            this.logger.error(`[units] 契约形状自检未通过，不落盘：${errs.slice(0, 3).join('；')}`);
        }
        else if (!cacheable) {
            this.logger.warn(`[units] 偶发降级 ${contract.degraded?.code} 不落盘（persisted:false），下次请求会重试`);
        }
        else {
            try {
                const file = path.join(dir, 'spec', 'components.json');
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, JSON.stringify(contract, null, 2) + '\n');
                persisted = true;
            }
            catch (e) {
                this.logger.warn(`components.json 落盘失败（不影响本次返回，persisted:false）：${e?.message ?? e}`);
            }
        }
        this.logger.log(`[units] ${JSON.stringify({
            runId,
            mode: 'summary',
            elapsedMs: Date.now() - t0,
            units: contract.units.length,
            degraded: contract.degraded?.code ?? null,
            persisted,
        })}`);
        return { ...contract, ...(errs.length ? { validationErrors: errs } : {}) };
    }
    readUnitFeatures(dir, s0, s1) {
        try {
            const cached = JSON.parse(fs.readFileSync(path.join(dir, 'spec', 'feature-details.json'), 'utf8'));
            if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
                const keys = Object.keys(cached);
                if (keys.length)
                    return keys;
            }
        }
        catch {
        }
        try {
            return this.extractFeatures(s1, s0).features ?? [];
        }
        catch {
            return [];
        }
    }
    async resolveFigmaTokenSafe(userId) {
        let cfgToken = null;
        try {
            const merged = await this.aiConfig.getMergedAiConfig(userId);
            cfgToken = merged?.figmaToken;
        }
        catch {
        }
        const token = cfgToken || process.env.FIGMA_ACCESS_TOKEN;
        return typeof token === 'string' && token.trim() ? token.trim() : null;
    }
    parseConflictsMd(md) {
        const gaps = [];
        const conflicts = [];
        for (const line of md.split('\n')) {
            const g = /^###\s+(GAP-[A-Z0-9-]+)\s*（(blocker|major|warn|info)）\s*(.*)$/.exec(line);
            if (g) {
                gaps.push({ id: g[1], severity: g[2], title: (g[3] || '').trim() });
                continue;
            }
            const c = /^###\s+(\d+)\.\s+(.*?)\s*`(CF-[A-Z0-9-]+)`\s*$/.exec(line);
            if (c) {
                conflicts.push({ index: Number(c[1]), id: c[3], title: c[2].trim() });
                continue;
            }
            const c2 = /^###\s+(\d+)\.\s+(.*)$/.exec(line);
            if (c2) {
                conflicts.push({ index: Number(c2[1]), id: '', title: c2[2].trim() });
            }
        }
        return { gaps, conflicts };
    }
    saveDecisions(runId, entries, userId) {
        const dir = this.resolveRunDir(runId, userId);
        if (!Array.isArray(entries) || !entries.length) {
            throw new common_1.BadRequestException('entries 不能为空');
        }
        for (const e of entries) {
            if (!e || !/^[A-Z0-9-]{3,64}$/.test(String(e.conflictId ?? ''))) {
                throw new common_1.BadRequestException(`非法 conflictId：${JSON.stringify(e?.conflictId)}`);
            }
            if (!String(e.choice ?? '').trim()) {
                throw new common_1.BadRequestException(`冲突 ${e.conflictId} 缺少 choice`);
            }
        }
        const file = path.join(dir, 'spec', 'decisions.md');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, [
                '# S2 人裁决留痕（decisions.md）',
                '',
                '> 本文件由**人**产生：`s0-scan.cjs` 只读它的存在性，`s2-contract-freezer` 只做交叉引用，',
                '> 二者都不生成、不覆盖。追加式记录 —— 同一冲突多次裁决时**最后一条生效**，',
                '> 历史保留（推翻也要留痕）。',
                '',
            ].join('\n'));
        }
        const block = ['', '## ' + now + ' · runId `' + runId + '`', ''];
        for (const e of entries) {
            block.push(`- \`${String(e.conflictId).trim()}\` → **${String(e.choice).trim()}**`);
            const note = String(e.note ?? '').trim();
            if (note)
                for (const l of note.split('\n'))
                    block.push('  > ' + l);
        }
        fs.appendFileSync(file, block.join('\n') + '\n');
        const decisions = this.readDecisions(runId);
        this.logger.log(`[S2] decisions 追加 ${entries.length} 条 → runId=${runId} 共 ${decisions.length} 条`);
        return {
            saved: entries.length,
            decisions,
            bytes: fs.statSync(file).size,
            path: file,
        };
    }
    readDecisions(runId) {
        this.assertRunId(runId);
        const file = path.join(RUNS_ROOT, runId, 'spec', 'decisions.md');
        let text = '';
        try {
            text = fs.readFileSync(file, 'utf8');
        }
        catch {
            return [];
        }
        const out = new Map();
        let sectionAt = null;
        for (const line of text.split('\n')) {
            const h = /^##\s+(\S+)\s+·\s+runId/.exec(line);
            if (h) {
                sectionAt = h[1];
                continue;
            }
            const m = /^-\s+`([A-Z0-9-]+)`\s+→\s+\*\*(.+?)\*\*\s*$/.exec(line);
            if (m) {
                out.set(m[1], { conflictId: m[1], choice: m[2], decidedAt: sectionAt ?? undefined });
            }
        }
        return [...out.values()];
    }
    async freeze(runId, userId) {
        const dir = this.resolveRunDir(runId, userId);
        const manifestPath = path.join(dir, 'spec', 'project.manifest.json');
        const endpointsPath = path.join(dir, 'spec', 'endpoints.json');
        const draftPath = path.join(dir, 'doc', 'REQUIREMENTS.draft.md');
        const required = [
            [manifestPath, 'project.manifest.json'],
            [endpointsPath, 'endpoints.json'],
            [draftPath, 'REQUIREMENTS.draft.md'],
        ];
        for (const [p, label] of required) {
            if (!fs.existsSync(p)) {
                throw new common_1.BadRequestException(`缺少 S0 产物 ${label}，请先跑 S0 扫描`);
            }
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const endpointsJson = JSON.parse(fs.readFileSync(endpointsPath, 'utf8'));
        const draft = fs.readFileSync(draftPath, 'utf8');
        const conflictsMd = (() => {
            try {
                return fs.readFileSync(path.join(dir, 'spec', 'conflicts.md'), 'utf8');
            }
            catch {
                return '';
            }
        })();
        const parsed = this.parseConflictsMd(conflictsMd);
        const decisions = this.readDecisions(runId);
        const frozenAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        const decidedIds = new Set(decisions.map((d) => d.conflictId));
        const pendingConflicts = parsed.conflicts
            .filter((c) => c.id && !decidedIds.has(c.id))
            .map((c) => ({ id: c.id, title: c.title }));
        const pendingGaps = parsed.gaps
            .filter((g) => !decidedIds.has(g.id))
            .map((g) => ({ id: g.id, severity: g.severity, title: g.title }));
        const pendingBlockers = pendingGaps.filter((g) => g.severity === 'blocker');
        const openapi = (0, s2_contract_freezer_1.buildOpenApi)({
            runId,
            projectRoot: manifest.projectRoot ?? '',
            envelope: manifest?.S1?.envelope,
            endpoints: endpointsJson.endpoints ?? [],
            declaredPrefix: endpointsJson.declaredPrefix ?? null,
            decisions,
            pendingConflictIds: pendingConflicts.map((c) => c.id),
            blockerGapIds: pendingBlockers.map((g) => g.id),
            frozenAt,
        });
        const specDir = path.join(dir, 'spec');
        const docDir = path.join(dir, 'doc');
        fs.mkdirSync(specDir, { recursive: true });
        fs.mkdirSync(docDir, { recursive: true });
        fs.writeFileSync(path.join(specDir, 'openapi.local.yaml'), openapi.yaml);
        const digests = {};
        for (const rel of [
            'spec/project.manifest.json',
            'spec/endpoints.json',
            'spec/conflicts.md',
            'doc/REQUIREMENTS.draft.md',
            'spec/openapi.local.yaml',
        ]) {
            const full = path.join(dir, rel);
            if (!fs.existsSync(full))
                continue;
            digests[rel] = crypto
                .createHash('sha256')
                .update(fs.readFileSync(full))
                .digest('hex')
                .slice(0, 16);
        }
        const requirementsMd = (0, s2_contract_freezer_1.freezeRequirements)({
            draft,
            runId,
            frozenAt,
            openapiStats: openapi.stats,
            decisions,
            pendingConflicts,
            blockerGaps: pendingBlockers,
            artifactDigests: digests,
        });
        fs.writeFileSync(path.join(docDir, 'REQUIREMENTS.md'), requirementsMd);
        const uniquePaths = new Set((endpointsJson.endpoints ?? []).map((e) => e.path));
        const checks = [
            {
                id: 'path-count-matches-endpoints',
                ok: openapi.stats.pathCount === uniquePaths.size,
                detail: `契约 ${openapi.stats.pathCount} 个 path = endpoints.json 去重后 ${uniquePaths.size} 条`,
            },
            {
                id: 'no-skipped-operations',
                ok: openapi.stats.skipped === 0,
                detail: `skipped=${openapi.stats.skipped}（path 为空的端点会被跳过，正常应为 0）`,
            },
            {
                id: 'verb-defaulting-flagged',
                ok: openapi.stats.verbDefaulted === 0 || openapi.yaml.includes('x-mvgo-verb-inferred: true'),
                detail: `verbDefaulted=${openapi.stats.verbDefaulted}；` +
                    (openapi.stats.verbDefaulted === 0
                        ? '无占位方法，本条无适用对象'
                        : '契约内必须出现 x-mvgo-verb-inferred: true'),
            },
            {
                id: 'envelope-honestly-flagged',
                ok: openapi.yaml.includes('x-mvgo-envelope-confirmed: ' + String(openapi.stats.envelopeConfirmed)),
                detail: `envelope.confirmed=${openapi.stats.envelopeConfirmed}，契约内标记必须与之一致`,
            },
            {
                id: 'decisions-cross-referenced',
                ok: decisions.length === 0 ||
                    (openapi.yaml.includes('x-mvgo-decisions:') &&
                        requirementsMd.includes('### Z.2 已裁决交叉引用')),
                detail: `已裁决 ${decisions.length} 条；契约与需求源都必须有交叉引用段`,
            },
            {
                id: 'no-truth-duplication',
                ok: !/^\|.*\bCF-[A-Z0-9-]+\b.*\|$/m.test(requirementsMd) || requirementsMd.includes('唯一真值是 `spec/decisions.md`'),
                detail: '需求源里的裁决表只能是索引，且必须声明唯一真值在 decisions.md',
            },
        ];
        const report = {
            runId,
            frozenAt,
            projectRoot: manifest.projectRoot ?? null,
            generator: 's2-contract-freezer.ts',
            openapi: {
                pathCount: openapi.stats.pathCount,
                operationCount: openapi.stats.operationCount,
                verbDeclared: openapi.stats.verbDeclared,
                verbDefaulted: openapi.stats.verbDefaulted,
                skipped: openapi.stats.skipped,
                byConfidence: openapi.stats.byConfidence,
                sha256: openapi.stats.sha256,
                bytes: openapi.stats.bytes,
            },
            envelope: {
                source: openapi.stats.envelopeSource,
                confirmed: openapi.stats.envelopeConfirmed,
                keys: Array.isArray(manifest?.S1?.envelope?.keys) ? manifest.S1.envelope.keys : [],
                successCode: manifest?.S1?.envelope?.successCode ?? null,
            },
            decisions: { total: decisions.length, ids: decisions.map((d) => d.conflictId) },
            pending: { conflicts: pendingConflicts, gaps: pendingGaps },
            digests,
            checks,
            allChecksOk: checks.every((c) => c.ok),
        };
        fs.writeFileSync(path.join(specDir, 'freeze-report.json'), JSON.stringify(report, null, 2) + '\n');
        this.logger.log(`[S2] 冻结完成 runId=${runId} path=${report.openapi.pathCount} ` +
            `verbDefaulted=${report.openapi.verbDefaulted} decisions=${decisions.length} ` +
            `allChecksOk=${report.allChecksOk}`);
        return { ...report, artifacts: (await this.inspectRun(runId, userId)).artifacts };
    }
    async generate(runId, userId) {
        const dir = this.resolveRunDir(runId, userId);
        const yamlPath = path.join(dir, 'spec', 'openapi.local.yaml');
        if (!fs.existsSync(yamlPath)) {
            throw new common_1.BadRequestException('尚未冻结契约，请先跑 S2 冻结（spec/openapi.local.yaml 不存在）');
        }
        const yamlText = fs.readFileSync(yamlPath, 'utf8');
        let contract;
        try {
            contract = yaml.load(yamlText);
        }
        catch (e) {
            throw new common_1.BadRequestException(`契约解析失败：${e.message}`);
        }
        if (!contract || typeof contract !== 'object' || !contract.paths) {
            throw new common_1.BadRequestException('契约内容异常：缺少 paths');
        }
        const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        const result = (0, s3_codegen_1.buildCodeGen)(contract, {
            runId,
            projectRoot: contract?.['x-mvgo-freeze']?.projectRoot ?? undefined,
            generatedAt,
        });
        const genDir = path.join(dir, 'generated');
        fs.mkdirSync(genDir, { recursive: true });
        for (const f of result.files) {
            const full = path.join(genDir, f.rel);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, f.content);
        }
        this.logger.log(`[S3] 代码生成完成 runId=${runId} backendControllers=${result.summary.backendControllers} ` +
            `frontendApis=${result.summary.frontendApis} files=${result.files.length}`);
        return {
            generatedAt,
            runId,
            summary: result.summary,
            notes: result.notes,
            files: {
                backend: result.files.filter((f) => f.rel.startsWith('backend/')).map((f) => f.rel),
                frontend: result.files.filter((f) => f.rel.startsWith('frontend/')).map((f) => f.rel),
                meta: result.files
                    .filter((f) => f.rel === 'manifest.json' || f.rel === 'README.md')
                    .map((f) => f.rel),
            },
            artifacts: (await this.inspectRun(runId, userId)).artifacts,
        };
    }
    async generateVue(runId, userId) {
        const dir = this.resolveRunDir(runId, userId);
        const yamlPath = path.join(dir, 'spec', 'openapi.local.yaml');
        if (!fs.existsSync(yamlPath)) {
            throw new common_1.BadRequestException('尚未冻结契约，请先跑 S2 冻结（spec/openapi.local.yaml 不存在）');
        }
        const contract = yaml.load(fs.readFileSync(yamlPath, 'utf8')) || {};
        const projectRoot = contract?.['x-mvgo-freeze']?.projectRoot ?? undefined;
        if (!projectRoot) {
            throw new common_1.BadRequestException('冻结契约缺少 projectRoot，无法定位原型工程根目录');
        }
        const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        const genDir = path.join(dir, 'generated');
        const bindingPath = path.join(dir, 'binding.json');
        let binding;
        if (fs.existsSync(bindingPath)) {
            try {
                const raw = fs.readFileSync(bindingPath, 'utf8');
                binding = raw.trim() ? JSON.parse(raw) : undefined;
            }
            catch {
                binding = undefined;
            }
        }
        const embedsPath = path.join(dir, 'embeds.json');
        let embeds;
        if (fs.existsSync(embedsPath)) {
            try {
                const raw = fs.readFileSync(embedsPath, 'utf8');
                const parsed = raw.trim() ? JSON.parse(raw) : [];
                embeds = Array.isArray(parsed) ? parsed : parsed.embeds || [];
            }
            catch {
                embeds = undefined;
            }
        }
        const result = (0, s4_vuegen_1.buildVueGen)({ runId, projectRoot, generatedAt, generatedRoot: genDir, binding, embeds });
        const written = [];
        if (result.files.length) {
            for (const f of result.files) {
                const full = path.join(genDir, f.rel);
                fs.mkdirSync(path.dirname(full), { recursive: true });
                fs.writeFileSync(full, f.content);
                written.push(f.rel);
            }
        }
        const builtFiles = {};
        for (const f of result.files)
            builtFiles[f.rel] = f.content;
        const gate = (0, s4_vuegen_1.verifyVueGen)(result, builtFiles);
        this.logger.log(`[S4] 真·Vue 页面生成完成 runId=${runId} projectRoot=${projectRoot} ` +
            `pages=${result.extracts.length} files=${result.files.length} ` +
            `gatePass=${gate.pass}`);
        return {
            generatedAt,
            runId,
            projectRoot,
            summary: {
                pages: result.extracts.length,
                files: result.files.length,
                components: result.files.filter((f) => f.rel.includes('/components/')).length,
            },
            gate: { pass: gate.pass, missingText: gate.missingText, missingHeadings: gate.missingHeadings },
            notes: result.notes,
            files: written,
            artifacts: (await this.inspectRun(runId, userId)).artifacts,
        };
    }
    getBinding(runId, userId) {
        const dir = this.resolveRunDir(runId, userId);
        const bindingPath = path.join(dir, 'binding.json');
        let binding;
        if (fs.existsSync(bindingPath)) {
            try {
                const raw = fs.readFileSync(bindingPath, 'utf8');
                binding = raw.trim() ? JSON.parse(raw) : null;
            }
            catch {
                binding = null;
            }
        }
        const genDir = path.join(dir, 'generated');
        const apiTags = this.readApiExports(genDir);
        let dataRefs = [];
        const metaPath = path.join(genDir, 'frontend', 's4-meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                dataRefs = (meta.views && meta.views[0] && meta.views[0].dataRefs) || [];
            }
            catch {
                dataRefs = [];
            }
        }
        return { success: true, runId, binding, apiTags, dataRefs };
    }
    setBinding(runId, dto, userId) {
        const dir = this.resolveRunDir(runId, userId);
        if (!dto || !dto.tag || !dto.fn || !dto.target) {
            throw new common_1.BadRequestException('绑定缺少必要字段：tag / fn / target');
        }
        const genDir = path.join(dir, 'generated');
        const apiTags = this.readApiExports(genDir);
        const matched = apiTags.find((t) => t.tag === dto.tag);
        if (!matched) {
            throw new common_1.BadRequestException(`绑定 tag 不存在于已生成 api 模块：${dto.tag}`);
        }
        if (!matched.functions.includes(dto.fn)) {
            throw new common_1.BadRequestException(`绑定 fn 不在该 tag 的导出函数中：${dto.tag}.${dto.fn}`);
        }
        let dataRefs = [];
        const metaPath = path.join(genDir, 'frontend', 's4-meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                for (const v of meta.views || [])
                    dataRefs.push(...(v.dataRefs || []));
            }
            catch {
            }
        }
        if (!dataRefs.includes(dto.target)) {
            throw new common_1.BadRequestException(`绑定 target 不是任何视图的数据槽：${dto.target}`);
        }
        const binding = {
            tag: dto.tag,
            fn: dto.fn,
            params: dto.params || {},
            target: dto.target,
        };
        fs.writeFileSync(path.join(dir, 'binding.json'), JSON.stringify(binding, null, 2) + '\n', 'utf-8');
        this.logger.log(`[S4] 写入接口绑定侧车 runId=${runId} ${dto.tag}.${dto.fn} → ${dto.target}`);
        return { success: true, runId, binding };
    }
    getEmbeds(runId, userId) {
        const dir = this.resolveRunDir(runId, userId);
        const embedsPath = path.join(dir, 'embeds.json');
        let embeds = [];
        if (fs.existsSync(embedsPath)) {
            try {
                const raw = fs.readFileSync(embedsPath, 'utf8');
                const parsed = raw.trim() ? JSON.parse(raw) : [];
                embeds = Array.isArray(parsed) ? parsed : parsed.embeds || [];
            }
            catch {
                embeds = [];
            }
        }
        const genDir = path.join(dir, 'generated');
        let views = [];
        const metaPath = path.join(genDir, 'frontend', 's4-meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                views = meta.views || [];
            }
            catch {
                views = [];
            }
        }
        return { success: true, runId, embeds, views };
    }
    setEmbeds(runId, dto, userId) {
        const dir = this.resolveRunDir(runId, userId);
        const incoming = Array.isArray(dto?.embeds) ? dto.embeds : [];
        const genDir = path.join(dir, 'generated');
        let views = [];
        const blocksByView = {};
        const metaPath = path.join(genDir, 'frontend', 's4-meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                for (const v of meta.views || []) {
                    views.push(v.viewName);
                    blocksByView[v.viewName] = Array.isArray(v.blocks) ? v.blocks.length : 0;
                }
            }
            catch {
            }
        }
        const cleaned = [];
        for (const e of incoming) {
            if (!e || !e.componentId || !e.view) {
                throw new common_1.BadRequestException('嵌入项缺少必要字段：componentId / view');
            }
            if (views.length && !views.includes(e.view)) {
                throw new common_1.BadRequestException(`嵌入项的 view 不在已生成视图中：${e.view}`);
            }
            if (typeof e.pos === 'number') {
                const count = blocksByView[e.view];
                if (count !== undefined && (e.pos < 0 || e.pos > count)) {
                    throw new common_1.BadRequestException(`嵌入项的 pos 越界（view=${e.view} 区块数=${count}）：${e.pos}`);
                }
            }
            cleaned.push({
                view: String(e.view),
                componentId: String(e.componentId),
                groupId: e.groupId ? String(e.groupId) : undefined,
                slotKey: e.slotKey ? String(e.slotKey) : `embed-${cleaned.length + 1}`,
                pos: typeof e.pos === 'number' && Number.isFinite(e.pos) ? e.pos : undefined,
            });
        }
        fs.writeFileSync(path.join(dir, 'embeds.json'), JSON.stringify(cleaned, null, 2) + '\n', 'utf-8');
        this.logger.log(`[S4] 写入组件嵌入侧车 runId=${runId} count=${cleaned.length}`);
        return { success: true, runId, embeds: cleaned };
    }
    readApiExports(genDir) {
        return (0, s4_vuegen_1.readApiModules)(genDir).map((m) => ({
            tag: m.tag,
            functions: m.functions.map((f) => f.name),
        }));
    }
    async generateZip(runId, userId) {
        const dir = this.resolveRunDir(runId, userId);
        const genDir = path.join(dir, 'generated');
        if (!fs.existsSync(genDir)) {
            throw new common_1.BadRequestException('尚未生成代码（generated/ 不存在），请先跑 S3 生成');
        }
        const buffer = await this.zipDirectory(genDir);
        return { buffer, filename: `generated-${runId}.zip` };
    }
    zipDirectory(dir) {
        const { PassThrough } = require('stream');
        return new Promise((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const chunks = [];
            const pt = new PassThrough();
            archive.on('error', reject);
            archive.on('warning', (e) => {
                if (e.code !== 'ENOENT')
                    reject(e);
            });
            archive.pipe(pt);
            pt.on('data', (c) => chunks.push(c));
            pt.on('end', () => resolve(Buffer.concat(chunks)));
            archive.directory(dir, 'generated');
            archive.finalize();
        });
    }
    async ensureShot(runId, rel) {
        const dir = path.join(RUNS_ROOT, runId);
        const full = path.join(dir, rel);
        if (fs.existsSync(full))
            return true;
        const safe = rel.slice('spec/shots/'.length);
        const key = `${runId}/${safe}`;
        const running = this.shotInflight.get(key);
        if (running)
            return running;
        const task = (async () => {
            try {
                let manifest = null;
                try {
                    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'spec', 'project.manifest.json'), 'utf8'));
                }
                catch {
                    return false;
                }
                const projectRoot = manifest?.projectRoot ?? null;
                const pages = Array.isArray(manifest?.S0?.html?.pages)
                    ? manifest.S0.html.pages
                    : [];
                if (!projectRoot || !pages.length)
                    return false;
                const hit = pages.find((p) => this.shotName(String(p?.path ?? p)) === safe);
                if (!hit)
                    return false;
                const pageRel = String(hit?.path ?? hit);
                const map = await this.captureShots(dir, projectRoot, [{ path: pageRel }]);
                return Boolean(map[pageRel]) && fs.existsSync(full);
            }
            catch {
                return false;
            }
        })();
        this.shotInflight.set(key, task);
        try {
            return await task;
        }
        finally {
            this.shotInflight.delete(key);
        }
    }
    async readArtifact(runId, name, userId) {
        this.resolveRunDir(runId, userId);
        const rel = String(name ?? '').replace(/^\/+/, '');
        if (rel.includes('..')) {
            throw new common_1.BadRequestException(`路径不合法（含 .. 穿越）：${rel}`);
        }
        const isShot = rel.startsWith('spec/shots/');
        const whitelisted = ARTIFACT_WHITELIST.some((w) => {
            if (w === rel)
                return true;
            if (w.endsWith('/**'))
                return rel.startsWith(w.slice(0, -3));
            return false;
        });
        if (!isShot && !whitelisted) {
            throw new common_1.BadRequestException(`不允许读取 ${rel}；白名单：${ARTIFACT_WHITELIST.join(' / ')}`);
        }
        if (isShot && (rel.includes('..') || !/^spec\/shots\/[A-Za-z0-9_一-龥.\-]+\.png$/i.test(rel))) {
            throw new common_1.BadRequestException(`截图路径不合法：${rel}`);
        }
        const full = path.join(RUNS_ROOT, runId, rel);
        if (isShot && !fs.existsSync(full)) {
            await this.ensureShot(runId, rel).catch(() => false);
        }
        let buf;
        try {
            buf = fs.readFileSync(full);
        }
        catch {
            throw new common_1.NotFoundException(`产物不存在：${runId}/${rel}（可能尚未跑到该阶段）`);
        }
        if (/\.png$/i.test(rel)) {
            return {
                runId,
                name: rel,
                bytes: buf.length,
                isImage: true,
                dataUrl: 'data:image/png;base64,' + buf.toString('base64'),
            };
        }
        const MAX = 4 * 1024 * 1024;
        const truncated = buf.length > MAX;
        const text = buf.subarray(0, MAX).toString('utf8');
        return {
            runId,
            name: rel,
            bytes: buf.length,
            truncated,
            mtime: fs.statSync(full).mtime.toISOString(),
            content: text,
            lines: text.split('\n').length,
        };
    }
    listGeneratedFiles(runId, userId) {
        const runDir = this.resolveRunDir(runId, userId);
        const genDir = path.join(runDir, 'generated');
        if (!fs.existsSync(genDir))
            return [];
        const out = [];
        const walk = (dir, base) => {
            let entries;
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const e of entries) {
                const rel = base ? `${base}/${e.name}` : e.name;
                const full = path.join(dir, e.name);
                if (e.isDirectory())
                    walk(full, rel);
                else
                    out.push(rel);
            }
        };
        walk(genDir, '');
        return out.sort();
    }
};
exports.ProjectPipelineService = ProjectPipelineService;
exports.ProjectPipelineService = ProjectPipelineService = ProjectPipelineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.AiConfigService])
], ProjectPipelineService);
//# sourceMappingURL=project-pipeline.service.js.map