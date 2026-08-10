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
var AiSkillsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiSkillsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const ai_skill_schema_1 = require("../schemas/ai-skill.schema");
const PRESET_SKILLS = [
    {
        name: '需求文档',
        description: '根据需求描述，生成结构化的产品需求文档（PRD）',
        promptTemplate: `你是一名资深产品经理。请根据用户的需求，生成一份结构化的产品需求文档，包含：
1. 需求背景
2. 目标用户
3. 功能描述
4. 业务流程
5. 验收标准
请使用 Markdown 格式输出。`,
        type: 'template',
        sortOrder: 0,
    },
    {
        name: '技术方案',
        description: '根据需求文档，生成详细的技术方案设计',
        promptTemplate: `你是一名资深架构师。请根据需求描述，生成一份详细的技术方案文档，包含：
1. 方案概述
2. 技术选型
3. 系统架构
4. 数据库设计
5. 接口设计
6. 部署方案
请使用 Markdown 格式输出。`,
        type: 'template',
        sortOrder: 1,
    },
    {
        name: '会议纪要',
        description: '根据会议记录，生成标准格式的会议纪要',
        promptTemplate: `你是一名高级助理。请根据会议内容，生成一份标准格式的会议纪要，包含：
1. 会议主题
2. 时间地点
3. 参会人员
4. 讨论内容
5. 决议事项
6. 待办任务（负责人+截止时间）
请使用 Markdown 格式输出。`,
        type: 'template',
        sortOrder: 2,
    },
];
let AiSkillsService = AiSkillsService_1 = class AiSkillsService {
    skillModel;
    logger = new common_1.Logger(AiSkillsService_1.name);
    constructor(skillModel) {
        this.skillModel = skillModel;
    }
    async onModuleInit() {
        await this.seedPresetSkills();
    }
    async seedPresetSkills() {
        const count = await this.skillModel.countDocuments();
        if (count > 0) {
            this.logger.log(`Skills 已存在 ${count} 条，跳过种子数据`);
            return;
        }
        await this.skillModel.insertMany(PRESET_SKILLS.map((s) => ({
            ...s,
            visibility: 'all',
            status: 'active',
            reviewRequired: false,
        })));
        this.logger.log(`已初始化 ${PRESET_SKILLS.length} 个预设 Skills`);
    }
    async findAll() {
        return this.skillModel
            .find({ status: 'active', visibility: 'all' })
            .sort({ sortOrder: 1 })
            .exec();
    }
    async findById(id) {
        return this.skillModel.findById(id).exec();
    }
};
exports.AiSkillsService = AiSkillsService;
exports.AiSkillsService = AiSkillsService = AiSkillsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(ai_skill_schema_1.AiSkill.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], AiSkillsService);
//# sourceMappingURL=skills.service.js.map