<template>
  <div
    class="app-list-item"
    :class="[
      `app-list-item--${density}`,
      {
        'app-list-item--clickable': clickable,
        'app-list-item--active': active,
        'app-list-item--selected': selected
      }
    ]"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @click="clickable && $emit('click')"
    @keydown.enter="clickable && $emit('click')"
    @keydown.space.prevent="clickable && $emit('click')"
  >
    <div v-if="$slots.leading" class="ali-leading">
      <slot name="leading" />
    </div>
    <div class="ali-body">
      <slot />
    </div>
    <div v-if="$slots.meta" class="ali-meta">
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="ali-actions" @click.stop>
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    density?: 'compact' | 'default' | 'rich'
    clickable?: boolean
    active?: boolean
    selected?: boolean
  }>(),
  {
    density: 'default',
    clickable: false,
    active: false,
    selected: false
  }
)

defineEmits<{ (e: 'click'): void }>()
</script>

<style scoped lang="less">
.app-list-item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 10px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid color-mix(in srgb, var(--border-light) 78%, transparent);
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);

  &--compact {
    padding: 9px 12px;
  }
  &--default {
    padding: 12px 14px;
  }
  &--rich {
    padding: 13px 14px;
    align-items: start;
  }

  &--clickable {
    cursor: pointer;
    &:hover {
      border-color: color-mix(in srgb, var(--brand) 24%, var(--border-light));
      box-shadow: var(--shadow-sm);
    }
    &:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }
  }

  &--selected {
    border-color: var(--brand);
    background: color-mix(in srgb, var(--brand-bg-active) 70%, var(--bg-card) 30%);
  }

  &--active {
    border-color: color-mix(in srgb, var(--success) 18%, var(--border-light));
    background: color-mix(in srgb, var(--success-bg) 66%, var(--bg-card) 34%);
  }

  .ali-leading {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .ali-body {
    min-width: 0;
  }

  .ali-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .ali-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    flex-wrap: nowrap;
  }
}
</style>
