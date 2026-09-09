/**
 * 统一的管理员角色判定工具。
 *
 * 判定优先级（任一命中即为 admin）：
 *  1. 用户记录上的 isAdmin 标志（数据库持久化，由「用户管理」界面动态设置）—— 主判定
 *  2. DEFAULT_ADMIN_UIDS 环境变量白名单（bootstrap / 后路，防止全员丢失管理员导致锁死）
 *  3. QS 权限中心下发的管理员权限码（仅 PERMISSION_SOURCE=qs 时生效）
 *
 * 设计取舍：
 * - node 本地模式下 ensureUserPrivateGroup 会给每人私人组写入 role:'admin'，
 *   为避免「人人都是管理员」，node 模式不采纳 permissionAdapter 的 role==='admin'，
 *   仅 qs 模式才信任权限中心下发的 admin。
 * - 该工具被 admin.service.assertAdmin 与 auth.controller.getCurrentUser 共用，
 *   保证「后端鉴权」与「前端导航角色」完全一致。
 */
import { ROLES } from '../common/constants';

export function resolveAdminRole(params: {
  isAdminFlag?: boolean;
  permissionRole?: string;
  userUid?: string;
  defaultAdminUids?: string[];
  permissionSource?: string;
}): typeof ROLES.ADMIN | typeof ROLES.MEMBER {
  // 1. 数据库 per-user 标志（UI 可动态设置）—— 主判定
  if (params.isAdminFlag === true) return ROLES.ADMIN;

  // 2. 环境变量白名单（bootstrap / 后路）
  const uids = params.defaultAdminUids || [];
  if (uids.length > 0 && params.userUid && uids.includes(params.userUid)) {
    return ROLES.ADMIN;
  }

  // 3. QS 权限中心管理员权限码（仅 qs 模式信任）
  if (params.permissionRole === ROLES.ADMIN && (params.permissionSource || 'node') === 'qs') {
    return ROLES.ADMIN;
  }

  return ROLES.MEMBER;
}
