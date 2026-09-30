<template>
  <a-modal
    :open="visible"
    :title="modalTitle"
    :footer="null"
    :width="680"
    :maskClosable="false"
    :closable="!analyzing"
    @cancel="handleClose"
    class="responsive-progress-modal"
  >
    <div class="rpm-body">
      <!-- 状态指示器 -->
      <div class="rpm-status" :class="statusClass">
        <div class="status-icon">
          <LoadingOutlined v-if="analyzing" spin />
          <CheckCircleFilled v-else-if="result" />
          <CloseCircleFilled v-else-if="error" />
          <ExclamationCircleOutlined v-else />
        </div>
        <div class="status-text">
          <span class="status-title">{{ statusTitle }}</span>
          <span class="status-sub" v-if="currentStage">
            {{ currentStage.message }}
          </span>
        </div>
      </div>

      <!-- 进度阶段列表 -->
      <div class="rpm-stages" v-if="stages.length > 0">
        <div
          v-for="(s, i) in stages"
          :key="i"
          class="stage-item"
          :class="{
            'is-active': i === stages.length - 1 && analyzing,
            'is-done': s.stage === 'done',
            'is-error': s.stage === 'error',
          }"
        >
          <span class="stage-dot"></span>
          <span class="stage-msg">{{ s.message }}</span>
        </div>
      </div>

      <!-- 结果概览 -->
      <div class="rpm-result" v-if="result">
        <a-divider>生成结果</a-divider>
        <div class="result-grid">
          <div class="result-item">
            <span class="result-label">组件名</span>
            <span class="result-value">{{ result.summary.componentName }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">代码长度</span>
            <span class="result-value">{{ formatLength(result.summary.codeLength) }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">Zone 数量</span>
            <span class="result-value">{{ result.summary.zoneCount }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">质量评分</span>
            <span class="result-value">{{ (result.summary.qualityScore * 100).toFixed(0) }}%</span>
          </div>
        </div>

        <!-- 代码预览 -->
        <div class="code-preview" v-if="result.codePreview">
          <div class="preview-header">
            代码预览
            <span class="preview-note">{{ previewNote }}</span>
          </div>
          <pre class="preview-content"><code>{{ result.codePreview }}</code></pre>
        </div>

        <!-- 操作按钮 -->
        <div class="result-actions">
          <a-button type="primary" @click="handleDownload" :loading="downloading">
            <DownloadOutlined /> 下载响应式 ZIP
          </a-button>
          <a-button @click="handleCopyCode" :disabled="!result.codePreview">复制代码</a-button>
          <a-button @click="handleExportHtml" :disabled="!layout">导出单文件 HTML</a-button>
          <a-button @click="handleClose">关闭</a-button>
        </div>
        <div class="result-tip">
          「导出单文件 HTML」导出的是<b>当前编辑器布局</b>的响应式骨架 —— 零依赖、双击即开、按所选适配策略跟随窗口，适合先验证结构再拿代码。
        </div>
      </div>

      <!-- 错误信息 -->
      <div class="rpm-error" v-if="error && !result">
        <a-alert type="error" :message="error" show-icon />
        <div class="error-actions">
          <a-button @click="emit('retry')">重试</a-button>
          <a-button type="primary" @click="handleClose">关闭</a-button>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  LoadingOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons-vue'
import type { StageInfo } from '../composables/useResponsiveAnalysis'
import type { ScreenLayout } from '@/types/screen-layout'
import { downloadStandaloneHtml } from '../utils/export-standalone-html'
import { copyText } from '../utils/clipboard'

const props = defineProps<{
  visible: boolean
  analyzing: boolean
  /** 编辑器当前布局 —— 「导出单文件 HTML」的数据源 */
  layout?: ScreenLayout | null
  currentStage: { stage: string; message: string } | null
  stages: StageInfo[]
  result: {
    summary: {
      componentName: string
      codeLength: number
      breakpoints: string[]
      zoneCount: number
      qualityScore: number
      analysisSummary?: any
    }
    codePreview: string
    previewBreakpoints: string[]
    hasAnalysisResult: boolean
  } | null
  error: string | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  download: []
  retry: []
}>()

const downloading = ref(false)

// --- 计算属性 ---

const modalTitle = computed(() => {
  if (props.analyzing) return '🤖 AI 正在分析布局...'
  if (props.result) return '✅ 响应式生成完成'
  if (props.error) return '❌ 生成失败'
  return '🔬 AI 分析'
})

const statusClass = computed(() => {
  if (props.analyzing) return 'status-running'
  if (props.result) return 'status-success'
  if (props.error) return 'status-error'
  return 'status-idle'
})

const statusTitle = computed(() => {
  if (props.analyzing) return '正在生成响应式代码'
  if (props.result) return '生成完成'
  if (props.error) return '生成失败'
  return '准备中...'
})

/** 代码预览是不是被截断了 —— 别让用户以为「就这么点代码」 */
const previewNote = computed(() => {
  const r = props.result
  if (!r) return ''
  return r.summary.codeLength > r.codePreview.length
    ? `预览片段 · 完整 ${formatLength(r.summary.codeLength)} 见 ZIP`
    : '完整代码'
})

// --- 方法 ---

function handleClose() {
  emit('update:visible', false)
}

async function handleDownload() {
  downloading.value = true
  try {
    emit('download')
  } catch (_) {
    // 错误由父组件处理
  } finally {
    downloading.value = false
  }
}

function formatLength(length: number): string {
  if (length > 1024) return `${(length / 1024).toFixed(1)} KB`
  return `${length} B`
}

/** 复制生成的代码 —— 失败时明确告知，不静默吞掉 */
async function handleCopyCode() {
  const code = props.result?.codePreview
  if (!code) return
  const ok = await copyText(code)
  const msg = (window as any).$message
  ok ? msg?.success('代码已复制到剪贴板') : msg?.error('复制失败，请手动选中复制')
}

/** 导出单文件 HTML：零依赖、双击即开、按适配策略响应窗口 */
function handleExportHtml() {
  if (!props.layout) return
  try {
    downloadStandaloneHtml(props.layout)
    ;(window as any).$message?.success('单文件 HTML 已导出，双击即可打开')
  } catch (e: any) {
    ;(window as any).$message?.error(e?.message || '导出失败')
  }
}
</script>

<style lang="less" scoped>
.responsive-progress-modal {
  :deep(.ant-modal-body) {
    padding: 24px;
    max-height: 70vh;
    overflow-y: auto;
  }
}

.rpm-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// --- 状态指示器 ---
.rpm-status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-md);
  background: rgba(24, 144, 255, 0.06);
  border: 1px solid rgba(24, 144, 255, 0.15);

  &.status-running {
    background: rgba(24, 144, 255, 0.08);
    border-color: var(--brand-border);
  }
  &.status-success {
    background: rgba(82, 196, 26, 0.06);
    border-color: rgba(82, 196, 26, 0.15);
  }
  &.status-error {
    background: rgba(255, 77, 79, 0.06);
    border-color: rgba(255, 77, 79, 0.15);
  }

  .status-icon {
    font-size: 24px;
    color: var(--primary-color, var(--brand));
  }
  &.status-success .status-icon { color: var(--success); }
  &.status-error .status-icon { color: var(--error); }

  .status-text {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .status-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-color, rgba(0,0,0,0.85));
    }
    .status-sub {
      font-size: 12px;
      color: var(--text-color-secondary, rgba(0,0,0,0.45));
    }
  }
}

// --- 阶段列表 ---
.rpm-stages {
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
  background: rgba(0,0,0,0.02);
  border-radius: var(--radius-sm);

  .stage-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
    color: var(--text-color-secondary, rgba(0,0,0,0.45));

    &.is-active {
      color: var(--primary-color, var(--brand));
      font-weight: 500;
    }
    &.is-done {
      color: var(--success);
    }
    &.is-error {
      color: var(--error);
    }

    .stage-dot {
      flex-shrink: 0;
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
      background: currentColor;
      margin-top: 5px;
    }
    &.is-active .stage-dot {
      animation: pulse 1.5s infinite;
    }
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

// --- 结果 ---
.rpm-result {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  .result-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    background: rgba(0,0,0,0.02);
    border-radius: var(--radius-sm);

    .result-label {
      font-size: 11px;
      color: var(--text-color-secondary, rgba(0,0,0,0.45));
    }
    .result-value {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-color, rgba(0,0,0,0.85));
    }
  }
}

.code-preview {
  background: #1e1e1e;
  border-radius: var(--radius-md);
  overflow: hidden;

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 12px;
    font-size: 11px;
    color: rgba(255,255,255,0.45);
    background: rgba(255,255,255,0.05);
    border-bottom: 1px solid rgba(255,255,255,0.08);

    .preview-note {
      color: rgba(255,255,255,0.3);
    }
  }
  .preview-content {
    padding: 12px;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
    font-size: 11px;
    line-height: 1.6;
    color: #d4d4d4;
    white-space: pre-wrap;
    word-break: break-all;
  }
}

.result-actions,
.error-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  flex-wrap: wrap;
}

.result-tip {
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-color-secondary, rgba(0,0,0,0.45));

  b {
    color: var(--text-color, rgba(0,0,0,0.75));
  }
}

.rpm-error {
  display: flex;
  flex-direction: column;
  gap: 12px;

  :deep(.ant-alert) {
    border-radius: var(--radius-sm);
  }
}
</style>
