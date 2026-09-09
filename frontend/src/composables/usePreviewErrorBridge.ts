/**
 * 预览组件加载错误的跨 iframe 通知桥。
 *
 * 预览页（/preview，运行在 iframe 内）若加载组件失败，会通过 postMessage
 * 发送 MVGO_PREVIEW_ERROR 给父页面。父页面用本 composable 监听，
 * 在「不影响整站」的前提下，于当前页面显示一条非阻塞的红色提示条。
 *
 * 使用：
 *   const { previewError, clearPreviewError } = usePreviewErrorBridge()
 *   <PreviewErrorBanner :message="previewError" @dismiss="clearPreviewError" />
 */
import { ref, onMounted, onUnmounted } from 'vue'

type PreviewFixedPayload = {
  type: 'MVGO_PREVIEW_FIXED'
  componentId?: string
  groupId?: string
  summary?: string
}

export type PreviewDiagnostic = {
  file?: string
  line?: number
  column?: number
  message?: string
}

type PreviewBridgeOptions = {
  onFixed?: (payload: PreviewFixedPayload) => void | Promise<void>
}

export function usePreviewErrorBridge(options: PreviewBridgeOptions = {}) {
  const previewError = ref('')
  const previewDiagnostic = ref<PreviewDiagnostic | null>(null)

  function onMessage(event: MessageEvent) {
    // 同源 OR sandboxed iframe（origin 为 "null" 字符串）均放行；靠 type 字段过滤伪造消息
    if (event.origin !== window.location.origin && event.origin !== 'null') return
    const data = event.data
    if (!data || typeof data.type !== 'string') return

    if (data.type === 'MVGO_PREVIEW_ERROR') {
      previewError.value = data.message || '组件加载失败（组件自身问题，不影响系统）'
      previewDiagnostic.value = data.diagnostic || null
      return
    }

    if (data.type === 'MVGO_PREVIEW_FIXED') {
      previewError.value = ''
      previewDiagnostic.value = null
      options.onFixed?.(data as PreviewFixedPayload)
    }
  }

  // iframe 重载（key 变化）时应清除旧提示，避免残留
  function clearPreviewError() {
    previewError.value = ''
    previewDiagnostic.value = null
  }

  onMounted(() => window.addEventListener('message', onMessage))
  onUnmounted(() => window.removeEventListener('message', onMessage))

  return { previewError, previewDiagnostic, clearPreviewError }
}

export default usePreviewErrorBridge
