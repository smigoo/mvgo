<template>
  <section
    class="app-card"
    :class="[
      `app-card--${variant}`,
      {
        'app-card--hover': hover,
        'app-card--flush': flush,
        'app-card--inset': inset
      }
    ]"
  >
    <header v-if="$slots.header || title" class="app-card-header">
      <div class="app-card-head-left">
        <span v-if="icon" class="app-card-icon" aria-hidden="true">
          <component :is="icon" />
        </span>
        <div class="app-card-head-copy">
          <span class="app-card-title">{{ title }}</span>
          <span v-if="subtitle" class="app-card-subtitle">{{ subtitle }}</span>
        </div>
        <slot name="title-extra" />
      </div>
      <div v-if="$slots.actions" class="app-card-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="app-card-body" :class="{ 'app-card-body--flush': flush }">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    icon?: Component
    variant?: 'default' | 'soft' | 'outlined'
    hover?: boolean
    flush?: boolean
    inset?: boolean
  }>(),
  {
    variant: 'default',
    hover: false,
    flush: false,
    inset: false
  }
)
</script>

<style scoped lang="less">
.app-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  transition: border-color var(--transition-base), box-shadow var(--transition-base);

  &--soft {
    background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-hover) 6%);
    border-color: color-mix(in srgb, var(--border-light) 70%, transparent);
  }

  &--outlined {
    background: transparent;
    border-color: var(--border-default);
  }

  &--hover {
    cursor: pointer;
    &:hover {
      border-color: color-mix(in srgb, var(--brand) 24%, var(--border-light));
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }
  }

  &--inset {
    background: color-mix(in srgb, var(--bg-card) 92%, var(--bg-hover) 8%);
  }

  .app-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--border-light) 70%, transparent);
  }

  &--flush .app-card-header {
    padding: 16px 18px 12px;
  }

  .app-card-head-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .app-card-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--text-secondary);
    background: var(--bg-alt);
    border: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .app-card-head-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .app-card-title {
    font-size: 15px;
    line-height: 1.3;
    font-weight: 600;
    color: var(--text-primary);
  }

  .app-card-subtitle {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-tertiary);
  }

  .app-card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .app-card-body {
    padding: 16px 18px;
  }

  .app-card-body--flush {
    padding: 0;
  }
}
</style>
