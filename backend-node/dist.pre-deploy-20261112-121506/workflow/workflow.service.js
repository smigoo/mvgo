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
var WorkflowService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const fs_2 = require("fs");
const crypto_1 = require("crypto");
const backend_root_1 = require("../config/backend-root");
const workflow_constants_1 = require("./workflow.constants");
const graph_topology_1 = require("./graph-topology");
const progress_service_1 = require("../progress/progress.service");
const tasks_service_1 = require("../tasks/tasks.service");
const phase2_service_1 = require("../phase2/phase2.service");
const config_service_1 = require("../config/config.service");
let WorkflowService = WorkflowService_1 = class WorkflowService {
    progressService;
    tasksService;
    phase2Service;
    aiConfigService;
    logger = new common_1.Logger(WorkflowService_1.name);
    nodeSnapshotStore = new Map();
    workflowsDir;
    constructor(progressService, tasksService, phase2Service, aiConfigService) {
        this.progressService = progressService;
        this.tasksService = tasksService;
        this.phase2Service = phase2Service;
        this.aiConfigService = aiConfigService;
        this.workflowsDir = (0, path_1.join)(backend_root_1.configDir, 'workflows');
        if (!(0, fs_2.existsSync)(this.workflowsDir)) {
            (0, fs_2.mkdirSync)(this.workflowsDir, { recursive: true });
        }
    }
    getHandlers() {
        return {
            skills: workflow_constants_1.SKILL_REGISTRY,
            handlers: workflow_constants_1.HANDLER_REGISTRY,
        };
    }
    getNodeTypes() {
        return workflow_constants_1.NODE_TYPES;
    }
    getGraphTopology(type) {
        if (type === 'phase2' || type === 'vue3') {
            try {
                const { getPhase2Topology } = require('../ai-engine/graphs/mc-component-graph-phase2.js');
                const topology = getPhase2Topology();
                if (type === 'vue3') {
                    topology.name = 'original-vue3';
                    topology.label = 'Vue3 组件生成管线';
                    topology.description = 'Vue3 SFC 组件生成管线，拓扑与 Phase2 一致';
                }
                return { success: true, data: topology };
            }
            catch (error) {
                this.logger.error(`动态获取拓扑失败: ${error.message}`);
            }
        }
        const topology = graph_topology_1.TOPOLOGY_MAP[type];
        if (!topology) {
            return {
                success: false,
                error: `未知的管线类型: ${type}，可选值: phase2, vue3`,
            };
        }
        return { success: true, data: topology };
    }
    async list() {
        try {
            const files = await fs_1.promises.readdir(this.workflowsDir);
            const jsonFiles = files.filter((f) => f.endsWith('.json'));
            const workflows = [];
            for (const file of jsonFiles) {
                try {
                    const content = await fs_1.promises.readFile((0, path_1.join)(this.workflowsDir, file), 'utf-8');
                    const workflow = JSON.parse(content);
                    workflows.push({
                        name: workflow.name,
                        label: workflow.label,
                        description: workflow.description,
                        nodeCount: workflow.nodes?.length || 0,
                        edgeCount: workflow.edges?.length || 0,
                        entryNode: workflow.entryNode,
                        isOriginal: false,
                    });
                }
                catch (err) {
                    this.logger.error(`读取workflow文件失败: ${file}`, err.message);
                }
            }
            for (const topology of (0, graph_topology_1.getAllOriginalTopologies)()) {
                workflows.push({
                    name: topology.name,
                    label: topology.label,
                    description: topology.description,
                    nodeCount: topology.nodes.length,
                    edgeCount: topology.edges.length,
                    entryNode: topology.entryNode,
                    isOriginal: true,
                });
            }
            return { success: true, data: workflows };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async get(name) {
        const originalTopology = (0, graph_topology_1.getAllOriginalTopologies)().find((t) => t.name === name);
        if (originalTopology) {
            return { success: true, data: originalTopology };
        }
        try {
            const filePath = (0, path_1.join)(this.workflowsDir, `${name}.json`);
            const content = await fs_1.promises.readFile(filePath, 'utf-8');
            const workflow = JSON.parse(content);
            return { success: true, data: workflow };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async save(workflow) {
        if ((0, graph_topology_1.isProtectedWorkflow)(workflow.name)) {
            return {
                success: false,
                error: `「${workflow.label || workflow.name}」是系统生产管线，不可覆盖。请使用"另存为"功能保存为新名称`,
            };
        }
        const { validateWorkflowTopology } = await import('../ai-engine/graphs/workflow-topology-validator.js');
        const topologyCheck = validateWorkflowTopology(workflow);
        if (!topologyCheck.ok) {
            return {
                success: false,
                error: `工作流拓扑不合法: ${topologyCheck.errors.join('; ')}`,
            };
        }
        try {
            const filePath = (0, path_1.join)(this.workflowsDir, `${workflow.name}.json`);
            await fs_1.promises.writeFile(filePath, JSON.stringify(workflow, null, 2), 'utf-8');
            return { success: true, message: '保存成功' };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async delete(name) {
        if ((0, graph_topology_1.isProtectedWorkflow)(name)) {
            return {
                success: false,
                error: '系统生产管线不可删除',
            };
        }
        try {
            const filePath = (0, path_1.join)(this.workflowsDir, `${name}.json`);
            await fs_1.promises.unlink(filePath);
            return { success: true, message: '删除成功' };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async run(name, params, userId) {
        const { componentName, fileKey, nodeId, config = {}, inputs = {} } = params;
        let resolvedFileKey = fileKey;
        let resolvedNodeId = nodeId;
        if ((!resolvedFileKey || !resolvedNodeId) && params.figmaUrl) {
            try {
                const { UrlParserAgent } = await import('../ai-engine/roles/url-parser-agent.js');
                const parsed = new UrlParserAgent({ skipLLM: true }).parseFigmaUrl(params.figmaUrl);
                if (parsed?.ok) {
                    resolvedFileKey = resolvedFileKey || parsed.fileKey;
                    resolvedNodeId = resolvedNodeId || parsed.nodeId;
                    this.logger.log(`[${name}] figmaUrl 自动解析: fileKey=${parsed.fileKey} nodeId=${parsed.nodeId}`);
                }
            }
            catch (e) {
                this.logger.warn(`figmaUrl 自动解析失败（降级为手动参数）: ${e.message}`);
            }
        }
        const hasCustomInputs = Object.keys(inputs || {}).length > 0;
        if (!hasCustomInputs && (!resolvedFileKey || !resolvedNodeId)) {
            return { success: false, error: '参数不完整: 请提供 fileKey + nodeId，或 Figma URL，或自定义 inputs' };
        }
        const workflowResult = await this.get(name);
        if (!workflowResult.success) {
            return { success: false, error: `工作流不存在: ${name}` };
        }
        const workflow = workflowResult.data;
        const wfTarget = name === 'original-vue3' ? 'vue3' : 'microcode';
        const sessionId = `wf-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        const finalComponentName = componentName || sessionId;
        if ((0, graph_topology_1.isProtectedWorkflow)(name)) {
            this.logger.log(`[硬伤①] 受保护管线 ${name} 委托生产入口 phase2Service.startGeneration`);
            const delegateDto = {
                resolvedFileKey,
                resolvedNodeId,
                groupId: 'workflow-delegate',
                componentName: finalComponentName,
                target: wfTarget,
                config: config || {},
            };
            this.phase2Service
                .startGeneration(sessionId, delegateDto, 'workflow-delegate', userId)
                .catch((error) => {
                this.logger.error(`受保护管线委托执行失败: ${error.message}`, error.stack);
                this.progressService.sendError(sessionId, {
                    message: error.message,
                    stack: error.stack,
                });
            });
            return {
                success: true,
                sessionId,
                message: `管线 "${name}" 已启动（委托生产引擎）`,
            };
        }
        {
            const phase2Module = await import('../ai-engine/graphs/mc-component-graph-phase2.js');
            const registry = phase2Module.getPhase2NodeRegistry();
            const variantNodeIds = new Set((workflow.nodes || []).map((n) => n.id));
            const topoIds = new Set(Object.values(registry.realToTopo));
            const overlap = [...variantNodeIds].filter((id) => topoIds.has(id)).length;
            const isPhase2Like = workflow.engine === 'phase2' ||
                (overlap >= Math.max(3, Math.ceil(topoIds.size * 0.8)) &&
                    ['init', 'figma-connector', 'microcode-engineer', 'complete'].every((id) => variantNodeIds.has(id)));
            if (isPhase2Like) {
                try {
                    const keptTopoIds = new Set((workflow.nodes || []).map((n) => n.id));
                    const skipNodes = registry.allRealNodes.filter((real) => {
                        const topoId = registry.realToTopo[real] || real;
                        return !keptTopoIds.has(topoId);
                    });
                    this.logger.log(`[phase2 变体] ${name} 委托生产引擎，跳过节点: ${JSON.stringify(skipNodes)}`);
                    const delegateDto = {
                        resolvedFileKey,
                        resolvedNodeId,
                        groupId: 'workflow-delegate',
                        componentName: finalComponentName,
                        target: wfTarget,
                        config: {
                            ...(config || {}),
                            ...(skipNodes.length > 0 ? { skipNodes } : {}),
                        },
                    };
                    this.phase2Service
                        .startGeneration(sessionId, delegateDto, 'workflow-delegate', userId)
                        .catch((error) => {
                        this.logger.error(`phase2 变体委托执行失败: ${error.message}`, error.stack);
                        this.progressService.sendError(sessionId, {
                            message: error.message,
                            stack: error.stack,
                        });
                    });
                    return {
                        success: true,
                        sessionId,
                        message: `管线 "${name}" 已启动（phase2 变体，跳过 ${skipNodes.length} 个节点）`,
                    };
                }
                catch (error) {
                    this.logger.error(`phase2 变体启动失败: ${error.message}`, error.stack);
                    this.progressService.sendError(sessionId, {
                        message: error.message,
                        stack: error.stack,
                    });
                    return {
                        success: false,
                        error: `phase2 变体启动失败: ${error.message}`,
                    };
                }
            }
        }
        const outputPath = (0, path_1.join)(backend_root_1.tempComponentsDir, 'workflow-runs', sessionId);
        this.tasksService.createTask(sessionId, {
            componentName: finalComponentName,
            nodeId: resolvedNodeId,
            fileKey: resolvedFileKey,
            target: wfTarget,
            outputPath,
            checkpointStatus: 'none',
            taskType: 'workflow',
            userId,
            generationTier: 'max',
            sourceType: 'figma',
        });
        const userMerged = userId
            ? (await this.aiConfigService.getMergedAiConfig(userId))
            : {};
        const mergedConfig = { ...userMerged, ...config };
        const aiDefaultsModule = await import('../ai-engine/utils/ai-defaults.js');
        const { resolveVisionConfig, resolveTextConfig } = aiDefaultsModule;
        mergedConfig.visionAIConfig = resolveVisionConfig(mergedConfig);
        mergedConfig.textAIConfig = resolveTextConfig(mergedConfig);
        mergedConfig.aiConfig = {
            apiKey: mergedConfig.textAIConfig.apiKey,
            baseURL: mergedConfig.textAIConfig.baseURL,
            model: mergedConfig.textAIConfig.model,
        };
        this.executeWorkflow(sessionId, workflow, {
            componentName: finalComponentName,
            fileKey: resolvedFileKey,
            nodeId: resolvedNodeId,
            inputs,
            outputPath,
            target: wfTarget,
            config: mergedConfig,
        }).catch((error) => {
            this.logger.error(`工作流执行失败: ${error.message}`, error.stack);
            this.progressService.sendError(sessionId, {
                message: error.message,
                stack: error.stack,
            });
        });
        return {
            success: true,
            sessionId,
            message: `工作流 "${name}" 已启动`,
        };
    }
    async executeWorkflow(sessionId, workflow, params) {
        const { componentName, fileKey, nodeId, inputs = {}, outputPath, target, config } = params;
        const { createLogger } = await import('../ai-engine/logger/index.js');
        const { Logger: CustomLogger } = await import('../ai-engine/logger/logger.js');
        CustomLogger.setSessionContext(sessionId, this.progressService);
        await fs_1.promises.mkdir(outputPath, { recursive: true });
        const onProgress = (progress) => {
            this.progressService.sendProgress(sessionId, progress);
        };
        const aiConfig = config.aiConfig || {};
        const visionAIConfig = config.visionAIConfig || aiConfig;
        const textAIConfig = config.textAIConfig || aiConfig;
        const figmaToken = config.figmaToken || process.env.FIGMA_ACCESS_TOKEN;
        const { runDynamicWorkflow } = await import('../ai-engine/graphs/dynamic-workflow-graph.js');
        this.logger.log(`[${sessionId}] 开始执行工作流: ${workflow.name}`);
        const initialState = {
            ...(inputs || {}),
            componentName,
            fileKey,
            nodeId,
            outputPath,
            target,
            figmaToken,
            aiConfig,
            visionAIConfig,
            textAIConfig,
            onProgress,
            sessionId,
        };
        const nodeSnapshots = [];
        this.nodeSnapshotStore.set(sessionId, nodeSnapshots);
        try {
            const result = await CustomLogger.runInSessionContext(sessionId, this.progressService, () => runDynamicWorkflow(workflow, initialState, {
                onNodeSnapshot: (snap) => {
                    if (snap)
                        nodeSnapshots.push({ ...snap, ts: Date.now() });
                },
            }));
            const { evaluateDynamicTerminal } = await import('./workflow-terminal-protocol.js');
            const terminal = evaluateDynamicTerminal(result);
            this.logger.log(`[${sessionId}] 工作流执行结束`, {
                outcome: terminal.outcome,
                reason: terminal.reason,
                blockCount: terminal.quality.blockCount,
            });
            if (terminal.outcome === 'failed') {
                await this.progressService.sendError(sessionId, {
                    message: `工作流质量门未通过: ${terminal.reason}`,
                    checkResult: terminal.quality.checkResult,
                    blockCount: terminal.quality.blockCount,
                });
                return;
            }
            this.progressService.sendComplete(sessionId, {
                success: true,
                message: '工作流执行完成',
                outputPath,
                checkResult: terminal.quality.checkResult,
                finalQualityScore: terminal.quality.qualityScore ?? undefined,
                blockCount: terminal.quality.blockCount,
                result,
            });
        }
        catch (error) {
            this.logger.error(`[${sessionId}] 工作流执行失败`, error.stack);
            this.progressService.sendError(sessionId, {
                message: error.message,
                stack: error.stack,
            });
        }
    }
    getNodeSnapshots(sessionId) {
        return this.nodeSnapshotStore.get(sessionId) || [];
    }
};
exports.WorkflowService = WorkflowService;
exports.WorkflowService = WorkflowService = WorkflowService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [progress_service_1.ProgressService,
        tasks_service_1.TasksService,
        phase2_service_1.Phase2Service,
        config_service_1.AiConfigService])
], WorkflowService);
//# sourceMappingURL=workflow.service.js.map