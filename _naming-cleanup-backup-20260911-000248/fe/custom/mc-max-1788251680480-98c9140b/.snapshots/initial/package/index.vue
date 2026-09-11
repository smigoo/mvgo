<template>
  <base-panel class="c-mc-max-1788251680480-98c9140b" panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- 监测类型切换 + 右侧控件组 -->
      <div class="c-env-monitor-header">
        <MonitorTypeTabs />
        <HeaderControls />
      </div>

      <!-- 折线图表区 -->
      <div class="c-env-monitor-chart-section">
        <ChartArea />
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import MonitorTypeTabs from './components/MonitorTypeTabs.vue'
import HeaderControls from './components/HeaderControls.vue'
import ChartArea from './components/ChartArea.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === onload 事件触发 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 主组件清理逻辑（子组件各自处理自己的清理）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>