<template>
  <div class="stat-grid" :style="gridStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 固定列数；不传则按 minmax 自动填充 */
    cols?: number
    /** 最小卡片宽度（auto 模式） */
    min?: string
    gap?: string
  }>(),
  {
    cols: undefined,
    min: '120px',
    gap: '12px'
  }
)

const gridStyle = computed(() => {
  if (props.cols && props.cols > 0) {
    return {
      gridTemplateColumns: `repeat(${props.cols}, 1fr)`,
      gap: props.gap
    }
  }
  return {
    gridTemplateColumns: `repeat(auto-fit, minmax(${props.min}, 1fr))`,
    gap: props.gap
  }
})
</script>

<style scoped lang="less">
.stat-grid {
  display: grid;
  width: 100%;
}
</style>
