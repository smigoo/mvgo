<template>
  <div
    class="panel-theme-toggle"
    :class="{ disabled }"
    role="radiogroup"
    aria-label="面板演示主题"
    @keydown="onKey"
  >
    <button
      v-for="opt in resolvedOptions"
      :key="opt.value"
      type="button"
      class="panel-theme-toggle__opt"
      :class="['opt-' + opt.value, { active: modelValue === opt.value }]"
      role="radio"
      :aria-checked="modelValue === opt.value"
      :disabled="disabled"
      :title="props.title || undefined"
      @click="select(opt.value)"
    >
      <svg v-if="opt.icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <component :is="opt.icon" />
      </svg>
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup>
import { h, computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  // 通用化：options 由调用方传入，默认仍是浅色/深色
  options: {
    type: Array,
    default: () => [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
    ],
  },
  ariaLabel: { type: String, default: '面板切换' },
  // 🆕 2026-10-12：容器级 title —— 用于说明「这个控件到底管什么」，
  //   避免与同名/近名控件（如 N 主题的「浅色/深色」）产生语义混淆。
  //   原生 title 会透传给内部 button（未显式设置时）。
  title: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'change'])

const SunIcon = { render: () => h('path', { d: 'M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41M12 8a4 4 0 100 8 4 4 0 000-8z' }) }
const MoonIcon = { render: () => h('path', { d: 'M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z' }) }

// 未传 icon 时按 value 自动补默认图标（仅 light/dark 有意义）
function iconFor(opt) {
  if (opt.icon !== undefined) return opt.icon
  if (opt.value === 'light') return SunIcon
  if (opt.value === 'dark') return MoonIcon
  return undefined
}
// 给每个选项补上解析后的 icon（覆盖原 opt.icon 仅用于渲染）
const resolvedOptions = computed(() => props.options.map((o) => ({ ...o, icon: iconFor(o) })))

function select(val) {
  if (props.disabled) return
  if (props.modelValue !== val) {
    emit('update:modelValue', val)
    emit('change', val)
  }
}

function onKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  // 找下一个选项（循环）
  const idx = resolvedOptions.value.findIndex((o) => o.value === props.modelValue)
  const next = resolvedOptions.value[(idx + 1) % resolvedOptions.value.length] || resolvedOptions.value[0]
  if (next) select(next.value)
}
</script>

<style scoped lang="less">
.panel-theme-toggle {
  display: inline-flex;
  border-radius: 8px;
  border: 1px solid var(--border-1, #e5e7eb);
  background: var(--surface-2, #f9fafb);
  padding: 2px;
  gap: 2px;

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

.panel-theme-toggle__opt {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2, #6b7280);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  svg {
    flex-shrink: 0;
  }

  &:hover:not(.active) {
    background: var(--surface-3, #f3f4f6);
    color: var(--text-1, #1f2937);
  }

  &.active {
    background: var(--primary, #4f46e5);
    color: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* 浅色选项高亮 → 浅蓝底 + 深字（兼容旧 light 值 + 新 default-panel） */
  &.active.opt-light,
  &.active.opt-default-panel {
    background: #bfdbfe;
    color: #1e3a8a;
  }

  /* 深色选项高亮 → 纯黑底 + 白字（兼容旧 dark 值 + 新 aio-panel） */
  &.active.opt-dark,
  &.active.opt-aio-panel {
    background: #000000;
    color: #ffffff;
  }
}
</style>
