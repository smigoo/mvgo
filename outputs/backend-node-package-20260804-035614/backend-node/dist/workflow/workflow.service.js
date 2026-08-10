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
const workflow_constants_1 = require("./workflow.constants");
const graph_topology_1 = require("./graph-topology");
const progress_service_1 = require("../progress/progress.service");
const tasks_service_1 = require("../tasks/tasks.service");
let WorkflowService = WorkflowService_1 = class WorkflowService {
    progressService;
    tasksService;
    logger = new common_1.Logger(WorkflowService_1.name);
    workflowsDir;
    constructor(progressService, tasksService) {
        this.progressService = progressService;
        this.tasksService = tasksService;
        this.workflowsDir = (0, path_1.join)(process.cwd(), 'config/workflows');
        if (!(0, fs_2.existsSync)(this.workflowsDir)) {
            (0, fs_2.mkdirSync)(this.workflowsDir, { recursive: true });
        }
    }
    getHandlers() {
        return workflow_constants_1.HANDLER_REGISTRY;
    }
    getNodeTypes() {
        return workflow_constants_1.NODE_TYPES;
    }
    getGraphTopology(type) {
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
        const { componentName, fileKey, nodeId, config = {} } = params;
        if (!fileKey || !nodeId) {
            return { success: false, error: '参数不完整: fileKey 和 nodeId 必填' };
        }
        const workflowResult = await this.get(name);
        if (!workflowResult.success) {
            return { success: false, error: `工作流不存在: ${name}` };
        }
        const workflow = workflowResult.data;
        const sessionId = `wf-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        const finalComponentName = componentName || sessionId;
        const outputPath = (0, path_1.join)(process.cwd(), '..', 'temp-components', 'workflow-runs', sessionId);
        this.tasksService.createTask(sessionId, {
            componentName: finalComponentName,
            nodeId,
            fileKey,
            target: 'microcode',
            outputPath,
            checkpointStatus: 'none',
            taskType: 'workflow',
            userId,
        });
        this.executeWorkflow(sessionId, workflow, {
            componentName: finalComponentName,
            fileKey,
            nodeId,
            outputPath,
            config,
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
        const { componentName, fileKey, nodeId, outputPath, config } = params;
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
            componentName,
            fileKey,
            nodeId,
            outputPath,
            figmaToken,
            aiConfig,
            visionAIConfig,
            textAIConfig,
            onProgress,
            sessionId,
        };
        try {
            const result = await runDynamicWorkflow(workflow, initialState);
            this.logger.log(`[${sessionId}] 工作流执行完成`, {
                success: result?.success ?? !!result,
            });
            this.progressService.sendComplete(sessionId, {
                success: true,
                message: '工作流执行完成',
                outputPath,
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
};
exports.WorkflowService = WorkflowService;
exports.WorkflowService = WorkflowService = WorkflowService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [progress_service_1.ProgressService,
        tasks_service_1.TasksService])
], WorkflowService);
//# sourceMappingURL=workflow.service.js.map