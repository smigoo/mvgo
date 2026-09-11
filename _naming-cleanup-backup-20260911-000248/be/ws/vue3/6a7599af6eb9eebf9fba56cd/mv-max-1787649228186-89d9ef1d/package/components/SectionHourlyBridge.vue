<template>
  <div class="hourly-bridge-section">
    <!-- 标题区：左侧蓝色竖条装饰 + 标题文字 -->
    <div class="hourly-bridge-header">
      <span class="header-icon-bar"></span>
      <span class="header-title">江阴大桥</span>
    </div>
    <!-- 图表容器 -->
    <div class="hourly-bridge-chart-wrapper">
      <div ref="chartRef" class="hourly-bridge-chart"></div>
    </div>
  </div>
</template>

<script setup>
/**
 * SectionHourlyBridge - 江阴大桥小时流量柱状图
 * 展示江阴大桥24小时内北京方向与上海方向的流量对比
 * 包含"建议分流"阈值线（橙色虚线）
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region 响应式状态
// 图表 DOM 引用
const chartRef = ref(null)
// 图表实例（非响应式，避免性能问题）
let chartInstance = null
// ResizeObserver 实例
let resizeObserver = null

// X轴小时标签数据（0-24，间隔2小时）
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

// 北京方向流量数据
const beijingData = ref([600, 400, 200, 600, 0, 600, 1200, 1800, 2400, 3000, 1800, 2400])

// 上海方向流量数据
const shanghaiData = ref([400, 300, 200, 500, 0, 500, 1000, 1600, 2200, 2800, 1600, 2000])

// 建议分流阈值线数值
const thresholdValue = 2500
// #endregion

// #region 图表配置
const getChartOption = () => {
  return {
    // 图例配置：右上角水平排列
    legend: {
      show: true,
      top: 4,
      right: 10,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      data: ['北京方向', '上海方向']
    },
    // 提示框：悬停显示详情
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: 'rgba(161,206,255,1)',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach((item) => {
          result += `${item.marker}${item.seriesName}：${item.value}辆<br/>`
        })
        return result
      }
    },
    // 网格区域
    grid: {
      top: 40,
      right: 20,
      bottom: 30,
      left: 50
    },
    // X轴：小时
    xAxis: {
      type: 'category',
      data: xAxisData.value,
      axisLine: {
        lineStyle: { color: '#d9d9d9' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        formatter: '{value}时'
      }
    },
    // Y轴：车辆数
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        formatter: '{value}'
      },
      splitLine: {
        lineStyle: {
          color: '#e8e8e8',
          type: 'dashed'
        }
      }
    },
    // 数据系列
    series: [
      {
        name: '北京方向',
        type: 'bar',
        barWidth: 4,
        barGap: '30%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18acff' },
            { offset: 1, color: '#3c50ff' }
          ]),
          borderRadius: [2, 2, 0, 0]
        },
        data: beijingData.value
      },
      {
        name: '上海方向',
        type: 'bar',
        barWidth: 4,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18ffff' },
            { offset: 1, color: '#00a3d6' }
          ]),
          borderRadius: [2, 2, 0, 0]
        },
        data: shanghaiData.value
      },
      {
        // 建议分流阈值线（橙色虚线）
        name: '建议分流',
        type: 'line',
        symbol: 'none',
        lineStyle: {
          color: '#ff984e',
          width: 1,
          type: 'dashed'
        },
        label: {
          show: true,
          position: 'end',
          formatter: '建议分流',
          color: '#ff984e',
          fontSize: 12
        },
        data: Array(xAxisData.value.length).fill(thresholdValue)
      }
    ]
  }
}
// #endregion

// #region 生命周期
onMounted(async () => {
  // 等待 DOM 更新，确保 flex 布局完成
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value) {
      // 初始化 echarts 实例
      chartInstance = echarts.init(chartRef.value)
      chartInstance.setOption(getChartOption())

      // 监听容器尺寸变化，自适应图表
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
})

onUnmounted(() => {
  // 清理资源：断开观察器、销毁图表实例
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 江阴大桥小时流量区块 */
.hourly-bridge-section {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 12px 16px;
}

/* 标题区：蓝色竖条 + 文字 */
.hourly-bridge-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

/* 标题左侧蓝色竖条装饰 */
.header-icon-bar {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  flex-shrink: 0;
}

/* 标题文字 */
.header-title {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

/* 图表外层容器：flex 弹性填充 */
.hourly-bridge-chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* 图表 DOM 容器 */
.hourly-bridge-chart {
  width: 100%;
  height: 100%;
  min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */;
}</style>