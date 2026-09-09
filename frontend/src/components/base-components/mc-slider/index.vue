<!--
  mc-slider - 微前端兼容的 Slider 组件

  完全复现 Ant Design Vue Slider 的所有功能
  解决 wujie 微前端环境下的坐标计算问题

  使用方法：
  import McSlider from '@/components/base-components/mc-slider'

  <mc-slider v-model:value="value" :min="0" :max="100" />
-->

<template>
  <div
    class="mc-slider"
    :class="{
      'mc-slider-disabled': disabled,
      'mc-slider-vertical': vertical,
      'mc-slider-with-marks': hasMarks
    }"
  >
    <div
      ref="sliderRef"
      class="mc-slider-container"
      :class="{ 'mc-slider-dragging': isDragging }"
      @mousedown="handleSliderClick"
    >
      <!-- 背景轨道 -->
      <div class="mc-slider-rail" :style="[customRailStyle, railStyleComputed]"></div>

      <!-- 已选择轨道 -->
      <div class="mc-slider-track" :style="[customTrackStyle, trackStyleComputed]"></div>

      <!-- 步进点 -->
      <div v-if="showDots" class="mc-slider-step">
        <span
          v-for="dot in dotList"
          :key="dot.value"
          class="mc-slider-dot"
          :class="{ 'mc-slider-dot-active': dot.active }"
          :style="[customDotStyle, getDotStyle(dot.position)]"
        ></span>
      </div>

      <!-- 刻度标记 -->
      <div v-if="hasMarks" class="mc-slider-marks">
        <span
          v-for="mark in markList"
          :key="mark.value"
          class="mc-slider-mark"
          :style="getMarkStyle(mark.position)"
        >
          <span class="mc-slider-mark-text" :class="{ 'mc-slider-mark-text-active': mark.active }">
            {{ formatMarkLabel(mark.label) }}
          </span>
        </span>
      </div>

      <!-- 滑块手柄 -->
      <div
        ref="handleRef"
        class="mc-slider-handle"
        :style="[customHandleStyle, handleStyleComputed]"
        :class="{ 'mc-slider-handle-dragging': isDragging }"
        @mousedown.stop="handleMouseDown"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeyDown"
        tabindex="0"
      >
        <!-- Tooltip 提示 -->
        <div
          v-if="showTooltip"
          class="mc-slider-tooltip"
          :class="{ 'mc-slider-tooltip-visible': tooltipVisible }"
        >
          <div class="mc-slider-tooltip-content">
            <div class="mc-slider-tooltip-arrow"></div>
            <div class="mc-slider-tooltip-inner">
              {{ formattedValue }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  // 当前值
  value: {
    type: Number,
    default: 0
  },
  // 最小值
  min: {
    type: Number,
    default: 0
  },
  // 最大值
  max: {
    type: Number,
    default: 100
  },
  // 步长，可以为小数
  step: {
    type: Number,
    default: 1
  },
  // 刻度标记，key 为数值，value 为描述或配置
  marks: {
    type: Object,
    default: null
  },
  // 是否禁用
  disabled: {
    type: Boolean,
    default: false
  },
  // 是否显示 tooltip
  tooltipVisible: {
    type: Boolean,
    default: undefined
  },
  // tooltip 是否始终显示（已废弃，使用 tooltipVisible）
  tooltipOpen: {
    type: Boolean,
    default: undefined
  },
  // 垂直模式
  vertical: {
    type: Boolean,
    default: false
  },
  // 是否显示间断点
  dots: {
    type: Boolean,
    default: false
  },
  // 是否包含关系，marks 不为空对象时有效
  included: {
    type: Boolean,
    default: true
  },
  // 反向坐标轴
  reverse: {
    type: Boolean,
    default: false
  },
  // Tooltip 渲染函数
  tipFormatter: {
    type: Function,
    default: null
  },
  // 自定义轨道样式
  trackStyle: {
    type: Object,
    default: null
  },
  // 自定义手柄样式
  handleStyle: {
    type: Object,
    default: null
  },
  // 自定义背景条样式
  railStyle: {
    type: Object,
    default: null
  },
  // 自定义步进点样式
  dotStyle: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:value', 'change', 'afterChange'])

// ==================== 引用和状态 ====================
const sliderRef = ref(null)
const handleRef = ref(null)
const isDragging = ref(false)
const isFocused = ref(false)
const isClickActive = ref(false)
const clickTimer = ref(null)
let cachedRect = null // 缓存元素位置，减少拖拽时的重排

// 常量定义
const CLICK_TOOLTIP_DURATION = 1000 // 点击后 tooltip 显示时长

// ==================== 计算属性 ====================

// 计算百分比位置
const percentage = computed(() => {
  const range = props.max - props.min
  if (range === 0) return 0
  let percent = ((props.value - props.min) / range) * 100
  if (props.reverse) {
    percent = 100 - percent
  }
  return Math.max(0, Math.min(100, percent))
})

// 格式化后的值（用于 tooltip）
const formattedValue = computed(() => {
  if (props.tipFormatter) {
    return props.tipFormatter(props.value)
  }
  return props.value
})

// 是否显示 tooltip
const showTooltip = computed(() => {
  // 优先使用 tooltipVisible，其次 tooltipOpen，都没有则默认行为
  if (props.tooltipVisible !== undefined) {
    return props.tooltipVisible
  }
  if (props.tooltipOpen !== undefined) {
    return props.tooltipOpen
  }
  return true // 默认显示
})

// tooltip 是否可见
const tooltipVisible = computed(() => {
  if (props.tooltipVisible === false || props.tooltipOpen === false) {
    // 即使设置为 false，点击时也短暂显示
    return isClickActive.value
  }
  if (props.tooltipVisible === true || props.tooltipOpen === true) {
    return true
  }
  // 默认行为：拖拽、聚焦或点击时显示
  return isDragging.value || isFocused.value || isClickActive.value
})

// 是否有刻度标记
const hasMarks = computed(() => {
  return props.marks && Object.keys(props.marks).length > 0
})

// 是否显示步进点
const showDots = computed(() => {
  return props.dots || hasMarks.value
})

// 计算步进点列表
const dotList = computed(() => {
  const dots = []
  const range = props.max - props.min

  if (props.step === null || props.step <= 0) {
    return dots
  }

  // 计算步进点数量
  const steps = Math.floor(range / props.step)

  for (let i = 0; i <= steps; i++) {
    const value = props.min + i * props.step
    if (value > props.max) break

    const position = ((value - props.min) / range) * 100
    const active = props.included
      ? props.reverse
        ? value >= props.value
        : value <= props.value
      : false

    dots.push({
      value,
      position: props.reverse ? 100 - position : position,
      active
    })
  }

  return dots
})

// 计算刻度标记列表
const markList = computed(() => {
  if (!hasMarks.value) return []

  const marks = []
  const range = props.max - props.min

  Object.keys(props.marks).forEach((key) => {
    const value = Number(key)
    const position = ((value - props.min) / range) * 100
    const active = props.included
      ? props.reverse
        ? value >= props.value
        : value <= props.value
      : false

    marks.push({
      value,
      position: props.reverse ? 100 - position : position,
      label: props.marks[key],
      active
    })
  })

  return marks.sort((a, b) => a.value - b.value)
})

// ==================== 样式计算 ====================

// 自定义样式
const customRailStyle = computed(() => props.railStyle || {})
const customTrackStyle = computed(() => props.trackStyle || {})
const customHandleStyle = computed(() => props.handleStyle || {})
const customDotStyle = computed(() => props.dotStyle || {})

// 轨道样式
const railStyleComputed = computed(() => {
  if (props.vertical) {
    return {}
  }
  return {}
})

// 已选择轨道样式
const trackStyleComputed = computed(() => {
  if (props.vertical) {
    if (props.reverse) {
      return {
        top: `${percentage.value}%`,
        height: `${100 - percentage.value}%`
      }
    } else {
      return {
        bottom: 0,
        height: `${percentage.value}%`
      }
    }
  } else {
    if (props.reverse) {
      return {
        right: 0,
        width: `${100 - percentage.value}%`
      }
    } else {
      return {
        left: 0,
        width: `${percentage.value}%`
      }
    }
  }
})

// 手柄样式
const handleStyleComputed = computed(() => {
  if (props.vertical) {
    return {
      bottom: `${percentage.value}%`,
      transform: 'translate(-50%, 50%)'
    }
  } else {
    return {
      left: `${percentage.value}%`,
      transform: 'translate(-50%, -50%)'
    }
  }
})

// 步进点样式
const getDotStyle = (position) => {
  if (props.vertical) {
    return {
      bottom: `${position}%`,
      transform: 'translate(-50%, 50%)'
    }
  } else {
    return {
      left: `${position}%`,
      transform: 'translate(-50%, -50%)'
    }
  }
}

// 刻度标记样式
const getMarkStyle = (position) => {
  if (props.vertical) {
    return {
      bottom: `${position}%`,
      transform: 'translateY(50%)'
    }
  } else {
    return {
      left: `${position}%`,
      transform: 'translateX(-50%)'
    }
  }
}

// 格式化标记标签
const formatMarkLabel = (label) => {
  if (typeof label === 'object' && label.label) {
    return label.label
  }
  return label
}

// ==================== 坐标计算 ====================

// 根据鼠标位置计算值
const calculateValue = (clientX, clientY) => {
  if (!sliderRef.value || props.disabled) return props.value

  // 优先使用缓存的 rect，减少拖拽时的重排
  const rect = cachedRect || sliderRef.value.getBoundingClientRect()
  let offset, total

  if (props.vertical) {
    offset = rect.bottom - clientY
    total = rect.height
  } else {
    offset = clientX - rect.left
    total = rect.width
  }

  // 限制在有效范围内
  const clampedOffset = Math.max(0, Math.min(offset, total))
  let percent = clampedOffset / total

  // 反向模式
  if (props.reverse) {
    percent = 1 - percent
  }

  // 计算实际值
  const range = props.max - props.min
  let newValue = props.min + percent * range

  // 应用步进
  if (props.step > 0) {
    newValue = Math.round(newValue / props.step) * props.step
  }

  // 确保在范围内
  newValue = Math.max(props.min, Math.min(props.max, newValue))

  // 处理浮点数精度
  const precision = getStepPrecision()
  return Number(newValue.toFixed(precision))
}

// 获取步进精度
const getStepPrecision = () => {
  const stepString = props.step.toString()
  const dotIndex = stepString.indexOf('.')
  return dotIndex === -1 ? 0 : stepString.length - dotIndex - 1
}

// ==================== 事件处理 ====================

// 点击滑动条（直接跳转）
const handleSliderClick = (e) => {
  if (props.disabled || isDragging.value) return

  // 如果点击的是手柄，不处理
  if (handleRef.value && handleRef.value.contains(e.target)) return

  const newValue = calculateValue(e.clientX, e.clientY)
  updateValue(newValue, true)

  // 显示点击反馈 tooltip
  isClickActive.value = true
  if (clickTimer.value) {
    clearTimeout(clickTimer.value)
  }
  clickTimer.value = setTimeout(() => {
    isClickActive.value = false
  }, CLICK_TOOLTIP_DURATION)

  // 点击后聚焦到手柄
  nextTick(() => {
    if (handleRef.value) {
      handleRef.value.focus()
    }
  })
}

// 鼠标按下手柄（开始拖拽）
const handleMouseDown = (e) => {
  if (props.disabled) return

  e.preventDefault()
  e.stopPropagation()

  // 取消点击状态
  isClickActive.value = false
  if (clickTimer.value) {
    clearTimeout(clickTimer.value)
  }

  isDragging.value = true

  // 缓存元素位置，减少拖拽时的重排
  if (sliderRef.value) {
    cachedRect = sliderRef.value.getBoundingClientRect()
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)

  // 添加全局样式防止文本选择
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'grabbing'
}

// 鼠标移动（拖拽中）
const handleMouseMove = (e) => {
  if (!isDragging.value || props.disabled) return

  e.preventDefault()

  const newValue = calculateValue(e.clientX, e.clientY)
  updateValue(newValue, false)
}

// 鼠标释放（拖拽结束）
const handleMouseUp = (e) => {
  if (!isDragging.value) return

  isDragging.value = false

  const newValue = calculateValue(e.clientX, e.clientY)
  updateValue(newValue, true)

  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)

  // 恢复全局样式
  document.body.style.userSelect = ''
  document.body.style.cursor = ''

  // 清除缓存的位置信息
  cachedRect = null
}

// 键盘控制
const handleKeyDown = (e) => {
  if (props.disabled) return

  let delta = 0
  const step = props.step || 1

  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      delta = -step
      e.preventDefault()
      break
    case 'ArrowRight':
    case 'ArrowUp':
      delta = step
      e.preventDefault()
      break
    case 'Home':
      updateValue(props.min, true)
      e.preventDefault()
      return
    case 'End':
      updateValue(props.max, true)
      e.preventDefault()
      return
    case 'PageDown':
      delta = -step * 10
      e.preventDefault()
      break
    case 'PageUp':
      delta = step * 10
      e.preventDefault()
      break
    default:
      return
  }

  // 反向模式下反转方向
  if (props.reverse) {
    delta = -delta
  }

  const newValue = Math.max(props.min, Math.min(props.max, props.value + delta))
  updateValue(newValue, true)
}

// 聚焦事件
const handleFocus = () => {
  isFocused.value = true
}

// 失焦事件
const handleBlur = () => {
  isFocused.value = false
}

// 更新值
const updateValue = (newValue, triggerAfterChange = false) => {
  if (newValue === props.value) {
    if (triggerAfterChange) {
      emit('afterChange', newValue)
    }
    return
  }

  emit('update:value', newValue)
  emit('change', newValue)

  if (triggerAfterChange) {
    nextTick(() => {
      emit('afterChange', newValue)
    })
  }
}

// ==================== 生命周期 ====================

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''

  // 清理点击定时器
  if (clickTimer.value) {
    clearTimeout(clickTimer.value)
  }

  // 清除缓存
  cachedRect = null
})
</script>

<style scoped lang="less">
.mc-slider {
  position: relative;
  width: 100%;
  padding: 4px 5px;
  box-sizing: border-box;
  user-select: none;

  &:focus {
    outline: none;
  }

  // 垂直模式
  &.mc-slider-vertical {
    width: auto;
    height: 100%;
    padding: 0 8px;

    .mc-slider-container {
      width: 4px;
      height: 100%;
      padding: 0;
    }

    .mc-slider-rail,
    .mc-slider-track {
      width: 4px;
      height: 100%;
      left: 50%;
      transform: translateX(-50%);
      top: auto;
    }

    .mc-slider-handle {
      left: 50%;
    }

    .mc-slider-marks {
      left: 18px;
      top: 0;
      height: 100%;
    }

    .mc-slider-mark {
      width: auto;
      left: 0;
    }

    .mc-slider-mark-text {
      white-space: nowrap;
    }
  }

  // 带标记的样式
  &.mc-slider-with-marks {
    margin-bottom: 28px;

    &.mc-slider-vertical {
      margin-bottom: 0;
      margin-right: 28px;
    }
  }

  // 禁用状态
  &.mc-slider-disabled {
    cursor: not-allowed;
    opacity: 0.5;

    .mc-slider-container,
    .mc-slider-handle,
    .mc-slider-dot {
      cursor: not-allowed !important;
    }

    .mc-slider-track {
      background-color: rgba(0, 0, 0, 0.25) !important;
    }

    .mc-slider-handle {
      border-color: rgba(0, 0, 0, 0.25) !important;
      box-shadow: none !important;
    }
  }
}

.mc-slider-container {
  position: relative;
  width: 100%;
  height: 12px;
  cursor: pointer;
  touch-action: none;

  &:focus {
    outline: none;
  }

  // 拖拽状态
  &.mc-slider-dragging {
    cursor: grabbing;
  }
}

// 背景轨道
.mc-slider-rail {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 4px;
  background-color: var(--bg-alt);
  border-radius: var(--radius-xs);
  transform: translateY(-50%);
  transition: background-color 0.2s;
}

// 已选择轨道
.mc-slider-track {
  position: absolute;
  top: 50%;
  height: 4px;
  background-color: var(--c-blue-200);
  border-radius: var(--radius-xs);
  transform: translateY(-50%);
  transition: background-color 0.2s;
  pointer-events: none;
}

// 步进点容器
.mc-slider-step {
  position: absolute;
  width: 100%;
  height: 4px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

// 步进点
.mc-slider-dot {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  background-color: var(--bg-card);
  border: 2px solid var(--border-strong);
  border-radius: var(--radius-full);
  cursor: pointer;
  pointer-events: auto;
  transition: border-color 0.2s;

  &.mc-slider-dot-active {
    border-color: var(--c-blue-200);
  }
}

// 刻度标记容器
.mc-slider-marks {
  position: absolute;
  top: 20px;
  left: 0;
  width: 100%;
  font-size: 12px;
}

// 刻度标记
.mc-slider-mark {
  position: absolute;
  cursor: pointer;
}

// 刻度标记文本
.mc-slider-mark-text {
  display: inline-block;
  color: rgba(0, 0, 0, 0.45);
  text-align: center;
  word-break: keep-all;
  cursor: pointer;
  user-select: none;

  &.mc-slider-mark-text-active {
    color: rgba(0, 0, 0, 0.85);
  }
}

// 滑块手柄
.mc-slider-handle {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  background-color: var(--bg-card);
  border: 2px solid var(--c-blue-200);
  border-radius: var(--radius-full);
  box-shadow: 0 2px 8px 0 var(--shadow-md);
  cursor: pointer;
  outline: none;
  // 只对颜色和阴影应用过渡，位置变化需要即时响应
  transition:
    border-color 0.2s cubic-bezier(0.645, 0.045, 0.355, 1),
    box-shadow 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
  z-index: 2;

  &:hover {
    border-color: var(--brand-light);
  }

  &:active {
    border-color: var(--brand-hover);
    box-shadow: 0 0 0 5px rgba(24, 144, 255, 0.12);
  }

  &:focus-visible {
    border-color: var(--brand-light);
    box-shadow: 0 0 0 5px rgba(24, 144, 255, 0.12);
    outline: 0;
  }

  &.mc-slider-handle-dragging {
    cursor: grabbing;
    border-color: var(--brand-hover);
    box-shadow: 0 0 0 5px rgba(24, 144, 255, 0.12);
  }
}

// Tooltip
.mc-slider-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  margin-bottom: 12px;
  pointer-events: none;
  opacity: 0;
  transform: translateX(-50%) translateY(4px) scale(0.9);
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 1050;

  &.mc-slider-tooltip-visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

.mc-slider-tooltip-content {
  position: relative;
}

.mc-slider-tooltip-inner {
  min-width: 32px;
  min-height: 32px;
  padding: 6px 12px;
  color: var(--text-inverse);
  text-align: center;
  background-color: rgba(0, 0, 0, 0.85);
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
  box-shadow: 0 2px 8px var(--shadow-md);
}

.mc-slider-tooltip-arrow {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid rgba(0, 0, 0, 0.85);
  filter: drop-shadow(0 2px 4px var(--shadow-dropdown));
}

// Hover 效果
.mc-slider:hover {
  .mc-slider-rail {
    background-color: #e1e1e1;
  }

  .mc-slider-track {
    background-color: #69b1ff;
  }
}
</style>
