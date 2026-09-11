<script setup>
import { onMounted, onUnmounted } from 'vue'
import SectionDailyTotal from './components/SectionDailyTotal.vue'
import SectionChartTunnel from './components/SectionChartTunnel.vue'
import SectionChartBridge from './components/SectionChartBridge.vue'
import SectionVehicleType from './components/SectionVehicleType.vue'
import SectionForecast from './components/SectionForecast.vue'

// $mcComponentBuilder 调用（仅一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件加载完成事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理逻辑（如需）
})
</script>