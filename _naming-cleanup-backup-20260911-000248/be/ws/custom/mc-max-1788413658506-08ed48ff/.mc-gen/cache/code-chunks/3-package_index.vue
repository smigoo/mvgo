<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import SummaryCards from './components/SummaryCards.vue'
import MainContent from './components/MainContent.vue'

// 唯一调用 $mcComponentBuilder，直接解构
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>