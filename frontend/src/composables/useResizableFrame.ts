/**
 * useResizableFrame —— 预览容器可拖拽调尺（响应式测试模式）的唯一实现。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────
 * 预览 iframe 元素本身的 width/height 改变后，其内部 window.innerWidth/innerHeight
 * 会自动更新、CSS @media 会自动重新匹配 —— 这是浏览器原生行为，跨域与否都成立。
 * 所以「让组件响应式」不需要向 iframe 内postMessage，改外层元素尺寸就够了。
 * 但注意：**transform: scale() 不等于视口变化**，媒体查询不会命中（项目里
 * views/demo/index.vue 的旧实现就是这个坑），因此本 composable 只改真实尺寸。
 *
 * ── 项目纪律 ────────────────────────────────────────────────────
 * 拖拽逻辑全仓只允许存在这一份实现。任何页面需要调尺都必须 import 本文件，
 * 不得复制粘贴 startResize / onResize（副本即事故温床）。
 *
 * ── 使用 ────────────────────────────────────────────────────────
 *   const {
 *     size, isResizing, showSizeBubble, sizeLabel, frameStyle, bodyStyle,
 *     isWidthLocked, presetName, overflowPx, setOverflowSource,
 *     startResize, onHandleKeydown, onHandleFocus,
 *     applyPreset, unlockWidth, resetSize, restore,
 *   } = useResizableFrame({ componentId, defaultWidth: 1280, defaultHeight: 720 })
 *
 * 模板里（style 见各页面，与页面自身风格一致）：
 *   <div :style="frameStyle">
 *     <div class="rz-h rz-h--r" tabindex="0" role="separator"
 *          @mousedown="startResize($event, 'right')"
 *          @keydown="onHandleKeydown($event, 'right')"
 *          @focus="onHandleFocus" />
 *     ...
 *   </div>
 */

import { ref, computed, toValue, onBeforeUnmount } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

export type ResizeDirection = 'right' | 'bottom' | 'corner'

/** 键盘微调的基础步长（px）；按住 Shift 时的加速步长。 */
export const RESIZE_STEP = 10

/** 拖拽量化步进（px）。量化后取整更稳，也避免个别浏览器下的亚像素抖动。 */
const DRAG_QUANTIZE = 10

export type UseResizableFrameOptions = {
  /**
   * 持久化 key 的主体（通常是 componentId）。
   * **可以是 ref/computed** —— 任务详情页要等 task 加载完才能定 key。
   * 不传（或解析为空）则不持久化。
   */
  componentId?: MaybeRefOrGetter<string>
  minWidth?: number
  minHeight?: number
  /**
   * 初始宽度（未拖拽/未持久化命中时使用）。
   * 可以是 getter —— demo 页的兜底是「Figma 原始尺寸」，异步加载完成后才确定。
   */
  defaultWidth?: MaybeRefOrGetter<number>
  /** 初始高度，同上支持 getter */
  defaultHeight?: MaybeRefOrGetter<number>
  /** 默认是否锁定宽度（档位预设态用） */
  defaultLockWidth?: boolean
  /** localStorage 前缀，便于多环境隔离 */
  storagePrefix?: string
}

type PersistedSize = {
  width?: number
  height?: number
  preset?: string
  locked?: boolean
}

const DEFAULT_MIN_WIDTH = 320
const DEFAULT_MIN_HEIGHT = 240
const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 720

function readNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function useResizableFrame(options: UseResizableFrameOptions = {}) {
  const {
    componentId: componentIdInput = '',
    minWidth = DEFAULT_MIN_WIDTH,
    minHeight = DEFAULT_MIN_HEIGHT,
    defaultWidth = DEFAULT_WIDTH,
    defaultHeight = DEFAULT_HEIGHT,
    defaultLockWidth = false,
    storagePrefix = 'mvgo:preview-size:',
  } = options

  // ── 状态 ─────────────────────────────────────────────────────
  /** 0 = 未拖拽过，回落到 defaultWidth/Height */
  const customWidth = ref(0)
  const customHeight = ref(0)
  const isResizing = ref(false)
  const activeHandle = ref<'' | ResizeDirection>('')
  /** 用户是否显式锁定宽度（档位预设态） */
  const isWidthLocked = ref(defaultLockWidth)
  /** 当前命中的档位名；'custom' 表示用户拖拽过 */
  const presetName = ref('default')
  /** 拖拽中显示的尺寸气泡 */
  const showSizeBubble = ref(false)

  /** 实际生效尺寸。边界在此统一钳制 —— 任何入口（拖拽/档位/恢复/非法值）都不绕过。 */
  const width = computed(() => {
    const raw = customWidth.value > 0 ? customWidth.value : toValue(defaultWidth)
    return Math.max(minWidth, Math.round(raw))
  })
  const height = computed(() => {
    const raw = customHeight.value > 0 ? customHeight.value : toValue(defaultHeight)
    return Math.max(minHeight, Math.round(raw))
  })

  const sizeLabel = computed(() => `${width.value} × ${height.value}`)

  /** 拖拽期间禁止整页文字被选中，同时给出方向光标 */
  const bodyStyle = computed(() => {
    if (!isResizing.value) return null
    const cursor =
      activeHandle.value === 'right'
        ? 'ew-resize'
        : activeHandle.value === 'bottom'
          ? 'ns-resize'
          : 'nwse-resize'
    return { cursor, userSelect: 'none' } as Record<string, string> | null
  })

  /** 直接绑到 iframe / 预览容器上的样式。注意：只输出真实尺寸，不含 scale。 */
  const frameStyle = computed(() => ({
    width: `${width.value}px`,
    height: `${height.value}px`,
    maxWidth: 'none',
  }))

  // ── 越界检测（FR-6）──────────────────────────────────────────
  // 响应式测试的核心价值就是发现溢出；工具自己把溢出藏起来等于废掉价值。
  // 宿主（父页面）测得 iframe 内容实际高度后注入；测不到时为 0 → 不显示提示。
  const contentHeight = ref(0)
  function setOverflowSource(h: number) {
    const n = readNumber(h)
    contentHeight.value = n > 0 ? Math.round(n) : 0
  }
  const overflowPx = computed(() => {
    if (contentHeight.value <= 0) return 0
    return Math.max(0, contentHeight.value - height.value)
  })

  // ── 持久化（FR-4）─────────────────────────────────────────────
  // componentId 允许传computed：任务详情页要先拿到 task 才能定持久化 key。
  // 这里统一用 unref 解析，且在每次读写时重新解析，key 变化后自动落到新桶。
  const resolveComponentId = () => toValue(componentIdInput) || ''
  function currentStorageKey() {
    const id = resolveComponentId()
    return id ? `${storagePrefix}${id}` : ''
  }
  const storageKey = computed(() => currentStorageKey())

  function persist() {
    const key = currentStorageKey()
    if (!key) return
    try {
      const payload: PersistedSize = {
        width: width.value,
        height: height.value,
        preset: presetName.value,
        locked: isWidthLocked.value,
      }
      window.localStorage.setItem(key, JSON.stringify(payload))
    } catch {
      // 隐私模式 / 配额满 / 无痕模式：静默失败，不影响预览主链路
    }
  }

  /**
   * 从 localStorage 恢复。**读到非法值必须静默回落到默认档位**，
   * 绝不throw、绝不白屏 —— 持久化只是便利功能，不能成为预览可用性的单点。
   */
  function restore() {
    const key = currentStorageKey()
    if (!key) return
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      return
    }
    if (!raw) return
    try {
      const data = JSON.parse(raw) as PersistedSize
      if (!data || typeof data !== 'object') return
      const w = readNumber(data.width)
      const h = readNumber(data.height)
      // 宽高必须都达到下限才认为合法，否则视为损坏数据（保持默认）
      if (w >= minWidth && h >= minHeight) {
        customWidth.value = w
        customHeight.value = h
      }
      if (typeof data.preset === 'string' && data.preset) {
        presetName.value = data.preset
      }
      if (typeof data.locked === 'boolean') {
        isWidthLocked.value = data.locked
      }
    } catch {
      // JSON 损坏 → 保持默认，不报错
    }
  }

  function clearPersisted() {
    const key = currentStorageKey()
    if (!key) return
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* 同上 */
    }
  }

  // ── 拖拽 ─────────────────────────────────────────────────────
  // rAF 节流：demo 页旧实现直接在 mousemove 里写 ref，拖拽时实测掉帧，不照抄。
  let startX = 0
  let startY = 0
  let startW = 0
  let startH = 0
  let rafId = 0
  let pendingEvent: MouseEvent | null = null
  /**
   * Pointer Capture 的手柄元素。
   * 🔧 根因修复（用户反馈「松开后尺寸依旧会变」）：拖拽路径经过预览 iframe 时，
   * mousemove/mouseup 会派发给 iframe 内部文档，宿主 document 收不到 mouseup
   * → 监听器残留、isResizing 卡在 true，松开后鼠标一动尺寸继续变。
   * 手柄 setPointerCapture 后 pointermove/pointerup 恒派发给手柄，iframe 吞不掉。
   */
  let captureEl: HTMLElement | null = null

  function applyDrag(e: MouseEvent) {
    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY
    const dir = activeHandle.value
    if (!dir) return

    if ((dir === 'right' || dir === 'corner') && !isWidthLocked.value) {
      const raw = startW + deltaX
      customWidth.value = Math.max(minWidth, Math.round(raw / DRAG_QUANTIZE) * DRAG_QUANTIZE)
    }
    if (dir === 'bottom' || dir === 'corner') {
      const raw = startH + deltaY
      customHeight.value = Math.max(minHeight, Math.round(raw / DRAG_QUANTIZE) * DRAG_QUANTIZE)
    }
  }

  function onDragMove(e: MouseEvent) {
    if (!isResizing.value) return
    pendingEvent = e
    if (rafId) return
    rafId = window.requestAnimationFrame(() => {
      rafId = 0
      if (pendingEvent) applyDrag(pendingEvent)
      pendingEvent = null
    })
  }

  function finishResize() {
    if (rafId) {
      window.cancelAnimationFrame(rafId)
      rafId = 0
    }
    pendingEvent = null
    isResizing.value = false
    activeHandle.value = ''
    showSizeBubble.value = false
    if (captureEl) {
      captureEl.removeEventListener('pointermove', onDragMove)
      captureEl.removeEventListener('pointerup', finishResize)
      captureEl.removeEventListener('pointercancel', finishResize)
      captureEl = null
    }
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', finishResize)
    window.removeEventListener('blur', finishResize)
    // 尺寸落定 → 归档为 custom 并持久化
    presetName.value = 'custom'
    persist()
  }

  /** 开始拖拽。绑定到手柄的 @mousedown。 */
  function startResize(event: MouseEvent, direction: ResizeDirection) {
    // 只处理主键，避免右键/中键误触
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    // 正在拖拽时再次按下：先收尾上一次，避免监听器泄漏
    if (isResizing.value) finishResize()

    isResizing.value = true
    activeHandle.value = direction
    showSizeBubble.value = true
    startX = event.clientX
    startY = event.clientY
    startW = width.value
    startH = height.value
    // 把当前生效值固化下来，否则第一次拖拽会从 default 值跳变
    customWidth.value = startW
    customHeight.value = startH

    window.addEventListener('blur', finishResize)

    // 优先 Pointer Capture：拖拽经过 iframe 也不丢事件（见 captureEl 注释）
    const el = event.currentTarget as HTMLElement | null
    const pointerId = (event as PointerEvent).pointerId
    if (el && typeof el.setPointerCapture === 'function' && typeof pointerId === 'number') {
      try {
        el.setPointerCapture(pointerId)
        captureEl = el
        el.addEventListener('pointermove', onDragMove)
        el.addEventListener('pointerup', finishResize)
        el.addEventListener('pointercancel', finishResize)
        return
      } catch {
        captureEl = null
      }
    }
    // 兜底：不支持 Pointer Capture 的环境退回 document 监听
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', finishResize)
  }

  // ── 键盘无障碍（FR-5）────────────────────────────────────────
  // Esc 撤销：手柄获得焦点时记一次快照，按 Esc 回滚到该次聚焦前的尺寸。
  let focusSnapshotW = 0
  let focusSnapshotH = 0

  function onHandleFocus() {
    focusSnapshotW = width.value
    focusSnapshotH = height.value
  }

  function nudge(direction: ResizeDirection, delta: number) {
    if ((direction === 'right' || direction === 'corner') && !isWidthLocked.value) {
      customWidth.value = Math.max(minWidth, width.value + delta)
    }
    if (direction === 'bottom' || direction === 'corner') {
      customHeight.value = Math.max(minHeight, height.value + delta)
    }
    presetName.value = 'custom'
    persist()
  }

  /**
   * 绑到手柄的 @keydown。方向键调整尺寸，Shift 加速，Esc 撤销到本次聚焦前。
   * 需要读 shiftKey，故不用Vue 的键盘修饰符简写。
   */
  function onHandleKeydown(event: KeyboardEvent, direction: ResizeDirection) {
    const step = event.shiftKey ? RESIZE_STEP : 1
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        nudge(direction, step)
        break
      case 'ArrowLeft':
        event.preventDefault()
        nudge(direction, -step)
        break
      case 'ArrowDown':
        event.preventDefault()
        nudge(direction, step)
        break
      case 'ArrowUp':
        event.preventDefault()
        nudge(direction, -step)
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        // 回滚到本次聚焦前的尺寸（撤销自愈式地恢复用户意图）
        if (focusSnapshotW >= minWidth) customWidth.value = focusSnapshotW
        if (focusSnapshotH >= minHeight) customHeight.value = focusSnapshotH
        persist()
        break
      default:
        break
    }
  }

  // ── 档位预设（FR-3）──────────────────────────────────────────
  /**
   * 应用档位。选中档位时**宽度进入锁定态**（只允许调高度），
   * 因为对外演示时「刚好 375px」比「大概 380px」有说服力。
   * @param label 档位显示名，同时写入 presetName
   */
  function applyPreset(label: string, presetWidth: number, presetHeight: number) {
    const w = Math.max(minWidth, Math.round(readNumber(presetWidth)))
    const h = Math.max(minHeight, Math.round(readNumber(presetHeight)))
    if (w <= 0 || h <= 0) return
    customWidth.value = w
    customHeight.value = h
    presetName.value = label
    isWidthLocked.value = true
    persist()
  }

  function unlockWidth() {
    isWidthLocked.value = false
    persist()
  }

  function lockWidth() {
    isWidthLocked.value = true
    persist()
  }

  /** 重置为默认尺寸并清除持久化记录 */
  function resetSize() {
    customWidth.value = 0
    customHeight.value = 0
    presetName.value = 'default'
    isWidthLocked.value = defaultLockWidth
    clearPersisted()
  }

  onBeforeUnmount(() => {
    finishResize()
  })

  return {
    // 尺寸
    width,
    height,
    sizeLabel,
    frameStyle,
    bodyStyle,
    // 状态
    isResizing,
    activeHandle,
    showSizeBubble,
    isWidthLocked,
    presetName,
    overflowPx,
    // 持久化（storageKey 导出便于调试/校验当前落桶是否正确）
    storageKey,
    // 溢出检测
    setOverflowSource,
    // 行为
    startResize,
    onHandleKeydown,
    onHandleFocus,
    applyPreset,
    lockWidth,
    unlockWidth,
    resetSize,
    persist,
    restore,
  }
}
