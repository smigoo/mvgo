<template>
  <base-panel class="c-mc-max-1788268987529-41360397" panelKey="default-panel">
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
import bg1 from '../resources/images/bg-_m-34.png'
import bg2 from '../resources/images/bg-_m-36.png'
import bg4 from '../resources/images/bg-_m-35.png'
import icon2 from '../resources/images/icon-3441.png'
import icon3 from '../resources/images/icon-3573.png'


// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 异步加载子组件（保持既有结构，严禁重排）

const DailyTotalSection = defineAsyncComponent(() => import('./components/DailyTotalSection.vue'))

const VehicleTypeSection = defineAsyncComponent(() => import('./components/VehicleTypeSection.vue'))

const ForecastSection = defineAsyncComponent(() => import('./components/ForecastSection.vue'))

// ========================================

// 第 2/3 部分：生命周期与事件处理

// 注：import / $mcComponentBuilder / ref 等已在第 1 部分定义

// 注：图表初始化逻辑在第 3 部分生成

import {onMounted, onUnmounted} from 'vue'

// 生命周期：组件加载完成

onMounted(() => {
  // 发布组件加载事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// 生命周期：组件卸载清理

onUnmounted(() => {
  // 清理逻辑（如有监听器）由子组件各自处理
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>