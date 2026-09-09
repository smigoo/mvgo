<template>
  <div class="generator-form">
    <div class="main-content">
      <!-- 左右布局区域 -->
      <div class="top-layout">
        <!-- 左侧：表单 -->
        <div class="left-panel">
          <form @submit.prevent="handleSubmit">
            <div class="form-group">
              <label for="figmaUrl">Figma URL</label>
              <input
                type="text"
                id="figmaUrl"
                v-model="formData.figmaUrl"
                placeholder="https://www.figma.com/design/xxx?node-id=123:456"
                required
              />
              <div v-if="urlInfo" class="url-info" :class="urlInfo.type">
                <div v-html="urlInfo.message"></div>
              </div>
            </div>

            <div class="form-group">
              <label for="componentName">组件名称</label>
              <input
                type="text"
                id="componentName"
                v-model="formData.componentName"
                placeholder="c-gjxq"
                required
              />
            </div>

            <div class="button-group">
              <button type="submit" class="btn btn-primary submit-btn" :disabled="isGenerating">
                <div v-if="isGenerating" class="spinner"></div>
                <span>{{ isGenerating ? '生成中...' : '开始生成组件' }}</span>
              </button>
              <button
                v-if="isGenerating"
                type="button"
                class="btn btn-danger cancel-btn"
                @click="handleCancel"
              >
                终止
              </button>
            </div>
          </form>
        </div>

        <!-- 右侧：日志 -->
        <div class="right-panel">
          <LogViewer :logs="logs" @clear="clearLogs" />
        </div>
      </div>

      <!-- 进度卡片 -->
      <ProgressCards :cards="progressCards" />

      <!-- 结果区域 -->
      <div v-if="result" class="result-section" :class="{ error: result.error }">
        <h3>生成结果</h3>
        <div v-if="result.error">
          <p><strong>错误：</strong>{{ result.error }}</p>
        </div>
        <div v-else>
          <p><strong>组件名称：</strong>{{ result.componentName }}</p>
          <p><strong>生成路径：</strong><code>{{ result.componentDir }}</code></p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { generateComponent, createProgressStream, cancelTask } from '@/api/generator'
import ProgressCards from './ProgressCards.vue'
import LogViewer from './LogViewer.vue'
import type { ProgressData } from '@/types/api'
import { createSseRecovery } from '@/utils/sse-recovery'

interface ProgressCard {
  stage: string
  message: string
  status: 'running' | 'completed' | 'failed'
}

interface LogEntry {
  time: string
  level: 'debug' | 'info' | 'warn' | 'error'
  agent?: string
  message: string
  meta?: any
}

interface Result {
  componentName?: string
  componentDir?: string
  error?: string
}

const configStore = useConfigStore()

const formData = ref({
  figmaUrl: '',
  componentName: ''
})

const isGenerating = ref(false)
const progressCards = ref<ProgressCard[]>([])
const logs = ref<LogEntry[]>([])
const result = ref<Result | null>(null)
const urlInfo = ref<{ type: string; message: string } | null>(null)
const currentSessionId = ref<string | null>(null)

let eventSource: EventSource | null = null

// SSE 断开恢复工具
const sseRecovery = createSseRecovery({
  onCompleted: (sid) => {
    updateProgressCard('完成', '✓ 组件生成成功！（SSE 断开恢复）', 'completed')
    addLog('info', '✓ 组件生成成功！（SSE 断开恢复）', '完成')
    result.value = { componentName: undefined }
    isGenerating.value = false
    eventSource?.close()
    eventSource = null
    sseRecovery.stopFallback()
  },
  onFailed: (sid, err) => {
    updateProgressCard('错误', err || '任务失败（SSE 断开恢复）', 'failed')
    result.value = { error: err || '任务失败' }
    isGenerating.value = false
    eventSource?.close()
    eventSource = null
    sseRecovery.stopFallback()
  },
  isStillGenerating: () => isGenerating.value,
  log: (level, msg) => addLog(level as any, msg),
})

// 监听 URL 变化，解析 Figma URL
watch(() => formData.value.figmaUrl, (url) => {
  if (!url) {
    urlInfo.value = null
    return
  }

  try {
    const urlObj = new URL(url)
    const pathMatch = urlObj.pathname.match(/\/(file|design)\/([^/]+)/)
    const nodeId = urlObj.searchParams.get('node-id')

    if (pathMatch && nodeId) {
      const fileKey = pathMatch[2]
      urlInfo.value = {
        type: 'success',
        message: `
          <strong>✓ 有效的 Figma URL</strong><br>
          File Key: <code>${fileKey}</code><br>
          Node ID: <code>${nodeId}</code>
        `
      }
    } else {
      urlInfo.value = {
        type: 'warning',
        message: 'URL 格式不完整，需要包含 node-id 参数'
      }
    }
  } catch {
    urlInfo.value = {
      type: 'error',
      message: '无效的 URL'
    }
  }
})

// 处理表单提交
async function handleSubmit() {
  const { figmaUrl, componentName } = formData.value

  if (!figmaUrl || !componentName) {
    alert('请填写完整信息')
    return
  }

  // 解析 Figma URL
  let fileKey: string
  let nodeId: string

  try {
    const urlObj = new URL(figmaUrl)
    const pathMatch = urlObj.pathname.match(/\/(file|design)\/([^/]+)/)
    const parsedNodeId = urlObj.searchParams.get('node-id')

    if (!pathMatch || !parsedNodeId) {
      throw new Error('Invalid Figma URL')
    }

    fileKey = pathMatch[2]
    nodeId = parsedNodeId
  } catch (error) {
    alert('无效的 Figma URL\n\n请确保 URL 格式正确，并包含 node-id 参数')
    return
  }

  // 准备请求数据
  const requestData: any = {
    componentName,
    fileKey,
    nodeId,
    groupId: localStorage.getItem('currentGroupId') || 'default-group',
  }

  // 如果有componentId（编辑已有组件），添加到请求中
  const componentId = localStorage.getItem('currentComponentId')
  if (componentId) {
    requestData.componentId = componentId
  }

  // 如果有自定义配置，添加到请求中
  if (configStore.isConfigured) {
    requestData.config = configStore.config
  }

  // 禁用按钮
  isGenerating.value = true
  progressCards.value = []
  logs.value = []
  result.value = null

  try {
    // 发送请求
    const response = await generateComponent(requestData)

    if (!response.success) {
      throw new Error(response.error || '请求失败')
    }

    const sessionId = response.sessionId
    currentSessionId.value = sessionId

    // 建立 SSE 连接
    eventSource = createProgressStream(sessionId)

    eventSource.onmessage = (event) => {
      const data: ProgressData = JSON.parse(event.data)

      if (data.type === 'progress') {
        updateProgressCard(data.stage!, data.message!, data.status!)
        // 记录详细日志
        const level = data.status === 'failed' ? 'error' : 'info'
        addLog(level, data.message!, data.stage)
      } else if (data.type === 'complete') {
        updateProgressCard('完成', '✓ 组件生成成功！', 'completed')
        addLog('info', '✓ 组件生成成功！', '完成')
        result.value = {
          componentName: data.componentName,
          componentDir: data.componentDir
        }
        sseRecovery.stopFallback()
        eventSource?.close()
        isGenerating.value = false
      } else if (data.type === 'error') {
        updateProgressCard('错误', data.message!, 'failed')
        result.value = {
          error: data.message
        }
        sseRecovery.stopFallback()
        eventSource?.close()
        isGenerating.value = false
      } else if (data.type === 'log') {
        // 处理详细日志（DEBUG、INFO等）
        addLog((data.level ?? 'info') as 'debug' | 'info' | 'warn' | 'error', data.message ?? '', data.meta?.logger as string | undefined, data.meta)
      }
    }

    eventSource.onerror = () => {
      // 已收到终态（非生成中）时主动关闭，阻止 EventSource 自动重连造成的死循环；
      // 仍在生成中则通过 API 检查任务真实状态并恢复 UI。
      if (!isGenerating.value) {
        eventSource?.close()
        return
      }
      addLog('warn', 'SSE 连接断开，正在检查任务状态...', '系统')
      if (currentSessionId.value) {
        sseRecovery.checkAndRecover(currentSessionId.value)
      }
    }
  } catch (error: any) {
    alert(`错误：${error.message}`)
    isGenerating.value = false
  }
}

// 更新进度卡片
function updateProgressCard(stage: string, message: string, status: 'running' | 'completed' | 'failed') {
  const index = progressCards.value.findIndex(card => card.stage === stage)

  if (index >= 0) {
    progressCards.value[index] = { stage, message, status }
  } else {
    progressCards.value.push({ stage, message, status })
  }
}

// 添加日志条目
function addLog(level: 'debug' | 'info' | 'warn' | 'error', message: string, agent?: string, meta?: any) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  logs.value.push({ time, level, agent, message, meta })
}

// 清空日志
function clearLogs() {
  logs.value = []
}

// 取消任务
async function handleCancel() {
  if (!currentSessionId.value) {
    return
  }

  try {
    const response = await cancelTask(currentSessionId.value)

    if (response.success) {
      addLog('warn', '任务已被用户终止', '系统')
      updateProgressCard('已终止', '任务已被用户终止', 'failed')
    }

    // 关闭 SSE 连接
    eventSource?.close()
    eventSource = null

    // 重置状态
    isGenerating.value = false
    currentSessionId.value = null
  } catch (error: any) {
    addLog('error', `终止任务失败：${error.message}`, '系统')
  }
}

// 🔧 组件卸载时关闭 SSE 连接，避免泄漏的连接在 Vision API 长调用期间
// 触发 onerror→close，误删同 session 下 Logs 页的连接（导致 Logs 卡死）
onUnmounted(() => {
  sseRecovery.stopFallback()
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
})
</script>

<style scoped>
.generator-form {
  width: 100%;
}

.main-content {
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  padding: 40px;
  /* box-shadow: 0 4px 6px var(--shadow-dropdown); */
}

.top-layout {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.left-panel {
  flex: 0 0 400px;
  min-width: 400px;
}

.right-panel {
  flex: 1;
  min-width: 0;
}

.form-group {
  margin-bottom: 25px;
}

label {
  display: block;
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 1.05em;
}

input[type="text"] {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border-default);
  border-radius: var(--radius-xs);
  font-size: 1em;
  transition: all 0.2s;
}

input[type="text"]:focus {
  outline: none;
  border-color: var(--text-secondary);
  box-shadow: 0 0 0 3px rgba(74, 85, 104, 0.1);
}

.url-info {
  margin-top: 8px;
  font-size: 0.9em;
  padding: 8px 12px;
  border-radius: var(--radius-xs);
}

.url-info.success {
  color: var(--success-light);
  background: var(--success-bg);
}

.url-info.warning {
  color: var(--warning-light);
  background: var(--warning-bg);
}

.url-info.error {
  color: var(--error-light);
  background: var(--error-bg);
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

/* 按钮布局：颜色由全局 .btn-primary / .btn-danger 语义类接管 */
.submit-btn {
  flex: 1;
}

.submit-btn:disabled {
  cursor: not-allowed;
  transform: none;
}

.cancel-btn {
  white-space: nowrap;
}

.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: var(--text-on-brand);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.result-section {
  margin-top: 30px;
  padding: 25px;
  background: var(--success-bg);
  border-radius: var(--radius-xs);
  border-left: 4px solid var(--success-light);
}

.result-section.error {
  background: var(--error-bg);
  border-left-color: var(--error-light);
}

.result-section h3 {
  margin-bottom: 15px;
  color: var(--text-primary);
}

.result-section p {
  margin: 8px 0;
  color: var(--text-secondary);
}

.result-section code {
  background: var(--border-default);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-family: monospace;
}
</style>
