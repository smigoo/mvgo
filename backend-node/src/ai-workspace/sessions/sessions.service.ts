import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiSession, AiSessionDocument } from '../schemas/ai-session.schema';
import { CreateSessionDto } from '../chat/dto/chat.dto';
import { UpdateSessionDto } from '../chat/dto/chat.dto';

@Injectable()
export class AiSessionsService {
  private readonly logger = new Logger(AiSessionsService.name);

  constructor(
    @InjectModel(AiSession.name) private sessionModel: Model<AiSessionDocument>,
  ) {}

  async findByUser(userId: string, projectId?: string): Promise<AiSessionDocument[]> {
    const filter: any = { userId: new Types.ObjectId(userId) };
    if (projectId) {
      filter.projectId = new Types.ObjectId(projectId);
    }
    return this.sessionModel
      .find(filter)
      .select('title projectId modelProvider modelName messageCount createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findById(id: string, userId?: string): Promise<AiSessionDocument | null> {
    const filter: any = { _id: new Types.ObjectId(id) };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    return this.sessionModel.findOne(filter).exec();
  }

  async create(dto: CreateSessionDto, userId: string): Promise<AiSessionDocument> {
    const session = new this.sessionModel({
      projectId: new Types.ObjectId(dto.projectId),
      userId: new Types.ObjectId(userId),
      title: dto.title || '新会话',
      modelProvider: dto.modelProvider || '',
      modelName: dto.modelName || '',
    });
    return session.save();
  }

  async updateTitle(id: string, dto: UpdateSessionDto, userId?: string): Promise<AiSessionDocument | null> {
    const filter: any = { _id: new Types.ObjectId(id) };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    return this.sessionModel
      .findOneAndUpdate(filter, { $set: { title: dto.title } }, { returnDocument: 'after' })
      .exec();
  }

  async delete(id: string, userId: string): Promise<AiSessionDocument | null> {
    return this.sessionModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    }).exec();
  }

  async pushMessages(id: string, messages: Array<{ role: string; content: string; createdAt?: Date }>, userId?: string): Promise<void> {
    const filter: any = { _id: new Types.ObjectId(id) };
    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    await this.sessionModel.updateOne(
      filter,
      {
        $push: {
          messages: {
            $each: messages.map((m) => ({ ...m, createdAt: m.createdAt || new Date() })),
          },
        },
        $inc: { messageCount: messages.length },
        $set: { updatedAt: new Date() },
      },
    );
  }
}
