// ============================================================
// 大屏布局编辑器 — 撤销/重做历史栈
// 深拷贝快照模式，debounce 推入，限制深度 50
// ============================================================

import { ref, watch, type Ref } from 'vue'
import type { ScreenLayout } from '@/types/screen-layout'

const MAX_DEPTH = 50
const DEBOUNCE_MS = 400

/** 深拷贝（JSON 方式，layoutData 无函数/循环引用） */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export function useHistory(layoutData: Ref<ScreenLayout>) {
  const undoStack = ref<ScreenLayout[]>([])
  const redoStack = ref<ScreenLayout[]>([])
  const canUndo = ref(false)
  const canRedo = ref(false)
  const isApplying = ref(false) // undo/redo 操作进行中，跳过 watch

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let lastSnapshot: string = ''

  /** 更新 canUndo/canRedo */
  function updateFlags() {
    canUndo.value = undoStack.value.length > 0
    canRedo.value = redoStack.value.length > 0
  }

  /** 推入当前状态到 undo 栈（debounce） */
  function pushHistory() {
    if (isApplying.value) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const snapshot = JSON.stringify(layoutData.value)
      if (snapshot === lastSnapshot) return // 无变化
      lastSnapshot = snapshot
      undoStack.value.push(deepClone(layoutData.value))
      if (undoStack.value.length > MAX_DEPTH) {
        undoStack.value.shift()
      }
      redoStack.value = [] // 新操作清空 redo
      updateFlags()
    }, DEBOUNCE_MS)
  }

  /** 撤销 */
  function undo() {
    if (undoStack.value.length === 0) return
    isApplying.value = true
    // 当前状态推入 redo
    redoStack.value.push(deepClone(layoutData.value))
    // 取出上一个状态
    const prev = undoStack.value.pop()!
    lastSnapshot = JSON.stringify(prev)
    layoutData.value = prev
    isApplying.value = false
    updateFlags()
  }

  /** 重做 */
  function redo() {
    if (redoStack.value.length === 0) return
    isApplying.value = true
    // 当前状态推入 undo
    undoStack.value.push(deepClone(layoutData.value))
    // 取出下一个状态
    const next = redoStack.value.pop()!
    lastSnapshot = JSON.stringify(next)
    layoutData.value = next
    isApplying.value = false
    updateFlags()
  }

  /** 重置历史（切换预设/加载配置时调用） */
  function resetHistory() {
    undoStack.value = []
    redoStack.value = []
    lastSnapshot = JSON.stringify(layoutData.value)
    updateFlags()
  }

  // 深度 watch layoutData，debounce 推入历史
  watch(
    () => layoutData.value,
    () => { pushHistory() },
    { deep: true },
  )

  // 初始化 lastSnapshot
  lastSnapshot = JSON.stringify(layoutData.value)

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    pushHistory,
    resetHistory,
  }
}
