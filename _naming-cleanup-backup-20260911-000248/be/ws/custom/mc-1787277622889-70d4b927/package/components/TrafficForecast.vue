<template>
  <section class="c-traffic-forecast">
    <div class="tf-header">
      <h3 class="tf-title">{{ title }}</h3>
      <span class="tf-update">{{ updateTime }}</span>
    </div>
    <ul class="tf-list">
      <li v-for="item in forecastList" :key="item.label" class="tf-item">
        <span class="tf-label">{{ item.label }}</span>
        <span class="tf-value">{{ item.value }}<i class="tf-unit">%</i></span>
        <span class="tf-trend" :class="item.trend === 'up' ? 'tf-trend--up' : 'tf-trend--down'">
          {{ item.trend === 'up' ? '↑' : '↓' }} {{ item.change }}
        </span>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

let runtimeBuilder = null
let businessProps = {}
let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
  businessProps = builder?.businessProps || {}
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[TrafficForecast] $mcComponentBuilder 初始化失败:', e)
}

const title = computed(() => componentProps?.title || '交通预测')
const updateTime = ref('')

const forecastData = ref([
  { label: '未来15分钟', value: 72, trend: 'down', change: 3.2 },
  { label: '未来30分钟', value: 68, trend: 'down', change: 4.1 },
  { label: '未来1小时', value: 76, trend: 'up', change: 5.6 },
  { label: '未来2小时', value: 85, trend: 'up', change: 8.4 }
])

const forecastList = computed(() => {
  const base = Number(businessProps?.forecastBase) || 0
  return forecastData.value.map((item) => ({
    ...item,
    value: Math.round(Math.min(100, Math.max(0, item.value + base)))
  }))
})

onMounted(() => {
  const now = new Date()
  updateTime.value = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
  runtimeBuilder?.publishEvent('traffic-forecast-onload', {
    componentId: 'traffic-forecast',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
.c-traffic-forecast {  width: 100%;
 display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding: 16px; background: rgba(8, 28, 51, 0.6); border-radius: 8px; }
.tf-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.tf-title { margin: 0; font-size: 16px; font-weight: 600; color: #e5f0ff; }
.tf-update { font-size: 12px; color: #7a8fa6; }
.tf-list { flex: 1; margin: 0; padding: 0; list-style: none; }
.tf-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.tf-item:last-child { border-bottom: none; }
.tf-label { font-size: 14px; color: #b8c9e0; }
.tf-value { font-size: 20px; font-weight: 700; color: #fff; }
.tf-unit { margin-left: 2px; font-size: 12px; font-style: normal; }
.tf-trend { min-width: 56px; padding: 2px 6px; font-size: 13px; text-align: right; border-radius: 4px; background: rgba(0, 0, 0, 0.2); }
.tf-trend--up { color: #f56c6c; }
.tf-trend--down { color: #67c23a; }
</style>