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
var AnnouncementService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnouncementService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const announcement_schema_1 = require("./announcement.schema");
let AnnouncementService = AnnouncementService_1 = class AnnouncementService {
    announcementModel;
    logger = new common_1.Logger(AnnouncementService_1.name);
    constructor(announcementModel) {
        this.announcementModel = announcementModel;
    }
    async create(data) {
        try {
            const announcement = new this.announcementModel(data);
            const saved = await announcement.save();
            this.logger.log(`公告创建成功: ${saved._id}`);
            return saved;
        }
        catch (error) {
            this.logger.error(`创建公告失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async findAllForAdmin(query) {
        const { page = 1, pageSize = 20, active, keyword } = query;
        const skip = (page - 1) * pageSize;
        const filter = {};
        if (active !== undefined) {
            filter.active = active;
        }
        if (keyword) {
            filter.$or = [
                { title: { $regex: keyword, $options: 'i' } },
                { content: { $regex: keyword, $options: 'i' } },
                { version: { $regex: keyword, $options: 'i' } },
            ];
        }
        const [list, total] = await Promise.all([
            this.announcementModel
                .find(filter)
                .sort({ priority: -1, publishAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),
            this.announcementModel.countDocuments(filter),
        ]);
        return { list, total };
    }
    async findActiveForUser() {
        const now = new Date();
        const filter = {
            active: true,
            $and: [
                {
                    $or: [
                        { publishAt: { $lte: now } },
                        { publishAt: null },
                        { publishAt: { $exists: false } },
                    ],
                },
                {
                    $or: [
                        { expireAt: { $gte: now } },
                        { expireAt: null },
                        { expireAt: { $exists: false } },
                    ],
                },
            ],
        };
        return this.announcementModel
            .find(filter)
            .sort({ priority: -1, publishAt: -1 })
            .limit(50)
            .lean();
    }
    async findById(id) {
        const announcement = await this.announcementModel.findById(id).lean();
        if (!announcement) {
            throw new common_1.NotFoundException(`公告不存在: ${id}`);
        }
        return announcement;
    }
    async update(id, data) {
        try {
            const updated = await this.announcementModel
                .findByIdAndUpdate(id, { $set: data }, { new: true })
                .lean();
            if (!updated) {
                throw new common_1.NotFoundException(`公告不存在: ${id}`);
            }
            this.logger.log(`公告更新成功: ${id}`);
            return updated;
        }
        catch (error) {
            this.logger.error(`更新公告失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async delete(id) {
        try {
            const result = await this.announcementModel.findByIdAndDelete(id);
            if (!result) {
                throw new common_1.NotFoundException(`公告不存在: ${id}`);
            }
            this.logger.log(`公告删除成功: ${id}`);
        }
        catch (error) {
            this.logger.error(`删除公告失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async toggleActive(id) {
        const announcement = await this.announcementModel.findById(id);
        if (!announcement) {
            throw new common_1.NotFoundException(`公告不存在: ${id}`);
        }
        announcement.active = !announcement.active;
        await announcement.save();
        this.logger.log(`公告状态切换: ${id} -> ${announcement.active}`);
        return announcement;
    }
};
exports.AnnouncementService = AnnouncementService;
exports.AnnouncementService = AnnouncementService = AnnouncementService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(announcement_schema_1.Announcement.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], AnnouncementService);
//# sourceMappingURL=announcement.service.js.map