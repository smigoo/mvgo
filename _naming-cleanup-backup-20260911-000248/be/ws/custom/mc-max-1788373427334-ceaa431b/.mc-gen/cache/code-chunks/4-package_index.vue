<script setup>
import { onMounted, onUnmounted } from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import HourlyFlowTunnel from './components/HourlyFlowTunnel.vue'
import HourlyFlowBridge from './components/HourlyFlowBridge.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 组件加载完成事件 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[流量监测] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}
// === 生命周期 ===
onMounted(() => {
  // 触发组件加载完成事件
  emitLoadEvent()
})

onUnmounted(() => {
  // 主组件清理（子组件各自管理自身生命周期）
})
</script>
