<script setup>
import { onMounted } from 'vue'
import TotalFlow from './components/TotalFlow.vue'
import ChartTunnel from './components/ChartTunnel.vue'
import ChartBridge from './components/ChartBridge.vue'
import VehicleType from './components/VehicleType.vue'
import Prediction from './components/Prediction.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
</script>