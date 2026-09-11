<script setup>
import { onMounted, onUnmounted } from 'vue'
import DailyTotal from './components/DailyTotal.vue'
import HourlyFlowTunnel from './components/HourlyFlowTunnel.vue'
import HourlyFlowBridge from './components/HourlyFlowBridge.vue'
import VehicleType from './components/VehicleType.vue'
import FlowForecast from './components/FlowForecast.vue'

// $mcComponentBuilder 解构（只调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>