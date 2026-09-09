import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiProjectDocument = AiProject & Document;

@Schema({ collection: 'ai_projects', timestamps: true })
export class AiProject {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  gitUrl: string;

  @Prop({ default: 'main' })
  gitBranch: string;

  @Prop({ default: 'docs/' })
  gitDefaultPath: string;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  adminUserIds: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'Group', default: [] })
  authorizedGroupIds: Types.ObjectId[];

  @Prop({ default: 'active' })
  status: string;
}

export const AiProjectSchema = SchemaFactory.createForClass(AiProject);

AiProjectSchema.index({ status: 1 });
AiProjectSchema.index({ authorizedGroupIds: 1 });
