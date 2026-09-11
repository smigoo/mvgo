<template>
  <base-panel class="c-mc-max-1788349718313-24e63b7c" panelKey="default-panel">
    <div class="c-monitor-root">
      <DailyTotalFlow
        class="c-monitor-daily-total-flow"
        :bg1="bg1"
        :icon1="icon1"
        :bg3="bg3"
        :bg5="bg5"
      />
      <TunnelHourlyFlow
        class="c-monitor-tunnel-hourly-flow"
      />
      <BridgeHourlyFlow
        class="c-monitor-bridge-hourly-flow"
      />
      <VehicleTypeDistribution
        class="c-monitor-vehicle-type-section"
        :bg2="bg2"
        :bg4="bg4"
        :icon2="icon2"
      />
      <FlowPrediction
        class="c-monitor-flow-prediction"
        :icon3="icon3"
      />
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-_m-34.png'
import icon1 from '../resources/images/icon-3561.png'
import bg3 from '../resources/images/bg-3475.png'
import bg2 from '../resources/images/bg-_m-36.png'
import bg4 from '../resources/images/bg-_m-35.png'
const bg5 = bg3
const icon2 = icon1
const icon3 = icon1


import {onMounted} from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyFlow from './components/TunnelHourlyFlow.vue'
import BridgeHourlyFlow from './components/BridgeHourlyFlow.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// $mcComponentBuilder 直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
import {onUnmounted} from 'vue'
// 解构 $mcComponentBuilder（只调用一次，声明+赋值一体）
// 生命周期：onMounted 触发 onload 事件
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>