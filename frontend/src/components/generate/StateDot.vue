<template>
  <span class="state-dot" :class="`state-dot--${type}`" :title="title"></span>
</template>

<script setup>
defineProps({
  type: { type: String, default: 'muted' }, // running | completed | success | failed | queued | muted
  title: { type: String, default: '' },
})
</script>
