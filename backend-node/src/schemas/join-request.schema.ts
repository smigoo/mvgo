import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type JoinRequestDocument = HydratedDocument<JoinRequest>;

@Schema({ collection: 'join_requests', timestamps: true })
export class JoinRequest {
  _id: string;

  @Prop({ type: Types.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: string;

  @Prop({ default: '' })
  message: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  processedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  processedBy: Types.ObjectId;
}

export const JoinRequestSchema = SchemaFactory.createForClass(JoinRequest);

// 创建索引提升查询性能
JoinRequestSchema.index({ groupId: 1, status: 1 });
JoinRequestSchema.index({ userId: 1, status: 1 });
