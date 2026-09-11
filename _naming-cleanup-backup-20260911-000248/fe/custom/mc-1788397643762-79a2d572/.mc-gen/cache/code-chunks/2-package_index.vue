<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备类型</span>
          <span class="c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value-success">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-body">
      <section-summary-cards />
      <section-main-content />
    </div>
  </base-panel>
</template>

<script setup>
import { onMounted } from 'vue'
import SectionSummaryCards from './components/SectionSummaryCards.vue'
import SectionMainContent from './components/SectionMainContent.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-body {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.c-monitor-header-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-monitor-header-stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-header-stat-label {
  font-size: 14px;
  color: #333333;
  font-weight: 400;
}

.c-monitor-header-stat-value {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.c-monitor-header-stat-value-success {
  font-size: 20px;
  font-weight: 700;
  color: #08a3a5;
}
</style>