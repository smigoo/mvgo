<template>
  <div class="idle-stage">
    <section
      class="stage-card"
      :class="{ 'is-dragover': dragOver, 'is-armed': armed }"
      aria-label="组件生成舞台"
      tabindex="0"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
      @paste="onPaste"
    >
      <div class="stage-ambient" aria-hidden="true"></div>

      <!-- 拖拽悬停遮罩 -->
      <div v-if="dragOver" class="stage-dropmask" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M5 14v5h14v-5" />
        </svg>
        <span>释放以识别素材来源</span>
      </div>

      <!-- 未就绪：英雄区（中间即入口） -->
      <template v-if="!armed">
        <div class="stage-badge-row">
          <span class="stage-badge">{{ sourceLabel || '截图 / Figma' }}</span>
          <span class="stage-badge">{{ compTypeLabel }}</span>
          <span class="stage-badge">{{ tierLabel }}</span>
        </div>

        <div class="stage-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M12 16V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M5 14v5h14v-5" />
          </svg>
        </div>

        <h2 class="stage-title">组件生成舞台</h2>
        <p class="stage-desc">
          将截图或 Figma 设计交给系统，自动识别布局结构并产出可下载的 Vue3 / 微码组件。
        </p>

        <div class="stage-source-chips">
          <span class="stage-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9" r="1.5" />
              <path d="m21 15-5-5L5 20" />
            </svg>
            截图
          </span>
          <span class="stage-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M8 3h4v6H8a3 3 0 0 1 0-6Z" />
              <path d="M12 3h4a3 3 0 0 1 0 6h-4V3Z" />
              <path d="M8 9h4v6H8a3 3 0 0 1 0-6Z" />
              <circle cx="16" cy="12" r="3" />
              <path d="M8 15h4v3a3 3 0 1 1-3-3Z" />
            </svg>
            Figma
          </span>
        </div>

        <div class="stage-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M9 3v2M15 3v2M5 8h14" />
            <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
          </svg>
          拖拽截图到此处，或粘贴 Figma 链接（⌘V）· 也可在左侧选择素材类型
        </div>
      </template>

      <!-- 已就绪：主舞台 -->
      <template v-else>
        <div class="stage-badge-row">
          <span class="stage-badge">{{ sourceLabel || '截图 / Figma' }}</span>
          <span class="stage-badge">{{ compTypeLabel }}</span>
          <span class="stage-badge">{{ tierLabel }}</span>
        </div>

        <div class="stage-ready">
          <div class="ready-thumb">
            <img v-if="materialThumb" :src="materialThumb" :alt="materialName" />
            <div v-else class="ready-thumb-fallback">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
          </div>
          <div class="ready-meta">
            <span class="ready-type">{{ materialTypeLabel }}</span>
            <strong class="ready-name">{{ materialName }}</strong>
          </div>
          <button
            class="stage-go"
            type="button"
            :disabled="generateDisabled"
            @click="emit('generate')"
          >
            {{ generateText }}
          </button>
          <p v-if="generateDisabled" class="stage-go-hint">{{ generateDisabledReason }}</p>
        </div>
      </template>
    </section>

    <section class="workflow-card" aria-label="工作流提示">
      <div class="workflow-head">
        <span class="workflow-title">工作流</span>
        <span class="workflow-sub">点击可快速定位到对应动作</span>
      </div>
      <div class="workflow-list">
        <button
          v-for="(step, index) in steps"
          :key="step.title"
          type="button"
          class="workflow-item"
          @click="emit('step', step)"
        >
          <span class="workflow-index">{{ index + 1 }}</span>
          <span class="workflow-copy">
            <strong>{{ step.title }}</strong>
            <small>{{ step.desc }}</small>
          </span>
          <svg class="workflow-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const emit = defineEmits(['select', 'stat', 'step', 'material', 'generate'])

const props = defineProps({
  compType: { type: String, default: 'vue3' },
  compTypeLabel: { type: String, default: 'Vue3' },
  tier: { type: String, default: 'lite' },
  tierLabel: { type: String, default: 'Lite' },
  sourceLabel: { type: String, default: '截图' },
  recent: { type: Array, default: () => [] },
  summary: { type: Object, default: () => null },
  // 方案 A：中间即主舞台
  armed: { type: Boolean, default: false },
  materialType: { type: String, default: '' },
  materialThumb: { type: String, default: '' },
  materialName: { type: String, default: '' },
  generateText: { type: String, default: '生成组件' },
  generateDisabled: { type: Boolean, default: false },
  generateDisabledReason: { type: String, default: '' }
})

const dragOver = ref(false)

const materialTypeLabel = computed(
  () =>
    ({
      screenshot: '图片/截图',
      figma: 'Figma',
      html: 'HTML 文件',
      'docx-html': 'HTML + 需求文档'
    })[props.materialType] || '素材'
)

function onDragOver() {
  dragOver.value = true
}
function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) dragOver.value = false
}
function onDrop(e) {
  dragOver.value = false
  const dt = e.dataTransfer
  for (const f of dt?.files || []) {
    if (f.type.startsWith('image/')) {
      emit('material', { kind: 'image', file: f })
      return
    }
  }
  const url = (dt?.getData('text/plain') || dt?.getData('text/uri-list') || '').trim()
  if (url) emit('material', { kind: 'url', text: url })
}
function onPaste(e) {
  for (const item of e.clipboardData?.items || []) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      e.stopPropagation()
      const b = item.getAsFile()
      if (b) emit('material', { kind: 'image', file: b })
      return
    }
  }
  const text = (e.clipboardData?.getData('text/plain') || '').trim()
  if (text) {
    e.preventDefault()
    e.stopPropagation()
    emit('material', { kind: 'url', text })
  }
}

const steps = [
  {
    title: '选择素材',
    desc: '把截图拖到中间舞台，或粘贴 Figma 链接，也可在左侧切换素材类型。',
    action: 'source'
  },
  {
    title: '确认规格',
    desc: '选择 Vue3 / 微码 与 Lite / Max 产出规格。',
    action: 'spec'
  },
  {
    title: '开始生成',
    desc: '点击中间「生成组件」主按钮，右侧实时查看进度与日志。',
    action: 'generate'
  },
  {
    title: '下载交付',
    desc: '生成完成后下载 ZIP 或发送到 Playground 调试。',
    action: 'deliver'
  }
]
</script>

<style scoped>
.idle-stage {
  width: 100%;
  min-height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stage-card,
.workflow-card {
  position: relative;
  overflow: hidden;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-default, #e2e8f0);
  border-radius: var(--radius-xl, 14px);
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(15, 23, 42, 0.06));
}

.stage-card {
  flex: 1;
  min-height: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 32px;
  outline: none;
  transition: border-color var(--transition-fast, 0.15s ease),
    box-shadow var(--transition-fast, 0.15s ease),
    background var(--transition-fast, 0.15s ease);
}

.stage-card:focus-visible {
  outline: 2px solid var(--border-focus, #3b82f6);
  outline-offset: 3px;
}

.stage-card.is-dragover {
  border-color: var(--brand-cta, #237a57);
  border-style: dashed;
  background: color-mix(in srgb, var(--brand-cta, #237a57) 6%, var(--bg-card, #fff));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand-cta, #237a57) 16%, transparent);
}

.stage-card.is-armed {
  justify-content: center;
}

.stage-dropmask {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--brand-cta, #237a57);
  background: color-mix(in srgb, var(--brand-cta, #237a57) 8%, var(--bg-card, #fff));
  font-size: 15px;
  font-weight: 600;
}

.stage-dropmask svg {
  width: 38px;
  height: 38px;
}

.stage-ambient {
  position: absolute;
  inset: auto auto -80px -60px;
  width: 260px;
  height: 260px;
  background: radial-gradient(circle, color-mix(in srgb, var(--brand-cta, #237a57) 14%, transparent) 0%, transparent 68%);
  pointer-events: none;
}

.stage-badge-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}

.stage-badge,
.stage-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-default, #e2e8f0);
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, #f8fafc);
  color: var(--text-secondary, #475569);
  font-size: 12px;
  font-weight: 500;
}

.stage-icon {
  width: 72px;
  height: 72px;
  margin-bottom: 18px;
  border-radius: var(--radius-xl, 14px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--brand-cta, #237a57);
  background: color-mix(in srgb, var(--brand-cta, #237a57) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-cta, #237a57) 10%, transparent);
}

.stage-icon svg {
  width: 34px;
  height: 34px;
}

.stage-title {
  margin: 0;
  font-size: 26px;
  line-height: 1.15;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  letter-spacing: -0.02em;
}

.stage-desc {
  max-width: 560px;
  margin: 12px auto 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary, #475569);
}

.stage-source-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

.stage-chip svg,
.stage-hint svg {
  width: 14px;
  height: 14px;
}

.stage-hint {
  margin-top: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-tertiary, #64748b);
  font-size: 12px;
  max-width: 520px;
}

/* 已就绪：主舞台 */
.stage-ready {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
  max-width: 460px;
}

.ready-thumb {
  width: 100%;
  max-width: 360px;
  height: 180px;
  border-radius: var(--radius-lg, 10px);
  overflow: hidden;
  border: 1px solid var(--border-default, #e2e8f0);
  background: var(--bg-secondary, #f8fafc);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ready-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fff;
}

.ready-thumb-fallback {
  color: var(--text-tertiary, #64748b);
}

.ready-thumb-fallback svg {
  width: 40px;
  height: 40px;
}

.ready-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.ready-type {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-cta, #237a57);
}

.ready-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  word-break: break-all;
  max-width: 420px;
}

.stage-go {
  height: 44px;
  padding: 0 28px;
  border: none;
  border-radius: var(--radius-lg, 10px);
  background: var(--brand-cta, #237a57);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease);
}

.stage-go:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.stage-go:focus-visible {
  outline: 2px solid var(--border-focus, #3b82f6);
  outline-offset: 2px;
}

.stage-go:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.stage-go-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary, #64748b);
}

.workflow-card {
  flex-shrink: 0;
  padding: 16px 18px;
}

.workflow-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.workflow-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}

.workflow-sub {
  font-size: 11px;
  color: var(--text-tertiary, #64748b);
}

.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workflow-item {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-default, #e2e8f0);
  border-radius: var(--radius-lg, 10px);
  background: var(--bg-card, #fff);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color var(--transition-fast, 0.15s ease), background var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease);
}

.workflow-item:hover {
  border-color: var(--border-strong, #cbd5e1);
  background: var(--bg-hover, #f8fafc);
  transform: translateY(-1px);
}

.workflow-item:focus-visible {
  outline: 2px solid var(--border-focus, #3b82f6);
  outline-offset: 2px;
}

.workflow-index {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-dot, 999px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--brand, #2563eb);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.workflow-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.workflow-copy strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
}

.workflow-copy small {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-secondary, #475569);
}

.workflow-arrow {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary, #64748b);
}

@media (max-width: 900px) {
  .stage-card {
    min-height: 360px;
    padding: 28px 20px;
  }

  .stage-title {
    font-size: 22px;
  }

  .stage-desc {
    font-size: 13px;
  }
}
</style>
