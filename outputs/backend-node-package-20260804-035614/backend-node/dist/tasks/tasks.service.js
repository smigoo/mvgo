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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const fs_1 = require("fs");
const path_1 = require("path");
const workspace_config_1 = require("../config/workspace.config");
const component_schema_1 = require("../schemas/component.schema");
const { ZipArchive } = require('archiver');
const MAX_IN_MEMORY = 500;
const MAX_PERSISTED = 2000;
const ZOMBIE_TIMEOUT = 2 * 60 * 60 * 1000;
let TasksService = class TasksService {
    componentModel;
    tasks = new Map();
    abortControllers = new Map();
    persistFile;
    persistInFlight = null;
    persistAgain = false;
    constructor(componentModel) {
        this.componentModel = componentModel;
        this.persistFile = (0, path_1.join)(process.cwd(), 'data/tasks.json');
        this.load();
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
    async load() {
        try {
            if (!(0, fs_1.existsSync)(this.persistFile)) {
                if ((0, fs_1.existsSync)(this.persistFile + '.tmp')) {
                    await fs_1.promises.rename(this.persistFile + '.tmp', this.persistFile);
                }
                else {
                    return;
                }
            }
            const raw = await fs_1.promises.readFile(this.persistFile, 'utf-8');
            if (!raw || raw.trim() === '') {
                if ((0, fs_1.existsSync)(this.persistFile + '.tmp')) {
                    const tmpRaw = await fs_1.promises.readFile(this.persistFile + '.tmp', 'utf-8');
                    if (tmpRaw && tmpRaw.trim()) {
                        await fs_1.promises.rename(this.persistFile + '.tmp', this.persistFile);
                        return this.load();
                    }
                }
                return;
            }
            const list = JSON.parse(raw);
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
                if (!task.panelKey)
                    task.panelKey = 'default-panel';
                this.tasks.set(task.sessionId, task);
            }
            console.log(`[TasksService] 已恢复 ${list.length} 个历史任务`);
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
                    task.status = 'failed';
                    task.error = '服务重启导致任务中断，请重新发起生成';
                    task.endTime = Date.now();
                    zombieCount++;
                }
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
                    if (!(0, fs_1.existsSync)((0, path_1.join)(packageDir, 'index.vue')))
                        continue;
                    await this.restoreWorkspaceArtifacts(task, componentDir, packageDir, groupId);
                    task.groupId = groupId;
                    task.status = 'completed';
                    task.endTime = Date.now();
                    task.duration = task.endTime - task.startTime;
                    task.error = undefined;
                    if (!task.result)
                        task.result = {};
                    task.result.componentId = task.componentId;
                    task.result.groupId = groupId;
                    task.result.target = task.target;
                    task.result.recovered = true;
                    task.result.message = '服务重启后自动恢复：代码已在重启前生成完毕，已补完 workspace 同步';
                    console.log(`[TasksService] ✅ 断点恢复成功: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`);
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
        return {
            success: false,
            error: '无法恢复：未找到已生成的代码（temp-components 和 workspace 均无），请使用「重新生成」',
        };
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
                    if (!(0, fs_1.existsSync)((0, path_1.join)(packageDir, 'index.vue')))
                        continue;
                    this.restoreWorkspaceArtifactsSync(task, componentDir, packageDir, groupId);
                    task.groupId = groupId;
                    task.status = 'completed';
                    task.endTime = Date.now();
                    task.duration = task.endTime - task.startTime;
                    task.error = undefined;
                    if (!task.result)
                        task.result = {};
                    task.result.componentId = task.componentId;
                    task.result.groupId = groupId;
                    task.result.target = task.target;
                    task.result.recovered = true;
                    task.result.message = '手动恢复：代码已在重启前生成完毕，已补完 workspace 同步';
                    console.log(`[TasksService] ✅ 手动恢复成功: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`);
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
                ? (0, path_1.join)(process.cwd(), 'workspace', 'vue3-components')
                : (0, path_1.join)(process.cwd(), 'workspace', 'custom-components');
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
                const content = (0, fs_1.readFileSync)(wsIndex, 'utf8');
                if (content.includes('<template') && content.length > 200) {
                    task.groupId = groupId || task.groupId;
                    task.status = 'completed';
                    task.endTime = Date.now();
                    task.duration = task.endTime - task.startTime;
                    task.error = undefined;
                    if (!task.result)
                        task.result = {};
                    task.result.componentId = task.componentId;
                    task.result.groupId = task.groupId;
                    task.result.target = task.target;
                    task.result.recovered = true;
                    task.result.message = '从 workspace 恢复：代码已存在于 workspace（temp-components 已清理）';
                    const frontendWs = isVue3
                        ? (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, task.componentId)
                        : (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', task.componentId);
                    if (!(0, fs_1.existsSync)(frontendWs)) {
                        (0, fs_1.mkdirSync)(frontendWs, { recursive: true });
                        (0, fs_1.cpSync)(componentBase, frontendWs, { recursive: true });
                    }
                    console.log(`[TasksService] ✅ 从 workspace 恢复成功: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`);
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
    getTempRoots() {
        return [
            (0, path_1.join)(process.cwd(), '..', 'temp-components'),
            (0, path_1.join)(process.cwd(), 'temp-components'),
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
                (0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', groupId, task.componentId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, task.componentId),
            ]
            : [
                (0, path_1.join)(process.cwd(), 'workspace', 'custom-components', task.componentId),
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
                (0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', groupId, task.componentId),
                (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, task.componentId),
            ]
            : [
                (0, path_1.join)(process.cwd(), 'workspace', 'custom-components', task.componentId),
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
    redactSecrets(value) {
        if (Array.isArray(value))
            return value.map((v) => this.redactSecrets(v));
        if (value && typeof value === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(value)) {
                if (/(figmaToken|apiKey|api_key|password|secret|token|authorization|access[_-]?token)/i.test(k) && typeof v === 'string') {
                    out[k] = '***REDACTED***';
                }
                else {
                    out[k] = this.redactSecrets(v);
                }
            }
            return out;
        }
        return value;
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
                .map((task) => this.redactSecrets({
                ...task,
                progress: (task.progress || []).slice(-200),
                buffer: [],
            }));
            const dir = (0, path_1.join)(this.persistFile, '..');
            if (!(0, fs_1.existsSync)(dir)) {
                await fs_1.promises.mkdir(dir, { recursive: true });
            }
            const tmpFile = `${this.persistFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
            await fs_1.promises.writeFile(tmpFile, JSON.stringify(list, null, 2), 'utf-8');
            await fs_1.promises.rename(tmpFile, this.persistFile);
        }
        catch (err) {
            console.warn('[TasksService] 持久化任务失败:', err.message);
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
                    task.status = 'failed';
                    task.error = '任务超时（服务可能已重启）';
                    task.endTime = now;
                    needsPersist = true;
                }
            }
        }
        const completed = Array.from(this.tasks.entries())
            .filter(([, t]) => t.status !== 'running' && t.status !== 'paused')
            .sort((a, b) => a[1].startTime - b[1].startTime);
        if (completed.length > MAX_IN_MEMORY) {
            const removeCount = completed.length - MAX_IN_MEMORY;
            for (let i = 0; i < removeCount; i++) {
                this.tasks.delete(completed[i][0]);
            }
            needsPersist = true;
        }
        if (needsPersist) {
            this.persist();
        }
    }
    createTask(sessionId, metadata = {}) {
        const task = {
            sessionId,
            configSnapshot: metadata.configSnapshot ? this.redactSecrets(metadata.configSnapshot) : undefined,
            componentId: metadata.componentId || sessionId,
            groupId: metadata.groupId,
            status: 'running',
            startTime: Date.now(),
            progress: [],
            progressCount: 0,
            result: null,
            error: undefined,
            buffer: [],
            componentName: metadata.componentName || '',
            nodeId: metadata.nodeId || '',
            fileKey: metadata.fileKey || '',
            target: metadata.target || 'microcode',
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
            candidates.push((0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', task.groupId, task.componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', task.groupId, task.componentId));
        }
        else {
            candidates.push((0, path_1.join)(process.cwd(), 'workspace', 'custom-components', task.componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', task.componentId));
        }
        if (task.outputPath) {
            const allowedRoots = [
                ...this.getTempRoots(),
                (0, path_1.join)(process.cwd(), 'workspace'),
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
            archive.directory(sourceDir, task.componentId);
            archive.finalize();
        });
        return { buffer, filename: `${task.componentId}-failed-code.zip` };
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
                error: task.error,
                progress: task.progress,
                result: task.result,
                fileKey: task.fileKey,
                nodeId: task.nodeId,
                target: task.target,
                panelKey: task.panelKey,
                taskType: task.taskType,
                parentId: task.parentId,
                childIds: task.childIds,
            },
        };
    }
    getAllTasks(userId) {
        return Array.from(this.tasks.entries())
            .filter(([, task]) => {
            if (userId)
                return task.userId === userId;
            return true;
        })
            .map(([, task]) => ({
            ...task,
            target: task.target || task.result?.target || 'microcode',
            taskType: task.taskType || (task.sessionId.startsWith('page-') && !task.parentId ? 'page' : 'component'),
            parentId: task.parentId,
            childIds: task.childIds || [],
        }))
            .sort((a, b) => b.startTime - a.startTime);
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
            ...task,
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
                result: c.result,
            })),
        };
    }
    addProgress(sessionId, progressData) {
        const task = this.tasks.get(sessionId);
        if (!task)
            return;
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
    completeTask(sessionId, result) {
        const task = this.tasks.get(sessionId);
        if (!task || task.status === 'cancelled')
            return;
        task.status = 'completed';
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
        task.result = result;
        task.endTime = Date.now();
        task.duration = task.endTime - task.startTime;
        this.persist();
    }
    failTask(sessionId, error) {
        const task = this.tasks.get(sessionId);
        if (!task || task.status === 'cancelled')
            return;
        task.status = 'failed';
        task.error = error.message || error;
        if (error?.lessCompileGate || error?.runtimeGate || error?.codeValidationResult) {
            task.result = {
                ...(task.result || {}),
                ...(error.lessCompileGate ? { lessCompileGate: error.lessCompileGate } : {}),
                ...(error.runtimeGate ? { runtimeGate: error.runtimeGate } : {}),
                ...(error.codeValidationResult ? { codeValidationResult: error.codeValidationResult } : {}),
            };
        }
        task.endTime = Date.now();
        task.duration = task.endTime - task.startTime;
        this.persist();
    }
    cancelTask(sessionId, userId) {
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
        task.status = 'cancelled';
        task.error = '用户主动终止';
        task.endTime = Date.now();
        task.duration = task.endTime - task.startTime;
        this.removeAbortController(sessionId);
        this.persist();
        return { success: true, message: '任务已成功终止' };
    }
    pauseTask(sessionId, userId) {
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
        task.status = 'running';
        this.persist();
        return { success: true, message: '任务已恢复' };
    }
    async removeTask(sessionId, userId) {
        return this.removeTaskInternal(sessionId, userId, { deleteComponentRecords: true });
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
        if (deleted)
            this.persist();
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
                paths.add((0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', task.groupId, id));
                paths.add((0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', task.groupId, id));
            }
        }
        else {
            for (const id of ids) {
                paths.add((0, path_1.join)(process.cwd(), 'workspace', 'custom-components', id));
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
                paths.add((0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', groupId, id));
                paths.add((0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', groupId, id));
            }
        }
        else {
            for (const id of ids) {
                paths.add((0, path_1.join)(process.cwd(), 'workspace', 'custom-components', id));
                paths.add((0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', id));
            }
        }
        return this.removeGeneratedPaths([...paths]);
    }
    removeGeneratedPaths(paths) {
        let removed = 0;
        const allowedRoots = [
            ...this.getTempRoots(),
            (0, path_1.join)(process.cwd(), 'workspace'),
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
            (0, path_1.join)(process.cwd(), 'workspace'),
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
            configSnapshot: task.configSnapshot ? this.redactSecrets(task.configSnapshot) : undefined,
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
    hasVue3Artifacts(task) {
        if ((task.target || 'microcode') !== 'vue3')
            return false;
        const candidates = [];
        const componentId = task.componentId || task.sessionId;
        if (task.groupId) {
            candidates.push((0, path_1.join)(process.cwd(), 'workspace', 'vue3-components', task.groupId, componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components', task.groupId, componentId));
        }
        if (task.outputPath) {
            const allowedRoots = [
                ...this.getTempRoots(),
                (0, path_1.join)(process.cwd(), 'workspace'),
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
            return this.hasVue3Artifacts(task);
        if (target === 'microcode')
            return this.hasMicrocodeArtifacts(task);
        return false;
    }
    hasMicrocodeArtifacts(task) {
        const componentId = task.componentId || task.sessionId;
        const candidates = [];
        candidates.push((0, path_1.join)(process.cwd(), 'workspace', 'custom-components', componentId), (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'custom-components', componentId));
        if (task.outputPath) {
            const allowedRoots = [
                ...this.getTempRoots(),
                (0, path_1.join)(process.cwd(), 'workspace'),
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
            (0, path_1.join)(componentDir, 'component.js'),
            (0, path_1.join)(componentDir, 'declare.json'),
            (0, path_1.join)(componentDir, 'package', 'index.vue'),
        ].some((entry) => (0, fs_1.existsSync)(entry) && (0, fs_1.statSync)(entry).isFile());
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
        task.humanReview = {
            reviewedBy: userId,
            reviewedByName: reviewerName || userId,
            reviewedAt: Date.now(),
            overrideStatus,
            reason: comment || undefined,
            previousStatus: 'failed',
            previousError: task.error,
            action: 'pass',
        };
        task.status = 'completed';
        task.error = undefined;
        task.endTime = task.endTime || Date.now();
        task.duration = task.duration || task.endTime - task.startTime;
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
        task.status = task.humanReview.previousStatus || 'failed';
        task.error = task.humanReview.previousError;
        task.endTime = undefined;
        task.duration = undefined;
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
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(component_schema_1.Component.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], TasksService);
//# sourceMappingURL=tasks.service.js.map