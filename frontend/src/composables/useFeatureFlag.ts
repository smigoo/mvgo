/**
 * useFeatureFlag — 功能开关 Composable
 *
 * 在 <script setup> 中使用：
 *
 *   import { useFeatureFlag } from '@/composables/useFeatureFlag'
 *
 *   const { isEnabled, isDisabled } = useFeatureFlag()
 *
 *   // 单个功能
 *   if (isEnabled('git.push')) { ... }
 *
 *   // 多个功能（任一开启）
 *   const canExport = isEnabled('git.push') || isEnabled('figma.integration')
 *
 * 在 <template> 中配合 v-feature 指令使用更简洁：
 *   <button v-feature="'git.push'">保存到 Git</button>
 */
import { useFeatureFlagsStore } from '@/stores/feature-flags'

export function useFeatureFlag() {
  const store = useFeatureFlagsStore()

  /** 功能是否开启 */
  function isEnabled(key: string): boolean {
    return store.isEnabled(key)
  }

  /** 功能是否关闭（便捷反义） */
  function isDisabled(key: string): boolean {
    return !store.isEnabled(key)
  }

  /** 多个功能是否全部开启 */
  function allEnabled(...keys: string[]): boolean {
    return keys.every((k) => store.isEnabled(k))
  }

  /** 多个功能是否任一开启 */
  function anyEnabled(...keys: string[]): boolean {
    return keys.some((k) => store.isEnabled(k))
  }

  return {
    isEnabled,
    isDisabled,
    allEnabled,
    anyEnabled,
  }
}
