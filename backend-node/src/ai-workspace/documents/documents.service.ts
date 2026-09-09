import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiDocument, AiDocumentDocument } from '../schemas/ai-document.schema';
import { UpdateDocumentDto, AppendDocumentDto } from './dto/document.dto';

@Injectable()
export class AiDocumentsService {
  private readonly logger = new Logger(AiDocumentsService.name);

  constructor(
    @InjectModel(AiDocument.name) private documentModel: Model<AiDocumentDocument>,
  ) {}

  async findBySession(sessionId: string, userId?: string): Promise<AiDocumentDocument[]> {
    const filter: any = { sessionId: new Types.ObjectId(sessionId), status: 'active' };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    return this.documentModel
      .find(filter)
      .sort({ sortOrder: 1 })
      .select('-__v')
      .exec();
  }

  async findById(id: string, userId?: string): Promise<AiDocumentDocument | null> {
    const filter: any = { _id: new Types.ObjectId(id) };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    return this.documentModel.findOne(filter).select('-__v').exec();
  }

  async create(params: {
    sessionId: string;
    projectId: string;
    userId: string;
    title?: string;
    content?: string;
  }): Promise<AiDocumentDocument> {
    const doc = new this.documentModel({
      sessionId: new Types.ObjectId(params.sessionId),
      projectId: new Types.ObjectId(params.projectId),
      userId: new Types.ObjectId(params.userId),
      title: params.title || '未命名文档',
      content: params.content || '',
      sortOrder: 0,
    });
    return doc.save();
  }

  async ensureDocument(params: {
    sessionId: string;
    projectId: string;
    userId: string;
    title?: string;
  }): Promise<AiDocumentDocument> {
    const existing = await this.documentModel
      .findOne({
        sessionId: new Types.ObjectId(params.sessionId),
        userId: new Types.ObjectId(params.userId),
        status: 'active',
      })
      .exec();
    if (existing) return existing;
    return this.create(params);
  }

  async update(id: string, dto: UpdateDocumentDto, userId?: string): Promise<AiDocumentDocument | null> {
    const filter: any = { _id: new Types.ObjectId(id) };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    return this.documentModel
      .findOneAndUpdate(filter, { $set: dto }, { returnDocument: 'after' })
      .select('-__v')
      .exec();
  }

  async appendContent(id: string, dto: AppendDocumentDto, userId?: string): Promise<AiDocumentDocument | null> {
    const filter: any = { _id: new Types.ObjectId(id) };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    const doc = await this.documentModel.findOne(filter).exec();
    if (!doc) return null;
    const newContent = (doc.content || '') + dto.content;
    return this.documentModel
      .findByIdAndUpdate(id, { $set: { content: newContent } }, { returnDocument: 'after' })
      .select('-__v')
      .exec();
  }

  async delete(id: string, userId: string): Promise<AiDocumentDocument | null> {
    return this.documentModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
      { $set: { status: 'deleted' } },
      { returnDocument: 'after' },
    ).exec();
  }
}
