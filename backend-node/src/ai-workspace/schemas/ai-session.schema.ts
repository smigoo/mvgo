import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiSessionDocument = AiSession & Document;

@Schema({ collection: 'ai_sessions', timestamps: true })
export class AiSession {
  @Prop({ type: Types.ObjectId, ref: 'AiProject', required: true })
  projectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ default: '未命名会话' })
  title: string;

  @Prop({ default: '' })
  modelProvider: string;

  @Prop({ default: '' })
  modelName: string;

  @Prop({ default: [] })
  messages: Array<{
    role: string;
    content: string;
    toolCalls?: any[];
    createdAt: Date;
  }>;

  @Prop({ default: 0 })
  messageCount: number;
}

export const AiSessionSchema = SchemaFactory.createForClass(AiSession);

AiSessionSchema.index({ userId: 1, projectId: 1 });
AiSessionSchema.index({ userId: 1, updatedAt: -1 });
