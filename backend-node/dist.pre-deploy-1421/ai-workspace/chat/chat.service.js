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
var AiChatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiChatService = void 0;
const common_1 = require("@nestjs/common");
const sessions_service_1 = require("../sessions/sessions.service");
const documents_service_1 = require("../documents/documents.service");
let AiChatService = AiChatService_1 = class AiChatService {
    sessionsService;
    documentsService;
    logger = new common_1.Logger(AiChatService_1.name);
    constructor(sessionsService, documentsService) {
        this.sessionsService = sessionsService;
        this.documentsService = documentsService;
    }
    async save(userId, dto) {
        const session = await this.sessionsService.findById(dto.sessionId);
        if (!session) {
            throw new Error('会话不存在');
        }
        await this.sessionsService.pushMessages(dto.sessionId, dto.messages);
        let document;
        if (dto.documentId) {
            document = await this.documentsService.findById(dto.documentId);
        }
        if (!document) {
            document = await this.documentsService.ensureDocument({
                sessionId: dto.sessionId,
                projectId: session.projectId.toString(),
                userId,
                title: session.title || '未命名文档',
            });
        }
        await this.documentsService.appendContent(document._id.toString(), {
            content: '\n\n' + dto.generatedContent,
        });
        this.logger.log(`Chat saved: session=${dto.sessionId}, doc=${document._id}, msgs=${dto.messages.length}`);
        return {
            sessionId: dto.sessionId,
            documentId: document._id.toString(),
            documentUpdated: true,
        };
    }
};
exports.AiChatService = AiChatService;
exports.AiChatService = AiChatService = AiChatService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [sessions_service_1.AiSessionsService,
        documents_service_1.AiDocumentsService])
], AiChatService);
//# sourceMappingURL=chat.service.js.map