<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-monitor-root" 
      :style="{ 
        backgroundImage: `url(${bg1})`, 
        backgroundSize: '100% 100%', 
        backgroundRepeat: 'no-repeat' 
      }"
    >
      <!-- 顶部核心指标统计区 -->
      <div class="c-monitor-stats-section">
        <TotalStats 
          :stat-icons="[icon1, icon2, icon3, icon4]" 
        />
      </div>

      <!-- 中部流量趋势分析区 -->
      <div class="c-monitor-trend-section">
        <FlowTrend />
      </div>

      <!-- 车型分布区 -->
      <div class="c-monitor-distribution-section">
        <VehicleDistribution />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-_m-34.png'
import icon1 from '../resources/images/g-3552.png'
import icon2 from '../resources/images/Vector-3549.png'
import icon3 from '../resources/images/icon-3561.png'
import icon4 from '../resources/images/icon-3441.png'


// --- 框架初始化 ---

let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

import {onMounted, onUnmounted} from 'vue'

import TotalStats from './components/TotalStats.vue'

import FlowTrend from './components/FlowTrend.vue'

import VehicleDistribution from './components/VehicleDistribution.vue'

let runtimeBuilder = null

let componentId = 'monitor'

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentId = builder?.componentId || 'monitor'
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const emitLoadEvent = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent(`${componentId}-onload`, {
      componentId,
      timestamp: Date.now()
    })
  }
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 组件卸载时的清理逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>