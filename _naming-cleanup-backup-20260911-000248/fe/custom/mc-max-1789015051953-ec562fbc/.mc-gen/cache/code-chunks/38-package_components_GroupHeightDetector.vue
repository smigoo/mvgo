<template>
  <div class="c-device-monitor-group-height-detector">
    <!-- 此组件用于检测分组高度，渲染Group 1321317970内容 -->
    <div class="c-device-monitor-group-1321317970">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  groupData: {
    type: Object,
    default: () => ({})
  }
})

const containerRef = ref(null)
const containerHeight = ref(0)

const updateHeight = () => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
  }
}

let resizeObserver = null

onMounted(() => {
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateHeight()
    })
    resizeObserver.observe(containerRef.value)
    updateHeight()
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-height-detector {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.c-device-monitor-group-1321317970 {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  box-sizing: border-box;
}
</style>