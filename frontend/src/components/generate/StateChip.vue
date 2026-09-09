<template>
  <span class="state-chip" :class="`state-chip--${type}`">
    <slot>{{ label }}</slot>
  </span>
</template>

<script setup>
defineProps({
  type: { type: String, default: 'running' }, // running | queued | failed | success | info
  label: { type: String, default: '' },
})
</script>
