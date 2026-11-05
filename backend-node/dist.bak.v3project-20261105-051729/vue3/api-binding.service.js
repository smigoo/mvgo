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
var ApiBindingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiBindingService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const typescript_1 = __importDefault(require("typescript"));
const path_1 = require("path");
const fs_1 = require("fs");
const apifox_service_1 = require("../apifox/apifox.service");
const workspace_config_1 = require("../config/workspace.config");
const api_binding_preflight_service_1 = require("./api-binding-preflight.service");
const workspace_transaction_service_1 = require("./workspace-transaction.service");
const incremental_file_cleanup_service_1 = require("./incremental-file-cleanup.service");
const task_code_snapshot_service_1 = require("../tasks/task-code-snapshot.service");
const backend_root_1 = require("../config/backend-root");
let ApiBindingService = ApiBindingService_1 = class ApiBindingService {
    apifoxService;
    preflight;
    workspaceTransaction;
    cleanup;
    taskCodeSnapshot;
    logger = new common_1.Logger(ApiBindingService_1.name);
    storePath = (0, path_1.join)(backend_root_1.dataDir, 'api-bindings.json');
    constructor(apifoxService, preflight, workspaceTransaction, cleanup, taskCodeSnapshot) {
        this.apifoxService = apifoxService;
        this.preflight = preflight;
        this.workspaceTransaction = workspaceTransaction;
        this.cleanup = cleanup;
        this.taskCodeSnapshot = taskCodeSnapshot;
    }
    async bindApi(dto) {
        const catalog = this.apifoxService.getCatalog(dto.catalogId);
        if (!catalog) {
            throw new common_1.NotFoundException(`API 目录不存在: ${dto.catalogId}`);
        }
        const componentDir = this.getComponentDir(dto.componentId, dto.groupId);
        const normalizedGroupId = this.normalizeGroupIdFromDir(componentDir, dto.groupId, dto.componentId);
        const effectiveDto = { ...dto, groupId: normalizedGroupId };
        const targetPaths = this.getComponentTargets(effectiveDto.componentId, normalizedGroupId, componentDir);
        const existingBindings = this.readBindings();
        const previousBinding = existingBindings.find((binding) => binding.componentId === dto.componentId);
        if (previousBinding?.targetPaths && !this.sameTargetSet(previousBinding.targetPaths, targetPaths)) {
            throw new common_1.BadRequestException('组件 workspace 目标集合已变化，请先恢复旧绑定后再重新绑定');
        }
        const inheritedSnapshot = previousBinding?.snapshotDir && (0, fs_1.existsSync)(previousBinding.snapshotDir);
        const bindingId = `bind-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        const transactionRoot = (0, path_1.join)(backend_root_1.dataDir, '.api-binding-transactions', bindingId);
        const stagingPaths = targetPaths.map((_, index) => (0, path_1.join)(transactionRoot, `component-${index}`));
        const snapshotDir = inheritedSnapshot
            ? previousBinding.snapshotDir
            : (0, path_1.join)(backend_root_1.dataDir, 'api-binding-snapshots', bindingId);
        const storeStagingPath = (0, path_1.join)(transactionRoot, 'api-bindings.json');
        const entryRelativePath = this.resolveComponentEntry(componentDir);
        const entryDir = (0, path_1.dirname)(entryRelativePath);
        const apiRelativeDir = entryDir === '.' ? 'api' : (0, path_1.join)(entryDir, 'api');
        const sfcPath = (0, path_1.join)(componentDir, entryRelativePath);
        const sfcContent = (0, fs_1.readFileSync)(sfcPath, 'utf-8');
        const boundModules = new Set();
        const boundSlots = [];
        const stubSlots = [];
        const skippedSlots = [];
        for (const slot of dto.bindings) {
            if (slot.status === 'bound' && slot.moduleName && slot.functionName) {
                boundModules.add(slot.moduleName);
                boundSlots.push(slot);
            }
            else if (slot.status === 'stub') {
                stubSlots.push(slot);
            }
            else {
                skippedSlots.push(slot);
            }
        }
        const runtimeRequestMocks = this.validateCatalogBindings(catalog, boundSlots);
        this.logger.log(`[ApiBinding] 绑定 ${boundSlots.length} 个, 模拟数据 ${stubSlots.length} 个, 跳过 ${skippedSlots.length} 个`);
        const consumptionWarnings = this.checkSlotConsumption([...boundSlots, ...stubSlots], sfcContent);
        if (consumptionWarnings.length > 0) {
            this.logger.warn(`[ApiBinding] 消费性警告 ${consumptionWarnings.length} 条:\n${consumptionWarnings.join('\n')}`);
        }
        try {
            (0, fs_1.mkdirSync)(transactionRoot, { recursive: true });
            if (!inheritedSnapshot)
                (0, fs_1.mkdirSync)(snapshotDir, { recursive: true });
            targetPaths.forEach((targetPath, index) => {
                (0, fs_1.cpSync)(targetPath, stagingPaths[index], { recursive: true, force: true });
                if (!inheritedSnapshot) {
                    const snapshotPath = (0, path_1.join)(snapshotDir, `component-${index}`);
                    (0, fs_1.cpSync)(targetPath, snapshotPath, { recursive: true, force: true });
                    if (previousBinding) {
                        this.cleanBindingFromSnapshot(snapshotPath, previousBinding);
                    }
                }
            });
            const primaryStaging = stagingPaths[0];
            const apiDir = (0, path_1.join)(primaryStaging, apiRelativeDir);
            (0, fs_1.mkdirSync)(apiDir, { recursive: true });
            this.removePreviousBindingModules(apiDir, previousBinding?.modifiedFiles || [], apiRelativeDir);
            const modifiedFiles = [];
            const standaloneParent = entryDir === '.' ? 'api-standalone' : (0, path_1.join)(entryDir, 'api-standalone');
            const standaloneDir = (0, path_1.join)(primaryStaging, standaloneParent);
            const standaloneFiles = [];
            const arrayMockFns = new Set();
            for (const slot of [...boundSlots, ...stubSlots]) {
                const dataRefName = this.getBindingDataName(slot);
                if (!dataRefName)
                    continue;
                const escaped = dataRefName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*ref\\(\\s*\\[`).test(sfcContent)) {
                    if (slot.functionName)
                        arrayMockFns.add(slot.functionName);
                    else if (slot.refName)
                        arrayMockFns.add(slot.refName);
                }
            }
            for (const moduleName of boundModules) {
                const mod = catalog.modules.find((item) => item.moduleName === moduleName);
                const apiContent = this.generateApiModuleFile(mod.moduleName, mod.service, mod.functions, arrayMockFns);
                (0, fs_1.writeFileSync)((0, path_1.join)(apiDir, `${mod.moduleName}.mjs`), apiContent, 'utf-8');
                modifiedFiles.push(`${apiRelativeDir}/${mod.moduleName}.mjs`);
                const mockContent = this.generateMockFile(mod.moduleName, mod.functions);
                (0, fs_1.writeFileSync)((0, path_1.join)(apiDir, `${mod.moduleName}.mock.mjs`), mockContent, 'utf-8');
                modifiedFiles.push(`${apiRelativeDir}/${mod.moduleName}.mock.mjs`);
                const enumsContent = this.generateEnumsFile(mod.moduleName);
                if (enumsContent) {
                    (0, fs_1.writeFileSync)((0, path_1.join)(apiDir, `${mod.moduleName}-enums.mjs`), enumsContent, 'utf-8');
                    modifiedFiles.push(`${apiRelativeDir}/${mod.moduleName}-enums.mjs`);
                }
                (0, fs_1.mkdirSync)(standaloneDir, { recursive: true });
                const standalone = this.generateStandaloneApiFiles(mod);
                for (const file of standalone) {
                    (0, fs_1.writeFileSync)((0, path_1.join)(standaloneDir, file.filename), file.content, 'utf-8');
                    standaloneFiles.push(file.filename);
                }
            }
            if (standaloneFiles.length > 0) {
                modifiedFiles.push(...standaloneFiles.map((f) => `${standaloneParent}/${f}`));
                this.logger.log(`[ApiBinding] 已生成宿主工程规范产物 ${standaloneParent}/: ${standaloneFiles.join(', ')}`);
            }
            for (const slot of stubSlots) {
                const stubContent = this.generateStubFile(slot, sfcContent);
                (0, fs_1.writeFileSync)((0, path_1.join)(apiDir, `stub-${slot.slotId}.mjs`), stubContent, 'utf-8');
                modifiedFiles.push(`${apiRelativeDir}/stub-${slot.slotId}.mjs`);
            }
            const modifiedSfc = this.injectCodeIntoSFC(sfcContent, boundSlots, stubSlots, skippedSlots);
            const writeSfcPath = (0, path_1.join)(primaryStaging, entryRelativePath);
            (0, fs_1.writeFileSync)(writeSfcPath, modifiedSfc, 'utf-8');
            modifiedFiles.push(entryRelativePath);
            this.preflight.validate(primaryStaging);
            for (let index = 1; index < stagingPaths.length; index += 1) {
                this.cleanup.detachAndSchedule(stagingPaths[index]);
                (0, fs_1.cpSync)(primaryStaging, stagingPaths[index], { recursive: true, force: true });
            }
            const record = {
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
            await this.workspaceTransaction.commit([
                ...targetPaths.map((targetPath, index) => ({
                    targetPath,
                    stagingPath: stagingPaths[index],
                })),
                { targetPath: this.storePath, stagingPath: storeStagingPath },
            ], () => this.runRuntimePreflight(dto.componentId, normalizedGroupId, targetPaths[0], runtimeRequestMocks));
            this.snapshotBindingRevision(bindingId, dto.componentId, modifiedFiles, targetPaths[0]);
            this.logger.log(`[ApiBinding] 安全发布完成: ${bindingId}, 修改文件 ${modifiedFiles.length} 个`);
            return {
                success: true,
                bindingId,
                modifiedFiles,
                previewUrl: `/workspace/vue3-components/${normalizedGroupId}/${dto.componentId}/${entryRelativePath}`,
                warnings: consumptionWarnings,
            };
        }
        catch (error) {
            if (!inheritedSnapshot)
                this.cleanup.detachAndSchedule(snapshotDir);
            throw error;
        }
        finally {
            this.cleanup.detachAndSchedule(transactionRoot);
        }
    }
    snapshotBindingRevision(bindingId, componentId, modifiedFiles, committedDir) {
        try {
            const overlay = {};
            for (const rel of modifiedFiles) {
                const abs = (0, path_1.join)(committedDir, rel);
                if ((0, fs_1.existsSync)(abs))
                    overlay[rel] = (0, fs_1.readFileSync)(abs);
            }
            if (Object.keys(overlay).length === 0)
                return;
            const manifest = this.taskCodeSnapshot.createOverlayCandidate(componentId, overlay, {
                stage: 'api-binding',
                editSource: `api-binding:${bindingId}`,
            });
            if (manifest) {
                this.logger.log(`[ApiBinding] 快照 revision 已回写: ${manifest.revision}（基线 ${manifest.parentRevision}，产物面板对齐 workspace）`);
            }
        }
        catch (error) {
            this.logger.warn(`[ApiBinding] 快照 revision 回写失败（不影响绑定主流程）: ${error}`);
        }
    }
    snapshotUnbindRevision(record) {
        try {
            const sessionId = record.componentId;
            const candidate = this.taskCodeSnapshot.getCandidateManifest(sessionId);
            const baseRevision = candidate?.editSource === `api-binding:${record.bindingId}`
                ? candidate.parentRevision
                : undefined;
            if (!baseRevision) {
                this.logger.warn(`[ApiBinding] 撤回快照回写跳过：未找到 ${record.bindingId} 对应的绑定 revision 基线`);
                return;
            }
            const manifest = this.taskCodeSnapshot.createOverlayCandidate(sessionId, {}, {
                stage: 'api-unbinding',
                editSource: `api-unbinding:${record.bindingId}`,
                baseRevision,
            });
            if (manifest) {
                this.logger.log(`[ApiBinding] 撤回快照 revision 已回写: ${manifest.revision}（恢复基线 ${baseRevision}）`);
            }
        }
        catch (error) {
            this.logger.warn(`[ApiBinding] 撤回快照回写失败（不影响撤回主流程）: ${error}`);
        }
    }
    getBindings(componentId) {
        const all = this.readBindings();
        return all.filter((b) => b.componentId === componentId);
    }
    getBinding(bindingId) {
        const all = this.readBindings();
        return all.find((b) => b.bindingId === bindingId) || null;
    }
    async unbind(bindingId) {
        const all = this.readBindings();
        const record = all.find((binding) => binding.bindingId === bindingId);
        if (!record)
            throw new common_1.NotFoundException(`绑定记录不存在: ${bindingId}`);
        if (!record.snapshotDir || !(0, fs_1.existsSync)(record.snapshotDir)) {
            throw new common_1.BadRequestException('该绑定是旧版本记录，缺少精确快照，拒绝使用正则方式解绑');
        }
        const targetPaths = record.targetPaths || this.getComponentTargets(record.componentId, record.groupId, record.componentDir);
        const transactionRoot = (0, path_1.join)(backend_root_1.dataDir, '.api-binding-transactions', `unbind-${bindingId}`);
        const storeStagingPath = (0, path_1.join)(transactionRoot, 'api-bindings.json');
        (0, fs_1.mkdirSync)(transactionRoot, { recursive: true });
        try {
            const restoredStages = targetPaths.map((_, index) => {
                const source = (0, path_1.join)(record.snapshotDir, `component-${index}`);
                if (!(0, fs_1.existsSync)(source))
                    throw new common_1.BadRequestException(`绑定快照不完整: ${source}`);
                const stagingPath = (0, path_1.join)(transactionRoot, `component-${index}`);
                (0, fs_1.cpSync)(source, stagingPath, { recursive: true, force: true });
                this.preflight.validate(stagingPath);
                return stagingPath;
            });
            this.writeBindingsToPath(all.filter((binding) => binding.bindingId !== bindingId), storeStagingPath);
            await this.workspaceTransaction.commit([
                ...targetPaths.map((targetPath, index) => ({ targetPath, stagingPath: restoredStages[index] })),
                { targetPath: this.storePath, stagingPath: storeStagingPath },
            ]);
            this.snapshotUnbindRevision(record);
            this.cleanup.detachAndSchedule(record.snapshotDir);
            return { success: true, message: '已从精确快照恢复组件并移除绑定记录' };
        }
        finally {
            this.cleanup.detachAndSchedule(transactionRoot);
        }
    }
    getComponentDir(componentId, groupId) {
        const bases = [
            (0, workspace_config_1.resolveFrontendWorkspace)(),
            backend_root_1.workspaceRoot,
        ];
        if (groupId) {
            for (const base of bases) {
                const dir = (0, path_1.join)(base, 'vue3-components', groupId, componentId);
                if ((0, fs_1.existsSync)(dir))
                    return dir;
            }
        }
        for (const base of bases) {
            const vue3Base = (0, path_1.join)(base, 'vue3-components');
            if (!(0, fs_1.existsSync)(vue3Base))
                continue;
            for (const gDir of (0, fs_1.readdirSync)(vue3Base)) {
                const dir = (0, path_1.join)(vue3Base, gDir, componentId);
                if ((0, fs_1.existsSync)(dir) && (0, fs_1.statSync)(dir).isDirectory())
                    return dir;
            }
        }
        throw new common_1.NotFoundException(`组件目录未找到: vue3-components/${groupId || '*'}/${componentId}`);
    }
    normalizeGroupIdFromDir(componentDir, fallbackGroupId, componentId) {
        try {
            const parent = (0, path_1.dirname)(componentDir);
            const parentName = (0, path_1.basename)(parent);
            if (parentName && parentName !== 'vue3-components') {
                const probe = (0, path_1.join)(parent, componentId);
                if ((0, fs_1.existsSync)(probe))
                    return parentName;
            }
        }
        catch {
        }
        return fallbackGroupId;
    }
    generateApiModuleFile(moduleName, service, functions, arrayMockFns = new Set()) {
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
                }
                else {
                    body = `      .get(${requestPath})`;
                }
            }
            else if (fn.method === 'POST') {
                body = `      .setParameters(${requestParams})\n      .post(${requestPath})`;
            }
            else if (fn.method === 'PUT') {
                body = `      .setParameters(${requestParams})\n      .put(${requestPath})`;
            }
            else if (fn.method === 'DELETE') {
                body = `      .setParameters(${requestParams})\n      .delete(${requestPath})`;
            }
            else {
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
    generateMockFile(moduleName, functions) {
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
    generateStandaloneApiFiles(mod) {
        const { moduleName, service, functions } = mod;
        const date = new Date().toISOString().split('T')[0];
        const sbds = service === 'sbds-server';
        const serviceArg = sbds ? "'SBDS_SERVER'" : '';
        const createRequestExpr = sbds ? `createRequest('SBDS_SERVER')` : `createRequest()`;
        const serviceLabel = service || 'base-server';
        const pascalModule = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
        const lines = [];
        lines.push(`/*`);
        lines.push(` * @module ${moduleName}`);
        lines.push(` * @service ${serviceLabel}`);
        lines.push(` * @说明 ${moduleName} 模块接口（API 绑定生成 · 宿主工程规范版）`);
        lines.push(` * @Date: ${date}`);
        lines.push(` */`);
        lines.push(``);
        lines.push(`import { createRequest } from 'microvideo-request'`);
        lines.push(``);
        if (functions.some((fn) => (fn.params || []).some((p) => p.in === 'path'))) {
            lines.push(`const resolvePath = (path, params = {}) => path.replace(/\\{([^}]+)\\}/g, (_, name) => encodeURIComponent(params[name] ?? ''))`);
            lines.push(`const omitParameters = (params = {}, names = []) => Object.fromEntries(Object.entries(params).filter(([name]) => !names.includes(name)))`);
            lines.push(``);
        }
        lines.push(`export default {`);
        functions.forEach((fn, i) => {
            const method = String(fn.method || 'GET').toUpperCase();
            const hasQuery = (fn.params || []).some((p) => p.in === 'query');
            const hasPath = (fn.params || []).some((p) => p.in === 'path');
            const pathParamNames = (fn.params || []).filter((p) => p.in === 'path').map((p) => p.name);
            const needsParams = fn.hasBody || hasQuery || hasPath;
            lines.push(`  // ==================== ${i + 1}. ${fn.summary || fn.name} ====================`);
            lines.push(`  /**`);
            lines.push(`   * ${fn.summary || fn.name}`);
            if (needsParams) {
                lines.push(`   * @param {Object} params - 请求参数`);
                (fn.params || [])
                    .filter((p) => p.in === 'query' || p.in === 'path')
                    .forEach((p) => {
                    lines.push(`   * @param {*} params.${p.name} — ${p.description || p.name}${p.required ? '（必填）' : ''}`);
                });
                if (fn.hasBody)
                    lines.push(`   * @param {Object} params.data — 请求体`);
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
                }
                else {
                    lines.push(`      .setParameters(params)`);
                }
                if (fn.hasBody)
                    lines.push(`      .setData(params.data || params)`);
                lines.push(`      .${method.toLowerCase()}(${hasPath ? 'resolvedPath' : `'${fn.path}'`})`);
                lines.push(`  },`);
            }
            else {
                lines.push(`  ${fn.name}() {`);
                lines.push(`    return ${createRequestExpr}`);
                lines.push(`      .${method.toLowerCase()}('${fn.path}')`);
                lines.push(`  },`);
            }
            lines.push(``);
        });
        lines.push(`}`);
        const apiContent = lines.join('\n');
        const mockLines = [];
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
    generateStandaloneMockValue(fn) {
        const preview = String(fn.responsePreview || '');
        const isArray = preview.includes('[{') || preview.includes('[]') || /\[\s*\]/.test(preview);
        if (isArray) {
            return `{ "rid": "示例文本", "code": 200, "message": "示例文本", "detail": "示例文本", "data": [] }`;
        }
        return `{ "rid": "示例文本", "code": 200, "message": "示例文本", "detail": "示例文本", "data": {} }`;
    }
    generateMockFromPreview(preview, forceArray = false) {
        const isArrayLike = forceArray || preview.includes('[{') || preview.includes('[]') || /\[\s*\]/.test(preview);
        if (isArrayLike) {
            const series = Array.from({ length: 24 }, (_, i) => Math.round(10 + 15 * Math.abs(Math.sin(i / 3.5)) + (i % 5)));
            return `{ code: 200, data: ${JSON.stringify(series)} }`;
        }
        return `{ code: 200, data: { series: [12, 18, 22, 28, 35, 32, 28, 25, 22, 18, 15, 12, 15, 18, 22, 26, 30, 28, 25, 20, 18, 15, 12, 10], categories: ["0","2","4","6","8","10","12","14","16","18","20","22"] } }`;
    }
    generateEnumsFile(_moduleName) {
        return null;
    }
    generateStubFile(slot, sfcContent) {
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
    isCompositeChartSlot(slot) {
        return slot.slotType === 'chart' && slot.role === 'chart.composite';
    }
    getBindingDataName(slot) {
        const base = this.isCompositeChartSlot(slot) ? `${slot.refName || 'chart'}Data` : slot.refName || 'apiData';
        return this.toSafeIdentifier(base, 'apiData');
    }
    getAdapterName(slot) {
        return this.toSafeIdentifier(`apply${this.capitalize(slot.refName || 'chart')}Data`, 'applyChartData');
    }
    getStubExportName(slot) {
        return `mock${this.capitalize(this.getBindingDataName(slot))}`;
    }
    toSafeIdentifier(value, fallback) {
        const cleaned = value.replace(/[^a-zA-Z0-9_$]/g, '');
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleaned))
            return cleaned;
        return fallback;
    }
    generateCompositeChartMock(slot) {
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
    extractStaticData(sfcContent, refName) {
        const refPattern = new RegExp(`const\\s+${refName}\\s*=\\s*ref\\(\\s*([\\s\\S]*?)\\s*\\)`, 'm');
        const match = sfcContent.match(refPattern);
        if (match && match[1] && match[1] !== '') {
            return match[1];
        }
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
    scanExistingIdentifiers(scriptContent) {
        const vars = new Set();
        const imports = new Set();
        const refs = new Set();
        const writable = new Set();
        const fixableConsts = new Set();
        const vueBuiltins = new Set([
            'ref', 'reactive', 'readonly', 'computed', 'watch', 'watchEffect', 'watchPostEffect', 'watchSyncEffect',
            'shallowRef', 'triggerRef', 'customRef', 'markRaw', 'toRaw', 'toRef', 'toRefs', 'unref', 'isRef', 'isReactive', 'isReadonly',
            'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount', 'onUpdated', 'onBeforeUpdate',
            'onActivated', 'onDeactivated', 'onErrorCaptured', 'onRenderTracked', 'onRenderTriggered',
            'provide', 'inject', 'defineProps', 'defineEmits', 'defineExpose', 'defineOptions', 'defineSlots',
            'withDefaults',
            'nextTick', 'useSlots', 'useAttrs',
        ]);
        const sourceFile = typescript_1.default.createSourceFile('component-script.ts', scriptContent, typescript_1.default.ScriptTarget.ES2022, true, typescript_1.default.ScriptKind.TS);
        const addBindingNames = (name, target) => {
            if (typescript_1.default.isIdentifier(name)) {
                target.add(name.text);
                return;
            }
            for (const element of name.elements) {
                if (!typescript_1.default.isOmittedExpression(element))
                    addBindingNames(element.name, target);
            }
        };
        for (const statement of sourceFile.statements) {
            if (typescript_1.default.isImportDeclaration(statement) && statement.importClause) {
                if (statement.importClause.name)
                    imports.add(statement.importClause.name.text);
                const namedBindings = statement.importClause.namedBindings;
                if (namedBindings && typescript_1.default.isNamespaceImport(namedBindings))
                    imports.add(namedBindings.name.text);
                if (namedBindings && typescript_1.default.isNamedImports(namedBindings)) {
                    namedBindings.elements.forEach((element) => imports.add(element.name.text));
                }
                continue;
            }
            if (typescript_1.default.isVariableStatement(statement)) {
                const isMutableDeclaration = (statement.declarationList.flags & typescript_1.default.NodeFlags.Const) === 0;
                for (const declaration of statement.declarationList.declarations) {
                    addBindingNames(declaration.name, vars);
                    if (isMutableDeclaration)
                        addBindingNames(declaration.name, writable);
                    if (typescript_1.default.isIdentifier(declaration.name) && declaration.initializer) {
                        if (typescript_1.default.isCallExpression(declaration.initializer)
                            && typescript_1.default.isIdentifier(declaration.initializer.expression)
                            && declaration.initializer.expression.text === 'ref') {
                            refs.add(declaration.name.text);
                            writable.add(declaration.name.text);
                        }
                        if ((statement.declarationList.flags & typescript_1.default.NodeFlags.Const) !== 0
                            && (typescript_1.default.isArrayLiteralExpression(declaration.initializer)
                                || typescript_1.default.isObjectLiteralExpression(declaration.initializer))) {
                            fixableConsts.add(declaration.name.text);
                        }
                    }
                }
                continue;
            }
            if ((typescript_1.default.isFunctionDeclaration(statement) || typescript_1.default.isClassDeclaration(statement))
                && statement.name) {
                vars.add(statement.name.text);
            }
        }
        return { vars, imports, refs, writable, fixableConsts, vueBuiltins };
    }
    classifyInjectableSlots(slots, existingVars, existingImports, writable, fixableConsts, vueBuiltins) {
        const injectable = [];
        const skipped = [];
        const fixable = [];
        for (const slot of slots) {
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
            if (vueBuiltins.has(targetName)) {
                skipped.push(`${slot.slotId}: ${targetName} 与 Vue API 冲突`);
                continue;
            }
            if (existingImports.has(targetName) && !existingVars.has(targetName)) {
                skipped.push(`${slot.slotId}: ${targetName} 是 import 绑定，不能作为接口赋值目标。建议：换一个不被 import 占用的变量名`);
                continue;
            }
            if (existingVars.has(targetName) && !writable.has(targetName)) {
                if (fixableConsts.has(targetName)) {
                    fixable.push(slot);
                }
                else {
                    skipped.push(`${slot.slotId}: ${targetName} 是只读或解构绑定（如 computed() / readonly() / 解构），API 无法改写。建议：进入 Playground 把 ${targetName} 改为 ref() 或 reactive() 后再绑定`);
                }
                continue;
            }
            injectable.push(slot);
        }
        return { injectable, skipped, fixable };
    }
    injectCodeIntoSFC(sfc, boundSlots, stubSlots, skippedSlots) {
        let content = this.removeInjectedCode(sfc);
        const scriptMatch = content.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/);
        const scriptBody = scriptMatch ? scriptMatch[1] : '';
        const { vars: existingVars, imports: existingImports, refs: existingRefs, writable, fixableConsts, vueBuiltins, } = this.scanExistingIdentifiers(scriptBody);
        const { injectable: validBoundSlots, skipped: boundSkipped, fixable: boundFixable } = this.classifyInjectableSlots(boundSlots, existingVars, existingImports, writable, fixableConsts, vueBuiltins);
        const { injectable: validStubSlots, skipped: stubSkipped, fixable: stubFixable } = this.classifyInjectableSlots(stubSlots, existingVars, existingImports, writable, fixableConsts, vueBuiltins);
        const allFixable = [...boundFixable, ...stubFixable];
        if (allFixable.length > 0) {
            const fixResult = this.autoFixBareConstInSFC(content, allFixable, scriptBody);
            content = fixResult.newContent;
            const newScriptMatch = content.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/);
            const newScriptBody = newScriptMatch ? newScriptMatch[1] : '';
            const { writable: newWritable } = this.scanExistingIdentifiers(newScriptBody);
            const fixedNames = new Set(fixResult.fixedNames);
            const fixableSlots = allFixable.filter(s => {
                const dataName = this.getBindingDataName(s);
                return dataName && fixedNames.has(dataName) && newWritable.has(dataName);
            });
            const fixableNames = new Set(fixableSlots.map(s => s.slotId));
            if (fixableSlots.length > 0) {
                this.logger.log(`[L3] 自动修复 ${fixableSlots.length} 个裸 const → ref: ${fixableNames.size > 0 ? [...fixableNames].join(', ') : 'slots'}`);
            }
            for (const slot of fixableSlots) {
                if (boundFixable.includes(slot) && !validBoundSlots.find(s => s.slotId === slot.slotId)) {
                    validBoundSlots.push(slot);
                }
                else if (stubFixable.includes(slot) && !validStubSlots.find(s => s.slotId === slot.slotId)) {
                    validStubSlots.push(slot);
                }
            }
        }
        const allSkipped = [...boundSkipped, ...stubSkipped];
        if (allSkipped.length > 0) {
            this.logger.warn(`[ApiBinding] 以下 slots 存在不可修复的符号冲突: ${allSkipped.join('; ')}`);
            throw new common_1.BadRequestException({
                code: 'API_BINDING_CONFLICT',
                message: '部分数据槽因代码冲突无法自动绑定',
                details: allSkipped,
            });
        }
        const importLines = [];
        const importedModules = new Set();
        for (const slot of validBoundSlots) {
            if (slot.moduleName && !importedModules.has(slot.moduleName)) {
                importedModules.add(slot.moduleName);
                const importName = `${slot.moduleName}Api`;
                importLines.push(`import ${importName} from './api/${slot.moduleName}.mjs'  // ${slot.slotId}: ${slot.label || slot.refName}`);
            }
        }
        const stubExportNames = new Set();
        for (const slot of validStubSlots) {
            const exportName = this.getStubExportName(slot);
            if (!stubExportNames.has(exportName)) {
                if (existingVars.has(exportName) || existingImports.has(exportName)) {
                    throw new common_1.BadRequestException(`stub 导入名已存在: ${exportName}`);
                }
                stubExportNames.add(exportName);
                importLines.push(`import { ${exportName} } from './api/stub-${slot.slotId}.mjs'  // stub ${slot.slotId}`);
            }
        }
        const refLines = [];
        const allSlots = [...validBoundSlots, ...validStubSlots];
        const bindingTargets = new Map();
        for (const slot of allSlots) {
            const dataName = this.getBindingDataName(slot);
            if (!dataName)
                continue;
            bindingTargets.set(dataName, slot);
        }
        for (const [dataName, slot] of bindingTargets) {
            if (vueBuiltins.has(dataName)) {
                this.logger.warn(`[ApiBinding] dataName "${dataName}" 与 Vue 内置名冲突，跳过 ref 注入`);
                continue;
            }
            if (existingVars.has(dataName))
                continue;
            if (refLines.some(line => line.includes(`const ${dataName} = ref`)))
                continue;
            const initValue = slot.slotType === 'table' || slot.slotType === 'list' ? '[]' : '{}';
            refLines.push(`const ${dataName} = ref(${initValue})  // ${slot.slotId}: ${slot.label || ''}`);
        }
        const adapterLines = this.generateAdapterLines(allSlots, existingVars, scriptBody);
        const onMountedLines = [];
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
                onMountedLines.push(`  // ${slot.slotId}: ${slot.label || slot.refName} → ${slot.moduleName}.${slot.functionName}`);
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
            if (!slot.refName)
                continue;
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
        const hasImports = importLines.length > 0;
        const hasRefs = refLines.length > 0;
        const hasMounted = onMountedLines.length > 0;
        const needsRef = refLines.length > 0 && !existingImports.has('ref');
        const needsOnMounted = hasMounted && !existingImports.has('onMounted');
        let vueImportLine = '';
        if (needsRef || needsOnMounted) {
            const vueImports = [];
            if (needsRef)
                vueImports.push('ref');
            if (needsOnMounted)
                vueImports.push('onMounted');
            vueImportLine = `import { ${vueImports.join(', ')} } from 'vue'`;
        }
        const allImportLines = [];
        if (vueImportLine)
            allImportLines.push(vueImportLine);
        if (hasImports)
            allImportLines.push(...importLines);
        const importInjectionText = allImportLines.length > 0
            ? '\n// === API 对接导入 (自动生成) ===\n' + allImportLines.join('\n') + '\n// === END API 导入 ===\n'
            : '';
        const nonImportParts = [];
        nonImportParts.push('// === API 对接注入 (自动生成，请勿手动修改) ===');
        if (hasRefs)
            nonImportParts.push(refLines.join('\n'));
        if (adapterLines.length > 0)
            nonImportParts.push(adapterLines.join('\n'));
        if (hasMounted) {
            nonImportParts.push('// === API 对接调用 ===');
            nonImportParts.push(`onMounted(async () => {\n${onMountedLines.join('\n')}\n})`);
        }
        nonImportParts.push('// === END API 对接注入 ===');
        const nonImportInjectionText = '\n' + nonImportParts.join('\n') + '\n';
        const scriptStartMatch = content.match(/<script\s+setup[^>]*>/);
        if (scriptStartMatch && scriptMatch && scriptMatch.index !== undefined) {
            const tagEnd = scriptMatch.index + scriptStartMatch[0].length;
            const scriptCloseIdx = content.indexOf('</script>', tagEnd);
            if (scriptCloseIdx !== -1) {
                const scriptBodyContent = content.substring(tagEnd, scriptCloseIdx);
                const lastImportEnd = this.findLastImportEnd(scriptBodyContent);
                const insertImportAt = tagEnd + lastImportEnd;
                content =
                    content.substring(0, insertImportAt) +
                        importInjectionText +
                        content.substring(insertImportAt, scriptCloseIdx) +
                        nonImportInjectionText +
                        content.substring(scriptCloseIdx);
            }
        }
        else {
            const allText = importInjectionText + nonImportInjectionText;
            content += `\n<script setup>${allText}</script>\n`;
        }
        return content;
    }
    generateAdapterLines(slots, existingVars, scriptBody) {
        const lines = [];
        const seen = new Set();
        for (const slot of slots) {
            if (!this.isCompositeChartSlot(slot))
                continue;
            const adapterName = this.getAdapterName(slot);
            if (seen.has(adapterName) || existingVars.has(adapterName))
                continue;
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
    findChartInstanceName(slot, scriptBody) {
        if (!slot.refName)
            return null;
        const escapedRefName = slot.refName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const initPattern = new RegExp(`([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*echarts\\.init\\(\\s*${escapedRefName}\\.value\\s*\\)`);
        const initMatch = scriptBody.match(initPattern);
        if (initMatch?.[1])
            return initMatch[1];
        if (scriptBody.includes('let chartInstance') || scriptBody.includes('const chartInstance'))
            return 'chartInstance';
        return null;
    }
    removeInjectedCode(sfc) {
        let content = sfc.replace(/(<script\s+setup[^>]*>\s*\n)(import\s*\{\s*(ref|onMounted)(\s*,\s*(ref|onMounted))*\s*\}\s*from\s*'vue'\s*\n)(\/\/ === API 对接注入[\s\S]*?\/\/ === END API 对接注入 ===\s*)/g, '$1');
        content = content.replace(/\/\/ === API 对接导入 \(自动生成\)[\s\S]*?\/\/ === END API 导入 ===\s*/g, '');
        content = content.replace(/\/\/ === API 对接注入[\s\S]*?\/\/ === END API 对接注入 ===\s*/g, '');
        return content;
    }
    findLastImportEnd(scriptBody) {
        const sourceFile = typescript_1.default.createSourceFile('find-imports.ts', scriptBody, typescript_1.default.ScriptTarget.ES2022, true, typescript_1.default.ScriptKind.TS);
        let lastImportEnd = 0;
        for (const statement of sourceFile.statements) {
            if (typescript_1.default.isImportDeclaration(statement)) {
                lastImportEnd = statement.end;
            }
        }
        return lastImportEnd;
    }
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    sameTargetSet(left, right) {
        return left.length === right.length && left.every((path) => right.includes(path));
    }
    getComponentTargets(componentId, groupId, primaryPath) {
        const candidates = [
            primaryPath,
            (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, componentId),
            (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, componentId),
        ];
        return [...new Set(candidates)].filter((candidate) => (0, fs_1.existsSync)(candidate));
    }
    checkSlotConsumption(slots, sfcContent) {
        const warnings = [];
        const templateMatch = sfcContent.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
        const template = templateMatch ? templateMatch[1] : '';
        const scriptMatch = sfcContent.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/i);
        const script = scriptMatch ? scriptMatch[1] : '';
        for (const slot of slots) {
            const dataName = this.getBindingDataName(slot);
            if (!dataName)
                continue;
            const escaped = dataName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const word = new RegExp(`\\b${escaped}\\b`);
            const usedInTemplate = word.test(template);
            const scriptNoDecl = script.replace(new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b`, 'g'), '');
            const usedInScript = word.test(scriptNoDecl);
            if (!usedInTemplate && !usedInScript) {
                const slotKind = slot.slotType === 'chart'
                    ? '图表仍可能渲染为静态写死的数据'
                    : '界面内容不会随数据更新';
                warnings.push(`[${slot.slotId}] 数据变量「${dataName}」在组件中未被消费，绑定后 ${slotKind}。建议确认组件已用 ${dataName} 驱动 ${slot.slotType} 渲染，或该槽位本就不需要动态数据。`);
            }
        }
        return warnings;
    }
    validateCatalogBindings(catalog, slots) {
        const parameterIssues = [];
        const requestMocks = new Map();
        for (const slot of slots) {
            const mod = catalog.modules.find((item) => item.moduleName === slot.moduleName);
            if (!mod)
                throw new common_1.BadRequestException(`API 模块不存在: ${slot.moduleName}`);
            const fn = mod.functions.find((item) => item.name === slot.functionName);
            if (!fn) {
                throw new common_1.BadRequestException(`API 函数不存在: ${slot.moduleName}.${slot.functionName}`);
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
                    throw new common_1.BadRequestException(`API 参数不存在: ${slot.moduleName}.${slot.functionName}.${name}`);
                }
                if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
                    throw new common_1.BadRequestException(`API 参数值仅支持字符串、数字、布尔值或 null: ${name}`);
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
            throw new common_1.BadRequestException({
                code: 'API_BINDING_REQUIRED_PARAMETERS_MISSING',
                message: `API 绑定缺少 ${parameterIssues.length} 个必填参数，请补充后重试`,
                parameterIssues,
            });
        }
        return [...requestMocks.values()];
    }
    buildApiFunctionCall(slot) {
        const values = slot.parameterValues || {};
        const argument = Object.keys(values).length > 0
            ? JSON.stringify(values)
                .replace(/</g, '\\u003c')
                .replace(/\u2028/g, '\\u2028')
                .replace(/\u2029/g, '\\u2029')
            : '';
        return `${slot.moduleName}Api.${slot.functionName}(${argument})`;
    }
    generateMockData(preview) {
        if (preview.includes('[{'))
            return [{}];
        if (preview.includes('data'))
            return { data: [{}] };
        return [{}];
    }
    resolveComponentEntry(componentDir) {
        const candidates = [(0, path_1.join)('package', 'index.vue'), 'index.vue'];
        const entry = candidates.find((relativePath) => (0, fs_1.existsSync)((0, path_1.join)(componentDir, relativePath)));
        if (!entry) {
            throw new common_1.BadRequestException(`组件缺少绑定入口: ${(0, path_1.join)(componentDir, 'package', 'index.vue')} 或 ${(0, path_1.join)(componentDir, 'index.vue')}`);
        }
        return entry;
    }
    removePreviousBindingModules(apiDir, modifiedFiles, apiRelativeDir) {
        const prefix = `${apiRelativeDir}/`;
        for (const relativePath of modifiedFiles) {
            if (!relativePath.startsWith(prefix))
                continue;
            const name = relativePath.substring(prefix.length);
            if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:js|mjs)$/.test(name)) {
                for (const candidate of this.getApiModuleCleanupNames(name)) {
                    (0, fs_1.rmSync)((0, path_1.join)(apiDir, candidate), { force: true });
                }
            }
        }
    }
    getApiModuleCleanupNames(name) {
        if (name.endsWith('.mjs'))
            return [name, name.replace(/\.mjs$/, '.js')];
        if (name.endsWith('.js'))
            return [name, name.replace(/\.js$/, '.mjs')];
        return [name];
    }
    cleanBindingFromSnapshot(snapshotPath, record) {
        const entryRelativePath = this.resolveComponentEntry(snapshotPath);
        const entryDir = (0, path_1.dirname)(entryRelativePath);
        const apiRelativeDir = entryDir === '.' ? 'api' : (0, path_1.join)(entryDir, 'api');
        const apiDir = (0, path_1.join)(snapshotPath, apiRelativeDir);
        if ((0, fs_1.existsSync)(apiDir)) {
            this.removePreviousBindingModules(apiDir, record.modifiedFiles, apiRelativeDir);
        }
        const entryPath = (0, path_1.join)(snapshotPath, entryRelativePath);
        const restored = this.removeInjectedCode((0, fs_1.readFileSync)(entryPath, 'utf-8'));
        (0, fs_1.writeFileSync)(entryPath, restored, 'utf-8');
    }
    async runRuntimePreflight(componentId, groupId, outputPath, requestMocks) {
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
            this.logger.warn(`[ApiBinding] 真实运行时检查阻断: componentId=${componentId}, issues=${JSON.stringify(issues.map((issue) => ({
                id: issue?.id,
                category: issue?.category,
                message: issue?.message,
                evidence: issue?.evidence,
            })))}`);
            throw new common_1.BadRequestException({
                code: 'API_BINDING_RUNTIME_PREFLIGHT_FAILED',
                message: 'API 绑定真实运行时检查失败，已回滚发布',
                runtimeGate: result.runtimeGate,
            });
        }
        if (!result.renderedImage) {
            throw new common_1.BadRequestException({
                code: 'API_BINDING_RUNTIME_PREFLIGHT_NO_SCREENSHOT',
                message: 'API 绑定后无法生成渲染截图，已回滚发布',
            });
        }
    }
    readBindings() {
        if (!(0, fs_1.existsSync)(this.storePath))
            return [];
        try {
            const parsed = JSON.parse((0, fs_1.readFileSync)(this.storePath, 'utf-8'));
            return Array.isArray(parsed) ? parsed : [];
        }
        catch (error) {
            throw new common_1.BadRequestException(`绑定记录损坏，拒绝覆盖: ${error.message}`);
        }
    }
    writeBindingsToPath(records, targetPath) {
        (0, fs_1.mkdirSync)((0, path_1.dirname)(targetPath), { recursive: true });
        const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
        (0, fs_1.writeFileSync)(tempPath, `${JSON.stringify(records, null, 2)}\n`, 'utf-8');
        (0, fs_1.renameSync)(tempPath, targetPath);
    }
    upsertBinding(records, record) {
        return [
            ...records.filter((binding) => binding.componentId !== record.componentId),
            record,
        ];
    }
    autoFixBareConstInSFC(sfc, slots, scriptBody) {
        const fixedNames = [];
        let content = sfc;
        for (const slot of slots) {
            const dataName = this.getBindingDataName(slot);
            if (!dataName)
                continue;
            const patterns = [
                new RegExp(`(const\\s+${dataName}\\s*=\\s*)(\\[[\\s\\S]*?\\])`, 'm'),
                new RegExp(`(const\\s+${dataName}\\s*=\\s*)(\\{[\\s\\S]*?\\})`, 'm'),
            ];
            for (const pattern of patterns) {
                const match = content.match(pattern);
                if (match) {
                    const prefix = match[1];
                    const literal = match[2];
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
};
exports.ApiBindingService = ApiBindingService;
exports.ApiBindingService = ApiBindingService = ApiBindingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [apifox_service_1.ApifoxService,
        api_binding_preflight_service_1.ApiBindingPreflightService,
        workspace_transaction_service_1.WorkspaceTransactionService,
        incremental_file_cleanup_service_1.IncrementalFileCleanupService,
        task_code_snapshot_service_1.TaskCodeSnapshotService])
], ApiBindingService);
//# sourceMappingURL=api-binding.service.js.map