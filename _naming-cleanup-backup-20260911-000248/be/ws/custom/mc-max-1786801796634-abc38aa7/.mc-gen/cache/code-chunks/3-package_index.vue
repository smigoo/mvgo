<script setup>
import SummaryStats from './components/SummaryStats.vue'
import FlowTrend from './components/FlowTrend.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import TrafficForecast from './components/TrafficForecast.vue'

let runtimeBuilder = null
let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}
</script>