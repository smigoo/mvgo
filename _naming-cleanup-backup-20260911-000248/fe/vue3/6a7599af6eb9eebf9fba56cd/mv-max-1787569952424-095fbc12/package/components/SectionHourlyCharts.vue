<template>
  <div class="section-hourly-charts">
    <!-- 江阴靖江长江隧道小时流量图表 -->
    <div class="chart-card">
      <div class="chart-header">
        <div class="chart-title">江阴靖江长江隧道</div>
      </div>
      <div ref="tunnelChartRef" class="chart-canvas"></div>
    </div>

    <!-- 江阴大桥小时流量图表 -->
    <div class="chart-card">
      <div class="chart-header">
        <div class="chart-title">江阴大桥</div>
      </div>
      <div ref="bridgeChartRef" class="chart-canvas"></div>
    </div>
  </div>
</template>

<script setup>
/**
 * 小时流量图表子组件
 * 包含江阴靖江长江隧道和江阴大桥的小时流量柱状图对比（北京方向 vs 上海方向）
 * 数据通过 ref 驱动，支持后续 API 绑定替换
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region 1. Props & Emits
// 本组件为纯展示与图表渲染，暂无外部 props/emits
// #endregion

// #region 2. 响应式状态（图表数据槽位，支持 API 绑定）
const tunnelChartData = ref({
  xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [120, 80, 50, 150, 300, 800, 1500, 2200, 2800, 2400, 1800, 900, 400],
  shanghai: [100, 60, 40, 120, 250, 600, 1200, 1800, 2400, 2000, 1500, 700, 300]
})

const bridgeChartData = ref({
  xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [200, 150, 100, 300, 600, 1500, 2500, 3200, 3800, 3400, 2600, 1400, 600],
  shanghai: [180, 120, 80, 250, 500, 1200, 2000, 2800, 3400, 3000, 2200, 1100, 500]
})
// #endregion

// #region 3. DOM Refs & 实例管理
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
let tunnelChartInstance = null
let bridgeChartInstance = null
let resizeObserver = null
// #endregion

// #region 4. 图表配置生成
/**
 * 生成 ECharts 柱状图配置
 * @param {Object} data - 包含 xAxis, beijing, shanghai 的数据对象
 */
const getChartOption = (data) => {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#E0E0E0',
      borderWidth: 1,
      textStyle: { color: '#333333', fontSize: 12 },
      formatter: (params) => {
        let res = `<div style="font-weight:500;margin-bottom:4px;">${params[0].axisValue}时</div>`
        params.forEach(p => {
          res += `<div>${p.marker} ${p.seriesName}: <span style="font-weight:700;">${p.value}</span> 辆</div>`
        })
        return res
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: '#666666', fontSize: 12 }
    },
    grid: {
      top: 30,
      left: 10,
      right: 10,
      bottom: 10,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      boundaryGap: true,
      axisLine: { lineStyle: { color: '#E8E8E8' } },
      axisLabel: { color: '#999999', fontSize: 10, margin: 8 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 4,
      splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#999999', fontSize: 10 }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: data.beijing,
        itemStyle: { color: '#1890ff', borderRadius: [2, 2, 0, 0] },
        barWidth: 8,
        barGap: '30%'
      },
      {
        name: '上海方向',
        type: 'bar',
        data: data.shanghai,
        itemStyle: { color: '#69c0ff', borderRadius: [2, 2, 0, 0] },
        barWidth: 8
      }
    ]
  }
}
// #endregion

// #region 5. 生命周期
onMounted(async () => {
  // 等待 DOM 更新与 flex 布局 settle
  await nextTick()
  requestAnimationFrame(() => {
    // 初始化隧道图表
    if (tunnelChartRef.value) {
      tunnelChartInstance = echarts.init(tunnelChartRef.value)
      tunnelChartInstance.setOption(getChartOption(tunnelChartData.value))
    }
    // 初始化大桥图表
    if (bridgeChartRef.value) {
      bridgeChartInstance = echarts.init(bridgeChartRef.value)
      bridgeChartInstance.setOption(getChartOption(bridgeChartData.value))
    }

    // 挂载 ResizeObserver 监听容器尺寸变化
    resizeObserver = new ResizeObserver(() => {
      tunnelChartInstance?.resize()
      bridgeChartInstance?.resize()
    })
    if (tunnelChartRef.value) resizeObserver.observe(tunnelChartRef.value)
    if (bridgeChartRef.value) resizeObserver.observe(bridgeChartRef.value)
  })
})

onUnmounted(() => {
  // 清理 observer 与 echarts 实例，防止内存泄漏
  resizeObserver?.disconnect()
  tunnelChartInstance?.dispose()
  bridgeChartInstance?.dispose()
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 小时流量图表区块容器
.section-hourly-charts {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 16px;

  // 单个图表卡片
  .chart-card {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: #ffffff;
    border-radius: 8px;
    padding: 12px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

    // 图表头部（标题区）
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .chart-title {
        font-size: 14px;
        font-weight: 500;
        color: #333333;
      }
    }

    // 图表画布容器（必须 flex:1 + min-height:0 保证 echarts 正确拉伸）
    .chart-canvas {
      flex: 1;
      min-height: 0;
      width: 100%;
    }
  }
}</style>