<template>
  <div
    class="tier-toggle"
    :class="{ 'is-max': modelValue === 'max', disabled }"
    role="radiogroup"
    :aria-label="ariaLabel"
    @keydown="onKey"
  >
    <span class="tier-toggle__thumb tier-toggle__thumb--lite" aria-hidden="true"></span>
    <span class="tier-toggle__thumb tier-toggle__thumb--max" aria-hidden="true"></span>
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="tier-toggle__opt"
      :data-val="opt.value"
      role="radio"
      :aria-checked="modelValue === opt.value"
      :disabled="disabled || disabledValues.includes(opt.value)"
      @click="select(opt.value)"
    >{{ opt.label }}</button>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: String, default: 'lite' },
  disabled: { type: Boolean, default: false },
  disabledValues: { type: Array, default: () => [] },
  ariaLabel: { type: String, default: '生成规格' },
})
const emit = defineEmits(['update:modelValue', 'change'])

const options = [
  { value: 'lite', label: 'Lite' },
  { value: 'max', label: 'Max' },
]

function select(val) {
  if (props.disabled || props.disabledValues.includes(val)) return
  if (props.modelValue !== val) {
    emit('update:modelValue', val)
    emit('change', val)
  }
}

function onKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  const next = props.modelValue === 'lite' ? 'max' : 'lite'
  select(next)
}
</script>
