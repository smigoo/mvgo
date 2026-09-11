<template>
  <div class="env-monitor-container">
    <div class="header">
      <h3 class="title">环境监测</h3>
    </div>
    <div class="content">
      <div class="monitor-item">
        <span class="label">温度</span>
        <span class="value">25°C</span>
      </div>
      <div class="monitor-item">
        <span class="label">湿度</span>
        <span class="value">60%</span>
      </div>
      <div class="monitor-item">
        <span class="label">PM2.5</span>
        <span class="value">35</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder();

onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  });
});
</script>

<style scoped>
.env-monitor-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color, #f5f5f5);
  color: var(--text-color, #333);
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.header {
  margin-bottom: 16px;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: var(--title-color, #333);
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.monitor-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--card-bg, #fff);
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.label {
  font-size: 14px;
  color: var(--label-color, #666);
}

.value {
  font-size: 16px;
  font-weight: bold;
  color: var(--value-color, #1890ff);
}
</style>