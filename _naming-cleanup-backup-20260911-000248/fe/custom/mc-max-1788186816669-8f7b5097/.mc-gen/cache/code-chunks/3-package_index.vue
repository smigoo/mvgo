<script setup>
import { onMounted } from 'vue'
import DailyTotal from './components/DailyTotal.vue'
import TunnelHourly from './components/TunnelHourly.vue'
import BridgeHourly from './components/BridgeHourly.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// $mcComponentBuilder 调用（仅一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})
</script>
