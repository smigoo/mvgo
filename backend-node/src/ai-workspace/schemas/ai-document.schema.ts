import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiDocumentDocument = AiDocument & Document;

@Schema({ collection: 'ai_documents', timestamps: true })
export class AiDocument {
  @Prop({ type: Types.ObjectId, ref: 'AiSession', required: true })
  sessionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiProject', required: true })
  projectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ default: '未命名文档' })
  title: string;

  @Prop({ default: '' })
  content: string;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: 'active' })
  status: string;

  @Prop({ default: 'hidden' })
  visibility: string;

  @Prop({ default: [] })
  sharedUsers: Array<{
    userId: Types.ObjectId;
    canView: boolean;
    canEdit: boolean;
  }>;

  @Prop({ type: [Types.ObjectId], ref: 'Group', default: [] })
  sharedGroupIds: Types.ObjectId[];

  @Prop({ default: false })
  gitSynced: boolean;

  @Prop({ default: '' })
  gitLastCommitSha: string;
}

export const AiDocumentSchema = SchemaFactory.createForClass(AiDocument);

AiDocumentSchema.index({ sessionId: 1, sortOrder: 1 });
AiDocumentSchema.index({ userId: 1, updatedAt: -1 });
AiDocumentSchema.index({ projectId: 1, visibility: 1, status: 1 });
AiDocumentSchema.index({ 'sharedUsers.userId': 1, status: 1 });
