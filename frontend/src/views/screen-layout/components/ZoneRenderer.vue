<template>
  <div
    class="zone-renderer"
    :class="{
      'zone-selected': isSelected,
      'zone-is-bottom': zone.zIndex === 'bottom' && !isNested,
      'zone-is-middle': zone.zIndex === 'middle' || isNested,
      'zone-drag-over': isDragOver,
      'zone-drag-layout': dragOverType === 'layout',
      [`zone-opacity-${layerOpacityMode}`]: true,
    }"
    :style="containerStyle"
    @click.stop="selectZone(zone.id)"
    @contextmenu="onZoneCtx($event, zone)"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Zone 标题栏 -->
    <div class="zone-bar">
      <span class="zone-bar-id">Z:{{ zone.id.slice(-4) }}</span>
      <a-tag v-if="!isNested" :color="zone.zIndex === 'bottom' ? 'purple' : 'blue'" :bordered="false" style="font-size:10px">
        {{ zone.zIndex === 'bottom' ? '底层' : '中层' }}
      </a-tag>
      <a-tag v-else color="cyan" :bordered="false" style="font-size:10px">子布局</a-tag>
      <a-tag :bordered="false" style="font-size:10px" :color="zone.layoutMode === 'grid' ? 'geekblue' : 'orange'">
        {{ zone.layoutMode === 'grid' ? 'Grid' : `Flex ${zone.flexConfig.direction === 'row' ? '→' : '↓'}` }}
      </a-tag>
      <span v-if="zone.contentType === 'zones'" class="zone-children-badge">
        {{ (zone.children || []).length }} 个子布局
      </span>
      <span v-if="zone.width || zone.height" class="zone-size-badge">{{ zone.width || 'auto' }} × {{ zone.height || 'auto' }}</span>
      <a-button
        v-if="canDelete"
        type="text"
        danger
        size="small"
        class="zone-delete-btn"
        @click.stop="handleDelete"
      >✕</a-button>
    </div>

    <!-- Zone 内容区 -->
    <div class="zone-content" :style="contentStyle">
      <!-- 内容类型 = zones（嵌套子布局） -->
      <template v-if="zone.contentType === 'zones' && zone.children && zone.children.length > 0">
        <div class="zone-children-container" :style="childrenLayoutStyle">
          <ZoneRenderer
            v-for="child in zone.children"
            :key="child.id"
            :zone="child"
            :is-nested="true"
          />
        </div>
      </template>

      <!-- 内容类型 = zones 但无子布局 -->
      <div v-else-if="zone.contentType === 'zones'" class="zone-empty-hint">
        拖入子布局或右键可删除
      </div>

      <!-- 内容类型 = components，grid 模式（绝对定位，支持重叠+拖拽移动） -->
      <template v-else-if="zone.layoutMode === 'grid'">
        <div
          ref="gridAreaRef"
          class="grid-comp-area"
          :class="{ 'grid-snapping': layoutData.canvas.snapToGrid }"
        >
          <div
            v-for="comp in sortedComponents"
            :key="comp.id"
            class="grid-comp-box"
            :class="{ 'comp-dragging': draggingCompId === comp.id, 'comp-resizing': resizingCompId === comp.id }"
            :style="absCompStyle(comp)"
            @contextmenu="onCompCtx($event, zone.id, comp.id)"
          >
            <!-- 头部标题栏（拖拽移动句柄） -->
            <div class="comp-header" @mousedown.stop="startDragComp($event, comp)">
              <span class="comp-name">{{ comp.componentName }}</span>
              <span class="comp-size-badge">{{ comp.layout.w }}×{{ comp.layout.h }}</span>
            </div>
            <!-- 组件内容占位 -->
            <div class="comp-body">
              <span class="comp-z-badge" @click.stop>z:{{ comp.zIndex }}</span>
            </div>
            <!-- ==== 组件缩放把手 ==== -->
            <div class="comp-resize-handle cr-top"    @mousedown.stop="startResizeComp($event, comp, 'top')"></div>
            <div class="comp-resize-handle cr-right"  @mousedown.stop="startResizeComp($event, comp, 'right')"></div>
            <div class="comp-resize-handle cr-bottom" @mousedown.stop="startResizeComp($event, comp, 'bottom')"></div>
            <div class="comp-resize-handle cr-left"   @mousedown.stop="startResizeComp($event, comp, 'left')"></div>
            <div class="comp-resize-handle cr-tr" @mousedown.stop="startResizeComp($event, comp, 'top-right')"></div>
            <div class="comp-resize-handle cr-br" @mousedown.stop="startResizeComp($event, comp, 'bottom-right')"></div>
            <div class="comp-resize-handle cr-bl" @mousedown.stop="startResizeComp($event, comp, 'bottom-left')"></div>
            <div class="comp-resize-handle cr-tl" @mousedown.stop="startResizeComp($event, comp, 'top-left')"></div>
          </div>
        </div>
        <div v-if="zone.gridConfig.components.length === 0" class="zone-empty-hint">
          拖入组件或右键可删除
        </div>
      </template>

      <!-- 内容类型 = components，flex 模式 -->
      <template v-else>
        <div class="flex-comp-area" :style="flexAreaStyle">
          <div
            v-for="comp in zone.gridConfig.components"
            :key="comp.id"
            class="flex-comp-box"
            :style="flexCompStyle"
            @contextmenu="onCompCtx($event, zone.id, comp.id)"
          >
            <span class="comp-name">{{ comp.componentName }}</span>
            <span class="comp-z-badge" @click.stop>z:{{ comp.zIndex }}</span>
          </div>
        </div>
        <div v-if="zone.gridConfig.components.length === 0" class="zone-empty-hint">
          拖入组件或右键可删除
        </div>
      </template>
    </div>

    <!-- ====== 四周缩放把手 ====== -->
    <div class="zone-resize-handle resize-top"    @mousedown.stop="startResize($event, 'top')"></div>
    <div class="zone-resize-handle resize-right"  @mousedown.stop="startResize($event, 'right')"></div>
    <div class="zone-resize-handle resize-bottom" @mousedown.stop="startResize($event, 'bottom')"></div>
    <div class="zone-resize-handle resize-left"   @mousedown.stop="startResize($event, 'left')"></div>
    <div class="zone-resize-handle resize-tr" @mousedown.stop="startResize($event, 'top-right')"></div>
    <div class="zone-resize-handle resize-br" @mousedown.stop="startResize($event, 'bottom-right')"></div>
    <div class="zone-resize-handle resize-bl" @mousedown.stop="startResize($event, 'bottom-left')"></div>
    <div class="zone-resize-handle resize-tl" @mousedown.stop="startResize($event, 'top-left')"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GridComponent, ZoneConfig } from '@/types/screen-layout'
import { useZoneOpsContext } from './zone-context'

const props = withDefaults(defineProps<{
  zone: ZoneConfig
  isNested?: boolean
}>(), {
  isNested: false,
})

const { ops, layoutData, selectedZoneId, selectZone, onZoneContextMenu, onComponentContextMenu, layerOpacityMode } = useZoneOpsContext()

const isSelected = computed(() => selectedZoneId.value === props.zone.id)
const canDelete = computed(() => ops.canDeleteZone(props.zone))

// 按 zIndex 排序的组件列表（用于渲染顺序）
const sortedComponents = computed(() => {
  return [...props.zone.gridConfig.components].sort((a, b) => a.zIndex - b.zIndex)
})

// ---- 拖放接收 ----

const isDragOver = ref(false)
const dragOverType = ref<'component' | 'layout' | null>(null)

function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-screen-layout')) {
    e.dataTransfer!.dropEffect = 'copy'
    isDragOver.value = true
    dragOverType.value = 'layout'
  } else if (e.dataTransfer?.types.includes('application/x-screen-component')) {
    e.dataTransfer!.dropEffect = 'copy'
    isDragOver.value = true
    dragOverType.value = 'component'
  }
}

function onDragLeave() {
  isDragOver.value = false
  dragOverType.value = null
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  dragOverType.value = null

  // 布局模板拖放 → 修改当前 zone 的布局模式
  const layoutRaw = e.dataTransfer?.getData('application/x-screen-layout')
  if (layoutRaw) {
    try {
      const data = JSON.parse(layoutRaw) as { layoutMode: string; flexDir?: string; gridCols?: number }
      ops.updateZone(props.zone.id, {
        layoutMode: data.layoutMode as 'grid' | 'flex',
        ...(data.layoutMode === 'flex' && data.flexDir
          ? { flexConfig: { ...props.zone.flexConfig, direction: data.flexDir as 'row' | 'column' } }
          : {}),
        ...(data.layoutMode === 'grid' && data.gridCols
          ? { gridConfig: { ...props.zone.gridConfig, cols: data.gridCols } }
          : {}),
      })
    } catch { /* ignore */ }
    return
  }

  // 组件拖放 → 添加组件到 zone
  const compRaw = e.dataTransfer?.getData('application/x-screen-component')
  if (!compRaw) return
  try {
    const data = JSON.parse(compRaw) as { componentName: string }
    ops.addComponent(props.zone.id, data.componentName)
  } catch { /* ignore */ }
}

// ---- 缩放把手 ----

type ResizeDirection = 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'

function startResize(e: MouseEvent, dir: ResizeDirection) {
  e.preventDefault()

  const startX = e.clientX
  const startY = e.clientY
  const el = (e.currentTarget as HTMLElement).closest('.zone-renderer') as HTMLElement
  if (!el) return

  const rect = el.getBoundingClientRect()
  const startW = rect.width
  const startH = rect.height

  const cursorMap: Record<string, string> = {
    top: 'n-resize', bottom: 's-resize', left: 'w-resize', right: 'e-resize',
    'top-right': 'ne-resize', 'bottom-right': 'se-resize',
    'bottom-left': 'sw-resize', 'top-left': 'nw-resize',
  }
  document.body.style.cursor = cursorMap[dir] || 'move'
  document.body.style.userSelect = 'none'

  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    let newW = startW
    let newH = startH

    if (dir.includes('right'))  newW = startW + dx
    if (dir.includes('left'))   newW = startW - dx
    if (dir.includes('bottom')) newH = startH + dy
    if (dir.includes('top'))    newH = startH - dy

    newW = Math.max(40, Math.round(newW))
    newH = Math.max(28, Math.round(newH))

    ops.updateZone(props.zone.id, {
      width: `${newW}px`,
      height: `${newH}px`,
    })
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ---- 组件拖拽移动 + 网格吸附 ----

const gridAreaRef = ref<HTMLElement | null>(null)
const draggingCompId = ref<string | null>(null)
const resizingCompId = ref<string | null>(null)

function startDragComp(e: MouseEvent, comp: GridComponent) {
  // 不响应右键
  if (e.button !== 0) return
  e.preventDefault()

  const area = gridAreaRef.value
  if (!area) return

  const areaRect = area.getBoundingClientRect()
  const cols = props.zone.gridConfig.cols
  const rowH = props.zone.gridConfig.rowHeight
  const snap = layoutData.value.canvas.snapToGrid !== false // 默认吸附

  const startX = e.clientX
  const startY = e.clientY
  const startCompX = comp.layout.x
  const startCompY = comp.layout.y
  const startCompW = comp.layout.w
  const startCompH = comp.layout.h

  // 计算单个网格单元像素
  const cellW = areaRect.width / cols
  const cellH = rowH

  draggingCompId.value = comp.id
  document.body.style.cursor = 'move'
  document.body.style.userSelect = 'none'

  const onMove = (ev: MouseEvent) => {
    const dx = (ev.clientX - startX) / areaRect.width
    const dy = (ev.clientY - startY) / cellH

    let newX = startCompX + dx * cols
    let newY = startCompY + dy

    if (snap) {
      newX = Math.round(newX)
      newY = Math.round(newY)
    }

    // 钳制
    newX = Math.max(0, Math.min(cols - startCompW, newX))
    newY = Math.max(0, newY)

    ops.updateComponentPosition(props.zone.id, comp.id, { x: newX, y: newY })
  }

  const onUp = () => {
    draggingCompId.value = null
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ---- 组件拖拽缩放（四角+四边） ----

type CompResizeDirection = 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'

function startResizeComp(e: MouseEvent, comp: GridComponent, dir: CompResizeDirection) {
  e.preventDefault()
  e.stopPropagation()

  const area = gridAreaRef.value
  if (!area) return

  const areaRect = area.getBoundingClientRect()
  const cols = props.zone.gridConfig.cols
  const rowH = props.zone.gridConfig.rowHeight
  const snap = layoutData.value.canvas.snapToGrid !== false

  const cellW = areaRect.width / cols
  const cellH = rowH

  const startX = e.clientX
  const startY = e.clientY
  const startCompX = comp.layout.x
  const startCompY = comp.layout.y
  const startCompW = comp.layout.w
  const startCompH = comp.layout.h

  const cursorMap: Record<string, string> = {
    top: 'n-resize', bottom: 's-resize', left: 'w-resize', right: 'e-resize',
    'top-right': 'ne-resize', 'bottom-right': 'se-resize',
    'bottom-left': 'sw-resize', 'top-left': 'nw-resize',
  }

  resizingCompId.value = comp.id
  document.body.style.cursor = cursorMap[dir] || 'move'
  document.body.style.userSelect = 'none'

  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY

    // 像素位移 → 网格单位
    let dCols = dx / cellW
    let dRows = dy / cellH

    if (snap) {
      dCols = Math.round(dCols)
      dRows = Math.round(dRows)
    }

    let newX = startCompX
    let newY = startCompY
    let newW = startCompW
    let newH = startCompH

    // 右侧拉伸 → 宽度变化，x 不变
    if (dir.includes('right')) newW = startCompW + dCols
    // 左侧拉伸 → 宽度变化 + x 偏移
    if (dir.includes('left')) {
      newW = startCompW - dCols
      newX = startCompX + dCols
    }
    // 底部拉伸 → 高度变化，y 不变
    if (dir.includes('bottom')) newH = startCompH + dRows
    // 顶部拉伸 → 高度变化 + y 偏移
    if (dir.includes('top')) {
      newH = startCompH - dRows
      newY = startCompY + dRows
    }

    // 钳制：最小 1×1，不超出网格边界
    newW = Math.max(1, Math.round(newW))
    newH = Math.max(1, Math.round(newH))
    newX = Math.max(0, Math.min(cols - newW, Math.round(newX)))
    newY = Math.max(0, Math.round(newY))

    ops.updateComponentPosition(props.zone.id, comp.id, { x: newX, y: newY, w: newW, h: newH })
  }

  const onUp = () => {
    resizingCompId.value = null
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ---- 绝对定位样式（百分比，随容器自动拉伸） ----

function absCompStyle(comp: GridComponent): Record<string, string> {
  const comps = props.zone.gridConfig.components
  const cols = props.zone.gridConfig.cols
  const colPct = (100 / cols).toFixed(4)

  // 计算纵向总网格数，用于百分比高度
  const totalRows = Math.max(1, ...comps.map(c => c.layout.y + c.layout.h))
  const rowPct = (100 / totalRows).toFixed(4)

  return {
    left: `calc(${comp.layout.x} * ${colPct}%)`,
    top: `calc(${comp.layout.y} * ${rowPct}%)`,
    width: `calc(${comp.layout.w} * ${colPct}%)`,
    height: `calc(${comp.layout.h} * ${rowPct}%)`,
    zIndex: String(comp.zIndex),
  }
}

// ---- 样式计算 ----

const containerStyle = computed(() => {
  const s: Record<string, string> = {}
  if (!props.isNested && props.zone.zIndex === 'middle') {
    if (props.zone.offset.left && props.zone.offset.left !== '0') s.marginLeft = props.zone.offset.left
    if (props.zone.offset.right && props.zone.offset.right !== '0') s.marginRight = props.zone.offset.right
  }
  if (props.zone.width)  s.width     = props.zone.width
  if (props.zone.height) s.height    = props.zone.height
  if (props.zone.width || props.zone.height) {
    s.flexShrink = '0'
    s.flexGrow   = '0'
    // bottom 层默认 CSS inset:0 强制全宽高，缩放后需取消对应方向的拉伸，
    // 保留左上锚点（left:0, top:0），让 width/height 接管尺寸
    if (!props.isNested && props.zone.zIndex === 'bottom') {
      if (props.zone.width)  { s.left = '0'; s.right = 'auto' }
      if (props.zone.height) { s.top  = '0'; s.bottom = 'auto' }
    }
  }
  return s
})

const contentStyle = computed(() => {
  const s: Record<string, string> = {}
  const p = props.zone.padding
  s.paddingTop = p.top
  s.paddingRight = p.right
  s.paddingBottom = p.bottom
  s.paddingLeft = p.left
  const va = props.zone.contentAlign
  const justifyMap: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end', stretch: 'stretch' }
  const alignMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end', stretch: 'stretch' }
  s.justifyContent = justifyMap[va.vertical] || 'flex-start'
  s.alignItems = alignMap[va.horizontal] || 'stretch'
  return s
})

const childrenLayoutStyle = computed(() => {
  if (props.zone.layoutMode === 'flex') {
    const fc = props.zone.flexConfig
    return {
      display: 'flex',
      flexDirection: fc.direction,
      gap: fc.gap,
      flexWrap: fc.wrap ? 'wrap' : 'nowrap',
      justifyContent: fc.justify,
      alignItems: fc.align,
      flex: '1',
      minHeight: '0',
    }
  }
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${props.zone.gridConfig.cols}, 1fr)`,
    gap: '4px',
    flex: '1',
    minHeight: '0',
  }
})

const flexAreaStyle = computed(() => {
  const fc = props.zone.flexConfig
  return {
    flexDirection: fc.direction,
    gap: fc.gap,
    flexWrap: fc.wrap ? 'wrap' : 'nowrap',
    justifyContent: fc.justify,
    alignItems: fc.align,
  }
})

const flexCompStyle = computed(() => {
  const fc = props.zone.flexConfig
  if (fc.direction === 'row') {
    return { flex: '1 1 0', minHeight: '24px', maxWidth: '100%' }
  }
  return { flex: '1 1 0', minWidth: '100%' }
})

// ---- 事件 ----

function onCompCtx(e: MouseEvent, zoneId: string, compId: string) {
  onComponentContextMenu(e, zoneId, compId)
}

function onZoneCtx(e: MouseEvent, zone: ZoneConfig) {
  onZoneContextMenu(e, zone)
}

function handleDelete() {
  if (!canDelete.value) return
  ops.removeZone(props.zone.id)
  if (selectedZoneId.value === props.zone.id) selectZone(null)
}
</script>

<style scoped lang="less">
.zone-renderer {
  border: 1px solid var(--shadow-dropdown);
  border-radius: var(--radius-xs);
  background: rgba(255, 255, 255, 0.4);
  transition: border-color 0.15s, box-shadow 0.15s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  min-height: 28px;
  position: relative;

  &:hover {
    border-color: rgba(24, 144, 255, 0.3);
    background: rgba(24, 144, 255, 0.03);
  }
  &.zone-selected {
    border-color: var(--brand);
    background: rgba(24, 144, 255, 0.05);
    box-shadow: 0 0 0 1px var(--brand-border);
  }
  &.zone-drag-over {
    border-color: var(--brand);
    background: rgba(24, 144, 255, 0.08);
    box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.3);
  }
  &.zone-drag-layout {
    border-color: var(--feature);
    background: rgba(114, 46, 209, 0.08);
    box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.35);
  }

  .zone-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-bottom: 1px solid var(--shadow-sm);
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.02);

    .zone-bar-id {
      font-size: 10px;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.4);
    }

    .zone-children-badge {
      font-size: 9px;
      color: rgba(0, 0, 0, 0.3);
    }

    .zone-size-badge {
      font-size: 9px;
      color: rgba(24, 144, 255, 0.5);
      margin-left: auto;
    }
  }

  .zone-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
}

.zone-is-bottom {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.zone-is-middle {
  position: relative;
  z-index: 5;
  flex: 1;
  min-height: 0;
}

// ---- 图层显示模式 ----
.zone-opacity-translucent {
  background: rgba(255, 255, 255, 0.12) !important;
  .zone-bar { opacity: 0.5; }
  &.zone-selected {
    background: rgba(24, 144, 255, 0.08) !important;
    .zone-bar { opacity: 1; }
  }
}
.zone-opacity-outline {
  background: transparent !important;
  border-style: dashed;
  border-width: 2px;
  .zone-bar { opacity: 0.5; }
  .zone-content { opacity: 0.3; }

  // ---- 分解视图：强制所有 zone 垂直排列，脱离重叠 ----
  // bottom 层降级为 relative，不再 absolute 覆盖全列
  &.zone-is-bottom {
    position: relative !important;
    inset: auto !important;
    min-height: 80px;
    margin-bottom: 16px;
    border-color: var(--feature);       // 紫色 = 底层
    z-index: auto;
  }
  &.zone-is-middle {
    margin-bottom: 16px;
    border-color: var(--brand);       // 蓝色 = 中层
  }

  &.zone-selected {
    border-style: solid;
    border-width: 2px;
    .zone-bar { opacity: 0.9; }
    .zone-content { opacity: 0.7; }
  }

  // 最后一个 zone 不需要下间距
  &:last-child {
    margin-bottom: 0;
  }
}

.zone-children-container {
  display: flex;
  overflow: auto;
  min-height: 0;
}

// ---- Grid 组件区（绝对定位） ----
.grid-comp-area {
  position: relative;
  flex: 1;
  overflow: hidden;
  min-height: 40px;
}

.grid-comp-box {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: rgba(24, 144, 255, 0.06);
  border: 1px solid rgba(24, 144, 255, 0.15);
  border-radius: var(--radius-xs);
  transition: box-shadow 0.1s;
  overflow: hidden;

  &:hover {
    background: rgba(24, 144, 255, 0.1);
    border-color: rgba(24, 144, 255, 0.3);
    box-shadow: 0 0 0 1px var(--brand-border);

    // 悬停时显示缩放把手
    .comp-resize-handle {
      opacity: 1;
    }
  }

  &.comp-dragging {
    opacity: 0.85;
    box-shadow: 0 4px 16px rgba(24, 144, 255, 0.3);
    z-index: 100 !important;
  }

  &.comp-resizing {
    opacity: 0.9;
    box-shadow: 0 4px 16px rgba(24, 144, 255, 0.3);
    z-index: 100 !important;
  }

  // ---- 组件头部（拖拽移动句柄） ----
  .comp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 4px;
    background: rgba(24, 144, 255, 0.08);
    border-bottom: 1px solid rgba(24, 144, 255, 0.1);
    cursor: grab;
    flex-shrink: 0;
    min-height: 18px;

    &:active {
      cursor: grabbing;
    }

    .comp-name {
      font-size: 10px;
      color: rgba(24, 144, 255, 0.6);
      font-family: monospace;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
      flex: 1;
    }

    .comp-size-badge {
      font-size: 8px;
      color: rgba(24, 144, 255, 0.35);
      font-family: monospace;
      flex-shrink: 0;
      margin-left: 4px;
    }
  }

  // ---- 组件内容区 ----
  .comp-body {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    min-height: 0;

    .comp-z-badge {
      font-size: 8px;
      color: rgba(0, 0, 0, 0.2);
      font-family: monospace;
      pointer-events: none;
    }
  }
}

// ---- 组件缩放把手 ----
.comp-resize-handle {
  position: absolute;
  z-index: 20;
  opacity: 0;
  transition: opacity 0.12s;
  background: #ff7a45;
}

// 四边把手
.cr-top, .cr-bottom {
  left: 2px;
  right: 2px;
  height: 3px;
  cursor: n-resize;
  border-radius: var(--radius-xs);
}
.cr-top    { top: 0; }
.cr-bottom { bottom: 0; }

.cr-left, .cr-right {
  top: 2px;
  bottom: 2px;
  width: 3px;
  cursor: e-resize;
  border-radius: var(--radius-xs);
}
.cr-left  { left: 0; cursor: w-resize; }
.cr-right { right: 0; }

// 四角把手
.cr-tr, .cr-br, .cr-bl, .cr-tl {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-xs);
  border: 1px solid #fff;
}
.cr-tr { top: -1px;   right: -1px;  cursor: ne-resize; }
.cr-br { bottom: -1px; right: -1px;  cursor: se-resize; }
.cr-bl { bottom: -1px; left: -1px;   cursor: sw-resize; }
.cr-tl { top: -1px;   left: -1px;   cursor: nw-resize; }

// ---- Flex 组件区 ----
.flex-comp-area {
  display: flex;
  flex: 1;
  overflow: auto;
}

.flex-comp-box {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 165, 0, 0.04);
  border: 1px solid rgba(255, 165, 0, 0.1);
  border-radius: var(--radius-xs);
  position: relative;
  overflow: hidden;

  .comp-name {
    font-size: 10px;
    color: rgba(255, 165, 0, 0.5);
    font-family: monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    padding: 0 4px;
  }

  .comp-z-badge {
    position: absolute;
    top: 1px;
    right: 2px;
    font-size: 8px;
    color: rgba(0, 0, 0, 0.25);
    font-family: monospace;
    pointer-events: none;
  }
}

.zone-empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  font-size: 10px;
  color: var(--shadow-md);
  min-height: 20px;
}

.zone-delete-btn {
  margin-left: auto !important;
  font-size: 12px !important;
  padding: 0 4px !important;
  height: 20px !important;
  opacity: 0.6;
  &:hover {
    opacity: 1;
  }
}

// ========== 缩放把手 ==========
.zone-resize-handle {
  position: absolute;
  z-index: 25;
  opacity: 0;
  transition: opacity 0.15s;
  background: var(--brand);
}
.zone-renderer:hover .zone-resize-handle,
.zone-renderer.zone-selected .zone-resize-handle {
  opacity: 1;
}

.resize-top, .resize-bottom {
  left: 4px;
  right: 4px;
  height: 4px;
  cursor: n-resize;
  border-radius: var(--radius-xs);
}
.resize-top    { top: -2px; }
.resize-bottom { bottom: -2px; }

.resize-left, .resize-right {
  top: 4px;
  bottom: 4px;
  width: 4px;
  cursor: e-resize;
  border-radius: var(--radius-xs);
}
.resize-left  { left: -2px;  cursor: w-resize; }
.resize-right { right: -2px; }

.resize-tr, .resize-br, .resize-bl, .resize-tl {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-xs);
  border: 1px solid #fff;
}
.resize-tr { top: -4px;   right: -4px;  cursor: ne-resize; }
.resize-br { bottom: -4px; right: -4px;  cursor: se-resize; }
.resize-bl { bottom: -4px; left: -4px;   cursor: sw-resize; }
.resize-tl { top: -4px;   left: -4px;   cursor: nw-resize; }
</style>
