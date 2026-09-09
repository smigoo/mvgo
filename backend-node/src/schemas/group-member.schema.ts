import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GroupMemberDocument = GroupMember & Document;

@Schema({ collection: 'group_members', timestamps: true })
export class GroupMember {
  @Prop({ type: Types.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['admin', 'member'], default: 'member' })
  role: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ default: Date.now })
  joinedAt: Date;
}

export const GroupMemberSchema = SchemaFactory.createForClass(GroupMember);

// 创建复合索引确保唯一性
GroupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
