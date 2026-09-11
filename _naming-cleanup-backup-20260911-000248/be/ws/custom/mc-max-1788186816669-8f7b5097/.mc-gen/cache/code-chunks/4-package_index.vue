<script setup>
import { onMounted } from 'vue'
import DailyTotal from './components/DailyTotal.vue'
import TunnelHourly from './components/TunnelHourly.vue'
import BridgeHourly from './components/BridgeHourly.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

// 获取微码组件构建器实例（只调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 发布组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>
