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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var McSpecService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.McSpecService = void 0;
const common_1 = require("@nestjs/common");
const node_child_process_1 = require("node:child_process");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const crypto = __importStar(require("node:crypto"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const component_resolver_js_1 = require("../ai-engine/utils/component-resolver.js");
const SKILL_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_ZIP_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 500;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 8 * 1024 * 1024;
let McSpecService = class McSpecService {
    static { McSpecService_1 = this; }
    logger = new common_1.Logger('McSpecService');
    builtinSkillsDir = process.env.MC_SPEC_BUILTIN_SKILLS_DIR
        ? path.resolve(process.env.MC_SPEC_BUILTIN_SKILLS_DIR)
        : path.resolve(__dirname, '../../skills');
    userSkillsDir = process.env.MC_SPEC_USER_SKILLS_DIR
        ? path.resolve(process.env.MC_SPEC_USER_SKILLS_DIR)
        : path.resolve(__dirname, '../../data/skills');
    reportsDir = process.env.MC_SPEC_REPORTS_DIR
        ? path.resolve(process.env.MC_SPEC_REPORTS_DIR)
        : path.resolve(__dirname, '../../data/mc-spec-reports');
    static ENTRY_REL = path.join('scripts', 'mc-check.cjs');
    entryOf(skillDir) {
        return path.join(skillDir, McSpecService_1.ENTRY_REL);
    }
    resolveSkillDir(skillId) {
        const id = String(skillId || '').trim();
        if (!id || id === 'frontend-mc-check') {
            const dir = path.join(this.builtinSkillsDir, 'frontend-mc-check');
            return { skillId: 'frontend-mc-check', dir, entry: this.entryOf(dir) };
        }
        const dir = path.join(this.userSkillsDir, id);
        return { skillId: id, dir, entry: this.entryOf(dir) };
    }
    listSkills() {
        const out = [];
        const builtin = this.resolveSkillDir('frontend-mc-check');
        out.push({
            id: 'frontend-mc-check',
            name: '微码组件规范检查（内置）',
            builtin: true,
            available: fs.existsSync(builtin.entry),
            ...this.readSkillMeta(builtin.dir),
        });
        try {
            if (fs.existsSync(this.userSkillsDir)) {
                for (const name of fs.readdirSync(this.userSkillsDir)) {
                    if (!SKILL_ID_RE.test(name))
                        continue;
                    const dir = path.join(this.userSkillsDir, name);
                    if (!fs.statSync(dir).isDirectory())
                        continue;
                    out.push({
                        id: name,
                        name,
                        builtin: false,
                        available: fs.existsSync(this.entryOf(dir)),
                        ...this.readSkillMeta(dir),
                        ...this.readInstalledAt(dir),
                    });
                }
            }
        }
        catch (e) {
            this.logger.warn(`读取自定义 skill 目录失败: ${e?.message || e}`);
        }
        return out;
    }
    readSkillMeta(dir) {
        try {
            const md = path.join(dir, 'SKILL.md');
            if (!fs.existsSync(md))
                return {};
            const head = fs.readFileSync(md, 'utf-8').split(/\r?\n/).slice(0, 40);
            const out = {};
            if (!/^---\s*$/.test(String(head[0] || '')))
                return {};
            for (const line of head.slice(1)) {
                if (/^---\s*$/.test(line))
                    break;
                const m = /^(name|description|version)\s*:\s*(.+)$/.exec(line.trim());
                if (!m)
                    continue;
                const value = m[2].trim().replace(/^["']|["']$/g, '');
                if (value)
                    out[m[1]] = value;
            }
            return out;
        }
        catch {
            return {};
        }
    }
    readInstalledAt(dir) {
        try {
            return { uploadedAt: new Date(fs.statSync(dir).mtimeMs).toISOString() };
        }
        catch {
            return {};
        }
    }
    safeEntryParts(rawName) {
        const raw = String(rawName || '');
        if (!raw || raw.includes('\0'))
            return null;
        const normalized = raw.replace(/\\/g, '/');
        if (normalized.startsWith('/'))
            return null;
        if (/^[a-zA-Z]:/.test(normalized))
            return null;
        const parts = normalized.split('/').filter((p) => p !== '' && p !== '.');
        if (!parts.length)
            return null;
        if (parts.includes('..'))
            return null;
        return parts;
    }
    async installSkillFromZip(buffer, opts = {}) {
        if (!buffer || !buffer.length)
            throw new common_1.BadRequestException('上传内容为空');
        if (buffer.length > MAX_ZIP_BYTES) {
            throw new common_1.BadRequestException(`zip 过大（${buffer.length} 字节，上限 ${MAX_ZIP_BYTES}）`);
        }
        let zip;
        try {
            zip = new adm_zip_1.default(buffer);
        }
        catch (e) {
            throw new common_1.BadRequestException(`zip 解析失败: ${e?.message || e}`);
        }
        const entries = zip.getEntries();
        if (!entries.length)
            throw new common_1.BadRequestException('zip 内没有任何文件');
        if (entries.length > MAX_ZIP_ENTRIES) {
            throw new common_1.BadRequestException(`zip 条目过多（${entries.length}，上限 ${MAX_ZIP_ENTRIES}）`);
        }
        const files = [];
        let totalBytes = 0;
        for (const entry of entries) {
            const mode = (entry.header.attr >>> 16) & 0o170000;
            if (mode === 0o120000) {
                throw new common_1.BadRequestException(`zip 内含符号链接，已拒绝：${entry.entryName}`);
            }
            const parts = this.safeEntryParts(entry.entryName);
            if (!parts) {
                throw new common_1.BadRequestException(`zip 内含不安全路径，已拒绝：${entry.entryName}`);
            }
            if (entry.isDirectory)
                continue;
            const size = entry.header.size || 0;
            if (size > MAX_SINGLE_FILE_BYTES) {
                throw new common_1.BadRequestException(`单文件过大：${entry.entryName}（${size} 字节）`);
            }
            totalBytes += size;
            if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
                throw new common_1.BadRequestException(`解压后总大小超限（上限 ${MAX_UNCOMPRESSED_BYTES} 字节）`);
            }
            files.push({ parts, entry });
        }
        if (!files.length)
            throw new common_1.BadRequestException('zip 内没有任何文件');
        const firstSeg = files[0].parts[0];
        const allUnderSameRoot = files.every((f) => f.parts.length > 1 && f.parts[0] === firstSeg);
        const stripTop = allUnderSameRoot;
        const fromZipRoot = stripTop ? firstSeg : '';
        const fromFileName = String(opts.fileName || '').replace(/\.zip$/i, '');
        const candidateId = String(opts.skillId || fromZipRoot || fromFileName || '').trim().toLowerCase();
        if (!SKILL_ID_RE.test(candidateId)) {
            throw new common_1.BadRequestException(`无法确定合法的 skill 标识「${candidateId || '(空)'}」：只允许小写字母/数字/-/_，需以字母或数字开头`);
        }
        const targetDir = path.join(this.userSkillsDir, candidateId);
        if (!path.resolve(targetDir).startsWith(path.resolve(this.userSkillsDir) + path.sep)) {
            throw new common_1.BadRequestException('非法的 skill 目录');
        }
        const existed = fs.existsSync(targetDir);
        if (existed && !opts.overwrite) {
            throw new common_1.ConflictException(`skill「${candidateId}」已存在，如需覆盖请勾选覆盖`);
        }
        fs.mkdirSync(this.userSkillsDir, { recursive: true });
        const tmpDir = path.join(this.userSkillsDir, `.tmp-${crypto.randomBytes(6).toString('hex')}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        try {
            for (const f of files) {
                const rel = f.parts.slice(stripTop ? 1 : 0);
                if (!rel.length)
                    continue;
                const dest = path.join(tmpDir, ...rel);
                if (!path.resolve(dest).startsWith(path.resolve(tmpDir) + path.sep)) {
                    throw new common_1.BadRequestException(`条目路径越界：${f.entry.entryName}`);
                }
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.writeFileSync(dest, f.entry.getData());
            }
            const entryRel = path.join('scripts', 'mc-check.cjs');
            if (!fs.existsSync(path.join(tmpDir, entryRel))) {
                throw new common_1.BadRequestException(`skill 包缺少约定入口 ${path.join('scripts', 'mc-check.cjs')}，无法作为规范检查 skill 使用`);
            }
            if (existed) {
                const trashDir = path.join(this.userSkillsDir, `.trash-${crypto.randomBytes(6).toString('hex')}`);
                fs.renameSync(targetDir, trashDir);
                fs.rmSync(trashDir, { recursive: true, force: true });
            }
            fs.renameSync(tmpDir, targetDir);
        }
        catch (e) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            throw e;
        }
        this.logger.log(`自定义 skill 已安装: ${candidateId}（${files.length} 个文件，${totalBytes} 字节，覆盖=${existed}）`);
        return {
            id: candidateId,
            name: candidateId,
            builtin: false,
            available: fs.existsSync(this.entryOf(targetDir)),
            ...this.readSkillMeta(targetDir),
            ...this.readInstalledAt(targetDir),
        };
    }
    removeSkill(skillId) {
        const id = String(skillId || '').trim().toLowerCase();
        if (!SKILL_ID_RE.test(id)) {
            throw new common_1.BadRequestException(`非法的 skill 标识：${skillId}`);
        }
        if (id === 'frontend-mc-check') {
            throw new common_1.BadRequestException('内置 skill 不可删除');
        }
        const dir = path.join(this.userSkillsDir, id);
        if (!path.resolve(dir).startsWith(path.resolve(this.userSkillsDir) + path.sep)) {
            throw new common_1.BadRequestException('非法的 skill 目录');
        }
        if (!fs.existsSync(dir)) {
            throw new common_1.NotFoundException(`skill 不存在：${id}`);
        }
        fs.rmSync(dir, { recursive: true, force: true });
        this.logger.log(`自定义 skill 已卸载: ${id}`);
        return { removed: true, skillId: id };
    }
    async checkComponent(componentId, skillId) {
        const id = String(componentId || '').trim();
        if (!id)
            throw new common_1.BadRequestException('缺少 componentId');
        const componentDir = await (0, component_resolver_js_1.resolveComponentDirStrict)(id);
        if (!componentDir) {
            throw new common_1.NotFoundException(`未找到该组件的产物目录: ${id}（未找到含 package/index.vue 的候选目录）`);
        }
        if (!fs.existsSync(path.join(componentDir, 'package', 'index.vue'))) {
            throw new common_1.NotFoundException(`组件产物不完整: ${componentDir} 缺少 package/index.vue（规范检查无法进行）`);
        }
        const skill = this.resolveSkillDir(skillId);
        if (!fs.existsSync(skill.entry)) {
            throw new common_1.BadRequestException(`规范检查 skill 入口不存在: ${skill.entry}（约定入口为 scripts/mc-check.cjs）`);
        }
        const outDir = path.join(this.reportsDir, id);
        fs.mkdirSync(outDir, { recursive: true });
        this.logger.log(`规范检查: component=${id} skill=${skill.skillId}`);
        const started = Date.now();
        const ret = (0, node_child_process_1.spawnSync)(process.execPath, [skill.entry, '--component-path', componentDir, '--output-dir', outDir], { timeout: 60_000, encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
        const costMs = Date.now() - started;
        if (ret.error) {
            throw new common_1.BadRequestException(`规范检查执行失败: ${ret.error.message}`);
        }
        if (ret.status !== 0) {
            const tail = String(ret.stderr || ret.stdout || '').slice(-500);
            this.logger.error(`规范检查脚本异常退出 status=${ret.status}: ${tail}`);
            throw new common_1.BadRequestException(`规范检查脚本执行失败（status=${ret.status}）: ${tail}`);
        }
        const stamped = fs
            .readdirSync(outDir)
            .filter((n) => fs.statSync(path.join(outDir, n)).isDirectory())
            .sort();
        if (!stamped.length) {
            throw new common_1.BadRequestException('规范检查未产出报告目录');
        }
        const resultPath = path.join(outDir, stamped[stamped.length - 1], 'check-result.json');
        if (!fs.existsSync(resultPath)) {
            throw new common_1.BadRequestException(`检查结果文件缺失: ${resultPath}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
        }
        catch (e) {
            throw new common_1.BadRequestException(`检查结果解析失败: ${e?.message || e}`);
        }
        const comp = (parsed?.components || [])[0] || {};
        const rawItems = Array.isArray(comp.results) ? comp.results : [];
        const items = rawItems.map((r) => ({
            id: String(r?.id || ''),
            name: String(r?.name || ''),
            level: String(r?.level || (r?.passed ? 'pass' : 'error')),
            passed: r?.passed !== false,
            message: String(r?.message || ''),
        }));
        this.logger.log(`规范检查完成: ${id} canRelease=${!!comp.canRelease} 通过=${comp.passCount ?? 0} 失败=${comp.failCount ?? 0} 耗时=${costMs}ms`);
        return {
            specVersion: String(parsed?.specVersion || ''),
            checkedAt: String(parsed?.checkedAt || new Date().toISOString()),
            componentId: id,
            dirName: String(comp.dirName || id),
            passCount: Number(comp.passCount ?? items.filter((i) => i.passed).length),
            failCount: Number(comp.failCount ?? items.filter((i) => !i.passed && i.level === 'error').length),
            warningCount: Number(comp.warningCount ?? items.filter((i) => !i.passed && i.level === 'warning').length),
            canRelease: comp.canRelease !== false,
            items,
            errors: items.filter((i) => !i.passed && i.level !== 'warning'),
            warnings: items.filter((i) => !i.passed && i.level === 'warning'),
            reportUrl: `/api/mc-spec/report/${encodeURIComponent(id)}/${encodeURIComponent(stamped[stamped.length - 1])}`,
            skillId: skill.skillId,
        };
    }
    resolveReportPath(componentId, stamp) {
        if (!/^[\w-]+$/.test(componentId) || !/^[\d_-]+$/.test(stamp))
            return null;
        const p = path.join(this.reportsDir, componentId, stamp, 'mc-report.html');
        return fs.existsSync(p) ? p : null;
    }
    async scoreQualityV1(componentId, opts = {}) {
        const id = String(componentId || '').trim();
        if (!id)
            throw new common_1.BadRequestException('缺少 componentId');
        const componentDir = await (0, component_resolver_js_1.resolveComponentDirStrict)(id);
        if (!componentDir) {
            throw new common_1.NotFoundException(`未找到该组件的产物目录: ${id}`);
        }
        const { scoreComponentDir } = await import('../ai-engine/utils/quality-score-v1.js');
        const persist = opts.persist !== false;
        const result = await scoreComponentDir(componentDir, { componentId: id, persist: false });
        if (persist) {
            await this.persistQualityToReplicas(id, result.quality);
        }
        return result;
    }
    async persistQualityToReplicas(componentId, quality) {
        let writable = [];
        try {
            writable = await (0, component_resolver_js_1.resolveWritableComponentDirs)(componentId);
        }
        catch {
            writable = [];
        }
        if (writable.length === 0) {
            const strict = await (0, component_resolver_js_1.resolveComponentDirStrict)(componentId);
            if (strict)
                writable = [strict];
        }
        for (const dir of writable) {
            try {
                if (!fs.existsSync(dir))
                    fs.mkdirSync(dir, { recursive: true });
                const metaPath = path.join(dir, 'component-meta.json');
                let prev = {};
                try {
                    if (fs.existsSync(metaPath))
                        prev = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                }
                catch {
                    prev = {};
                }
                const merged = {
                    ...prev,
                    quality: { ...(prev.quality || {}), ...quality },
                };
                fs.writeFileSync(metaPath, JSON.stringify(merged, null, 2), 'utf8');
            }
            catch {
            }
        }
    }
    async readQualityV1(componentId) {
        const id = String(componentId || '').trim();
        if (!id)
            throw new common_1.BadRequestException('缺少 componentId');
        const dirs = await (0, component_resolver_js_1.resolveWritableComponentDirs)(id);
        if (dirs.length === 0) {
            const strict = await (0, component_resolver_js_1.resolveComponentDirStrict)(id);
            if (strict)
                dirs.push(strict);
        }
        const quality = (() => {
            for (const dir of dirs) {
                const metaPath = path.join(dir, 'component-meta.json');
                try {
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        if (meta?.quality && typeof meta.quality === 'object')
                            return meta.quality;
                    }
                }
                catch {
                }
            }
            return null;
        })();
        return { componentDir: dirs[0] || null, componentId: id, quality };
    }
    async fixQualityIssues(componentId, options) {
        const id = String(componentId || '').trim();
        if (!id)
            throw new common_1.BadRequestException('缺少 componentId');
        const componentDir = await (0, component_resolver_js_1.resolveComponentDirStrict)(id);
        if (!componentDir) {
            throw new common_1.NotFoundException(`未找到该组件的产物目录: ${id}`);
        }
        const targetDimensions = options?.dimensions;
        const { scoreComponentDir } = await import('../ai-engine/utils/quality-score-v1.js');
        const scoreResult = await scoreComponentDir(componentDir, { componentId: id, persist: false });
        const quality = scoreResult.quality;
        const issues = quality?.spec?.issues || [];
        const fixableRules = new Set(['CODE-008', 'THEME-VAR-NAME-MISMATCH', 'CODE-025-WARN']);
        const fixableIssues = !targetDimensions ? issues.filter((i) => fixableRules.has(i.id)) : [];
        const hasStyleFixable = this.hasStyleFixable(quality, targetDimensions);
        if (fixableIssues.length === 0 && !hasStyleFixable) {
            return {
                componentId: id,
                fixed: [],
                summary: { code008: 0, themeVarMismatch: 0, code025Warn: 0, styleColor: 0, styleNumeric: 0 },
                message: '没有可自动修复的问题',
            };
        }
        let allFixed = [];
        let summary = { code008: 0, themeVarMismatch: 0, code025Warn: 0, styleColor: 0, styleNumeric: 0 };
        let files = [];
        if (fixableIssues.length > 0) {
            const { runAutoFix } = await import('../ai-engine/utils/quality-auto-fix.js');
            const specResult = runAutoFix(componentDir, fixableIssues);
            files = specResult.files;
            allFixed.push(...specResult.fixed.map((f) => ({ ...f, rule: f.rule || 'CODE-008' })));
            summary.code008 = specResult.summary.code008 || 0;
            summary.themeVarMismatch = specResult.summary.themeVarMismatch || 0;
            summary.code025Warn = specResult.summary.code025Warn || 0;
        }
        let allUnfixable = [];
        if (hasStyleFixable && quality) {
            const { runStyleAutoFix } = await import('../ai-engine/utils/style-auto-fix.js');
            const styleResult = files.length > 0
                ? runStyleAutoFix(componentDir, quality, { fixFuzzy: true, fixMissed: true, inputFiles: files, targetDimensions })
                : runStyleAutoFix(componentDir, quality, { fixFuzzy: true, fixMissed: true, targetDimensions });
            files = styleResult.files;
            allFixed.push(...styleResult.fixed.map((f) => ({ ...f, rule: `STYLE-${f.dimension?.toUpperCase()}` })));
            allUnfixable.push(...(styleResult.unfixable || []).map((u) => ({ ...u, rule: `STYLE-${u.dimension?.toUpperCase()}` })));
            summary.styleColor = styleResult.summary.color || 0;
            summary.styleNumeric = (styleResult.summary.spacing || 0) + (styleResult.summary.font || 0) + (styleResult.summary.radius || 0);
        }
        const { writeFixedFiles } = await import('../ai-engine/utils/quality-auto-fix.js');
        const { written } = writeFixedFiles(componentDir, files);
        this.logger.log(`[quality-fix] ${id}: 修复 ${allFixed.length} 处（规范 ${fixableIssues.length} + 样式），写入 ${written} 文件`);
        const newResult = await scoreComponentDir(componentDir, { componentId: id, persist: true });
        await this.persistQualityToReplicas(id, newResult.quality);
        return {
            componentId: id,
            fixed: allFixed,
            unfixable: allUnfixable,
            summary,
            newQuality: newResult.quality,
        };
    }
    hasStyleFixable(quality, targetDimensions) {
        if (!quality?.style?.dimensions)
            return false;
        for (const [name, dim] of Object.entries(quality.style.dimensions)) {
            if (!dim.scored || name === 'structure')
                continue;
            if (targetDimensions && !targetDimensions.includes(name))
                continue;
            if (dim.fuzzyMatches?.length > 0 || dim.missed?.length > 0)
                return true;
        }
        return false;
    }
};
exports.McSpecService = McSpecService;
exports.McSpecService = McSpecService = McSpecService_1 = __decorate([
    (0, common_1.Injectable)()
], McSpecService);
//# sourceMappingURL=mc-spec.service.js.map