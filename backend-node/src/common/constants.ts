/**
 * 全局常量（框架 3.0 规范：禁止魔法数字/字符串）
 * 所有业务模块应从此文件导入，不得在代码中硬编码字面量。
 */

// ── 时间常量（毫秒） ──────────────────────────────────
export const MS = {
  SEC: 1000,
  MIN: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

// ── 角色 ─────────────────────────────────────────────
export const ROLES = {
  ADMIN: 'admin',
  MEMBER: 'member',
  USER: 'user',
  GUEST: 'guest',
} as const;

// ── 用户来源（user.source 字段） ──────────────────────
export const USER_SOURCE = {
  QS_PORTAL: 'qs',        // 齐治门户扫码登录
  LOCAL: 'local',         // 本地注册
} as const;

// ── 权限来源 ─────────────────────────────────────────
export const PERMISSION_SOURCE = {
  QS_PORTAL: 'qs',        // 门户权限系统（齐治 RBAC）
  LOCAL: 'local',         // 本地权限（MongoDB 用户记录）
} as const;

// ── 分页默认值 ───────────────────────────────────────
export const PAGE = {
  DEFAULT_SIZE: 20,
  MAX_SIZE: 60,
} as const;

// ── 配额 ─────────────────────────────────────────────
export const QUOTA = {
  DEFAULT_WAIT_MINUTES: 60,
} as const;
