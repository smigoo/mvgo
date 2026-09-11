<template>
  <!-- 图表/数据可视化区：真实渲染背景图 -->
  <div
    class="mv3-env-monitor-chart"
    :style="{
      backgroundImage: `url(${bg2})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }"
  >
    <!-- 图表视图 -->
    <div v-if="viewMode === 'chart'" ref="chartContainer" class="chart-container"></div>
    
    <!-- 列表视图占位（不臆造具体列表内容） -->
    <div v-else class="list-placeholder">
      <span class="placeholder-text">列表视图</span>
    </div>
  </div>
</template>

<script setup>

const bg2 = new URL('../../resources/images/bg-7890.png', import.meta.url).href
/**
 * 环境监测面板 - 图表/数据可视化子组件
 * 数据来源：环境监测接口（CO浓度、预警线）
 * 关键交互：根据 activeTab 切换监测指标，根据 viewMode 切换图表/列表视图
 * 图表类型：折线面积图（ECharts）
 */
import { ref, onMounted, onUnmounted, watch} from 'vue'
import * as echarts from 'echarts'

// #region 1. Props定义
const props = defineProps({
  // 当前选中的 Tab 索引
  activeTab: { type: Number, default: 0 },
  // 视图模式：chart（图表）或 list（列表）
  viewMode: { type: String, default: 'chart' }
})
// #endregion

// #region 2. Emits定义
// 子组件无需向外 emit
// #endregion

// #region 3. 响应式状态
const chartContainer = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 4. 计算属性
// 无派生计算
// #endregion

// #region 5. 方法
// 初始化 ECharts 实例
const initChart = () => {
  if (!chartContainer.value) return
  chartInstance = echarts.init(chartContainer.value)
  updateChart()
}

// 更新图表配置与数据
const updateChart = () => {
  if (!chartInstance) return

  // 构造模拟数据（14-18时有小高峰，预警线在30）
  const coData = ref([5, 4, 6, 8, 10, 12, 15, 25, 32, 28, 18, 10])
  const warningData = Array(12).fill(30)

  /* [Style Refine] ECharts colors from Figma fills */
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e0e0e0',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      formatter: (params) => {
        let res = `<div style="font-weight:bold;margin-bottom:4px;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          if (p.seriesName === 'zk3+785CO浓度') {
            res += `<div>${p.marker} ${p.seriesName}: <b>${p.value}</b> 辆</div>`
          }
        })
        return res
      }
    },
    /* [Layout Refine] Figma legend position: top-right */
    legend: {
      data: ['zk3+785CO浓度', '预警线'],
      top: 4,
      right: 10,
      textStyle: { color: 'rgb(51, 51, 51)', fontSize: 10 },
      itemWidth: 14,
      itemHeight: 2,
      itemGap: 16
    },
    grid: {
      top: 30,
      left: 35,
      right: 15,
      bottom: 28
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      /* [Style Refine] fills → rgb(102, 102, 102) */
      nameTextStyle: { color: 'rgb(102, 102, 102)', fontSize: 12, padding: [4, 0, 0, 0] },
      axisLine: { lineStyle: { color: 'rgb(189, 212, 232)' } },
      axisTick: { show: false },
      axisLabel: { color: 'rgb(51, 51, 51)', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      /* [Style Refine] fills → rgb(102, 102, 102) */
      nameTextStyle: { color: 'rgb(102, 102, 102)', fontSize: 12, padding: [0, 20, 0, 0] },
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: 'rgb(51, 51, 51)', fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgb(189, 212, 232)', type: 'solid' } }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: false,
        /* [Style Refine] fills → rgb(15, 205, 125) from Rectangle 346241398 */
        lineStyle: { width: 1, color: 'rgb(15, 205, 125)' },
        itemStyle: { color: 'rgb(15, 205, 125)' },
        areaStyle: {
          /* [Style Refine] Vector 1304 gradient fills */
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
          ])
        },
        data: coData,
        z: 2
      },
      {
        name: '预警线',
        type: 'line',
        data: warningData,
        /* [Style Refine] fills → rgb(211, 47, 47) */
        lineStyle: { color: 'rgb(211, 47, 47)', type: 'dashed', width: 1 },
        itemStyle: { color: 'rgb(211, 47, 47)' },
        symbol: 'none',
        z: 1
      }
    ]
  }

  chartInstance.setOption(option, true)
}
// #endregion

// #region 6. 生命周期
onMounted(() => {
  // 初始化图表
  initChart()
  
  // 监听容器尺寸变化，自适应图表大小
  if (chartContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize()
    })
    resizeObserver.observe(chartContainer.value)
  }
})

onUnmounted(() => {
  // 清理 ResizeObserver 和 ECharts 实例，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
  resizeObserver = null
})
// #endregion

// 监听 Tab 切换，联动刷新图表数据
watch(() => props.activeTab, () => {
  updateChart()
})

</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* [Layout Refine] Figma @echarts/line bbox: width=380, height=113 */
.mv3-env-monitor-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background-size: 100% 100%;
  background-repeat: no-repeat;

  .chart-container {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .list-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgb(153, 153, 153);
    font-size: 14px;
    
    .placeholder-text {
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 4px;
    }
  }
}
</style>