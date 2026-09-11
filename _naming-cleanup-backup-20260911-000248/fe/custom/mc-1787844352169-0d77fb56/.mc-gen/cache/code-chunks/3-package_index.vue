<script setup>
import { onMounted } from 'vue'
import TotalTraffic from './components/TotalTraffic.vue'
import HourlyTunnelFlow from './components/HourlyTunnelFlow.vue'
import HourlyBridgeFlow from './components/HourlyBridgeFlow.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import TrafficPrediction from './components/TrafficPrediction.vue'

// 1. 一次调用 $mcComponentBuilder 并直接解构（const 解构=声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 在 onMounted 中触发 onload 事件（框架强制要求）
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})
</script>