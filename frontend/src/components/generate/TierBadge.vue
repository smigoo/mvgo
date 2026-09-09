<template>
  <span class="tier-badge-solid" :class="value">{{ label || (value === 'lite' ? 'Lite' : 'Max') }}</span>
</template>

<script setup>
defineProps({
  value: { type: String, default: 'lite' }, // lite | max
  label: { type: String, default: '' },
})
</script>
