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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ApifoxMcpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApifoxMcpService = void 0;
const common_1 = require("@nestjs/common");
const adm_zip_1 = __importDefault(require("adm-zip"));
const fs_1 = require("fs");
const apifox_service_1 = require("./apifox.service");
const apifox_generator_service_1 = require("./apifox-generator.service");
const APIFOX_MCP_PACKAGE = 'apifox-mcp-server';
const TOOL_READ_OAS = /^read_project_oas(_|$)/;
const TOOL_REF_RESOURCES = /ref_resources/;
const TOOL_REFRESH_OAS = /^refresh_project_oas(_|$)/;
const MAX_REF_ROUNDS = 4;
const REF_CHUNK_SIZE = 40;
const MCP_TIMEOUT_MS = 180_000;
function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new common_1.BadRequestException(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function collectAbsoluteRefs(node, out = new Set()) {
    if (Array.isArray(node)) {
        for (const item of node)
            collectAbsoluteRefs(item, out);
    }
    else if (node && typeof node === 'object') {
        const ref = node.$ref;
        if (typeof ref === 'string' && ref.startsWith('/'))
            out.add(ref);
        for (const value of Object.values(node))
            collectAbsoluteRefs(value, out);
    }
    return out;
}
function deref(node, refMap, chain = new Set()) {
    if (Array.isArray(node))
        return node.map((item) => deref(item, refMap, chain));
    if (!node || typeof node !== 'object')
        return node;
    const ref = node.$ref;
    if (typeof ref === 'string' && ref.startsWith('/')) {
        if (chain.has(ref))
            return node;
        const target = refMap.get(ref);
        if (target === undefined)
            return node;
        const nextChain = new Set(chain);
        nextChain.add(ref);
        const rest = { ...node };
        delete rest.$ref;
        const merged = deref(target, refMap, nextChain);
        if (merged && typeof merged === 'object' && !Array.isArray(merged)) {
            for (const [key, value] of Object.entries(rest)) {
                if (!(key in merged))
                    merged[key] = deref(value, refMap, chain);
            }
        }
        return merged;
    }
    const out = {};
    for (const [key, value] of Object.entries(node)) {
        out[key] = deref(value, refMap, chain);
    }
    return out;
}
let ApifoxMcpService = ApifoxMcpService_1 = class ApifoxMcpService {
    apifoxService;
    generator;
    logger = new common_1.Logger(ApifoxMcpService_1.name);
    constructor(apifoxService, generator) {
        this.apifoxService = apifoxService;
        this.generator = generator;
    }
    async listMcpApis(dto) {
        const { spec, unresolvedRefs } = await this.loadOas(dto.apifoxProjectId, dto.apifoxToken, dto.refresh);
        const moduleMap = this.generator.parseAllAndGroup(spec);
        const known = this.knownKeysOf(dto.catalogId);
        const items = [];
        for (const [moduleName, apis] of moduleMap) {
            if (dto.moduleName && moduleName !== dto.moduleName)
                continue;
            for (const api of apis) {
                items.push({
                    path: api.path,
                    method: api.method.toUpperCase(),
                    summary: api.summary,
                    functionName: api.functionName,
                    moduleName,
                    isNew: known ? !known.has(this.apiKey(api.method, api.path)) : true,
                    paramNames: (api.parameters || [])
                        .filter((p) => p.in === 'query' || p.in === 'path')
                        .map((p) => p.name),
                });
            }
        }
        items.sort((a, b) => a.moduleName.localeCompare(b.moduleName) || a.path.localeCompare(b.path));
        const modules = [...moduleMap.entries()]
            .filter(([name]) => !dto.moduleName || name === dto.moduleName)
            .map(([moduleName, apis]) => ({
            moduleName,
            count: apis.length,
            newCount: known
                ? apis.filter((a) => !known.has(this.apiKey(a.method, a.path))).length
                : apis.length,
        }))
            .sort((a, b) => a.moduleName.localeCompare(b.moduleName));
        const newCount = items.filter((i) => i.isNew).length;
        this.logger.log(`MCP 探测完成: project=${dto.apifoxProjectId}, ${items.length} 个接口（新增 ${newCount}）, ${modules.length} 个模块`);
        return {
            success: true,
            source: 'mcp',
            apifoxProjectId: dto.apifoxProjectId,
            projectTitle: spec.info?.title || '',
            totalPaths: Object.keys(spec.paths || {}).length,
            totalApis: items.length,
            newCount,
            baselineCatalogId: dto.catalogId || null,
            modules,
            apis: items,
            unresolvedRefs,
        };
    }
    async addMcpApis(dto) {
        const catalog = this.apifoxService.getCatalog(dto.catalogId);
        if (!catalog.zipPath || !(0, fs_1.existsSync)(catalog.zipPath)) {
            throw new common_1.NotFoundException(`目录产物 ZIP 不存在: ${catalog.catalogId}`);
        }
        const { spec } = await this.loadOas(dto.apifoxProjectId, dto.apifoxToken, dto.refresh);
        const moduleMap = this.generator.parseAllAndGroup(spec);
        const apis = moduleMap.get(dto.moduleName);
        if (!apis || apis.length === 0) {
            throw new common_1.BadRequestException(`MCP 文档中未找到模块 ${dto.moduleName} 的任何接口，请先重新探测。`);
        }
        const specKeys = new Set(apis.map((a) => this.apiKey(a.method, a.path)));
        const requested = (dto.keys || []).map((k) => this.apiKey(k.method, k.path));
        if (requested.length > 0 && !requested.some((k) => specKeys.has(k))) {
            throw new common_1.BadRequestException('选中的接口在最新的 MCP 文档中均不存在，请重新探测。');
        }
        const previousKeys = new Set();
        for (const m of catalog.modules) {
            if (m.moduleName !== dto.moduleName)
                continue;
            for (const f of m.functions)
                previousKeys.add(this.apiKey(f.method, f.path));
        }
        const date = new Date().toISOString().slice(0, 10);
        const generated = this.generator.generateFiles(apis, spec, dto.moduleName, dto.apifoxProjectId, date);
        const replacedZipEntries = this.replaceModuleInZip(catalog.zipPath, dto.moduleName, generated);
        const moduleFunctions = apis.map((a) => this.generator.toCatalogFunction(a, spec));
        const newModule = {
            moduleName: dto.moduleName,
            service: this.generator.serviceOf(apis),
            functions: moduleFunctions,
        };
        const modules = [...catalog.modules];
        const idx = modules.findIndex((m) => m.moduleName === dto.moduleName);
        if (idx >= 0)
            modules[idx] = newModule;
        else
            modules.push(newModule);
        const updatedCatalog = {
            ...catalog,
            generatedAt: new Date().toISOString(),
            modules,
            totalModuleCount: modules.length,
            totalApiCount: modules.reduce((sum, m) => sum + m.functions.length, 0),
        };
        this.apifoxService.saveCatalog(updatedCatalog, dto.ownerId);
        const existingTask = this.apifoxService
            .listMine()
            .find((t) => t.taskId === catalog.catalogId);
        this.apifoxService.recordTask({
            taskId: catalog.catalogId,
            moduleName: catalog.projectName || dto.moduleName,
            projectName: catalog.projectName || '',
            apifoxProjectId: dto.apifoxProjectId,
            taskType: existingTask?.taskType || (updatedCatalog.totalModuleCount > 1 ? 'full' : 'single'),
            ownerId: dto.ownerId || existingTask?.ownerId,
            fileNames: generated.map((f) => `${dto.moduleName}/${f.filename}`),
            apiCount: updatedCatalog.totalApiCount,
            zipPath: catalog.zipPath,
            downloadUrl: `/api/apifox/download?taskId=${catalog.catalogId}`,
        });
        const addedCount = requested.filter((k) => !previousKeys.has(k) && specKeys.has(k)).length;
        this.logger.log(`MCP 增量新增完成: catalog=${catalog.catalogId}, 模块=${dto.moduleName}, ` +
            `函数 ${previousKeys.size} → ${moduleFunctions.length}（本次选中新增 ${addedCount}）, ` +
            `ZIP 替换 ${replacedZipEntries} 个条目`);
        return {
            success: true,
            source: 'mcp',
            catalogId: catalog.catalogId,
            moduleName: dto.moduleName,
            service: newModule.service,
            addedApiCount: addedCount,
            moduleFunctionCount: moduleFunctions.length,
            previousModuleFunctionCount: previousKeys.size,
            totalApiCount: updatedCatalog.totalApiCount,
            totalModuleCount: updatedCatalog.totalModuleCount,
            files: generated.map((f) => `${dto.moduleName}/${f.filename}`),
            replacedZipEntries,
            downloadUrl: `/api/apifox/download?taskId=${catalog.catalogId}`,
        };
    }
    replaceModuleInZip(zipPath, moduleName, files) {
        const zip = new adm_zip_1.default(zipPath);
        const prefix = `${moduleName}/`;
        const stale = zip
            .getEntries()
            .map((e) => e.entryName)
            .filter((name) => name.startsWith(prefix));
        for (const name of stale)
            zip.deleteFile(name);
        for (const f of files) {
            zip.addFile(`${prefix}${f.filename}`, Buffer.from(f.content, 'utf8'));
        }
        zip.writeZip(zipPath);
        return stale.length;
    }
    knownKeysOf(catalogId) {
        if (!catalogId)
            return null;
        try {
            const catalog = this.apifoxService.getCatalog(catalogId);
            const keys = new Set();
            for (const m of catalog.modules) {
                for (const f of m.functions)
                    keys.add(this.apiKey(f.method, f.path));
            }
            return keys;
        }
        catch {
            this.logger.warn(`基准目录不可用（忽略 diff）: ${catalogId}`);
            return null;
        }
    }
    apiKey(method, path) {
        return `${(method || '').toUpperCase()} ${path}`;
    }
    resolveServerEntry() {
        const override = process.env.APIFOX_MCP_SERVER_ENTRY;
        if (override) {
            if (!(0, fs_1.existsSync)(override)) {
                throw new common_1.BadRequestException(`APIFOX_MCP_SERVER_ENTRY 指向的文件不存在: ${override}`);
            }
            return override;
        }
        try {
            return require.resolve(`${APIFOX_MCP_PACKAGE}/lib/index.js`);
        }
        catch {
            throw new common_1.BadRequestException(`未找到 ${APIFOX_MCP_PACKAGE}，请在后端目录执行 npm install，` +
                `或用 APIFOX_MCP_SERVER_ENTRY 指定其 lib/index.js 绝对路径。`);
        }
    }
    async loadOas(projectId, token, refresh) {
        if (!projectId)
            throw new common_1.BadRequestException('缺少 apifoxProjectId');
        const accessToken = (token || process.env.APIFOX_ACCESS_TOKEN || '').trim();
        if (!accessToken) {
            throw new common_1.BadRequestException('缺少 Apifox Access Token：apifox-mcp-server 启动即校验令牌，缺失会直接退出。' +
                '请在面板填入 Access Token，或在后端环境变量设置 APIFOX_ACCESS_TOKEN。');
        }
        const entry = this.resolveServerEntry();
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StdioClientTransport, getDefaultEnvironment } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        const env = { ...getDefaultEnvironment() };
        env.APIFOX_ACCESS_TOKEN = accessToken;
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: [entry, `--project-id=${projectId}`],
            env,
            stderr: 'ignore',
        });
        const client = new Client({ name: 'mvgo-backend', version: '1.0.0' }, { capabilities: {} });
        try {
            await withTimeout(client.connect(transport), MCP_TIMEOUT_MS, 'MCP server 连接超时');
            const toolNames = (await client.listTools()).tools.map((t) => t.name);
            const readTool = toolNames.find((n) => TOOL_READ_OAS.test(n) && !TOOL_REF_RESOURCES.test(n));
            const refTool = toolNames.find((n) => TOOL_REF_RESOURCES.test(n));
            const refreshTool = toolNames.find((n) => TOOL_REFRESH_OAS.test(n));
            if (!readTool || !refTool) {
                throw new common_1.BadRequestException(`MCP server 未暴露预期工具（read/ref_resources），实际: ${toolNames.join(', ') || '(空)'}`);
            }
            if (refresh && refreshTool) {
                try {
                    await withTimeout(client.callTool({ name: refreshTool, arguments: {} }), MCP_TIMEOUT_MS, 'MCP 刷新项目文档超时');
                    this.logger.log('MCP 已强制刷新项目文档缓存');
                }
                catch (error) {
                    this.logger.warn(`MCP refresh 失败（继续使用本地缓存）: ${error.message}`);
                }
            }
            const lite = await this.callToolJson(client, readTool, {});
            const { spec, unresolvedRefs } = await this.expandRefs(client, lite, refTool);
            return { spec, unresolvedRefs };
        }
        finally {
            try {
                await client.close();
            }
            catch {
            }
        }
    }
    async expandRefs(client, lite, refTool) {
        const refMap = new Map();
        let pending = [...collectAbsoluteRefs(lite)];
        const totalPending = pending.length;
        for (let round = 0; round < MAX_REF_ROUNDS && pending.length > 0; round++) {
            const newlyFound = new Set();
            let hitTotal = 0;
            for (let i = 0; i < pending.length; i += REF_CHUNK_SIZE) {
                const chunk = pending.slice(i, i + REF_CHUNK_SIZE);
                const payload = await this.callToolJson(client, refTool, { path: chunk });
                for (const [ref, raw] of Object.entries(payload || {})) {
                    const parsed = typeof raw === 'string' ? this.safeJsonParse(raw, ref) : raw;
                    if (parsed === undefined)
                        continue;
                    refMap.set(ref, parsed);
                    hitTotal++;
                    for (const nested of collectAbsoluteRefs(parsed)) {
                        if (!refMap.has(nested))
                            newlyFound.add(nested);
                    }
                }
            }
            this.logger.log(`MCP ref 展开 第${round + 1}轮: 待解析 ${pending.length}，命中 ${hitTotal}`);
            pending = [...newlyFound];
        }
        const spec = deref(lite, refMap);
        const unresolvedRefs = [...collectAbsoluteRefs(spec)];
        if (unresolvedRefs.length > 0) {
            this.logger.warn(`MCP 展开后仍有 ${unresolvedRefs.length} 个未解析引用（前 5）: ${unresolvedRefs
                .slice(0, 5)
                .join(', ')}`);
        }
        this.logger.log(`MCP OAS 展开完成: 首轮引用 ${totalPending} 条, 引用表 ${refMap.size} 条, ` +
            `路径 ${Object.keys(spec.paths || {}).length} 个, 残留引用 ${unresolvedRefs.length}`);
        return { spec, unresolvedRefs };
    }
    safeJsonParse(raw, ref) {
        try {
            return JSON.parse(raw);
        }
        catch (error) {
            this.logger.warn(`引用内容非 JSON，已跳过: ${ref} — ${error.message}`);
            return undefined;
        }
    }
    async callToolJson(client, name, args) {
        const result = await withTimeout(client.callTool({ name, arguments: args }), MCP_TIMEOUT_MS, `MCP 工具调用超时: ${name}`);
        const text = (result?.content || []).map((c) => c.text || '').join('');
        if (result?.isError) {
            throw new common_1.BadRequestException(`MCP 工具返回错误 (${name}): ${text.slice(0, 300)}`);
        }
        if (!text)
            throw new common_1.BadRequestException(`MCP 工具返回空内容: ${name}`);
        const parsed = this.safeJsonParse(text, name);
        if (parsed === undefined) {
            throw new common_1.BadRequestException(`MCP 工具返回内容不是合法 JSON: ${name}（${text.slice(0, 200)}）`);
        }
        return parsed;
    }
};
exports.ApifoxMcpService = ApifoxMcpService;
exports.ApifoxMcpService = ApifoxMcpService = ApifoxMcpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [apifox_service_1.ApifoxService,
        apifox_generator_service_1.ApifoxGeneratorService])
], ApifoxMcpService);
//# sourceMappingURL=apifox-mcp.service.js.map