"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ApifoxService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApifoxService = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const fs_1 = require("fs");
const backend_root_1 = require("../config/backend-root");
let ApifoxService = ApifoxService_1 = class ApifoxService {
    logger = new common_1.Logger(ApifoxService_1.name);
    storePath = (0, path_1.join)(backend_root_1.dataDir, 'apifox-tasks.json');
    catalogDir = backend_root_1.apiCatalogsDir;
    catalogIndexPath = (0, path_1.join)(backend_root_1.apiCatalogsDir, 'index.json');
    readTasks() {
        if (!(0, fs_1.existsSync)(this.storePath))
            return [];
        try {
            return JSON.parse((0, fs_1.readFileSync)(this.storePath, 'utf-8'));
        }
        catch {
            return [];
        }
    }
    writeTasks(tasks) {
        const dir = backend_root_1.dataDir;
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        (0, fs_1.writeFileSync)(this.storePath, JSON.stringify(tasks, null, 2), 'utf-8');
    }
    recordTask(dto) {
        const tasks = this.readTasks();
        const createdAt = new Date().toISOString();
        const idx = tasks.findIndex((t) => t.taskId === dto.taskId);
        if (idx >= 0) {
            tasks[idx] = { ...tasks[idx], ...dto, createdAt: tasks[idx].createdAt };
            this.writeTasks(tasks);
            return tasks[idx];
        }
        const task = { ...dto, createdAt };
        if (!task.downloadUrl) {
            task.downloadUrl = `/api/apifox/download?taskId=${task.taskId}`;
        }
        tasks.push(task);
        this.writeTasks(tasks);
        this.logger.log(`Apifox 任务登记: ${dto.taskId} (${dto.moduleName})`);
        return task;
    }
    listMine(ownerId) {
        const tasks = this.readTasks();
        if (!ownerId)
            return tasks;
        return tasks.filter((t) => t.ownerId === ownerId || !t.ownerId);
    }
    deleteTask(taskId, ownerId) {
        const tasks = this.readTasks();
        const idx = tasks.findIndex((t) => t.taskId === taskId);
        if (idx < 0) {
            throw new common_1.NotFoundException(`任务不存在: ${taskId}`);
        }
        const task = tasks[idx];
        if (ownerId && task.ownerId && task.ownerId !== ownerId) {
            throw new common_1.NotFoundException(`任务不存在: ${taskId}`);
        }
        if (task.zipPath && (0, fs_1.existsSync)(task.zipPath)) {
            try {
                (0, fs_1.unlinkSync)(task.zipPath);
            }
            catch (err) {
                this.logger.warn(`删除 zip 失败: ${task.zipPath} — ${err.message}`);
            }
        }
        const catalogPath = (0, path_1.join)(this.catalogDir, `${taskId}.json`);
        if ((0, fs_1.existsSync)(catalogPath)) {
            try {
                (0, fs_1.unlinkSync)(catalogPath);
            }
            catch (err) {
                this.logger.warn(`删除 catalog json 失败: ${catalogPath} — ${err.message}`);
            }
            const index = this.readCatalogIndex();
            const newIndex = index.filter((c) => c.catalogId !== taskId);
            if (newIndex.length !== index.length) {
                (0, fs_1.writeFileSync)(this.catalogIndexPath, JSON.stringify(newIndex, null, 2), 'utf-8');
            }
        }
        tasks.splice(idx, 1);
        this.writeTasks(tasks);
        this.logger.log(`Apifox 任务已删除: ${taskId}`);
    }
    getZipPath(taskId) {
        const task = this.readTasks().find((t) => t.taskId === taskId);
        if (!task) {
            throw new common_1.NotFoundException(`任务不存在: ${taskId}`);
        }
        const zipPath = task.zipPath;
        if (!zipPath || !(0, fs_1.existsSync)(zipPath)) {
            throw new common_1.NotFoundException(`ZIP 文件不存在: ${taskId}`);
        }
        return zipPath;
    }
    saveCatalog(catalog, ownerId) {
        if (!(0, fs_1.existsSync)(this.catalogDir))
            (0, fs_1.mkdirSync)(this.catalogDir, { recursive: true });
        const catalogPath = (0, path_1.join)(this.catalogDir, `${catalog.catalogId}.json`);
        (0, fs_1.writeFileSync)(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
        const index = this.readCatalogIndex();
        const idx = index.findIndex((c) => c.catalogId === catalog.catalogId);
        const summary = {
            catalogId: catalog.catalogId,
            apifoxProjectId: catalog.apifoxProjectId,
            projectName: catalog.projectName,
            generatedAt: catalog.generatedAt,
            totalApiCount: catalog.totalApiCount,
            totalModuleCount: catalog.totalModuleCount,
        };
        if (ownerId)
            summary.ownerId = ownerId;
        if (idx >= 0) {
            index[idx] = summary;
        }
        else {
            index.push(summary);
        }
        (0, fs_1.writeFileSync)(this.catalogIndexPath, JSON.stringify(index, null, 2), 'utf-8');
        this.logger.log(`API 目录已保存: ${catalog.catalogId} (${catalog.totalApiCount} 个接口, ${catalog.totalModuleCount} 个模块)`);
    }
    getCatalog(catalogId) {
        const catalogPath = (0, path_1.join)(this.catalogDir, `${catalogId}.json`);
        if (!(0, fs_1.existsSync)(catalogPath)) {
            throw new common_1.NotFoundException(`API 目录不存在: ${catalogId}`);
        }
        return JSON.parse((0, fs_1.readFileSync)(catalogPath, 'utf-8'));
    }
    listCatalogs(ownerId) {
        const all = this.readCatalogIndex();
        if (!ownerId)
            return all;
        return all.filter((c) => !c.ownerId || c.ownerId === ownerId);
    }
    readCatalogIndex() {
        if (!(0, fs_1.existsSync)(this.catalogIndexPath))
            return [];
        try {
            return JSON.parse((0, fs_1.readFileSync)(this.catalogIndexPath, 'utf-8'));
        }
        catch {
            return [];
        }
    }
};
exports.ApifoxService = ApifoxService;
exports.ApifoxService = ApifoxService = ApifoxService_1 = __decorate([
    (0, common_1.Injectable)()
], ApifoxService);
//# sourceMappingURL=apifox.service.js.map