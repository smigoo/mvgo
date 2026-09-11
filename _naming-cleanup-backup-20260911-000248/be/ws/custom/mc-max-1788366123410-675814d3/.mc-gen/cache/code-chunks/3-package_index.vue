<script setup>
import { onMounted } from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyFlow from './components/TunnelHourlyFlow.vue'
import BridgeHourlyFlow from './components/BridgeHourlyFlow.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>
