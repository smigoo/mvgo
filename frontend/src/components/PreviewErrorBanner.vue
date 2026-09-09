<!--
 * 预览组件加载失败的非阻塞提示条。
 * 由父页面通过 usePreviewErrorBridge 接收 iframe 内错误后展示。
 * 设计为「非阻塞」：固定在底部居中，不遮挡操作，点击 × 即可关闭，
 * 不影响页面其他功能（符合「组件问题不应影响整站」的原则）。
 -->
<template>
  <transition name="peb-fade">
    <div v-if="message" class="preview-error-banner" role="alert">
      <span class="peb-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
      <span class="peb-text">{{ message }}</span>
      <button class="peb-close icon-tooltip" aria-label="关闭" data-tooltip="关闭" @click="$emit('dismiss')">×</button>
    </div>
  </transition>
</template>

<script setup>
defineProps({
  message: { type: String, default: '' },
})
defineEmits(['dismiss'])
</script>

<style scoped>
.preview-error-banner {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 90vw;
  padding: 10px 16px;
  background: var(--task-failed-bg);
  border: 1px solid var(--task-failed-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  color: var(--task-failed-text);
  font-size: 13px;
  line-height: 1.5;
}
.peb-icon {
  font-size: 16px;
  flex: none;
  color: var(--task-failed);
}
.peb-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.peb-close {
  flex: none;
  margin-left: 4px;
  border: none;
  background: transparent;
  color: var(--task-failed-text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.peb-close:hover {
  opacity: 0.7;
}
.peb-fade-enter-active,
.peb-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.peb-fade-enter-from,
.peb-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
