<script setup>
import { onMounted } from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import HourlyFlowTunnel from './components/HourlyFlowTunnel.vue'
import HourlyFlowBridge from './components/HourlyFlowBridge.vue'
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
</script>