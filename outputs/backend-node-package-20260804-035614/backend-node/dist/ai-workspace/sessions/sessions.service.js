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
var AiSessionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiSessionsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const ai_session_schema_1 = require("../schemas/ai-session.schema");
let AiSessionsService = AiSessionsService_1 = class AiSessionsService {
    sessionModel;
    logger = new common_1.Logger(AiSessionsService_1.name);
    constructor(sessionModel) {
        this.sessionModel = sessionModel;
    }
    async findByUser(userId, projectId) {
        const filter = { userId: new mongoose_2.Types.ObjectId(userId) };
        if (projectId) {
            filter.projectId = new mongoose_2.Types.ObjectId(projectId);
        }
        return this.sessionModel
            .find(filter)
            .select('title projectId modelProvider modelName messageCount createdAt updatedAt')
            .sort({ updatedAt: -1 })
            .exec();
    }
    async findById(id, userId) {
        const filter = { _id: new mongoose_2.Types.ObjectId(id) };
        if (userId) {
            filter.userId = new mongoose_2.Types.ObjectId(userId);
        }
        return this.sessionModel.findOne(filter).exec();
    }
    async create(dto, userId) {
        const session = new this.sessionModel({
            projectId: new mongoose_2.Types.ObjectId(dto.projectId),
            userId: new mongoose_2.Types.ObjectId(userId),
            title: dto.title || '新会话',
            modelProvider: dto.modelProvider || '',
            modelName: dto.modelName || '',
        });
        return session.save();
    }
    async updateTitle(id, dto, userId) {
        const filter = { _id: new mongoose_2.Types.ObjectId(id) };
        if (userId) {
            filter.userId = new mongoose_2.Types.ObjectId(userId);
        }
        return this.sessionModel
            .findOneAndUpdate(filter, { $set: { title: dto.title } }, { new: true })
            .exec();
    }
    async delete(id, userId) {
        return this.sessionModel.findOneAndDelete({
            _id: new mongoose_2.Types.ObjectId(id),
            userId: new mongoose_2.Types.ObjectId(userId),
        }).exec();
    }
    async pushMessages(id, messages, userId) {
        const filter = { _id: new mongoose_2.Types.ObjectId(id) };
        if (userId) {
            filter.userId = new mongoose_2.Types.ObjectId(userId);
        }
        await this.sessionModel.updateOne(filter, {
            $push: {
                messages: {
                    $each: messages.map((m) => ({ ...m, createdAt: m.createdAt || new Date() })),
                },
            },
            $inc: { messageCount: messages.length },
            $set: { updatedAt: new Date() },
        });
    }
};
exports.AiSessionsService = AiSessionsService;
exports.AiSessionsService = AiSessionsService = AiSessionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(ai_session_schema_1.AiSession.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], AiSessionsService);
//# sourceMappingURL=sessions.service.js.map