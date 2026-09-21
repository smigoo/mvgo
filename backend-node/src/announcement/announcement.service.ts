import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Announcement, AnnouncementDocument } from './announcement.schema';

@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  constructor(
    @InjectModel(Announcement.name)
    private announcementModel: Model<AnnouncementDocument>,
  ) {}

  /**
   * 创建公告（管理员）
   */
  async create(data: Partial<Announcement>): Promise<Announcement> {
    try {
      const announcement = new this.announcementModel(data);
      const saved = await announcement.save();
      this.logger.log(`公告创建成功: ${saved._id}`);
      return saved;
    } catch (error) {
      this.logger.error(`创建公告失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取公告列表（管理员，包含所有状态）
   */
  async findAllForAdmin(query: {
    page?: number;
    pageSize?: number;
    active?: boolean;
    keyword?: string;
  }): Promise<{ list: Announcement[]; total: number }> {
    const { page = 1, pageSize = 20, active, keyword } = query;
    const skip = (page - 1) * pageSize;

    const filter: any = {};
    if (active !== undefined) {
      filter.active = active;
    }
    if (keyword) {
      filter.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { content: { $regex: keyword, $options: 'i' } },
        { version: { $regex: keyword, $options: 'i' } },
      ];
    }

    const [list, total] = await Promise.all([
      this.announcementModel
        .find(filter)
        .sort({ priority: -1, publishAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.announcementModel.countDocuments(filter),
    ]);

    return { list, total };
  }

  /**
   * 获取当前有效公告（用户端，只返回 active=true 且在有效期内）
   */
  async findActiveForUser(): Promise<Announcement[]> {
    const now = new Date();
    const filter = {
      active: true,
      $and: [
        {
          $or: [
            { publishAt: { $lte: now } },
            { publishAt: null },
            { publishAt: { $exists: false } },
          ],
        },
        {
          $or: [
            { expireAt: { $gte: now } },
            { expireAt: null },
            { expireAt: { $exists: false } },
          ],
        },
      ],
    };

    return this.announcementModel
      .find(filter)
      .sort({ priority: -1, publishAt: -1 })
      .limit(50)
      .lean();
  }

  /**
   * 获取单个公告详情
   */
  async findById(id: string): Promise<Announcement> {
    const announcement = await this.announcementModel.findById(id).lean();
    if (!announcement) {
      throw new NotFoundException(`公告不存在: ${id}`);
    }
    return announcement;
  }

  /**
   * 更新公告
   */
  async update(id: string, data: Partial<Announcement>): Promise<Announcement> {
    try {
      const updated = await this.announcementModel
        .findByIdAndUpdate(id, { $set: data }, { new: true })
        .lean();
      if (!updated) {
        throw new NotFoundException(`公告不存在: ${id}`);
      }
      this.logger.log(`公告更新成功: ${id}`);
      return updated;
    } catch (error) {
      this.logger.error(`更新公告失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 删除公告
   */
  async delete(id: string): Promise<void> {
    try {
      const result = await this.announcementModel.findByIdAndDelete(id);
      if (!result) {
        throw new NotFoundException(`公告不存在: ${id}`);
      }
      this.logger.log(`公告删除成功: ${id}`);
    } catch (error) {
      this.logger.error(`删除公告失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 切换公告状态（启用/禁用）
   */
  async toggleActive(id: string): Promise<Announcement> {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) {
      throw new NotFoundException(`公告不存在: ${id}`);
    }
    announcement.active = !announcement.active;
    await announcement.save();
    this.logger.log(`公告状态切换: ${id} -> ${announcement.active}`);
    return announcement;
  }
}
