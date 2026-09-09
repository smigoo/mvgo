/**
 * 功能开关 Pinia Store
 *
 * 从 config/feature-flags.js 加载配置，提供运行时查询能力。
 * 支持按分类查询（routes / subRoutes / pages / workspace / features）。
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, computed } from 'vue'
import featureFlagsConfig from '@/config/feature-flags.js'

export type FeatureCategory = 'routes' | 'subRoutes' | 'pages' | 'workspace' | 'features'

interface FeatureItem {
  enabled: boolean
  label: string
}

type FeatureGroup = Record<string, FeatureItem>

export const useFeatureFlagsStore = defineStore('feature-flags', () => {
  // ── 原始配置（响应式，HMR 时自动更新）──
  const config = ref(featureFlagsConfig)

  // ── 扁平化 Map：所有功能键 → enabled ──
  // 把所有分类下的 key 汇总到一个查找表，方便 O(1) 查询
  const flatMap = computed<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    const groups: FeatureGroup[] = [
      config.value.routes,
      config.value.subRoutes,
      config.value.pages,
      config.value.workspace,
      config.value.features,
    ]
    for (const group of groups) {
      if (!group) continue
      for (const [key, item] of Object.entries(group)) {
        map[key] = item.enabled
      }
    }
    return map
  })

  /**
   * 查询某个功能是否开启
   * @param key 功能键名，如 'git.push'、'screen'、'workspace.chat'
   * @returns true=开启, false=关闭
   */
  function isEnabled(key: string): boolean {
    return flatMap.value[key] ?? true // 未定义的功能默认开启（向后兼容）
  }

  /**
   * 查询某个分类下所有已开启的功能键
   */
  function getEnabledKeys(category: FeatureCategory): string[] {
    const group = config.value[category] as FeatureGroup | undefined
    if (!group) return []
    return Object.entries(group)
      .filter(([, item]) => item.enabled)
      .map(([key]) => key)
  }

  /**
   * 获取某个分类下所有功能（含 label），用于动态渲染菜单
   */
  function getCategoryItems(category: FeatureCategory): Array<{ key: string; label: string; enabled: boolean }> {
    const group = config.value[category] as FeatureGroup | undefined
    if (!group) return []
    return Object.entries(group).map(([key, item]) => ({
      key,
      label: item.label,
      enabled: item.enabled,
    }))
  }

  return {
    config,
    flatMap,
    isEnabled,
    getEnabledKeys,
    getCategoryItems,
  }
})

// HMR: 编辑 feature-flags.js 后 store 自动热更新，UI 实时同步
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFeatureFlagsStore, import.meta.hot))
}
