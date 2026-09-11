<template>
  <base-panel class="c-mc-max-1788280167414-49dfbe7d" panelKey="default-panel">
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat-item">
          <span class="c-monitor-header-stat-label" :style="{ backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">设备类型</span>
          <span class="c-monitor-header-stat-value" :style="{ backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">28</span>
        </div>
        <div class="c-monitor-header-stat-item">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-monitor-header-stat-item">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-root">
      <StatsHeader />
      
      <div class="c-monitor-main-layout">
        <CategoryNav />
        <DeviceGrid />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg11 from '../resources/images/bg-8672.png'
import bg6 from '../resources/images/bg-8527.png'
import bg7 from '../resources/images/bg-8556.png'


import StatsHeader from './components/StatsHeader.vue'
import CategoryNav from './components/CategoryNav.vue'
import DeviceGrid from './components/DeviceGrid.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 组件加载事件触发 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[cp-设备监测] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}
// === 生命周期钩子 ===
onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 预留清理逻辑位置
})

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 主组件无额外需要清理的资源
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>