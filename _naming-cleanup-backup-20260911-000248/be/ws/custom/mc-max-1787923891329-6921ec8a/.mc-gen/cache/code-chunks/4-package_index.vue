<script setup>
import { onMounted, onUnmounted } from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyChart from './components/TunnelHourlyChart.vue'
import BridgeHourlyChart from './components/BridgeHourlyChart.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// === 生命周期钩子 ===
onMounted(() => {
  // 发布组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 清理逻辑（如有需要）
})
</script>