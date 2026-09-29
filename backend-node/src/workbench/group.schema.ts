import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WorkbenchGroupDocument = WorkbenchGroup & Document;

/**
 * 工作台对话分组
 *
 * ⚠️ 为何类名必须是 WorkbenchGroup 而不是 Group：
 * admin.module.ts:29 已注册名为 `Group` 的 model（指向旧 `groups` 集合，含必填 adminId）。
 * Mongoose model 全局按名字唯一，若此处同名会与之冲突 ⇒ 插入时报
 * `Group validation failed: adminId: Path 'adminId' is required`（已实锤）。
 * 故本文件命名 WorkbenchGroup，并显式指向独立集合 `workbench_groups`。
 *
 * 设计约束：
 * - **每用户数据独立**：所有查询必须带 `userId` 条件，禁止跨用户读写。
 * - **同名分组不允许重复**：`userId + name` 唯一索引，由 DB 兜底。
 * - 分组可被删除，但**组内仍有对话时禁止删除**（由 service 层拦截）。
 */
@Schema({ collection: 'workbench_groups', timestamps: true })
export class WorkbenchGroup {
  /**
   * 所属用户 ID（数据隔离的唯一依据）
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /**
   * 分组名称
   */
  @Prop({ type: String, required: true })
  name: string;

  /**
   * 排序序号（越小越靠前）
   */
  @Prop({ type: Number, default: 0 })
  order: number;
}

export const WorkbenchGroupSchema = SchemaFactory.createForClass(WorkbenchGroup);

// userId + name 唯一 —— 同一用户下分组名不可重复
WorkbenchGroupSchema.index({ userId: 1, name: 1 }, { unique: true });
