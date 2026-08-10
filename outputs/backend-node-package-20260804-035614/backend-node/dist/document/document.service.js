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
exports.DocumentService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const document_schema_1 = require("./schemas/document.schema");
let DocumentService = class DocumentService {
    documentModel;
    constructor(documentModel) {
        this.documentModel = documentModel;
    }
    async create(userId, groupId, dto) {
        const doc = new this.documentModel({
            ...dto,
            ownerId: new mongoose_2.Types.ObjectId(userId),
            groupId: new mongoose_2.Types.ObjectId(groupId),
            lastEditedBy: new mongoose_2.Types.ObjectId(userId),
        });
        return doc.save();
    }
    async findAll(groupId, userId) {
        const query = { groupId: new mongoose_2.Types.ObjectId(groupId) };
        if (userId) {
            query.ownerId = new mongoose_2.Types.ObjectId(userId);
        }
        return this.documentModel.find(query).sort({ updatedAt: -1 }).exec();
    }
    async findOne(id) {
        return this.documentModel.findById(id).exec();
    }
    async update(id, userId, dto) {
        return this.documentModel
            .findByIdAndUpdate(id, { ...dto, lastEditedBy: new mongoose_2.Types.ObjectId(userId) }, { new: true })
            .exec();
    }
    async remove(id) {
        return this.documentModel.findByIdAndDelete(id).exec();
    }
};
exports.DocumentService = DocumentService;
exports.DocumentService = DocumentService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(document_schema_1.Document.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], DocumentService);
//# sourceMappingURL=document.service.js.map