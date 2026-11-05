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
var ProjectPipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectPipelineService = void 0;
const common_1 = require("@nestjs/common");
const node_child_process_1 = require("node:child_process");
const crypto = __importStar(require("node:crypto"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const s2_contract_freezer_1 = require("./stages/s2-contract-freezer");
const SCANNER_PATH = path.resolve(__dirname, 'scanner/s0-scan.js');
const SCANNER_MD5 = '52b7788b33e800c3d1a19b291c6b8e9d';
const RUNS_ROOT = process.env.PROJECT_RUNS_ROOT
    ? path.resolve(process.env.PROJECT_RUNS_ROOT)
    : path.resolve(__dirname, '../../../data/project-runs');
const RUN_ID_RX = /^pj-\d{8}-\d{6}-[a-f0-9]{6}$/;
const SCAN_TIMEOUT_MS = 180_000;
const STDOUT_CAP = 1_000_000;
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
];
let ProjectPipelineService = ProjectPipelineService_1 = class ProjectPipelineService {
    logger = new common_1.Logger(ProjectPipelineService_1.name);
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
        try {
            fs.mkdirSync(RUNS_ROOT, { recursive: true });
            const probe = path.join(RUNS_ROOT, '.write-probe');
            fs.writeFileSync(probe, String(Date.now()));
            fs.unlinkSync(probe);
            runsRootWritable = true;
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
    async scan(projectDir, note) {
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
            projectDir: info.resolvedPath,
            note: note ?? null,
            createdAt: new Date().toISOString(),
            durationMs,
            exitCode: res.code,
            scannerMd5: SCANNER_MD5,
            stdoutTail: res.stdout.slice(-4000),
        }, null, 2) + '\n');
        this.logger.log(`[S0] runId=${runId} dir=${info.resolvedPath} exit=${res.code} ${durationMs}ms`);
        return {
            durationMs,
            exitCode: res.code,
            stdout: res.stdout,
            ...this.inspectRun(runId),
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
    listRuns() {
        fs.mkdirSync(RUNS_ROOT, { recursive: true });
        const runs = fs
            .readdirSync(RUNS_ROOT, { withFileTypes: true })
            .filter((d) => d.isDirectory() && RUN_ID_RX.test(d.name))
            .map((d) => {
            const full = path.join(RUNS_ROOT, d.name);
            let createdAt = null;
            let projectDir = null;
            let note = null;
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(full, 'run.json'), 'utf8'));
                createdAt = meta.createdAt ?? null;
                projectDir = meta.projectDir ?? null;
                note = meta.note ?? null;
            }
            catch {
            }
            const st = fs.statSync(full);
            return {
                runId: d.name,
                createdAt: createdAt ?? st.mtime.toISOString(),
                projectDir,
                note,
                frozen: fs.existsSync(path.join(full, 'spec', 'openapi.local.yaml')),
            };
        })
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .slice(0, 30);
        return { runsRoot: RUNS_ROOT, total: runs.length, runs };
    }
    inspectRun(runId) {
        this.assertRunId(runId);
        const dir = path.join(RUNS_ROOT, runId);
        if (!fs.existsSync(dir))
            throw new common_1.NotFoundException(`运行不存在：${runId}`);
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
            conflicts: parsed.conflicts,
            gaps: parsed.gaps,
            missing: manifest?.missing ?? [],
            decisions,
            artifacts,
            frozen: artifacts.find((a) => a.name === 'spec/openapi.local.yaml')?.exists === true,
        };
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
    saveDecisions(runId, entries) {
        this.assertRunId(runId);
        const dir = path.join(RUNS_ROOT, runId);
        if (!fs.existsSync(dir))
            throw new common_1.NotFoundException(`运行不存在：${runId}`);
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
    freeze(runId) {
        this.assertRunId(runId);
        const dir = path.join(RUNS_ROOT, runId);
        if (!fs.existsSync(dir))
            throw new common_1.NotFoundException(`运行不存在：${runId}`);
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
        return { ...report, artifacts: this.inspectRun(runId).artifacts };
    }
    readArtifact(runId, name) {
        this.assertRunId(runId);
        const rel = String(name ?? '').replace(/^\/+/, '');
        if (!ARTIFACT_WHITELIST.includes(rel)) {
            throw new common_1.BadRequestException(`不允许读取 ${rel}；白名单：${ARTIFACT_WHITELIST.join(' / ')}`);
        }
        const full = path.join(RUNS_ROOT, runId, rel);
        let buf;
        try {
            buf = fs.readFileSync(full);
        }
        catch {
            throw new common_1.NotFoundException(`产物不存在：${runId}/${rel}（可能尚未跑到该阶段）`);
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
};
exports.ProjectPipelineService = ProjectPipelineService;
exports.ProjectPipelineService = ProjectPipelineService = ProjectPipelineService_1 = __decorate([
    (0, common_1.Injectable)()
], ProjectPipelineService);
//# sourceMappingURL=project-pipeline.service.js.map