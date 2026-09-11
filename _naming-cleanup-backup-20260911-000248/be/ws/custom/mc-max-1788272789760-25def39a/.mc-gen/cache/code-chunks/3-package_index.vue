<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import CategoryTabs from './components/CategoryTabs.vue'
import DeviceGrid from './components/DeviceGrid.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})
</script>