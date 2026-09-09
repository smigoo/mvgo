// ============================================================
// 大屏布局编辑器 — Zone & Component 操作 composable
// 封装所有对 zone 和组件的增删改查逻辑（支持递归嵌套）
// ============================================================

import type { Ref } from 'vue'
import type {
  ScreenLayout,
  ZoneConfig,
  GridComponent,
  ContentAlign,
  Padding,
  Offset,
  FlexConfig,
} from '@/types/screen-layout'

let _uidCounter = 0
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_uidCounter).toString(36)}`
}

/** 默认 padding */
function defaultPadding(): Padding {
  return { top: '8px', right: '8px', bottom: '8px', left: '8px' }
}

/** 默认 offset */
function defaultOffset(): Offset {
  return { left: '0', right: '0' }
}

/** 默认 contentAlign */
function defaultAlign(): ContentAlign {
  return { vertical: 'top', horizontal: 'stretch' }
}

/** 默认 flex 配置 */
function defaultFlexConfig(): FlexConfig {
  return { direction: 'row', gap: '8px', wrap: false, justify: 'flex-start', align: 'stretch' }
}

/** 创建一个新 zone */
function createZone(colIndex: number): ZoneConfig {
  return {
    id: uid('zone'),
    colIndex,
    contentAlign: defaultAlign(),
    padding: defaultPadding(),
    zIndex: 'middle',
    offset: defaultOffset(),
    layoutMode: 'grid',
    contentType: 'components',
    gridConfig: { cols: 12, rowHeight: 8, components: [] },
    flexConfig: defaultFlexConfig(),
  }
}

/** 创建一个子 zone（嵌套用，无 colIndex/zIndex 概念） */
function createChildZone(): ZoneConfig {
  return {
    id: uid('zone'),
    colIndex: -1,                    // 子 zone 不属于任何列
    contentAlign: defaultAlign(),
    padding: defaultPadding(),
    zIndex: 'middle',
    offset: defaultOffset(),
    layoutMode: 'grid',
    contentType: 'components',
    gridConfig: { cols: 12, rowHeight: 8, components: [] },
    flexConfig: defaultFlexConfig(),
  }
}

/** 创建一个 grid 组件 */
function createGridComponent(name?: string, zIndex?: number): GridComponent {
  return {
    id: uid('comp'),
    componentName: name || 'PlaceholderPanel',
    layout: { x: 0, y: 0, w: 6, h: 6, minW: 1, maxW: 0, minH: 1, maxH: 0, static: false },
    zIndex: zIndex ?? 0,
    props: {},
  }
}

// ============================================================
// composable 主函数
// ============================================================

export function useZoneOps(layoutData: Ref<ScreenLayout>) {

  // ---- 递归查找 ----

  /**
   * 递归查找 zone — 在顶层 zones 和所有子 zone 中搜索
   * 返回 { zone, parent } 方便删除操作
   */
  function findZoneRecursive(
    zoneId: string,
    zones?: ZoneConfig[],
    parent?: ZoneConfig,
  ): { zone: ZoneConfig; parent: ZoneConfig | null; list: ZoneConfig[] } | null {
    const searchList = zones || layoutData.value.body.zones
    for (const z of searchList) {
      if (z.id === zoneId) {
        return { zone: z, parent: parent || null, list: searchList }
      }
      if (z.children && z.children.length > 0) {
        const found = findZoneRecursive(zoneId, z.children, z)
        if (found) return found
      }
    }
    return null
  }

  /** 根据 ID 查找 zone（递归） */
  function findZone(zoneId: string): ZoneConfig | undefined {
    const result = findZoneRecursive(zoneId)
    return result?.zone
  }

  // ---- Zone 查询 ----

  /** 获取指定列的所有 zone（仅顶层） */
  function getZonesByColumn(colIndex: number): ZoneConfig[] {
    return layoutData.value.body.zones.filter(z => z.colIndex === colIndex)
  }

  /** 获取 bottom 层 zone（仅顶层） */
  function getBottomZones(colIndex: number): ZoneConfig[] {
    return getZonesByColumn(colIndex).filter(z => z.zIndex === 'bottom')
  }

  /** 获取 middle 层 zone（仅顶层） */
  function getMiddleZones(colIndex: number): ZoneConfig[] {
    return getZonesByColumn(colIndex).filter(z => z.zIndex === 'middle')
  }

  // ---- Zone 增删（顶层） ----

  /** 在指定列添加 zone */
  function addZone(colIndex: number): string {
    const zone = createZone(colIndex)
    layoutData.value.body.zones.push(zone)
    return zone.id
  }

  /** 删除 zone（递归查找并删除） */
  function removeZone(zoneId: string): void {
    const result = findZoneRecursive(zoneId)
    if (!result) return
    const idx = result.list.findIndex(z => z.id === zoneId)
    if (idx >= 0) result.list.splice(idx, 1)
  }

  /** 复制 zone（同列追加，递归复制子 zone） */
  function duplicateZone(zoneId: string): string | null {
    const result = findZoneRecursive(zoneId)
    if (!result) return null
    const clone: ZoneConfig = JSON.parse(JSON.stringify(result.zone))
    clone.id = uid('zone')
    // 递归重新分配所有子 zone 和组件的 ID
    reassignIds(clone)
    result.list.push(clone)
    return clone.id
  }

  /** 递归重新分配 zone 及其子 zone 的 ID */
  function reassignIds(zone: ZoneConfig): void {
    zone.id = uid('zone')
    zone.gridConfig.components.forEach(c => { c.id = uid('comp') })
    if (zone.children) {
      zone.children.forEach(c => reassignIds(c))
    }
  }

  // ---- 子 Zone 增删（嵌套） ----

  /** 向父 zone 添加子 zone */
  function addChildZone(parentZoneId: string): string | null {
    const parent = findZone(parentZoneId)
    if (!parent) return null
    if (!parent.children) parent.children = []
    // 确保 contentType 为 zones
    if (parent.contentType !== 'zones') {
      parent.contentType = 'zones'
    }
    const child = createChildZone()
    parent.children.push(child)
    return child.id
  }

  /** 删除子 zone */
  function removeChildZone(parentZoneId: string, childZoneId: string): void {
    const parent = findZone(parentZoneId)
    if (!parent?.children) return
    const idx = parent.children.findIndex(z => z.id === childZoneId)
    if (idx >= 0) parent.children.splice(idx, 1)
  }

  /** 复制子 zone */
  function duplicateChildZone(parentZoneId: string, childZoneId: string): string | null {
    const parent = findZone(parentZoneId)
    if (!parent?.children) return null
    const src = parent.children.find(z => z.id === childZoneId)
    if (!src) return null
    const clone: ZoneConfig = JSON.parse(JSON.stringify(src))
    reassignIds(clone)
    parent.children.push(clone)
    return clone.id
  }

  // ---- Zone 属性更新 ----

  /** 更新 zone 的部分属性 */
  function updateZone(zoneId: string, patch: Partial<ZoneConfig>): void {
    const zone = findZone(zoneId)
    if (!zone) return
    Object.assign(zone, patch)
  }

  /** 切换 zone 的 zIndex（bottom ↔ middle） */
  function switchZIndex(zoneId: string, z: 'bottom' | 'middle'): void {
    updateZone(zoneId, { zIndex: z })
  }

  // ---- 组件操作（递归查找 zone） ----

  /** 向 zone 添加组件 */
  function addComponent(zoneId: string, name?: string): void {
    const zone = findZone(zoneId)
    if (!zone) return
    // 自动分配层级：比当前最高 zIndex 高 1
    const maxZ = zone.gridConfig.components.length > 0
      ? Math.max(...zone.gridConfig.components.map(c => c.zIndex))
      : -1
    zone.gridConfig.components.push(createGridComponent(name, maxZ + 1))
  }

  /** 删除组件 */
  function removeComponent(zoneId: string, compId: string): void {
    const zone = findZone(zoneId)
    if (!zone) return
    const idx = zone.gridConfig.components.findIndex(c => c.id === compId)
    if (idx >= 0) zone.gridConfig.components.splice(idx, 1)
  }

  /** 复制组件 */
  function duplicateComponent(zoneId: string, compId: string): void {
    const zone = findZone(zoneId)
    if (!zone) return
    const src = zone.gridConfig.components.find(c => c.id === compId)
    if (src) {
      const clone: GridComponent = JSON.parse(JSON.stringify(src))
      clone.id = uid('comp')
      zone.gridConfig.components.push(clone)
    }
  }

  /** 更新 grid 组件属性 */
  function updateGridComponent(zoneId: string, compId: string, patch: Partial<GridComponent>): void {
    const zone = findZone(zoneId)
    if (!zone) return
    const comp = zone.gridConfig.components.find(c => c.id === compId)
    if (comp) Object.assign(comp, patch)
  }

  /** 更新组件位置（拖拽用） */
  function updateComponentPosition(zoneId: string, compId: string, pos: { x: number; y: number; w?: number; h?: number }): void {
    const zone = findZone(zoneId)
    if (!zone) return
    const comp = zone.gridConfig.components.find(c => c.id === compId)
    if (comp) {
      comp.layout.x = pos.x
      comp.layout.y = pos.y
      if (pos.w !== undefined) comp.layout.w = pos.w
      if (pos.h !== undefined) comp.layout.h = pos.h
    }
  }

  /** 组件上移一层 */
  function moveComponentUp(zoneId: string, compId: string): void {
    const zone = findZone(zoneId)
    if (!zone) return
    const comps = zone.gridConfig.components
    const idx = comps.findIndex(c => c.id === compId)
    if (idx < comps.length - 1) {
      const swap = comps[idx + 1]
      const tmp = comps[idx].zIndex
      comps[idx].zIndex = swap.zIndex
      swap.zIndex = tmp
      // 按 zIndex 重排数组
      comps.sort((a, b) => a.zIndex - b.zIndex)
    }
  }

  /** 组件下移一层 */
  function moveComponentDown(zoneId: string, compId: string): void {
    const zone = findZone(zoneId)
    if (!zone) return
    const comps = zone.gridConfig.components
    const idx = comps.findIndex(c => c.id === compId)
    if (idx > 0) {
      const swap = comps[idx - 1]
      const tmp = comps[idx].zIndex
      comps[idx].zIndex = swap.zIndex
      swap.zIndex = tmp
      comps.sort((a, b) => a.zIndex - b.zIndex)
    }
  }

  /** 组件置顶 */
  function bringToFront(zoneId: string, compId: string): void {
    const zone = findZone(zoneId)
    if (!zone) return
    const comps = zone.gridConfig.components
    const maxZ = Math.max(...comps.map(c => c.zIndex), 0)
    const comp = comps.find(c => c.id === compId)
    if (comp) comp.zIndex = maxZ + 1
    comps.sort((a, b) => a.zIndex - b.zIndex)
  }

  /** 组件置底 */
  function sendToBack(zoneId: string, compId: string): void {
    const zone = findZone(zoneId)
    if (!zone) return
    const comps = zone.gridConfig.components
    const minZ = Math.min(...comps.map(c => c.zIndex), 0)
    const comp = comps.find(c => c.id === compId)
    if (comp) comp.zIndex = minZ - 1
    comps.sort((a, b) => a.zIndex - b.zIndex)
  }

  // ---- 统计 ----

  /** 获取 zone 中组件数量（递归子 zone） */
  function getComponentCount(zone: ZoneConfig): number {
    let count = zone.gridConfig.components.length
    if (zone.children) {
      count += zone.children.reduce((sum, c) => sum + getComponentCount(c), 0)
    }
    return count
  }

  /** 获取所有唯一组件名（递归） */
  function getAllComponentNames(): string[] {
    const names = new Set<string>()
    function collect(zone: ZoneConfig) {
      zone.gridConfig.components.forEach(c => names.add(c.componentName))
      if (zone.children) zone.children.forEach(collect)
    }
    layoutData.value.body.zones.forEach(collect)
    if (layoutData.value.header) {
      layoutData.value.header.components.forEach(c => names.add(c.componentName))
    }
    if (layoutData.value.footer) {
      layoutData.value.footer.components.forEach(c => names.add(c.componentName))
    }
    return Array.from(names)
  }

  /** 判断 zone 是否可以删除（无组件且无子 zone） */
  function canDeleteZone(zone: ZoneConfig): boolean {
    if (zone.gridConfig.components.length > 0) return false
    if (zone.children && zone.children.length > 0) return false
    return true
  }

  return {
    // 查询
    getZonesByColumn,
    getBottomZones,
    getMiddleZones,
    findZone,
    findZoneRecursive,
    getComponentCount,
    getAllComponentNames,
    canDeleteZone,
    // Zone 增删
    addZone,
    removeZone,
    duplicateZone,
    updateZone,
    switchZIndex,
    // 子 Zone 操作
    addChildZone,
    removeChildZone,
    duplicateChildZone,
    // 组件操作
    addComponent,
    removeComponent,
    duplicateComponent,
    updateGridComponent,
    updateComponentPosition,
    moveComponentUp,
    moveComponentDown,
    bringToFront,
    sendToBack,
  }
}
