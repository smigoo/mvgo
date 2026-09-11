<script setup>
import { onMounted } from 'vue'
import DailyTotal from './components/DailyTotal.vue'
import TunnelHourlyFlow from './components/TunnelHourlyFlow.vue'
import BridgeHourlyFlow from './components/BridgeHourlyFlow.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 事件发布工具函数 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}
</script>
