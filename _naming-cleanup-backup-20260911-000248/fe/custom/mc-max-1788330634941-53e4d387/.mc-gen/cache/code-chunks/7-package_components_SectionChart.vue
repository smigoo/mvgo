<template>
  <div class="section-chart-container">
    <div class="chart-wrapper" ref="chartRef"></div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const chartRef = ref(null)

onMounted(() => {
  runtimeBuilder.publishEvent('SectionChart-onload', {
    status: 'success',
    message: 'SectionChart loaded'
  })
})
</script>

<style scoped>
.section-chart-container {
  width: 100%;
  height: 100%;
}
.chart-wrapper {
  width: 100%;
  height: 100%;
}
</style>