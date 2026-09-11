<script setup>
import { onMounted, onUnmounted } from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyFlow from './components/TunnelHourlyFlow.vue'
import BridgeHourlyFlow from './components/BridgeHourlyFlow.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// 解构 $mcComponentBuilder（只调用一次，声明+赋值一体）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 生命周期：onMounted 触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>