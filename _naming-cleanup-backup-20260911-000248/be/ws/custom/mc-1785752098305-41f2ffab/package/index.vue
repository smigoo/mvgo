<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-1785752098305-41f2ffab-root">
      <!-- 1. 当日总流量 -->
      <TotalTraffic @timeChange="onTimeChange" />

      <!-- 2. 江阴靖江长江隧道小时流量 -->
      <HourlyChart title="江阴靖江长江隧道" :chartData="tunnelData[selectedTime]" />

      <!-- 3. 江阴大桥小时流量 -->
      <HourlyChart title="江阴大桥" :chartData="bridgeData[selectedTime]" />

      <!-- 4. 车型分布 -->
      <VehicleDistribution />

      <!-- 5. 流量预测 -->
      <TrafficPrediction :predictData="predictData" />
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'
import TotalTraffic from './components/TotalTraffic.vue'
import HourlyChart from './components/HourlyChart.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import TrafficPrediction from './components/TrafficPrediction.vue'

// Fixed: $mcComponentBuilder 使用 try-catch 包裹
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

// 状态管理
const selectedTime = ref('24小时')

// Mock 数据
const tunnelData = {
  '24小时': { beijing: [100, 200, 300, 400, 500, 600, 500, 400, 300, 200, 100, 50], shanghai: [150, 250, 350, 450, 550, 650, 550, 450, 350, 250, 150, 100] },
  '12小时': { beijing: [100, 200, 300, 400, 500, 600], shanghai: [150, 250, 350, 450, 550, 650] },
  '6小时': { beijing: [100, 200, 300], shanghai: [150, 250, 350] }
}
const bridgeData = {
  '24小时': { beijing: [200, 300, 400, 500, 600, 700, 600, 500, 400, 300, 200, 100], shanghai: [250, 350, 450, 550, 650, 750, 650, 550, 450, 350, 250, 150] },
  '12小时': { beijing: [200, 300, 400, 500, 600, 700], shanghai: [250, 350, 450, 550, 650, 750] },
  '6小时': { beijing: [200, 300, 400], shanghai: [250, 350, 450] }
}
const predictData = {
  tunnel: { actual: [300, 400, 500, 600, 550], predict: [320, 420, 520, 620, 580] },
  bridge: { actual: [400, 500, 600, 700, 650], predict: [420, 520, 620, 720, 680] }
}

const onTimeChange = (val) => {
  selectedTime.value = val
}
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>