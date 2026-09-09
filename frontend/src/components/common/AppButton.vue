<template>
  <component
    :is="tag"
    class="app-btn"
    :class="[
      `app-btn--${variant}`,
      `app-btn--${size}`,
      {
        'app-btn--block': block,
        'app-btn--loading': loading
      }
    ]"
    :disabled="tag === 'button' ? disabled || loading : undefined"
    :type="tag === 'button' ? nativeType : undefined"
    :href="href"
    :target="target"
    :rel="target === '_blank' ? 'noopener noreferrer' : undefined"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="app-btn-spinner" aria-hidden="true"></span>
    <span v-else-if="icon" class="app-btn-icon"><component :is="icon" /></span>
    <span v-if="$slots.default" class="app-btn-label"><slot /></span>
  </component>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'text' | 'danger' | 'success'
    size?: 'sm' | 'md' | 'lg'
    icon?: Component
    block?: boolean
    loading?: boolean
    disabled?: boolean
    nativeType?: 'button' | 'submit' | 'reset'
    href?: string
    target?: string
  }>(),
  {
    variant: 'primary',
    size: 'md',
    block: false,
    loading: false,
    disabled: false,
    nativeType: 'button',
    href: undefined,
    target: undefined
  }
)

defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

const tag = props.href ? 'a' : 'button'
</script>

<style scoped lang="less">
.app-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    opacity var(--transition-fast),
    transform var(--transition-fast);
  font-family: inherit;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  /* ── 尺寸 ── */
  &--sm {
    height: 28px;
    padding: 0 12px;
    font-size: 12px;
  }
  &--md {
    height: 34px;
    padding: 0 16px;
    font-size: 13px;
  }
  &--lg {
    height: 40px;
    padding: 0 20px;
    font-size: 14px;
  }

  &--block {
    width: 100%;
  }

  /* ── 主色（蓝色渐变，与 antd primary 对齐） ── */
  &--primary {
    color: var(--button-primary-text);
    background: var(--button-primary-bg);
    border-color: var(--button-primary-border);
    box-shadow: var(--button-primary-shadow);
    &:hover:not(:disabled) {
      background: var(--button-primary-bg-hover);
      border-color: var(--button-primary-border-hover);
      box-shadow: var(--button-primary-shadow-hover);
    }
    &:active:not(:disabled) {
      background: var(--button-primary-bg-active);
    }
  }

  /* ── 成功 CTA（绿色，生成类主操作） ── */
  &--success {
    color: #fff;
    background: linear-gradient(135deg, var(--brand-cta-hover) 0%, var(--brand-cta) 100%);
    border-color: var(--brand-cta);
    box-shadow: 0 10px 22px color-mix(in srgb, var(--brand-cta) 24%, transparent);
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, var(--brand-cta) 0%, var(--brand-cta-hover) 100%);
    }
  }

  /* ── 次要（白底灰边） ── */
  &--secondary {
    color: var(--button-secondary-text);
    background: var(--button-secondary-bg);
    border-color: var(--button-secondary-border);
    &:hover:not(:disabled) {
      background: var(--button-secondary-bg-hover);
      border-color: var(--button-secondary-border-hover);
    }
  }

  /* ── 幽灵（透明背景，hover 浅灰） ── */
  &--ghost {
    color: var(--text-secondary);
    background: transparent;
    &:hover:not(:disabled) {
      color: var(--text-primary);
      background: color-mix(in srgb, var(--bg-hover) 82%, transparent);
    }
  }

  /* ── 文字按钮（品牌色文字） ── */
  &--text {
    color: var(--brand);
    background: transparent;
    padding-left: 8px;
    padding-right: 8px;
    &:hover:not(:disabled) {
      background: var(--brand-bg-hover);
    }
  }

  /* ── 危险（红橙渐变） ── */
  &--danger {
    color: var(--button-danger-text);
    background: var(--button-danger-bg);
    border-color: var(--button-danger-border);
    box-shadow: var(--button-danger-shadow);
    &:hover:not(:disabled) {
      background: var(--button-danger-bg-hover);
      border-color: var(--button-danger-border-hover);
      box-shadow: var(--button-danger-shadow-hover);
    }
  }

  /* ── 加载态 ── */
  &--loading {
    cursor: progress;
  }
  .app-btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: app-btn-spin 0.6s linear infinite;
  }
  @keyframes app-btn-spin {
    to {
      transform: rotate(360deg);
    }
  }
}
</style>
