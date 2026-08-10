"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var IncrementalFileCleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncrementalFileCleanupService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const workspace_config_1 = require("../config/workspace.config");
let IncrementalFileCleanupService = class IncrementalFileCleanupService {
    static { IncrementalFileCleanupService_1 = this; }
    static DELETE_BATCH_SIZE = 20;
    static MAX_DELETE_ATTEMPTS = 5;
    logger = new common_1.Logger(IncrementalFileCleanupService_1.name);
    jobs = [];
    draining = false;
    onModuleInit() {
        const roots = [
            (0, path_1.join)(process.cwd(), 'workspace', 'vue3-components'),
            (0, path_1.join)((0, workspace_config_1.resolveFrontendWorkspace)(), 'vue3-components'),
            (0, path_1.join)(process.cwd(), 'data', '.api-binding-transactions'),
        ];
        let resumed = 0;
        for (const root of roots) {
            resumed += this.scanAndResume([root]);
        }
        if (resumed > 0) {
            this.logger.log(`启动扫描恢复 ${resumed} 个遗漏的增量清理任务`);
        }
    }
    scanAndResume(roots) {
        let resumed = 0;
        for (const root of roots) {
            if (!(0, fs_1.existsSync)(root))
                continue;
            for (const dir of this.collectCleanupDirs(root, 3)) {
                if (this.jobs.some((job) => job.rootPath === dir))
                    continue;
                this.scheduleDetached(dir);
                resumed += 1;
            }
        }
        return resumed;
    }
    collectCleanupDirs(root, maxDepth) {
        const found = [];
        const walk = (current, depth) => {
            if (depth > maxDepth)
                return;
            let entries;
            try {
                entries = (0, fs_1.readdirSync)(current);
            }
            catch {
                return;
            }
            for (const name of entries) {
                const full = (0, path_1.join)(current, name);
                let stat;
                try {
                    stat = (0, fs_1.lstatSync)(full);
                }
                catch {
                    continue;
                }
                if (stat.isDirectory() && !stat.isSymbolicLink()) {
                    if (/\.cleanup-/.test(name))
                        found.push(full);
                    walk(full, depth + 1);
                }
            }
        };
        walk(root, 0);
        return found;
    }
    detachAndSchedule(targetPath) {
        if (!(0, fs_1.existsSync)(targetPath))
            return null;
        const detachedPath = `${targetPath}.cleanup-${process.pid}-${Date.now()}-${(0, crypto_1.randomBytes)(3).toString('hex')}`;
        (0, fs_1.renameSync)(targetPath, detachedPath);
        this.scheduleDetached(detachedPath);
        return detachedPath;
    }
    scheduleDetached(detachedPath) {
        if (!(0, fs_1.existsSync)(detachedPath))
            return;
        this.jobs.push({
            rootPath: detachedPath,
            files: [],
            directories: [],
            attempts: new Map(),
            prepared: false,
        });
        this.scheduleDrain();
    }
    scheduleDrain() {
        if (this.draining)
            return;
        this.draining = true;
        setTimeout(() => this.drainNextBatch(), 0);
    }
    drainNextBatch() {
        const job = this.jobs[0];
        if (!job) {
            this.draining = false;
            return;
        }
        if (!job.prepared) {
            this.collectEntries(job.rootPath, job.files, job.directories);
            job.directories.sort((left, right) => right.length - left.length);
            job.prepared = true;
        }
        let operations = 0;
        const fileBatchSize = Math.min(job.files.length, IncrementalFileCleanupService_1.DELETE_BATCH_SIZE);
        for (let index = 0; index < fileBatchSize; index += 1) {
            const filePath = job.files.shift();
            try {
                (0, fs_1.unlinkSync)(filePath);
                job.attempts.delete(filePath);
            }
            catch (error) {
                this.retryOrAbandon(job, job.files, filePath, '文件', error);
            }
            operations += 1;
        }
        if (job.files.length === 0) {
            const directoryBatchSize = Math.min(job.directories.length, IncrementalFileCleanupService_1.DELETE_BATCH_SIZE - operations);
            for (let index = 0; index < directoryBatchSize; index += 1) {
                const directoryPath = job.directories.shift();
                try {
                    (0, fs_1.rmdirSync)(directoryPath);
                    job.attempts.delete(directoryPath);
                }
                catch (error) {
                    this.retryOrAbandon(job, job.directories, directoryPath, '目录', error);
                }
            }
        }
        if (job.files.length === 0 && job.directories.length === 0) {
            this.jobs.shift();
        }
        setTimeout(() => this.drainNextBatch(), 10);
    }
    retryOrAbandon(job, queue, targetPath, targetType, error) {
        const attempts = (job.attempts.get(targetPath) || 0) + 1;
        if (attempts < IncrementalFileCleanupService_1.MAX_DELETE_ATTEMPTS) {
            job.attempts.set(targetPath, attempts);
            queue.push(targetPath);
            this.logger.warn(`增量清理${targetType}失败，将重试 ${attempts}/${IncrementalFileCleanupService_1.MAX_DELETE_ATTEMPTS}: ${targetPath}; ${error.message}`);
            return;
        }
        job.attempts.delete(targetPath);
        this.logger.error(`增量清理${targetType}连续失败，停止自动重试并保留路径: ${targetPath}; ${error.message}`);
    }
    collectEntries(rootPath, files, directories) {
        if (!(0, fs_1.existsSync)(rootPath))
            return;
        const stat = (0, fs_1.lstatSync)(rootPath);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            files.push(rootPath);
            return;
        }
        for (const entry of (0, fs_1.readdirSync)(rootPath)) {
            this.collectEntries((0, path_1.join)(rootPath, entry), files, directories);
        }
        directories.push(rootPath);
    }
};
exports.IncrementalFileCleanupService = IncrementalFileCleanupService;
exports.IncrementalFileCleanupService = IncrementalFileCleanupService = IncrementalFileCleanupService_1 = __decorate([
    (0, common_1.Injectable)()
], IncrementalFileCleanupService);
//# sourceMappingURL=incremental-file-cleanup.service.js.map