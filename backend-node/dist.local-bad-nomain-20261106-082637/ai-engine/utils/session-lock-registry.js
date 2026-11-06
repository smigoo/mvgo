/**
 * 🛡️ 修复 2.1（锁定终态，2026-09-02）：会话级「满意即锁定」共享注册表。
 *
 * 背景：max 微码组件分块生成时，用户可能在某个中途快照已高度还原、后续却可能被
 * 全局重生成（拐点 A）或 fixedFiles 覆写（拐点 B）改坏。用户点「满意，锁定此版本」后，
 * 本注册表标记该 session 已锁定 → engineer 在覆写/终态落盘前检查 `isSessionLocked`，
 * 命中则跳过写盘，保留已发布到 workspace 的好快照（不再被后续覆写破坏）。
 *
 * 设计：进程内存态（Set）。锁的生命周期与任务一致——任务完成/重启即失效，
 * 无持久化需求（持久化由 task.userApproved + approval 元数据承担）。
 *
 * 回滚开关：`LOCK_ON_SATISFY=false` 可整体关闭锁定能力（env 兜底，不影响其它路径）。
 */

const locked = new Set();

function lockEnabled() {
  if (process.env.LOCK_ON_SATISFY === 'false') return false;
  return true;
}

/** 标记会话已锁定（用户点「满意，锁定此版本」） */
export function markSessionLocked(sessionId) {
  if (!sessionId) return;
  locked.add(sessionId);
}

/** 查询会话是否已锁定（engineer 覆写/落盘前检查） */
export function isSessionLocked(sessionId) {
  if (!sessionId) return false;
  if (!lockEnabled()) return false;
  return locked.has(sessionId);
}

/** 清除会话锁（任务完成/取消后调用，避免内存泄漏） */
export function clearSessionLock(sessionId) {
  if (!sessionId) return;
  locked.delete(sessionId);
}

export default {
  markSessionLocked,
  isSessionLocked,
  clearSessionLock,
};
