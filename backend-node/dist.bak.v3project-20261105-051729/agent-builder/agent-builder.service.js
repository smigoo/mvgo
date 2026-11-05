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
var AgentBuilderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentBuilderService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const url_1 = require("url");
const fs_2 = require("fs");
const backend_root_1 = require("../config/backend-root");
const tool_templates_js_1 = require("./templates/tool-templates.js");
const llm_templates_js_1 = require("./templates/llm-templates.js");
const customRolesDir = (0, path_1.join)(__dirname, '..', 'ai-engine', 'roles', 'custom');
const persistRolesDir = (0, path_1.join)(backend_root_1.configDir, 'dynamic-roles');
const agentsDir = (0, path_1.join)(backend_root_1.configDir, 'agents');
const resourcesDir = (0, path_1.join)(backend_root_1.configDir, 'agent-resources');
const NAME_RE = /^[a-z][a-z0-9-]{2,31}$/;
const ALLOWED_EXT = new Set([
    'md', 'txt', 'json', 'yaml', 'yml', 'csv', 'less', 'vue', 'js', 'ts',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
function fixLatin1ToUtf8(s) {
    try {
        if (/[\u0080-\u00ff]/.test(s)) {
            const fixed = Buffer.from(s, 'latin1').toString('utf8');
            if (!fixed.includes('\uFFFD'))
                return fixed;
        }
    }
    catch { }
    return s;
}
let AgentBuilderService = AgentBuilderService_1 = class AgentBuilderService {
    logger = new common_1.Logger(AgentBuilderService_1.name);
    constructor() {
        for (const dir of [agentsDir, customRolesDir, persistRolesDir, resourcesDir]) {
            if (!(0, fs_2.existsSync)(dir))
                (0, fs_2.mkdirSync)(dir, { recursive: true });
        }
        this.rebuildMissingRoles().catch(() => { });
    }
    async rebuildMissingRoles() {
        try {
            const files = await fs_1.promises.readdir(agentsDir);
            let rebuilt = 0;
            for (const f of files.filter((x) => x.endsWith('.json'))) {
                try {
                    const def = JSON.parse(await fs_1.promises.readFile((0, path_1.join)(agentsDir, f), 'utf-8'));
                    if (!def?.name || !def?.templateId)
                        continue;
                    const target = (0, path_1.join)(customRolesDir, `${def.name}.js`);
                    if (!(0, fs_2.existsSync)(target)) {
                        const code = this.renderCode(def);
                        await fs_1.promises.writeFile(target, code, 'utf-8');
                        await fs_1.promises.writeFile((0, path_1.join)(persistRolesDir, `${def.name}.js`), code, 'utf-8');
                        rebuilt++;
                    }
                }
                catch { }
            }
            if (rebuilt > 0) {
                this.logger.log(`♻️ 自愈重建 ${rebuilt} 个动态角色代码（定义存在但代码缺失）`);
            }
        }
        catch { }
    }
    async uploadResource(file) {
        if (!file || !file.originalname || !file.buffer) {
            return { success: false, error: '未收到文件（字段名应为 file）' };
        }
        const rawName = fixLatin1ToUtf8(String(file.originalname || 'file'));
        const ext = rawName.includes('.') ? rawName.split('.').pop().toLowerCase() : '';
        if (!ALLOWED_EXT.has(ext)) {
            return { success: false, error: `不支持的文件类型 .${ext || '(无扩展名)'}，允许: ${[...ALLOWED_EXT].join(' / ')}` };
        }
        if (file.size > MAX_FILE_SIZE) {
            return { success: false, error: `文件超过 10MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）` };
        }
        const base = rawName
            .replace(/\.[^.]+$/, '')
            .replace(/[\\/:\*\?"<>|\x00-\x1f]/g, '_')
            .slice(0, 60) || 'resource';
        const safeName = `${base}.${ext}`;
        const target = (0, path_1.join)(resourcesDir, safeName);
        await fs_1.promises.writeFile(target, file.buffer);
        this.logger.log(`📎 上传参考资源: ${safeName} (${file.size}B)`);
        return {
            success: true,
            data: {
                name: safeName,
                url: target,
                type: ext,
                size: file.size,
            },
        };
    }
    validateDef(dto) {
        if (!NAME_RE.test(dto.name)) {
            throw new common_1.BadRequestException(`标识不合法: "${dto.name}"，要求小写字母开头、a-z0-9-、3~32 位`);
        }
        const templates = dto.logicType === 'llm' ? llm_templates_js_1.LLM_TEMPLATES : tool_templates_js_1.TOOL_TEMPLATES;
        const tpl = templates[dto.templateId];
        if (!tpl) {
            throw new common_1.BadRequestException(`未知模板: ${dto.templateId}，可用: ${Object.keys(templates).join(', ')}`);
        }
        const inputs = (dto.inputs || [])
            .filter((i) => i && i.key)
            .map((i) => ({ key: String(i.key).trim().replace(/[^a-zA-Z0-9_]/g, '_'), type: i.type || 'string', required: !!i.required }))
            .filter((i) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(i.key));
        const outputs = (dto.outputs || [])
            .filter((o) => o && o.key)
            .map((o) => ({ key: String(o.key).trim().replace(/[^a-zA-Z0-9_]/g, '_'), type: o.type || 'any' }))
            .filter((o) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(o.key));
        return {
            name: dto.name,
            label: (dto.label || dto.name).slice(0, 40),
            description: (dto.description || '').slice(0, 200),
            category: (dto.category || '自定义').slice(0, 20),
            logicType: dto.logicType,
            templateId: dto.templateId,
            inputs,
            outputs,
            params: dto.params || {},
            model: dto.model || null,
            referenceFiles: (dto.referenceFiles || [])
                .filter((r) => r && r.name && r.url)
                .map((r) => ({
                name: String(r.name).slice(0, 100),
                url: String(r.url).slice(0, 600),
                type: String(r.type || '').slice(0, 10),
                size: Number(r.size) || 0,
            })),
        };
    }
    renderCode(def) {
        const templates = def.logicType === 'llm' ? llm_templates_js_1.LLM_TEMPLATES : tool_templates_js_1.TOOL_TEMPLATES;
        const tpl = templates[def.templateId];
        return tpl.render(def);
    }
    async create(dto, userId) {
        if (await this.getDefinition(dto.name)) {
            throw new common_1.BadRequestException(`智能体 "${dto.name}" 已存在`);
        }
        const def = this.validateDef(dto);
        const code = this.renderCode(def);
        const syntaxOk = await this.validateSyntax(code);
        if (!syntaxOk.ok) {
            throw new common_1.BadRequestException(`生成代码语法校验失败: ${syntaxOk.error}`);
        }
        const modulePath = `roles/custom/${def.name}.js`;
        await fs_1.promises.writeFile((0, path_1.join)(customRolesDir, `${def.name}.js`), code, 'utf-8');
        await fs_1.promises.writeFile((0, path_1.join)(persistRolesDir, `${def.name}.js`), code, 'utf-8');
        const vision = def.logicType === 'llm' &&
            (def.params?.vision === true ||
                def.inputs.some((i) => String(i.type || '').includes('image')));
        const record = {
            ...def,
            author: userId || 'anonymous',
            className: 'DynamicAgent',
            modulePath,
            requires: { vision },
            createdAt: Date.now(),
        };
        await fs_1.promises.writeFile((0, path_1.join)(agentsDir, `${def.name}.json`), JSON.stringify(record, null, 2), 'utf-8');
        const smoke = await this.smokeTest(def);
        if (!smoke.ok) {
            this.logger.warn(`冒烟测试失败（保留创建，警告）: ${smoke.error}`);
        }
        this.logger.log(`✅ Agent Builder 创建智能体: ${def.name} (${def.logicType}/${def.templateId})`);
        return {
            success: true,
            data: {
                name: def.name,
                label: def.label,
                logicType: def.logicType,
                modulePath,
                smoke: smoke.ok ? 'passed' : 'warning',
                smokeDetail: smoke,
            },
        };
    }
    async list() {
        try {
            const files = await fs_1.promises.readdir(agentsDir);
            const out = [];
            for (const f of files.filter((x) => x.endsWith('.json'))) {
                try {
                    const rec = JSON.parse(await fs_1.promises.readFile((0, path_1.join)(agentsDir, f), 'utf-8'));
                    out.push({
                        name: rec.name,
                        label: rec.label,
                        description: rec.description,
                        category: rec.category,
                        logicType: rec.logicType,
                        templateId: rec.templateId,
                        author: rec.author,
                        createdAt: rec.createdAt,
                    });
                }
                catch (e) { }
            }
            return out;
        }
        catch {
            return [];
        }
    }
    async getDefinition(name) {
        try {
            const raw = await fs_1.promises.readFile((0, path_1.join)(agentsDir, `${name}.json`), 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async remove(name, userId) {
        const def = await this.getDefinition(name);
        if (!def)
            throw new common_1.NotFoundException(`动态智能体不存在: ${name}`);
        if (def.author && def.author !== 'anonymous' && userId && def.author !== userId) {
            throw new common_1.BadRequestException('只能删除自己创建的智能体');
        }
        await fs_1.promises.unlink((0, path_1.join)(agentsDir, `${name}.json`)).catch(() => { });
        await fs_1.promises.unlink((0, path_1.join)(customRolesDir, `${name}.js`)).catch(() => { });
        await fs_1.promises.unlink((0, path_1.join)(persistRolesDir, `${name}.js`)).catch(() => { });
        return { success: true };
    }
    async validateSyntax(code) {
        try {
            const acornMod = await import('acorn');
            const acorn = acornMod.default || acornMod;
            acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
            return { ok: true };
        }
        catch (e) {
            return { ok: false, error: e.message };
        }
    }
    async smokeTest(def) {
        try {
            if (def.logicType === 'llm') {
                const { DynamicAgent } = await this.importDynamic(def.name);
                return { ok: !!DynamicAgent, output: { note: 'llm 节点跳过真实调用' } };
            }
            const { DynamicAgent } = await this.importDynamic(def.name);
            const inst = new DynamicAgent({
                apiKey: 'smoke',
                baseURL: 'http://localhost:9/v1',
                providerType: 'openai-compatible',
                greeting: 'Smoke',
            });
            const mockInput = {};
            for (const i of def.inputs) {
                mockInput[i.key] = i.type === 'number' ? 42 : `smoke-${i.key}`;
            }
            const out = await inst.execute(mockInput);
            return { ok: true, output: out };
        }
        catch (e) {
            return { ok: false, error: e.message };
        }
    }
    async testAgent(name, input = {}) {
        const def = await this.getDefinition(name);
        if (!def)
            throw new common_1.NotFoundException(`动态智能体不存在: ${name}`);
        try {
            const { DynamicAgent } = await this.importDynamic(name);
            const inst = new DynamicAgent({
                model: def.model || undefined,
            });
            const out = await inst.execute({ ...(input || {}), onProgress: () => { } });
            return { ok: true, data: out };
        }
        catch (e) {
            const msg = String(e?.message || e);
            const friendly = /api[_-]?key|apiKey|credential/i.test(msg)
                ? 'AI 节点试跑需要配置模型 Key（当前环境未配置），请拖入画布在管线运行中调用'
                : msg;
            return { ok: false, error: friendly };
        }
    }
    async submitFeedback(body, userId) {
        const need = String(body?.need || '').trim();
        if (!need)
            return { success: false, error: '请描述你需要的能力' };
        const feedbackDir = (0, path_1.join)(backend_root_1.configDir, 'agent-feedback');
        if (!(0, fs_2.existsSync)(feedbackDir))
            (0, fs_2.mkdirSync)(feedbackDir, { recursive: true });
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const filePath = (0, path_1.join)(feedbackDir, `feedback-${monthKey}.json`);
        let list = [];
        try {
            list = JSON.parse(await fs_1.promises.readFile(filePath, 'utf-8'));
            if (!Array.isArray(list))
                list = [];
        }
        catch { }
        list.push({
            need,
            query: String(body?.query || '').slice(0, 100),
            author: userId || 'anonymous',
            ts: Date.now(),
        });
        await fs_1.promises.writeFile(filePath, JSON.stringify(list, null, 2), 'utf-8');
        this.logger.log(`💡 能力缺口反馈 #${list.length}: ${need.slice(0, 60)}`);
        return { success: true, data: { total: list.length } };
    }
    async importDynamic(name) {
        const filePath = (0, path_1.join)(customRolesDir, `${name}.js`);
        let ts = 0;
        try {
            ts = (0, fs_2.statSync)(filePath).mtimeMs;
        }
        catch { }
        const url = `${(0, url_1.pathToFileURL)(filePath).href}?t=${Math.round(ts)}`;
        const mod = await import(url);
        return mod;
    }
};
exports.AgentBuilderService = AgentBuilderService;
exports.AgentBuilderService = AgentBuilderService = AgentBuilderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], AgentBuilderService);
//# sourceMappingURL=agent-builder.service.js.map