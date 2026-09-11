<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-monitor-title-dot"></div>
    </template>
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备类型</span>
          <span class="c-monitor-header-stat-value c-monitor-header-stat-value--primary">28</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value c-monitor-header-stat-value--primary">68562</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value c-monitor-header-stat-value--success">98%</span>
        </div>
      </div>
    </template>

    <section-main />
  </base-panel>
</template>

<script setup>
import { onMounted, defineAsyncComponent } from 'vue'

const SectionMain = defineAsyncComponent(() => import('./components/SectionMain.vue'))

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-monitor-title-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
  flex-shrink: 0;
}

.c-monitor-header-stats {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.c-monitor-header-stat {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-monitor-header-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-header-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.43);
  font-weight: 700;
  line-height: 23px;

  &--primary {
    color: #1990ff;
  }

  &--success {
    color: #08a3a5;
  }
}
</style>