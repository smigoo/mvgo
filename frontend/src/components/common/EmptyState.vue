<template>
  <div class="app-empty" :class="{ 'app-empty--compact': compact }">
    <div v-if="icon || $slots.icon" class="app-empty-icon" aria-hidden="true">
      <slot name="icon"><component :is="icon" v-if="icon" /></slot>
    </div>
    <div v-if="title" class="app-empty-title">{{ title }}</div>
    <div v-if="description" class="app-empty-desc">
      <slot name="description">{{ description }}</slot>
    </div>
    <div v-if="$slots.actions" class="app-empty-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    icon?: Component
    title?: string
    description?: string
    compact?: boolean
  }>(),
  {
    compact: false
  }
)
</script>

<style scoped lang="less">
.app-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 18px;
  color: var(--text-tertiary);

  &--compact {
    padding: 24px 16px;
  }

  .app-empty-icon {
    width: 54px;
    height: 54px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg);
    font-size: 24px;
    color: var(--text-quaternary);
    margin-bottom: 14px;
    background: color-mix(in srgb, var(--bg-hover) 78%, transparent);
  }

  .app-empty-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .app-empty-desc {
    font-size: 13px;
    color: var(--text-tertiary);
    line-height: 1.6;
    max-width: 420px;

    :deep(br) {
      line-height: 1.8;
    }
  }

  .app-empty-actions {
    margin-top: 18px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
}
</style>
