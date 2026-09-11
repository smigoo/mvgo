<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root">
      <!-- 当日总流量及趋势 -->
      <DailyTotalSection 
        :bg-stats="bg1"
        class="c-monitor-section c-monitor-daily-total"
      />

      <!-- 车型分布 -->
      <VehicleTypeSection 
        :bg-tunnel="bg2"
        :bg-bridge="bg4"
        :icon-title="icon2"
        class="c-monitor-section c-monitor-vehicle-type"
      />

      <!-- 流量预测 -->
      <ForecastSection 
        :icon-title="icon3"
        class="c-monitor-section c-monitor-forecast"
      />
    </div>
  </base-panel>
</template>

<script setup>
import { defineAsyncComponent } from 'vue'

// $mcComponentBuilder 初始化（直接解构，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 异步加载子组件
const DailyTotalSection = defineAsyncComponent(() => import('./components/DailyTotalSection.vue'))
const VehicleTypeSection = defineAsyncComponent(() => import('./components/VehicleTypeSection.vue'))
const ForecastSection = defineAsyncComponent(() => import('./components/ForecastSection.vue'))
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
