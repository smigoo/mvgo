<script setup>
import { onMounted, onUnmounted } from 'vue'
import SectionDailyTotal from './components/SectionDailyTotal.vue'
import SectionChartTunnel from './components/SectionChartTunnel.vue'
import SectionChartBridge from './components/SectionChartBridge.vue'
import SectionVehicleType from './components/SectionVehicleType.vue'
import SectionForecast from './components/SectionForecast.vue'

// 已在第1部分声明，此处直接引用
// const { runtimeBuilder, componentProps, businessProps, componentApi } = $mcComponentBuilder()

// 触发组件加载事件
const emitLoadEvent = () => {
  if (runtimeBuilder?.publishEvent) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }
}

// 生命周期
onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 组件卸载清理（子组件各自清理图表实例）
})
</script>