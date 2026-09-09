// ============================================================
// Zone 操作上下文 — provide/inject 共享 layoutData
// 避免在子组件中重复创建 useZoneOps 实例
// ============================================================

import { inject, type InjectionKey, type Ref } from 'vue'
import type { ScreenLayout, ZoneConfig } from '@/types/screen-layout'
import { useZoneOps } from '../composables/useZoneOps'

type ZoneOps = ReturnType<typeof useZoneOps>

export type LayerOpacityMode = 'normal' | 'translucent' | 'outline'

interface ZoneOpsContext {
  layoutData: Ref<ScreenLayout>
  ops: ZoneOps
  selectedZoneId: Ref<string | null>
  selectZone: (zoneId: string | null) => void
  /** 图层显示模式 */
  layerOpacityMode: Ref<LayerOpacityMode>
  /** 组件右键菜单回调 */
  onComponentContextMenu: (e: MouseEvent, zoneId: string, compId: string) => void
  /** Zone 右键菜单回调 */
  onZoneContextMenu: (e: MouseEvent, zone: ZoneConfig) => void
}

export const ZONE_OPS_KEY: InjectionKey<ZoneOpsContext> = Symbol('zone-ops')

export function useZoneOpsContext(): ZoneOpsContext {
  const ctx = inject(ZONE_OPS_KEY)
  if (!ctx) {
    throw new Error('useZoneOpsContext must be used within a provider of ZONE_OPS_KEY')
  }
  return ctx
}
