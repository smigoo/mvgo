<script setup>
import { onMounted } from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import SectionControls from './components/SectionControls.vue'
import SectionChart from './components/SectionChart.vue'

const { runtimeBuilder } = $mcComponentBuilder()

onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>