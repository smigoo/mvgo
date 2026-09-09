<template>
  <div v-if="open" class="publish-overlay" @click.self="close">
    <div class="publish-card" role="dialog" aria-modal="true">
      <div class="publish-head">
        <h3>推送到公共组件池</h3>
        <button type="button" class="pub-close" aria-label="关闭" @click="close">✕</button>
      </div>

      <div class="pub-body">
        <div class="pub-field">
          <label class="pub-label">组件名称</label>
          <input
            v-model="form.name"
            type="text"
            class="pub-input"
            placeholder="给公共池里的组件起个易懂的名称"
            maxlength="100"
          />
        </div>

        <div class="pub-field">
          <label class="pub-label">组件类型</label>
          <div class="pub-type">
            <span class="pub-type-badge" :class="typeClass">{{ typeLabel }}</span>
            <span class="pub-type-tip">由原组件类型决定，随发布带入</span>
          </div>
        </div>

        <div class="pub-hint">发布后所有登录用户可在「公共组件池」查看与下载；仅提供者可下架/删除。</div>
        <div v-if="errorText" class="pub-error">{{ errorText }}</div>
      </div>

      <div class="pub-foot">
        <button type="button" class="pub-btn pub-btn-cancel" :disabled="submitting" @click="close">
          取消
        </button>
        <button
          type="button"
          class="pub-btn pub-btn-ok"
          :disabled="submitting || !form.name.trim()"
          @click="confirm"
        >
          {{ submitting ? '发布中…' : '发布到公共池' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue'
import { resolveComponentTypeLabel } from '@/utils/component-pool'

/**
 * 推送到公共组件池的确认弹窗（纯前端，无第三方依赖）。
 * 名称由父级传入的组件记录带默认值，用户可修改；类型只读带入。
 * emits: close — 关闭；ok(payload: { name }) — 点发布
 */
const props = defineProps<{
  open: boolean
  /** 组件记录：需含 name/target/metadata */
  component: any
  submitting?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'close'): void
  (e: 'ok', payload: { name: string }): void
}>()

const form = reactive({ name: '' })
const errorText = ref('')

/** 组件类型（不可修改，随发布带入） */
const typeInfo = computed(() => resolveComponentTypeLabel(props.component))
const typeLabel = computed(() => typeInfo.value.label)
const typeClass = computed(() => typeInfo.value.key)

watch(
  () => props.open,
  (v) => {
    if (v) {
      form.name = props.component?.name || props.component?.componentId || ''
      errorText.value = ''
    }
  },
  { immediate: true },
)

function close() {
  if (props.submitting) return
  emit('update:open', false)
  emit('close')
}

function confirm() {
  if (!form.name.trim()) {
    errorText.value = '请填写组件名称'
    return
  }
  emit('ok', { name: form.name.trim() })
}
</script>

<style scoped>
.publish-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.publish-card {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}
.publish-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
}
.publish-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.pub-close {
  border: none;
  background: transparent;
  font-size: 14px;
  color: #999;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}
.pub-close:hover {
  color: #333;
  background: #f3f4f6;
}
.pub-body {
  padding: 4px 20px 8px;
}
.pub-field {
  margin-bottom: 14px;
}
.pub-label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
  font-weight: 500;
}
.pub-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.pub-input:focus {
  border-color: #1677ff;
}
.pub-type {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pub-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.pub-type-badge.vue3 {
  background: #e6f7f0;
  color: #0a7d4f;
  border: 1px solid #a7e3c9;
}
.pub-type-badge.microcode {
  background: #e8f1fe;
  color: #1c64c8;
  border: 1px solid #b9d4f8;
}
.pub-type-tip {
  font-size: 12px;
  color: #9ca3af;
}
.pub-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.6;
  background: #f9fafb;
  border-radius: 8px;
  padding: 8px 10px;
}
.pub-error {
  margin-top: 8px;
  font-size: 12px;
  color: #dc2626;
}
.pub-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
}
.pub-btn {
  border: none;
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 13px;
  cursor: pointer;
  transition: filter 0.15s;
}
.pub-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.pub-btn-cancel {
  background: #f3f4f6;
  color: #374151;
}
.pub-btn-cancel:hover:not(:disabled) {
  background: #e5e7eb;
}
.pub-btn-ok {
  background: #f59e0b;
  color: #fff;
  font-weight: 600;
}
.pub-btn-ok:hover:not(:disabled) {
  filter: brightness(0.94);
}
</style>
