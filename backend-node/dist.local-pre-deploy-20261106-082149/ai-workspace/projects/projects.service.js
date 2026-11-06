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
var AiProjectsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiProjectsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const ai_project_schema_1 = require("../schemas/ai-project.schema");
let AiProjectsService = AiProjectsService_1 = class AiProjectsService {
    projectModel;
    logger = new common_1.Logger(AiProjectsService_1.name);
    constructor(projectModel) {
        this.projectModel = projectModel;
    }
    async findAll(userId) {
        return this.projectModel
            .find({ status: 'active', adminUserIds: new mongoose_2.Types.ObjectId(userId) })
            .select('-__v')
            .exec();
    }
    async findById(id, userId) {
        const filter = { _id: new mongoose_2.Types.ObjectId(id) };
        if (userId) {
            filter.adminUserIds = new mongoose_2.Types.ObjectId(userId);
        }
        return this.projectModel.findOne(filter).select('-__v').exec();
    }
    async create(dto, userId) {
        const project = new this.projectModel({
            ...dto,
            adminUserIds: [new mongoose_2.Types.ObjectId(userId)],
        });
        return project.save();
    }
    async update(id, dto, userId) {
        const filter = { _id: new mongoose_2.Types.ObjectId(id) };
        if (userId) {
            filter.adminUserIds = new mongoose_2.Types.ObjectId(userId);
        }
        return this.projectModel
            .findOneAndUpdate(filter, { $set: dto }, { returnDocument: 'after' })
            .select('-__v')
            .exec();
    }
    async archive(id, userId) {
        const filter = { _id: new mongoose_2.Types.ObjectId(id) };
        if (userId) {
            filter.adminUserIds = new mongoose_2.Types.ObjectId(userId);
        }
        return this.projectModel
            .findOneAndUpdate(filter, { $set: { status: 'archived' } }, { returnDocument: 'after' })
            .exec();
    }
};
exports.AiProjectsService = AiProjectsService;
exports.AiProjectsService = AiProjectsService = AiProjectsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(ai_project_schema_1.AiProject.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], AiProjectsService);
//# sourceMappingURL=projects.service.js.map