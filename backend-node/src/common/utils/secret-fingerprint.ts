// 2026-11-06 源文件丢失后由 dist 编译产物（dist/common/utils/secret-fingerprint.js + .d.ts）机械重建，
// 逻辑与 dist 产物逐行对应。
/** 把密钥脱敏为指纹（前 6 + **** + 后 4；过短一律 ****），用于日志 / 快照展示而不泄露原文 */
export function maskSecretFingerprint(value?: string | null): string | null {
  if (!value || typeof value !== 'string' || !value.trim()) return null
  const v = value.trim()
  if (v.length <= 8) return '****'
  return `${v.slice(0, 6)}****${v.slice(-4)}`
}
