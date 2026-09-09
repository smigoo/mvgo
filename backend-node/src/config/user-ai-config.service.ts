import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ZodError } from 'zod';
import {
  UserAiConfig,
  UserAiConfigDocument,
} from '../schemas/user-ai-config.schema';
import { AI_CONFIG_SCHEMA } from './config.service';
import { encryptField, decryptField } from '../common/crypto/field-encryption';

/**
 * 按用户持久化 AI/API 配置（管理后台只读视图的数据源）。
 * 与全局 AiConfigService（写 data/ai-config.json）解耦：本服务以 userId 为主键，
 * 仅负责「用户级配置」的读写，不参与生成回退链路。
 */
@Injectable()
export class UserAiConfigService {
  private readonly logger = new Logger(UserAiConfigService.name);

  constructor(
    @InjectModel(UserAiConfig.name)
    private readonly model: Model<UserAiConfigDocument>,
  ) {}

  /** 按用户 upsert 配置（已假定 input 经全局 AiConfigService 校验过，此处再校验一次防御） */
  async saveUserConfig(
    userId: string,
    input: Record<string, any>,
  ): Promise<void> {
    let parsed: Record<string, any>;
    try {
      parsed = AI_CONFIG_SCHEMA.parse(input || {});
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.issues
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; ');
        throw new BadRequestException(`保存用户 AI 配置失败，字段不合法：${message}`);
      }
      throw err;
    }
    await this.model
      .updateOne(
        { userId: new Types.ObjectId(userId) },
        { $set: { userId: new Types.ObjectId(userId), configEnc: encryptField(JSON.stringify(parsed)) } },
        { upsert: true },
      )
      .exec();
    this.logger.log(`[UserAiConfigService] 已保存用户 ${userId} 的 AI 配置`);
  }

  /** 查询全部用户配置（供 admin 列表） */
  async findAll(): Promise<UserAiConfigDocument[]> {
    // 不能用 lean()：virtual getter 依赖 this 上下文解密 configEnc，lean 文档是纯对象，getter 无法触发
    return this.model.find().exec();
  }

  /** 按 userId 读取单个用户的 AI 配置（供生成链路回退使用，是用户级配置的唯一读取入口） */
  async getUserConfig(userId: string): Promise<Record<string, any> | null> {
    if (!userId) return null;
    try {
      const doc = await this.model
        .findOne({ userId: new Types.ObjectId(userId) })
        .exec();
      return (doc as any)?.config || null;
    } catch (e: any) {
      this.logger.warn(
        `[UserAiConfigService] 读取用户 ${userId} 配置失败: ${e?.message || e}`,
      );
      return null;
    }
  }
}
