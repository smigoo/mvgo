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
var ApifoxGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApifoxGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const fs_1 = require("fs");
const { ZipArchive } = require('archiver');
const apifox_service_1 = require("./apifox.service");
const backend_root_1 = require("../config/backend-root");
const SBDS_PREFIXES = ['/sbds', '/sbds-manage'];
function isSbds(path) {
    return SBDS_PREFIXES.some((p) => path.startsWith(p));
}
const HTTP_METHODS = ['get', 'post', 'put', 'delete'];
function toCamelCase(str) {
    return str
        .replace(/[-_ ](.)/g, (_, c) => c.toUpperCase())
        .replace(/^(.)/, (c) => c.toLowerCase());
}
function toPascalCase(str) {
    const camel = toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
}
function methodPrefix(method) {
    return { get: 'get', post: 'post', put: 'update', delete: 'delete' }[method] || method;
}
function pathToFunctionName(path, method) {
    const segments = path.split('/').filter(Boolean);
    const lastReal = [...segments].reverse().find((s) => !s.startsWith('{'));
    const name = lastReal || segments[segments.length - 1] || 'index';
    return methodPrefix(method) + toPascalCase(name);
}
function resolveRef(schema, spec) {
    if (!schema)
        return undefined;
    if (schema.$ref) {
        if (!spec)
            return undefined;
        const refName = schema.$ref.split('/').pop();
        return spec.components?.schemas?.[refName];
    }
    return schema;
}
function generateMockValue(schema, spec, fieldName) {
    const resolved = resolveRef(schema, spec);
    if (!resolved)
        return null;
    if (resolved.enum && resolved.enum.length)
        return resolved.enum[0];
    switch (resolved.type) {
        case 'string':
            if (resolved.format === 'date-time' || fieldName?.toLowerCase().includes('time'))
                return '2026-07-25 12:00:00';
            if (fieldName?.toLowerCase().includes('date'))
                return '2026-07-25';
            if (fieldName?.toLowerCase().includes('name'))
                return '示例名称';
            if (fieldName?.toLowerCase().includes('code'))
                return '200';
            return '示例文本';
        case 'integer':
        case 'number':
            return 123;
        case 'boolean':
            return true;
        case 'array': {
            const item = generateMockValue(resolved.items, spec, fieldName);
            return Array.from({ length: 2 }, () => typeof item === 'object' && item !== null ? { ...item } : item);
        }
        case 'object': {
            if (!resolved.properties)
                return {};
            const obj = {};
            for (const [key, val] of Object.entries(resolved.properties)) {
                obj[key] = generateMockValue(val, spec, key);
            }
            return obj;
        }
        default:
            return null;
    }
}
function extractEnums(spec) {
    const enums = [];
    const seen = new Set();
    function scanSchema(schema, nameHint) {
        const resolved = resolveRef(schema, spec);
        if (!resolved)
            return;
        if (resolved.enum && resolved.enum.length >= 2 && nameHint) {
            const enumName = nameHint.toUpperCase().replace(/[-\s]/g, '_');
            if (!seen.has(enumName)) {
                seen.add(enumName);
                enums.push({
                    name: enumName,
                    values: resolved.enum,
                    descriptions: resolved.enum.map((v) => String(v)),
                });
            }
        }
        if (resolved.properties) {
            for (const [key, val] of Object.entries(resolved.properties)) {
                scanSchema(val, key);
            }
        }
        if (resolved.items) {
            scanSchema(resolved.items, nameHint);
        }
    }
    if (spec.components?.schemas) {
        for (const [name, schema] of Object.entries(spec.components.schemas)) {
            scanSchema(schema, name);
        }
    }
    if (spec.paths) {
        for (const ops of Object.values(spec.paths)) {
            for (const op of Object.values(ops)) {
                op.parameters?.forEach((p) => scanSchema(p.schema, p.name));
            }
        }
    }
    return enums;
}
let ApifoxGeneratorService = ApifoxGeneratorService_1 = class ApifoxGeneratorService {
    apifoxService;
    logger = new common_1.Logger(ApifoxGeneratorService_1.name);
    constructor(apifoxService) {
        this.apifoxService = apifoxService;
    }
    async generate(dto) {
        const baseUrl = dto.apifoxBaseUrl || 'https://api.apifox.com';
        const url = `${baseUrl}/v1/projects/${dto.apifoxProjectId}/export-openapi?locale=zh-CN`;
        this.logger.log(`开始从 Apifox 导出 OpenAPI: projectId=${dto.apifoxProjectId}`);
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'X-Apifox-Api-Version': '2024-03-28',
                Authorization: `Bearer ${dto.apifoxToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                scope: { type: 'ALL' },
                options: { includeApifoxExtensionProperties: false, addFoldersToTags: false },
                oasVersion: '3.0',
                exportFormat: 'JSON',
            }),
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new common_1.BadRequestException(`Apifox API 返回 ${resp.status}: ${text.slice(0, 200)}`);
        }
        const spec = (await resp.json());
        this.logger.log(`OpenAPI 导出成功: ${Object.keys(spec.paths || {}).length} 个路径`);
        const apis = this.parseAndFilter(spec, dto);
        if (apis.length === 0) {
            throw new common_1.BadRequestException(`未找到匹配的接口。pathFilter=${dto.pathFilter || dto.moduleName}，请检查模块名或路径前缀。`);
        }
        this.logger.log(`匹配到 ${apis.length} 个接口`);
        const date = new Date().toISOString().slice(0, 10);
        const generated = this.generateFiles(apis, spec, dto.moduleName, dto.apifoxProjectId, date);
        const taskId = `apifox-${dto.moduleName}-${Date.now()}`;
        const zipPath = await this.createZip(taskId, dto.moduleName, generated);
        const sbds = apis.some((a) => isSbds(a.path));
        const service = sbds ? 'sbds-server' : 'base-server';
        const singleCatalog = {
            catalogId: taskId,
            apifoxProjectId: dto.apifoxProjectId,
            projectName: '',
            generatedAt: new Date().toISOString(),
            zipPath,
            totalApiCount: apis.length,
            totalModuleCount: 1,
            modules: [
                {
                    moduleName: dto.moduleName,
                    service,
                    functions: apis.map((a) => this.toCatalogFunction(a, spec)),
                },
            ],
        };
        this.apifoxService.saveCatalog(singleCatalog, dto.ownerId);
        const task = this.apifoxService.recordTask({
            taskId,
            moduleName: dto.moduleName,
            projectName: '',
            apifoxProjectId: dto.apifoxProjectId,
            taskType: 'single',
            ownerId: dto.ownerId,
            fileNames: generated.map((f) => f.filename),
            apiCount: apis.length,
            zipPath,
            downloadUrl: `/api/apifox/download?taskId=${taskId}`,
        });
        return {
            success: true,
            taskId,
            downloadUrl: task.downloadUrl,
            apiCount: apis.length,
            files: generated.map((f) => f.filename),
            fileContents: generated,
        };
    }
    async generateFull(dto) {
        const baseUrl = dto.apifoxBaseUrl || 'https://api.apifox.com';
        const url = `${baseUrl}/v1/projects/${dto.apifoxProjectId}/export-openapi?locale=zh-CN`;
        this.logger.log(`全量导出 OpenAPI: projectId=${dto.apifoxProjectId}`);
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'X-Apifox-Api-Version': '2024-03-28',
                Authorization: `Bearer ${dto.apifoxToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                scope: { type: 'ALL' },
                options: { includeApifoxExtensionProperties: false, addFoldersToTags: false },
                oasVersion: '3.0',
                exportFormat: 'JSON',
            }),
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new common_1.BadRequestException(`Apifox API 返回 ${resp.status}: ${text.slice(0, 200)}`);
        }
        const spec = (await resp.json());
        const totalPaths = Object.keys(spec.paths || {}).length;
        this.logger.log(`OpenAPI 全量导出成功: ${totalPaths} 个路径`);
        const moduleMap = this.parseAllAndGroup(spec);
        if (moduleMap.size === 0) {
            throw new common_1.BadRequestException('OpenAPI spec 中未找到任何接口');
        }
        this.logger.log(`分组完成: ${moduleMap.size} 个模块, 共 ${[...moduleMap.values()].reduce((s, a) => s + a.length, 0)} 个接口`);
        const date = new Date().toISOString().slice(0, 10);
        const allFiles = [];
        const catalogModules = [];
        for (const [moduleName, apis] of moduleMap) {
            const generated = this.generateFiles(apis, spec, moduleName, dto.apifoxProjectId, date);
            for (const f of generated) {
                allFiles.push({ ...f, moduleName });
            }
            const sbds = apis.some((a) => isSbds(a.path));
            const service = sbds ? 'sbds-server' : 'base-server';
            catalogModules.push({
                moduleName,
                service,
                functions: apis.map((a) => this.toCatalogFunction(a, spec)),
            });
        }
        const catalogId = `cat-${Date.now()}`;
        const zipPath = await this.createFullZip(catalogId, allFiles);
        const resolvedProjectName = dto.projectName || spec.info?.title || `Project ${dto.apifoxProjectId}`;
        const catalog = {
            catalogId,
            apifoxProjectId: dto.apifoxProjectId,
            projectName: resolvedProjectName,
            generatedAt: new Date().toISOString(),
            zipPath,
            totalApiCount: allFiles.length / 4,
            totalModuleCount: moduleMap.size,
            modules: catalogModules,
        };
        catalog.totalApiCount = catalogModules.reduce((s, m) => s + m.functions.length, 0);
        this.apifoxService.saveCatalog(catalog, dto.ownerId);
        this.apifoxService.recordTask({
            taskId: catalogId,
            moduleName: resolvedProjectName,
            projectName: resolvedProjectName,
            apifoxProjectId: dto.apifoxProjectId,
            taskType: 'full',
            ownerId: dto.ownerId,
            fileNames: allFiles.map((f) => `${f.moduleName}/${f.filename}`),
            apiCount: catalog.totalApiCount,
            zipPath,
            downloadUrl: `/api/apifox/download?taskId=${catalogId}`,
        });
        this.logger.log(`全量生成完成: catalogId=${catalogId}, ${catalog.totalApiCount} 个接口, ${moduleMap.size} 个模块`);
        return {
            success: true,
            catalogId,
            totalApiCount: catalog.totalApiCount,
            totalModuleCount: moduleMap.size,
            modules: catalogModules.map((m) => ({ moduleName: m.moduleName, functionCount: m.functions.length })),
            downloadUrl: `/api/apifox/download?taskId=${catalogId}`,
        };
    }
    toParsedApi(path, method, op) {
        const responseSchema = op.responses?.['200']?.content?.['application/json']?.schema ||
            op.responses?.['200']?.content?.['*/*']?.schema;
        const bodySchema = op.requestBody?.content?.['application/json']?.schema;
        return {
            path,
            method,
            summary: op.summary || '',
            description: op.description || '',
            functionName: pathToFunctionName(path, method),
            parameters: op.parameters || [],
            hasBody: !!bodySchema,
            bodySchema,
            responseSchema,
        };
    }
    moduleNameOf(path, op) {
        if (op.tags && op.tags.length > 0)
            return toCamelCase(op.tags[0]);
        const segments = path.split('/').filter(Boolean);
        return segments[0] ? toCamelCase(segments[0]) : 'default';
    }
    serviceOf(apis) {
        return apis.some((a) => isSbds(a.path)) ? 'sbds-server' : 'base-server';
    }
    parseAllAndGroup(spec) {
        const moduleMap = new Map();
        for (const [path, methods] of Object.entries(spec.paths || {})) {
            for (const [method, op] of Object.entries(methods)) {
                if (!HTTP_METHODS.includes(method))
                    continue;
                const moduleName = this.moduleNameOf(path, op);
                if (!moduleMap.has(moduleName)) {
                    moduleMap.set(moduleName, []);
                }
                moduleMap.get(moduleName).push(this.toParsedApi(path, method, op));
            }
        }
        return moduleMap;
    }
    toCatalogFunction(api, spec) {
        const responseSchema = resolveRef(api.responseSchema, spec);
        const responsePreview = this.buildResponsePreview(responseSchema);
        return {
            name: api.functionName,
            method: api.method.toUpperCase(),
            path: api.path,
            summary: api.summary,
            tags: [],
            params: api.parameters
                .filter((p) => p.in === 'query' || p.in === 'path')
                .map((p) => {
                const schema = p.schema || {};
                const result = {
                    name: p.name,
                    in: p.in,
                    required: p.required || false,
                    type: schema.type || 'string',
                    description: p.description || '',
                };
                if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
                    result.enumValues = schema.enum;
                }
                const pExample = p.example;
                if (pExample !== undefined && pExample !== null && pExample !== '') {
                    result.example = pExample;
                }
                else if (schema.example !== undefined && schema.example !== null && schema.example !== '') {
                    result.example = schema.example;
                }
                else {
                    result.example = this.inferDefaultValue(p.name, result.type, result.description, result.enumValues);
                }
                return result;
            }),
            hasBody: api.hasBody,
            responsePreview,
        };
    }
    inferDefaultValue(name, type, description, enumValues) {
        if (enumValues && enumValues.length > 0) {
            return enumValues[0];
        }
        const enumMatch = description.match(/[：:]\s*([A-Z_]+(?:\/[A-Z_]+)+)/);
        if (enumMatch) {
            const values = enumMatch[1].split('/');
            return values[0];
        }
        const nameLower = name.toLowerCase();
        if (nameLower.includes('id') || nameLower.includes('code') || nameLower.includes('num')) {
            if (type === 'integer' || type === 'number')
                return 1;
            return 'SAMPLE001';
        }
        if (nameLower.includes('type') || nameLower.includes('status')) {
            return 'DEFAULT';
        }
        if (nameLower.includes('page') || nameLower.includes('size') || nameLower.includes('limit')) {
            return type === 'integer' || type === 'number' ? 10 : '10';
        }
        if (nameLower.includes('date') || nameLower.includes('time')) {
            return new Date().toISOString().split('T')[0];
        }
        switch (type) {
            case 'integer':
            case 'number':
                return 0;
            case 'boolean':
                return false;
            case 'string':
            default:
                return 'example';
        }
    }
    buildResponsePreview(schema) {
        if (!schema)
            return 'unknown';
        const resolved = schema;
        if (resolved.type === 'object' && resolved.properties) {
            const fields = Object.keys(resolved.properties);
            return `{ ${fields.join(', ')} }`;
        }
        if (resolved.type === 'array' && resolved.items) {
            const item = resolveRef(resolved.items, undefined);
            if (item?.type === 'object' && item.properties) {
                const fields = Object.keys(item.properties);
                return `[{ ${fields.join(', ')} }]`;
            }
            return '[ ... ]';
        }
        return resolved.type || 'unknown';
    }
    async createFullZip(catalogId, files) {
        const zipDir = backend_root_1.apifoxZipsDir;
        if (!(0, fs_1.existsSync)(zipDir))
            (0, fs_1.mkdirSync)(zipDir, { recursive: true });
        const zipPath = (0, path_1.join)(zipDir, `${catalogId}.zip`);
        return new Promise((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const output = [];
            archive.on('data', (chunk) => output.push(chunk));
            archive.on('end', () => {
                (0, fs_1.writeFileSync)(zipPath, Buffer.concat(output));
                resolve(zipPath);
            });
            archive.on('error', (err) => reject(err));
            for (const f of files) {
                archive.append(f.content, { name: `${f.moduleName}/${f.filename}` });
            }
            archive.finalize();
        });
    }
    parseAndFilter(spec, dto) {
        const filter = dto.pathFilter || `/${dto.moduleName}`;
        const apis = [];
        for (const [path, methods] of Object.entries(spec.paths || {})) {
            if (!path.startsWith(filter))
                continue;
            for (const [method, op] of Object.entries(methods)) {
                if (!HTTP_METHODS.includes(method))
                    continue;
                apis.push(this.toParsedApi(path, method, op));
            }
        }
        return apis;
    }
    generateFiles(apis, spec, moduleName, projectId, date) {
        const sbds = apis.some((a) => isSbds(a.path));
        const service = sbds ? 'sbds-server' : 'base-server';
        const createRequestExpr = sbds ? `createRequest('SBDS_SERVER')` : `createRequest()`;
        const result = [];
        result.push({
            filename: `${moduleName}.js`,
            content: this.generateApiJs(apis, moduleName, service, projectId, date, createRequestExpr),
        });
        result.push({
            filename: `${moduleName}.mock.js`,
            content: this.generateMockJs(apis, spec, moduleName, date),
        });
        const enums = extractEnums(spec);
        result.push({
            filename: `${moduleName}-enums.js`,
            content: this.generateEnumsJs(enums, moduleName, date),
        });
        result.push({
            filename: `${moduleName}.usage.md`,
            content: this.generateUsageMd(apis, moduleName, service, projectId, date),
        });
        return result;
    }
    async createZip(taskId, moduleName, files) {
        const zipDir = backend_root_1.apifoxZipsDir;
        if (!(0, fs_1.existsSync)(zipDir))
            (0, fs_1.mkdirSync)(zipDir, { recursive: true });
        const zipPath = (0, path_1.join)(zipDir, `${taskId}.zip`);
        return new Promise((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const output = [];
            archive.on('data', (chunk) => output.push(chunk));
            archive.on('end', () => {
                (0, fs_1.writeFileSync)(zipPath, Buffer.concat(output));
                resolve(zipPath);
            });
            archive.on('error', (err) => reject(err));
            for (const f of files) {
                archive.append(f.content, { name: `${moduleName}/${f.filename}` });
            }
            archive.finalize();
        });
    }
    generateApiJs(apis, moduleName, service, projectId, date, createRequestExpr) {
        const lines = [];
        lines.push(`/*`);
        lines.push(` * @module ${moduleName}`);
        lines.push(` * @service ${service}`);
        lines.push(` * @说明 ${moduleName} 模块接口`);
        lines.push(` * @source Apifox Project #${projectId}`);
        lines.push(` * @Date: ${date}`);
        lines.push(` */`);
        lines.push(``);
        lines.push(`import { createRequest } from 'microvideo-request'`);
        lines.push(``);
        lines.push(`export default {`);
        apis.forEach((api, i) => {
            const hasParams = api.parameters.some((p) => p.in === 'query' || p.in === 'path') || api.hasBody;
            const method = api.method.toUpperCase();
            const paramArg = hasParams ? 'params' : '';
            lines.push(`  // ==================== ${i + 1}. ${api.summary || api.functionName} ====================`);
            lines.push(`  /**`);
            lines.push(`   * ${api.summary || api.functionName}`);
            if (api.description)
                lines.push(`   * ${api.description}`);
            if (hasParams) {
                lines.push(`   * @param {Object} params - 请求参数`);
                api.parameters
                    .filter((p) => p.in === 'query' || p.in === 'path')
                    .forEach((p) => {
                    lines.push(`   * @param {*} params.${p.name} — ${p.description || p.name}${p.required ? '（必填）' : ''}`);
                });
                if (api.hasBody)
                    lines.push(`   * @param {Object} params.data — 请求体`);
            }
            lines.push(`   * @returns {Object} { rid, code, message, detail, data }`);
            lines.push(`   * @example`);
            lines.push(`   * import ${toCamelCase(moduleName)}Api from '@/api/${moduleName}'`);
            lines.push(`   * const res = await ${toCamelCase(moduleName)}Api.${api.functionName}(${paramArg ? '{ ... }' : ''})`);
            lines.push(`   */`);
            if (hasParams) {
                const chainParts = [`.setParameters(params)`];
                if (api.hasBody)
                    chainParts.push(`.setData(params.data || params)`);
                if (method === 'GET')
                    chainParts.push(`.get('${api.path}')`);
                else if (method === 'POST')
                    chainParts.push(`.post('${api.path}')`);
                else if (method === 'PUT')
                    chainParts.push(`.put('${api.path}')`);
                else
                    chainParts.push(`.delete('${api.path}')`);
                lines.push(`  ${api.functionName}(params) {`);
                lines.push(`    return ${createRequestExpr}`);
                chainParts.forEach((p) => lines.push(`      ${p}`));
                lines.push(`  },`);
            }
            else {
                lines.push(`  ${api.functionName}() {`);
                lines.push(`    return ${createRequestExpr}`);
                lines.push(`      .${method.toLowerCase()}('${api.path}')`);
                lines.push(`  },`);
            }
            lines.push(``);
        });
        lines.push(`}`);
        return lines.join('\n');
    }
    generateMockJs(apis, spec, moduleName, date) {
        const lines = [];
        lines.push(`/*`);
        lines.push(` * @module ${moduleName}.mock`);
        lines.push(` * @说明 ${moduleName} 模块 Mock 数据`);
        lines.push(` * @用法 import { mock${toPascalCase(apis[0]?.functionName || moduleName)} } from '@/api/${moduleName}.mock'`);
        lines.push(` * @注意 本文件已在 .gitignore 中忽略，无需提交`);
        lines.push(` * @Date: ${date}`);
        lines.push(` */`);
        lines.push(``);
        apis.forEach((api, i) => {
            const mockData = generateMockValue(api.responseSchema, spec);
            const pascalName = toPascalCase(api.functionName);
            lines.push(`/**`);
            lines.push(` * ${api.summary || api.functionName} — Mock 响应`);
            lines.push(` */`);
            lines.push(`export const mock${pascalName} = ${JSON.stringify(mockData, null, 2)}`);
            lines.push(``);
        });
        return lines.join('\n');
    }
    generateEnumsJs(enums, moduleName, date) {
        const lines = [];
        lines.push(`/*`);
        lines.push(` * @module ${moduleName}-enums`);
        lines.push(` * @说明 ${moduleName} 模块枚举常量`);
        lines.push(` * @Date: ${date}`);
        lines.push(` */`);
        lines.push(``);
        if (enums.length === 0) {
            lines.push(`// 本模块暂无枚举`);
            lines.push(`export default {}`);
            return lines.join('\n');
        }
        enums.forEach((e) => {
            lines.push(`export const ${e.name}_MAP = {`);
            e.values.forEach((v, i) => {
                lines.push(`  ${typeof v === 'string' ? `'${v}'` : v}: '${e.descriptions[i] || v}',`);
            });
            lines.push(`}`);
            lines.push(``);
            lines.push(`export const ${e.name}_OPTIONS = [`);
            e.values.forEach((v, i) => {
                lines.push(`  { label: '${e.descriptions[i] || v}', value: ${typeof v === 'string' ? `'${v}'` : v} },`);
            });
            lines.push(`]`);
            lines.push(``);
        });
        return lines.join('\n');
    }
    generateUsageMd(apis, moduleName, service, projectId, date) {
        const lines = [];
        lines.push(`# ${moduleName} 使用文档`);
        lines.push(``);
        lines.push(`> 生成时间：${date}  `);
        lines.push(`> 数据来源：Apifox Project #${projectId}  `);
        lines.push(`> 请求封装：\`microvideo-request\` → \`createRequest()\` (${service})  `);
        lines.push(`> 通用参数（token / projectId / operatorCode）由拦截器自动注入`);
        lines.push(``);
        lines.push(`## 接口一览`);
        lines.push(``);
        lines.push(`| # | 函数名 | 接口路径 | 方法 | 说明 |`);
        lines.push(`|---|--------|---------|------|------|`);
        apis.forEach((api, i) => {
            lines.push(`| ${i + 1} | \`${api.functionName}\` | \`${api.path}\` | ${api.method.toUpperCase()} | ${api.summary || ''} |`);
        });
        lines.push(``);
        lines.push(`---`);
        lines.push(``);
        apis.forEach((api, i) => {
            const hasParams = api.parameters.some((p) => p.in === 'query' || p.in === 'path') || api.hasBody;
            lines.push(`## ${i + 1}. ${api.functionName}()`);
            lines.push(``);
            lines.push(`${api.summary || ''}`);
            lines.push(``);
            if (hasParams) {
                lines.push(`**参数**：`);
                lines.push(``);
                const queryParams = api.parameters.filter((p) => p.in === 'query' || p.in === 'path');
                if (queryParams.length) {
                    lines.push(`| 参数名 | 类型 | 必填 | 说明 |`);
                    lines.push(`|--------|------|------|------|`);
                    queryParams.forEach((p) => {
                        lines.push(`| \`${p.name}\` | ${p.schema?.type || 'any'} | ${p.required ? '是' : '否'} | ${p.description || ''} |`);
                    });
                    lines.push(``);
                }
                if (api.hasBody)
                    lines.push(`**请求体**：见 Apifox 文档定义`);
            }
            else {
                lines.push(`**参数**：无`);
            }
            lines.push(``);
            lines.push(`**示例**：`);
            lines.push(`\`\`\`js`);
            lines.push(`import ${toCamelCase(moduleName)}Api from '@/api/${moduleName}'`);
            lines.push(``);
            lines.push(`const res = await ${toCamelCase(moduleName)}Api.${api.functionName}(${hasParams ? '{ /* params */ }' : ''})`);
            lines.push(`\`\`\``);
            lines.push(``);
            lines.push(`---`);
            lines.push(``);
        });
        return lines.join('\n');
    }
    async listPaths(dto) {
        const baseUrl = dto.apifoxBaseUrl || 'https://api.apifox.com';
        const url = `${baseUrl}/v1/projects/${dto.apifoxProjectId}/export-openapi?locale=zh-CN`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'X-Apifox-Api-Version': '2024-03-28',
                Authorization: `Bearer ${dto.apifoxToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                scope: { type: 'ALL' },
                options: { includeApifoxExtensionProperties: false, addFoldersToTags: false },
                oasVersion: '3.0',
                exportFormat: 'JSON',
            }),
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new common_1.BadRequestException(`Apifox API 返回 ${resp.status}: ${text.slice(0, 200)}`);
        }
        const spec = (await resp.json());
        const paths = spec.paths || {};
        const pathList = Object.keys(paths);
        const groups = new Map();
        for (const p of pathList) {
            const segments = p.split('/').filter(Boolean);
            if (segments.length === 0)
                continue;
            const firstSeg = segments[0];
            const key = `/${firstSeg}`;
            if (!groups.has(key)) {
                groups.set(key, { prefix: key, count: 0, sample: p, methods: new Set() });
            }
            const g = groups.get(key);
            g.count += 1;
            for (const m of Object.keys(paths[p] || {})) {
                if (['get', 'post', 'put', 'delete'].includes(m))
                    g.methods.add(m.toUpperCase());
            }
        }
        const modules = Array.from(groups.values())
            .map((g) => ({ ...g, methods: Array.from(g.methods).sort() }))
            .sort((a, b) => b.count - a.count);
        return {
            success: true,
            totalPaths: pathList.length,
            modules,
            projectTitle: spec.info?.title || '',
        };
    }
};
exports.ApifoxGeneratorService = ApifoxGeneratorService;
exports.ApifoxGeneratorService = ApifoxGeneratorService = ApifoxGeneratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [apifox_service_1.ApifoxService])
], ApifoxGeneratorService);
//# sourceMappingURL=apifox-generator.service.js.map