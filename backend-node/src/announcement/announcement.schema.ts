import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnnouncementDocument = Announcement & Document;

@Schema({ timestamps: true })
export class Announcement {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ trim: true })
  version: string;

  @Prop({ type: String, enum: ['info', 'warning', 'success', 'error'], default: 'info' })
  type: string;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Date })
  publishAt: Date;

  @Prop({ type: Date })
  expireAt: Date;

  @Prop({ trim: true })
  author: string;

  @Prop({ default: 0 })
  priority: number;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);

// 索引：按发布时间倒序、活跃状态筛选
AnnouncementSchema.index({ publishAt: -1 });
AnnouncementSchema.index({ active: 1, publishAt: -1 });
AnnouncementSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
