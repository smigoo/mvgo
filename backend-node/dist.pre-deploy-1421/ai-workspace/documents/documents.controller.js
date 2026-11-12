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
exports.AiDocumentsController = void 0;
const common_1 = require("@nestjs/common");
const documents_service_1 = require("./documents.service");
const document_dto_1 = require("./dto/document.dto");
const session_guard_1 = require("../../auth/session.guard");
const current_user_decorator_1 = require("../../auth/current-user.decorator");
let AiDocumentsController = class AiDocumentsController {
    documentsService;
    constructor(documentsService) {
        this.documentsService = documentsService;
    }
    async findOne(id, userId) {
        const doc = await this.documentsService.findById(id, userId);
        if (!doc)
            throw new common_1.HttpException('文档不存在', common_1.HttpStatus.NOT_FOUND);
        return { data: doc };
    }
    async update(id, dto, userId) {
        const doc = await this.documentsService.update(id, dto, userId);
        if (!doc)
            throw new common_1.HttpException('文档不存在', common_1.HttpStatus.NOT_FOUND);
        return { data: doc };
    }
    async append(id, dto, userId) {
        const doc = await this.documentsService.appendContent(id, dto, userId);
        if (!doc)
            throw new common_1.HttpException('文档不存在', common_1.HttpStatus.NOT_FOUND);
        return { data: doc, updated: true };
    }
    async delete(id, userId) {
        await this.documentsService.delete(id, userId);
        return { success: true };
    }
};
exports.AiDocumentsController = AiDocumentsController;
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AiDocumentsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, document_dto_1.UpdateDocumentDto, String]),
    __metadata("design:returntype", Promise)
], AiDocumentsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/append'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, document_dto_1.AppendDocumentDto, String]),
    __metadata("design:returntype", Promise)
], AiDocumentsController.prototype, "append", null);
__decorate([
    (0, common_1.Post)(':id/delete'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AiDocumentsController.prototype, "delete", null);
exports.AiDocumentsController = AiDocumentsController = __decorate([
    (0, common_1.Controller)('documents'),
    (0, common_1.UseGuards)(session_guard_1.SessionGuard),
    __metadata("design:paramtypes", [documents_service_1.AiDocumentsService])
], AiDocumentsController);
//# sourceMappingURL=documents.controller.js.map