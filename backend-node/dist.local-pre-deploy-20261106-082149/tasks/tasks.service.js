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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TasksService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const workspace_config_1 = require("../config/workspace.config");
const backend_root_1 = require("../config/backend-root");
const component_schema_1 = require("../schemas/component.schema");
const task_queue_service_1 = require("../queue/task-queue.service");
const pipeline_metrics_service_1 = require("./pipeline-metrics.service");
const core_1 = require("@nestjs/core");
const redact_1 = require("../common/utils/redact");
const package_filter_1 = require("../common/utils/package-filter");
const sfc_syntax_validation_js_1 = require("../ai-engine/utils/sfc-syntax-validation.js");
const session_lock_registry_js_1 = require("../ai-engine/utils/session-lock-registry.js");
const rename_with_copy_fallback_js_1 = require("../ai-engine/utils/rename-with-copy-fallback.js");
const { ZipArchive } = require('archiver');
const MAX_IN_MEMORY = 500;
const MAX_PERSISTED = 2000;
const ZOMBIE_TIMEOUT = 2 * 60 * 60 * 1000;
function normalizeOptionalText(value, maxLen) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    return maxLen && trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}
let TasksService = class TasksService {
    static { TasksService_1 = this; }
    componentModel;
    moduleRef;
    pipelineMetrics;
    logger = new common_1.Logger(TasksService_1.name);
    tasks = new Map();
    abortControllers = new Map();
    persistFile;
    persistInFlight = null;
    persistAgain = false;
    pendingDeletedIds = new Set();
    lastKnownDiskCount = 0;
    artifactCheckCache = new Map();
    static ARTIFACT_CACHE_TTL_MS = 10 * 1000;
    queueService;
    constructor(componentModel, queueService, moduleRef, pipelineMetrics) {
        this.componentModel = componentModel;
        this.moduleRef = moduleRef;
        this.pipelineMetrics = pipelineMetrics;
        if (queueService) {
            this.queueService = queueService;
            this.logger.log('队列服务已注入，暂停/取消/恢复任务时将联动槽位调度');
        }
        this.persistFile = (0, path_1.join)(backend_root_1.dataDir, 'tasks.json');
        this.loadSync();
    }
    async onModuleInit() {
        if (this.queueService) {
            this.queueService.onTaskFailed((sessionId, error) => {
                void this.finalizeRecoverFailedTask(sessionId, error);
            });
        }
        await this.recoverZombieTasks();
        setInterval(() => this.gc(), 5 * 60 * 1000);
        setInterval(() => {
            if (this.tasks.size > 0)
                this.persist();
        }, 30 * 1000);
        process.on('SIGTERM', () => {
            this.persist();
            process.exit(0);
        });
        process.on('SIGINT', () => {
            this.persist();
            process.exit(0);
        });
    }
    async recoverZombieTasks() {
        let zombieCount = 0;
        let recoveredCount = 0;
        for (const [, task] of this.tasks) {
            if (task.status !== 'running' && task.status !== 'paused')
                continue;
            const recovered = await this._tryRecoverTask(task);
            if (recovered) {
                recoveredCount++;
            }
            else {
                this.finalizeTask(task, 'failed', {
                    error: '服务重启导致任务中断，请重新发起生成',
                    preserveExistingError: true,
                });
                zombieCount++;
            }
        }
        const queuedTasks = [];
        for (const [, task] of this.tasks) {
            if (task.status === 'queued')
                queuedTasks.push(task);
        }
        if (zombieCount > 0 || recoveredCount > 0) {
            const parts = [];
            if (zombieCount > 0)
                parts.push(`${zombieCount} 个标记为 failed`);
            if (recoveredCount > 0)
                parts.push(`${recoveredCount} 个自动恢复完成`);
            console.log(`[TasksService] 僵尸任务清理: ${parts.join('，')}（服务重启恢复）`);
            this.persist();
        }
        if (queuedTasks.length > 0) {
            setTimeout(async () => {
                let queuedRecovered = 0;
                let queuedCleaned = 0;
                for (const task of queuedTasks) {
                    if (task.status !== 'queued')
                        continue;
                    const restored = this.queueService
                        ? await this.queueService.restoreQueuedTask(task)
                        : false;
                    if (restored) {
                        queuedRecovered++;
                    }
                    else {
                        this.finalizeTask(task, 'failed', {
                            error: '服务重启导致队列清空，请重新发起生成',
                            preserveExistingError: true,
                        });
                        queuedCleaned++;
                    }
                }
                if (queuedRecovered > 0 || queuedCleaned > 0) {
                    console.log(`[TasksService] 排队任务恢复: ${queuedRecovered} 个已恢复入队，${queuedCleaned} 个已清理（服务重启恢复）`);
                    this.persist();
                }
            }, 3000);
        }
    }
    loadSync() {
        try {
            if (!(0, fs_1.existsSync)(this.persistFile)) {
                if ((0, fs_1.existsSync)(this.persistFile + '.tmp')) {
                    const { renameSync } = require('fs');
                    renameSync(this.persistFile + '.tmp', this.persistFile);
                }
                else {
                    return;
                }
            }
            const { readFileSync } = require('fs');
            const raw = readFileSync(this.persistFile, 'utf-8');
            if (!raw || raw.trim() === '') {
                if ((0, fs_1.existsSync)(this.persistFile + '.tmp')) {
                    const { renameSync } = require('fs');
                    const tmpRaw = readFileSync(this.persistFile + '.tmp', 'utf-8');
                    if (tmpRaw && tmpRaw.trim()) {
                        renameSync(this.persistFile + '.tmp', this.persistFile);
                        return this.loadSync();
                    }
                }
                return;
            }
            let list;
            try {
                list = JSON.parse(raw);
            }
            catch (parseErr) {
                const prevFile = this.persistFile + '.prev';
                if (!(0, fs_1.existsSync)(prevFile))
                    throw parseErr;
                console.warn(`[TasksService] 主文件解析失败（${parseErr?.message}），回退备份 ${prevFile}`);
                list = JSON.parse(readFileSync(prevFile, 'utf-8'));
            }
            if (!Array.isArray(list))
                return;
            for (const task of list) {
                if (!task || !task.sessionId)
                    continue;
                if (!task.target && task.result?.target) {
                    task.target = task.result.target;
                }
                if (!task.target)
                    task.target = 'microcode';
                if (!task.componentId) {
                    task.componentId = task.result?.componentId || task.sessionId;
                }
                if (!task.groupId && task.result?.groupId) {
                    task.groupId = task.result.groupId;
                }
                if (!task.taskType) {
                    if (task.sessionId.startsWith('page-page-')) {
                        task.taskType = 'component';
                        const m = task.sessionId.match(/^page-(page-\d+-[a-f0-9]+)-.+$/);
                        if (m)
                            task.parentId = m[1];
                    }
                    else if (task.sessionId.startsWith('page-')) {
                        task.taskType = 'page';
                    }
                    else {
                        task.taskType = 'component';
                    }
                }
                if (!task.childIds)
                    task.childIds = [];
                if (task.status === 'completed' && task.error) {
                    task.error = undefined;
                }
                if (!task.panelKey)
                    task.panelKey = 'default-panel';
                this.tasks.set(task.sessionId, task);
            }
            console.log(`[TasksService] 已恢复 ${list.length} 个历史任务`);
            this.lastKnownDiskCount = Math.min(list.length, MAX_PERSISTED);
            for (const [, task] of this.tasks) {
                if (task.parentId) {
                    const parent = this.tasks.get(task.parentId);
                    if (parent) {
                        if (!parent.childIds)
                            parent.childIds = [];
                        if (!parent.childIds.includes(task.sessionId)) {
                            parent.childIds.push(task.sessionId);
                        }
                    }
                }
            }
        }
        catch (err) {
            console.warn('[TasksService] 加载持久化任务失败:', err.message);
        }
    }
    hasRecoverableArtifacts(task, componentDir, packageDir) {
        if (task.target === 'microcode' || !task.target) {
            return this.hasMicrocodeEntryFile(componentDir);
        }
        if (task.target === 'vue3') {
            return this.hasVue3EntryFile(componentDir);
        }
        return (0, fs_1.existsSync)((0, path_1.join)(packageDir, 'index.vue')) && (0, fs_1.statSync)((0, path_1.join)(packageDir, 'index.vue')).isFile();
    }
    async _tryRecoverTask(task) {
        try {
            for (const baseTemp of this.getTempRoots()) {
                const groupDirs = task.groupId
                    ? [task.groupId]
                    : await fs_1.promises.readdir(baseTemp).catch(() => []);
                for (const groupId of groupDirs) {
                    const componentDir = await this.findTempComponentDir(baseTemp, groupId, task.componentId);
                    if (!componentDir)
                        continue;
                    const packageDir = (0, path_1.join)(componentDir, 'package');
                    if (!this.hasRecoverableArtifacts(task, componentDir, packageDir))
                        continue;
                    const syntaxErrors = this.validateVueArtifacts(packageDir);
                    if (syntaxErrors.length > 0) {
                        console.warn(`[TasksService] 拒绝恢复不可编译产物 ${task.sessionId}: ${syntaxErrors[0]}`);
                        continue;
                    }
                    await this.restoreWorkspaceArtifacts(task, componentDir, packageDir, groupId);
                    const hasRunningStep = (task.progress || []).some((p) => p.type === 'progress' && p.status === 'running');
                    if (hasRunningStep) {
                        task.groupId = groupId;
                        if (!task.result)
                            task.result = {};
                        task.result.recovered = true;
                        task.result.message = '服务重启后自动恢复：产物已同步，任务仍在运行中';
                        console.log(`[TasksService] ⚠️ 断点恢复（任务仍在运行）: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`);
                    }
                    else {
                        task.groupId = groupId;
                        this.finalizeTask(task, 'completed', { refreshEndTime: true });
                        if (!task.result)
                            task.result = {};
                        task.result.componentId = task.componentId;
                        task.result.groupId = groupId;
                        task.result.target = task.target;
                        task.result.recovered = true;
                        task.result.message = '服务重启后自动恢复：代码已在重启前生成完毕，已补完 workspace 同步';
                        console.log(`[TasksService] ✅ 断点恢复成功: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`);
                    }
                    return true;
                }
            }
            return false;
        }
        catch (err) {
            console.warn(`[TasksService] 断点恢复失败 ${task.sessionId}: ${err.message}`);
            return false;
        }
    }
    recoverTask(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task) {
            return { success: false, error: '任务不存在' };
        }
        if (task.status !== 'failed' && task.status !== 'cancelled') {
            return { success: false, error: `当前状态为 ${task.status}，仅 failed/cancelled 状态的任务可恢复` };
        }
        const recovered = this._tryRecoverTaskSync(task);
        if (recovered) {
            this.persist();
            return { success: true, message: '任务已恢复：中间产物已同步到 workspace' };
        }
        const wsRecovered = this._tryRecoverFromWorkspace(task);
        if (wsRecovered) {
            this.persist();
            return { success: true, message: '任务已恢复：workspace 中已有完整代码' };
        }
        try {
            const outputPath = task.outputPath || this._findOutputPathFromTemp(task);
            if (outputPath) {
                void (async () => {
                    try {
                        const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
                        const cp = loadCheckpoint(outputPath);
                        if (cp.stage !== 'full' && cp.stage !== 'figma-cached')
                            return;
                        const { Phase2Service } = await import('../phase2/phase2.service.js');
                        const phase2Service = global.__phase2ServiceInstance;
                        if (!phase2Service) {
                            this.logger.warn(`[recoverTask] Phase2Service 实例未注册，无法续跑 ${sessionId}`);
                            return;
                        }
                        const resumeResult = await phase2Service.resumeFromCheckpoint(sessionId, {
                            componentName: task.componentName || task.sessionId,
                            fileKey: task.fileKey,
                            nodeId: task.nodeId,
                            outputPath,
                            groupId: task.groupId || '',
                            userId: task.userId,
                            panelType: task.panelKey || 'default-panel',
                            target: task.target || 'microcode',
                        });
                        if (resumeResult.success) {
                            task.status = 'running';
                            task.error = undefined;
                            this.persist();
                            this.logger.log(`[recoverTask] 断点续跑已启动: ${sessionId}`);
                        }
                    }
                    catch (err) {
                        this.logger.warn(`[recoverTask] 断点续跑启动失败 ${sessionId}: ${err.message}`);
                    }
                })();
                return { success: true, message: '已从断点继续生成（跳过已完成的分析阶段）' };
            }
        }
        catch (err) {
            this.logger.warn(`[recoverTask] checkpoint 检测失败 ${sessionId}: ${err.message}`);
        }
        return {
            success: false,
            error: '无法恢复：未找到已生成的代码（temp-components 和 workspace 均无），请使用「重新生成」',
        };
    }
    _findOutputPathFromTemp(task) {
        try {
            for (const baseTemp of this.getTempRoots()) {
                const groupDirs = task.groupId
                    ? [task.groupId]
                    : (0, fs_1.readdirSync)(baseTemp).filter((f) => (0, fs_1.statSync)((0, path_1.join)(baseTemp, f)).isDirectory());
                for (const groupId of groupDirs) {
                    const dir = this.findTempComponentDirSync(baseTemp, groupId, task.componentId);
                    if (dir)
                        return dir;
                }
            }
        }
        catch {
        }
        return null;
    }
    _tryRecoverTaskSync(task) {
        try {
            for (const baseTemp of this.getTempRoots()) {
                const groupDirs = task.groupId
                    ? [task.groupId]
                    : (0, fs_1.readdirSync)(baseTemp).filter((f) => (0, fs_1.statSync)((0, path_1.join)(baseTemp, f)).isDirectory());
                for (const groupId of groupDirs) {
                    const componentDir = this.findTempComponentDirSync(baseTemp, groupId, task.componentId);
                    if (!componentDir)
                        continue;
                    const packageDir = (0, path_1.join)(componentDir, 'package');
                    if (!this.hasRecoverableArtifacts(task, componentDir, packageDir))
                        continue;
                    const syntaxErrors = this.validateVueArtifacts(packageDir);
                    if (syntaxErrors.length > 0) {
                        console.warn(`[TasksService] 拒绝手动恢复不可编译产物 ${task.sessionId}: ${syntaxErrors[0]}`);
                        continue;
                    }
                    this.restoreWorkspaceArtifactsSync(task, componentDir, packageDir, groupId);
                    const hasRunningStep = (task.progress || []).some((p) => p.type === 'progress' && p.status === 'running');
                    if (hasRunningStep) {
                        task.groupId = groupId;
                        if (!task.result)
                            task.result = {};
                        task.result.recovered = true;
                        task.result.message = '手动恢复：产物已同步，任务仍在运行中';
                        console.log(`[TasksService] ⚠️ 手动恢复（任务仍在运行）: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`);
                    }
                    else {
                        task.groupId = groupId;
                        this.finalizeTask(task, 'completed', { refreshEndTime: true });
                        if (!task.result)
                            task.result = {};
                        task.result.componentId = task.componentId;
                        task.result.groupId = groupId;
                        task.result.target = task.target;
                        task.result.recovered = true;
                        task.result.message = '手动恢复：代码已在重启前生成完毕，已补完 workspace 同步';
                        console.log(`[TasksService] ✅ 手动恢复成功: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`);
                    }
                    return true;
                }
            }
            return false;
        }
        catch (err) {
            console.warn(`[TasksService] 手动恢复失败 ${task.sessionId}: ${err.message}`);
            return false;
        }
    }
    _tryRecoverFromWorkspace(task) {
        try {
            const isVue3 = task.target === 'vue3';
            const backendBase = isVue3
                ? backend_root_1.vue3ComponentsDir
                : backend_root_1.customComponentsDir;
            if (!(0, fs_1.existsSync)(backendBase))
                return false;
            const groupDirs = isVue3
                ? task.groupId
                    ? [task.groupId]
                    : (0, fs_1.readdirSync)(backendBase).filter((f) => (0, fs_1.statSync)((0, path_1.join)(backendBase, f)).isDirectory())
                : [''];
            for (const groupId of groupDirs) {
                const componentBase = isVue3
                    ? (0, path_1.join)(backendBase, groupId, task.componentId)
                    : (0, path_1.join)(backendBase, task.componentId);
                const wsIndex = isVue3
                    ? (0, path_1.join)(componentBase, 'package', 'index.vue')
                    : (0, path_1.join)(componentBase, 'package', 'index.vue');
                if (!wsIndex || !(0, fs_1.existsSync)(wsIndex))
                    continue;
                const syntaxErrors = this.validateVueArtifacts((0, path_1.join)(componentBase, 'package'));
                if (syntaxErrors.length > 0) {
                    console.warn(`[TasksService] 拒绝从 workspace 恢复不可编译产物 ${task.sessionId}: ${syntaxErrors[0]}`);
                    continue;
                }
                const content = (0, fs_1.readFileSync)(wsIndex, 'utf8');
                if (content.includes('<template') && content.length > 200) {
                    const hasRunningStep = (task.progress || []).some((p) => p.type === 'progress' && p.status === 'running');
                    if (hasRunningStep) {
                        task.groupId = groupId || task.groupId;
                        if (!task.result)
                            task.result = {};
                        task.result.recovered = true;
                        task.result.message = '从 workspace 恢复：产物已存在，任务仍在运行中';
                        console.log(`[TasksService] ⚠️ 从 workspace 恢复（任务仍在运行）: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`);
                    }
                    else {
                        task.groupId = groupId || task.groupId;
                        this.finalizeTask(task, 'completed', { refreshEndTime: true });
                        if (!task.result)
                            task.result = {};
                        task.result.componentId = task.componentId;
                        task.result.groupId = task.groupId;
                        task.result.target = task.target;
                        task.result.recovered = true;
                        task.result.message = '从 workspace 恢复：代码已存在于 workspace（temp-components 已清理）';
                        console.log(`[TasksService] ✅ 从 workspace 恢复成功: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`);
                    }
                    const frontendWs = isVue3
                        ? (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, task.componentId)
                        : (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', task.componentId);
                    if (!(0, fs_1.existsSync)(frontendWs)) {
                        (0, fs_1.mkdirSync)(frontendWs, { recursive: true });
                        (0, fs_1.cpSync)(componentBase, frontendWs, { recursive: true });
                    }
                    return true;
                }
            }
            return false;
        }
        catch (err) {
            console.warn(`[TasksService] workspace 恢复失败 ${task.sessionId}: ${err.message}`);
            return false;
        }
    }
    validateVueArtifacts(packageDir) {
        return (0, sfc_syntax_validation_js_1.validateVueSfcDirectory)(packageDir);
    }
    getTempRoots() {
        return [
            backend_root_1.tempComponentsDir,
        ].filter((dir, index, all) => all.indexOf(dir) === index && (0, fs_1.existsSync)(dir));
    }
    async findTempComponentDir(baseTemp, groupId, componentId) {
        const groupDir = (0, path_1.join)(baseTemp, groupId);
        const exact = (0, path_1.join)(groupDir, componentId);
        if ((0, fs_1.existsSync)(exact))
            return exact;
        const entries = await fs_1.promises
            .readdir(groupDir, { withFileTypes: true })
            .catch(() => []);
        const match = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${componentId}-`));
        return match ? (0, path_1.join)(groupDir, match.name) : null;
    }
    findTempComponentDirSync(baseTemp, groupId, componentId) {
        const groupDir = (0, path_1.join)(baseTemp, groupId);
        const exact = (0, path_1.join)(groupDir, componentId);
        if ((0, fs_1.existsSync)(exact))
            return exact;
        if (!(0, fs_1.existsSync)(groupDir))
            return null;
        const match = (0, fs_1.readdirSync)(groupDir, { withFileTypes: true }).find((entry) => entry.isDirectory() && entry.name.startsWith(`${componentId}-`));
        return match ? (0, path_1.join)(groupDir, match.name) : null;
    }
    async restoreWorkspaceArtifacts(task, componentDir, packageDir, groupId) {
        const isVue3 = task.target === 'vue3';
        const targets = isVue3
            ? [
                (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, task.componentId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, task.componentId),
            ]
            : [
                (0, path_1.join)(backend_root_1.customComponentsDir, task.componentId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', task.componentId),
            ];
        for (const target of targets) {
            await fs_1.promises.mkdir(target, { recursive: true });
            if (isVue3) {
                await fs_1.promises.cp(packageDir, (0, path_1.join)(target, 'package'), { recursive: true });
                const resourcesDir = (0, path_1.join)(componentDir, 'resources');
                if ((0, fs_1.existsSync)(resourcesDir)) {
                    await fs_1.promises.cp(resourcesDir, (0, path_1.join)(target, 'resources'), { recursive: true });
                }
            }
            else {
                await fs_1.promises.cp(componentDir, target, {
                    recursive: true,
                    filter: (src) => !src.endsWith('index.html'),
                });
                await this.ensureMicrocodeEntry(target, componentDir);
            }
        }
    }
    restoreWorkspaceArtifactsSync(task, componentDir, packageDir, groupId) {
        const isVue3 = task.target === 'vue3';
        const targets = isVue3
            ? [
                (0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, task.componentId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, task.componentId),
            ]
            : [
                (0, path_1.join)(backend_root_1.customComponentsDir, task.componentId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', task.componentId),
            ];
        for (const target of targets) {
            (0, fs_1.mkdirSync)(target, { recursive: true });
            if (isVue3) {
                (0, fs_1.cpSync)(packageDir, (0, path_1.join)(target, 'package'), { recursive: true });
                const resourcesDir = (0, path_1.join)(componentDir, 'resources');
                if ((0, fs_1.existsSync)(resourcesDir)) {
                    (0, fs_1.cpSync)(resourcesDir, (0, path_1.join)(target, 'resources'), { recursive: true });
                }
            }
            else {
                (0, fs_1.cpSync)(componentDir, target, {
                    recursive: true,
                    filter: (src) => !src.endsWith('index.html'),
                });
                this.ensureMicrocodeEntrySync(target, componentDir);
            }
        }
    }
    async ensureMicrocodeEntry(target, componentDir) {
        const styleImport = (0, fs_1.existsSync)((0, path_1.join)(componentDir, 'resources', 'styles', 'index.css'))
            ? "import './resources/styles/index.css'"
            : (0, fs_1.existsSync)((0, path_1.join)(componentDir, 'resources', 'styles', 'index.less'))
                ? "import './resources/styles/index.less'"
                : '// No CSS/LESS file found';
        await fs_1.promises.writeFile((0, path_1.join)(target, 'component.js'), `import component from './package/index.vue'\n${styleImport}\nexport default component\n`, 'utf-8');
    }
    ensureMicrocodeEntrySync(target, componentDir) {
        const styleImport = (0, fs_1.existsSync)((0, path_1.join)(componentDir, 'resources', 'styles', 'index.css'))
            ? "import './resources/styles/index.css'"
            : (0, fs_1.existsSync)((0, path_1.join)(componentDir, 'resources', 'styles', 'index.less'))
                ? "import './resources/styles/index.less'"
                : '// No CSS/LESS file found';
        (0, fs_1.writeFileSync)((0, path_1.join)(target, 'component.js'), `import component from './package/index.vue'\n${styleImport}\nexport default component\n`, 'utf-8');
    }
    persist() {
        if (this.persistInFlight) {
            this.persistAgain = true;
            return this.persistInFlight;
        }
        this.persistInFlight = this.flushPersistQueue()
            .finally(() => {
            this.persistInFlight = null;
            if (this.persistAgain) {
                this.persistAgain = false;
                this.persist();
            }
        });
        return this.persistInFlight;
    }
    async flushPersistQueue() {
        try {
            const list = Array.from(this.tasks.values())
                .sort((a, b) => b.startTime - a.startTime)
                .slice(0, MAX_PERSISTED)
                .map((task) => (0, redact_1.redactSecrets)({
                ...task,
                progress: (task.progress || []).slice(-200),
                buffer: [],
            }));
            let finalList = list;
            if (list.length < this.lastKnownDiskCount && this.pendingDeletedIds.size === 0) {
                const diskList = this.readDiskTaskList();
                if (diskList.length > list.length) {
                    console.warn(`[TasksService] 落盘护栏：内存 ${list.length} < 磁盘 ${diskList.length} 且无有意删除，` +
                        `已合并磁盘独有项、拒绝缩短写入（疑似磁盘被外部替换/异常丢数据）`);
                    finalList = this.mergeTaskLists(list, diskList);
                    let injected = 0;
                    for (const t of finalList) {
                        if (t && t.sessionId && !this.tasks.has(t.sessionId)) {
                            this.tasks.set(t.sessionId, t);
                            injected++;
                        }
                    }
                    if (injected > 0) {
                        console.warn(`[TasksService] 落盘护栏：已回灌 ${injected} 条磁盘独有任务到内存（内存/落盘对齐，避免重复读盘与合并）`);
                    }
                }
            }
            const dir = (0, path_1.join)(this.persistFile, '..');
            if (!(0, fs_1.existsSync)(dir)) {
                await fs_1.promises.mkdir(dir, { recursive: true });
            }
            const json = JSON.stringify(finalList, null, 2);
            let lastErr = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                const tmpFile = `${this.persistFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
                try {
                    await fs_1.promises.writeFile(tmpFile, json, 'utf-8');
                    await fs_1.promises.access(tmpFile);
                    try {
                        await fs_1.promises.rename(tmpFile, this.persistFile);
                    }
                    catch (renameErr) {
                        if (renameErr?.code !== 'EPERM' && renameErr?.code !== 'EBUSY')
                            throw renameErr;
                        await this.backupPersistFileBeforeDirectWrite();
                        await fs_1.promises.writeFile(this.persistFile, json, 'utf-8');
                        try {
                            await fs_1.promises.unlink(tmpFile);
                        }
                        catch { }
                        console.warn(`[TasksService] 持久化：rename ${renameErr.code}，已降级为直写`);
                    }
                    const prevBaseline = this.lastKnownDiskCount;
                    if (finalList.length !== prevBaseline) {
                        console.log(`[TasksService] 落盘 ${finalList.length} 条（磁盘基线 ${prevBaseline}，` +
                            `有意删除 ${this.pendingDeletedIds.size}，合并磁盘独有 ${finalList.length - list.length}）`);
                    }
                    this.lastKnownDiskCount = finalList.length;
                    this.pendingDeletedIds.clear();
                    return;
                }
                catch (err) {
                    lastErr = err;
                }
            }
            throw lastErr;
        }
        catch (err) {
            console.warn('[TasksService] 持久化任务失败:', err.message);
        }
    }
    readDiskTaskList() {
        try {
            if (!(0, fs_1.existsSync)(this.persistFile))
                return [];
            const raw = (0, fs_1.readFileSync)(this.persistFile, 'utf-8');
            if (!raw || raw.trim() === '')
                return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch (err) {
            console.warn('[TasksService] 落盘护栏读取磁盘任务失败:', err?.message);
            return [];
        }
    }
    mergeTaskLists(memoryList, diskList) {
        const seen = new Set(memoryList.map((t) => t.sessionId));
        const merged = [...memoryList];
        for (const t of diskList) {
            if (!t || !t.sessionId || seen.has(t.sessionId))
                continue;
            seen.add(t.sessionId);
            merged.push(t);
        }
        return merged
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, MAX_PERSISTED);
    }
    async backupPersistFileBeforeDirectWrite() {
        const prevFile = `${this.persistFile}.prev`;
        try {
            if (!(0, fs_1.existsSync)(this.persistFile))
                return;
            const prevTmp = `${prevFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
            await fs_1.promises.copyFile(this.persistFile, prevTmp);
            (0, rename_with_copy_fallback_js_1.renameWithCopyFallback)(prevTmp, prevFile, { label: 'TasksService.persist.prev' });
        }
        catch (err) {
            try {
                await fs_1.promises.copyFile(this.persistFile, prevFile);
            }
            catch (fallbackErr) {
                console.warn('[TasksService] 直写前备份 .prev 失败（继续直写，仅失去回滚保护）:', fallbackErr?.message || err?.message);
            }
        }
    }
    gc() {
        const now = Date.now();
        let needsPersist = false;
        for (const [sessionId, task] of this.tasks) {
            if (task.status === 'running' || task.status === 'paused') {
                const lastUpdate = task.progress.length
                    ? task.progress[task.progress.length - 1].timestamp
                    : task.startTime;
                if (now - lastUpdate > ZOMBIE_TIMEOUT) {
                    this.finalizeTask(task, 'failed', {
                        error: '任务超时（服务可能已重启）',
                        preserveExistingError: true,
                    });
                    needsPersist = true;
                    if (this.queueService) {
                        void this.queueService.releaseSlot(sessionId).catch((err) => {
                            console.warn(`[TasksService] 释放僵尸任务槽位失败: ${sessionId}`, err);
                        });
                    }
                }
            }
        }
        const completed = Array.from(this.tasks.entries())
            .filter(([, t]) => t.status !== 'running' && t.status !== 'paused')
            .sort((a, b) => a[1].startTime - b[1].startTime);
        if (completed.length > MAX_IN_MEMORY) {
            const removeCount = completed.length - MAX_IN_MEMORY;
            for (let i = 0; i < removeCount; i++) {
                this.pendingDeletedIds.add(completed[i][0]);
                this.tasks.delete(completed[i][0]);
            }
            needsPersist = true;
        }
        if (needsPersist) {
            this.persist();
        }
    }
    createTask(sessionId, metadata = {}, initialStatus) {
        const task = {
            sessionId,
            configSnapshot: metadata.configSnapshot ? (0, redact_1.redactSecrets)(metadata.configSnapshot) : undefined,
            componentId: metadata.componentId || sessionId,
            groupId: metadata.groupId,
            status: initialStatus || 'running',
            startTime: Date.now(),
            progress: [],
            progressCount: 0,
            result: null,
            error: undefined,
            buffer: [],
            componentName: metadata.componentName || '',
            nodeId: metadata.nodeId || '',
            fileKey: metadata.fileKey || '',
            themeNodes: Array.isArray(metadata.themeNodes) && metadata.themeNodes.length > 0
                ? metadata.themeNodes
                : undefined,
            target: metadata.target || 'microcode',
            generationTier: metadata.generationTier,
            sourceType: metadata.sourceType,
            extraPrompt: normalizeOptionalText(metadata.extraPrompt, 4000),
            requirementDocText: normalizeOptionalText(metadata.requirementDocText, 20000),
            userComponentId: normalizeOptionalText(metadata.userComponentId),
            outputPath: metadata.outputPath,
            lastCompletedStage: metadata.lastCompletedStage,
            checkpointStatus: metadata.checkpointStatus || 'none',
            panelKey: metadata.panelKey || 'default-panel',
            taskType: metadata.taskType || 'component',
            parentId: metadata.parentId,
            childIds: [],
            userId: metadata.userId,
        };
        this.tasks.set(sessionId, task);
        if (metadata.parentId) {
            const parent = this.tasks.get(metadata.parentId);
            if (parent) {
                if (!parent.childIds)
                    parent.childIds = [];
                if (!parent.childIds.includes(sessionId)) {
                    parent.childIds.push(sessionId);
                }
            }
        }
        this.persist();
        return task;
    }
    getTask(sessionId) {
        return this.tasks.get(sessionId);
    }
    getTaskByComponentId(componentId) {
        const direct = this.tasks.get(componentId);
        if (direct?.componentId === componentId)
            return direct;
        return Array.from(this.tasks.values())
            .filter((task) => task.componentId === componentId)
            .sort((a, b) => b.startTime - a.startTime)[0];
    }
    async packageTaskCode(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task || (task.userId && task.userId !== userId)) {
            throw new Error('任务不存在或无权访问');
        }
        if (task.status !== 'failed' && task.status !== 'cancelled') {
            throw new Error(`当前状态为 ${task.status}，仅失败或已取消任务使用此下载接口`);
        }
        const candidates = [];
        const isVue3 = task.target === 'vue3';
        if (isVue3 && task.groupId) {
            candidates.push((0, path_1.join)(backend_root_1.vue3ComponentsDir, task.groupId, task.componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', task.groupId, task.componentId));
        }
        else {
            candidates.push((0, path_1.join)(backend_root_1.customComponentsDir, task.componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', task.componentId));
        }
        if (task.outputPath) {
            const allowedRoots = [
                ...this.getTempRoots(),
                backend_root_1.workspaceRoot,
                (0, workspace_config_1.resolveFrontendWorkspace)(),
            ].map((root) => `${(0, path_1.resolve)(root)}${path_1.sep}`);
            const normalizedOutputPath = `${(0, path_1.resolve)(task.outputPath)}${path_1.sep}`;
            if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
                candidates.push(task.outputPath);
            }
        }
        for (const baseTemp of this.getTempRoots()) {
            const groupIds = task.groupId
                ? [task.groupId]
                : (0, fs_1.readdirSync)(baseTemp, { withFileTypes: true })
                    .filter((entry) => entry.isDirectory())
                    .map((entry) => entry.name);
            for (const groupId of groupIds) {
                const tempDir = this.findTempComponentDirSync(baseTemp, groupId, task.componentId);
                if (tempDir)
                    candidates.push(tempDir);
            }
        }
        const sourceDir = candidates.find((candidate) => (0, fs_1.existsSync)(candidate) && (0, fs_1.statSync)(candidate).isDirectory());
        if (!sourceDir) {
            throw new Error('未找到可下载的 workspace 或中间代码产物');
        }
        const buffer = await new Promise((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const chunks = [];
            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', reject);
            archive.directory(sourceDir, task.componentId, (0, package_filter_1.packageEntryFilter)());
            archive.finalize();
        });
        return { buffer, filename: `${task.componentId}-failed-code.zip` };
    }
    async publishToWorkspace(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task || (task.userId && task.userId !== userId)) {
            throw new Error('任务不存在或无权访问');
        }
        if (task.status !== 'failed' && task.status !== 'cancelled') {
            throw new Error(`当前状态为 ${task.status}，仅失败或已取消任务使用此发布接口`);
        }
        const candidates = [];
        const isVue3 = task.target === 'vue3';
        if (isVue3 && task.groupId) {
            candidates.push((0, path_1.join)(backend_root_1.vue3ComponentsDir, task.groupId, task.componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', task.groupId, task.componentId));
        }
        else {
            candidates.push((0, path_1.join)(backend_root_1.customComponentsDir, task.componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', task.componentId));
        }
        if (task.outputPath) {
            const allowedRoots = [
                ...this.getTempRoots(),
                backend_root_1.workspaceRoot,
                (0, workspace_config_1.resolveFrontendWorkspace)(),
            ].map((root) => `${(0, path_1.resolve)(root)}${path_1.sep}`);
            const normalizedOutputPath = `${(0, path_1.resolve)(task.outputPath)}${path_1.sep}`;
            if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
                candidates.push(task.outputPath);
            }
        }
        for (const baseTemp of this.getTempRoots()) {
            const groupIds = task.groupId
                ? [task.groupId]
                : (0, fs_1.readdirSync)(baseTemp, { withFileTypes: true })
                    .filter((entry) => entry.isDirectory())
                    .map((entry) => entry.name);
            for (const groupId of groupIds) {
                const tempDir = this.findTempComponentDirSync(baseTemp, groupId, task.componentId);
                if (tempDir)
                    candidates.push(tempDir);
            }
        }
        const targetPaths = new Set(isVue3 && task.groupId
            ? [
                (0, path_1.join)(backend_root_1.vue3ComponentsDir, task.groupId, task.componentId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', task.groupId, task.componentId),
            ]
            : [
                (0, path_1.join)(backend_root_1.customComponentsDir, task.componentId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', task.componentId),
            ]);
        const isPublishable = (dir) => (0, fs_1.existsSync)(dir) && (0, fs_1.statSync)(dir).isDirectory() && (0, fs_1.existsSync)((0, path_1.join)(dir, 'package'));
        const alreadyPublished = [...targetPaths].some((dir) => isPublishable(dir));
        const sourceDir = alreadyPublished
            ? ''
            : candidates.find((candidate) => !targetPaths.has(candidate) && isPublishable(candidate));
        let finalSourceDir = sourceDir || '';
        let sourceNote = '';
        let stagedDir = '';
        if (!finalSourceDir && this.moduleRef) {
            try {
                const { TaskCodeSnapshotService } = require('./task-code-snapshot.service');
                const snapshotSvc = this.moduleRef.get(TaskCodeSnapshotService, { strict: false });
                const fromSnapshot = snapshotSvc?.resolvePublishSourceDir?.(sessionId);
                if (fromSnapshot) {
                    const snapshotDir = fromSnapshot.dir;
                    stagedDir = (0, path_1.join)((0, os_1.tmpdir)(), `mvgo-publish-${sessionId}-${Date.now()}`);
                    (0, fs_1.cpSync)(snapshotDir, stagedDir, { recursive: true });
                    finalSourceDir = stagedDir;
                    sourceNote = `（来源：代码快照 ${fromSnapshot.revision}）`;
                }
            }
            catch (err) {
                this.logger.warn(`[publishToWorkspace] 读取代码快照失败（非致命）：${err?.message || err}`);
            }
        }
        if (!finalSourceDir && alreadyPublished) {
            return { success: true, message: '产物已在 workspace 中，可直接在 Playground 预览' };
        }
        if (!finalSourceDir) {
            throw new Error('未找到可发布的 workspace 或中间代码产物，且该任务没有可用的代码快照');
        }
        try {
            const phase2Service = global.__phase2ServiceInstance;
            if (!phase2Service) {
                throw new Error('Phase2Service 实例未注册，无法发布到 workspace');
            }
            await phase2Service.copyToWorkspace(finalSourceDir, task.componentId, task.target || 'microcode', task.groupId || 'default-group');
            this.logger.log(`[publishToWorkspace] 失败任务产物已发布到 workspace: ${sessionId} ${sourceNote} (from=${finalSourceDir})`);
            return { success: true, message: `产物已发布到 workspace，可在 Playground 预览${sourceNote}` };
        }
        finally {
            if (stagedDir) {
                try {
                    (0, fs_1.rmSync)(stagedDir, { recursive: true, force: true });
                }
                catch (err) {
                    this.logger.warn(`[publishToWorkspace] 清理临时发布目录失败（非致命）：${err?.message || err}`);
                }
            }
        }
    }
    stripParentRefs(value, depth = 0) {
        if (value === null || typeof value !== 'object')
            return value;
        if (depth > 200)
            return undefined;
        if (Array.isArray(value))
            return value.map((v) => this.stripParentRefs(v, depth + 1));
        const out = {};
        for (const k of Object.keys(value)) {
            if (k === '__parent')
                continue;
            out[k] = this.stripParentRefs(value[k], depth + 1);
        }
        return out;
    }
    stripParentRefsDeep(value) {
        return this.stripParentRefs(value);
    }
    getTaskStatus(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task) {
            return {
                success: false,
                error: '任务不存在',
            };
        }
        if (userId && task.userId && task.userId !== userId) {
            return {
                success: false,
                error: '无权访问此任务',
            };
        }
        const missingFiles = task.status === 'failed' ? this.getPartialMissingFiles(task) : [];
        const artifactIncomplete = (task.degradedScriptParts?.length || 0) +
            (task.degradedFiles?.length || 0) +
            (task.gateSkippedFiles?.length || 0) +
            missingFiles.length >
            0;
        return {
            success: true,
            task: {
                sessionId: task.sessionId,
                componentId: task.componentId,
                groupId: task.groupId,
                status: task.status,
                startTime: task.startTime,
                endTime: task.endTime,
                duration: task.duration,
                progressCount: task.progressCount,
                componentName: task.componentName,
                displayName: task.displayName,
                error: task.error,
                progress: this.stripParentRefs(task.progress),
                result: this.stripParentRefs(task.result),
                fileKey: task.fileKey,
                nodeId: task.nodeId,
                themeNodes: task.themeNodes,
                target: task.target,
                panelKey: task.panelKey,
                taskType: task.taskType,
                parentId: task.parentId,
                childIds: task.childIds,
                generationTier: task.generationTier,
                sourceType: task.sourceType,
                extraPrompt: task.extraPrompt,
                requirementDocText: task.requirementDocText,
                userComponentId: task.userComponentId,
                artifactReady: this.hasTaskArtifacts(task),
                artifactReadyLevel: this.getArtifactReadyLevel(task),
                missingEntryFiles: this.getMissingEntryFiles(task),
                missingFiles: missingFiles.length > 0 ? missingFiles : undefined,
                artifactIncomplete,
                degradedScriptParts: task.degradedScriptParts?.length ? task.degradedScriptParts : undefined,
                degradedFiles: task.degradedFiles?.length ? task.degradedFiles : undefined,
                gateSkippedFiles: task.gateSkippedFiles?.length ? task.gateSkippedFiles : undefined,
                completionModels: task.completionModels,
                configSnapshot: task.configSnapshot ? (0, redact_1.redactSecrets)(task.configSnapshot) : undefined,
            },
        };
    }
    getTaskSummary(userId) {
        const all = Array.from(this.tasks.values()).filter(t => {
            if (userId)
                return t.userId === userId;
            return true;
        });
        const total = all.length;
        let vue3 = 0;
        let microcode = 0;
        let completed = 0;
        let failed = 0;
        let running = 0;
        let queued = 0;
        let screenshot = 0;
        let figma = 0;
        let todayGenerated = 0;
        const todayStart = (() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        })();
        for (const t of all) {
            const target = t.target || (t.sessionId?.startsWith('mv-') ? 'vue3' : 'microcode');
            if (target === 'vue3')
                vue3++;
            else
                microcode++;
            if (t.status === 'completed')
                completed++;
            else if (t.status === 'failed')
                failed++;
            else if (t.status === 'running')
                running++;
            else if (t.status === 'queued')
                queued++;
            if ((t.startTime || 0) >= todayStart)
                todayGenerated++;
            const src = t.sourceType
                || (t.sessionId?.startsWith('ml-') ? 'screenshot'
                    : t.sessionId?.startsWith('mv-lite-') || t.sessionId?.startsWith('mc-lite-') ? 'screenshot'
                        : t.sessionId?.startsWith('mv-max-') || t.sessionId?.startsWith('mc-max-') ? 'figma'
                            : t.sessionId?.startsWith('mv-') || t.sessionId?.startsWith('mc-') ? 'figma'
                                : 'unknown');
            if (src === 'screenshot')
                screenshot++;
            else if (src === 'figma')
                figma++;
        }
        const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return {
            total,
            vue3,
            microcode,
            completed,
            failed,
            running,
            queued,
            screenshot,
            figma,
            todayGenerated,
            successRate,
        };
    }
    figmaSourceCache = new Map();
    static FIGMA_SOURCE_CACHE_TTL_MS = 60 * 1000;
    resolveFigmaSource(task) {
        const fileKey = String(task.fileKey || '');
        const nodeId = String(task.nodeId || '');
        if (fileKey)
            return { fileKey, nodeId };
        const sid = String(task.sessionId || '');
        if (!sid)
            return { fileKey: '', nodeId: '' };
        const now = Date.now();
        const cached = this.figmaSourceCache.get(sid);
        if (cached && now - cached.at < TasksService_1.FIGMA_SOURCE_CACHE_TTL_MS) {
            return { fileKey: cached.fileKey, nodeId: cached.nodeId };
        }
        const found = this.readFigmaSourceFromProgress(task) ?? this.readFigmaSourceFromCache(task);
        if (this.figmaSourceCache.size > 600)
            this.figmaSourceCache.clear();
        this.figmaSourceCache.set(sid, { ...found, at: now });
        if (found.fileKey) {
            task.fileKey = found.fileKey;
            if (!task.nodeId)
                task.nodeId = found.nodeId;
        }
        return found;
    }
    readFigmaSourceFromProgress(task) {
        const parts = [];
        for (const p of task.progress || []) {
            if (!p)
                continue;
            if (typeof p === 'string')
                parts.push(p);
            else if (typeof p.message === 'string')
                parts.push(p.message);
            else if (typeof p.text === 'string')
                parts.push(p.text);
        }
        if (!parts.length)
            return undefined;
        const RX = /figma-source\.json:\s*([A-Za-z0-9]{10,})\/(\d+:\d+)/gi;
        const seen = new Map();
        let m;
        while ((m = RX.exec(parts.join('\n'))) !== null) {
            seen.set(`${m[1]}/${m[2]}`, { fileKey: m[1], nodeId: m[2] });
        }
        if (seen.size === 0)
            return undefined;
        if (seen.size > 1) {
            this.logger.warn(`[figma-source 回填] ${task.sessionId} 进度日志含 ${seen.size} 个不同 Figma 源（并发串味），拒绝回填: ${[...seen.keys()].join(' , ')}`);
            return undefined;
        }
        return [...seen.values()][0];
    }
    readFigmaSourceFromCache(task) {
        const empty = { fileKey: '', nodeId: '' };
        const dirs = [];
        const componentId = String(task.componentId || task.sessionId || '');
        if (task.groupId)
            dirs.push((0, path_1.join)(backend_root_1.tempComponentsDir, String(task.groupId), componentId));
        if (task.outputPath)
            dirs.push(String(task.outputPath));
        if (!task.groupId && (0, fs_1.existsSync)(backend_root_1.tempComponentsDir)) {
            try {
                for (const group of (0, fs_1.readdirSync)(backend_root_1.tempComponentsDir)) {
                    dirs.push((0, path_1.join)(backend_root_1.tempComponentsDir, group, componentId));
                }
            }
            catch {
            }
        }
        for (const dir of dirs) {
            const sourceFile = (0, path_1.join)(dir, '.cache', 'figma-source.json');
            if (!(0, fs_1.existsSync)(sourceFile))
                continue;
            try {
                const raw = JSON.parse((0, fs_1.readFileSync)(sourceFile, 'utf-8'));
                const fileKey = String(raw?.fileKey || '');
                if (!fileKey)
                    continue;
                return { fileKey, nodeId: String(raw?.nodeId || '') };
            }
            catch {
            }
        }
        return empty;
    }
    getArtifactSnapshot(task) {
        const sid = task.sessionId || '';
        const status = task.status || '';
        const terminal = status === 'completed' || status === 'failed' || status === 'cancelled';
        const cached = this.artifactCheckCache.get(sid);
        if (cached &&
            cached.status === status &&
            (terminal || Date.now() - cached.at < TasksService_1.ARTIFACT_CACHE_TTL_MS)) {
            return {
                ready: cached.ready,
                level: cached.level,
                missing: cached.missing,
                missingFiles: cached.missingFiles,
            };
        }
        const level = this.getArtifactReadyLevel(task);
        const snapshot = {
            ready: this.hasTaskArtifacts(task),
            level,
            missing: level === 'partial' ? this.getMissingEntryFiles(task) : [],
            missingFiles: status === 'failed' ? this.getPartialMissingFiles(task) : [],
        };
        if (this.artifactCheckCache.size > 600)
            this.artifactCheckCache.clear();
        this.artifactCheckCache.set(sid, { ...snapshot, status, at: Date.now() });
        return snapshot;
    }
    getAllTasks(userId, opts) {
        const slim = opts?.slim !== false;
        const limited = opts?.limit && opts.limit > 0 ? Math.max(1, Math.floor(opts.limit)) : 0;
        const entries = Array.from(this.tasks.entries()).filter(([, task]) => {
            if (userId)
                return task.userId === userId;
            return true;
        });
        entries.sort((a, b) => (b[1].startTime || 0) - (a[1].startTime || 0));
        const scoped = limited > 0 ? entries.slice(0, limited) : entries;
        return scoped.map(([, task]) => {
            const sid = task.sessionId || '';
            const snap = this.getArtifactSnapshot(task);
            const missingFiles = snap.missingFiles;
            const artifactIncomplete = (task.degradedScriptParts?.length || 0) +
                (task.degradedFiles?.length || 0) +
                missingFiles.length >
                0;
            const figmaSource = this.resolveFigmaSource(task);
            const item = {
                ...task,
                fileKey: figmaSource.fileKey || task.fileKey || '',
                nodeId: task.nodeId || figmaSource.nodeId || '',
                target: task.target || task.result?.target || 'microcode',
                taskType: task.taskType || (sid.startsWith('page-') && !task.parentId ? 'page' : 'component'),
                parentId: task.parentId,
                childIds: task.childIds || [],
                generationTier: task.generationTier || undefined,
                sourceType: task.sourceType || undefined,
                missingFiles: missingFiles.length > 0 ? missingFiles : undefined,
                artifactIncomplete,
            };
            item.artifactReady = snap.ready;
            item.artifactReadyLevel = snap.level;
            item.missingEntryFiles = snap.missing;
            if (slim) {
                item.progress = (task.progress || []).slice(-20);
                item.buffer = [];
                if (task.requirementDocText) {
                    item.requirementDocTextLen = task.requirementDocText.length;
                    delete item.requirementDocText;
                }
                if (task.result && typeof task.result === 'object') {
                    const slimResult = { ...task.result };
                    delete slimResult.figmaNodeData;
                    delete slimResult.figmaStyleTree;
                    delete slimResult.code;
                    delete slimResult._l0FilesForCheck;
                    delete slimResult._visualParserCache;
                    delete slimResult.resourceDomMapping;
                    delete slimResult.layoutStructure;
                    item.result = slimResult;
                }
            }
            return this.stripParentRefsDeep(item);
        });
    }
    countActiveTasks(userId) {
        let n = 0;
        for (const [, t] of this.tasks.entries()) {
            if (userId && t.userId && t.userId !== userId)
                continue;
            const s = t.status;
            if (s === 'running' ||
                s === 'queued' ||
                s === 'rate_limited' ||
                s === 'retry_scheduled' ||
                s === 'paused') {
                n++;
            }
        }
        return n;
    }
    getChildren(parentId) {
        const parent = this.tasks.get(parentId);
        if (!parent || !parent.childIds || parent.childIds.length === 0)
            return [];
        return parent.childIds
            .map((id) => this.tasks.get(id))
            .filter((t) => !!t);
    }
    getTaskTree(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return null;
        if (userId && task.userId && task.userId !== userId)
            return null;
        const children = this.getChildren(sessionId);
        return {
            ...this.stripParentRefs(task),
            children: children.map((c) => ({
                sessionId: c.sessionId,
                componentId: c.componentId,
                groupId: c.groupId,
                status: c.status,
                componentName: c.componentName,
                nodeId: c.nodeId,
                fileKey: c.fileKey,
                target: c.target,
                panelKey: c.panelKey,
                taskType: c.taskType,
                startTime: c.startTime,
                endTime: c.endTime,
                duration: c.duration,
                progressCount: c.progressCount,
                error: c.error,
                result: this.stripParentRefs(c.result),
            })),
        };
    }
    addProgress(sessionId, progressData) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return;
        if (this.queueService && task.status === 'running') {
            this.queueService.touchRunning(sessionId);
        }
        const progressEntry = {
            ...progressData,
            timestamp: Date.now(),
        };
        task.progress.push(progressEntry);
        task.buffer.push(progressEntry);
        task.progressCount = task.progress.length;
    }
    clearBuffer(sessionId) {
        const task = this.tasks.get(sessionId);
        if (task) {
            const buffer = [...task.buffer];
            task.buffer = [];
            return buffer;
        }
        return [];
    }
    finalizeTask(task, status, opts = {}) {
        task.status = status;
        if (status === 'completed') {
            task.error = undefined;
        }
        else if (opts.error !== undefined) {
            if (!opts.preserveExistingError || !task.error) {
                task.error = opts.error;
            }
        }
        if (opts.refreshEndTime || !task.endTime) {
            task.endTime = Date.now();
        }
        task.duration = task.endTime - task.startTime;
        if (opts.result !== undefined) {
            task.result = opts.result;
        }
        if (this.pipelineMetrics) {
            this.pipelineMetrics.recordTerminal(task, status, {
                cancelReason: opts.cancelReason,
            });
        }
    }
    unfinalizeTask(task) {
        const revertTo = task.humanReview?.previousStatus || 'failed';
        task.status = revertTo;
        task.error = task.humanReview?.previousError;
        task.endTime = undefined;
        task.duration = undefined;
        this.pipelineMetrics?.recordRevert(task.sessionId);
    }
    completeTask(sessionId, result) {
        const task = this.tasks.get(sessionId);
        if (!task || task.status === 'cancelled')
            return;
        const checkResult = result?.checkResult;
        const qScore = (checkResult?.qualityScore ?? result?.finalQualityScore ?? 0);
        const runtimePass = result?.runtimeGate?.status === 'PASS';
        const visualReport = result?.visualComparisonReport;
        const visualRequired = task.target === 'vue3' && !!task.fileKey && !!task.nodeId;
        const visualPass = !visualRequired || visualReport?.pass === true;
        const checkerPass = checkResult?.checkResult !== 'needs_revision';
        const critiques = Array.isArray(checkResult?.critiques) ? checkResult.critiques : [];
        const hasHighCritique = critiques.some((item) => item?.severity === 'high');
        const hasWarnings = (result?.warnings?.length || 0) > 0;
        const QUALITY_GATE_THRESHOLD = parseInt(process.env.QUALITY_GATE_THRESHOLD || '75', 10);
        const qualityGate = runtimePass &&
            visualPass &&
            checkerPass &&
            !hasHighCritique &&
            qScore >= QUALITY_GATE_THRESHOLD &&
            !hasWarnings
            ? 'passed'
            : 'warned';
        task.qualityGate = qualityGate;
        task.visualDegraded = result?._visualDegraded === true;
        task.visualLayoutSource = result?._visualLayoutSource || null;
        task.visualDegradeReason = result?._visualDegradeReason || null;
        task.visualQualityWarning = result?._visualQualityWarning || null;
        task.completionModels = result?._completionModels || null;
        task.degradedScriptParts = Array.isArray(result?.degradedScriptParts) ? result.degradedScriptParts : [];
        task.degradedFiles = Array.isArray(result?.degradedFiles) ? result.degradedFiles : [];
        task.gateSkippedFiles = Array.isArray(result?.gateSkippedFiles) ? result.gateSkippedFiles : [];
        task.result = result;
        this.finalizeTask(task, 'completed', { refreshEndTime: true });
        this.persist();
    }
    failTask(sessionId, error) {
        const task = this.tasks.get(sessionId);
        if (!task || task.status === 'cancelled' || task.status === 'completed')
            return;
        if (error?.lessCompileGate || error?.runtimeGate || error?.codeValidationResult) {
            task.result = {
                ...(task.result || {}),
                ...(error.lessCompileGate ? { lessCompileGate: error.lessCompileGate } : {}),
                ...(error.runtimeGate ? { runtimeGate: error.runtimeGate } : {}),
                ...(error.codeValidationResult ? { codeValidationResult: error.codeValidationResult } : {}),
            };
        }
        this.finalizeTask(task, 'failed', {
            error: error.friendlyMessage || error.message || error,
            refreshEndTime: true,
        });
        this.persist();
    }
    finalizeRecoverFailedTask(sessionId, error) {
        const task = this.tasks.get(sessionId);
        if (!task) {
            this.logger.warn(`[finalizeRecoverFailedTask] 任务不存在，跳过: ${sessionId}`);
            return;
        }
        if (task.status === 'completed' || task.status === 'cancelled') {
            this.logger.debug(`[finalizeRecoverFailedTask] 任务已终态(${task.status})，跳过覆盖: ${sessionId}`);
            return;
        }
        this.logger.warn(`[finalizeRecoverFailedTask] 排队任务恢复失败，标记终态 failed 并持久化: ${sessionId} (${error})`);
        this.finalizeTask(task, 'failed', {
            error,
            refreshEndTime: true,
            preserveExistingError: true,
        });
        this.persist();
    }
    async cancelTask(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task) {
            return { success: false, message: '任务不存在' };
        }
        if (userId && task.userId && task.userId !== userId) {
            return { success: false, message: '无权操作此任务' };
        }
        if (task.status !== 'running' && task.status !== 'paused' && task.status !== 'queued') {
            return {
                success: false,
                message: `无法终止：当前状态为「${task.status}」`,
            };
        }
        const controller = this.abortControllers.get(sessionId);
        if (controller) {
            try {
                controller.abort();
            }
            catch (e) {
                console.warn('[TasksService] AbortController执行失败:', e.message);
            }
        }
        const originalStatus = task.status;
        this.finalizeTask(task, 'cancelled', {
            error: '用户主动终止',
            refreshEndTime: true,
        });
        this.removeAbortController(sessionId);
        this.persist();
        if (originalStatus === 'running' && this.queueService) {
            try {
                await this.queueService.releaseSlot(sessionId);
            }
            catch (err) {
                this.logger.warn(`取消任务释放槽位失败: ${err.message}`);
            }
        }
        if (originalStatus === 'queued' && this.queueService) {
            this.queueService.dequeue(sessionId);
        }
        return { success: true, message: '任务已成功终止' };
    }
    async pauseTask(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task) {
            return { success: false, message: '任务不存在' };
        }
        if (userId && task.userId && task.userId !== userId) {
            return { success: false, message: '无权操作此任务' };
        }
        if (task.status !== 'running') {
            return {
                success: false,
                message: `无法暂停：当前状态为「${task.status}」`,
            };
        }
        task.status = 'paused';
        this.persist();
        if (this.queueService) {
            try {
                await this.queueService.releaseSlot(sessionId);
            }
            catch (err) {
                this.logger.warn(`暂停任务释放槽位失败: ${err.message}`);
            }
        }
        return { success: true, message: '任务已暂停' };
    }
    resumeTask(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task) {
            return { success: false, message: '任务不存在' };
        }
        if (userId && task.userId && task.userId !== userId) {
            return { success: false, message: '无权操作此任务' };
        }
        if (task.status !== 'paused') {
            return {
                success: false,
                message: `无法恢复：当前状态为「${task.status}」`,
            };
        }
        if (this.queueService && !this.queueService.tryReRegister(sessionId)) {
            return {
                success: false,
                message: '当前并发槽位已满，任务保持暂停，请等待其他任务完成后再恢复',
            };
        }
        task.status = 'running';
        this.persist();
        return {
            success: true,
            message: '任务已恢复',
        };
    }
    updateTask(sessionId, updates) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return;
        Object.assign(task, updates);
        this.persist();
    }
    async removeTask(sessionId, userId) {
        return this.removeTaskInternal(sessionId, userId, { deleteComponentRecords: true });
    }
    async removeTasksBatch(sessionIds, userId) {
        const uniqueIds = [...new Set((sessionIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
        const removed = [];
        const failed = [];
        for (const sessionId of uniqueIds) {
            const ok = await this.removeTaskInternal(sessionId, userId, { deleteComponentRecords: true });
            if (ok) {
                removed.push(sessionId);
            }
            else {
                failed.push({ sessionId, reason: '任务不存在或无权操作' });
            }
        }
        return {
            requested: uniqueIds.length,
            removed,
            failed,
        };
    }
    async removeTasksByComponentId(componentId, userId) {
        const matched = Array.from(this.tasks.values())
            .filter((task) => this.getTaskIdentifiers(task).includes(componentId));
        let removed = 0;
        for (const task of matched) {
            const ok = await this.removeTaskInternal(task.sessionId, userId, { deleteComponentRecords: false });
            if (ok)
                removed++;
        }
        return removed;
    }
    async removeTaskInternal(sessionId, userId, options = { deleteComponentRecords: true }) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return false;
        if (userId && task.userId && task.userId !== userId)
            return false;
        if (task.status === 'running' || task.status === 'paused') {
            const controller = this.abortControllers.get(sessionId);
            try {
                controller?.abort();
            }
            catch (err) {
                console.warn(`[TasksService] 删除任务时终止执行失败: ${sessionId}`, err);
            }
            this.removeAbortController(sessionId);
        }
        if (this.queueService) {
            if (task.status === 'queued' || task.status === 'rate_limited' || task.status === 'retry_scheduled') {
                this.queueService.dequeue(sessionId);
            }
            this.queueService.unregisterExecuteFn(sessionId);
        }
        try {
            this.cleanupTaskArtifacts(task);
        }
        catch (err) {
            console.warn(`[TasksService] 清理任务文件失败: ${sessionId}`, err);
        }
        if (options.deleteComponentRecords) {
            try {
                await this.deleteComponentRecordsForTask(task, userId);
            }
            catch (err) {
                console.warn(`[TasksService] 清理任务关联组件记录失败: ${sessionId}`, err);
            }
        }
        if (task.parentId) {
            const parent = this.tasks.get(task.parentId);
            if (parent?.childIds) {
                parent.childIds = parent.childIds.filter((id) => id !== sessionId);
            }
        }
        if (task.childIds?.length) {
            for (const childId of [...task.childIds]) {
                await this.removeTaskInternal(childId, userId, { deleteComponentRecords: options.deleteComponentRecords });
            }
        }
        const deleted = this.tasks.delete(sessionId);
        if (deleted) {
            this.pendingDeletedIds.add(sessionId);
            this.persist();
        }
        return deleted;
    }
    getTaskIdentifiers(task) {
        return [...new Set([
                task.sessionId,
                task.componentId,
                task.result?.componentId,
                task.result?.sessionId,
            ].filter(Boolean).map(String))];
    }
    getComponentRecordIdentifiers(component) {
        return [...new Set([
                component.componentId,
                component.taskId,
                component.metadata?.componentId,
                component.metadata?.sessionId,
                component.metadata?.taskId,
            ].filter(Boolean).map(String))];
    }
    cleanupTaskArtifacts(task) {
        const target = task.target || 'microcode';
        const ids = this.getTaskIdentifiers(task);
        const paths = new Set();
        for (const id of ids) {
            for (const tempRoot of this.getTempRoots()) {
                paths.add((0, path_1.join)(tempRoot, id));
                if (task.groupId)
                    paths.add((0, path_1.join)(tempRoot, task.groupId, id));
            }
        }
        if (task.outputPath && this.isAllowedGeneratedPath(task.outputPath)) {
            paths.add(task.outputPath);
        }
        if (target === 'vue3' && task.groupId) {
            for (const id of ids) {
                paths.add((0, path_1.join)(backend_root_1.vue3ComponentsDir, task.groupId, id));
                paths.add((0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', task.groupId, id));
            }
        }
        else {
            for (const id of ids) {
                paths.add((0, path_1.join)(backend_root_1.customComponentsDir, id));
                paths.add((0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', id));
            }
        }
        return this.removeGeneratedPaths([...paths]);
    }
    cleanupComponentArtifacts(component) {
        const target = component.target || component.metadata?.target ||
            (component.metadata?.type === 'vue3' ? 'vue3' : 'microcode');
        const groupId = component.groupId?.toString() || component.metadata?.groupId;
        const ids = this.getComponentRecordIdentifiers(component);
        const paths = new Set();
        if (target === 'vue3' && groupId) {
            for (const id of ids) {
                paths.add((0, path_1.join)(backend_root_1.vue3ComponentsDir, groupId, id));
                paths.add((0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, id));
            }
        }
        else {
            for (const id of ids) {
                paths.add((0, path_1.join)(backend_root_1.customComponentsDir, id));
                paths.add((0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', id));
            }
        }
        return this.removeGeneratedPaths([...paths]);
    }
    removeGeneratedPaths(paths) {
        let removed = 0;
        const allowedRoots = [
            ...this.getTempRoots(),
            backend_root_1.workspaceRoot,
            (0, workspace_config_1.resolveFrontendWorkspace)(),
        ].map((root) => `${(0, path_1.resolve)(root)}${path_1.sep}`);
        for (const rawPath of [...new Set(paths)]) {
            const normalized = `${(0, path_1.resolve)(rawPath)}${path_1.sep}`;
            if (!allowedRoots.some((root) => normalized.startsWith(root)))
                continue;
            if (!(0, fs_1.existsSync)(rawPath))
                continue;
            (0, fs_1.rmSync)(rawPath, { recursive: true, force: true });
            removed++;
        }
        return removed;
    }
    isAllowedGeneratedPath(rawPath) {
        const normalized = `${(0, path_1.resolve)(rawPath)}${path_1.sep}`;
        return [
            ...this.getTempRoots(),
            backend_root_1.workspaceRoot,
            (0, workspace_config_1.resolveFrontendWorkspace)(),
        ].map((root) => `${(0, path_1.resolve)(root)}${path_1.sep}`).some((root) => normalized.startsWith(root));
    }
    async deleteComponentRecordsForTask(task, userId) {
        const identifiers = this.getTaskIdentifiers(task);
        const filter = {
            $or: [
                { componentId: { $in: identifiers } },
                { taskId: { $in: identifiers } },
                { 'metadata.componentId': { $in: identifiers } },
                { 'metadata.sessionId': { $in: identifiers } },
                { 'metadata.taskId': { $in: identifiers } },
            ],
        };
        if (userId && mongoose_2.Types.ObjectId.isValid(userId)) {
            filter.creatorId = new mongoose_2.Types.ObjectId(userId);
        }
        else if (userId) {
            filter.creatorId = userId;
        }
        if (!this.componentModel)
            return 0;
        const result = await this.componentModel.deleteMany(filter);
        return result.deletedCount || 0;
    }
    async removeComponentCascade(componentId, userId) {
        if (!this.componentModel)
            return { deletedTasks: 0, deletedFiles: 0 };
        const component = mongoose_2.Types.ObjectId.isValid(componentId)
            ? await this.componentModel.findById(componentId)
            : await this.componentModel.findOne({
                $or: [
                    { componentId },
                    { taskId: componentId },
                    { 'metadata.componentId': componentId },
                    { 'metadata.sessionId': componentId },
                ],
            });
        if (!component)
            return { deletedTasks: 0, deletedFiles: 0 };
        const ids = this.getComponentRecordIdentifiers(component);
        const deletedFiles = this.cleanupComponentArtifacts(component);
        let deletedTasks = 0;
        for (const id of ids) {
            deletedTasks += await this.removeTasksByComponentId(id, userId);
        }
        return { deletedTasks, deletedFiles };
    }
    async cleanupOrphans(userId) {
        if (!this.componentModel) {
            return { orphanComponents: 0, orphanTasks: 0, deletedFiles: 0 };
        }
        const componentFilter = {};
        if (userId && mongoose_2.Types.ObjectId.isValid(userId)) {
            componentFilter.creatorId = new mongoose_2.Types.ObjectId(userId);
        }
        else if (userId) {
            componentFilter.creatorId = userId;
        }
        const components = await this.componentModel.find(componentFilter);
        const activeTaskIds = new Set();
        for (const task of this.tasks.values()) {
            for (const id of this.getTaskIdentifiers(task))
                activeTaskIds.add(id);
        }
        let orphanComponents = 0;
        let orphanTasks = 0;
        let deletedFiles = 0;
        for (const component of components) {
            const ids = this.getComponentRecordIdentifiers(component);
            if (ids.length === 0 || ids.some((id) => activeTaskIds.has(id)))
                continue;
            deletedFiles += this.cleanupComponentArtifacts(component);
            await this.componentModel.findByIdAndDelete(component._id);
            orphanComponents++;
        }
        const componentIds = new Set();
        const remainingComponents = await this.componentModel.find(componentFilter);
        for (const component of remainingComponents) {
            for (const id of this.getComponentRecordIdentifiers(component))
                componentIds.add(id);
        }
        for (const task of Array.from(this.tasks.values())) {
            if (task.status === 'running' || task.status === 'paused')
                continue;
            if (userId && task.userId && task.userId !== userId)
                continue;
            const ids = this.getTaskIdentifiers(task);
            if (ids.some((id) => componentIds.has(id)))
                continue;
            deletedFiles += this.cleanupTaskArtifacts(task);
            this.pendingDeletedIds.add(task.sessionId);
            this.tasks.delete(task.sessionId);
            orphanTasks++;
        }
        if (orphanTasks > 0)
            this.persist();
        return { orphanComponents, orphanTasks, deletedFiles };
    }
    removeExpiredTasks(userId) {
        let removed = 0;
        for (const [sessionId, task] of this.tasks) {
            if (task.status !== 'running') {
                if (userId && task.userId && task.userId !== userId)
                    continue;
                this.pendingDeletedIds.add(sessionId);
                this.tasks.delete(sessionId);
                removed++;
            }
        }
        if (removed > 0)
            this.persist();
        return { removed, remaining: this.tasks.size };
    }
    registerAbortController(sessionId, controller) {
        this.abortControllers.set(sessionId, controller);
    }
    removeAbortController(sessionId) {
        this.abortControllers.delete(sessionId);
    }
    async speedPassTask(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task) {
            return { success: false, message: '任务不存在' };
        }
        if (userId && task.userId && task.userId !== userId) {
            return { success: false, message: '无权操作此任务' };
        }
        if (task.status !== 'running' && task.status !== 'paused') {
            return {
                success: false,
                message: `无法极速通过：当前状态为「${task.status}」`,
            };
        }
        const skippedStages = [
            'code-structure-validator',
            'parallel-refine',
            'refine-feedback',
            'adversarial-checker',
            'revision-decision',
        ];
        task.userApproved = true;
        task.approval = {
            by: 'user',
            type: 'speed-pass',
            skippedStages,
            at: Date.now(),
        };
        const controller = this.abortControllers.get(sessionId);
        if (controller) {
            try {
                controller.abort();
            }
            catch (e) {
                this.logger.warn(`[TasksService] 极速通过 abort 失败: ${e?.message}`);
            }
        }
        this.removeAbortController(sessionId);
        const ProgressSvc = require('../progress/progress.service').ProgressService;
        const progressService = this.moduleRef?.get(ProgressSvc, { strict: false });
        if (progressService) {
            await progressService.sendComplete(sessionId, {
                success: true,
                completedBy: 'user',
                userApproved: true,
                approvalType: 'speed-pass',
                skippedStages,
                outputPath: task.outputPath,
                target: task.target,
                taskId: sessionId,
                componentId: sessionId,
                groupId: task.groupId,
            });
        }
        task.userApproved = true;
        task.approval = {
            by: 'user',
            type: 'speed-pass',
            skippedStages,
            at: task.approval?.at || Date.now(),
        };
        this.persist();
        return { success: true, message: '已极速通过，跳过剩余阶段', skippedStages };
    }
    async lockTask(sessionId, userId, revision) {
        const task = this.tasks.get(sessionId);
        if (!task) {
            return { success: false, message: '任务不存在' };
        }
        if (userId && task.userId && task.userId !== userId) {
            return { success: false, message: '无权操作此任务' };
        }
        if (task.status !== 'running' && task.status !== 'paused') {
            return {
                success: false,
                message: `无法锁定：当前状态为「${task.status}」`,
            };
        }
        let publishMsg = '';
        let lockedRevision = '';
        try {
            const { TaskCodeSnapshotService } = require('./task-code-snapshot.service');
            const snapshotSvc = this.moduleRef?.get(TaskCodeSnapshotService, { strict: false });
            const fromSnapshot = snapshotSvc?.resolvePublishSourceDir?.(sessionId);
            if (fromSnapshot) {
                const stagedDir = (0, path_1.join)((0, os_1.tmpdir)(), `mvgo-lock-${sessionId}-${Date.now()}`);
                (0, fs_1.cpSync)(fromSnapshot.dir, stagedDir, { recursive: true });
                const phase2Service = global.__phase2ServiceInstance;
                if (phase2Service) {
                    await phase2Service.copyToWorkspace(stagedDir, task.componentId, task.target || 'microcode', task.groupId || 'default-group');
                    lockedRevision = fromSnapshot.revision;
                    publishMsg = `（来源：代码快照 ${fromSnapshot.revision}）`;
                }
                else {
                    this.logger.warn('[lockTask] Phase2Service 实例未注册，无法发布到 workspace');
                }
                try {
                    (0, fs_1.rmSync)(stagedDir, { recursive: true, force: true });
                }
                catch (e) {
                    this.logger.warn(`[lockTask] 清理临时发布目录失败（非致命）：${e?.message || e}`);
                }
            }
            else {
                this.logger.warn('[lockTask] 未找到可用代码快照，仅标记锁定不强制发布');
            }
        }
        catch (err) {
            this.logger.warn(`[lockTask] 发布快照失败（非致命）：${err?.message || err}`);
        }
        (0, session_lock_registry_js_1.markSessionLocked)(sessionId);
        task.userApproved = true;
        task.approval = {
            by: 'user',
            type: 'lock-satisfied',
            revision: lockedRevision || revision || null,
            at: Date.now(),
        };
        const controller = this.abortControllers.get(sessionId);
        if (controller) {
            try {
                controller.abort();
            }
            catch (e) {
                this.logger.warn(`[lockTask] abort 失败: ${e?.message}`);
            }
        }
        this.removeAbortController(sessionId);
        const ProgressSvc = require('../progress/progress.service').ProgressService;
        const progressService = this.moduleRef?.get(ProgressSvc, { strict: false });
        if (progressService) {
            await progressService.sendComplete(sessionId, {
                success: true,
                completedBy: 'user',
                userApproved: true,
                approvalType: 'lock-satisfied',
                skippedStages: [],
                outputPath: task.outputPath,
                target: task.target,
                taskId: sessionId,
                componentId: sessionId,
                groupId: task.groupId,
            });
        }
        task.userApproved = true;
        this.persist();
        return {
            success: true,
            message: `已锁定当前版本并发布到 workspace${publishMsg}`,
            revision: lockedRevision || revision || null,
        };
    }
    getRetryMetadata(sessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return null;
        if (userId && task.userId && task.userId !== userId)
            return null;
        if (task.status !== 'failed' && task.status !== 'cancelled') {
            return { error: `任务状态为「${task.status}」，无法重试（仅失败/已取消任务可重试）` };
        }
        return {
            sessionId: task.sessionId,
            componentId: task.componentId,
            groupId: task.groupId,
            fileKey: task.fileKey,
            nodeId: task.nodeId,
            componentName: task.componentName,
            target: task.target,
            panelKey: task.panelKey,
            taskType: task.taskType,
            parentId: task.parentId,
            outputPath: task.outputPath || task.result?.outputPath || null,
            lastCompletedStage: task.lastCompletedStage || task.result?.lastCompletedStage || null,
            checkpointStatus: task.checkpointStatus || 'none',
            extraPrompt: task.extraPrompt,
            requirementDocText: task.requirementDocText,
            userComponentId: task.userComponentId,
            originalError: task.error,
            originalDuration: task.duration,
        };
    }
    createRetryTask(sessionId, retrySessionId, userId) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return null;
        if (userId && task.userId && task.userId !== userId)
            return null;
        const retryTask = {
            sessionId: retrySessionId,
            configSnapshot: task.configSnapshot ? (0, redact_1.redactSecrets)(task.configSnapshot) : undefined,
            componentId: task.componentId,
            groupId: task.groupId,
            status: 'running',
            startTime: Date.now(),
            progress: [],
            progressCount: 0,
            result: null,
            error: undefined,
            buffer: [],
            componentName: task.componentName,
            nodeId: task.nodeId,
            fileKey: task.fileKey,
            target: task.target || 'microcode',
            outputPath: task.outputPath,
            lastCompletedStage: task.lastCompletedStage,
            checkpointStatus: task.checkpointStatus || 'none',
            panelKey: task.panelKey || 'default-panel',
            taskType: task.taskType || 'component',
            parentId: task.parentId,
            childIds: [],
            userId: userId || task.userId,
        };
        this.tasks.set(retrySessionId, retryTask);
        this.persist();
        return retryTask;
    }
    async retryWithResume(sessionId, userId, config) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return { success: false, error: '任务不存在或无权访问' };
        if (userId && task.userId && task.userId !== userId) {
            return { success: false, error: '无权访问此任务' };
        }
        if (task.status !== 'failed' && task.status !== 'cancelled') {
            return { success: false, error: `任务状态为「${task.status}」，无法重试（仅失败/已取消任务可重试）` };
        }
        const outputPath = task.outputPath || this._findOutputPathFromTemp(task);
        if (outputPath) {
            try {
                const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
                const cp = loadCheckpoint(outputPath);
                if (cp.stage === 'figma-cached' || cp.stage === 'full') {
                    const phase2Service = global.__phase2ServiceInstance;
                    if (!phase2Service) {
                        return { success: false, error: '生成服务未就绪，无法续跑' };
                    }
                    const failureGuidance = this.buildFailureGuidance(task.error);
                    if (failureGuidance) {
                        this.logger.log(`[retryWithResume] P1-3 注入上轮失败指导: ${sessionId}`);
                    }
                    const resumeResult = await phase2Service.resumeFromCheckpoint(sessionId, {
                        componentName: task.componentName || task.sessionId,
                        fileKey: task.fileKey,
                        nodeId: task.nodeId,
                        outputPath,
                        groupId: task.groupId || '',
                        userId: task.userId || userId,
                        panelType: task.panelKey || 'default-panel',
                        target: task.target || 'microcode',
                        failureGuidance,
                    });
                    if (resumeResult.success) {
                        this.updateTask(sessionId, { status: 'running', error: undefined });
                        return {
                            success: true,
                            resumed: true,
                            stage: cp.stage,
                            message: cp.stage === 'full'
                                ? '已复用缓存续跑（跳过 Figma/视觉分析，从代码生成继续）'
                                : '已复用设计稿缓存续跑（换模型重跑视觉分析）',
                        };
                    }
                    return { success: false, error: resumeResult.error || '断点续跑启动失败' };
                }
            }
            catch (err) {
                this.logger.warn(`[retryWithResume] checkpoint 检测失败: ${err.message}`);
            }
        }
        const meta = this.getRetryMetadata(sessionId, userId);
        return {
            success: true,
            resumed: false,
            meta,
            message: '未检测到可复用缓存，请重新发起生成',
        };
    }
    buildFailureGuidance(error) {
        if (!error || typeof error !== 'string' || error.trim().length === 0)
            return undefined;
        const lines = [];
        const unusedRes = [...error.matchAll(/(?:背景|图标|图片)资源\s+(\w+)\s*[（(]/g)].map((m) => m[1]);
        if (/资源未使用/.test(error) && unusedRes.length > 0) {
            const uniq = [...new Set(unusedRes)];
            lines.push(`- 上轮有 ${uniq.length} 个资源未被引用（${uniq.join('、')}）：这些 bg/icon 变量必须在对应区域容器的 :style（backgroundImage）或 <img :src> 中真实使用，禁止只声明不引用。`);
        }
        const undefinedVars = [...error.matchAll(/variable\s+(@[\w-]+)\s+is\s+undefined/g)].map((m) => m[1]);
        if (undefinedVars.length > 0) {
            const uniq = [...new Set(undefinedVars)];
            lines.push(`- 上轮子组件引用了未定义的 less 变量（${uniq.join('、')}）：本轮 theme-vars.less 必须定义这些变量，或子组件不得引用它们。`);
        }
        if (lines.length === 0)
            return undefined;
        return `\n\n# 🟡 上轮任务失败指导（任务级重试注入，本轮务必修正）\n\n${lines.join('\n')}\n`;
    }
    hasVue3Artifacts(task) {
        if ((task.target || 'microcode') !== 'vue3')
            return false;
        const candidates = [];
        const componentId = task.componentId || task.sessionId;
        if (task.groupId) {
            candidates.push((0, path_1.join)(backend_root_1.vue3ComponentsDir, task.groupId, componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', task.groupId, componentId));
        }
        if (task.outputPath) {
            const allowedRoots = [
                ...this.getTempRoots(),
                backend_root_1.workspaceRoot,
                (0, workspace_config_1.resolveFrontendWorkspace)(),
            ].map((root) => `${(0, path_1.resolve)(root)}${path_1.sep}`);
            const normalizedOutputPath = `${(0, path_1.resolve)(task.outputPath)}${path_1.sep}`;
            if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
                candidates.push(task.outputPath);
            }
        }
        for (const baseTemp of this.getTempRoots()) {
            const groupIds = task.groupId
                ? [task.groupId]
                : (0, fs_1.readdirSync)(baseTemp, { withFileTypes: true })
                    .filter((entry) => entry.isDirectory())
                    .map((entry) => entry.name);
            for (const groupId of groupIds) {
                const tempDir = this.findTempComponentDirSync(baseTemp, groupId, componentId);
                if (tempDir)
                    candidates.push(tempDir);
            }
        }
        return candidates.some((candidate) => this.hasVue3EntryFile(candidate));
    }
    hasVue3EntryFile(componentDir) {
        if (!componentDir || !(0, fs_1.existsSync)(componentDir) || !(0, fs_1.statSync)(componentDir).isDirectory()) {
            return false;
        }
        return (0, fs_1.existsSync)((0, path_1.join)(componentDir, 'package', 'index.vue')) &&
            (0, fs_1.statSync)((0, path_1.join)(componentDir, 'package', 'index.vue')).isFile();
    }
    hasTaskArtifacts(task) {
        const target = task.target || 'microcode';
        if (target === 'vue3')
            return this.hasVue3Artifacts(task) || this.hasPartialSnapshotArtifacts(task);
        if (target === 'microcode')
            return this.hasMicrocodeArtifacts(task) || this.hasPartialMicrocodeArtifacts(task) || this.hasPartialSnapshotArtifacts(task);
        return this.hasPartialSnapshotArtifacts(task);
    }
    hasPartialMicrocodeArtifacts(task) {
        const componentId = task.componentId || task.sessionId;
        const candidates = [
            (0, path_1.join)(backend_root_1.customComponentsDir, componentId),
            (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', componentId),
        ];
        if (task.outputPath) {
            const allowedRoots = [
                ...this.getTempRoots(),
                backend_root_1.workspaceRoot,
                (0, workspace_config_1.resolveFrontendWorkspace)(),
            ].map((root) => `${(0, path_1.resolve)(root)}${path_1.sep}`);
            const normalizedOutputPath = `${(0, path_1.resolve)(task.outputPath)}${path_1.sep}`;
            if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
                candidates.push(task.outputPath);
            }
        }
        return candidates.some((candidate) => this.hasPartialMicrocodeEntry(candidate));
    }
    hasPartialMicrocodeEntry(componentDir) {
        if (!componentDir || !(0, fs_1.existsSync)(componentDir) || !(0, fs_1.statSync)(componentDir).isDirectory())
            return false;
        if (!((0, fs_1.existsSync)((0, path_1.join)(componentDir, 'declare.json')) && (0, fs_1.statSync)((0, path_1.join)(componentDir, 'declare.json')).isFile()))
            return false;
        const walk = (dir) => {
            let entries;
            try {
                entries = (0, fs_1.readdirSync)(dir, { withFileTypes: true });
            }
            catch {
                return false;
            }
            for (const e of entries) {
                const p = (0, path_1.join)(dir, e.name);
                if (e.isDirectory()) {
                    if (walk(p))
                        return true;
                }
                else if (e.isFile() && e.name.endsWith('.vue'))
                    return true;
            }
            return false;
        };
        return walk(componentDir);
    }
    getArtifactReadyLevel(task) {
        const target = task.target || 'microcode';
        if (target === 'vue3') {
            return this.hasVue3Artifacts(task) ? 'full' : (this.hasPartialSnapshotArtifacts(task) ? 'partial' : false);
        }
        if (this.hasMicrocodeArtifacts(task))
            return 'full';
        if (this.hasPartialMicrocodeArtifacts(task))
            return 'partial';
        if (this.hasPartialSnapshotArtifacts(task))
            return 'partial';
        return false;
    }
    getMissingEntryFiles(task) {
        if (this.getArtifactReadyLevel(task) !== 'partial')
            return [];
        const componentId = task.componentId || task.sessionId;
        const candidates = [
            (0, path_1.join)(backend_root_1.customComponentsDir, componentId),
            (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', componentId),
        ];
        if (task.outputPath)
            candidates.push(task.outputPath);
        for (const c of candidates) {
            if (c && (0, fs_1.existsSync)((0, path_1.join)(c, 'package', 'index.vue')))
                return [];
        }
        return ['package/index.vue'];
    }
    hasPartialSnapshotArtifacts(task) {
        const sessionId = task.sessionId;
        if (!sessionId || !this.moduleRef)
            return false;
        try {
            const { TaskCodeSnapshotService } = require('./task-code-snapshot.service');
            const snapshotSvc = this.moduleRef.get(TaskCodeSnapshotService, { strict: false });
            const partial = snapshotSvc?.getPartialManifest?.(sessionId);
            if (!partial)
                return false;
            const paths = new Set((partial.files || []).map((f) => f.path));
            return paths.has('declare.json') && paths.has('package/index.vue');
        }
        catch {
            return false;
        }
    }
    getPartialMissingFiles(task) {
        const sessionId = task.sessionId;
        if (!sessionId || !this.moduleRef)
            return [];
        try {
            const { TaskCodeSnapshotService } = require('./task-code-snapshot.service');
            const snapshotSvc = this.moduleRef.get(TaskCodeSnapshotService, { strict: false });
            const partial = snapshotSvc?.getPartialManifest?.(sessionId);
            if (!partial || partial.status !== 'partial')
                return [];
            return Array.isArray(partial.missingFiles) ? partial.missingFiles : [];
        }
        catch {
            return [];
        }
    }
    hasMicrocodeArtifacts(task) {
        const componentId = task.componentId || task.sessionId;
        const candidates = [];
        candidates.push((0, path_1.join)(backend_root_1.customComponentsDir, componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', componentId));
        if (task.outputPath) {
            const allowedRoots = [
                ...this.getTempRoots(),
                backend_root_1.workspaceRoot,
                (0, workspace_config_1.resolveFrontendWorkspace)(),
            ].map((root) => `${(0, path_1.resolve)(root)}${path_1.sep}`);
            const normalizedOutputPath = `${(0, path_1.resolve)(task.outputPath)}${path_1.sep}`;
            if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
                candidates.push(task.outputPath);
            }
        }
        return candidates.some((candidate) => this.hasMicrocodeEntryFile(candidate));
    }
    hasMicrocodeEntryFile(componentDir) {
        if (!componentDir || !(0, fs_1.existsSync)(componentDir) || !(0, fs_1.statSync)(componentDir).isDirectory()) {
            return false;
        }
        return [
            (0, path_1.join)(componentDir, 'declare.json'),
            (0, path_1.join)(componentDir, 'package', 'index.vue'),
        ].every((entry) => (0, fs_1.existsSync)(entry) && (0, fs_1.statSync)(entry).isFile());
    }
    submitHumanReview(params) {
        const { sessionId, userId, overrideStatus, reviewerName, comment } = params;
        const task = this.tasks.get(sessionId);
        if (!task) {
            return { success: false, message: '任务不存在' };
        }
        if (!task.userId || task.userId !== userId) {
            return { success: false, message: '仅任务创建者可进行人工审核' };
        }
        const supportedTargets = ['vue3', 'microcode'];
        if (!supportedTargets.includes(task.target || 'microcode')) {
            return { success: false, message: '仅 Vue3 组件或微码组件任务支持人工审核' };
        }
        if (task.status !== 'failed') {
            return { success: false, message: `当前状态为「${task.status}」，仅失败任务可审核` };
        }
        if (!this.hasTaskArtifacts(task)) {
            return { success: false, message: '未检测到组件产物，无法审核通过' };
        }
        const partialMissing = this.getPartialMissingFiles(task);
        task.humanReview = {
            reviewedBy: userId,
            reviewedByName: reviewerName || userId,
            reviewedAt: Date.now(),
            overrideStatus,
            reason: comment || undefined,
            previousStatus: 'failed',
            previousError: task.error,
            action: 'pass',
            partialIncomplete: partialMissing.length > 0,
            missingFiles: partialMissing.length > 0 ? partialMissing : undefined,
        };
        this.finalizeTask(task, 'completed');
        this.persist();
        return {
            success: true,
            message: '人工审核通过',
            review: task.humanReview,
        };
    }
    revokeHumanReview(params) {
        const { sessionId, userId, reviewerName } = params;
        const task = this.tasks.get(sessionId);
        if (!task) {
            return { success: false, message: '任务不存在' };
        }
        if (!task.userId || task.userId !== userId) {
            return { success: false, message: '仅任务创建者可撤回审核' };
        }
        if (!task.humanReview) {
            return { success: false, message: '该任务无人工审核记录' };
        }
        if (task.humanReview.action === 'revoke') {
            return { success: false, message: '该审核已被撤回，无需重复操作' };
        }
        this.unfinalizeTask(task);
        task.humanReview.action = 'revoke';
        task.humanReview.revokedAt = Date.now();
        task.humanReview.revokedBy = reviewerName || userId;
        this.persist();
        return { success: true, message: '已撤回人工审核，任务还原为失败状态' };
    }
    getReviewableTasks(userId) {
        const result = [];
        const supportedTargets = ['vue3', 'microcode'];
        for (const task of this.tasks.values()) {
            if (task.userId !== userId)
                continue;
            if (!supportedTargets.includes(task.target || 'microcode'))
                continue;
            if (task.status !== 'failed')
                continue;
            const reviewable = this.hasTaskArtifacts(task);
            result.push({ ...task, reviewable });
        }
        return result.sort((a, b) => b.startTime - a.startTime);
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = TasksService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(component_schema_1.Component.name)),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => task_queue_service_1.TaskQueueService))),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [mongoose_2.Model,
        task_queue_service_1.TaskQueueService,
        core_1.ModuleRef,
        pipeline_metrics_service_1.PipelineMetricsService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map