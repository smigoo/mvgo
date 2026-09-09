<template>
  <div class="batch-panel">
    <!-- 模式切换 -->
    <div class="batch-mode-section">
      <label class="section-label">生成模式</label>
      <div class="mode-switch">
        <button class="mode-btn" :class="{ active: !batchMode }" @click="batchMode = false">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          单个组件
        </button>
        <button class="mode-btn" :class="{ active: batchMode }" @click="batchMode = true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          批量生成
          <span class="mode-badge">Phase 7</span>
        </button>
      </div>
    </div>

    <!-- 批量上传区 -->
    <div v-if="batchMode" class="batch-body">
      <div class="section-label">截图上传（可多选）</div>
      <div
        class="batch-upload-zone"
        :class="{ 'is-dragging': isDragging, 'has-items': batchItems.length > 0 }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
        @click="triggerFileInput"
      >
        <input
          ref="fileInputRef"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          style="display: none"
          @change="onFilesSelected"
        />
        <div v-if="batchItems.length === 0" class="upload-placeholder">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>点击或拖拽上传多张截图</span>
          <span class="upload-hint">支持 PNG / JPEG / WebP，单张最大 10MB</span>
        </div>
        <div v-else class="batch-items-preview">
          <div v-for="(item, idx) in batchItems" :key="idx" class="batch-item-thumb">
            <img :src="item.preview" :alt="item.name" />
            <div class="batch-item-info">
              <span class="item-name">{{ item.name }}</span>
              <button class="item-remove" @click.stop="removeItem(idx)" title="移除">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <button class="add-more-btn" @click.stop="triggerFileInput">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>

      <!-- 提交前预检 -->
      <button
        class="batch-precheck-btn"
        :disabled="batchItems.length === 0 || isChecking"
        @click="doPreCheck"
      >
        <svg v-if="isChecking" class="spinner" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"><animate attributeName="stroke-dashoffset" values="32;0" dur="1s" repeatCount="indefinite"/></circle></svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        预检配额（{{ batchItems.length }} 个组件）
      </button>

      <!-- 预检结果面板 -->
      <div v-if="preCheckResult" class="precheck-result">
        <div class="precheck-header" :class="preCheckResult.recommendedAction">
          <svg v-if="preCheckResult.recommendedAction === 'all_now'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <svg v-else-if="preCheckResult.recommendedAction === 'partial'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          <span>{{ preCheckResult.message }}</span>
        </div>

        <div class="precheck-details">
          <div class="quota-row">
            <div class="quota-item">
              <span class="quota-label">小时配额</span>
              <span class="quota-value" :class="{ exhausted: preCheckResult.hourly.remaining === 0 }">
                {{ preCheckResult.hourly.used }}/{{ preCheckResult.hourly.limit }}
                <span class="quota-remaining">剩 {{ preCheckResult.hourly.remaining }}</span>
              </span>
              <span class="quota-reset">{{ preCheckResult.hourly.waitMinutes }}分钟后恢复</span>
            </div>
            <div class="quota-item">
              <span class="quota-label">日配额</span>
              <span class="quota-value" :class="{ exhausted: preCheckResult.daily.remaining === 0 }">
                {{ preCheckResult.daily.used }}/{{ preCheckResult.daily.limit }}
                <span class="quota-remaining">剩 {{ preCheckResult.daily.remaining }}</span>
              </span>
              <span class="quota-reset">{{ preCheckResult.daily.waitMinutes }}分钟后恢复</span>
            </div>
          </div>

          <div class="split-plan" v-if="preCheckResult.availableLater > 0">
            <div class="split-item">
              <span class="split-label">立即执行</span>
              <span class="split-count immediate">{{ preCheckResult.availableNow }} 个</span>
            </div>
            <div class="split-item">
              <span class="split-label">配额恢复后自动执行</span>
              <span class="split-count deferred">{{ preCheckResult.availableLater }} 个</span>
            </div>
          </div>
        </div>

        <div class="precheck-actions">
          <button
            class="action-btn primary"
            :disabled="isGenerating"
            @click="$emit('confirm-batch', batchItems)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {{ preCheckResult.recommendedAction === 'all_wait' ? '加入等待队列' : '开始批量生成' }}
          </button>
          <button class="action-btn secondary" @click="preCheckResult = null">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { batchPreCheck } from '@/api/lite'

const emit = defineEmits(['confirm-batch', 'update:batchMode'])

const batchMode = ref(false)
const isDragging = ref(false)
const isChecking = ref(false)
const isGenerating = ref(false)
const batchItems = ref([])
const preCheckResult = ref(null)
const fileInputRef = ref(null)

const props = defineProps({
  disabled: { type: Boolean, default: false },
})

// 监听 batchMode 变化通知父组件
watch(batchMode, (val) => {
  emit('update:batchMode', val)
})

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onFilesSelected(e) {
  const files = e.target.files
  if (!files?.length) return

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    const reader = new FileReader()
    reader.onload = (ev) => {
      batchItems.value.push({
        name: file.name,
        preview: ev.target.result,
        base64: (ev.target.result || '').split(',')[1],
      })
    }
    reader.readAsDataURL(file)
  }
  // 重置 input 以允许重新选择同名文件
  e.target.value = ''
}

function onDrop(e) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (!files?.length) return

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    const reader = new FileReader()
    reader.onload = (ev) => {
      batchItems.value.push({
        name: file.name,
        preview: ev.target.result,
        base64: (ev.target.result || '').split(',')[1],
      })
    }
    reader.readAsDataURL(file)
  }
}

function removeItem(idx) {
  batchItems.value.splice(idx, 1)
  preCheckResult.value = null
}

async function doPreCheck() {
  if (batchItems.value.length === 0) return
  isChecking.value = true
  preCheckResult.value = null

  try {
    const items = batchItems.value.map((item, idx) => ({
      imageBase64: item.base64,
      componentName: item.name.replace(/\.[^.]+$/, '') || `component-${idx + 1}`,
      componentType: 'vue3',
    }))

    const result = await batchPreCheck({ items })
    preCheckResult.value = result
  } catch (err) {
    console.error('预检失败：', err)
    preCheckResult.value = {
      success: false,
      message: err?.response?.data?.message || '配额预检失败，请稍后重试',
    }
  } finally {
    isChecking.value = false
  }
}

defineExpose({ batchItems, preCheckResult, resetBatch })
function resetBatch() {
  batchItems.value = []
  preCheckResult.value = null
}
</script>

<style scoped>
.batch-panel {
  padding: 0;
}

.batch-mode-section {
  margin-bottom: 16px;
}

.section-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #666);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mode-switch {
  display: flex;
  gap: 8px;
}

.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  background: var(--bg-secondary, #f8f8f8);
  font-size: 13px;
  color: var(--text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active {
  background: #42B883;
  border-color: #42B883;
  color: #fff;
}

.mode-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
}

.batch-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.batch-upload-zone {
  border: 2px dashed var(--border, #d0d0d0);
  border-radius: 12px;
  padding: 16px;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.batch-upload-zone:hover { border-color: #42B883; background: rgba(66, 184, 131, 0.04); }
.batch-upload-zone.is-dragging { border-color: #42B883; background: rgba(66, 184, 131, 0.08); }

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-muted, #999);
  font-size: 14px;
}

.upload-hint {
  font-size: 12px;
  color: var(--text-muted, #bbb);
}

.batch-items-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
}

.batch-item-thumb {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border, #e0e0e0);
}

.batch-item-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.batch-item-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  padding: 2px 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-name {
  font-size: 10px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-remove {
  background: none;
  border: none;
  color: var(--error);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.add-more-btn {
  width: 80px;
  height: 80px;
  border: 2px dashed var(--border, #d0d0d0);
  border-radius: 6px;
  background: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #999);
  cursor: pointer;
  transition: all 0.2s;
}

.add-more-btn:hover { border-color: #42B883; color: #42B883; }

.batch-precheck-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: #42B883;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.batch-precheck-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.batch-precheck-btn:not(:disabled):hover { background: #359268; }

.spinner { animation: spin 1s linear infinite; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

.precheck-result {
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 10px;
  overflow: hidden;
}

.precheck-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 500;
}

.precheck-header.all_now { background: #f0faf4; color: #1a7f4a; }
.precheck-header.partial { background: #fff8e6; color: #b8860b; }
.precheck-header.all_wait { background: #fff0f0; color: #c0392b; }

.precheck-details {
  padding: 12px 16px;
  border-top: 1px solid var(--border, #f0f0f0);
}

.quota-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.quota-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quota-label { font-size: 11px; color: var(--text-muted, #999); }
.quota-value { font-size: 14px; font-weight: 600; }
.quota-value.exhausted { color: var(--task-failed-text); }
.quota-remaining { font-size: 11px; color: #42B883; font-weight: 400; }
.quota-reset { font-size: 10px; color: var(--text-muted, #bbb); }

.split-plan {
  display: flex;
  gap: 16px;
  padding: 10px;
  background: var(--bg-secondary, #f8f8f8);
  border-radius: 6px;
}

.split-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.split-label { font-size: 11px; color: var(--text-muted, #999); }
.split-count { font-size: 15px; font-weight: 600; }
.split-count.immediate { color: #42B883; }
.split-count.deferred { color: var(--task-queued); }

.precheck-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border, #f0f0f0);
}

.action-btn {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.action-btn.primary { background: #42B883; color: #fff; }
.action-btn.primary:hover:not(:disabled) { background: #359268; }
.action-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn.secondary { background: var(--bg-secondary, #f0f0f0); color: var(--text-secondary, #666); }
.action-btn.secondary:hover { background: var(--border, #e0e0e0); }
</style>
