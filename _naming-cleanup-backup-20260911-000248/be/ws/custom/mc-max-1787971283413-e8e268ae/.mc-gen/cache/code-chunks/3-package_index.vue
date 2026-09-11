<script setup>
import { onMounted } from 'vue'

// 子组件引入
import DailyTotal from './components/DailyTotal.vue'
import TunnelFlowChart from './components/TunnelFlowChart.vue'
import BridgeFlowChart from './components/BridgeFlowChart.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// $mcComponentBuilder 调用（仅此一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
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
