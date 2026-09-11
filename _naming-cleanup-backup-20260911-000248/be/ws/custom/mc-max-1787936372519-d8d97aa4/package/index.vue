<template>
  <base-panel panelKey="default-panel">
    <div :class="['c-monitor-root', componentProps.themeType]">
      <!-- 当日总流量：时间下拉 + 江阴靖江长江隧道/江阴大桥双统计卡片 -->
      <DailyTotal class="c-mc-max-1787936372519-d8d97aa4-c-monitor-block c-c-monitor-block-daily" />

      <!-- 江阴靖江长江隧道：小时流量柱状图（北京方向/上海方向） -->
      <TunnelHourlyFlow class="c-mc-max-1787936372519-d8d97aa4-c-monitor-block c-c-monitor-block-tunnel" />

      <!-- 江阴大桥：小时流量柱状图（北京方向/上海方向） -->
      <BridgeHourlyFlow class="c-mc-max-1787936372519-d8d97aa4-c-monitor-block c-c-monitor-block-bridge" />

      <!-- 车型分布：双站点饼图 + 客车/货车统计 -->
      <VehicleDistribution class="c-mc-max-1787936372519-d8d97aa4-c-monitor-block c-c-monitor-block-vehicle" />

      <!-- 流量预测：Tab 切换 + 节假日预测链接 + 面积图 + 准确率时间轴 -->
      <FlowPrediction class="c-mc-max-1787936372519-d8d97aa4-c-monitor-block c-c-monitor-block-prediction" />
    </div>
  </base-panel>
</template>

<script setup>
// === 子组件导入 ===

import DailyTotal from './components/DailyTotal.vue'

import TunnelHourlyFlow from './components/TunnelHourlyFlow.vue'

import BridgeHourlyFlow from './components/BridgeHourlyFlow.vue'

import VehicleDistribution from './components/VehicleDistribution.vue'

import FlowPrediction from './components/FlowPrediction.vue'

// === 微码组件初始化（只能调用一次） ===

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// ============================================================

// 第 2/3 部分：生命周期与事件处理

// === 生命周期钩子 ===

onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 主组件无需清理（子组件各自清理图表和监听器）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>