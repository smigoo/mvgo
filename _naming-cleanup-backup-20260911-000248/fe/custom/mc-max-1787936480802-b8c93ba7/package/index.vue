<template>
  <base-panel panelKey="default-panel" :class="['c-monitor-root', componentProps.themeType]" :style="{ ...{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"><img :src="icon2" class="auto-mounted-icon" alt="icon" /><img :src="icon1" class="auto-mounted-icon" alt="icon" />
    <template #header_right>
      <div class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stats">
        <div class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat">
          <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-label">设备类型</span>
          <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat">
          <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-label">设备总数</span>
          <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat">
          <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-label">完好率</span>
          <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-value">98%</span>
        </div>
      </div>
    </template>

    <div class="c-mc-max-1787936480802-b8c93ba7-c-monitor-content">
      <HeaderStats />
      <MainStats />
      <DeviceGrid />
    </div>
  </base-panel>
</template>

<script setup>
import bg2 from '../resources/images/bg-8788.png'
import bg3 from '../resources/images/bg-8807.png'
import icon2 from '../resources/images/icon-8817.png'
import icon1 from '../resources/images/icon-8798.png'


import MainStats from './components/MainStats.vue'
import DeviceGrid from './components/DeviceGrid.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
let componentProps = {}
let businessProps = {}
let runtimeBuilder = null
let componentApi = null

try {
  const builderResult = $mcComponentBuilder()
  componentProps = builderResult.componentProps || {}
  businessProps = builderResult.businessProps || {}
  runtimeBuilder = builderResult.runtimeBuilder || null
  componentApi = builderResult.componentApi || null
} catch (err) {
  console.warn('[设备监测] $mcComponentBuilder 调用失败:', err)
}
// === 触发 onload 事件 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[设备监测] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  try {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-device-monitor',
      timestamp: Date.now()
    })
    console.log('[设备监测] 已触发 monitor-onload 事件')
  } catch (err) {
    console.error('[设备监测] 触发 onload 事件失败:', err)
  }
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理逻辑（如有需要）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>