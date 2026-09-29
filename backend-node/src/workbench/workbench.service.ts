import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument, Message } from './conversation.schema';
import { WorkbenchGroup, WorkbenchGroupDocument } from './group.schema';import { runWorkbenchAgent } from './workbench-agent';
import { ToolContext } from './workbench-tools';
import { TasksService } from '../tasks/tasks.service';
import { ComponentService } from '../component/component.service';
import { TaskStatsService } from '../task-stats/task-stats.service';
import { UserAiConfigService } from '../config/user-ai-config.service';
import { Phase2Service } from '../phase2/phase2.service';
import { LiteService } from '../lite/lite.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { ProgressService } from '../progress/progress.service';

@Injectable()
export class WorkbenchService {
  private readonly logger = new Logger(WorkbenchService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(WorkbenchGroup.name)
    private readonly groupModel: Model<WorkbenchGroupDocument>,
    private readonly tasksService: TasksService,
    private readonly componentService: ComponentService,
    private readonly taskStatsService: TaskStatsService,
    private readonly userAiConfigService: UserAiConfigService,
    private readonly phase2Service: Phase2Service,
    private readonly liteService: LiteService,
    private readonly queueService: TaskQueueService,
    private readonly progressService: ProgressService,
  ) {}

  /**
   * 创建新对话
   */
  async createConversation(userId: string, title?: string): Promise<Conversation> {
    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const conversation = new this.conversationModel({
      conversationId,
      userId: new Types.ObjectId(userId),
      title: title || '新对话',
      messages: [],
      context: {},
      lastActiveAt: new Date(),
      messageCount: 0,
    });

    await conversation.save();
    this.logger.log(`Created conversation: ${conversationId}`);
    return conversation;
  }

  /**
   * 获取用户的对话列表
   * 当前仅返回用户自己的对话，shared 功能预留
   */
  async listConversations(userId: string, limit = 20): Promise<Conversation[]> {
    return this.conversationModel
      .find({
        $or: [
          { userId: new Types.ObjectId(userId) },
          // 预留：后续支持 sharedWith 包含当前用户
          // { shared: true, sharedWith: new Types.ObjectId(userId) },
        ],
      })
      .sort({ lastActiveAt: -1 })
      .limit(limit)
      .select('-messages') // 列表不返回消息详情
      .lean();
  }

  /**
   * 获取单个对话详情（仅创建者或共享用户可见）
   */
  async getConversation(conversationId: string, userId: string): Promise<Conversation | null> {
    return this.conversationModel
      .findOne({
        conversationId,
        $or: [
          { userId: new Types.ObjectId(userId) },
          // 预留：后续支持 sharedWith 包含当前用户
          // { shared: true, sharedWith: new Types.ObjectId(userId) },
        ],
      })
      .lean();
  }

  /**
   * 发送消息并获取 AI 回复
   */
  async sendMessage(
    conversationId: string,
    userId: string,
    content: string,
    attachments?: any[],
    pendingToolCall?: any,
  ): Promise<{
    userMessage: Message;
    assistantMessage: Message;
    conversation: Conversation;
  }> {
    // 1. 加载对话
    const conversation = await this.conversationModel.findOne({
      conversationId,
      userId: new Types.ObjectId(userId),
    });

    if (!conversation) {
      throw new Error('对话不存在或无权访问');
    }

    // 2. 创建用户消息
    const userMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content,
      cards: [],
      createdAt: new Date(),
      metadata: { attachments, pendingToolCall },
    };

    conversation.messages.push(userMessage);
    conversation.messageCount++;
    conversation.lastActiveAt = new Date();

    // 3. 构建 Tool 上下文
    const toolContext: ToolContext = {
      userId,
      tasksService: this.tasksService,
      componentService: this.componentService,
      taskStatsService: this.taskStatsService,
      phase2Service: this.phase2Service,
      liteService: this.liteService,
      queueService: this.queueService,
      progressService: this.progressService,
    };

    // 4. 运行 Agent
    this.logger.log(`Running agent for conversation=${conversationId}`);
    
    // 透传 metadata.attachments：截图/拖拽的 base64 靠它进 agent，
    // 否则 create_component_from_screenshot 只能拿到占位 'uploaded://screenshot'
    const agentMessages = conversation.messages.map(m => ({
      role: m.role as any,
      content: m.content,
      cards: m.cards,
      metadata: m.metadata,
    }));

    const agentResult = await runWorkbenchAgent({
      conversationId,
      userId,
      messages: agentMessages,
      currentComponentId: conversation.currentComponentId,
      toolContext,
    });

    // 5. 创建助手消息
    const assistantMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      content: agentResult.response,
      cards: agentResult.cards,
      createdAt: new Date(),
    };

    conversation.messages.push(assistantMessage);
    conversation.messageCount++;

    // 6. 更新对话标题（如果是第一条消息）
    if (conversation.messageCount <= 2) {
      conversation.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
    }

    // 7. 保存并返回
    await conversation.save();

    this.logger.log(`Message sent, conversation=${conversationId}, messageCount=${conversation.messageCount}`);

    // 重新获取最新的对话数据（确保返回完整的消息列表）
    const updatedConversation = await this.getConversation(conversationId, userId);
    if (!updatedConversation) {
      throw new Error('对话保存后无法读取，请重试');
    }

    return {
      userMessage,
      assistantMessage,
      conversation: updatedConversation,
    };
  }

  /**
   * 删除对话
   */
  async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const result = await this.conversationModel.deleteOne({
      conversationId,
      userId: new Types.ObjectId(userId),
    });
    return result.deletedCount > 0;
  }

  /**
   * 更新对话上下文（如当前组件 ID）
   */
  async updateContext(
    conversationId: string,
    userId: string,
    context: Record<string, any>,
  ): Promise<Conversation | null> {
    return this.conversationModel
      .findOneAndUpdate(
        {
          conversationId,
          userId: new Types.ObjectId(userId),
        },
        {
          $set: {
            context,
            lastActiveAt: new Date(),
          },
        },
        { new: true },
      )
      .lean();
  }

  /**
   * 搜索对话
   */
  async searchConversations(
    userId: string,
    query: string,
    limit = 10,
  ): Promise<Conversation[]> {
    return this.conversationModel
      .find({
        userId: new Types.ObjectId(userId),
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { 'messages.content': { $regex: query, $options: 'i' } },
        ],
      })
      .sort({ lastActiveAt: -1 })
      .limit(limit)
      .select('-messages')
      .lean();
  }

  /**
   * 获取对话统计
   */
  async getConversationStats(userId: string): Promise<{
    totalConversations: number;
    totalMessages: number;
    avgMessagesPerConversation: number;
    mostActiveDay: string;
  }> {
    const conversations = await this.conversationModel
      .find({ userId: new Types.ObjectId(userId) })
      .lean();

    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, c) => sum + (c.messageCount || 0), 0);
    const avgMessagesPerConversation = totalConversations > 0 ? totalMessages / totalConversations : 0;

    // 找出最活跃的天
    const dayCounts: Record<string, number> = {};
    for (const conv of conversations) {
      const day = new Date(conv.lastActiveAt).toISOString().split('T')[0];
      dayCounts[day] = (dayCounts[day] || 0) + (conv.messageCount || 0);
    }

    const mostActiveDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    return {
      totalConversations,
      totalMessages,
      avgMessagesPerConversation: Math.round(avgMessagesPerConversation * 10) / 10,
      mostActiveDay,
    };
  }

  /**
   * 重命名对话
   */
  async renameConversation(
    conversationId: string,
    userId: string,
    title: string,
  ): Promise<Conversation | null> {
    return this.conversationModel
      .findOneAndUpdate(
        {
          conversationId,
          userId: new Types.ObjectId(userId),
        },
        {
          $set: {
            title,
            lastActiveAt: new Date(),
          },
        },
        { new: true },
      )
      .lean();
  }

  /**
   * 批量删除对话
   */
  async batchDeleteConversations(
    conversationIds: string[],
    userId: string,
  ): Promise<{ deletedCount: number }> {
    const result = await this.conversationModel.deleteMany({
      conversationId: { $in: conversationIds },
      userId: new Types.ObjectId(userId),
    });
    
    this.logger.log(`Batch deleted ${result.deletedCount} conversations for user ${userId}`);
    return { deletedCount: result.deletedCount };
  }

  /**
   * 移动对话到分组
   */
  async moveToGroup(
    conversationIds: string[],
    userId: string,
    group: string | null,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.conversationModel.updateMany(
      {
        conversationId: { $in: conversationIds },
        userId: new Types.ObjectId(userId),
      },
      {
        $set: {
          group: group || undefined,
          lastActiveAt: new Date(),
        },
      },
    );

    this.logger.log(`Moved ${result.modifiedCount} conversations to group "${group}" for user ${userId}`);
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * 获取用户的所有分组（带对话计数）
   *
   * 口径：`workbench_groups` 表的分组 ∪ 对话文档里实际用到的 group 值。
   * 这样即使分组文档被删、或历史对话遗留了 group 字符串，列表也不会丢项。
   *
   * 严格按 `userId` 过滤 —— 每个用户只看到自己的分组。
   */
  async getGroups(userId: string): Promise<{ name: string; count: number }[]> {
    const uid = new Types.ObjectId(userId);

    // 1. 分组表里的分组（可能是空分组，count=0）
    const groupDocs = await this.groupModel.find({ userId: uid }).lean();

    // 2. 对话里实际用到的分组（含计数）
    const usedGroups = await this.conversationModel.aggregate([
      { $match: { userId: uid, group: { $ne: null } } },
      { $group: { _id: '$group', count: { $sum: 1 } } },
    ]);

    const counts = new Map<string, number>();
    for (const g of usedGroups) {
      if (g._id) counts.set(g._id as string, g.count as number);
    }

    // 合并：分组表优先（保证空分组可见），对话计数覆盖
    const names = new Set<string>();
    for (const doc of groupDocs) names.add(doc.name);
    for (const name of counts.keys()) names.add(name);

    return [...names]
      .map(name => ({ name, count: counts.get(name) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  /**
   * 新建分组（每用户独立，同名不可重复）
   */
  async createGroup(userId: string, name: string): Promise<{ name: string; count: number }> {
    const uid = new Types.ObjectId(userId);
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('分组名称不能为空');
    }

    const existing = await this.groupModel.findOne({ userId: uid, name: trimmed }).lean();
    if (existing) {
      throw new Error(`分组「${trimmed}」已存在`);
    }

    await this.groupModel.create({ userId: uid, name: trimmed, order: 0 });
    this.logger.log(`Created group "${trimmed}" for user ${userId}`);
    return { name: trimmed, count: 0 };
  }

  /**
   * 重命名分组
   * 同步更新该用户下所有归属此分组的对话，避免出现「孤儿 group 值」。
   */
  async renameGroup(
    userId: string,
    oldName: string,
    newName: string,
  ): Promise<{ modifiedCount: number }> {
    const uid = new Types.ObjectId(userId);
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      throw new Error('分组名称不能为空');
    }
    if (trimmed === oldName) {
      return { modifiedCount: 0 };
    }

    const conflict = await this.groupModel.findOne({ userId: uid, name: trimmed }).lean();
    if (conflict) {
      throw new Error(`分组「${trimmed}」已存在`);
    }

    // 更新分组表
    await this.groupModel.updateOne(
      { userId: uid, name: oldName },
      { $set: { name: trimmed } },
    );

    // 同步更新对话的 group 字段
    const result = await this.conversationModel.updateMany(
      { userId: uid, group: oldName },
      { $set: { group: trimmed } },
    );

    this.logger.log(`Renamed group "${oldName}" -> "${trimmed}" for user ${userId}, moved ${result.modifiedCount} conversations`);
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * 删除分组
   *
   * 硬约束：**组内仍有对话时禁止删除**（避免对话变成孤儿/被误删）。
   * 调用方应先引导用户把对话移出分组。
   */
  async deleteGroup(
    userId: string,
    name: string,
    force = false,
  ): Promise<{ deletedConversations: number }> {
    const uid = new Types.ObjectId(userId);

    const conversationCount = await this.conversationModel.countDocuments({
      userId: uid,
      group: name,
    });

    if (conversationCount > 0 && !force) {
      throw new Error(
        `分组「${name}」内还有 ${conversationCount} 个对话，不能删除。请先把对话移出分组。`,
      );
    }

    await this.groupModel.deleteOne({ userId: uid, name });
    this.logger.log(`Deleted group "${name}" for user ${userId} (conversations=${conversationCount}, force=${force})`);
    return { deletedConversations: conversationCount };
  }

  /**
   * 获取对话的工具凭据配置（Figma/Apifox/GitLab）
   * 返回脱敏后的凭据（仅显示是否有值，不显示原始值）
   * 优先级：对话级 > 用户级配置（MongoDB user_ai_configs）
   */
  async getToolCredentials(
    conversationId: string,
    userId: string,
  ): Promise<{
    figmaToken: boolean;
    apifoxToken: boolean;
    gitlabToken: boolean;
    gitlabProjectUrl: boolean;
  } | null> {
    const conversation = await this.conversationModel
      .findOne({
        conversationId,
        userId: new Types.ObjectId(userId),
      })
      .select('toolCredentials')
      .lean();

    if (!conversation) return null;

    const creds = conversation.toolCredentials || {};

    // 对话级有值就用对话级，否则回退到用户级配置（MongoDB）
    const userConfig = await this.userAiConfigService.getUserConfig(userId);
    const userCfg = userConfig || {};
    const figmaToken = creds.figmaToken || userCfg.figmaToken;
    const apifoxToken = creds.apifoxToken || userCfg.apifoxToken;
    const gitlabToken = creds.gitlabToken || userCfg.gitlabToken;
    const gitlabProjectUrl = creds.gitlabProjectUrl || userCfg.gitlabProjectUrl;

    return {
      figmaToken: !!figmaToken,
      apifoxToken: !!apifoxToken,
      gitlabToken: !!gitlabToken,
      gitlabProjectUrl: !!gitlabProjectUrl,
    };
  }

  /**
   * 更新对话的工具凭据配置
   * 支持部分更新，空字符串表示清除该凭据
   */
  async updateToolCredentials(
    conversationId: string,
    userId: string,
    credentials: {
      figmaToken?: string;
      apifoxToken?: string;
      gitlabToken?: string;
      gitlabProjectUrl?: string;
    },
  ): Promise<{
    figmaToken: boolean;
    apifoxToken: boolean;
    gitlabToken: boolean;
    gitlabProjectUrl: boolean;
  } | null> {
    const conversation = await this.conversationModel.findOne({
      conversationId,
      userId: new Types.ObjectId(userId),
    });

    if (!conversation) return null;

    // 合并现有凭据，空字符串表示清除
    const current = conversation.toolCredentials || {};
    const updated: any = { ...current };

    if (credentials.figmaToken !== undefined) {
      updated.figmaToken = credentials.figmaToken || undefined;
    }
    if (credentials.apifoxToken !== undefined) {
      updated.apifoxToken = credentials.apifoxToken || undefined;
    }
    if (credentials.gitlabToken !== undefined) {
      updated.gitlabToken = credentials.gitlabToken || undefined;
    }
    if (credentials.gitlabProjectUrl !== undefined) {
      updated.gitlabProjectUrl = credentials.gitlabProjectUrl || undefined;
    }

    conversation.toolCredentials = updated;
    conversation.lastActiveAt = new Date();
    await conversation.save();

    this.logger.log(`Updated tool credentials for conversation ${conversationId}`);

    return {
      figmaToken: !!updated.figmaToken,
      apifoxToken: !!updated.apifoxToken,
      gitlabToken: !!updated.gitlabToken,
      gitlabProjectUrl: !!updated.gitlabProjectUrl,
    };
  }
}
