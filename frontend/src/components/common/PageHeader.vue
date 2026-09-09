<template>
  <header class="app-page-header">
    <div class="aph-body">
      <div class="aph-title-row">
        <h1 class="aph-title">{{ title }}</h1>
        <span v-if="eyebrow" class="aph-eyebrow">{{ eyebrow }}</span>
      </div>
      <p v-if="description" class="aph-desc">{{ description }}</p>
      <slot name="subtitle" />
    </div>
    <div v-if="$slots.actions" class="aph-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  title: string
  description?: string
  icon?: Component
  eyebrow?: string
}>()
</script>

<style scoped lang="less">
.app-page-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 32px 40px 20px;

  .aph-body {
    min-width: 0;
    flex: 1;
  }

  .aph-title-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  .aph-title {
    font-size: 28px;
    line-height: 1.2;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aph-eyebrow {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--bg-hover) 82%, transparent);
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .aph-desc {
    max-width: 760px;
    font-size: 14px;
    color: var(--text-secondary);
    margin: 8px 0 0;
    line-height: 1.6;
  }

  .aph-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    align-self: flex-start;
  }
}
</style>
