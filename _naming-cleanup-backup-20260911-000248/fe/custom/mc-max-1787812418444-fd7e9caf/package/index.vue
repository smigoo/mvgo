<template>
  <base-panel class="c-mc-max-1787812418444-fd7e9caf" panelKey="default-panel">
    <!-- 头部右侧：设备统计指标（设备类型 / 设备总数 / 完好率） -->
    <template #header_right>
      <HeaderStats />
    </template>

    <!-- 内容区 -->
    <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-root">
      <!-- 主要设备统计卡片：隧道设备 / 南北接线设备 -->
      <SummaryCards />

      <!-- 设备列表区：左侧分类导航 + 右侧设备网格 -->
      <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-device-area">
        <SidebarNav />
        <DeviceListArea />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
// 子组件引入（与 template 中引用保持一致）
import HeaderStats from './components/HeaderStats.vue'
import SummaryCards from './components/SummaryCards.vue'
import SidebarNav from './components/SidebarNav.vue'
import DeviceListArea from './components/DeviceListArea.vue'

// 微码组件构建器：一次调用并直接解构（声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
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