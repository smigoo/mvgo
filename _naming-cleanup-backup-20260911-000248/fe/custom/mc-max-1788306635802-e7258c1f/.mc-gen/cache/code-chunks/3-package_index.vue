<script setup>
import { ref, onMounted } from 'vue'
import DailyTotal from './components/DailyTotal.vue'
import TunnelFlowChart from './components/TunnelFlowChart.vue'
import BridgeFlowChart from './components/BridgeFlowChart.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 主组件状态（index.vue 不管理图表状态，已拆分至子组件） ===
// 本组件仅负责子组件组合与事件发布
// === 生命周期 ===
onMounted(() => {
  // 发布组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})
</script>