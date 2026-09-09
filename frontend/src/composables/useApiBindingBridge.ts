import { ref, onMounted, onUnmounted } from 'vue'

export interface ApiBindingOpenMessage {
  type: 'MVGO_OPEN_API_BINDING'
  componentId: string
  groupId: string
  componentName?: string
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

  function handleMessage(event: MessageEvent) {
    // 同源 OR sandboxed iframe（origin 为 "null" 字符串）均放行；靠 type 字段过滤伪造消息
    if (event.origin !== window.location.origin && event.origin !== 'null') return
    const data = event.data as ApiBindingOpenMessage | undefined
    if (!data || data.type !== 'MVGO_OPEN_API_BINDING') return
    bindingComponentId.value = data.componentId || ''
    bindingGroupId.value = data.groupId || ''
    bindingComponentName.value = data.componentName || data.componentId || ''
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
    emitRefresh,
  }
}
