<template>
  <base-panel panelKey="default-panel">
      <template #header-right>
        <!-- 由生成器按 Figma headerSlots 确定性补齐（模型漏生成兜底） -->
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">设备类型 28</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">设备总数 68562</span>
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:16px;font-size: calc(@fontSize * 0.9286);line-height:1;white-space:nowrap;">完好率 98%</span>
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
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-header-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1.43);
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