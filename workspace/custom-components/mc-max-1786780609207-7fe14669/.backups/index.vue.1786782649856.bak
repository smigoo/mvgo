<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 顶部时间筛选 -->
      <div class="c-monitor-header">
        <div class="c-monitor-tabs">
          <span 
            v-for="tab in timeTabs" 
            :key="tab.value" 
            :class="['c-monitor-tab-item', { 'is-active': activeTimeTab === tab.value }]"
            @click="handleTabChange(tab.value)"
          >
            {{ tab.label }}
          </span>
        </div>
      </div>

      <!-- 核心指标统计区 -->
      <div class="c-monitor-stats-section" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
        <MonitorStats :stats="statsData" :icons="[icon1, icon2, icon3]" />
      </div>

      <!-- 下方图表区 -->
      <div class="c-monitor-body">
        <div class="c-monitor-trend-panel">
          <div class="c-monitor-panel-header">
            <span class="c-monitor-panel-title">流量趋势分析</span>
          </div>
          <div class="c-monitor-chart-box">
            <MonitorTrend ref="trendRef" :time-tab="activeTimeTab" />
          </div>
        </div>
        
        <div class="c-monitor-distribution-panel">
          <div class="c-monitor-panel-header">
            <span class="c-monitor-panel-title">车型构成比例</span>
          </div>
          <div class="c-monitor-chart-box">
            <MonitorDistribution ref="distributionRef" :time-tab="activeTimeTab" />
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg2 from '../resources/images/bg-_m-36.png'
import icon1 from '../resources/images/g-3552.png'
import icon2 from '../resources/images/Vector-3549.png'
import icon3 from '../resources/images/icon-3561.png'


import {ref, defineAsyncComponent} from 'vue'

let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

import {onMounted, onUnmounted} from 'vue'

// --- 子组件异步加载 ---

const MonitorStats = defineAsyncComponent(() => import('./components/MonitorStats.vue'))

const MonitorTrend = defineAsyncComponent(() => import('./components/MonitorTrend.vue'))

const MonitorDistribution = defineAsyncComponent(() => import('./components/MonitorDistribution.vue'))

// --- 框架初始化 ---

let runtimeBuilder = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式数据 ---

const timeTabs = ref([
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
])

const activeTimeTab = ref('24h')

const statsData = ref([
  { label: '总流量', value: '12,450', unit: '辆' },
  { label: '客车流量', value: '8,320', unit: '辆' },
  { label: '货车流量', value: '4,130', unit: '辆' }
])

const trendRef = ref(null)

const distributionRef = ref(null)

// --- 事件处理 ---

const handleTabChange = (value) => {
  if (activeTimeTab.value === value) return
  activeTimeTab.value = value
}

// --- 生命周期 ---

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
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