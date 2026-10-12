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
  /**
   * 当前产物的**设计稿尺寸**（异步可得）。
   *
   * 🔴 为什么需要（事故 mc-1791783806265-5831962c）：
   *   用户拖过的尺寸会被持久化，而 `width` computed 是
   *   `customWidth > 0 ? customWidth : defaultWidth` ⇒ **一旦存过就永远走不到 default**。
   *   于是「默认视口跟随设计稿比例」这类修复对老用户完全无效——
   *   他们浏览器里存着旧版写死 1280×667 推出的 1310×680 错值，
   *   且没有任何手段察觉。这也是同一症状反复出现的隐性原因。
   *
   * 机制：存尺寸时一并记下当时的比例；恢复时若比例已变（组件重新生成、
   *   设计稿改了），判定为**过期快照**并丢弃，回落到 default。
   *   这样「改了默认逻辑 ⇒ 老用户也能立刻受益」，无需手动清缓存。
   */
  designSize?: MaybeRefOrGetter<{ width: number; height: number } | null>
  /**
   * 🔴 宿主对被拖拽元素的 CSS `transform: scale()` 值（可传 ref/getter）。
   *
   * 为什么需要：画布被整体缩放后，鼠标位移（clientX）单位是**屏幕像素**，
   * 而尺寸是**画布坐标**。不换算就会「拖 10px 画布只动 10×scale px」，
   * 手柄明显跟不上鼠标（缩得越偏越严重）。
   * 例：画布 1920 宽被缩到 0.5 显示，鼠标移动 100 屏幕 px 实际是200 画布 px。
   */
  scaleFactor?: MaybeRefOrGetter<number>
}

type PersistedSize = {
  width?: number
  height?: number
  preset?: string
  locked?: boolean
  /**
   * 写入时的设计稿宽高比（如 '0.767' 表示 510:665）。
   * 恢复时若与当前比例不符即视为过期快照并丢弃。
   */
  designRatio?: string
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
    scaleFactor = 1,
    designSize,
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

  /** 当前设计稿宽高比（如510:665）。不可得时返回 null（不做失效判定）。 */
  function currentDesignRatio(): string | null {
    const d = toValue(designSize)
    if (!d || !(d.width > 0) || !(d.height > 0)) return null
    // 用约分后的比值字符串，避免浮点误差；保留 3 位小数精度足够
    return `${(d.width / d.height).toFixed(3)}`
  }

  function persist() {
    const key = currentStorageKey()
    if (!key) return
    try {
      const payload: PersistedSize = {
        width: width.value,
        height: height.value,
        preset: presetName.value,
        locked: isWidthLocked.value,
        // 🆕 记录当时的比例：设计稿变了就能识别出这份快照已过期
        designRatio: currentDesignRatio() ?? undefined,
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

      // 🔴 过期判定：存的快照与当前设计稿比例不符 ⇒ 丢弃，回落到 default。
      //   事故 mc-1791783806265-5831962c：用户在旧版（defaultHeight 写死 667）拖过一次，
      //   存下1310×680；后来default 改成「跟随设计稿比例」，但 `customWidth>0` 会
      //   让 default 永远不生效 ⇒ 用户看到的仍是一片空白，且没有任何自愈路径。
      //   注意：**旧快照没有 designRatio 字段**（undefined），也一律作废 ——
      //   它们来自旧逻辑，无法证明与新默认一致。
      const curRatio = currentDesignRatio()
      if (curRatio && data.designRatio !== curRatio) {
        try {
          window.localStorage.removeItem(key)
        } catch {
          /* 静默 */
        }
        customWidth.value = 0
        customHeight.value = 0
        presetName.value = 'default'
        return
      }

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
   *
   * 🔧 根因（用户两次反馈「松开左键后尺寸还在变」）：
   *   预览区是 iframe。拖拽路径一旦经过 iframe，mousemove/mouseup 会派发给
   *   **iframe 内部文档**，宿主 document 收不到 mouseup ⇒ 监听器残留、
   *   isResizing 卡在 true，松开后鼠标一动尺寸继续变。
   *
   *   ⚠️ 此前的实现无效：`@mousedown` 拿到的是 MouseEvent，**没有 pointerId**
   *   （实测 `pointerId === undefined`），所以 `setPointerCapture` 分支永远进不去，
   *   每次都落到 document 兜底 —— 而兜底恰恰是被 iframe 吞掉的那条路。
   *   现在改为 @pointerdown（自带 pointerId）+ setPointerCapture，iframe 吞不掉。
   */
  let captureEl: HTMLElement | null = null
  /** 捕获阶段的 pointerId，释放 capture 时需要 */
  let capturePointerId = -1

  function applyDrag(e: MouseEvent) {
    // 🔴 缩放换算：宿主若对被拖元素施加了 transform: scale()，
    //   clientX 位移是**屏幕像素**，而 width/height 是**画布坐标**。
    //   不除以 scale 会导致「鼠标走 100px、画布只动 100×scale px」，
    //   手柄明显跟不上鼠标（缩得越小偏差越大）。
    const s = toValue(scaleFactor)
    const k = Number.isFinite(s) && s > 0 ? s : 1
    const deltaX = (e.clientX - startX) / k
    const deltaY = (e.clientY - startY) / k
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

  /** 拖拽移动：同时兼容 PointerEvent / MouseEvent，并做 rAF 节流 */
  function onDragMove(e: MouseEvent) {
    // 🛡️ 硬保险：已收尾则一律忽略。即便有监听器漏摘（iframe 吞事件、
    //    pointer capture 异常等），isResizing 为 false 时也不会再改尺寸 ——
    //    这条是「松开后还在变」的最后一道防线，不依赖事件是否送达。
    if (!isResizing.value) return
    pendingEvent = e
    if (rafId) return
    rafId = window.requestAnimationFrame(() => {
      rafId = 0
      // rAF 回调执行时可能已经松手（isResizing 变false），此时丢弃这次更新
      if (pendingEvent && isResizing.value) applyDrag(pendingEvent)
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
    // 先摘 Pointer Capture（release 会触发 lostpointercapture → finishResize 递归，
    // 故用 captureEl 置 null 提前断开，避免重复收尾）
    const el = captureEl
    captureEl = null
    if (el) {
      el.removeEventListener('pointermove', onDragMove)
      el.removeEventListener('pointerup', finishResize)
      el.removeEventListener('pointercancel', finishResize)
      el.removeEventListener('lostpointercapture', finishResize)
      try {
        if (typeof capturePointerId === 'number' && el.hasPointerCapture?.(capturePointerId)) {
          el.releasePointerCapture(capturePointerId)
        }
      } catch {
        /* 已释放 */
      }
    }
    // document 上的所有可能监听路径都要摘干净（任一残留都会导致「松开后还在变」）
    document.removeEventListener('pointermove', onDragMove)
    document.removeEventListener('pointerup', finishResize)
    document.removeEventListener('pointercancel', finishResize)
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', finishResize)
    window.removeEventListener('blur', finishResize)
    // 尺寸落定 → 归档为 custom 并持久化
    presetName.value = 'custom'
    persist()
  }

  /**
   * 开始拖拽。
   * 🔧 绑到手柄的 **@pointerdown**（不是 @mousedown）：
   *   只有 pointerdown 事件才带 pointerId，setPointerCapture 依赖它。
   *   用 mousedown 时 pointerId 为 undefined，capture 分支永远走不到。
   */
  function startResize(event: MouseEvent | PointerEvent, direction: ResizeDirection) {
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

    // 窗口失焦兜底：拖到 iframe/浏览器外松手时至少能收尾
    window.addEventListener('blur', finishResize)

    const el = event.currentTarget as HTMLElement | null
    const pointerId = (event as PointerEvent).pointerId

    // 主路径：Pointer Capture —— pointermove/pointerup 恒派发给手柄，iframe 吞不掉
    if (el && typeof el.setPointerCapture === 'function' && typeof pointerId === 'number') {
      try {
        el.setPointerCapture(pointerId)
        captureEl = el
        capturePointerId = pointerId
        el.addEventListener('pointermove', onDragMove)
        el.addEventListener('pointerup', finishResize)
        el.addEventListener('pointercancel', finishResize)
        el.addEventListener('lostpointercapture', finishResize)
        // 同时兜底 document（pointerup 若因任何原因没到手柄，document 还能接住）
        document.addEventListener('pointerup', finishResize)
        return
      } catch {
        captureEl = null
      }
    }

    // 兜底：退化到 Pointer 事件绑 document（比 mousedown 可靠：pointerup 在
    // iframe 上也会冒泡回宿主的 document，与mousemove 不同）
    document.addEventListener('pointermove', onDragMove)
    document.addEventListener('pointerup', finishResize)
    document.addEventListener('pointercancel', finishResize)
    // 极端兜底：mousedown 触发时若环境无 Pointer Events，仍需 mouseup 收尾
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
