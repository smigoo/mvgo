<template>
  <!-- 分地点小时流量区块根容器 -->
  <div class="hourly-flow-section">
    <!-- 循环渲染两个地点的流量图表卡片 -->
    <div v-for="(item, index) in chartList" :key="item.id" class="flow-chart-card">
      <!-- 图表标题区 -->
      <div class="chart-header">
        <!-- 左侧蓝色装饰竖条 -->
        <span class="header-indicator"></span>
        <!-- 标题文本 -->
        <span class="chart-title">{{ item.title }}</span>
      </div>
      <!-- ECharts 图表容器 -->
      <div :ref="el => setChartRef(el, index)" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
/**
 * 分地点小时流量子组件
 * 功能：展示江阴靖江长江隧道、江阴大桥的24小时分方向流量柱状图
 * 包含两个并排的 ECharts 柱状图，支持 Tooltip 悬停查看详情
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region 1. Props定义
// 该组件数据由内部模拟或后续 API 绑定，无需外部传入 props
// #endregion

// #region 2. Emits定义
// 无需向外部 emit 事件
// #endregion

// #region 3. 响应式状态
// 图表配置列表（使用 ref 以支持后续 API 绑定替换数据）
const chartList = ref([
  { 
    id: 'tunnel', 
    title: '江阴靖江长江隧道',
    dataBeijing: [120, 80, 50, 60, 150, 300, 800, 1200, 1500, 1800, 1200, 800, 400],
    dataShanghai: [100, 70, 40, 50, 120, 280, 750, 1100, 1400, 1600, 1100, 700, 350]
  },
  { 
    id: 'bridge', 
    title: '江阴大桥',
    dataBeijing: [300, 200, 150, 180, 400, 800, 1500, 2200, 2800, 3200, 2500, 1800, 1000],
    dataShanghai: [280, 180, 130, 160, 380, 750, 1400, 2000, 2600, 3000, 2300, 1600, 900]
  }
])

// 存储 ECharts 实例的数组
const chartInstances = ref([])
// 存储 DOM 元素的数组，用于 ResizeObserver
const chartDoms = ref([])
// ResizeObserver 实例
let resizeObserver = null
// #endregion

// #region 4. 计算属性
// 无需派生计算
// #endregion

// #region 5. 方法
/**
 * 收集图表 DOM 引用
 * @param {HTMLElement} el - DOM 元素
 * @param {number} index - 索引
 */
const setChartRef = (el, index) => {
  if (el) {
    chartDoms.value[index] = el
  }
}

/**
 * 获取 ECharts 配置项
 * @param {object} item - 图表数据项
 * @returns {object} ECharts option
 */
const getChartOption = (item) => ({
  // 提示框配置
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(24, 144, 255, 0.05)' } },
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#E8E8E8',
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { color: '#333', fontSize: 12 },
    formatter: (params) => {
      let res = `<div style="font-weight:500;margin-bottom:6px;color:#333;">${params[0].axisValue}时</div>`
      params.forEach(p => {
        res += `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};"></span>
          <span style="color:#666;">${p.seriesName}</span>
          <span style="font-weight:500;color:#333;margin-left:auto;">${p.value} 辆</span>
        </div>`
      })
      return res
    }
  },
  /* [Style Refine] Figma legend itemSpacing=10 → itemGap: 10 */
  // 图例配置（右上角）
  legend: {
    data: ['北京方向', '上海方向'],
    right: 0,
    top: 0,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 10,
    textStyle: { color: '#333', fontSize: 12 }
  },
  // 网格配置
  grid: {
    left: 10,
    right: 10,
    top: 30,
    bottom: 10,
    containLabel: true
  },
  // X轴配置
  xAxis: {
    type: 'category',
    data: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    axisLine: { lineStyle: { color: '#E8E8E8' } },
    axisTick: { show: false },
    axisLabel: { color: '#666', fontSize: 12, margin: 8 },
    boundaryGap: true
  },
  // Y轴配置
  yAxis: {
    type: 'value',
    max: 4000,
    splitNumber: 4,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: '#E8E8E8', type: 'dashed' } },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  /* [Style Refine] Figma fills/strokes → 渐变与阴影还原 */
  // 数据系列
  series: [
    {
      name: '北京方向',
      type: 'bar',
      data: item.dataBeijing,
      barWidth: 4,
      barGap: '30%',
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#18acff' },
          { offset: 1, color: '#3c50ff' }
        ]),
        borderRadius: [2, 2, 0, 0],
        shadowColor: 'rgba(25, 144, 255, 0.4)',
        shadowBlur: 2
      }
    },
    {
      name: '上海方向',
      type: 'bar',
      data: item.dataShanghai,
      barWidth: 4,
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#18ffff' },
          { offset: 1, color: '#00a3d6' }
        ]),
        borderRadius: [2, 2, 0, 0],
        shadowColor: 'rgba(31, 231, 232, 0.4)',
        shadowBlur: 2
      }
    }
  ]
})

/**
 * 初始化所有图表
 */
const initCharts = () => {
  chartDoms.value.forEach((dom, index) => {
    if (dom && !chartInstances.value[index]) {
      const chart = echarts.init(dom)
      chart.setOption(getChartOption(chartList.value[index]))
      chartInstances.value[index] = chart
    }
  })
}

/**
 * 监听容器尺寸变化，自适应图表大小
 */
const setupResizeObserver = () => {
  resizeObserver = new ResizeObserver(() => {
    chartInstances.value.forEach(chart => {
      if (chart) {
        chart.resize()
      }
    })
  })
  
  chartDoms.value.forEach(dom => {
    if (dom) {
      resizeObserver.observe(dom)
    }
  })
}
// #endregion

// #region 6. 生命周期
onMounted(async () => {
  // 等待 DOM 更新后初始化图表
  await nextTick()
  initCharts()
  setupResizeObserver()
})

onUnmounted(() => {
  // 销毁 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  // 销毁 ECharts 实例，防止内存泄漏
  chartInstances.value.forEach(chart => {
    if (chart) {
      chart.dispose()
    }
  })
  chartInstances.value = []
})
// #endregion
</script>

<style lang="less" scoped>
/* 引入共享样式（主题变量 + 业务 class） */
@import '../../resources/styles/index.less';

/* [Layout Refine] Figma chart x=33.8, root x=10 → padding: 0 25px */
/* 分地点小时流量区块根容器 */
.hourly-flow-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-height: 0;
  padding: 0 25px;
}

/* 单个图表卡片 */
.flow-chart-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  flex: 1;
  min-height: 0;
}

/* [Layout Refine] Figma Frame 2136639396 itemSpacing=3 → gap: 3px */
/* 图表标题区 */
.chart-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

/* 标题左侧蓝色装饰竖条 (3x12px, 圆角6px) */
.header-indicator {
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  flex-shrink: 0;
}

/* 标题文本 */
.chart-title {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
  white-space: nowrap;
}

/* [Layout Refine] Figma 折线图 h=127 → height: 127px */
/* ECharts 图表容器 */
.chart-container {
  width: 100%;
  height: 127px;
  min-height: 127px;
  flex-shrink: 0;
}</style>