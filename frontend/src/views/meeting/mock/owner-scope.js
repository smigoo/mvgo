// 会议模块 dev 态持久化的「归属分区」单一来源（2026-11-06 补）。
//
// 治什么病：此前 draft / consent / retention-audit 的 localStorage key 都是**全局无前缀**的
// （`mvgo.meeting.draft.<runVersion>` 等），同一个浏览器换账号登录后，上一个用户的草稿、
// 同意记录、删除审计会被直接读出来展示 —— dev 态越权。契约 OUTPUT_TARGETS.dev 已把
// keyPattern 改成 `mvgo.meeting.draft.<ownerId>.<runVersion>`，本文件让实现层与契约逐字对齐。
//
// 为什么不直接 import useUserStore：
// 本目录是纯 JS，且被 Node 冒烟脚本以内存 storage 做确定性验证（不能依赖 pinia / 浏览器）。
// 所以身份由外部在应用启动时注入一次（见 index.vue 的 applyMeetingOwner），
// 未注入时退化为 ANONYMOUS_OWNER —— 冒烟脚本与未登录态下行为确定、可复现。

// 未登录 / 未注入身份时的分区名。**不是**「所有人共享」的借口：
// 生产态归属一律由服务端会话判定（meeting.controller.ts 的 SessionGuard + requireOwner），
// 这个常量只覆盖 dev 工作台在无身份时的本地兜底。
export const ANONYMOUS_OWNER = 'anonymous'

// 分区段长度上限：uid 异常长时不让 key 无限膨胀（localStorage key 无硬上限，但没必要）
const OWNER_ID_MAX = 64

let activeOwnerId = ANONYMOUS_OWNER

/**
 * 归一化分区名。
 * `.` 是本模块的分区分隔符：uid 若自带点号会把 key 的段数撑开，与契约 keyPattern
 * `...<ownerId>.<leaf>` 对不上（也会让「按前缀枚举某用户全部 key」这类操作失准），统一折叠成 `-`。
 */
export function sanitizeOwnerId(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ANONYMOUS_OWNER
  return value.replace(/\./g, '-').slice(0, OWNER_ID_MAX)
}

/** 注入当前登录用户的身份（uid）。传空即回到匿名分区。 */
export function setMeetingOwnerId(uid) {
  const next = sanitizeOwnerId(uid)
  const changed = next !== activeOwnerId
  activeOwnerId = next
  return changed
}

export function currentMeetingOwnerId() {
  return activeOwnerId
}

/**
 * 生成带归属分区的存储键：`<base><ownerId>.<leaf>`。
 * base 自带尾点（如 `mvgo.meeting.draft.`），与契约 keyPattern 的书写形式保持一致。
 */
export function scopedStorageKey(base, leaf, ownerId = activeOwnerId) {
  return `${base}${sanitizeOwnerId(ownerId)}.${String(leaf)}`
}

/** 列出当前分区的全部 key（用于调试面板 / 迁移期核对；不读值）。 */
export function listScopedKeys(storage, prefix, ownerId = activeOwnerId) {
  if (!storage || typeof storage.length !== 'number') return []
  const scope = `${prefix}${sanitizeOwnerId(ownerId)}.`
  const keys = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (typeof key === 'string' && key.startsWith(scope)) keys.push(key)
  }
  return keys
}
