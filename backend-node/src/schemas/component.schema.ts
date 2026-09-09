import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ComponentDocument = Component & Document;

@Schema({ timestamps: true })
export class Component {
  /** workspace 业务组件号，不等同于 MongoDB _id */
  @Prop({ index: true, sparse: true })
  componentId?: string;

  /** 生成任务号 */
  @Prop({ index: true, sparse: true })
  taskId?: string;

  /** 组件目标类型 */
  @Prop({ enum: ['microcode', 'vue3'] })
  target?: 'microcode' | 'vue3';

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  /**
   * 可见性：private=仅创建者/管理员可见（默认，存量数据 undefined 视同 private），
   * public=公共组件池，所有登录用户可见可下载
   */
  @Prop({ enum: ['private', 'public'], default: 'private', index: true })
  visibility?: 'private' | 'public';

  /** 最近一次发布时间（重新发布会刷新；下架保留） */
  @Prop()
  sharedAt?: Date;

  /** 最近一次发布操作人 */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  sharedBy?: Types.ObjectId;

  @Prop({ type: Object })
  metadata: Record<string, any>;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const ComponentSchema = SchemaFactory.createForClass(Component);
