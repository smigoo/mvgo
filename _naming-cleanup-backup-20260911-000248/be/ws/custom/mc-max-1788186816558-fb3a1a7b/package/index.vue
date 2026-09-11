<template>
  <base-panel panelKey="default-panel">
    <div class="c-流量监测-复杂-多图表-c-monitor-root">
      <!-- 当日总流量 -->

      <!-- 江阴靖江长江隧道小时流量 -->

      <!-- 江阴大桥小时流量 -->

      <!-- 车型分布 -->

      <!-- 流量预测 -->
    </div>
  </base-panel>

    <img :src="icon1" style="display:none" alt="" />
</template>

<script setup>
import icon1 from '../resources/images/icon-3561.png'

import {onMounted} from 'vue'

// $mcComponentBuilder 调用（只调用一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// onMounted 中触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})

// ===== 生命周期 =====
// 组件挂载完成：发布 onload 事件（微码框架约定）
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 组件卸载：主组件无独立监听器与图表资源需要清理
// 各图表子组件（TunnelHourlyChart / BridgeHourlyChart / FlowPrediction 等）在各自的 onUnmounted 中释放 echarts 实例与 ResizeObserver
onUnmounted(() => {
  // 无清理逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>