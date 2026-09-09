<script lang="ts" setup>
import type { HTMLAttributes } from "vue";
import { cn } from "@/utils/cn";
import { ref, watchEffect } from "vue";

interface RippleButtonProps {
  /** 额外 CSS 类名（如 .cta 控制外观） */
  class?: HTMLAttributes["class"];
  /** 涟漪颜色 */
  rippleColor?: string;
  /** 动画时长 (ms) */
  duration?: number;
  /** 是否禁用 */
  disabled?: boolean;
}

const props = withDefaults(defineProps<RippleButtonProps>(), {
  rippleColor: "#ADD8E6",
  duration: 600,
});

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

const rippleButtonRef = ref<HTMLButtonElement | null>(null);
const buttonRipples = ref<Array<{ x: number; y: number; size: number; key: number }>>([]);

function handleClick(event: MouseEvent) {
  if (props.disabled) return
  createRipple(event);
  emit("click", event);
}

function createRipple(event: MouseEvent) {
  const button = rippleButtonRef.value;
  if (!button) return;

  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  const newRipple = { x, y, size, key: Date.now() };
  buttonRipples.value.push(newRipple);
}

watchEffect(() => {
  if (buttonRipples.value.length > 0) {
    const lastRipple = buttonRipples.value[buttonRipples.value.length - 1];
    setTimeout(() => {
      buttonRipples.value = buttonRipples.value.filter((ripple) => ripple.key !== lastRipple.key);
    }, props.duration);
  }
});
</script>

<template>
  <button
    ref="rippleButtonRef"
    :style="{ '--duration': `${$props.duration}ms` }"
    :class="cn('ripple-btn', $props.class)"
    :disabled="disabled"
    @click="handleClick"
  >
    <!-- 内容层（浮在涟漪上方） -->
    <div class="ripple-content">
      <slot />
    </div>

    <!-- 涟漪层 -->
    <span class="ripple-layer">
      <span
        v-for="ripple in buttonRipples"
        :key="ripple.key"
        class="ripple-effect"
        :style="{
          width: `${ripple.size}px`,
          height: `${ripple.size}px`,
          top: `${ripple.y}px`,
          left: `${ripple.x}px`,
          backgroundColor: $props.rippleColor,
          transform: 'scale(0)',
          animationDuration: `${$props.duration}ms`,
        }"
      />
    </span>
  </button>
</template>

<style scoped>
/* 基础按钮：最小化样式，外观完全由外部 class 控制 */
.ripple-btn {
  position: relative;
  cursor: pointer;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  outline: none;
  -webkit-appearance: none;
}

.ripple-btn:disabled {
  cursor: not-allowed;
  pointer-events: none;
}

/* 内容层 — 浮在涟漪之上 */
.ripple-content {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

/* 涟漪层 — 覆盖整个按钮 */
.ripple-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
}

/* 单个涟漪圆环 */
.ripple-effect {
  position: absolute;
  border-radius: 50%;
  opacity: 0.35;
  animation: rippling var(--duration) ease-out;
}

@keyframes rippling {
  0% {
    opacity: 0.5;
    transform: scale(0);
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
</style>
