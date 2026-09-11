<template>
  <!-- 图表元信息行：左侧监测点位标识（绿色色块+标签文字）+ 右侧预警线标注（红色文字） -->
  <div class="chart-meta-root">
    <!-- 左侧：监测点位标识，绿色矩形色块 + 标签文字 -->
    <div class="chart-meta-legend">
      <div class="chart-meta-legend-block"></div>
      <span class="chart-meta-legend-label">{{ metaLabel }}</span>
    </div>

    <!-- 右侧：预警线标注（红色文字） -->
    <div class="chart-meta-warning">
      <span class="chart-meta-warning-label">预警线</span>
    </div>
  </div>
</template>

<script setup>
// 图表元信息组件：显示当前监测指标的点位标识和预警线标注
// 根据activeTab切换对应的标签文字
import { computed } from 'vue'

// #region 1. Props定义
const props = defineProps({ // 当前激活的tab索引，用于切换元信息标签 activeTab: { type: Number, default: 0 }
})
// #endregion

// #region 2. 计算属性

// 各tab对应的监测点位标签（Figma标注：zk3+785CO浓度，tab切换时对应指标不同）
const tabMetaLabels = ref(['zk3+785CO浓度', '能见度监测', '洞内照明监测', '洞外光强监测'])

// 当前显示的元信息标签（根据tab索引派生）
const metaLabel = computed(() => { return tabMetaLabels[props.activeTab] || tabMetaLabels[0]
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 图表元信息行：横向排列，左右分布
// Figma chart-meta 布局: HORIZONTAL
.chart-meta-root {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 4px 20px;
  flex-shrink: 0;
}

// 左侧监测点位标识区：色块 + 文字横向排列
.chart-meta-legend {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

// 绿色矩形色块（Figma Group 1321318245 内 Rectangle 346241398：14×2px，绿色）
.chart-meta-legend-block {
  width: 14px;
  height: 2px;
  background: rgba(15, 205, 125, 1);
  border-radius: 1px;
  flex-shrink: 0;
}

// 监测点位标签文字（Figma zk3+785CO浓度：9.6px，左对齐）
.chart-meta-legend-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 9.6px;
  font-weight: 400;
  line-height: 14.4px;
  color: #666666;
}

// 右侧预警线标注（Figma 预警线：12px，红色 #d32f2f）
.chart-meta-warning {
  display: flex;
  align-items: center;
}

.chart-meta-warning-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 21.6px;
  color: #d32f2f;
}
</style>