<template>
  <div class="c-monitor-header-stats">
    <div
      v-for="stat in stats"
      :key="stat.key"
      class="c-monitor-stat-item"
      :style="stat.bgStyle"
    >
      <span class="c-monitor-stat-label">{{ stat.label }}</span>
      <span class="c-monitor-stat-value" :style="{ color: stat.valueColor }">{{ stat.value }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

// 统计数据
const stats = ref([
  {
    key: 'deviceType',
    label: '设备类型',
    value: '28',
    valueColor: 'rgba(25,144,255,1)',
    bgStyle: {
      backgroundImage: `url(${bg1})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }
  },
  {
    key: 'deviceTotal',
    label: '设备总数',
    value: '68562',
    valueColor: 'rgba(25,144,255,1)',
    bgStyle: {
      backgroundImage: `url(${bg1})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }
  },
  {
    key: 'goodRate',
    label: '完好率',
    value: '98%',
    valueColor: 'rgba(8,163,165,1)',
    bgStyle: {
      backgroundImage: `url(${bg1})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }
  }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

.c-monitor-stat-label {
  font-size: calc(@fontSize * 0.857);
  color: rgba(51,51,51,1);
  font-weight: normal;
  line-height: 1.5;
  white-space: nowrap;
}

.c-monitor-stat-value {
  font-size: calc(@fontSize * 1.429);
  font-weight: 700;
  line-height: 1.17;
  white-space: nowrap;
}
</style>
