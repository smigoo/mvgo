<script lang="ts" setup>
import { cn } from "@inspira-ui/plugins";
import { computed } from "vue";

interface GradientButtonProps {
  borderWidth?: number;
  colors?: string[];
  duration?: number;
  borderRadius?: number;
  blur?: number;
  class?: string;
  bgColor?: string;
}

const props = withDefaults(defineProps<GradientButtonProps>(), {
  colors: () => [
    "#FF0000",
    "#FFA500",
    "#FFFF00",
    "#008000",
    "#0000FF",
    "#4B0082",
    "#EE82EE",
    "#FF0000",
  ],
  duration: 2500,
  borderWidth: 2,
  borderRadius: 8,
  blur: 4,
  bgColor: "#000",
});

const durationInMilliseconds = computed(() => `${props.duration}ms`);
const allColors = computed(() => props.colors.join(", "));
const borderWidthInPx = computed(() => `${props.borderWidth}px`);
const borderRadiusInPx = computed(() => `${props.borderRadius}px`);
const blurPx = computed(() => `${props.blur}px`);
</script>

<template>
  <button
    :class="
      cn(
        'rainbow-btn relative inline-flex min-h-10 min-w-28 items-center justify-center',
        'cursor-pointer border-none outline-none',
        props.class,
      )
    "
  >
    <span class="rainbow-btn__content inline-flex size-full items-center justify-center px-4 py-2">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.rainbow-btn {
  position: relative;
  padding: v-bind(borderWidthInPx);
  border-radius: v-bind(borderRadiusInPx);
  background: v-bind(bgColor);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.rainbow-btn:hover {
  background: rgba(30, 30, 30, 0.9);
}

.rainbow-btn__content {
  border-radius: calc(v-bind(borderRadiusInPx) - v-bind(borderWidthInPx));
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  position: relative;
  z-index: 1;
}

@keyframes rotate-rainbow {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
