<template>
  <!-- 图表区域组件：包含图表元信息（监测点位标识+预警线标注）和面积图 -->
  <div class="chart-area-root">
    <!-- 图表元信息行：左侧监测点位标识 + 右侧预警线标注 -->
    <ChartMeta :activeTab="activeTab" />

    <!-- 面积图组件：ECharts渲染CO浓度趋势 -->
<AreaChart v-if="activeViewMode === 'chart'" :chartData="chartData" :activeTab="activeTab" />

    <!-- 列表视图占位（列表视图具体格式未知，不臆造，仅做简单占位） -->
    <div v-else class="chart-area-list-placeholder">
      <span class="placeholder-text">列表视图</span>
    </div>
  </div>
</template>

<script setup>
// 图表区域组件：承载图表元信息行和面积图，根据视图模式切换图表/列表
import ChartMeta from './ChartMeta.vue'
import AreaChart from './AreaChart.vue'

// #region 1. Props定义
const props = defineProps({ // 当前激活的tab索引（0=一氧化碳，1=能见度，2=洞内照明，3=洞外光强） activeTab: { type: Number, default: 0 }, // 当前视图模式：'chart' | 'list'
  activeViewMode: { type: String, default: 'chart' },
  // 图表数据（时间+浓度值数组，来自父组件传递）
  chartData: { type: Array, default: () => [] }
})
// #endregion
</script>

<style lang="less" scoped>
@color-text-secondary: #333333;

@import '../../resources/styles/index.less';

// 图表区域根容器：纵向弹性布局，填充剩余空间
// Figma chart-area section 布局: VERTICAL
.chart-area-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  // 图表区域背景图（slot-con 区域背景）
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

// 列表视图占位（doNotInvent：列表视图具体格式未知）
.chart-area-list-placeholder {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  font-size: 12px;
  color: @color-text-secondary;
}
</style>