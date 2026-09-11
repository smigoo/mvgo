<script setup>
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyChart from './components/TunnelHourlyChart.vue'
import BridgeHourlyChart from './components/BridgeHourlyChart.vue'
import VehicleDistribution from './components/VehicleDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
</script>