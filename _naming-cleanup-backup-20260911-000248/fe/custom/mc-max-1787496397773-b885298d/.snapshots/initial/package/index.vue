<template>
  <div class="c-monitor" :class="`theme-${theme}`">
    <div class="monitor-box" :style="boxStyle">
      <img v-if="imgUrl" :src="imgUrl" class="monitor-bg" alt="" />
      <div class="monitor-main">
        <div>
          <h2 class="monitor-title">{{ title }}</h2>
          <p class="monitor-desc">{{ description }}</p>
        </div>
        <div class="monitor-chart">
          <svg viewBox="0 0 400 120" preserveAspectRatio="none" class="chart-svg">
            <polyline
              points="0,92 40,70 80,78 120,44 160,58 200,32 240,50 280,22 320,38 360,16 400,28"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
            />
            <circle cx="360" cy="16" r="4" fill="currentColor" />
          </svg>
          <div class="monitor-stats">
            <span>↓ 128 KB/s</span>
            <span>↑ 32 KB/s</span>
            <span>总量 2.4 GB</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>





<script setup>
import {computed, onMounted, onUnmounted} from 'vue'

const props = defineProps({
  attribute: { type: Object, default: () => ({}) },
  theme: { type: String, default: 'light' }
})

const componentId = 'c-monitor'

const title = computed(() => props.attribute?.title || 'cp-流量监测')

const description = computed(() => props.attribute?.description || '')

const imgUrl = computed(() => props.attribute?.imgUrl || '')

const boxStyle = computed(() => {
  const ratio = props.attribute?.aspectRatio || [16, 9]
  return { aspectRatio: `${ratio[0]} / ${ratio[1]}` }
})

let runtimeBuilder = null

try {
  ;({ runtimeBuilder } = $mcComponentBuilder())
} catch (e) {
  runtimeBuilder = null
}

const publishEvent = runtimeBuilder?.publishEvent || (() => {})

const handleResize = () => {
  // 预留：处理自适应逻辑
}

onMounted(() => {
  publishEvent('c-monitor-onload', {
    componentId,
    timestamp: Date.now()
  })

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>