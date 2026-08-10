<template>
  <div class="mv-1785691963555-bec4826c">
    <!-- 标题区 -->
    <div class="header">
      <img :src="icon1" class="header-decor" alt="decor" />
      <div class="header-title">环境监测</div>
    </div>

    <!-- Tab 切换与工具栏 -->
    <div class="tab-bar">
      <div class="tabs-list">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.value"
          :class="['tab-item', { active: activeTabIndex === index }]"
          @click="activeTabIndex = index"
        >
          {{ tab.name }}
        </div>
      </div>
      <div class="toolbar">
        <img :src="icontabsIcon" class="view-switch-icon" alt="view-switch" @click="handleViewSwitch" />
        <div class="badge">6</div>
      </div>
    </div>

    <!-- 监测数据图表 -->
    <div class="chart-area">
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import icon1 from './resources/images/g-7883.png'
import icontabsIcon from './resources/images/tabs-icon-43.png'

/**
 * 环境监测面板组件
 * 包含标题、Tab切换栏（一氧化碳等）、右上角视图切换图标及Badge、CO浓度趋势图表（含预警线）。
 * 支持 Tab 切换更新图表数据，以及视图模式切换。
 */
import { ref, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

// #region 1. Props定义
// 本组件为独立面板，暂无外部 props
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['view-change', 'tab-change'])
// #endregion

// #region 3. 响应式状态
const tabs = [
  { name: '一氧化碳', value: 'co' },
  { name: '能见度', value: 'visibility' },
  { name: '洞内照明', value: 'lighting_in' },
  { name: '洞外光强', value: 'lighting_out' }
]
const activeTabIndex = ref(0)
const viewMode = ref('chart') // 'chart' | 'list'
const chartRef = ref(null)
let chartInstance = null

// 模拟不同 Tab 下的图表数据
const chartDataMap = {
  co: [15, 22, 28, 35, 25, 18, 12, 20, 32, 28, 15, 10],
  visibility: [10, 15, 20, 25, 30, 35, 38, 35, 30, 25, 20, 15],
  lighting_in: [5, 8, 12, 15, 18, 20, 22, 20, 18, 15, 10, 5],
  lighting_out: [30, 35, 38, 40, 38, 35, 30, 25, 20, 15, 10, 5]
}
// #endregion

// #region 4. 计算属性
const currentTabValue = () => tabs[activeTabIndex.value].value
// #endregion

// #region 5. 方法
const handleViewSwitch = () => {
  viewMode.value = viewMode.value === 'chart' ? 'list' : 'chart'
  emit('view-change', viewMode.value)
}

const getChartOption = () => {
  const currentData = chartDataMap[currentTabValue()]
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderColor: '#ccc',
      textStyle: { color: '#333', fontSize: 12 }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: { color: '#52c41a', fontSize: 10 },
      itemWidth: 14,
      itemHeight: 2,
      icon: 'rect'
    },
    grid: { top: 24, right: 10, bottom: 20, left: 30 },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { color: '#666', fontSize: 10 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } },
      axisLabel: { color: '#333', fontSize: 10 }
    },
    series: [{
      name: 'zk3+785CO浓度',
      type: 'line',
      data: currentData,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      showSymbol: false,
      lineStyle: { color: '#0fcd7d', width: 2 },
      itemStyle: { color: '#0fcd7d' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ]
        }
      },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#f53f3f', type: 'dashed', width: 1 },
        data: [{
          yAxis: 30,
          label: {
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 10,
            position: 'insideEndTop'
          }
        }]
      }
    }]
  }
}

const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(getChartOption())
}

const handleResize = () => {
  chartInstance?.resize()
}
// #endregion

// #region 6. 生命周期
onMounted(() => {
  nextTick(() => {
    initChart()
  })
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  chartInstance = null
})

// 监听选中项变化，联动刷新图表数据（避免切换 Tab 后图表不更新）
watch(activeTabIndex, () => {
  if (chartInstance) {
    chartInstance.setOption(getChartOption(), true)
  }
  emit('tab-change', tabs[activeTabIndex.value].value)
})
// #endregion
</script>

<style lang="less" scoped>
@import './resources/styles/index.less';

.mv-1785691963555-bec4826c {
  width: 100%;
  height: 100%;
  // 根面板背景必须直接落地 Figma 字面量值
  background: rgba(237, 244, 251, 1);
  box-shadow: 0 4px 10px 0 rgba(74, 117, 141, 0.25);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;

  .header {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    gap: 8px;
    flex-shrink: 0;

    .header-decor {
      width: 8px;
      height: 8px;
      flex-shrink: 0;
      object-fit: contain;
    }

    .header-title {
      font-size: 16px;
      font-weight: 700;
      background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1.2;
    }
  }

  .tab-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 12px 8px;
    flex-shrink: 0;

    .tabs-list {
      display: flex;
      background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
      border: 0.72px solid #ffffff;
      border-radius: 4px;
      padding: 3px;
      gap: 4px;

      .tab-item {
        padding: 4px 12px;
        font-size: 14px;
        font-weight: 500;
        color: #2c9bea;
        cursor: pointer;
        border-radius: 3px;
        transition: all 0.3s ease;
        user-select: none;

        &.active {
          background: linear-gradient(90deg, #1099b1 0%, #038fff 100%);
          color: #ffffff;
          box-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
          border: 0.6px solid #ffffff;
        }
      }
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;

      .view-switch-icon {
        width: 52px;
        height: 24px;
        cursor: pointer;
        object-fit: contain;
      }

      .badge {
        width: 14px;
        height: 14px;
        background: #f53f3f;
        border-radius: 29px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 500;
        color: #ffffff;
        line-height: 1;
      }
    }
  }

  .chart-area {
    flex: 1;
    min-height: 0;
    padding: 0 12px 12px;

    .chart-container {
      width: 100%;
      height: 100%;
    }
  }
}</style>