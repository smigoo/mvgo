/**
 * PermissionAdapter — 权限适配器接口
 *
 * 这是迁移到 QS 权限系统的关键契约。
 * 业务代码（Guard / Controller）只依赖此接口，不关心具体实现。
 *
 * 当前实现：NodePermissionAdapter（查 MongoDB GroupMember）
 * 未来实现：QSPermissionAdapter（调 QS 权限中心 HTTP API）
 *
 * 迁移时只需新建一个实现此接口的类，替换 provider 注入即可，
 * Controller / Service / 前端代码零改动。
 *
 * @see /docs/permission-migration-guide.md QS 对接迁移指南
 */
export abstract class PermissionAdapter {
  /**
   * 检查用户是否拥有指定权限码
   *
   * @param userId   用户 ID（session.userId）
   * @param permCode 权限码，格式 'resource:action'（如 'component:create'）
   * @returns true=有权限, false=无权限
   *
   * 实现规则（所有 Adapter 必须遵守）：
   * 1. admin 角色自动返回 true（全量放行）
   * 2. member 角色检查 permissions 数组是否包含该权限码
   * 3. 用户不存在或未加入任何群组时返回 false
   */
  abstract checkPermission(userId: string, permCode: string): Promise<boolean>;

  /**
   * 获取用户全部权限码列表
   *
   * 用于 /api/auth/current 返回给前端，前端据此控制按钮显隐。
   *
   * @returns 权限码数组。admin 返回 ALL_PERMISSIONS，member 返回其 permissions 数组。
   *          同时返回 role 字段供前端判断。
   */
  abstract getUserPermissions(userId: string): Promise<{
    role: string;
    permissions: string[];
  }>;
}
