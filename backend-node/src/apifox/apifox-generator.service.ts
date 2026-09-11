import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
const { ZipArchive } = require('archiver');
import { ApifoxService, ApiCatalog, ApiCatalogModule, ApiCatalogFunction } from './apifox.service';
import { GenerateApifoxDto } from './dto/generate-apifox.dto';
import { GenerateFullApifoxDto } from './dto/generate-full-apifox.dto';
import { apifoxZipsDir } from '../config/backend-root';

// ─── 类型定义 ────────────────────────────────────────────
interface OasSchema {
  type?: string;
  properties?: Record<string, OasSchema>;
  items?: OasSchema;
  $ref?: string;
  enum?: (string | number)[];
  description?: string;
  format?: string;
  example?: any;
  required?: string[];
}

interface OasParameter {
  name: string;
  in: string; // query | path | header
  required?: boolean;
  schema?: OasSchema;
  description?: string;
}

interface OasOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OasParameter[];
  requestBody?: {
    content?: Record<string, { schema?: OasSchema }>;
  };
  responses?: Record<string, { content?: Record<string, { schema?: OasSchema }>; description?: string }>;
  operationId?: string;
}

interface OasSpec {
  openapi: string;
  info?: { title?: string; description?: string; version?: string };
  paths?: Record<string, Record<string, OasOperation>>;
  components?: { schemas?: Record<string, OasSchema> };
  servers?: { url: string }[];
}

interface ParsedApi {
  path: string;
  method: string; // get | post | put | delete
  summary: string;
  description: string;
  functionName: string;
  parameters: OasParameter[];
  hasBody: boolean;
  bodySchema?: OasSchema;
  responseSchema?: OasSchema;
}

// ─── 路径前缀 → 服务映射 ────────────────────────────────
const SBDS_PREFIXES = ['/sbds', '/sbds-manage'];
function isSbds(path: string): boolean {
  return SBDS_PREFIXES.some((p) => path.startsWith(p));
}

// ─── 工具函数 ────────────────────────────────────────────
function toCamelCase(str: string): string {
  return str
    .replace(/[-_ ](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toLowerCase());
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function methodPrefix(method: string): string {
  return { get: 'get', post: 'post', put: 'update', delete: 'delete' }[method] || method;
}

/** 从路径生成函数名：/flow/today-flow → todayFlow */
function pathToFunctionName(path: string, method: string): string {
  const segments = path.split('/').filter(Boolean);
  // 取最后一个有意义段（跳过路径参数 {id}）
  const lastReal = [...segments].reverse().find((s) => !s.startsWith('{'));
  const name = lastReal || segments[segments.length - 1] || 'index';
  return methodPrefix(method) + toPascalCase(name);
}

/** 解析 $ref → schema */
function resolveRef(schema: OasSchema | undefined, spec: OasSpec | undefined): OasSchema | undefined {
  if (!schema) return undefined;
  if (schema.$ref) {
    if (!spec) return undefined;
    const refName = schema.$ref.split('/').pop()!;
    return spec.components?.schemas?.[refName];
  }
  return schema;
}

/** 生成中文 mock 值 */
function generateMockValue(schema: OasSchema | undefined, spec: OasSpec, fieldName?: string): any {
  const resolved = resolveRef(schema, spec);
  if (!resolved) return null;

  // 枚举
  if (resolved.enum && resolved.enum.length) return resolved.enum[0];

  switch (resolved.type) {
    case 'string':
      if (resolved.format === 'date-time' || fieldName?.toLowerCase().includes('time'))
        return '2026-07-25 12:00:00';
      if (fieldName?.toLowerCase().includes('date')) return '2026-07-25';
      if (fieldName?.toLowerCase().includes('name')) return '示例名称';
      if (fieldName?.toLowerCase().includes('code')) return '200';
      return '示例文本';
    case 'integer':
    case 'number':
      return 123;
    case 'boolean':
      return true;
    case 'array': {
      const item = generateMockValue(resolved.items, spec, fieldName);
      return Array.from({ length: 2 }, () =>
        typeof item === 'object' && item !== null ? { ...item } : item,
      );
    }
    case 'object': {
      if (!resolved.properties) return {};
      const obj: Record<string, any> = {};
      for (const [key, val] of Object.entries(resolved.properties)) {
        obj[key] = generateMockValue(val, spec, key);
      }
      return obj;
    }
    default:
      return null;
  }
}

/** 从 schema 提取枚举 */
interface EnumDef {
  name: string;
  values: (string | number)[];
  descriptions: string[];
}
function extractEnums(spec: OasSpec): EnumDef[] {
  const enums: EnumDef[] = [];
  const seen = new Set<string>();

  function scanSchema(schema: OasSchema | undefined, nameHint?: string) {
    const resolved = resolveRef(schema, spec);
    if (!resolved) return;

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

  // 扫描 components.schemas
  if (spec.components?.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      scanSchema(schema, name);
    }
  }
  // 扫描 paths 中的参数
  if (spec.paths) {
    for (const ops of Object.values(spec.paths)) {
      for (const op of Object.values(ops)) {
        op.parameters?.forEach((p) => scanSchema(p.schema, p.name));
      }
    }
  }

  return enums;
}

// ─── Service ─────────────────────────────────────────────
@Injectable()
export class ApifoxGeneratorService {
  private readonly logger = new Logger(ApifoxGeneratorService.name);

  constructor(private readonly apifoxService: ApifoxService) {}

  async generate(dto: GenerateApifoxDto) {
    const baseUrl = dto.apifoxBaseUrl || 'https://api.apifox.com';
    const url = `${baseUrl}/v1/projects/${dto.apifoxProjectId}/export-openapi?locale=zh-CN`;

    this.logger.log(`开始从 Apifox 导出 OpenAPI: projectId=${dto.apifoxProjectId}`);

    // 1. 调 Apifox API
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
      throw new BadRequestException(
        `Apifox API 返回 ${resp.status}: ${text.slice(0, 200)}`,
      );
    }

    const spec = (await resp.json()) as OasSpec;
    this.logger.log(`OpenAPI 导出成功: ${Object.keys(spec.paths || {}).length} 个路径`);

    // 2. 解析 + 过滤
    const apis = this.parseAndFilter(spec, dto);
    if (apis.length === 0) {
      throw new BadRequestException(
        `未找到匹配的接口。pathFilter=${dto.pathFilter || dto.moduleName}，请检查模块名或路径前缀。`,
      );
    }
    this.logger.log(`匹配到 ${apis.length} 个接口`);

    // 3. 在内存中生成 4 类文件（不写入源码树）
    const date = new Date().toISOString().slice(0, 10);
    const generated = this.generateFiles(apis, spec, dto.moduleName, dto.apifoxProjectId, date);

    // 4. 创建 ZIP 并存储到 backend/data/apifox-zips/
    const taskId = `apifox-${dto.moduleName}-${Date.now()}`;
    const zipPath = await this.createZip(taskId, dto.moduleName, generated);

    // 5. 持久化 API 目录（单模块：modules 单元素），使单模块历史也能点入详情页
    const sbds = apis.some((a) => isSbds(a.path));
    const service = sbds ? 'sbds-server' : 'base-server';
    const singleCatalog = {
      catalogId: taskId,
      apifoxProjectId: dto.apifoxProjectId,
      // 单模块场景 projectName 留空，避免污染历史列表显示（前端按 taskType 区分展示）
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

    // 6. 登记任务元数据（单模块：不写 projectName，让历史卡显示纯模块名）
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

  // ─── 全量生成：导出全部接口，按模块分组 ──────────────
  async generateFull(dto: GenerateFullApifoxDto) {
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
      throw new BadRequestException(`Apifox API 返回 ${resp.status}: ${text.slice(0, 200)}`);
    }

    const spec = (await resp.json()) as OasSpec;
    const totalPaths = Object.keys(spec.paths || {}).length;
    this.logger.log(`OpenAPI 全量导出成功: ${totalPaths} 个路径`);

    // 按模块分组
    const moduleMap = this.parseAllAndGroup(spec);
    if (moduleMap.size === 0) {
      throw new BadRequestException('OpenAPI spec 中未找到任何接口');
    }

    this.logger.log(`分组完成: ${moduleMap.size} 个模块, 共 ${[...moduleMap.values()].reduce((s, a) => s + a.length, 0)} 个接口`);

    // 对每个模块生成 4 类文件
    const date = new Date().toISOString().slice(0, 10);
    const allFiles: { filename: string; content: string; moduleName: string }[] = [];
    const catalogModules: ApiCatalogModule[] = [];

    for (const [moduleName, apis] of moduleMap) {
      const generated = this.generateFiles(apis, spec, moduleName, dto.apifoxProjectId, date);
      for (const f of generated) {
        allFiles.push({ ...f, moduleName });
      }

      // 构建 catalog 模块信息
      const sbds = apis.some((a) => isSbds(a.path));
      const service = sbds ? 'sbds-server' : 'base-server';
      catalogModules.push({
        moduleName,
        service,
        functions: apis.map((a) => this.toCatalogFunction(a, spec)),
      });
    }

    // 创建 ZIP（所有模块放一个 ZIP）
    const catalogId = `cat-${Date.now()}`;
    const zipPath = await this.createFullZip(catalogId, allFiles);

    // 持久化 API 目录
    const resolvedProjectName = dto.projectName || spec.info?.title || `Project ${dto.apifoxProjectId}`;
    const catalog: ApiCatalog = {
      catalogId,
      apifoxProjectId: dto.apifoxProjectId,
      projectName: resolvedProjectName,
      generatedAt: new Date().toISOString(),
      zipPath,
      totalApiCount: allFiles.length / 4, // 每模块4文件，但这里应该用接口数
      totalModuleCount: moduleMap.size,
      modules: catalogModules,
    };
    // 修正 totalApiCount
    catalog.totalApiCount = catalogModules.reduce((s, m) => s + m.functions.length, 0);

    this.apifoxService.saveCatalog(catalog, dto.ownerId);

    // 也登记为任务（便于历史列表展示）
    // projectName 统一用用户填写的项目名（resolvedProjectName），不再回退到 spec.info?.title
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

  // ─── 全量解析 + 按模块分组 ──────────────────────────
  private parseAllAndGroup(spec: OasSpec): Map<string, ParsedApi[]> {
    const moduleMap = new Map<string, ParsedApi[]>();

    for (const [path, methods] of Object.entries(spec.paths || {})) {
      for (const [method, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'delete'].includes(method)) continue;

        // 确定模块名：优先用 tag，否则用路径第一段
        let moduleName = '';
        if (op.tags && op.tags.length > 0) {
          moduleName = toCamelCase(op.tags[0]);
        }
        if (!moduleName) {
          const segments = path.split('/').filter(Boolean);
          moduleName = segments[0] ? toCamelCase(segments[0]) : 'default';
        }

        const responseSchema =
          op.responses?.['200']?.content?.['application/json']?.schema ||
          op.responses?.['200']?.content?.['*/*']?.schema;
        const bodySchema = op.requestBody?.content?.['application/json']?.schema;

        const api: ParsedApi = {
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

        if (!moduleMap.has(moduleName)) {
          moduleMap.set(moduleName, []);
        }
        moduleMap.get(moduleName)!.push(api);
      }
    }

    return moduleMap;
  }

  // ─── 转换为 catalog 函数信息 ────────────────────────
  private toCatalogFunction(api: ParsedApi, spec: OasSpec): ApiCatalogFunction {
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
          const result: any = {
            name: p.name,
            in: p.in,
            required: p.required || false,
            type: schema.type || 'string',
            description: p.description || '',
          };
          if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
            result.enumValues = schema.enum;
          }
          const pExample = (p as any).example;
          if (pExample !== undefined && pExample !== null && pExample !== '') {
            result.example = pExample;
          } else if (schema.example !== undefined && schema.example !== null && schema.example !== '') {
            result.example = schema.example;
          } else {
            // 治本：当 Apifox 未提供 example 时，智能生成默认值
            result.example = this.inferDefaultValue(p.name, result.type, result.description, result.enumValues);
          }
          return result;
        }),
      hasBody: api.hasBody,
      responsePreview,
    };
  }

  /**
   * 智能推断参数默认值
   * 优先级：description 中的枚举值 > 参数名模式匹配 > 类型默认值
   */
  private inferDefaultValue(name: string, type: string, description: string, enumValues?: (string | number)[]): any {
    // 1. 从 description 提取枚举值（如 "监测类型：CO/VI/INNER_ILLUM/OUTER_ILLUM"）
    if (enumValues && enumValues.length > 0) {
      return enumValues[0];
    }
    const enumMatch = description.match(/[：:]\s*([A-Z_]+(?:\/[A-Z_]+)+)/);
    if (enumMatch) {
      const values = enumMatch[1].split('/');
      return values[0];
    }

    // 2. 参数名模式匹配
    const nameLower = name.toLowerCase();
    if (nameLower.includes('id') || nameLower.includes('code') || nameLower.includes('num')) {
      if (type === 'integer' || type === 'number') return 1;
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

    // 3. 类型默认值
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

  // ─── 构建响应预览（简化的字段列表） ──────────────
  private buildResponsePreview(schema: OasSchema | undefined): string {
    if (!schema) return 'unknown';
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

  // ─── 创建全量 ZIP（多模块） ─────────────────────────
  private async createFullZip(
    catalogId: string,
    files: { filename: string; content: string; moduleName: string }[],
  ): Promise<string> {
    const zipDir = apifoxZipsDir;
    if (!existsSync(zipDir)) mkdirSync(zipDir, { recursive: true });
    const zipPath = join(zipDir, `${catalogId}.zip`);

    return new Promise<string>((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const output: Buffer[] = [];
      archive.on('data', (chunk) => output.push(chunk));
      archive.on('end', () => {
        writeFileSync(zipPath, Buffer.concat(output));
        resolve(zipPath);
      });
      archive.on('error', (err) => reject(err));

      // 每个模块的文件放入以 moduleName 命名的子目录
      for (const f of files) {
        archive.append(f.content, { name: `${f.moduleName}/${f.filename}` });
      }
      archive.finalize();
    });
  }

  // ─── 解析 + 过滤 ──────────────────────────────────────
  private parseAndFilter(spec: OasSpec, dto: GenerateApifoxDto): ParsedApi[] {
    const filter = dto.pathFilter || `/${dto.moduleName}`;
    const apis: ParsedApi[] = [];

    for (const [path, methods] of Object.entries(spec.paths || {})) {
      // 路径过滤：path 必须以 filter 开头
      if (!path.startsWith(filter)) continue;

      for (const [method, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'delete'].includes(method)) continue;

        const responseSchema =
          op.responses?.['200']?.content?.['application/json']?.schema ||
          op.responses?.['200']?.content?.['*/*']?.schema;

        const bodySchema =
          op.requestBody?.content?.['application/json']?.schema;

        apis.push({
          path,
          method,
          summary: op.summary || '',
          description: op.description || '',
          functionName: pathToFunctionName(path, method),
          parameters: op.parameters || [],
          hasBody: !!bodySchema,
          bodySchema,
          responseSchema,
        });
      }
    }

    return apis;
  }

  // ─── 内存生成 4 类文件 ────────────────────────────────
  private generateFiles(
    apis: ParsedApi[],
    spec: OasSpec,
    moduleName: string,
    projectId: string,
    date: string,
  ): { filename: string; content: string }[] {
    const sbds = apis.some((a) => isSbds(a.path));
    const service = sbds ? 'sbds-server' : 'base-server';
    const createRequestExpr = sbds ? `createRequest('SBDS_SERVER')` : `createRequest()`;

    const result: { filename: string; content: string }[] = [];

    // 1. API 函数文件
    result.push({
      filename: `${moduleName}.js`,
      content: this.generateApiJs(apis, moduleName, service, projectId, date, createRequestExpr),
    });

    // 2. Mock 数据文件
    result.push({
      filename: `${moduleName}.mock.js`,
      content: this.generateMockJs(apis, spec, moduleName, date),
    });

    // 3. 枚举文件
    const enums = extractEnums(spec);
    result.push({
      filename: `${moduleName}-enums.js`,
      content: this.generateEnumsJs(enums, moduleName, date),
    });

    // 4. 使用文档
    result.push({
      filename: `${moduleName}.usage.md`,
      content: this.generateUsageMd(apis, moduleName, service, projectId, date),
    });

    return result;
  }

  // ─── 创建 ZIP 并存储到 data 目录 ─────────────────────
  private async createZip(
    taskId: string,
    moduleName: string,
    files: { filename: string; content: string }[],
  ): Promise<string> {
    const zipDir = apifoxZipsDir;
    if (!existsSync(zipDir)) mkdirSync(zipDir, { recursive: true });
    const zipPath = join(zipDir, `${taskId}.zip`);

    return new Promise<string>((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const output: Buffer[] = [];
      archive.on('data', (chunk) => output.push(chunk));
      archive.on('end', () => {
        writeFileSync(zipPath, Buffer.concat(output));
        resolve(zipPath);
      });
      archive.on('error', (err) => reject(err));

      // 文件放入以 moduleName 命名的子目录
      for (const f of files) {
        archive.append(f.content, { name: `${moduleName}/${f.filename}` });
      }
      archive.finalize();
    });
  }

  // ─── 生成 API 函数 JS ────────────────────────────────
  private generateApiJs(
    apis: ParsedApi[],
    moduleName: string,
    service: string,
    projectId: string,
    date: string,
    createRequestExpr: string,
  ): string {
    const lines: string[] = [];
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

      // JSDoc
      lines.push(`  // ==================== ${i + 1}. ${api.summary || api.functionName} ====================`);
      lines.push(`  /**`);
      lines.push(`   * ${api.summary || api.functionName}`);
      if (api.description) lines.push(`   * ${api.description}`);
      if (hasParams) {
        lines.push(`   * @param {Object} params - 请求参数`);
        api.parameters
          .filter((p) => p.in === 'query' || p.in === 'path')
          .forEach((p) => {
            lines.push(`   * @param {*} params.${p.name} — ${p.description || p.name}${p.required ? '（必填）' : ''}`);
          });
        if (api.hasBody) lines.push(`   * @param {Object} params.data — 请求体`);
      }
      lines.push(`   * @returns {Object} { rid, code, message, detail, data }`);
      lines.push(`   * @example`);
      lines.push(`   * import ${toCamelCase(moduleName)}Api from '@/api/${moduleName}'`);
      lines.push(`   * const res = await ${toCamelCase(moduleName)}Api.${api.functionName}(${paramArg ? '{ ... }' : ''})`);
      lines.push(`   */`);

      // 函数体
      if (hasParams) {
        const chainParts: string[] = [`.setParameters(params)`];
        if (api.hasBody) chainParts.push(`.setData(params.data || params)`);
        if (method === 'GET') chainParts.push(`.get('${api.path}')`);
        else if (method === 'POST') chainParts.push(`.post('${api.path}')`);
        else if (method === 'PUT') chainParts.push(`.put('${api.path}')`);
        else chainParts.push(`.delete('${api.path}')`);

        lines.push(`  ${api.functionName}(params) {`);
        lines.push(`    return ${createRequestExpr}`);
        chainParts.forEach((p) => lines.push(`      ${p}`));
        lines.push(`  },`);
      } else {
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

  // ─── 生成 Mock 数据 JS ───────────────────────────────
  private generateMockJs(
    apis: ParsedApi[],
    spec: OasSpec,
    moduleName: string,
    date: string,
  ): string {
    const lines: string[] = [];
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

  // ─── 生成枚举 JS ─────────────────────────────────────
  private generateEnumsJs(enums: EnumDef[], moduleName: string, date: string): string {
    const lines: string[] = [];
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

  // ─── 生成使用文档 MD ─────────────────────────────────
  private generateUsageMd(
    apis: ParsedApi[],
    moduleName: string,
    service: string,
    projectId: string,
    date: string,
  ): string {
    const lines: string[] = [];
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
        if (api.hasBody) lines.push(`**请求体**：见 Apifox 文档定义`);
      } else {
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

  // ─── 列出项目里所有 path，按首段分组 ─────────────
  /**
   * 拉一次 OpenAPI，但不落地任何文件，只把所有 path 按首个 `/` 段分组，
   * 返回「可选模块名 + 出现次数 + 示例路径」。供前端「自动探测模块」按钮使用。
   *
   * 跟 generate() / generateFull() 相比不抛「未匹配」错误——查不到也只返空。
   */
  async listPaths(dto: { apifoxProjectId: string; apifoxToken: string; apifoxBaseUrl?: string }) {
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
      throw new BadRequestException(`Apifox API 返回 ${resp.status}: ${text.slice(0, 200)}`);
    }

    const spec = (await resp.json()) as OasSpec;
    const paths = spec.paths || {};
    const pathList = Object.keys(paths);

    // 分组：取首个非空段作为 module 候选
    const groups = new Map<string, { prefix: string; count: number; sample: string; methods: Set<string> }>();
    for (const p of pathList) {
      // 跳过空 / 跳过类 OpenAPI 的占位符（{var}）
      const segments = p.split('/').filter(Boolean);
      if (segments.length === 0) continue;
      const firstSeg = segments[0];
      const key = `/${firstSeg}`;
      // 这个 group 下的示例：取第一条短路径当展示
      if (!groups.has(key)) {
        groups.set(key, { prefix: key, count: 0, sample: p, methods: new Set() });
      }
      const g = groups.get(key)!;
      g.count += 1;
      for (const m of Object.keys(paths[p] || {})) {
        if (['get', 'post', 'put', 'delete'].includes(m)) g.methods.add(m.toUpperCase());
      }
    }

    // 排序：按出现频次降序
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
}
