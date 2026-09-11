<template>
  <div class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stats">
    <div class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat">
      <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-label">设备类型</span>
      <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-value">28</span>
    </div>
    <div class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat">
      <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-label">设备总数</span>
      <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-value">68562</span>
    </div>
    <div class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat">
      <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-label">完好率</span>
      <span class="c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-value c-mc-max-1787936480802-b8c93ba7-c-monitor-header-stat-value--success">98%</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// 统计数据
const stats = ref([
  { label: '设备类型', value: '28', type: 'normal' },
  { label: '设备总数', value: '68562', type: 'normal' },
  { label: '完好率', value: '98%', type: 'success' }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
height: 100%;
  width: 100%;

  display: flex;
  align-items: center;
  gap: 24px;
}

.c-monitor-header-stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-header-stat-label {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

.c-monitor-header-stat-value {
  font-family: Roboto, sans-serif;
  font-size: 20px;
  font-weight: 700;
  line-height: 23.44px;
  background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  
  &--success {
    color: #08a3a5;
    background: none;
    -webkit-text-fill-color: #08a3a5;
  }
}
</style>