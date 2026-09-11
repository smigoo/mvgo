<template>
  <base-panel class="c-mc-max-1788269160608-33ca8d5e" panelKey="default-panel">
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat" :style="{ backgroundImage: 'url(' + bg9 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <span class="c-monitor-header-stat-label" :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">设备类型</span>
          <span class="c-monitor-header-stat-value" :style="{ backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">28</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-root">
      <HeaderStats />
      <StatusBadges />
      <DeviceGrid />
    </div>
  </base-panel>
</template>

<script setup>
import bg9 from '../resources/images/bg-8614.png'
import bg5 from '../resources/images/bg-8498.png'
import bg6 from '../resources/images/bg-8527.png'


import HeaderStats from './components/HeaderStats.vue'
import StatusBadges from './components/StatusBadges.vue'
import DeviceGrid from './components/DeviceGrid.vue'

// 微码组件构建器：只能调用一次，直接解构（声明+赋值一体，避免 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件加载完成事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
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