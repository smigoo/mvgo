<template>
  <div
    class="c-monitor-top-stats"
    :style="{
      backgroundImage: `url(${bg2})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }"
  >
    <div
      v-for="item in statItems"
      :key="item.label"
      class="c-monitor-stat-group"
    >
      <span class="c-monitor-stat-label">{{ item.label }}</span>
      <span :class="['c-monitor-stat-value', item.theme === 'success' ? 'c-monitor-stat-value--success' : '']">{{ item.value }}</span>
    </div>
  </div>
</template>

<script setup>
// 顶部统计数据（设备类型 / 设备总数 / 完好率）
const statItems = [
  { label: '设备类型', value: '28', theme: 'primary' },
  { label: '设备总数', value: '68562', theme: 'primary' },
  { label: '完好率', value: '98%', theme: 'success' }
]
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-top-stats {
  width: 100%;
  height: 30px;
  min-height: 0;
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  overflow: hidden;
}

.c-monitor-stat-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.c-monitor-stat-label {
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  line-height: 21px;
  color: rgba(51, 51, 51, 1);
  white-space: nowrap;
}

.c-monitor-stat-value {
  font-family: 'Roboto', 'Noto Sans SC', sans-serif;
  font-size: 20px;
  font-weight: 700;
  line-height: 23.4375px;
  color: rgba(25, 144, 255, 1);
  white-space: nowrap;
}

.c-monitor-stat-value--success {
  color: rgba(8, 163, 165, 1);
}
</style>