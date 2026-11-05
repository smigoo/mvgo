import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import AdmZip from 'adm-zip';
import { existsSync } from 'fs';
import { ApifoxService, ApiCatalog, ApiCatalogModule, ApiCatalogFunction } from './apifox.service';
import { ApifoxGeneratorService, OasSpec, ParsedApi } from './apifox-generator.service';
import { McpListApifoxDto } from './dto/mcp-list-apifox.dto';
import { McpAddApifoxDto } from './dto/mcp-add-apifox.dto';

/**
 * Apifox 官方 MCP Server 通路（与既有 REST 通路并存）。
 *
 * - 数据源：本地拉起 `apifox-mcp-server`（stdio），tools/call 读项目 OAS；
 * - 归一：读回的 OAS 复用 ApifoxGeneratorService#parseAllAndGroup / generateFiles /
 *   toCatalogFunction，两条通路产出结构完全一致（单一实现来源）；
 * - 落盘：addMcpApis 只重建目标模块的 4 个文件并替换回既有 ZIP，不整包重生成。
 *
 * 🔴 工具名带随机 suffix（每次启动变化，实测见过 sln328 / nj8528），必须前缀正则匹配。
 * 🔴 工具名前缀会互相包含：`read_project_oas_<suffix>` 与
 *    `read_project_oas_ref_resources_<suffix>` 必须用 `!includes('ref_resources')` 区分。
 */

const APIFOX_MCP_PACKAGE = 'apifox-mcp-server';

const TOOL_READ_OAS = /^read_project_oas(_|$)/;
const TOOL_REF_RESOURCES = /ref_resources/;
const TOOL_REFRESH_OAS = /^refresh_project_oas(_|$)/;

/** $ref 解析最大轮次（实测：路径文件 1 层 + schemas 索引 1 层 + schema 文件 1 层） */
const MAX_REF_ROUNDS = 4;
/** 单次 ref_resources 批量读取条数（实测 40 条约 300KB，可控） */
const REF_CHUNK_SIZE = 40;
/** 单次 MCP 交互超时 */
const MCP_TIMEOUT_MS = 180_000;

export interface FlatApiItem {
  path: string;
  method: string;
  summary: string;
  functionName: string;
  moduleName: string;
  isNew: boolean;
  paramNames: string[];
}

export interface LoadedOas {
  spec: OasSpec;
  unresolvedRefs: string[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BadRequestException(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** 递归收集文档中所有「绝对引用」（形如 /paths/xxx.json、/components/schemas/xxx.json） */
function collectAbsoluteRefs(node: any, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) collectAbsoluteRefs(item, out);
  } else if (node && typeof node === 'object') {
    const ref = node.$ref;
    if (typeof ref === 'string' && ref.startsWith('/')) out.add(ref);
    for (const value of Object.values(node)) collectAbsoluteRefs(value, out);
  }
  return out;
}

/**
 * 用「引用表」把轻量 OAS 展开成完整 OAS。
 * - `{ $ref, ...同级键 }`：以 ref 文件内容为准，同级键只补 ref 文件缺失的字段
 *   （轻量索引里的 `get:{summary}` 不得覆盖 ref 文件里的完整定义）；
 * - 未命中 / 成环：原样保留，便于上层如实上报（不静默吞掉）。
 * - 递归只按「引用链」防环，不限制对象嵌套深度，避免深层 schema 被截断。
 */
function deref(node: any, refMap: Map<string, any>, chain: Set<string> = new Set()): any {
  if (Array.isArray(node)) return node.map((item) => deref(item, refMap, chain));
  if (!node || typeof node !== 'object') return node;

  const ref = node.$ref;
  if (typeof ref === 'string' && ref.startsWith('/')) {
    if (chain.has(ref)) return node;
    const target = refMap.get(ref);
    if (target === undefined) return node;
    const nextChain = new Set(chain);
    nextChain.add(ref);
    const rest: Record<string, any> = { ...node };
    delete rest.$ref;
    const merged = deref(target, refMap, nextChain);
    if (merged && typeof merged === 'object' && !Array.isArray(merged)) {
      for (const [key, value] of Object.entries(rest)) {
        if (!(key in merged)) merged[key] = deref(value, refMap, chain);
      }
    }
    return merged;
  }

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = deref(value, refMap, chain);
  }
  return out;
}

@Injectable()
export class ApifoxMcpService {
  private readonly logger = new Logger(ApifoxMcpService.name);

  constructor(
    private readonly apifoxService: ApifoxService,
    private readonly generator: ApifoxGeneratorService,
  ) {}

  // ─── (a) 探测可新增接口（只读，不落盘）────────────────
  async listMcpApis(dto: McpListApifoxDto) {
    const { spec, unresolvedRefs } = await this.loadOas(
      dto.apifoxProjectId,
      dto.apifoxToken,
      dto.refresh,
    );
    const moduleMap = this.generator.parseAllAndGroup(spec);
    const known = this.knownKeysOf(dto.catalogId);

    const items: FlatApiItem[] = [];
    for (const [moduleName, apis] of moduleMap) {
      if (dto.moduleName && moduleName !== dto.moduleName) continue;
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
    items.sort(
      (a, b) => a.moduleName.localeCompare(b.moduleName) || a.path.localeCompare(b.path),
    );

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
    this.logger.log(
      `MCP 探测完成: project=${dto.apifoxProjectId}, ${items.length} 个接口（新增 ${newCount}）, ${modules.length} 个模块`,
    );

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

  // ─── (b) 增量新增：只重建目标模块，替换回既有 ZIP 与 catalog ──
  async addMcpApis(dto: McpAddApifoxDto) {
    const catalog = this.apifoxService.getCatalog(dto.catalogId);
    if (!catalog.zipPath || !existsSync(catalog.zipPath)) {
      throw new NotFoundException(`目录产物 ZIP 不存在: ${catalog.catalogId}`);
    }

    const { spec } = await this.loadOas(dto.apifoxProjectId, dto.apifoxToken, dto.refresh);
    const moduleMap = this.generator.parseAllAndGroup(spec);
    const apis = moduleMap.get(dto.moduleName);
    if (!apis || apis.length === 0) {
      throw new BadRequestException(
        `MCP 文档中未找到模块 ${dto.moduleName} 的任何接口，请先重新探测。`,
      );
    }

    const specKeys = new Set(apis.map((a) => this.apiKey(a.method, a.path)));
    const requested = (dto.keys || []).map((k) => this.apiKey(k.method, k.path));
    if (requested.length > 0 && !requested.some((k) => specKeys.has(k))) {
      throw new BadRequestException('选中的接口在最新的 MCP 文档中均不存在，请重新探测。');
    }

    // 更新前的模块函数键（用于算真实新增数）
    const previousKeys = new Set<string>();
    for (const m of catalog.modules) {
      if (m.moduleName !== dto.moduleName) continue;
      for (const f of m.functions) previousKeys.add(this.apiKey(f.method, f.path));
    }

    // 1. 生成目标模块 4 个文件（与既有通路同一个 generateFiles 实现）
    const date = new Date().toISOString().slice(0, 10);
    const generated = this.generator.generateFiles(
      apis,
      spec,
      dto.moduleName,
      dto.apifoxProjectId,
      date,
    );

    // 2. ZIP 手术：只替换 <moduleName>/ 目录下的文件，其他模块字节不动
    const replacedZipEntries = this.replaceModuleInZip(
      catalog.zipPath,
      dto.moduleName,
      generated,
    );

    // 3. catalog 更新：目标模块函数清单以最新文档为准
    const moduleFunctions: ApiCatalogFunction[] = apis.map((a) =>
      this.generator.toCatalogFunction(a, spec),
    );
    const newModule: ApiCatalogModule = {
      moduleName: dto.moduleName,
      service: this.generator.serviceOf(apis),
      functions: moduleFunctions,
    };
    const modules = [...catalog.modules];
    const idx = modules.findIndex((m) => m.moduleName === dto.moduleName);
    if (idx >= 0) modules[idx] = newModule;
    else modules.push(newModule);

    const updatedCatalog: ApiCatalog = {
      ...catalog,
      generatedAt: new Date().toISOString(),
      modules,
      totalModuleCount: modules.length,
      totalApiCount: modules.reduce((sum, m) => sum + m.functions.length, 0),
    };
    this.apifoxService.saveCatalog(updatedCatalog, dto.ownerId);

    // 4. 同步任务元数据（历史列表 apiCount / 文件清单），taskType 沿用原任务
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
    this.logger.log(
      `MCP 增量新增完成: catalog=${catalog.catalogId}, 模块=${dto.moduleName}, ` +
        `函数 ${previousKeys.size} → ${moduleFunctions.length}（本次选中新增 ${addedCount}）, ` +
        `ZIP 替换 ${replacedZipEntries} 个条目`,
    );

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

  // ─── ZIP 手术：替换单个模块目录 ───────────────────────
  private replaceModuleInZip(
    zipPath: string,
    moduleName: string,
    files: { filename: string; content: string }[],
  ): number {
    const zip = new AdmZip(zipPath);
    const prefix = `${moduleName}/`;
    const stale = zip
      .getEntries()
      .map((e) => e.entryName)
      .filter((name) => name.startsWith(prefix));
    for (const name of stale) zip.deleteFile(name);
    for (const f of files) {
      zip.addFile(`${prefix}${f.filename}`, Buffer.from(f.content, 'utf8'));
    }
    zip.writeZip(zipPath);
    return stale.length;
  }

  // ─── 基准键集合（来自已存在的 catalog）────────────────
  private knownKeysOf(catalogId?: string): Set<string> | null {
    if (!catalogId) return null;
    try {
      const catalog = this.apifoxService.getCatalog(catalogId);
      const keys = new Set<string>();
      for (const m of catalog.modules) {
        for (const f of m.functions) keys.add(this.apiKey(f.method, f.path));
      }
      return keys;
    } catch {
      this.logger.warn(`基准目录不可用（忽略 diff）: ${catalogId}`);
      return null;
    }
  }

  private apiKey(method: string, path: string): string {
    return `${(method || '').toUpperCase()} ${path}`;
  }

  // ─── MCP server 入口解析 ──────────────────────────────
  private resolveServerEntry(): string {
    const override = process.env.APIFOX_MCP_SERVER_ENTRY;
    if (override) {
      if (!existsSync(override)) {
        throw new BadRequestException(
          `APIFOX_MCP_SERVER_ENTRY 指向的文件不存在: ${override}`,
        );
      }
      return override;
    }
    try {
      return require.resolve(`${APIFOX_MCP_PACKAGE}/lib/index.js`);
    } catch {
      throw new BadRequestException(
        `未找到 ${APIFOX_MCP_PACKAGE}，请在后端目录执行 npm install，` +
          `或用 APIFOX_MCP_SERVER_ENTRY 指定其 lib/index.js 绝对路径。`,
      );
    }
  }

  // ─── 拉起 MCP、读回完整 OAS ───────────────────────────
  private async loadOas(
    projectId: string,
    token?: string,
    refresh?: boolean,
  ): Promise<LoadedOas> {
    if (!projectId) throw new BadRequestException('缺少 apifoxProjectId');

    // 🔴 apifox-mcp-server 启动即校验令牌：缺失会在 stdio 握手阶段直接退出，
    //    SDK 侧只能看到 `MCP error -32000: Connection closed`（无任何可读原因）。
    //    因此这里前置校验并给出可操作的中文提示；值是否有效由 Apifox 侧判断
    //    （本地有文档缓存时即便占位值也能读到索引）。
    const accessToken = (token || process.env.APIFOX_ACCESS_TOKEN || '').trim();
    if (!accessToken) {
      throw new BadRequestException(
        '缺少 Apifox Access Token：apifox-mcp-server 启动即校验令牌，缺失会直接退出。' +
          '请在面板填入 Access Token，或在后端环境变量设置 APIFOX_ACCESS_TOKEN。',
      );
    }

    const entry = this.resolveServerEntry();

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport, getDefaultEnvironment } = await import(
      '@modelcontextprotocol/sdk/client/stdio.js'
    );

    const env: Record<string, string> = { ...getDefaultEnvironment() };
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

      const toolNames: string[] = (await client.listTools()).tools.map((t: any) => t.name);
      const readTool = toolNames.find(
        (n) => TOOL_READ_OAS.test(n) && !TOOL_REF_RESOURCES.test(n),
      );
      const refTool = toolNames.find((n) => TOOL_REF_RESOURCES.test(n));
      const refreshTool = toolNames.find((n) => TOOL_REFRESH_OAS.test(n));
      if (!readTool || !refTool) {
        throw new BadRequestException(
          `MCP server 未暴露预期工具（read/ref_resources），实际: ${toolNames.join(', ') || '(空)'}`,
        );
      }

      if (refresh && refreshTool) {
        try {
          await withTimeout(
            client.callTool({ name: refreshTool, arguments: {} }),
            MCP_TIMEOUT_MS,
            'MCP 刷新项目文档超时',
          );
          this.logger.log('MCP 已强制刷新项目文档缓存');
        } catch (error) {
          this.logger.warn(`MCP refresh 失败（继续使用本地缓存）: ${(error as Error).message}`);
        }
      }

      const lite = await this.callToolJson(client, readTool, {});
      const { spec, unresolvedRefs } = await this.expandRefs(client, lite, refTool);
      return { spec, unresolvedRefs };
    } finally {
      try {
        await client.close();
      } catch {
        /* 关闭失败不影响结果 */
      }
    }
  }

  /** 多轮展开 $ref：每轮收集未解析引用 → 批量读取 → 合并，直到无新增或触顶 */
  private async expandRefs(
    client: any,
    lite: any,
    refTool: string,
  ): Promise<{ spec: OasSpec; unresolvedRefs: string[] }> {
    const refMap = new Map<string, any>();
    let pending = [...collectAbsoluteRefs(lite)];
    const totalPending = pending.length;

    for (let round = 0; round < MAX_REF_ROUNDS && pending.length > 0; round++) {
      const newlyFound = new Set<string>();
      let hitTotal = 0;
      for (let i = 0; i < pending.length; i += REF_CHUNK_SIZE) {
        const chunk = pending.slice(i, i + REF_CHUNK_SIZE);
        const payload = await this.callToolJson(client, refTool, { path: chunk });
        for (const [ref, raw] of Object.entries(payload || {})) {
          const parsed = typeof raw === 'string' ? this.safeJsonParse(raw, ref) : raw;
          if (parsed === undefined) continue;
          refMap.set(ref, parsed);
          hitTotal++;
          for (const nested of collectAbsoluteRefs(parsed)) {
            if (!refMap.has(nested)) newlyFound.add(nested);
          }
        }
      }
      this.logger.log(
        `MCP ref 展开 第${round + 1}轮: 待解析 ${pending.length}，命中 ${hitTotal}`,
      );
      pending = [...newlyFound];
    }

    const spec = deref(lite, refMap) as OasSpec;
    const unresolvedRefs = [...collectAbsoluteRefs(spec)];
    if (unresolvedRefs.length > 0) {
      this.logger.warn(
        `MCP 展开后仍有 ${unresolvedRefs.length} 个未解析引用（前 5）: ${unresolvedRefs
          .slice(0, 5)
          .join(', ')}`,
      );
    }
    this.logger.log(
      `MCP OAS 展开完成: 首轮引用 ${totalPending} 条, 引用表 ${refMap.size} 条, ` +
        `路径 ${Object.keys(spec.paths || {}).length} 个, 残留引用 ${unresolvedRefs.length}`,
    );
    return { spec, unresolvedRefs };
  }

  private safeJsonParse(raw: string, ref: string): any {
    try {
      return JSON.parse(raw);
    } catch (error) {
      this.logger.warn(`引用内容非 JSON，已跳过: ${ref} — ${(error as Error).message}`);
      return undefined;
    }
  }

  /** 调用工具并把返回的文本块拼成 JSON 对象 */
  private async callToolJson(
    client: any,
    name: string,
    args: Record<string, any>,
  ): Promise<any> {
    const result: any = await withTimeout<any>(
      client.callTool({ name, arguments: args }),
      MCP_TIMEOUT_MS,
      `MCP 工具调用超时: ${name}`,
    );
    const text = (result?.content || []).map((c: any) => c.text || '').join('');
    if (result?.isError) {
      throw new BadRequestException(`MCP 工具返回错误 (${name}): ${text.slice(0, 300)}`);
    }
    if (!text) throw new BadRequestException(`MCP 工具返回空内容: ${name}`);
    const parsed = this.safeJsonParse(text, name);
    if (parsed === undefined) {
      throw new BadRequestException(
        `MCP 工具返回内容不是合法 JSON: ${name}（${text.slice(0, 200)}）`,
      );
    }
    return parsed;
  }
}
