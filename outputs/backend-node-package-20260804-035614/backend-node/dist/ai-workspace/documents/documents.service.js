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
var AiDocumentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiDocumentsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const ai_document_schema_1 = require("../schemas/ai-document.schema");
let AiDocumentsService = AiDocumentsService_1 = class AiDocumentsService {
    documentModel;
    logger = new common_1.Logger(AiDocumentsService_1.name);
    constructor(documentModel) {
        this.documentModel = documentModel;
    }
    async findBySession(sessionId, userId) {
        const filter = { sessionId: new mongoose_2.Types.ObjectId(sessionId), status: 'active' };
        if (userId) {
            filter.userId = new mongoose_2.Types.ObjectId(userId);
        }
        return this.documentModel
            .find(filter)
            .sort({ sortOrder: 1 })
            .select('-__v')
            .exec();
    }
    async findById(id, userId) {
        const filter = { _id: new mongoose_2.Types.ObjectId(id) };
        if (userId) {
            filter.userId = new mongoose_2.Types.ObjectId(userId);
        }
        return this.documentModel.findOne(filter).select('-__v').exec();
    }
    async create(params) {
        const doc = new this.documentModel({
            sessionId: new mongoose_2.Types.ObjectId(params.sessionId),
            projectId: new mongoose_2.Types.ObjectId(params.projectId),
            userId: new mongoose_2.Types.ObjectId(params.userId),
            title: params.title || '未命名文档',
            content: params.content || '',
            sortOrder: 0,
        });
        return doc.save();
    }
    async ensureDocument(params) {
        const existing = await this.documentModel
            .findOne({
            sessionId: new mongoose_2.Types.ObjectId(params.sessionId),
            userId: new mongoose_2.Types.ObjectId(params.userId),
            status: 'active',
        })
            .exec();
        if (existing)
            return existing;
        return this.create(params);
    }
    async update(id, dto, userId) {
        const filter = { _id: new mongoose_2.Types.ObjectId(id) };
        if (userId) {
            filter.userId = new mongoose_2.Types.ObjectId(userId);
        }
        return this.documentModel
            .findOneAndUpdate(filter, { $set: dto }, { new: true })
            .select('-__v')
            .exec();
    }
    async appendContent(id, dto, userId) {
        const filter = { _id: new mongoose_2.Types.ObjectId(id) };
        if (userId) {
            filter.userId = new mongoose_2.Types.ObjectId(userId);
        }
        const doc = await this.documentModel.findOne(filter).exec();
        if (!doc)
            return null;
        const newContent = (doc.content || '') + dto.content;
        return this.documentModel
            .findByIdAndUpdate(id, { $set: { content: newContent } }, { new: true })
            .select('-__v')
            .exec();
    }
    async delete(id, userId) {
        return this.documentModel.findOneAndUpdate({ _id: new mongoose_2.Types.ObjectId(id), userId: new mongoose_2.Types.ObjectId(userId) }, { $set: { status: 'deleted' } }, { new: true }).exec();
    }
};
exports.AiDocumentsService = AiDocumentsService;
exports.AiDocumentsService = AiDocumentsService = AiDocumentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(ai_document_schema_1.AiDocument.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], AiDocumentsService);
//# sourceMappingURL=documents.service.js.map