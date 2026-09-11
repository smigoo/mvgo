<script setup>
import { onMounted, onUnmounted } from 'vue'
import DailyTotal from './components/DailyTotal.vue'
import TunnelHourlyChart from './components/TunnelHourlyChart.vue'
import BridgeHourlyChart from './components/BridgeHourlyChart.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// $mcComponentBuilder 已在第 1 部分解构，直接使用
const { runtimeBuilder } = $mcComponentBuilder()

// 生命周期钩子
onMounted(() => {
  // 触发组件加载完成事件
  if (runtimeBuilder?.publishEvent) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理工作（如有需要）
})
</script>
