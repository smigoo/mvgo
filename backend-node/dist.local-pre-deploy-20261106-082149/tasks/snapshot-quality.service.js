"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnapshotQualityService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const posix_1 = require("path/posix");
const os_1 = require("os");
const crypto_1 = require("crypto");
const less_compile_gate_js_1 = require("../ai-engine/validators/less-compile-gate.js");
const sfc_semantics_js_1 = require("../ai-engine/utils/sfc-semantics.js");
const task_code_snapshot_service_1 = require("./task-code-snapshot.service");
const tasks_service_1 = require("./tasks.service");
const TEXT_FILE_LIMIT = 512 * 1024;
let SnapshotQualityService = class SnapshotQualityService {
    snapshotService;
    tasksService;
    logger = new common_1.Logger('SnapshotQualityService');
    constructor(snapshotService, tasksService) {
        this.snapshotService = snapshotService;
        this.tasksService = tasksService;
    }
    async validateRevision(sessionId, revision, options = {}) {
        const manifest = this.snapshotService.getManifest(sessionId, revision);
        const integrityDrifted = this.snapshotService.reconcileRevisionIntegrity(sessionId, revision);
        const files = this.snapshotService.exportRevisionFiles(sessionId, revision);
        const issues = [];
        const workDir = this.materialize(sessionId, revision, files);
        try {
            issues.push(...(await this.runLessGate(workDir, files)));
        }
        finally {
            try {
                (0, fs_1.rmSync)(workDir, { recursive: true, force: true });
            }
            catch (err) {
                this.logger.warn(`清理校验临时目录失败（非致命）：${err?.message || err}`);
            }
        }
        issues.push(...this.runSfcSemantics(files));
        issues.push(...this.runStructureCheck(manifest, files));
        this.collapseMissingImportDuplicates(issues);
        const blockCount = issues.filter((issue) => issue.severity === 'BLOCK').length;
        const validation = {
            less: this.deriveValidation(issues, ['shared-less', 'standalone-less', 'sfc-style']),
            semantics: this.deriveValidation(issues, ['sfc-semantics']),
            sfc: this.deriveValidation(issues, ['sfc-semantics']),
            runtime: 'pending',
        };
        const result = {
            success: true,
            sessionId,
            revision,
            pass: blockCount === 0,
            blockCount,
            issues,
            validation,
            integrityDrifted: integrityDrifted.length > 0 ? integrityDrifted : undefined,
            checkedAt: new Date().toISOString(),
        };
        this.snapshotService.updateValidation(sessionId, revision, validation, blockCount > 0 ? `${blockCount} 个阻断问题` : undefined);
        if (options.persist !== false)
            this.persistToTask(sessionId, result);
        return result;
    }
    persistToTask(sessionId, result) {
        try {
            const task = this.tasksService.getTask(sessionId);
            if (!task)
                return;
            this.tasksService.updateTask(sessionId, {
                result: {
                    ...(task.result || {}),
                    codeValidationResult: {
                        pass: result.pass,
                        blockCount: result.blockCount,
                        issues: result.issues,
                        revision: result.revision,
                        checkedAt: result.checkedAt,
                    },
                    lessCompileGate: {
                        pass: result.validation.less !== 'blocked',
                        blockCount: result.issues.filter((i) => i.severity === 'BLOCK' && i.sourceType !== 'sfc-semantics' && i.sourceType !== 'structure').length,
                        diagnostics: result.issues.filter((i) => i.sourceType !== 'sfc-semantics' && i.sourceType !== 'structure'),
                    },
                },
            });
        }
        catch (err) {
            this.logger.warn(`写入 task.result 失败（非致命）：${err?.message || err}`);
        }
    }
    materialize(sessionId, revision, files) {
        const safeSession = String(sessionId || 'unknown').replace(/[^\w.-]/g, '_').slice(0, 80);
        const safeRevision = String(revision || 'unknown').replace(/[^\w.-]/g, '_').slice(0, 80);
        const workDir = (0, path_1.resolve)((0, os_1.tmpdir)(), 'mvgo-snapshot-validate', `${safeSession}-${safeRevision}-${(0, crypto_1.randomUUID)()}`);
        (0, fs_1.mkdirSync)(workDir, { recursive: true });
        for (const [relativePath, content] of Object.entries(files)) {
            const absolutePath = (0, path_1.resolve)(workDir, ...relativePath.split('/'));
            const contained = `${absolutePath}/`.startsWith(`${workDir}/`);
            if (!contained)
                continue;
            (0, fs_1.mkdirSync)((0, path_1.dirname)(absolutePath), { recursive: true });
            (0, fs_1.writeFileSync)(absolutePath, content, 'utf-8');
        }
        return workDir;
    }
    async runLessGate(workDir, files) {
        if (!(0, fs_1.existsSync)(workDir))
            return [];
        try {
            const result = await less_compile_gate_js_1.LessCompileGate.validateDirectory(workDir);
            const mapped = (result?.diagnostics || []).map((item) => {
                const issue = {
                    id: String(item?.id || 'LESS-COMPILE-001'),
                    severity: (item?.severity === 'BLOCK' ? 'BLOCK' : 'INFO'),
                    sourceType: (item?.sourceType || 'shared-less'),
                    file: String(item?.file || '').replace(/\\/g, '/'),
                    line: Number(item?.line) || 1,
                    column: Number(item?.column) || 1,
                    message: String(item?.message || ''),
                    hint: this.pickLessHint(item),
                    healApplied: item?.healApplied === true,
                };
                const extract = Array.isArray(item?.extract)
                    ? item.extract.filter((line) => typeof line === 'string')
                    : [];
                if (extract.length > 0)
                    issue.extract = extract;
                issue.snippet = this.buildSourceSnippet(files[issue.file], issue.line)
                    ?? (Array.isArray(item?.snippet) ? item.snippet : undefined);
                return issue;
            });
            return mapped;
        }
        catch (err) {
            return [{
                    id: 'QUALITY-GATE-000',
                    severity: 'BLOCK',
                    sourceType: 'structure',
                    file: '',
                    line: 1,
                    column: 1,
                    message: `LESS 编译门禁执行异常：${err?.message || err}`,
                }];
        }
    }
    pickLessHint(item) {
        if (item?.hint?.suggestion)
            return { suggestion: String(item.hint.suggestion) };
        const message = String(item?.message || '');
        const missingMatch = message.match(/无法加载 LESS 依赖：(.+)$/);
        if (missingMatch) {
            return {
                suggestion: `被引用的 ${missingMatch[1].trim()} 不存在于当前快照。它不是本文件的语法错误，而是共享样式文件缺失/尚未生成 —— 补齐该文件，或移除这条 @import。`,
            };
        }
        const varMatch = message.match(/variable @([\w-]+) is undefined/);
        if (varMatch) {
            return {
                suggestion: `变量 @${varMatch[1]} 未定义。若它来自主题变量文件，请在文件顶部补 @import './theme-vars.less';（按实际相对路径调整），不要直接删除变量引用。`,
            };
        }
        return undefined;
    }
    buildSourceSnippet(content, line) {
        if (typeof content !== 'string' || !content)
            return null;
        const lines = content.split('\n');
        const target = Math.min(Math.max(Number(line) || 1, 1), lines.length);
        const from = Math.max(1, target - 2);
        const to = Math.min(lines.length, target + 2);
        const snippet = [];
        for (let i = from; i <= to; i++) {
            snippet.push({ line: i, code: lines[i - 1] ?? '', current: i === target });
        }
        return snippet;
    }
    runSfcSemantics(files) {
        const issues = [];
        for (const [path, content] of Object.entries(files)) {
            if (!path.endsWith('.vue'))
                continue;
            if (Buffer.byteLength(content, 'utf-8') > TEXT_FILE_LIMIT)
                continue;
            try {
                const result = (0, sfc_semantics_js_1.validateVueScriptSemantics)(content, path, {
                    requireScriptTag: path === 'package/index.vue',
                    skipFreeVariableCheck: true,
                });
                for (const raw of result?.issues || []) {
                    const line = this.extractIssueLine(raw, content);
                    issues.push({
                        id: 'SFC-SEMANTIC-001',
                        severity: 'BLOCK',
                        sourceType: 'sfc-semantics',
                        file: path,
                        line,
                        column: 1,
                        message: String(raw).replace(/^[^:]*:\s*/, ''),
                        snippet: this.buildSourceSnippet(content, line) ?? undefined,
                    });
                }
            }
            catch (err) {
                issues.push({
                    id: 'SFC-SEMANTIC-000',
                    severity: 'WARN',
                    sourceType: 'sfc-semantics',
                    file: path,
                    line: 1,
                    column: 1,
                    message: `SFC 语义校验异常：${err?.message || err}`,
                });
            }
        }
        return issues;
    }
    extractIssueLine(rawIssue, content) {
        const text = String(rawIssue || '');
        const symbolMatch = text.match(/（([^（）]+?)）/) ||
            text.match(/\(([^()]+?)\)/);
        const rawSymbols = symbolMatch ? symbolMatch[1] : '';
        const symbols = rawSymbols
            .split(/[、;；,\s]+/)
            .map((s) => s.trim())
            .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
        for (const symbol of symbols) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const re = new RegExp(`\\b${symbol.replace(/\$/g, '\\$')}\\b`);
                if (re.test(lines[i]))
                    return i + 1;
            }
        }
        return 1;
    }
    runStructureCheck(manifest, files) {
        const issues = [];
        const existing = new Set(Object.keys(files));
        if (!existing.has('package/index.vue')) {
            issues.push({
                id: 'STRUCT-001',
                severity: 'BLOCK',
                sourceType: 'structure',
                file: 'package/index.vue',
                line: 1,
                column: 1,
                message: '缺少组件入口文件 package/index.vue，预览无法渲染。',
                hint: { suggestion: '补齐入口文件，或在 Playground 中从子组件手动组装入口。' },
            });
        }
        if (manifest.target !== 'vue3' && !existing.has('declare.json')) {
            issues.push({
                id: 'STRUCT-002',
                severity: 'BLOCK',
                sourceType: 'structure',
                file: 'declare.json',
                line: 1,
                column: 1,
                message: '微码组件缺少 declare.json，无法在组件库注册。',
                hint: { suggestion: '补齐 declare.json（组件标识、名称、默认尺寸等声明）。' },
            });
        }
        issues.push(...this.findMissingStyleImports(files, existing));
        return issues;
    }
    findMissingStyleImports(files, existing) {
        const issues = [];
        const missingTargets = new Map();
        const importRe = /@import\s+(?:\([^)]*\)\s*)?['"]([^'"]+)['"]/g;
        for (const [path, content] of Object.entries(files)) {
            if (!path.endsWith('.vue') && !path.endsWith('.less'))
                continue;
            if (Buffer.byteLength(content, 'utf-8') > TEXT_FILE_LIMIT)
                continue;
            let match;
            importRe.lastIndex = 0;
            while ((match = importRe.exec(content)) !== null) {
                const spec = match[1];
                if (!/\.(less|css)$/i.test(spec))
                    continue;
                const target = (0, posix_1.normalize)((0, posix_1.join)((0, posix_1.dirname)(path), spec));
                if (existing.has(target))
                    continue;
                if (!missingTargets.has(target))
                    missingTargets.set(target, new Set());
                missingTargets.get(target).add(path);
            }
        }
        for (const [target, referrers] of missingTargets) {
            issues.push({
                id: 'STRUCT-003',
                severity: 'BLOCK',
                sourceType: 'structure',
                file: target,
                line: 1,
                column: 1,
                message: `缺少被引用的样式文件：${referrers.size} 个文件 @import 了它，但快照中不存在。`,
                hint: {
                    suggestion: `补齐 ${target}（共享样式入口），或移除 ${[...referrers].slice(0, 3).join('、')} 中的对应 @import。`,
                },
            });
        }
        return issues;
    }
    collapseMissingImportDuplicates(issues) {
        const missingTargets = new Set(issues.filter((issue) => issue.id === 'STRUCT-003').map((issue) => issue.file));
        if (missingTargets.size === 0)
            return;
        for (const issue of issues) {
            if (issue.id !== 'LESS-COMPILE-001')
                continue;
            const spec = String(issue.message || '').match(/无法加载 LESS 依赖：(.+)$/)?.[1]?.trim();
            if (!spec)
                continue;
            const resolved = (0, posix_1.normalize)((0, posix_1.join)((0, posix_1.dirname)(issue.file), spec));
            if (!missingTargets.has(resolved))
                continue;
            issue.severity = 'WARN';
            issue.message = `${issue.message}（根因：共享样式文件 ${resolved} 缺失，见 STRUCT-003）`;
        }
    }
    deriveValidation(issues, sourceTypes) {
        const matched = issues.filter((issue) => sourceTypes.includes(issue.sourceType));
        if (matched.length === 0)
            return 'passed';
        if (matched.some((issue) => issue.severity === 'BLOCK'))
            return 'blocked';
        return 'warning';
    }
};
exports.SnapshotQualityService = SnapshotQualityService;
exports.SnapshotQualityService = SnapshotQualityService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [task_code_snapshot_service_1.TaskCodeSnapshotService,
        tasks_service_1.TasksService])
], SnapshotQualityService);
//# sourceMappingURL=snapshot-quality.service.js.map