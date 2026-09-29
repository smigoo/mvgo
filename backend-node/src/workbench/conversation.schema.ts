import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

/**
 * 消息卡片类型
 */
export type CardType =
  | 'progress'      // 进度卡
  | 'preview'       // 预览卡
  | 'confirm'       // 确认卡
  | 'diff'          // 代码变更卡
  | 'stats'         // 统计卡
  | 'list'          // 列表卡
  | 'action';       // 操作卡

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 消息卡片数据
 */
@Schema({ _id: false })
export class MessageCard {
  @Prop({ type: String, enum: ['progress', 'preview', 'confirm', 'diff', 'stats', 'list', 'action'], required: true })
  type: CardType;

  @Prop({ type: Object, required: true })
  data: Record<string, any>;
}

export const MessageCardSchema = SchemaFactory.createForClass(MessageCard);

/**
 * 对话消息
 */
@Schema({ _id: false })
export class Message {
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, enum: ['user', 'assistant', 'system'], required: true })
  role: MessageRole;

  @Prop({ type: String })
  content: string;

  @Prop({ type: [MessageCardSchema], default: [] })
  cards: MessageCard[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: String })
  toolCallId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

/**
 * 对话分组
 */
@Schema({ _id: false })
export class ConversationGroup {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String })
  color?: string;

  @Prop({ type: Number, default: 0 })
  order: number;
}

export const ConversationGroupSchema = SchemaFactory.createForClass(ConversationGroup);

/**
 * 对话会话
 */
@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: String, required: true, index: true })
  conversationId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: [MessageSchema], default: [] })
  messages: Message[];

  @Prop({ type: String, index: true })
  currentComponentId?: string;

  @Prop({ type: Object, default: {} })
  context: Record<string, any>;

  @Prop({ type: Date })
  lastActiveAt: Date;

  @Prop({ type: Number, default: 0 })
  messageCount: number;

  /**
   * 对话分组名称
   * - 空/undefined: 未分组（默认）
   * - 字符串: 分组名
   */
  @Prop({ type: String, index: true })
  group?: string;

  /**
   * 是否置顶
   */
  @Prop({ type: Boolean, default: false })
  pinned?: boolean;

  /**
   * 对话级工具凭据覆盖（Figma / Apifox / GitLab）
   * - 每个字段可选，缺省时回退到全局配置（ai-config.json）
   * - 保存时脱敏返回，读取时不返回原始值
   */
  @Prop({
    type: {
      figmaToken: { type: String },
      apifoxToken: { type: String },
      gitlabToken: { type: String },
      gitlabProjectUrl: { type: String },
    },
    default: {},
  })
  toolCredentials?: {
    figmaToken?: string;
    apifoxToken?: string;
    gitlabToken?: string;
    gitlabProjectUrl?: string;
  };

  /**
   * 是否共享对话（预留字段，暂不启用）
   * - false/undefined: 仅创建者可见（默认）
   * - true: 团队可见（后续开发共享功能时启用）
   */
  @Prop({ type: Boolean, default: false })
  shared?: boolean;

  /**
   * 共享给的用户 ID 列表（预留字段）
   * 后续可支持指定用户/角色可见
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWith?: Types.ObjectId[];
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// 索引优化
ConversationSchema.index({ userId: 1, lastActiveAt: -1 });
ConversationSchema.index({ 'context.currentComponentId': 1 });
