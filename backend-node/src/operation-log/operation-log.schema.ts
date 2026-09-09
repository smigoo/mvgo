import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OperationLogDocument = OperationLog & Document;

/**
 * 操作日志（每用户审计流水）。
 * 由全局 OperationLogInterceptor 在每次已路由的 HTTP 请求完成后写入（fire-and-forget，不阻塞响应）。
 * body / query 中的密钥字段在写入前已脱敏，不落明文。
 */
@Schema({ collection: 'operation_logs', timestamps: true })
export class OperationLog {
  /** 操作人（关联 User）；匿名 / 未登录请求为 null */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true, sparse: true })
  userId?: Types.ObjectId | null;

  /** HTTP 方法 */
  @Prop({ required: true, index: true })
  method: string;

  /** 请求路径（不含查询串） */
  @Prop({ required: true, index: true })
  path: string;

  /** 查询参数（已脱敏） */
  @Prop({ type: Object })
  query?: Record<string, any>;

  /** 请求体（已脱敏；超大时省略） */
  @Prop({ type: Object })
  body?: Record<string, any>;

  /** 响应状态码 */
  @Prop({ required: true, index: true })
  statusCode: number;

  /** 客户端 IP */
  @Prop({ index: true, sparse: true })
  ip?: string;

  /** 耗时（毫秒） */
  @Prop({ required: true })
  durationMs: number;

  /** 请求来源 UA */
  @Prop()
  userAgent?: string;

  /** 失败时的错误摘要（已截断 / 脱敏） */
  @Prop()
  errorMessage?: string;
}

export const OperationLogSchema = SchemaFactory.createForClass(OperationLog);
