import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import ts from 'typescript';
import { basename, dirname, join } from 'path';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { ApifoxService, ApiCatalog, ApiCatalogFunction } from '../apifox/apifox.service';
import { BindApiDto, BindingSlotDto } from './dto/bind-api.dto';
import { resolveFrontendWorkspace } from '../config/workspace.config';
import { ApiBindingPreflightService } from './api-binding-preflight.service';
import { WorkspaceTransactionService } from './workspace-transaction.service';
import { IncrementalFileCleanupService } from './incremental-file-cleanup.service';
import { TaskCodeSnapshotService } from '../tasks/task-code-snapshot.service';
import { workspaceRoot, vue3ComponentsDir, dataDir } from '../config/backend-root';

interface RuntimeRequestMock {
  method: string;
  path: string;
  response: { code: number; data: unknown };
}

export interface BindingRecord {
  bindingId: string;
  catalogId: string;
  componentId: string;
  componentName: string;
  groupId: string;
  slots: BindingSlotDto[];
  boundAt: string;
  componentDir: string;
  modifiedFiles: string[];
  snapshotDir?: string;
  targetPaths?: string[];
  sourceFingerprint?: string;
}

@Injectable()
export class ApiBindingService {
  private readonly logger = new Logger(ApiBindingService.name);
  private readonly storePath = join(dataDir, 'api-bindings.json');

  constructor(
    private readonly apifoxService: ApifoxService,
    private readonly preflight: ApiBindingPreflightService,
    private readonly workspaceTransaction: WorkspaceTransactionService,
    private readonly cleanup: IncrementalFileCleanupService,
    private readonly taskCodeSnapshot: TaskCodeSnapshotService,
  ) {}

  /**
   * 执行 API 绑定 + 代码注入
   */
  async bindApi(dto: BindApiDto): Promise<{
    success: boolean;
    bindingId: string;
    modifiedFiles: string[];
    previewUrl: string;
    warnings: string[];
  }> {
    // 1. 加载 API 目录
    const catalog = this.apifoxService.getCatalog(dto.catalogId);
    if (!catalog) {
      throw new NotFoundException(`API 目录不存在: ${dto.catalogId}`);
    }

    const componentDir = this.getComponentDir(dto.componentId, dto.groupId);
    // 🛡️ 2026-09-03 修复：getComponentDir 已兜底到真实落盘目录（兼容前端 localStorage 切组后
    // groupId 与组件实际 group 不一致），但 dto.groupId 本身仍是旧值——若继续传它，下游
    // targetPaths 候选、预览截图 URL、绑定记录全部会指向错误的 group 目录，
    // 导致真实运行时检查 RUNTIME-004「组件 load-error」阻断回滚。
    // 这里从命中目录反推真实 groupId（目录结构恒为 */vue3-components/<groupId>/<componentId>）。
    const normalizedGroupId = this.normalizeGroupIdFromDir(componentDir, dto.groupId, dto.componentId);
    const effectiveDto = { ...dto, groupId: normalizedGroupId };
    const targetPaths = this.getComponentTargets(effectiveDto.componentId, normalizedGroupId, componentDir);
    const existingBindings = this.readBindings();
    const previousBinding = existingBindings.find((binding) => binding.componentId === dto.componentId);
    if (previousBinding?.targetPaths && !this.sameTargetSet(previousBinding.targetPaths, targetPaths)) {
      throw new BadRequestException('组件 workspace 目标集合已变化，请先恢复旧绑定后再重新绑定');
    }
    const inheritedSnapshot = previousBinding?.snapshotDir && existsSync(previousBinding.snapshotDir);
    const bindingId = `bind-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const transactionRoot = join(dataDir, '.api-binding-transactions', bindingId);
    const stagingPaths = targetPaths.map((_, index) => join(transactionRoot, `component-${index}`));
    const snapshotDir = inheritedSnapshot
      ? previousBinding!.snapshotDir!
      : join(dataDir, 'api-binding-snapshots', bindingId);
    const storeStagingPath = join(transactionRoot, 'api-bindings.json');

    const entryRelativePath = this.resolveComponentEntry(componentDir);
    const entryDir = dirname(entryRelativePath);
    const apiRelativeDir = entryDir === '.' ? 'api' : join(entryDir, 'api');
    const sfcPath = join(componentDir, entryRelativePath);
    const sfcContent = readFileSync(sfcPath, 'utf-8');

    const boundModules = new Set<string>();
    const boundSlots: BindingSlotDto[] = [];
    const stubSlots: BindingSlotDto[] = [];
    const skippedSlots: BindingSlotDto[] = [];
    for (const slot of dto.bindings) {
      if (slot.status === 'bound' && slot.moduleName && slot.functionName) {
        boundModules.add(slot.moduleName);
        boundSlots.push(slot);
      } else if (slot.status === 'stub') {
        stubSlots.push(slot);
      } else {
        skippedSlots.push(slot);
      }
    }

    const runtimeRequestMocks = this.validateCatalogBindings(catalog, boundSlots);
    this.logger.log(
      `[ApiBinding] 绑定 ${boundSlots.length} 个, 模拟数据 ${stubSlots.length} 个, 跳过 ${skippedSlots.length} 个`,
    );

    // B: 绑定前消费性检查——数据变量是否被组件真实消费（避免静默无效绑定）
    const consumptionWarnings = this.checkSlotConsumption([...boundSlots, ...stubSlots], sfcContent);
    if (consumptionWarnings.length > 0) {
      this.logger.warn(
        `[ApiBinding] 消费性警告 ${consumptionWarnings.length} 条:\n${consumptionWarnings.join('\n')}`,
      );
    }

    try {
      mkdirSync(transactionRoot, { recursive: true });
      if (!inheritedSnapshot) mkdirSync(snapshotDir, { recursive: true });

      targetPaths.forEach((targetPath, index) => {
        cpSync(targetPath, stagingPaths[index], { recursive: true, force: true });
        if (!inheritedSnapshot) {
          const snapshotPath = join(snapshotDir, `component-${index}`);
          cpSync(targetPath, snapshotPath, { recursive: true, force: true });
          if (previousBinding) {
            this.cleanBindingFromSnapshot(snapshotPath, previousBinding);
          }
        }
      });

      const primaryStaging = stagingPaths[0];
      const apiDir = join(primaryStaging, apiRelativeDir);
      mkdirSync(apiDir, { recursive: true });
      this.removePreviousBindingModules(apiDir, previousBinding?.modifiedFiles || [], apiRelativeDir);

      const modifiedFiles: string[] = [];
      // 🛡️ 2026-09-03：组件沙箱运行时（vue3-sfc-loader）硬性要求 .mjs 后缀（.js 不被按 ES module 解析），
      // 因此 package/api/*.mjs 供组件内预览/运行使用；同时把 GenerateApiView 同构规范产物
      // （device.js / device.mock.js / device-enums.js，@/api 引用、宿主 Vite 工程可用）写到
      // package/api-standalone/，用户可整套拷贝到自己的前端工程。
      // api-standalone 恒挂在组件入口同级（entryDir 下）：entryDir='.' → package/api-standalone。
      const standaloneParent = entryDir === '.' ? 'api-standalone' : join(entryDir, 'api-standalone');
      const standaloneDir = join(primaryStaging, standaloneParent);
      const standaloneFiles: string[] = [];
      // 🛡️ 2026-09-03：收集绑定目标为「数组 ref」的函数（refName 声明 const x = ref([...)），
      // 其预览 mock 必须返回数组（echarts/列表直赋数组，对象 mock 触发 RUNTIME-009 assert）。
      const arrayMockFns = new Set<string>();
      for (const slot of [...boundSlots, ...stubSlots]) {
        const dataRefName = this.getBindingDataName(slot);
        if (!dataRefName) continue;
        const escaped = dataRefName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*ref\\(\\s*\\[`).test(sfcContent)) {
          if (slot.functionName) arrayMockFns.add(slot.functionName);
          else if (slot.refName) arrayMockFns.add(slot.refName);
        }
      }
      for (const moduleName of boundModules) {
        const mod = catalog.modules.find((item) => item.moduleName === moduleName)!;
        const apiContent = this.generateApiModuleFile(mod.moduleName, mod.service, mod.functions, arrayMockFns);
        writeFileSync(join(apiDir, `${mod.moduleName}.mjs`), apiContent, 'utf-8');
        modifiedFiles.push(`${apiRelativeDir}/${mod.moduleName}.mjs`);

        const mockContent = this.generateMockFile(mod.moduleName, mod.functions);
        writeFileSync(join(apiDir, `${mod.moduleName}.mock.mjs`), mockContent, 'utf-8');
        modifiedFiles.push(`${apiRelativeDir}/${mod.moduleName}.mock.mjs`);

        const enumsContent = this.generateEnumsFile(mod.moduleName);
        if (enumsContent) {
          writeFileSync(join(apiDir, `${mod.moduleName}-enums.mjs`), enumsContent, 'utf-8');
          modifiedFiles.push(`${apiRelativeDir}/${mod.moduleName}-enums.mjs`);
        }

        // GenerateApiView 同构规范产物（供宿主工程拷贝使用）
        mkdirSync(standaloneDir, { recursive: true });
        const standalone = this.generateStandaloneApiFiles(mod);
        for (const file of standalone) {
          writeFileSync(join(standaloneDir, file.filename), file.content, 'utf-8');
          standaloneFiles.push(file.filename);
        }
      }

      if (standaloneFiles.length > 0) {
        modifiedFiles.push(...standaloneFiles.map((f) => `${standaloneParent}/${f}`));
        this.logger.log(`[ApiBinding] 已生成宿主工程规范产物 ${standaloneParent}/: ${standaloneFiles.join(', ')}`);
      }

      for (const slot of stubSlots) {
        const stubContent = this.generateStubFile(slot, sfcContent);
        writeFileSync(join(apiDir, `stub-${slot.slotId}.mjs`), stubContent, 'utf-8');
        modifiedFiles.push(`${apiRelativeDir}/stub-${slot.slotId}.mjs`);
      }

      const modifiedSfc = this.injectCodeIntoSFC(sfcContent, boundSlots, stubSlots, skippedSlots);
      const writeSfcPath = join(primaryStaging, entryRelativePath);
      writeFileSync(writeSfcPath, modifiedSfc, 'utf-8');
      modifiedFiles.push(entryRelativePath);
      this.preflight.validate(primaryStaging);

      for (let index = 1; index < stagingPaths.length; index += 1) {
        this.cleanup.detachAndSchedule(stagingPaths[index]);
        cpSync(primaryStaging, stagingPaths[index], { recursive: true, force: true });
      }

      const record: BindingRecord = {
        bindingId,
        catalogId: dto.catalogId,
        componentId: dto.componentId,
        componentName: dto.componentName || dto.componentId,
        groupId: normalizedGroupId,
        slots: dto.bindings,
        boundAt: new Date().toISOString(),
        componentDir: targetPaths[0],
        modifiedFiles,
        snapshotDir,
        targetPaths,
      };
      this.writeBindingsToPath(this.upsertBinding(existingBindings, record), storeStagingPath);

      await this.workspaceTransaction.commit(
        [
          ...targetPaths.map((targetPath, index) => ({
            targetPath,
            stagingPath: stagingPaths[index],
          })),
          { targetPath: this.storePath, stagingPath: storeStagingPath },
        ],
        () => this.runRuntimePreflight(
          dto.componentId,
          normalizedGroupId,
          targetPaths[0],
          runtimeRequestMocks,
        ),
      );

      // 🛡️ 产物面板对齐：绑定后的 workspace 真实产物回写为新快照 revision（详见方法注释）
      this.snapshotBindingRevision(bindingId, dto.componentId, modifiedFiles, targetPaths[0]);

      this.logger.log(`[ApiBinding] 安全发布完成: ${bindingId}, 修改文件 ${modifiedFiles.length} 个`);
      return {
        success: true,
        bindingId,
        modifiedFiles,
        previewUrl: `/workspace/vue3-components/${normalizedGroupId}/${dto.componentId}/${entryRelativePath}`,
        warnings: consumptionWarnings,
      };
    } catch (error) {
      if (!inheritedSnapshot) this.cleanup.detachAndSchedule(snapshotDir);
      throw error;
    } finally {
      this.cleanup.detachAndSchedule(transactionRoot);
    }
  }

  /**
   * 🛡️ 2026-09-03（产物面板漂移治本）：绑定成功后把 workspace 真实产物回写为新的
   * 快照 candidate revision。
   *
   * 根因：任务详情「产物代码」面板只读任务快照（candidate/partial/lastGood，
   * 生成期冻结的不可变 revision），而 bind-api 只写 workspace → 面板看不到
   * api/*.mjs、api-standalone/*.js 与注入代码，与 Playground 预览/下载产物漂移。
   * 这里以「绑定后 workspace 内容」为 overlay 派生新 candidate（parentRevision 指回
   * 绑定前基线，可审计可对照），快照不可变语义不破。
   *
   * 失败仅告警：workspace 已是真实交付物（下载链路不受影响），快照回写是展示层对齐，
   * 不阻断绑定主流程。
   */
  private snapshotBindingRevision(
    bindingId: string,
    componentId: string,
    modifiedFiles: string[],
    committedDir: string,
  ): void {
    try {
      // vue3 生成任务 sessionId === componentId（tasks.json 全量实证，0 例外）
      const overlay: Record<string, Buffer> = {};
      for (const rel of modifiedFiles) {
        const abs = join(committedDir, rel);
        if (existsSync(abs)) overlay[rel] = readFileSync(abs);
      }
      if (Object.keys(overlay).length === 0) return;
      const manifest = this.taskCodeSnapshot.createOverlayCandidate(componentId, overlay, {
        stage: 'api-binding',
        editSource: `api-binding:${bindingId}`,
      });
      if (manifest) {
        this.logger.log(
          `[ApiBinding] 快照 revision 已回写: ${manifest.revision}（基线 ${manifest.parentRevision}，产物面板对齐 workspace）`,
        );
      }
    } catch (error) {
      this.logger.warn(`[ApiBinding] 快照 revision 回写失败（不影响绑定主流程）: ${error}`);
    }
  }

  /**
   * 🛡️ 2026-09-03（撤回对称）：以「本次绑定 revision 的 parentRevision」（即绑定前
   * 快照基线）派生新 candidate —— 其内容与撤回后 workspace 恢复结果逐字节一致，
   * 产物面板随撤回回到绑定前代码。
   * 找不到基线（旧绑定无 api-binding revision）时跳过：行为与改版前一致，不恶化。
   */
  private snapshotUnbindRevision(record: BindingRecord): void {
    try {
      const sessionId = record.componentId;
      const candidate = this.taskCodeSnapshot.getCandidateManifest(sessionId);
      const baseRevision =
        candidate?.editSource === `api-binding:${record.bindingId}`
          ? candidate.parentRevision
          : undefined;
      if (!baseRevision) {
        this.logger.warn(
          `[ApiBinding] 撤回快照回写跳过：未找到 ${record.bindingId} 对应的绑定 revision 基线`,
        );
        return;
      }
      const manifest = this.taskCodeSnapshot.createOverlayCandidate(sessionId, {}, {
        stage: 'api-unbinding',
        editSource: `api-unbinding:${record.bindingId}`,
        baseRevision,
      });
      if (manifest) {
        this.logger.log(
          `[ApiBinding] 撤回快照 revision 已回写: ${manifest.revision}（恢复基线 ${baseRevision}）`,
        );
      }
    } catch (error) {
      this.logger.warn(`[ApiBinding] 撤回快照回写失败（不影响撤回主流程）: ${error}`);
    }
  }

  /**
   * 查询组件的绑定记录
   */
  getBindings(componentId: string): BindingRecord[] {
    const all = this.readBindings();
    return all.filter((b) => b.componentId === componentId);
  }

  /**
   * 获取单个绑定记录
   */
  getBinding(bindingId: string): BindingRecord | null {
    const all = this.readBindings();
    return all.find((b) => b.bindingId === bindingId) || null;
  }

  /**
   * 解绑（还原 SFC — 从 git 或备份恢复，这里简化为移除注入代码）
   */
  async unbind(bindingId: string): Promise<{ success: boolean; message: string }> {
    const all = this.readBindings();
    const record = all.find((binding) => binding.bindingId === bindingId);
    if (!record) throw new NotFoundException(`绑定记录不存在: ${bindingId}`);
    if (!record.snapshotDir || !existsSync(record.snapshotDir)) {
      throw new BadRequestException('该绑定是旧版本记录，缺少精确快照，拒绝使用正则方式解绑');
    }

    const targetPaths = record.targetPaths || this.getComponentTargets(
      record.componentId,
      record.groupId,
      record.componentDir,
    );
    const transactionRoot = join(dataDir, '.api-binding-transactions', `unbind-${bindingId}`);
    const storeStagingPath = join(transactionRoot, 'api-bindings.json');
    mkdirSync(transactionRoot, { recursive: true });

    try {
      const restoredStages = targetPaths.map((_, index) => {
        const source = join(record.snapshotDir!, `component-${index}`);
        if (!existsSync(source)) throw new BadRequestException(`绑定快照不完整: ${source}`);
        const stagingPath = join(transactionRoot, `component-${index}`);
        cpSync(source, stagingPath, { recursive: true, force: true });
        this.preflight.validate(stagingPath);
        return stagingPath;
      });
      this.writeBindingsToPath(
        all.filter((binding) => binding.bindingId !== bindingId),
        storeStagingPath,
      );

      await this.workspaceTransaction.commit([
        ...targetPaths.map((targetPath, index) => ({ targetPath, stagingPath: restoredStages[index] })),
        { targetPath: this.storePath, stagingPath: storeStagingPath },
      ]);
      // 🛡️ 产物面板对齐（撤回对称）：面板随撤回回到绑定前代码（详见方法注释）
      this.snapshotUnbindRevision(record);
      this.cleanup.detachAndSchedule(record.snapshotDir);
      return { success: true, message: '已从精确快照恢复组件并移除绑定记录' };
    } finally {
      this.cleanup.detachAndSchedule(transactionRoot);
    }
  }

  // ==================== 私有方法 ====================

  private getComponentDir(componentId: string, groupId?: string): string {
    const bases = [
      resolveFrontendWorkspace(),
      workspaceRoot,
    ];

    // 1. 按给定 groupId 查找（前端优先、后端兜底）
    if (groupId) {
      for (const base of bases) {
        const dir = join(base, 'vue3-components', groupId, componentId);
        if (existsSync(dir)) return dir;
      }
    }

    // 2. groupId 兜底：递归查找 componentId 目录（兼容 MongoDB groupId 与磁盘目录不一致）
    for (const base of bases) {
      const vue3Base = join(base, 'vue3-components');
      if (!existsSync(vue3Base)) continue;
      for (const gDir of readdirSync(vue3Base)) {
        const dir = join(vue3Base, gDir, componentId);
        if (existsSync(dir) && statSync(dir).isDirectory()) return dir;
      }
    }

    throw new NotFoundException(
      `组件目录未找到: vue3-components/${groupId || '*'}/${componentId}`,
    );
  }

  /**
   * 🛡️ 2026-09-03：从已命中的组件目录反推真实 groupId。
   * 目录结构恒为 {root}/vue3-components/{groupId}/{componentId}，因此取 componentId 上一级目录名即为真实 group。
   * 兜底语义：getComponentDir 已在「前端 localStorage 切组后 dto.groupId 过时」场景命中真实目录，
   * 这里归一化 group，保证 targetPaths / 预览截图 URL / 绑定记录三处使用一致的真实 group。
   */
  private normalizeGroupIdFromDir(
    componentDir: string,
    fallbackGroupId: string,
    componentId: string,
  ): string {
    try {
      const parent = dirname(componentDir);
      const parentName = basename(parent);
      if (parentName && parentName !== 'vue3-components') {
        // 反向验证：父目录下确实挂着该组件，避免误归一（如 componentDir 本身就不在 vue3-components 树内）
        const probe = join(parent, componentId);
        if (existsSync(probe)) return parentName;
      }
    } catch {
      // 反推失败则沿用调用方 groupId
    }
    return fallbackGroupId;
  }

  /**
   * 生成 API 模块 ESM 文件（createRequest 格式）
   * @param arrayMockFns 绑定目标为「数组 ref」的函数名集合——这些函数的预览 mock 返回数组
   * （组件 echarts/列表直赋数组，若 mock 给对象会导致渲染 assert/空白）。
   */
  private generateApiModuleFile(
    moduleName: string,
    service: string,
    functions: ApiCatalogFunction[],
    arrayMockFns: Set<string> = new Set(),
  ): string {
    const isSbds = service === 'sbds-server';
    const serviceArg = isSbds ? "'SBDS_SERVER'" : '';
    const importLine = `import { createRequest } from 'microvideo-request'\n`;

    const functionsCode = functions
      .map((fn) => {
        const needsParams = fn.params.length > 0 || fn.hasBody || fn.method !== 'GET';
        const paramPart = needsParams ? 'params = {}' : '';
        const hasQueryParams = fn.params.some((p) => p.in === 'query');
        const pathParamNames = fn.params.filter((p) => p.in === 'path').map((p) => p.name);
        const requestParams = pathParamNames.length > 0 ? 'requestParams' : 'params';
        const setupLines = pathParamNames.length > 0
          ? `\n    const resolvedPath = resolvePath('${fn.path}', params)\n    const requestParams = omitParameters(params, ${JSON.stringify(pathParamNames)})`
          : '';
        const requestPath = pathParamNames.length > 0 ? 'resolvedPath' : `'${fn.path}'`;

        let body = '';
        if (fn.method === 'GET') {
          if (hasQueryParams) {
            body = `      .setParameters(${requestParams})\n      .get(${requestPath})`;
          } else {
            body = `      .get(${requestPath})`;
          }
        } else if (fn.method === 'POST') {
          body = `      .setParameters(${requestParams})\n      .post(${requestPath})`;
        } else if (fn.method === 'PUT') {
          body = `      .setParameters(${requestParams})\n      .put(${requestPath})`;
        } else if (fn.method === 'DELETE') {
          body = `      .setParameters(${requestParams})\n      .delete(${requestPath})`;
        } else {
          body = `      .setParameters(${requestParams})\n      .get(${requestPath})`;
        }

        return `  /**
   * ${fn.summary || fn.name}
   * ${fn.method} ${fn.path}
   * @returns {Object} ${fn.responsePreview}
   */
  ${fn.name}(${paramPart}) {${setupLines}
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.${fn.name})
    }
    return createRequest(${serviceArg})
${body}
  },`;
      })
      .join('\n');

    const date = new Date().toISOString().split('T')[0];
    const mockEntries = functions
      .map((fn) => `  ${fn.name}: ${this.generateMockFromPreview(fn.responsePreview, arrayMockFns.has(fn.name))},`)
      .join('\n');
    return `/*
 * @module ${moduleName}
 * @service ${service}
 * @说明 ${moduleName} 模块接口（API 绑定自动生成）
 * @Date: ${date}
 */
${importLine}
// 预览环境 mock 数据：window.__MVGO_PREVIEW_MOCK__ 为真时，函数返回 mock，不真实调用业务接口
const __MOCK__ = {
${mockEntries}
}

const resolvePath = (path, params = {}) => path.replace(/\{([^}]+)\}/g, (_, name) => encodeURIComponent(params[name] ?? ''))
const omitParameters = (params = {}, names = []) => Object.fromEntries(Object.entries(params).filter(([name]) => !names.includes(name)))

export default {
${functionsCode}
}
`;
  }

  /**
   * 生成 Mock 文件
   */
  private generateMockFile(moduleName: string, functions: ApiCatalogFunction[]): string {
    const mockEntries = functions
      .map((fn) => {
        const mockData = this.generateMockFromPreview(fn.responsePreview);
        return `  ${fn.name}: ${mockData},`;
      })
      .join('\n');

    return `// ${moduleName} 模块 Mock 数据（API 绑定自动生成）
export default {
${mockEntries}
}
`;
  }

  /**
   * 🛡️ 2026-09-03：生成 GenerateApiView 同构的宿主工程规范产物（device.js / device.mock.js / device-enums.js）。
   * 背景：组件沙箱运行时（vue3-sfc-loader）硬性要求 .mjs 后缀，组件内 package/api/*.mjs 无法直接用于宿主工程；
   * GenerateApiView 下载的 ZIP 产物（@/api/device 引用、.js + .mock.js + -enums.js）才是公司规范。
   * 这里基于同一份 catalog functions 生成同构文件到 package/api-standalone/，供用户整套拷贝。
   * 结构对齐 apifox-generator.generateFiles：主文件（export default 对象 + createRequest 链式）、
   * mock 文件（具名导出 mock<FnName> 常量）、enums 文件（暂无枚举时空对象）。
   */
  private generateStandaloneApiFiles(mod: {
    moduleName: string;
    service: string;
    functions: ApiCatalogFunction[];
  }): { filename: string; content: string }[] {
    const { moduleName, service, functions } = mod;
    const date = new Date().toISOString().split('T')[0];
    const sbds = service === 'sbds-server';
    const serviceArg = sbds ? "'SBDS_SERVER'" : '';
    const createRequestExpr = sbds ? `createRequest('SBDS_SERVER')` : `createRequest()`;
    const serviceLabel = service || 'base-server';
    const pascalModule = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);

    const lines: string[] = [];
    lines.push(`/*`);
    lines.push(` * @module ${moduleName}`);
    lines.push(` * @service ${serviceLabel}`);
    lines.push(` * @说明 ${moduleName} 模块接口（API 绑定生成 · 宿主工程规范版）`);
    lines.push(` * @Date: ${date}`);
    lines.push(` */`);
    lines.push(``);
    lines.push(`import { createRequest } from 'microvideo-request'`);
    lines.push(``);
    // path 参数场景需要 URL 展开/剔除 helper（与组件内 .mjs 生成器同源逻辑）
    if (functions.some((fn) => (fn.params || []).some((p: any) => p.in === 'path'))) {
      lines.push(`const resolvePath = (path, params = {}) => path.replace(/\\{([^}]+)\\}/g, (_, name) => encodeURIComponent(params[name] ?? ''))`);
      lines.push(`const omitParameters = (params = {}, names = []) => Object.fromEntries(Object.entries(params).filter(([name]) => !names.includes(name)))`);
      lines.push(``);
    }
    lines.push(`export default {`);
    functions.forEach((fn, i) => {
      const method = String(fn.method || 'GET').toUpperCase();
      const hasQuery = (fn.params || []).some((p: any) => p.in === 'query');
      const hasPath = (fn.params || []).some((p: any) => p.in === 'path');
      const pathParamNames = (fn.params || []).filter((p: any) => p.in === 'path').map((p: any) => p.name);
      const needsParams = fn.hasBody || hasQuery || hasPath;
      lines.push(`  // ==================== ${i + 1}. ${fn.summary || fn.name} ====================`);
      lines.push(`  /**`);
      lines.push(`   * ${fn.summary || fn.name}`);
      if (needsParams) {
        lines.push(`   * @param {Object} params - 请求参数`);
        (fn.params || [])
          .filter((p: any) => p.in === 'query' || p.in === 'path')
          .forEach((p: any) => {
            lines.push(`   * @param {*} params.${p.name} — ${p.description || p.name}${p.required ? '（必填）' : ''}`);
          });
        if (fn.hasBody) lines.push(`   * @param {Object} params.data — 请求体`);
      }
      lines.push(`   * @returns {Object} ${fn.responsePreview || '{ rid, code, message, detail, data }'}`);
      lines.push(`   * @example`);
      lines.push(`   * import ${moduleName}Api from '@/api/${moduleName}'`);
      lines.push(`   * const res = await ${moduleName}Api.${fn.name}(${needsParams ? '{ ... }' : ''})`);
      lines.push(`   */`);
      if (needsParams) {
        lines.push(`  ${fn.name}(params) {`);
        lines.push(`    return ${createRequestExpr}`);
        if (hasPath) {
          const pathNames = JSON.stringify(pathParamNames);
          lines.push(`    const resolvedPath = resolvePath('${fn.path}', params)`);
          lines.push(`    const requestParams = omitParameters(params, ${pathNames})`);
          lines.push(`      .setParameters(requestParams)`);
        } else {
          lines.push(`      .setParameters(params)`);
        }
        if (fn.hasBody) lines.push(`      .setData(params.data || params)`);
        lines.push(`      .${method.toLowerCase()}(${hasPath ? 'resolvedPath' : `'${fn.path}'`})`);
        lines.push(`  },`);
      } else {
        lines.push(`  ${fn.name}() {`);
        lines.push(`    return ${createRequestExpr}`);
        lines.push(`      .${method.toLowerCase()}('${fn.path}')`);
        lines.push(`  },`);
      }
      lines.push(``);
    });
    lines.push(`}`);
    const apiContent = lines.join('\n');

    // Mock 文件（具名导出，结构对齐 GenerateApiView）
    const mockLines: string[] = [];
    mockLines.push(`/*`);
    mockLines.push(` * @module ${moduleName}.mock`);
    mockLines.push(` * @说明 ${moduleName} 模块 Mock 数据`);
    mockLines.push(` * @用法 import { mock${pascalModule} } from '@/api/${moduleName}.mock'`);
    mockLines.push(` * @Date: ${date}`);
    mockLines.push(` */`);
    mockLines.push(``);
    for (const fn of functions) {
      const pascalFn = fn.name.charAt(0).toUpperCase() + fn.name.slice(1);
      mockLines.push(`/**`);
      mockLines.push(` * ${fn.summary || fn.name} — Mock 响应`);
      mockLines.push(` */`);
      mockLines.push(`export const mock${pascalFn} = ${this.generateStandaloneMockValue(fn)}`);
      mockLines.push(``);
    }
    const mockContent = mockLines.join('\n');

    const enumsContent = `/*\n * @module ${moduleName}-enums\n * @说明 ${moduleName} 模块枚举常量\n * @Date: ${date}\n */\n\n// 本模块暂无枚举\nexport default {}\n`;

    return [
      { filename: `${moduleName}.js`, content: apiContent },
      { filename: `${moduleName}.mock.js`, content: mockContent },
      { filename: `${moduleName}-enums.js`, content: enumsContent },
    ];
  }

  /**
   * GenerateApiView 同构 mock 值：按 responsePreview 提示生成结构化占位（数组/对象），
   * 结构对齐 apifox-generator 的 generateMockValue 简化形态。
   */
  private generateStandaloneMockValue(fn: ApiCatalogFunction): string {
    const preview = String(fn.responsePreview || '');
    const isArray = preview.includes('[{') || preview.includes('[]') || /\[\s*\]/.test(preview);
    if (isArray) {
      return `{ "rid": "示例文本", "code": 200, "message": "示例文本", "detail": "示例文本", "data": [] }`;
    }
    return `{ "rid": "示例文本", "code": 200, "message": "示例文本", "detail": "示例文本", "data": {} }`;
  }

  /**
   * 从响应预览生成 mock 数据
   *
   * 🛡️ 2026-09-03 升级：不再返回空壳 {code:200,data:{}}（绑定直赋后图表仍空白），
   * 而是给结构化的「预览可渲染」mock：数组形态返回 24 点序列（契合小时趋势图），
   * 对象形态返回样例对象。仅平台预览走此值（__MVGO_PREVIEW_MOCK__），交付走真实接口，无副作用。
   * @param forceArray 绑定目标 ref 声明为数组（ref([...])）时强制 mock.data 为数组，
   *   避免 echarts 对对象型 data 触发 assert（RUNTIME-009 实测）。
   */
  private generateMockFromPreview(preview: string, forceArray = false): string {
    // 数组响应或目标 ref 为数组：生成带 24 点趋势的序列（0-40 波动，匹配图表 y 轴量程）
    const isArrayLike = forceArray || preview.includes('[{') || preview.includes('[]') || /\[\s*\]/.test(preview);
    if (isArrayLike) {
      const series = Array.from({ length: 24 }, (_, i) =>
        Math.round(10 + 15 * Math.abs(Math.sin(i / 3.5)) + (i % 5))
      );
      return `{ code: 200, data: ${JSON.stringify(series)} }`;
    }
    // 对象响应：样例对象（可被直赋渲染结构示意）
    return `{ code: 200, data: { series: [12, 18, 22, 28, 35, 32, 28, 25, 22, 18, 15, 12, 15, 18, 22, 26, 30, 28, 25, 20, 18, 15, 12, 10], categories: ["0","2","4","6","8","10","12","14","16","18","20","22"] } }`;
  }

  /**
   * 生成枚举文件（如果有枚举字段）
   *
   * @unimplemented — 枚举生成依赖 Apifox 返回的 schema 中包含 enum 定义，
   *   当前 Apifox 目录结构以函数列表为主，枚举字段未标准化，暂不生成。
   *   调用处已正确处理 null 返回值（跳过文件写入）。
   */
  private generateEnumsFile(_moduleName: string): string | null {
    return null;
  }

  /**
   * 生成模拟数据占位文件
   */
  private generateStubFile(slot: BindingSlotDto, sfcContent: string): string {
    const refName = slot.refName || '';
    const mockData = this.isCompositeChartSlot(slot)
      ? this.generateCompositeChartMock(slot)
      : this.extractStaticData(sfcContent, refName);

    const exportName = this.getStubExportName(slot);

    return `// TODO: 接口未定义，等待后端提供
// 槽位: ${slot.slotId} (${slot.slotType}${slot.role ? ` / ${slot.role}` : ''})
// 变量: ${slot.refName}
// 原因: ${slot.stubReason || 'Apifox 中无匹配接口'}
// 预期: 需要后端提供对应接口

export const ${exportName} = ${mockData}
`;
  }

  private isCompositeChartSlot(slot: BindingSlotDto): boolean {
    return slot.slotType === 'chart' && slot.role === 'chart.composite';
  }

  private getBindingDataName(slot: BindingSlotDto): string {
    const base = this.isCompositeChartSlot(slot) ? `${slot.refName || 'chart'}Data` : slot.refName || 'apiData';
    return this.toSafeIdentifier(base, 'apiData');
  }

  private getAdapterName(slot: BindingSlotDto): string {
    return this.toSafeIdentifier(`apply${this.capitalize(slot.refName || 'chart')}Data`, 'applyChartData');
  }

  private getStubExportName(slot: BindingSlotDto): string {
    return `mock${this.capitalize(this.getBindingDataName(slot))}`;
  }

  private toSafeIdentifier(value: string, fallback: string): string {
    const cleaned = value.replace(/[^a-zA-Z0-9_$]/g, '');
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleaned)) return cleaned;
    return fallback;
  }

  private generateCompositeChartMock(slot: BindingSlotDto): string {
    const hasTabs = slot.children?.some((child) => child.role === 'filter.tabs');
    const hasThreshold = slot.children?.some((child) => child.role === 'chart.threshold');
    return `{
  ${hasTabs ? `tabs: [
    { label: 'CO浓度', value: 'co' },
    { label: 'NO2浓度', value: 'no2' },
  ],` : `tabs: [],`}
  times: ['2', '4', '6', '8', '10', '12', '14'],
  series: [
    { name: '示例指标', type: 'line', data: [12, 18, 16, 24, 21, 28, 26] },
  ],
  ${hasThreshold ? `threshold: [{ yAxis: 30, name: '预警阈值' }],` : `threshold: [],`}
}`;
  }

  /**
   * 从 SFC 中提取静态数据作为 mock
   */
  private extractStaticData(sfcContent: string, refName: string): string {
    // 尝试在 script 中找到 ref 的初始值
    const refPattern = new RegExp(`const\\s+${refName}\\s*=\\s*ref\\(\\s*([\\s\\S]*?)\\s*\\)`, 'm');
    const match = sfcContent.match(refPattern);
    if (match && match[1] && match[1] !== '') {
      return match[1];
    }

    // 根据常见模式返回默认 mock
    if (refName.toLowerCase().includes('table') || refName.toLowerCase().includes('list')) {
      return `[
  { id: 1, name: '示例数据1' },
  { id: 2, name: '示例数据2' },
]`;
    }
    if (refName.toLowerCase().includes('chart') || refName.toLowerCase().includes('option')) {
      return `{
  title: { text: '示例图表' },
  xAxis: { type: 'category', data: ['A', 'B', 'C'] },
  yAxis: { type: 'value' },
  series: [{ data: [120, 200, 150] }],
}`;
    }
    if (refName.toLowerCase().includes('option') || refName.toLowerCase().includes('select')) {
      return `[
  { label: '选项1', value: '1' },
  { label: '选项2', value: '2' },
]`;
    }
    return `{ /* TODO: 替换为真实数据 */ }`;
  }

  /**
   * 扫描 <script setup> 内容中所有已声明的标识符
   *
   * 覆盖场景：
   *   - const / let / var 声明
   *   - function 声明
   *   - import default 名称 (import X from ...)
   *   - import named 名称 (import { X, Y as Z } from ...)
   *   - Vue 3 Composition API 内置名（保护名单）
   */
  private scanExistingIdentifiers(scriptContent: string): {
    vars: Set<string>;
    imports: Set<string>;
    refs: Set<string>;
    writable: Set<string>;
    fixableConsts: Set<string>;
    vueBuiltins: Set<string>;
  } {
    const vars = new Set<string>();
    const imports = new Set<string>();
    const refs = new Set<string>();
    const writable = new Set<string>();
    const fixableConsts = new Set<string>();
    const vueBuiltins = new Set<string>([
      // Vue 3 响应式 API
      'ref', 'reactive', 'readonly', 'computed', 'watch', 'watchEffect', 'watchPostEffect', 'watchSyncEffect',
      'shallowRef', 'triggerRef', 'customRef', 'markRaw', 'toRaw', 'toRef', 'toRefs', 'unref', 'isRef', 'isReactive', 'isReadonly',
      // 生命周期
      'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount', 'onUpdated', 'onBeforeUpdate',
      'onActivated', 'onDeactivated', 'onErrorCaptured', 'onRenderTracked', 'onRenderTriggered',
      // 组合式 API
      'provide', 'inject', 'defineProps', 'defineEmits', 'defineExpose', 'defineOptions', 'defineSlots',
      'withDefaults',
      // 工具
      'nextTick', 'useSlots', 'useAttrs',
    ]);

    const sourceFile = ts.createSourceFile(
      'component-script.ts',
      scriptContent,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    );
    const addBindingNames = (name: ts.BindingName, target: Set<string>) => {
      if (ts.isIdentifier(name)) {
        target.add(name.text);
        return;
      }
      for (const element of name.elements) {
        if (!ts.isOmittedExpression(element)) addBindingNames(element.name, target);
      }
    };

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        if (statement.importClause.name) imports.add(statement.importClause.name.text);
        const namedBindings = statement.importClause.namedBindings;
        if (namedBindings && ts.isNamespaceImport(namedBindings)) imports.add(namedBindings.name.text);
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          namedBindings.elements.forEach((element) => imports.add(element.name.text));
        }
        continue;
      }
      if (ts.isVariableStatement(statement)) {
        const isMutableDeclaration = (statement.declarationList.flags & ts.NodeFlags.Const) === 0;
        for (const declaration of statement.declarationList.declarations) {
          addBindingNames(declaration.name, vars);
          if (isMutableDeclaration) addBindingNames(declaration.name, writable);
          if (ts.isIdentifier(declaration.name) && declaration.initializer) {
            if (
              ts.isCallExpression(declaration.initializer)
              && ts.isIdentifier(declaration.initializer.expression)
              && declaration.initializer.expression.text === 'ref'
            ) {
              refs.add(declaration.name.text);
              writable.add(declaration.name.text);
            }
            if (
              (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
              && (ts.isArrayLiteralExpression(declaration.initializer)
                || ts.isObjectLiteralExpression(declaration.initializer))
            ) {
              fixableConsts.add(declaration.name.text);
            }
          }
        }
        continue;
      }
      if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
        && statement.name
      ) {
        vars.add(statement.name.text);
      }
    }

    return { vars, imports, refs, writable, fixableConsts, vueBuiltins };
  }

  /**
   * L3: 检查可注入的 slots，返回 { injectable, skipped, fixable }
   * - injectable: 可直接注入的 slots
   * - skipped: 真正无法处理的（Vue API 冲突、import 冲突）
   * - fixable: 裸 const 类型，可以自动转 ref() 后注入
   */
  private classifyInjectableSlots(
    slots: BindingSlotDto[],
    existingVars: Set<string>,
    existingImports: Set<string>,
    writable: Set<string>,
    fixableConsts: Set<string>,
    vueBuiltins: Set<string>,
  ): { injectable: BindingSlotDto[]; skipped: string[]; fixable: BindingSlotDto[] } {
    const injectable: BindingSlotDto[] = [];
    const skipped: string[] = [];
    const fixable: BindingSlotDto[] = [];

    for (const slot of slots) {
      // 检查 moduleName 冲突（硬冲突，跳过）
      if (slot.moduleName) {
        const apiImportName = `${slot.moduleName}Api`;
        if (existingVars.has(apiImportName) || existingImports.has(apiImportName)) {
          skipped.push(`${slot.slotId}: 自动导入名 ${apiImportName} 已存在`);
          continue;
        }
      }

      const targetName = this.getBindingDataName(slot);
      if (!targetName) {
        injectable.push(slot);
        continue;
      }

      // Vue 内置 API 冲突（硬冲突）
      if (vueBuiltins.has(targetName)) {
        skipped.push(`${slot.slotId}: ${targetName} 与 Vue API 冲突`);
        continue;
      }

      // import 绑定冲突（硬冲突）
      if (existingImports.has(targetName) && !existingVars.has(targetName)) {
        skipped.push(`${slot.slotId}: ${targetName} 是 import 绑定，不能作为接口赋值目标。建议：换一个不被 import 占用的变量名`);
        continue;
      }

      // 只有标识符形式的数组/对象字面量 const 才允许自动包裹为 ref/reactive。
      if (existingVars.has(targetName) && !writable.has(targetName)) {
        if (fixableConsts.has(targetName)) {
          fixable.push(slot);
        } else {
          skipped.push(`${slot.slotId}: ${targetName} 是只读或解构绑定（如 computed() / readonly() / 解构），API 无法改写。建议：进入 Playground 把 ${targetName} 改为 ref() 或 reactive() 后再绑定`);
        }
        continue;
      }

      // 可注入
      injectable.push(slot);
    }

    return { injectable, skipped, fixable };
  }

  /**
   * 注入代码到 SFC 的 <script setup>
   *
   * 注入前做全面的标识符冲突检测：
   *   - import 语句：与已有 import 去重
   *   - 变量声明：const/let/var/function 均已声明则跳过
   *   - Vue 内置名保护：refName 若与 Vue API 同名则跳过
   *   - onMounted 赋值：若变量已存在且非 ref，则用直接赋值（不用 .value）
   */
  private injectCodeIntoSFC(
    sfc: string,
    boundSlots: BindingSlotDto[],
    stubSlots: BindingSlotDto[],
    skippedSlots: BindingSlotDto[],
  ): string {
    // 1. 移除旧的注入代码
    let content = this.removeInjectedCode(sfc);

    // 提取 <script setup> 内容用于标识符扫描
    const scriptMatch = content.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/);
    const scriptBody = scriptMatch ? scriptMatch[1] : '';

    // 扫描所有已存在的标识符
    const {
      vars: existingVars,
      imports: existingImports,
      refs: existingRefs,
      writable,
      fixableConsts,
      vueBuiltins,
    } = this.scanExistingIdentifiers(scriptBody);

    // 分类检查 slots：injectable（可注入）、skipped（硬冲突）、fixable（可自动修复）
    const { injectable: validBoundSlots, skipped: boundSkipped, fixable: boundFixable } = this.classifyInjectableSlots(
      boundSlots,
      existingVars,
      existingImports,
      writable,
      fixableConsts,
      vueBuiltins,
    );
    const { injectable: validStubSlots, skipped: stubSkipped, fixable: stubFixable } = this.classifyInjectableSlots(
      stubSlots,
      existingVars,
      existingImports,
      writable,
      fixableConsts,
      vueBuiltins,
    );

    // 🆕 L3 自动修复：把裸 const 转成 ref()，修复后加入 injectable 列表
    const allFixable = [...boundFixable, ...stubFixable];
    if (allFixable.length > 0) {
      const fixResult = this.autoFixBareConstInSFC(content, allFixable, scriptBody);
      content = fixResult.newContent;
      // 修复后的 slot 重新加入 injectable 列表（需要重新扫描标识符）
      const newScriptMatch = content.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/);
      const newScriptBody = newScriptMatch ? newScriptMatch[1] : '';
      const { writable: newWritable } = this.scanExistingIdentifiers(newScriptBody);
      const fixedNames = new Set(fixResult.fixedNames);
      // 只有确实完成 AST 边界内字面量改写、且重新扫描后可写的变量才进入注入链路。
      const fixableSlots = allFixable.filter(s => {
        const dataName = this.getBindingDataName(s);
        return dataName && fixedNames.has(dataName) && newWritable.has(dataName);
      });
      const fixableNames = new Set(fixableSlots.map(s => s.slotId));
      if (fixableSlots.length > 0) {
        this.logger.log(`[L3] 自动修复 ${fixableSlots.length} 个裸 const → ref: ${fixableNames.size > 0 ? [...fixableNames].join(', ') : 'slots'}`);
      }
      // 把修复后的 slots 加回 injectable（按 bound/stub 分类）
      for (const slot of fixableSlots) {
        if (boundFixable.includes(slot) && !validBoundSlots.find(s => s.slotId === slot.slotId)) {
          validBoundSlots.push(slot);
        } else if (stubFixable.includes(slot) && !validStubSlots.find(s => s.slotId === slot.slotId)) {
          validStubSlots.push(slot);
        }
      }
    }

    // 记录跳过的 slots（硬冲突）
    const allSkipped = [...boundSkipped, ...stubSkipped];
    if (allSkipped.length > 0) {
      this.logger.warn(`[ApiBinding] 以下 slots 存在不可修复的符号冲突: ${allSkipped.join('; ')}`);
      throw new BadRequestException({
        code: 'API_BINDING_CONFLICT',
        message: '部分数据槽因代码冲突无法自动绑定',
        details: allSkipped,
      });
    }

    // 2. 构造 import 语句（按 moduleName 去重）
    const importLines: string[] = [];
    const importedModules = new Set<string>();
    for (const slot of validBoundSlots) {
      if (slot.moduleName && !importedModules.has(slot.moduleName)) {
        importedModules.add(slot.moduleName);
        const importName = `${slot.moduleName}Api`;
        importLines.push(
          `import ${importName} from './api/${slot.moduleName}.mjs'  // ${slot.slotId}: ${slot.label || slot.refName}`,
        );
      }
    }
    // stub 导入：按 exportName 去重；同名用户符号已在冲突检查中阻断。
    const stubExportNames = new Set<string>();
    for (const slot of validStubSlots) {
      const exportName = this.getStubExportName(slot);
      if (!stubExportNames.has(exportName)) {
        if (existingVars.has(exportName) || existingImports.has(exportName)) {
          throw new BadRequestException(`stub 导入名已存在: ${exportName}`);
        }
        stubExportNames.add(exportName);
        importLines.push(
          `import { ${exportName} } from './api/stub-${slot.slotId}.mjs'  // stub ${slot.slotId}`,
        );
      }
    }

    // 3. 构造 ref 声明（跳过已存在的 const/let/var/function 声明 + Vue 内置名）
    const refLines: string[] = [];
    const allSlots = [...validBoundSlots, ...validStubSlots];
    const bindingTargets = new Map<string, BindingSlotDto>();
    for (const slot of allSlots) {
      const dataName = this.getBindingDataName(slot);
      if (!dataName) continue;
      bindingTargets.set(dataName, slot);
    }
    for (const [dataName, slot] of bindingTargets) {
      if (vueBuiltins.has(dataName)) {
        this.logger.warn(`[ApiBinding] dataName "${dataName}" 与 Vue 内置名冲突，跳过 ref 注入`);
        continue;
      }
      if (existingVars.has(dataName)) continue;
      if (refLines.some(line => line.includes(`const ${dataName} = ref`))) continue;

      const initValue = slot.slotType === 'table' || slot.slotType === 'list' ? '[]' : '{}';
      refLines.push(`const ${dataName} = ref(${initValue})  // ${slot.slotId}: ${slot.label || ''}`);
    }

    const adapterLines = this.generateAdapterLines(allSlots, existingVars, scriptBody);

    // 4. 构造 onMounted 逻辑
    //    关键：若变量已存在且非 ref，用直接赋值（=）而非 .value 赋值
    const onMountedLines: string[] = [];
    for (const slot of validBoundSlots) {
      if (slot.moduleName && slot.functionName && slot.refName) {
        const fnCall = this.buildApiFunctionCall(slot);
        const resVar = `__res_${slot.slotId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

        const dataName = this.getBindingDataName(slot);
        const isExistingRef = existingRefs.has(dataName);
        const isExistingWritableVar = writable.has(dataName) && !isExistingRef;
        const isNewlyInjectedRef = refLines.some(l => l.includes(`const ${dataName} = ref`));
        const useValueAccess = isExistingRef || isNewlyInjectedRef || !isExistingWritableVar;

        const assignTarget = useValueAccess ? `${dataName}.value` : dataName;

        onMountedLines.push(
          `  // ${slot.slotId}: ${slot.label || slot.refName} → ${slot.moduleName}.${slot.functionName}`,
        );
        onMountedLines.push(`  try {`);
        onMountedLines.push(`    const ${resVar} = await ${fnCall}`);
        onMountedLines.push(`    if (${resVar}?.code === 200 || ${resVar}?.data) {`);
        onMountedLines.push(`      ${assignTarget} = ${resVar}.data || ${resVar}`);
        if (this.isCompositeChartSlot(slot)) {
          onMountedLines.push(`      ${this.getAdapterName(slot)}(${assignTarget})`);
        }
        onMountedLines.push(`    }`);
        onMountedLines.push(`  } catch (e) { console.error('${slot.slotId} ${fnCall}:', e) }`);
        onMountedLines.push('');
      }
    }
    for (const slot of validStubSlots) {
      if (!slot.refName) continue;
      const exportName = this.getStubExportName(slot);
      const dataName = this.getBindingDataName(slot);

      const isExistingRef = existingRefs.has(dataName);
      const isExistingWritableVar = writable.has(dataName) && !isExistingRef;
      const isNewlyInjectedRef = refLines.some(l => l.includes(`const ${dataName} = ref`));
      const useValueAccess = isExistingRef || isNewlyInjectedRef || !isExistingWritableVar;
      const assignTarget = useValueAccess ? `${dataName}.value` : dataName;

      onMountedLines.push(`  // stub ${slot.slotId}: ${dataName} — 使用 mock data`);
      onMountedLines.push(`  ${assignTarget} = ${exportName}`);
      if (this.isCompositeChartSlot(slot)) {
        onMountedLines.push(`  ${this.getAdapterName(slot)}(${assignTarget})`);
      }
      onMountedLines.push(`  // TODO: 接口就绪后替换为真实调用`);
      onMountedLines.push('');
    }

    // 5. 分离 import 部分和非 import 部分
    const hasImports = importLines.length > 0;
    const hasRefs = refLines.length > 0;
    const hasMounted = onMountedLines.length > 0;

    // 6. 检查并补全 Vue import
    const needsRef = refLines.length > 0 && !existingImports.has('ref');
    const needsOnMounted = hasMounted && !existingImports.has('onMounted');

    let vueImportLine = '';
    if (needsRef || needsOnMounted) {
      const vueImports: string[] = [];
      if (needsRef) vueImports.push('ref');
      if (needsOnMounted) vueImports.push('onMounted');
      vueImportLine = `import { ${vueImports.join(', ')} } from 'vue'`;
    }

    // 构建 import 注入文本（必须放在已有 import 之后）
    const allImportLines: string[] = [];
    if (vueImportLine) allImportLines.push(vueImportLine);
    if (hasImports) allImportLines.push(...importLines);

    const importInjectionText = allImportLines.length > 0
      ? '\n// === API 对接导入 (自动生成) ===\n' + allImportLines.join('\n') + '\n// === END API 导入 ===\n'
      : '';

    // 构建非 import 注入文本（放在 script setup 末尾）
    const nonImportParts: string[] = [];
    nonImportParts.push('// === API 对接注入 (自动生成，请勿手动修改) ===');
    if (hasRefs) nonImportParts.push(refLines.join('\n'));
    if (adapterLines.length > 0) nonImportParts.push(adapterLines.join('\n'));
    if (hasMounted) {
      nonImportParts.push('// === API 对接调用 ===');
      nonImportParts.push(`onMounted(async () => {\n${onMountedLines.join('\n')}\n})`);
    }
    nonImportParts.push('// === END API 对接注入 ===');
    const nonImportInjectionText = '\n' + nonImportParts.join('\n') + '\n';

    // 7. 插入到正确位置
    const scriptStartMatch = content.match(/<script\s+setup[^>]*>/);
    if (scriptStartMatch && scriptMatch && scriptMatch.index !== undefined) {
      const tagEnd = scriptMatch.index + scriptStartMatch[0].length;
      const scriptCloseIdx = content.indexOf('</script>', tagEnd);

      if (scriptCloseIdx !== -1) {
        const scriptBodyContent = content.substring(tagEnd, scriptCloseIdx);
        const lastImportEnd = this.findLastImportEnd(scriptBodyContent);
        const insertImportAt = tagEnd + lastImportEnd;

        // 先插入后面的（非 import 块在 script 末尾），再插入前面的（import 块在 import 之后）
        // 避免偏移问题
        content =
          content.substring(0, insertImportAt) +
          importInjectionText +
          content.substring(insertImportAt, scriptCloseIdx) +
          nonImportInjectionText +
          content.substring(scriptCloseIdx);
      }
    } else {
      // 没有 <script setup> 标签 — 在 SFC 末尾添加完整 script 块
      const allText = importInjectionText + nonImportInjectionText;
      content += `\n<script setup>${allText}</script>\n`;
    }

    return content;
  }

  private generateAdapterLines(slots: BindingSlotDto[], existingVars: Set<string>, scriptBody: string): string[] {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const slot of slots) {
      if (!this.isCompositeChartSlot(slot)) continue;
      const adapterName = this.getAdapterName(slot);
      if (seen.has(adapterName) || existingVars.has(adapterName)) continue;
      seen.add(adapterName);
      const instanceName = this.findChartInstanceName(slot, scriptBody);
      if (!instanceName) {
        lines.push(`function ${adapterName}(data) {`);
        lines.push(`  // TODO: 未识别到 ECharts 实例变量，请按组件图表初始化逻辑补充 setOption 映射`);
        lines.push(`  return data`);
        lines.push(`}`);
        continue;
      }
      lines.push(`function ${adapterName}(data) {`);
      lines.push(`  const payload = data?.data || data || {}`);
      lines.push(`  const times = payload.times || payload.xAxis || payload.categories || []`);
      lines.push(`  const series = Array.isArray(payload.series) ? payload.series : []`);
      lines.push(`  const threshold = payload.threshold || payload.markLine || []`);
      lines.push(`  if (!${instanceName} || typeof ${instanceName}.setOption !== 'function') return`);
      lines.push(`  ${instanceName}.setOption({`);
      lines.push(`    xAxis: times.length ? { data: times } : undefined,`);
      lines.push(`    series: series.map((item) => ({`);
      lines.push(`      ...item,`);
      lines.push(`      markLine: threshold.length ? { data: threshold } : item.markLine,`);
      lines.push(`    })),`);
      lines.push(`  })`);
      lines.push(`}`);
    }
    return lines;
  }

  private findChartInstanceName(slot: BindingSlotDto, scriptBody: string): string | null {
    if (!slot.refName) return null;
    const escapedRefName = slot.refName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const initPattern = new RegExp(`([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*echarts\\.init\\(\\s*${escapedRefName}\\.value\\s*\\)`);
    const initMatch = scriptBody.match(initPattern);
    if (initMatch?.[1]) return initMatch[1];
    if (scriptBody.includes('let chartInstance') || scriptBody.includes('const chartInstance')) return 'chartInstance';
    return null;
  }

  /**
   * 移除已注入的代码
   */
  private removeInjectedCode(sfc: string): string {
    // 只移除紧贴自动注入块的 Vue import，避免误删用户原本写在脚本顶部的 import。
    let content = sfc.replace(
      /(<script\s+setup[^>]*>\s*\n)(import\s*\{\s*(ref|onMounted)(\s*,\s*(ref|onMounted))*\s*\}\s*from\s*'vue'\s*\n)(\/\/ === API 对接注入[\s\S]*?\/\/ === END API 对接注入 ===\s*)/g,
      '$1',
    );

    content = content.replace(
      /\/\/ === API 对接导入 \(自动生成\)[\s\S]*?\/\/ === END API 导入 ===\s*/g,
      '',
    );
    content = content.replace(
      /\/\/ === API 对接注入[\s\S]*?\/\/ === END API 对接注入 ===\s*/g,
      '',
    );

    return content;
  }

  /**
   * 在 script body 中找到最后一个 import 语句结束的位置（相对于 body 的偏移量）
   */
  private findLastImportEnd(scriptBody: string): number {
    // 使用 TypeScript AST 解析以正确处理多行 import 和动态导入
    const sourceFile = ts.createSourceFile(
      'find-imports.ts',
      scriptBody,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    );

    let lastImportEnd = 0;
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        lastImportEnd = statement.end;
      }
    }

    return lastImportEnd;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private sameTargetSet(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((path) => right.includes(path));
  }

  private getComponentTargets(
    componentId: string,
    groupId: string,
    primaryPath: string,
  ): string[] {
    const candidates = [
      primaryPath,
      join(resolveFrontendWorkspace(), 'vue3-components', groupId, componentId),
      join(vue3ComponentsDir, groupId, componentId),
    ];
    return [...new Set(candidates)].filter((candidate) => existsSync(candidate));
  }

  /**
   * B: 绑定前消费性检查——检查每个 slot 的数据变量（dataName）是否被组件真实消费。
   *
   * 判断「被消费」的两个信号：
   *   - 模板 <template> 里被引用（{{x}} / :data="x" / v-for="x in list" / v-if="x" 等）
   *   - 脚本 <script setup> 里被引用（watch(x) / computed(()=>x) / setOption({data:x}) / x.value 等），
   *     排除「const/let/var x = ...」这类纯声明处。
   * 两者都没有 → 该变量绑定后不会被 UI 消费（无效绑定），返回警告（不阻断，仅提示）。
   */
  private checkSlotConsumption(slots: BindingSlotDto[], sfcContent: string): string[] {
    const warnings: string[] = [];
    const templateMatch = sfcContent.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
    const template = templateMatch ? templateMatch[1] : '';
    const scriptMatch = sfcContent.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/i);
    const script = scriptMatch ? scriptMatch[1] : '';

    for (const slot of slots) {
      const dataName = this.getBindingDataName(slot);
      if (!dataName) continue;
      const escaped = dataName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const word = new RegExp(`\\b${escaped}\\b`);

      const usedInTemplate = word.test(template);
      // 脚本里引用（排除 const/let/var dataName 声明处）
      const scriptNoDecl = script.replace(
        new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b`, 'g'),
        '',
      );
      const usedInScript = word.test(scriptNoDecl);

      if (!usedInTemplate && !usedInScript) {
        const slotKind = slot.slotType === 'chart'
          ? '图表仍可能渲染为静态写死的数据'
          : '界面内容不会随数据更新';
        warnings.push(
          `[${slot.slotId}] 数据变量「${dataName}」在组件中未被消费，绑定后 ${slotKind}。建议确认组件已用 ${dataName} 驱动 ${slot.slotType} 渲染，或该槽位本就不需要动态数据。`,
        );
      }
    }
    return warnings;
  }

  private validateCatalogBindings(catalog: ApiCatalog, slots: BindingSlotDto[]): RuntimeRequestMock[] {
    const parameterIssues: Array<{
      slotId: string;
      api: string;
      parameter: string;
      location: string;
      message: string;
    }> = [];
    const requestMocks = new Map<string, RuntimeRequestMock>();

    for (const slot of slots) {
      const mod = catalog.modules.find((item) => item.moduleName === slot.moduleName);
      if (!mod) throw new BadRequestException(`API 模块不存在: ${slot.moduleName}`);
      const fn = mod.functions.find((item) => item.name === slot.functionName);
      if (!fn) {
        throw new BadRequestException(`API 函数不存在: ${slot.moduleName}.${slot.functionName}`);
      }

      const values = slot.parameterValues || {};
      for (const parameter of fn.params.filter((item) => item.required)) {
        const value = values[parameter.name];
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
          parameterIssues.push({
            slotId: slot.slotId,
            api: `${slot.moduleName}.${slot.functionName}`,
            parameter: parameter.name,
            location: parameter.in,
            message: `${parameter.description || parameter.name}（${parameter.in}）为必填参数`,
          });
        }
      }

      for (const [name, value] of Object.entries(values)) {
        if (!fn.params.some((parameter) => parameter.name === name)) {
          throw new BadRequestException(`API 参数不存在: ${slot.moduleName}.${slot.functionName}.${name}`);
        }
        if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
          throw new BadRequestException(`API 参数值仅支持字符串、数字、布尔值或 null: ${name}`);
        }
      }

      const key = `${fn.method.toUpperCase()} ${fn.path}`;
      requestMocks.set(key, {
        method: fn.method.toUpperCase(),
        path: fn.path,
        response: { code: 200, data: this.generateMockData(fn.responsePreview) },
      });
    }

    if (parameterIssues.length > 0) {
      throw new BadRequestException({
        code: 'API_BINDING_REQUIRED_PARAMETERS_MISSING',
        message: `API 绑定缺少 ${parameterIssues.length} 个必填参数，请补充后重试`,
        parameterIssues,
      });
    }

    return [...requestMocks.values()];
  }

  private buildApiFunctionCall(slot: BindingSlotDto): string {
    const values = slot.parameterValues || {};
    const argument = Object.keys(values).length > 0
      ? JSON.stringify(values)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
      : '';
    return `${slot.moduleName}Api.${slot.functionName}(${argument})`;
  }

  private generateMockData(preview: string): unknown {
    // 如果 preview 明确包含数组格式，返回数组
    if (preview.includes('[{')) return [{}];
    // 如果 preview 包含 "data" 字段（常见 API 响应结构），返回包含 data 数组的对象
    if (preview.includes('data')) return { data: [{}] };
    // 默认返回数组（echarts 等组件需要数组）
    return [{}];
  }

  private resolveComponentEntry(componentDir: string): string {
    const candidates = [join('package', 'index.vue'), 'index.vue'];
    const entry = candidates.find((relativePath) => existsSync(join(componentDir, relativePath)));
    if (!entry) {
      throw new BadRequestException(
        `组件缺少绑定入口: ${join(componentDir, 'package', 'index.vue')} 或 ${join(componentDir, 'index.vue')}`,
      );
    }
    return entry;
  }

  private removePreviousBindingModules(
    apiDir: string,
    modifiedFiles: string[],
    apiRelativeDir: string,
  ): void {
    const prefix = `${apiRelativeDir}/`;
    for (const relativePath of modifiedFiles) {
      if (!relativePath.startsWith(prefix)) continue;
      const name = relativePath.substring(prefix.length);
      if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:js|mjs)$/.test(name)) {
        for (const candidate of this.getApiModuleCleanupNames(name)) {
          rmSync(join(apiDir, candidate), { force: true });
        }
      }
    }
  }

  private getApiModuleCleanupNames(name: string): string[] {
    if (name.endsWith('.mjs')) return [name, name.replace(/\.mjs$/, '.js')];
    if (name.endsWith('.js')) return [name, name.replace(/\.js$/, '.mjs')];
    return [name];
  }

  private cleanBindingFromSnapshot(snapshotPath: string, record: BindingRecord): void {
    const entryRelativePath = this.resolveComponentEntry(snapshotPath);
    const entryDir = dirname(entryRelativePath);
    const apiRelativeDir = entryDir === '.' ? 'api' : join(entryDir, 'api');
    const apiDir = join(snapshotPath, apiRelativeDir);
    if (existsSync(apiDir)) {
      this.removePreviousBindingModules(apiDir, record.modifiedFiles, apiRelativeDir);
    }
    const entryPath = join(snapshotPath, entryRelativePath);
    const restored = this.removeInjectedCode(readFileSync(entryPath, 'utf-8'));
    writeFileSync(entryPath, restored, 'utf-8');
  }

  private async runRuntimePreflight(
    componentId: string,
    groupId: string,
    outputPath: string,
    requestMocks: RuntimeRequestMock[],
  ): Promise<void> {
    const { renderScreenshot } = await import('../ai-engine/roles/screenshot-renderer.js');
    const result = await renderScreenshot({
      outputPath,
      sessionId: componentId,
      componentName: componentId,
      target: 'vue3',
      groupId,
      hardGate: true,
      requestMocks,
    });
    if (result.runtimeGate?.status === 'BLOCK') {
      const issues = Array.isArray(result.runtimeGate.issues) ? result.runtimeGate.issues : [];
      this.logger.warn(
        `[ApiBinding] 真实运行时检查阻断: componentId=${componentId}, issues=${JSON.stringify(
          issues.map((issue: any) => ({
            id: issue?.id,
            category: issue?.category,
            message: issue?.message,
            evidence: issue?.evidence,
          })),
        )}`,
      );
      throw new BadRequestException({
        code: 'API_BINDING_RUNTIME_PREFLIGHT_FAILED',
        message: 'API 绑定真实运行时检查失败，已回滚发布',
        runtimeGate: result.runtimeGate,
      });
    }

    // API 绑定只注入数据获取逻辑，不改变模板/布局，故不再用「设计稿」做视觉相似度基准。
    // 原因：组件本身与设计稿（mc-preview.png）的差异是「组件实现质量」，属生成阶段职责，
    // 与绑定无关；若在此用设计稿对比（阈值 95），会把所有「组件本身实现较差」的绑定误判回滚。
    // 运行时硬门禁（hardGate）已覆盖：load-error / console.error / 白屏（RUNTIME-012），足够防「绑定破坏组件」。
    if (!result.renderedImage) {
      throw new BadRequestException({
        code: 'API_BINDING_RUNTIME_PREFLIGHT_NO_SCREENSHOT',
        message: 'API 绑定后无法生成渲染截图，已回滚发布',
      });
    }
  }

  private readBindings(): BindingRecord[] {
    if (!existsSync(this.storePath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.storePath, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      throw new BadRequestException(`绑定记录损坏，拒绝覆盖: ${(error as Error).message}`);
    }
  }

  private writeBindingsToPath(records: BindingRecord[], targetPath: string): void {
    mkdirSync(dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tempPath, `${JSON.stringify(records, null, 2)}\n`, 'utf-8');
    renameSync(tempPath, targetPath);
  }

  private upsertBinding(records: BindingRecord[], record: BindingRecord): BindingRecord[] {
    return [
      ...records.filter((binding) => binding.componentId !== record.componentId),
      record,
    ];
  }


  /**
   * L3 自动修复：把裸 const 变量自动改成 ref() 包裹
   * 适用于 fixable slots（裸 const 不可写的情况）
   */
  private autoFixBareConstInSFC(
    sfc: string,
    slots: BindingSlotDto[],
    scriptBody: string,
  ): { newContent: string; fixedNames: string[] } {
    const fixedNames: string[] = [];
    let content = sfc;

    for (const slot of slots) {
      const dataName = this.getBindingDataName(slot);
      if (!dataName) continue;

      // 查找 const dataName = <literal> 模式
      // 匹配: const tabs = ['a', 'b'] 或 const config = { key: 'val' }
      const patterns = [
        // const name = [...]
        new RegExp(`(const\\s+${dataName}\\s*=\\s*)(\\[[\\s\\S]*?\\])`, 'm'),
        // const name = {...}
        new RegExp(`(const\\s+${dataName}\\s*=\\s*)(\\{[\\s\\S]*?\\})`, 'm'),
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          const prefix = match[1];  // "const tabs = "
          const literal = match[2]; // "[...]" 或 "{...}"
          const isArray = literal.startsWith('[');
          const wrapper = isArray ? 'ref' : 'reactive';
          const replacement = `${prefix}${wrapper}(${literal})`;
          content = content.replace(match[0], replacement);
          fixedNames.push(dataName);
          this.logger.log(`[L3 autoFix] ${dataName}: const → ${wrapper}()`);
          break;
        }
      }
    }

    return { newContent: content, fixedNames };
  }
}
