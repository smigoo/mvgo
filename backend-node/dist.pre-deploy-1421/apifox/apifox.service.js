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
exports.normalizeOwnerId = normalizeOwnerId;
exports.mergeTaskRecord = mergeTaskRecord;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const fs_1 = require("fs");
const backend_root_1 = require("../config/backend-root");
const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,120}$/;
const OWNER_ID_RE = /^[0-9a-fA-F]{24}$/;
function normalizeOwnerId(candidate) {
    if (typeof candidate !== 'string')
        return undefined;
    const value = candidate.trim();
    return OWNER_ID_RE.test(value) ? value : undefined;
}
function mergeTaskRecord(existing, incoming, now) {
    if (existing) {
        return {
            ...existing,
            ...incoming,
            ownerId: incoming.ownerId ?? existing.ownerId,
            createdAt: existing.createdAt,
        };
    }
    const task = { ...incoming, ownerId: incoming.ownerId, createdAt: now };
    if (!task.downloadUrl) {
        task.downloadUrl = `/api/apifox/download?taskId=${task.taskId}`;
    }
    return task;
}
let ApifoxService = ApifoxService_1 = class ApifoxService {
    logger = new common_1.Logger(ApifoxService_1.name);
    storePath = (0, path_1.join)(backend_root_1.dataDir, 'apifox-tasks.json');
    catalogDir = backend_root_1.apiCatalogsDir;
    catalogIndexPath = (0, path_1.join)(backend_root_1.apiCatalogsDir, 'index.json');
    assertSafeId(id, label) {
        if (typeof id !== 'string' || id.includes('..') || !SAFE_ID_RE.test(id)) {
            throw new common_1.BadRequestException(`${label} 格式非法`);
        }
    }
    assertZipInsideDir(zipPath) {
        const abs = (0, path_1.resolve)(zipPath);
        const root = (0, path_1.resolve)(backend_root_1.apifoxZipsDir);
        if (abs !== root && !abs.startsWith(root + path_1.sep)) {
            throw new common_1.NotFoundException('产物文件不存在');
        }
        return abs;
    }
    assertTaskOwner(task, ownerId) {
        if (ownerId && task.ownerId && task.ownerId !== ownerId) {
            throw new common_1.NotFoundException(`任务不存在: ${task.taskId}`);
        }
    }
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
        this.assertSafeId(dto.taskId, 'taskId');
        const safeDto = dto.zipPath
            ? { ...dto, zipPath: this.assertZipInsideDir(dto.zipPath) }
            : { ...dto };
        const ownerId = normalizeOwnerId(safeDto.ownerId);
        if (safeDto.ownerId && !ownerId) {
            this.logger.warn(`忽略非法 ownerId="${safeDto.ownerId}"（taskId=${safeDto.taskId}）：非平台用户 ID，按旧数据口径保持公共可见`);
        }
        const tasks = this.readTasks();
        const idx = tasks.findIndex((t) => t.taskId === dto.taskId);
        const isNew = idx < 0;
        const task = mergeTaskRecord(isNew ? undefined : tasks[idx], { ...safeDto, ownerId }, new Date().toISOString());
        if (isNew) {
            tasks.push(task);
        }
        else {
            tasks[idx] = task;
        }
        this.writeTasks(tasks);
        if (isNew) {
            this.logger.log(`Apifox 任务登记: ${dto.taskId} (${dto.moduleName})`);
        }
        return task;
    }
    listMine(ownerId) {
        const tasks = this.readTasks();
        if (!ownerId)
            return tasks;
        return tasks.filter((t) => t.ownerId === ownerId || !t.ownerId);
    }
    deleteTask(taskId, ownerId) {
        this.assertSafeId(taskId, 'taskId');
        const tasks = this.readTasks();
        const idx = tasks.findIndex((t) => t.taskId === taskId);
        if (idx < 0) {
            throw new common_1.NotFoundException(`任务不存在: ${taskId}`);
        }
        const task = tasks[idx];
        this.assertTaskOwner(task, ownerId);
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
    getZipPath(taskId, ownerId) {
        this.assertSafeId(taskId, 'taskId');
        const task = this.readTasks().find((t) => t.taskId === taskId);
        if (!task) {
            throw new common_1.NotFoundException(`任务不存在: ${taskId}`);
        }
        this.assertTaskOwner(task, ownerId);
        const zipPath = task.zipPath ? this.assertZipInsideDir(task.zipPath) : '';
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
    getCatalog(catalogId, ownerId) {
        this.assertSafeId(catalogId, 'catalogId');
        if (ownerId) {
            const entry = this.readCatalogIndex().find((c) => c.catalogId === catalogId);
            if (entry?.ownerId && entry.ownerId !== ownerId) {
                throw new common_1.NotFoundException(`API 目录不存在: ${catalogId}`);
            }
        }
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