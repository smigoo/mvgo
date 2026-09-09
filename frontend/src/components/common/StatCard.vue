<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="stat-card"
    :class="[
      `stat-card--${layout}`,
      `stat-card--${color}`,
      {
        'stat-card--clickable': clickable,
        'stat-card--active': active
      }
    ]"
    :style="span ? { gridColumn: `span ${span}` } : undefined"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    :aria-pressed="clickable ? active : undefined"
    :title="title"
    @click="clickable && $emit('click')"
    @keydown.enter="clickable && $emit('click')"
    @keydown.space.prevent="clickable && $emit('click')"
  >
    <span v-if="icon && layout === 'horizontal'" class="stat-icon" aria-hidden="true">
      <component :is="icon" />
    </span>
    <span class="stat-value">{{ value }}</span>
    <span class="stat-label">{{ label }}</span>
  </component>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    value: string | number
    label: string
    icon?: Component
    color?: 'brand' | 'success' | 'running' | 'failed' | 'warning' | 'queued' | 'default'
    layout?: 'vertical' | 'horizontal'
    clickable?: boolean
    active?: boolean
    span?: number
    title?: string
  }>(),
  {
    color: 'default',
    layout: 'vertical',
    clickable: false,
    active: false,
    span: undefined,
    title: undefined
  }
)

defineEmits<{ (e: 'click'): void }>()
</script>

<style scoped lang="less">
.stat-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 14px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-left: 2px solid var(--border-default);
  border-radius: var(--radius-md);
  transition:
    border-color var(--transition-base),
    background var(--transition-base),
    box-shadow var(--transition-base),
    transform var(--transition-fast);

  &--horizontal {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  &--clickable {
    cursor: pointer;
    user-select: none;
    &:hover {
      box-shadow: var(--shadow-sm);
    }
    &:active {
      background: var(--bg-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }
  }

  &--active {
    background: color-mix(in srgb, var(--brand-bg-active) 80%, transparent);
  }

  .stat-icon {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--brand);
    background: var(--brand-bg);
    flex-shrink: 0;
  }

  .stat-value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    .stat-card--horizontal & {
      font-size: 16px;
      font-weight: 600;
    }
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-tertiary);
    font-weight: 500;
  }

  /* 语义色映射（左边框 + 数字） */
  &--brand {
    border-left-color: color-mix(in srgb, var(--brand) 70%, var(--border-default));
    .stat-value {
      color: color-mix(in srgb, var(--brand) 86%, var(--text-primary));
    }
  }
  &--success {
    border-left-color: color-mix(in srgb, var(--task-success) 70%, var(--border-default));
    .stat-value {
      color: color-mix(in srgb, var(--task-success) 84%, var(--text-primary));
    }
  }
  &--running {
    border-left-color: color-mix(in srgb, var(--task-running) 70%, var(--border-default));
    .stat-value {
      color: color-mix(in srgb, var(--task-running) 82%, var(--text-primary));
    }
  }
  &--failed {
    border-left-color: color-mix(in srgb, var(--task-failed) 70%, var(--border-default));
    .stat-value {
      color: color-mix(in srgb, var(--task-failed) 82%, var(--text-primary));
    }
  }
  &--warning {
    border-left-color: color-mix(in srgb, var(--warning) 70%, var(--border-default));
    .stat-value {
      color: color-mix(in srgb, var(--warning) 84%, var(--text-primary));
    }
  }
  &--queued {
    border-left-color: color-mix(in srgb, var(--task-queued) 70%, var(--border-default));
    .stat-value {
      color: color-mix(in srgb, var(--task-queued) 84%, var(--text-primary));
    }
  }
}
</style>
