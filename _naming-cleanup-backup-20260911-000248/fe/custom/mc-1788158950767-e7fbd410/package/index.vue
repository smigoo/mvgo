<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-env-monitor-verify-r7-c-env-monitor-root">
      <!-- 指标切换tabs区域 -->
      <TabSwitch />
      
      <!-- 统计指标区域 -->
      <StatsIndicator />
      
      <!-- 面积图区域 -->
      <ChartArea />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import TabSwitch from './components/TabSwitch.vue'
import StatsIndicator from './components/StatsIndicator.vue'
import ChartArea from './components/ChartArea.vue'

// $mcComponentBuilder 只能调用一次，直接解构（声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>