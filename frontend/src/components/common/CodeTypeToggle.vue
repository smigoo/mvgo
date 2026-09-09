<template>
  <div
    class="codetype-toggle"
    :class="{ 'is-microcode': modelValue === 'microcode', disabled }"
    role="radiogroup"
    :aria-label="ariaLabel"
    @keydown="onKey"
  >
    <span class="codetype-toggle__thumb codetype-toggle__thumb--vue3" aria-hidden="true"></span>
    <span class="codetype-toggle__thumb codetype-toggle__thumb--microcode" aria-hidden="true"></span>
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="codetype-toggle__opt"
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
  modelValue: { type: String, default: 'vue3' },
  disabled: { type: Boolean, default: false },
  disabledValues: { type: Array, default: () => [] },
  ariaLabel: { type: String, default: '代码类型' },
})
const emit = defineEmits(['update:modelValue', 'change'])

const options = [
  { value: 'vue3', label: 'Vue3' },
  { value: 'microcode', label: '微码' },
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
  const next = props.modelValue === 'vue3' ? 'microcode' : 'vue3'
  select(next)
}
</script>