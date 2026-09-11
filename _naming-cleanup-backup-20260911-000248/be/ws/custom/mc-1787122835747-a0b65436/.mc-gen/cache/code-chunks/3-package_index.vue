<script setup>
import { onMounted } from 'vue'
import TotalTraffic from './components/TotalTraffic.vue'
import HourlyFlowChart from './components/HourlyFlowChart.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowForecast from './components/FlowForecast.vue'

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 初始化失败:', e)
}

const emitLoadEvent = () => {
  runtimeBuilder?.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}
</script>