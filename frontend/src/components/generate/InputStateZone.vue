<template>
  <div class="input-state-zone" :class="`is-${state}`">
    <span v-if="corner" class="input-corner" :class="`input-corner--${cornerType}`">{{ corner }}</span>
    <slot />
    <div v-if="state === 'html-confirm'" class="input-confirm-card">
      <p class="input-confirm-title">识别为 HTML 源</p>
      <p class="input-confirm-desc">HTML 源功能开发中，暂不支持直接生成。</p>
      <div class="input-confirm-acts">
        <button class="ic-btn" disabled>以 HTML 源生成</button>
        <button class="ic-btn" disabled>以网页生成</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  state: { type: String, default: 'empty' }, // empty | image | figma | text | html-confirm
  corner: { type: String, default: '' },
})

const cornerType = computed(() => {
  if (props.state === 'html-confirm') return 'confirm'
  if (props.state === 'text') return 'mid'
  return 'high'
})
</script>

<style scoped>
.input-state-zone {
  position: relative;
  border: 2px solid var(--input-border-empty, #d0d0d0);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg-card, #fff);
  transition: border-color .15s, background .15s;
}
.input-state-zone.is-image,
.input-state-zone.is-figma {
  border-color: var(--input-border-high, #16a34a);
  background: var(--input-bg-high, #f0fdf4);
}
.input-state-zone.is-text {
  border-color: var(--input-border-mid, #3b82f6);
  background: var(--input-bg-mid, #eff6ff);
}
.input-state-zone.is-html-confirm {
  border-color: var(--input-border-confirm, #f59e0b);
  background: var(--input-bg-confirm, #fffbeb);
}
.input-corner {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
  z-index: 2;
}
.input-corner--high { background: var(--input-corner-high-bg, #16a34a); color: var(--input-corner-high-text, #fff); }
.input-corner--mid { background: var(--input-corner-mid-bg, #3b82f6); color: var(--input-corner-mid-text, #fff); }
.input-corner--confirm { background: var(--input-corner-confirm-bg, #f59e0b); color: var(--input-corner-confirm-text, #fff); }

.input-confirm-card {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--warning, #f59e0b) 12%, var(--bg-card, #fff));
  border: 1px solid var(--input-border-confirm, #f59e0b);
}
.input-confirm-title { margin: 0 0 2px; font-size: 12px; font-weight: 600; color: var(--text-primary, #222); }
.input-confirm-desc { margin: 0 0 8px; font-size: 11px; color: var(--text-secondary, #666); }
.input-confirm-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.ic-btn {
  font-size: 11px;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-default, #d0d0d0);
  background: var(--bg-secondary, #f0f0f0);
  color: var(--text-muted, #999);
  cursor: not-allowed;
}
</style>
