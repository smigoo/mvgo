<template>
  <div class="circle-progress-container" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :width="size" :height="size">
      <!-- 路径渐变定义 -->
      <defs v-if="isGradient">
        <linearGradient
          :id="gradientId"
          x1="50%"
          y1="0%"
          x2="100%"
          y2="50%"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" :stop-color="gradientColors.start" />
          <stop offset="100%" :stop-color="gradientColors.end" />
        </linearGradient>
      </defs>

      <!-- 背景环 -->
      <circle
        class="background"
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="thickness"
        fill="none"
        :stroke="background"
      />

      <!-- 进度环 -->
      <circle
        ref="progressElement"
        class="progress"
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="thickness"
        fill="none"
        :stroke="strokeColor"
        :stroke-dasharray="strokeDasharray"
        :stroke-linecap="strokeLinecap"
      />
    </svg>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  color: {
    type: [String, Object],
    default: 'var(--brand-light)',
  },
  background: {
    type: String,
    default: 'transparent',
  },
  size: {
    type: Number,
    default: 40,
  },
  thickness: {
    type: Number,
    default: 3,
    validator: (v) => v > 0,
  },
  duration: {
    type: Number,
    default: 1,
    validator: (v) => v > 0,
  },
  mode: {
    type: String,
    default: 'loop',
    validator: (v) => ['loop', 'single'].includes(v),
  },
  pathLength: {
    type: Number,
    default: 1,
    validator: (v) => v >= 0 && v <= 1,
  },
  strokeLinecap: {
    type: String,
    default: 'round',
    validator: (v) => ['round', 'square', 'butt'].includes(v),
  },
})

const emit = defineEmits(['finish'])

// 实例变量
const progressElement = ref(null)
let animation = null
const gradientId = `gradient-${Math.random().toString(36).slice(2, 9)}`

// 计算属性
const isGradient = computed(() => typeof props.color === 'object')
const gradientColors = computed(() => props.color || { start: 'var(--brand-light)', end: 'var(--brand-light)' })
const center = computed(() => props.size / 2)
const radius = computed(() => (props.size - props.thickness) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const strokeColor = computed(() => (isGradient.value ? `url(#${gradientId})` : props.color))
const strokeDasharray = computed(() => {
  const length = props.pathLength * circumference.value
  return `${length} ${circumference.value}`
})

// 动画控制
const createAnimation = () => {
  if (animation) animation.cancel()

  const keyframes = [{ strokeDashoffset: circumference.value }, { strokeDashoffset: 0 }]

  animation = progressElement.value.animate(keyframes, {
    duration: props.duration * 1000,
    iterations: props.mode === 'loop' ? Infinity : 1,
    easing: 'linear',
  })

  if (props.mode === 'single') {
    animation.onfinish = () => emit('finish')
  }
}

// 生命周期
onMounted(createAnimation)
onBeforeUnmount(() => animation?.cancel())

// 响应式更新
watch(() => [props.duration, props.mode, props.pathLength, circumference.value], createAnimation)
// defineExpose({
//   start: createAnimation
// })
</script>

<style scoped>
.circle-progress-container {
  display: inline-block;
  animation: rotate var(--duration) linear infinite;
}

.progress {
  transform-origin: center;
  transform: rotate(-90deg);
  transition: stroke-dasharray 0.3s ease;
}

@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}
</style>
