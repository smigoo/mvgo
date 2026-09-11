<script setup>
import { onMounted, defineAsyncComponent } from 'vue'

// 子组件异步导入
const DailyTotalFlow = defineAsyncComponent(() => import('./components/DailyTotalFlow.vue'))
const HourlyFlowTunnel = defineAsyncComponent(() => import('./components/HourlyFlowTunnel.vue'))
const HourlyFlowBridge = defineAsyncComponent(() => import('./components/HourlyFlowBridge.vue'))
const VehicleTypeDistribution = defineAsyncComponent(() => import('./components/VehicleTypeDistribution.vue'))
const FlowPrediction = defineAsyncComponent(() => import('./components/FlowPrediction.vue'))

// $mcComponentBuilder 调用（仅此一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发 onload 事件的函数（在 onMounted 中调用）
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}
</script>
