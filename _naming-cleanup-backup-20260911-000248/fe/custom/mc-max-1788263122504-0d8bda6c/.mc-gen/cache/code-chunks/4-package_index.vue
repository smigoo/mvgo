<script setup>
import { onMounted, onUnmounted } from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyChart from './components/TunnelHourlyChart.vue'
import BridgeHourlyChart from './components/BridgeHourlyChart.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 生命周期 ===
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
