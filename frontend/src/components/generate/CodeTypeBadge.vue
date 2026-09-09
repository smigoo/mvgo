<template>
  <span class="codetype-badge-solid" :class="value">{{ label || (value === 'vue3' ? 'V3' : 'MC') }}</span>
</template>

<script setup>
defineProps({
  value: { type: String, default: 'vue3' }, // vue3 | microcode
  label: { type: String, default: '' },
})
</script>
