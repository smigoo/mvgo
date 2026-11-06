// 2026-11-06 源文件丢失后由 dist 编译产物（dist/config/figma-credential.js + .d.ts）机械重建，
// 逻辑与 dist 产物逐行对应。
import { maskSecretFingerprint } from '../common/utils/secret-fingerprint'
import { normalizeFigmaTokenSlots, pickActiveFigmaTokenSlot } from './figma-token-projection'

/** 任务快照 / configSnapshot 里记录「当时用的 Figma 凭证指纹」的字段名 */
export const FIGMA_CREDENTIAL_FP_FIELD = 'figmaCredentialFp'

export type FigmaCredentialFpSource = 'pipeline' | 'create'

/** 直接从一个 token 值取指纹 */
export function figmaCredentialFpFromValue(token?: string | null): string | null {
  return maskSecretFingerprint(token)
}

/** 从用户 AI 配置对象取当前生效 Figma token 的指纹（多槽位取激活槽，兼容旧单 token 字段） */
export function figmaCredentialFpFromConfig(config?: Record<string, any> | null): string | null {
  if (!config || typeof config !== 'object') return null
  const slots = normalizeFigmaTokenSlots(config.figmaTokens)
  const active = slots.length ? pickActiveFigmaTokenSlot(config, slots) : null
  const token = active?.token || (typeof config.figmaToken === 'string' ? config.figmaToken : '')
  return maskSecretFingerprint(token)
}
