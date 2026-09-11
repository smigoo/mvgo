<script setup>
import { onMounted } from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import TabsTools from './components/TabsTools.vue'
import ConcentrationChart from './components/ConcentrationChart.vue'

// 唯一标准写法：直接解构，声明+赋值一体，只能调用一次
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>