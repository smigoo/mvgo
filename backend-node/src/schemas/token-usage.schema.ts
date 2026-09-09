import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TokenUsageDocument = TokenUsage & Document;

/**
 * Token 用量记录
 * 每次 LLM 调用产生一条记录，关联到 sessionId（任务级）
 */
@Schema({ collection: 'token_usages', timestamps: true })
export class TokenUsage {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true })
  nodeName: string;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true, enum: ['vision', 'text'] })
  modelType: string;

  @Prop({ required: true, default: 0 })
  inputTokens: number;

  @Prop({ required: true, default: 0 })
  outputTokens: number;

  @Prop({ required: true, default: 0 })
  totalTokens: number;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ type: Date, default: Date.now, index: true })
  timestamp: Date;

  @Prop()
  componentName?: string;

  @Prop()
  fileKey?: string;

  @Prop()
  nodeId?: string;
}

export const TokenUsageSchema = SchemaFactory.createForClass(TokenUsage);

// 复合索引：按任务查询 + 时间排序
TokenUsageSchema.index({ sessionId: 1, timestamp: 1 });
// 时间倒序索引：聚合统计查询
TokenUsageSchema.index({ timestamp: -1 });
