<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- [Style Refine] 背景图移至内部容器，遵守 root 容器禁令 -->
      <div class="c-monitor-bg" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%' }"></div>
      
      <div class="c-monitor-filter-bar">
        <div class="c-monitor-time-filter">
          <!-- [Style Refine] 添加下拉框样式类，匹配 Figma @ant/select -->
          <div class="c-monitor-select">
            <span class="c-monitor-time-item active">24小时</span>
          </div>
          <span class="c-monitor-time-item">7天</span>
          <span class="c-monitor-time-item">30天</span>
        </div>
      </div>

      <MonitorStats />

      <div class="c-monitor-content">
        <div class="c-monitor-trend-section">
          <div class="c-monitor-section-header">
            <span class="c-monitor-section-title">流量趋势</span>
          </div>
          <MonitorTrend />
        </div>
        
        <div class="c-monitor-dist-section">
          <div class="c-monitor-section-header">
            <span class="c-monitor-section-title">车型分布</span>
          </div>
          <MonitorDistribution />
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-_m-34.png'


// --- 框架初始化 ---

let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---

const activeTimeFilter = ref('24h')

const timeFilterOptions = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
]

// --- 工具函数 ---

const handleTimeFilterChange = (value) => {
  if (activeTimeFilter.value === value) return
  activeTimeFilter.value = value
}

const emitLoadEvent = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-monitor',
      timestamp: Date.now()
    })
  }
}

// --- 监听器 ---

watch(activeTimeFilter, (newVal) => {
  console.log('[c-monitor] 时间维度切换:', newVal)
})

import {onMounted, onUnmounted, provide} from 'vue'

import MonitorStats from './components/MonitorStats.vue'

import MonitorTrend from './components/MonitorTrend.vue'

import MonitorDistribution from './components/MonitorDistribution.vue'

let runtimeBuilder = null

let componentId = 'monitor'

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentId = builder?.componentId || 'monitor'
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

const activeTime = ref('24h')

// 向子组件提供当前时间筛选状态，以便子组件根据时间维度刷新数据

provide('activeTime', activeTime)

// --- 事件处理 ---

const handleTimeChange = (value) => {
  if (activeTime.value === value) return
  activeTime.value = value
}

// --- 生命周期 ---

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId,
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理定时器或事件监听
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>