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
import { computed, onMounted } from 'vue'

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

let runtimeBuilder = {}
try {
  ;({ runtimeBuilder } = $mcComponentBuilder())
} catch (e) {
  runtimeBuilder = {}
}

const publishEvent = runtimeBuilder?.publishEvent || (() => {})

onMounted(() => {
  publishEvent('cp-流量监测-onload', {
    componentId,
    timestamp: Date.now()
  })
})
</script>

<style scoped>
.c-monitor {
  width: 100%;
  height: 100%;
}
.monitor-box {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 12px;
  background: linear-gradient(135deg, #0e1c36, #1f3b73);
  color: #fff;
}
.theme-light .monitor-box {
  background: linear-gradient(135deg, #eef4ff, #d8e6ff);
  color: #10233f;
}
.theme-dark .monitor-box {
  background: linear-gradient(135deg, #0e1c36, #1f3b73);
  color: #fff;
}
.monitor-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.25;
}
.monitor-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}
.monitor-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.monitor-desc {
  margin: 4px 0 0;
  font-size: 12px;
  opacity: 0.75;
}
.monitor-chart {
  margin-top: 12px;
}
.chart-svg {
  width: 100%;
  height: 80px;
}
.monitor-stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  margin-top: 8px;
}
</style>