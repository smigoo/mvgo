// 2026-11-06 源文件丢失后由 dist 编译产物（dist/feedback/feedback.schema.js + .d.ts）机械重建，
// 逻辑与 dist 产物逐行对应。
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export const FEEDBACK_STATUSES = ['pending', 'processing', 'resolved', 'rejected'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const FEEDBACK_CATEGORIES = ['bug', 'quality', 'suggestion', 'other'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export interface FeedbackSnapshot {
  taskStatus?: string
  target?: string
  componentId?: string
  componentName?: string
  taskError?: string
  figmaUrl?: string
  modelsUsed?: string[]
  logExcerpt?: string
  logOriginalBytes?: number
  logBytes?: number
  logTruncated?: boolean
  tokenFingerprint?: string
  tokenFingerprintSource?: 'pipeline' | 'create'
  tokenFingerprintCurrent?: string
  tokenFingerprintChanged?: boolean
  included?: string[]
  pageUrl?: string
  /**
   * 🆕 2026-11-06 自动随附的任务产物图（引用路径，非勾选项、不复制文件）：
   * - input：Figma 输入图 resources/images/mc-preview.png
   * - output：产物渲染截图 .mc-gen/screenshots/<sessionId>-rendered.png
   * 展示经 GET /api/component/:cid/file?path=...&raw=1（归属校验在该接口内）。
   */
  taskImages?: {
    input?: string
    output?: string
  }
}

export interface FeedbackAttachment {
  filename: string
  storedName: string
  relativePath: string
  size: number
  mimeType: string
}

@Schema({ timestamps: true, collection: 'task_feedbacks' })
export class TaskFeedback {
  @Prop({ required: true, trim: true })
  sessionId: string

  @Prop({ required: true, trim: true })
  userId: string

  @Prop({ trim: true })
  username?: string

  @Prop({ required: true, type: String, enum: FEEDBACK_CATEGORIES, default: 'bug' })
  category: FeedbackCategory

  @Prop({ required: true })
  description: string

  @Prop({ type: String, enum: FEEDBACK_STATUSES, default: 'pending' })
  status: FeedbackStatus

  @Prop({ type: Object, default: {} })
  snapshot: FeedbackSnapshot

  @Prop({ type: Object, default: null })
  attachment?: FeedbackAttachment | null

  @Prop({ trim: true })
  adminNote?: string

  @Prop({ trim: true })
  handledBy?: string

  @Prop({ trim: true })
  handledByName?: string

  @Prop({ type: Date })
  handledAt?: Date

  @Prop({ trim: true, default: 'task-detail' })
  source?: string

  @Prop({ trim: true })
  userAgent?: string
}

export type TaskFeedbackDocument = TaskFeedback & Document

export const TaskFeedbackSchema = SchemaFactory.createForClass(TaskFeedback)
TaskFeedbackSchema.index({ status: 1, createdAt: -1 })
TaskFeedbackSchema.index({ sessionId: 1, userId: 1, createdAt: -1 })
TaskFeedbackSchema.index({ userId: 1, createdAt: -1 })
