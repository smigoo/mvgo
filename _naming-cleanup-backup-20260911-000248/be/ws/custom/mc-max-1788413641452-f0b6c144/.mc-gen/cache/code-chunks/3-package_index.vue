<script setup>
import { onMounted, defineAsyncComponent } from 'vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 子组件异步导入 ===
const DailyTotal = defineAsyncComponent(() => import('./components/DailyTotal.vue'))
const HourlyFlowTunnel = defineAsyncComponent(() => import('./components/HourlyFlowTunnel.vue'))
const HourlyFlowBridge = defineAsyncComponent(() => import('./components/HourlyFlowBridge.vue'))
const VehicleType = defineAsyncComponent(() => import('./components/VehicleType.vue'))
const FlowForecast = defineAsyncComponent(() => import('./components/FlowForecast.vue'))
// === 生命周期：触发 onload 事件 ===
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>