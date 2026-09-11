<script setup>
import { onMounted } from 'vue'
import SectionDailyTotal from './components/SectionDailyTotal.vue'
import SectionTunnelChart from './components/SectionTunnelChart.vue'
import SectionBridgeChart from './components/SectionBridgeChart.vue'
import SectionVehicleType from './components/SectionVehicleType.vue'
import SectionForecast from './components/SectionForecast.vue'

// 一次调用 $mcComponentBuilder 并直接解构，禁止重复调用
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件加载完成事件发布函数（后续在 onMounted 中调用）
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}
</script>