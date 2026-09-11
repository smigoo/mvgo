<template>
  <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stats" :style="headerStatsStyle">
    <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stat-group" :style="{ background: '#f53f3f' }">
      <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stat-label">设备类型</span>
      <span class="c-monitor-header-stat-value c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stat-value--blue">28</span>
    </div>
    <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stat-group" :style="{ backgroundImage: `url(${bg9})`, backgroundSize: '117px 64px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stat-label">设备总数</span>
      <span class="c-monitor-header-stat-value c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stat-value--blue">68562</span>
    </div>
    <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stat-group" :style="{ backgroundImage: `url(${bg10})`, backgroundSize: '117px 64px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stat-label">完好率</span>
      <span class="c-monitor-header-stat-value c-mc-max-1787812418444-fd7e9caf-c-monitor-header-stat-value--teal">98%</span>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-8788.png'

import { computed} from 'vue'

// 顶部统计栏背景（bg-8788.png，Figma backgroundBlock）
const headerStatsStyle = computed(() => ({
  backgroundImage: `url(${bg2})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat'
}))
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {  width: 100%;

  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20px;
  height: 100%;
  box-sizing: border-box;
}

.c-monitor-header-stat-group {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-header-stat-label {
  font-family: 'Source Han Sans CN', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: rgba(51, 51, 51, 1);
}

.c-monitor-header-stat-value {
  font-family: 'Roboto', 'DIN Alternate', sans-serif;
  font-size: 16px;
  font-weight: bold;
  line-height: 21px;
  white-space: nowrap;
}

.c-monitor-header-stat-value--blue {
  color: rgba(25, 144, 255, 1);
}

.c-monitor-header-stat-value--teal {
  color: rgba(8, 163, 165, 1);
}
</style>