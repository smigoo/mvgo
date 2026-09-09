import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiSkill, AiSkillDocument } from '../schemas/ai-skill.schema';

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

@Injectable()
export class AiSkillsService implements OnModuleInit {
  private readonly logger = new Logger(AiSkillsService.name);

  constructor(
    @InjectModel(AiSkill.name) private skillModel: Model<AiSkillDocument>,
  ) {}

  async onModuleInit() {
    // 种子数据失败（如数据库账号无写权限）不应阻断服务启动，
    // 否则异常会在 app.listen() 之前抛出，导致端口从未监听、网关 502。
    try {
      await this.seedPresetSkills();
    } catch (err) {
      this.logger.warn(`预设 Skills 初始化失败，已跳过: ${err.message}`);
    }
  }

  async seedPresetSkills() {
    const count = await this.skillModel.countDocuments();
    if (count > 0) {
      this.logger.log(`Skills 已存在 ${count} 条，跳过种子数据`);
      return;
    }

    await this.skillModel.insertMany(
      PRESET_SKILLS.map((s) => ({
        ...s,
        visibility: 'all',
        status: 'active',
        reviewRequired: false,
      })),
    );
    this.logger.log(`已初始化 ${PRESET_SKILLS.length} 个预设 Skills`);
  }

  async findAll(): Promise<AiSkillDocument[]> {
    return this.skillModel
      .find({ status: 'active', visibility: 'all' })
      .sort({ sortOrder: 1 })
      .exec();
  }

  async findById(id: string): Promise<AiSkillDocument | null> {
    return this.skillModel.findById(id).exec();
  }
}
