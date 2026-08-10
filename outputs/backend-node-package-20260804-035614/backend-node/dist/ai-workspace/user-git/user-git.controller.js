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
exports.AiUserGitController = void 0;
const common_1 = require("@nestjs/common");
const user_git_service_1 = require("./user-git.service");
const user_git_dto_1 = require("./dto/user-git.dto");
const session_guard_1 = require("../../auth/session.guard");
const current_user_decorator_1 = require("../../auth/current-user.decorator");
let AiUserGitController = class AiUserGitController {
    userGitService;
    constructor(userGitService) {
        this.userGitService = userGitService;
    }
    async getStatus(userId) {
        return this.userGitService.getStatus(userId);
    }
    async save(dto, userId) {
        return this.userGitService.save(userId, dto);
    }
    async delete(userId) {
        return this.userGitService.delete(userId);
    }
};
exports.AiUserGitController = AiUserGitController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AiUserGitController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Put)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_git_dto_1.SaveGitCredentialDto, String]),
    __metadata("design:returntype", Promise)
], AiUserGitController.prototype, "save", null);
__decorate([
    (0, common_1.Delete)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AiUserGitController.prototype, "delete", null);
exports.AiUserGitController = AiUserGitController = __decorate([
    (0, common_1.Controller)('user/git-credential'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [user_git_service_1.AiUserGitService])
], AiUserGitController);
//# sourceMappingURL=user-git.controller.js.map