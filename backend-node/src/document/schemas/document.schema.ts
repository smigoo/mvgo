import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Document extends MongooseDocument {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, type: String })
  content: string;

  @Prop({ default: 'other' })
  type: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  @Prop({ default: 'private' })
  visibility: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: 'draft' })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastEditedBy: Types.ObjectId;
}

export const DocumentSchema = SchemaFactory.createForClass(Document);
