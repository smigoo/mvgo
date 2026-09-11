<template>
  <div class="c-env-monitor-section-chart-container">
    <div class="c-env-monitor-chart-wrapper" ref="chartRef"></div>
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

<style scoped lang="less">
@import '../../resources/styles/index.less';
.section-chart-container {
  width: 100%;
  height: 100%;
}
.chart-wrapper {
width: 100%;
  height: 100%;
  min-height: 0;
}
</style>