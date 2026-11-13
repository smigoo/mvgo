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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceTransactionService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const incremental_file_cleanup_service_1 = require("./incremental-file-cleanup.service");
let WorkspaceTransactionService = class WorkspaceTransactionService {
    cleanup;
    constructor(cleanup) {
        this.cleanup = cleanup;
    }
    async commit(targets, validateCommittedState) {
        const transactionId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const prepared = targets.map((target, index) => ({
            ...target,
            backupPath: `${target.targetPath}.binding-backup-${transactionId}-${index}`,
            movedExisting: false,
            committed: false,
        }));
        let committedSuccessfully = false;
        let rolledBack = false;
        try {
            for (const target of prepared) {
                (0, fs_1.mkdirSync)((0, path_1.dirname)(target.targetPath), { recursive: true });
                if (target.stagingPath && !(0, fs_1.existsSync)(target.stagingPath)) {
                    throw new Error(`事务暂存目标不存在: ${target.stagingPath}`);
                }
            }
            for (const target of prepared) {
                if ((0, fs_1.existsSync)(target.targetPath)) {
                    (0, fs_1.renameSync)(target.targetPath, target.backupPath);
                    target.movedExisting = true;
                }
                if (target.stagingPath) {
                    (0, fs_1.renameSync)(target.stagingPath, target.targetPath);
                }
                target.committed = true;
            }
            if (validateCommittedState) {
                await validateCommittedState();
            }
            committedSuccessfully = true;
            for (const target of prepared) {
                if (target.movedExisting && (0, fs_1.existsSync)(target.backupPath)) {
                    this.cleanup.detachAndSchedule(target.backupPath);
                }
            }
        }
        catch (error) {
            let rollbackError = null;
            for (const target of [...prepared].reverse()) {
                try {
                    if (target.committed && (0, fs_1.existsSync)(target.targetPath)) {
                        this.cleanup.detachAndSchedule(target.targetPath);
                    }
                    if (target.movedExisting && (0, fs_1.existsSync)(target.backupPath)) {
                        (0, fs_1.renameSync)(target.backupPath, target.targetPath);
                    }
                }
                catch (restoreError) {
                    rollbackError ||= restoreError;
                }
            }
            rolledBack = rollbackError === null;
            if (rollbackError) {
                throw new Error(`事务提交失败且自动回滚不完整: ${error.message}; rollback: ${rollbackError.message}`);
            }
            throw error;
        }
        finally {
            for (const target of prepared) {
                if (target.stagingPath && (0, fs_1.existsSync)(target.stagingPath)) {
                    this.cleanup.detachAndSchedule(target.stagingPath);
                }
                if ((committedSuccessfully || rolledBack) && (0, fs_1.existsSync)(target.backupPath)) {
                    this.cleanup.detachAndSchedule(target.backupPath);
                }
            }
        }
    }
};
exports.WorkspaceTransactionService = WorkspaceTransactionService;
exports.WorkspaceTransactionService = WorkspaceTransactionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [incremental_file_cleanup_service_1.IncrementalFileCleanupService])
], WorkspaceTransactionService);
//# sourceMappingURL=workspace-transaction.service.js.map