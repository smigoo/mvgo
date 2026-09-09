import { Model, Types } from 'mongoose';

/**
 * 解析组件归属组：暂无分组概念时，按用户 uid 落到其「私人组」。
 *
 * 私人组由 auth.service.ensureUserPrivateGroup 在登录时幂等创建，
 * groupId 即该 Group 文档的 _id（合法 ObjectId），写入 groupMemberModel。
 *
 * 这样每个用户天然一组，且 groupId 保持合法 ObjectId，不破坏「groupId=Group._id」
 * 的全局契约，也不削弱各 service 中 ObjectId.isValid 的目录落库关卡。
 *
 * 规则：
 * - 前端显式传 groupId 且非 default-group：尊重（未来分组功能使用）。
 * - 未传 / 传 default-group：查 groupMemberModel 取私人组 _id。
 * - 缺失 userId 或查不到成员：回退 default-group（极端兜底，不破坏链路）。
 */
export async function resolvePrivateGroupId(
  dtoGroupId: string | undefined,
  userId: string | undefined,
  groupMemberModel: Model<any>,
): Promise<string> {
  if (dtoGroupId && dtoGroupId !== 'default-group') return dtoGroupId;
  if (!userId) return 'default-group';
  const member = await groupMemberModel
    .findOne({ userId: new Types.ObjectId(userId) })
    .exec();
  return member?.groupId ? member.groupId.toString() : 'default-group';
}
