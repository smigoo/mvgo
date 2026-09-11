<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import SummaryCards from './components/SummaryCards.vue'
import Nav from './components/Nav.vue'
import DeviceListArea from './components/DeviceListArea.vue'

const { runtimeBuilder } = $mcComponentBuilder()

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>