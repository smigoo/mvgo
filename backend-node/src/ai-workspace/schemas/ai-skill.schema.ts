import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiSkillDocument = AiSkill & Document;

@Schema({ collection: 'ai_skills', timestamps: true })
export class AiSkill {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true })
  promptTemplate: string;

  @Prop({ default: 'template' })
  type: string;

  @Prop({ default: 'all' })
  visibility: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerUserId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'Group', default: [] })
  groupIds: Types.ObjectId[];

  @Prop({ default: 'active' })
  status: string;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: false })
  reviewRequired: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy: Types.ObjectId;
}

export const AiSkillSchema = SchemaFactory.createForClass(AiSkill);

AiSkillSchema.index({ visibility: 1, status: 1 });
AiSkillSchema.index({ sortOrder: 1 });
