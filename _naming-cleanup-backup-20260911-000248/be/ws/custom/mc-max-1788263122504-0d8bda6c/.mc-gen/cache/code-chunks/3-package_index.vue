<script setup>
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyChart from './components/TunnelHourlyChart.vue'
import BridgeHourlyChart from './components/BridgeHourlyChart.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
</script>