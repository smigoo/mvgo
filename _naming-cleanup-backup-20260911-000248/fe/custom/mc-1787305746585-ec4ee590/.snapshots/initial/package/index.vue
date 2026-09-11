<template>
  <base-panel panelKey="default-panel">
    <div :class="['c-monitor-root', theme]">
      <!-- 区块一：当日总流量（统计卡片 + 两条流量图） -->
      <TotalTraffic class="c-monitor-section" />
      <!-- 区块二：车型分布（隧道/大桥车型对比） -->
      <VehicleType class="c-monitor-section" />
      <!-- 区块三：流量预测（预测趋势图） -->
      <FlowForecast class="c-monitor-section" />
    </div>
  </base-panel>
</template>

<script setup>
import {defineAsyncComponent, computed, provide} from 'vue'

// === 异步加载子组件 ===

const TotalTraffic = defineAsyncComponent(() => import('./components/TotalTraffic.vue'))

const VehicleType = defineAsyncComponent(() => import('./components/VehicleType.vue'))

const FlowForecast = defineAsyncComponent(() => import('./components/FlowForecast.vue'))

// === $mcComponentBuilder 初始化 ===

let componentProps = {}

let businessProps = {}

let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi || null
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

// === 提供给子组件 ===

if (componentApi) {
  provide('componentApi', componentApi)
}

provide('businessProps', businessProps)

// === 响应式状态 ===

const theme = computed(() => componentProps?.themeType || 'light')

// ==================== 运行时初始化（$mcComponentBuilder） ====================

let runtimeBuilder = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder({
    componentId: 'monitor',
    componentProps: typeof componentProps !== 'undefined' ? componentProps : {},
    componentName: 'monitor'
  }) : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e)
}

// ==================== 生命周期 ====================

onMounted(() => {
  // 通知框架：组件已完成挂载
  runtimeBuilder?.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 清理轮询定时器 / 全局监听（如有）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>