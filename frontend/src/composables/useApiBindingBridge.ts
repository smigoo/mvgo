import { ref, onMounted, onUnmounted } from 'vue'

/** S4 确定性自动接线项（来自 s4-meta.json views[].autoBindings，供向导预填） */
export interface S4AutoBindingBrief {
  tag: string
  fn: string
  target: string
  params?: Record<string, any>
}

export interface ApiBindingOpenMessage {
  type: 'MVGO_OPEN_API_BINDING'
  componentId: string
  groupId: string
  componentName?: string
  /** 'component'（默认，组件开发线）| 's4'（前端开发线 S4 预览） */
  mode?: 'component' | 's4'
  /** s4 模式下：本视图可绑定的数据槽名列表（来自 s4-meta.json） */
  slots?: string[]
  /** s4 模式下：确定性自动接线结果（数据槽 ↔ api 函数），用于向导预填（无人工绑定侧车时） */
  autoBindings?: S4AutoBindingBrief[]
}

/** 全局向导完成「刷新预览」后广播的事件名（内嵌预览页据此重载 iframe） */
export const API_BINDING_REFRESH_EVENT = 'mvgo:api-binding-refresh'

/**
 * 跨 iframe 桥梁（父页面侧，挂载于 App 根级）。
 *
 * 预览页（运行在 iframe 内）点击「对接接口」时，通过 postMessage 通知父页面打开
 * 全屏向导，避免 a-modal 被 iframe 的小尺寸（2x Figma）限制。
 */
export function useApiBindingBridge() {
  const bindingWizardOpen = ref(false)
  const bindingComponentId = ref('')
  const bindingGroupId = ref('')
  const bindingComponentName = ref('')
  const bindingMode = ref<'component' | 's4'>('component')
  const bindingSlots = ref<string[]>([])
  const bindingAutoBindings = ref<S4AutoBindingBrief[]>([])

  function handleMessage(event: MessageEvent) {
    // 同源 OR sandboxed iframe（origin 为 "null" 字符串）均放行；靠 type 字段过滤伪造消息
    if (event.origin !== window.location.origin && event.origin !== 'null') return
    const data = event.data as ApiBindingOpenMessage | undefined
    if (!data || data.type !== 'MVGO_OPEN_API_BINDING') return
    bindingComponentId.value = data.componentId || ''
    bindingGroupId.value = data.groupId || ''
    bindingComponentName.value = data.componentName || data.componentId || ''
    bindingMode.value = data.mode === 's4' ? 's4' : 'component'
    bindingSlots.value = Array.isArray(data.slots) ? data.slots : []
    bindingAutoBindings.value = Array.isArray(data.autoBindings) ? data.autoBindings : []
    bindingWizardOpen.value = true
  }

  onMounted(() => window.addEventListener('message', handleMessage))
  onUnmounted(() => window.removeEventListener('message', handleMessage))

  /** 向导「刷新预览」后广播事件，供内嵌页面重载 iframe */
  function emitRefresh() {
    window.dispatchEvent(
      new CustomEvent(API_BINDING_REFRESH_EVENT, {
        detail: { componentId: bindingComponentId.value },
      }),
    )
  }

  return {
    bindingWizardOpen,
    bindingComponentId,
    bindingGroupId,
    bindingComponentName,
    bindingMode,
    bindingSlots,
    bindingAutoBindings,
    emitRefresh,
  }
}
