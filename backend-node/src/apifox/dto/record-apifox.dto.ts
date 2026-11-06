import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class RecordApifoxDto {
  @IsString()
  taskId: string;

  @IsString()
  moduleName: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileNames?: string[];

  @IsOptional()
  @IsNumber()
  apiCount?: number;

  @IsOptional()
  @IsString()
  zipPath?: string;

  @IsOptional()
  @IsString()
  downloadUrl?: string;

  /**
   * 归属用户 ID（落库字段，`ApifoxTask.ownerId`）。
   *
   * 🔴 2026-11-06 为什么必须显式声明（缺陷根因）：
   *   `main.ts` 全局 `ValidationPipe({ whitelist: true })` 会把**未在本类声明**
   *   的 body 字段**静默剥离**（不报错、不打日志）。apifox-api-generator Skill
   *   步骤 5 按 `SKILL.md` 发送的是 `userId`，而本 DTO 原先既无 `userId` 也无
   *   `ownerId` ⇒ 归属信息在进入 service 前就没了 ⇒ 落库 task 永远无 owner
   *   ⇒ `listMine` 的 `|| !t.ownerId` 兜底让这些记录对**所有登录用户**可见，
   *   且 `assertTaskOwner`（`if (ownerId && task.ownerId && …)`）对它们全程空转。
   *
   * 取值优先级（唯一实现处 `ApifoxController.record`）：会话身份 > ownerId > userId。
   * 另见 `ApifoxService.normalizeOwnerId`：非平台用户 id（如 Skill 缺省
   * `default-user`）**不会**落库 —— 否则记录会对所有人（含作者）不可见。
   */
  @IsOptional()
  @IsString()
  ownerId?: string;

  /**
   * `SKILL.md` 实际发送的归属字段名（历史契约，勿删）。
   *
   * 与 `ownerId` 同时存在是刻意的：Skill 已发布、改 SKILL.md 无法覆盖用户手里
   * 的旧副本，服务端必须同时接受两个字段名，由 controller 归一后落 `ownerId`。
   */
  @IsOptional()
  @IsString()
  userId?: string;
}
