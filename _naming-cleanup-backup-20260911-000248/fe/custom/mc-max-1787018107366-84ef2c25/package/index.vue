<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 顶部设备统计概览 -->
      <DeviceStats />
      
      <!-- 下方主体内容区 -->
      <div class="c-monitor-main">
        <!-- 左侧：设备状态分布 -->
        <div class="c-monitor-status-panel">
          <div class="c-monitor-panel-header">
            <span class="c-monitor-panel-title">设备状态分布</span>
          </div>
          <div class="c-monitor-chart-wrapper">
            <DeviceStatusChart />
          </div>
        </div>
        
        <!-- 右侧：设备明细列表 -->
        <div class="c-monitor-detail-panel">
          <div class="c-monitor-panel-header">
            <span class="c-monitor-panel-title">设备运行明细</span>
          </div>
          <div class="c-monitor-list-wrapper">
            <DeviceList />
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { provide, onMounted } from 'vue'
import DeviceStats from './components/DeviceStats.vue'
import DeviceStatusChart from './components/DeviceStatusChart.vue'
import DeviceList from './components/DeviceList.vue'

let runtimeBuilder = null
let businessProps = null
let componentApi = null
let componentProps = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  if (builder) {
    runtimeBuilder = builder.runtimeBuilder || null
    businessProps = builder.businessProps || {}
    componentApi = builder.componentApi || null
    componentProps = builder.componentProps || {}
  }
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
  runtimeBuilder = null
  businessProps = {}
  componentApi = null
  componentProps = {}
}

// 向子组件注入依赖
if (componentApi) provide('componentApi', componentApi)
if (businessProps) provide('businessProps', businessProps)
if (componentProps) provide('componentProps', componentProps)
if (runtimeBuilder) provide('runtimeBuilder', runtimeBuilder)

const emitLoadEvent = () => {
  if (!runtimeBuilder) {
    console.warn('[c-monitor] runtimeBuilder 不可用，无法发布 onload 事件')
    return
  }
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>