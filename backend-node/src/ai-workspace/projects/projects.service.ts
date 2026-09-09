import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiProject, AiProjectDocument } from '../schemas/ai-project.schema';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class AiProjectsService {
  private readonly logger = new Logger(AiProjectsService.name);

  constructor(
    @InjectModel(AiProject.name) private projectModel: Model<AiProjectDocument>,
  ) {}

  async findAll(userId: string): Promise<AiProjectDocument[]> {
    return this.projectModel
      .find({ status: 'active', adminUserIds: new Types.ObjectId(userId) })
      .select('-__v')
      .exec();
  }

  async findById(id: string, userId?: string): Promise<AiProjectDocument | null> {
    const filter: any = { _id: new Types.ObjectId(id) };
    if (userId) {
      filter.adminUserIds = new Types.ObjectId(userId);
    }
    return this.projectModel.findOne(filter).select('-__v').exec();
  }

  async create(dto: CreateProjectDto, userId: string): Promise<AiProjectDocument> {
    const project = new this.projectModel({
      ...dto,
      adminUserIds: [new Types.ObjectId(userId)],
    });
    return project.save();
  }

  async update(id: string, dto: UpdateProjectDto, userId?: string): Promise<AiProjectDocument | null> {
    const filter: any = { _id: new Types.ObjectId(id) };
    if (userId) {
      filter.adminUserIds = new Types.ObjectId(userId);
    }
    return this.projectModel
      .findOneAndUpdate(filter, { $set: dto }, { returnDocument: 'after' })
      .select('-__v')
      .exec();
  }

  async archive(id: string, userId?: string): Promise<AiProjectDocument | null> {
    const filter: any = { _id: new Types.ObjectId(id) };
    if (userId) {
      filter.adminUserIds = new Types.ObjectId(userId);
    }
    return this.projectModel
      .findOneAndUpdate(filter, { $set: { status: 'archived' } }, { returnDocument: 'after' })
      .exec();
  }
}
