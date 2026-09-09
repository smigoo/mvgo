import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Document } from './schemas/document.schema';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';

@Injectable()
export class DocumentService {
  constructor(
    @InjectModel(Document.name)
    private documentModel: Model<Document>,
  ) {}

  async create(userId: string, groupId: string, dto: CreateDocumentDto) {
    const doc = new this.documentModel({
      ...dto,
      ownerId: new Types.ObjectId(userId),
      groupId: new Types.ObjectId(groupId),
      lastEditedBy: new Types.ObjectId(userId),
    });
    return doc.save();
  }

  async findAll(groupId: string, userId?: string) {
    const query: any = { groupId: new Types.ObjectId(groupId) };
    if (userId) {
      query.ownerId = new Types.ObjectId(userId);
    }
    return this.documentModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async findOne(id: string) {
    return this.documentModel.findById(id).exec();
  }

  async update(id: string, userId: string, dto: UpdateDocumentDto) {
    return this.documentModel
      .findByIdAndUpdate(
        id,
        { ...dto, lastEditedBy: new Types.ObjectId(userId) },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async remove(id: string) {
    return this.documentModel.findByIdAndDelete(id).exec();
  }
}
