<!--
 * ErrorBoundary — 通用错误边界组件
 * 捕获子组件渲染期抛出的错误（Vue 编译错误、运行时异常等），
 * 替代默认的"白屏/原始警告文本溢出"行为，提供友好错误卡片。
 *
 * 用法：
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * 可选 props：
 * - title: 错误卡片标题（默认"组件渲染出错"）
 * - onRetry: 重试回调（点击"重新加载"时触发）
 * - timeout: 加载超时毫秒数（默认 0，即不检测超时；推荐设为 10000 = 10s）
 -->
<template>
  <div class="error-boundary" v-if="error">
    <div class="error-boundary-card">
      <div class="error-boundary-header">
        <span class="error-boundary-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
        <span class="error-boundary-title">{{ title }}</span>
      </div>

      <p class="error-boundary-summary">{{ error.message || String(error) }}</p>

      <div class="error-boundary-actions">
        <a-button size="small" @click="handleRetry">重新加载</a-button>
        <a-button
          v-if="props.onAiFix"
          size="small"
          type="primary"
          :loading="aiFixing"
          @click="handleAiFix"
        >
          AI 修复
        </a-button>
        <a-button size="small" @click="toggleDetail">
          {{ showDetail ? '收起堆栈' : '查看完整堆栈' }}
        </a-button>
        <a-button size="small" @click="handleCopy">复制错误</a-button>
      </div>

      <pre v-if="showDetail" class="error-boundary-detail">{{ stack }}</pre>
    </div>
  </div>
  <slot v-else />
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, onErrorCaptured } from 'vue'
import { message } from 'ant-design-vue'

const props = defineProps({
  title: { type: String, default: '组件渲染出错' },
  onRetry: { type: Function, default: null },
  onAiFix: { type: Function, default: null },
  timeout: { type: Number, default: 0 }, // 加载超时毫秒数（0 = 不检测）
})

const emit = defineEmits(['error', 'recovered'])

const error = ref(null)
const showDetail = ref(false)
const stack = ref('')
const timer = ref(null)
const aiFixing = ref(false)

// 超时检测：如果 timeout > 0，启动定时器
function startTimeout() {
  if (props.timeout > 0 && !error.value) {
    clearTimeout(timer.value)
    timer.value = setTimeout(() => {
      const timeoutError = new Error(`组件加载超时（${props.timeout / 1000} 秒未响应）`)
      error.value = timeoutError
      stack.value = `组件在 ${props.timeout / 1000} 秒内未完成加载，可能是：\n1. 后端服务响应慢\n2. 网络延迟\n3. 组件代码存在死循环或阻塞操作`
      emit('error', { error: timeoutError, info: 'timeout', stack: stack.value })
    }, props.timeout)
  }
}

function stopTimeout() {
  if (timer.value) {
    clearTimeout(timer.value)
    timer.value = null
  }
}

// 监听 error 变化，一旦出现错误就停止定时器
watch(error, (newErr) => {
  if (newErr) stopTimeout()
}, { immediate: true })

onMounted(() => {
  startTimeout()
})

onBeforeUnmount(() => {
  stopTimeout()
})

function extractStack(err) {
  if (!err) return ''
  if (err.stack) return err.stack
  if (err.message) return err.message
  if (typeof err === 'string') return err
  return JSON.stringify(err, null, 2)
}

// 捕获子组件渲染期错误（setup / render / 生命周期）
function handleRetry() {
  error.value = null
  showDetail.value = false
  stopTimeout()
  startTimeout()
  emit('recovered')
  if (props.onRetry) props.onRetry()
}

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(`${props.title}\n${error.value?.message || ''}\n\n${stack.value}`)
    message.success('错误已复制到剪贴板')
  } catch {
    message.error('复制失败，请手动选择文本')
  }
}

async function handleAiFix() {
  if (!props.onAiFix || !error.value || aiFixing.value) return
  aiFixing.value = true
  try {
    const result = await props.onAiFix({
      error: error.value,
      message: error.value?.message || String(error.value),
      stack: stack.value,
    })
    // 仅 AI 修复成功时才清除错误卡片；失败时保持错误可见，供用户重试
    if (result === true) {
      error.value = null
      showDetail.value = false
      stopTimeout()
      startTimeout()
      emit('recovered')
    }
  } finally {
    aiFixing.value = false
  }
}

function toggleDetail() {
  showDetail.value = !showDetail.value
}

// 供父组件手动推送错误（import/编译阶段错误无法被 onErrorCaptured 捕获）
function setError(err, info = '') {
  error.value = err
  stack.value = `${extractStack(err)}\n\n--- Vue info ---\n${info || ''}`
  if (err) emit('error', { error: err, info, stack: stack.value })
  // 错误被清除时也要停止超时计时器，避免遗留的 timeout 在重新加载期间误触发
  if (!err) stopTimeout()
}

// 供父组件调用：组件加载成功后停止超时检测
function markLoaded() {
  stopTimeout()
}

defineExpose({ setError, markLoaded })

// onErrorCaptured 在子组件树的错误冒泡到全局前拦截
// 返回 false 阻止错误继续向上传播（避免白屏）
onErrorCaptured((err, instance, info) => {
  error.value = err
  stack.value = `${extractStack(err)}\n\n--- Vue info ---\n${info || ''}`
  stopTimeout() // 错误已捕获，停止超时计时器
  emit('error', { error: err, info, stack: stack.value })
  // false = 阻止错误继续冒泡到 window.onerror（避免 tracing 吞掉且白屏）
  return false
})
</script>

<style scoped>
.error-boundary {
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: var(--bg-alt, #f5f6f8);
}

.error-boundary-card {
  max-width: 680px;
  width: 100%;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-danger, var(--error-border));
  border-radius: var(--radius-md);
  padding: 20px;
  box-shadow: var(--shadow-md);
}

.error-boundary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.error-boundary-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--error);
}

.error-boundary-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--error-text);
}

.error-boundary-summary {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #5f5e5a);
  word-break: break-word;
}

.error-boundary-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.error-boundary-detail {
  margin: 0;
  padding: 12px;
  background: var(--bg-hover);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.5;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  border: 1px solid var(--border-default);
}
</style>
