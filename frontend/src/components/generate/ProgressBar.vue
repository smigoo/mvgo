<template>
  <div class="progress-bar">
    <div
      class="progress-bar__fill"
      :class="{ 'progress-bar__fill--success': variant === 'success' }"
      :style="{ width: Math.max(0, Math.min(100, percent)) + '%' }"
    ></div>
  </div>
</template>

<script setup>
defineProps({
  percent: { type: Number, default: 0 },
  variant: { type: String, default: 'gradient' }, // gradient | success
})
</script>
