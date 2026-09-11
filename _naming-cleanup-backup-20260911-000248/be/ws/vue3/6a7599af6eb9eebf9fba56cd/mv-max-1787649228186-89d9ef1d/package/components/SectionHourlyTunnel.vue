<template>
  <div class="section-hourly-tunnel">
    <!-- 区块标题 -->
    <div class="section-title">
      <span class="title-icon"></span>
      <span class="title-text">江阴靖江长江隧道</span>
    </div>
    <!-- 图表容器 -->
    <div class="chart-wrapper">
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
/**
 * SectionHourlyTunnel - 江阴靖江长江隧道小时流量柱状图
 * 展示隧道24小时内北京方向和上海方向的流量对比
 * 包含"建议分流"阈值线（橙色虚线）
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region 响应式状态
// 图表容器 ref
const chartRef = ref(null)
// 图表实例（非响应式，避免性能问题）
let chartInstance = null
// ResizeObserver 实例
let resizeObserver = null

// X轴小时数据（0-24时，偶数刻度）
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

// 北京方向流量数据
const beijingData = ref([600, 400, 200, 600, 0, 600, 800, 1200, 1800, 2400, 1600, 800])

// 上海方向流量数据
const shanghaiData = ref([400, 300, 150, 500, 100, 500, 700, 1000, 1500, 2000, 1400, 600])

// 建议分流阈值线值
const thresholdValue = 2000
// #endregion

// #region 图表配置
const getChartOption = () => {
  return {
    // 图例配置：右上角水平排列
    legend: {
      show: true,
      top: 0,
      right: 0,
      orient: 'horizontal',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 10,
      textStyle: {
        fontSize: 12,
        color: '#333333'
      },
      data: ['北京方向', '上海方向']
    },
    // 提示框配置
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: 'rgba(161, 206, 255, 1)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `<div style="font-size:12px;color:#333;margin-bottom:4px;">${params[0].axisValue}时</div>`
        params.forEach((item) => {
          result += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
            <span style="display:inline-block;width:6px;height:6px;border-radius:1px;background:${item.color};"></span>
            <span style="color:#666;font-size:10px;">${item.seriesName}</span>
            <span style="color:#333;font-size:12px;font-weight:500;margin-left:auto;">${item.value}</span>
            <span style="color:#666;font-size:10px;">辆</span>
          </div>`
        })
        return result
      }
    },
    // 网格配置
    grid: {
      top: 30,
      right: 10,
      bottom: 24,
      left: 36,
      containLabel: false
    },
    // X轴配置
    xAxis: {
      type: 'category',
      data: xAxisData.value,
      axisLine: {
        lineStyle: {
          color: '#d9d9d9'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        fontSize: 12,
        color: '#666666',
        formatter: '{value}'
      }
    },
    // Y轴配置
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 4,
      axisLine: {
        show: true,
        lineStyle: {
          color: '#d9d9d9'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        fontSize: 10,
        color: '#666666'
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
          type: 'dashed'
        }
      }
    },
    // 数据系列
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData.value,
        barWidth: 4,
        barGap: '30%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18acff' },
            { offset: 1, color: '#3c50ff' }
          ]),
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData.value,
        barWidth: 4,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#18ffff' },
            { offset: 1, color: '#00a3d6' }
          ]),
          borderRadius: [2, 2, 0, 0]
        }
      },
      {
        // 建议分流阈值线（markLine）
        name: '建议分流',
        type: 'line',
        data: [],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#ff984e',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            position: 'end',
            formatter: '建议分流',
            color: '#ff984e',
            fontSize: 12
          },
          data: [
            {
              yAxis: thresholdValue
            }
          ]
        }
      }
    ]
  }
}
// #endregion

// #region 生命周期
onMounted(async () => {
  // 等待 DOM 更新完成后再初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value) {
      chartInstance = echarts.init(chartRef.value)
      chartInstance.setOption(getChartOption())
      // 监听容器尺寸变化，自适应调整图表
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
})

onUnmounted(() => {
  // 清理 ResizeObserver 和 echarts 实例，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.section-hourly-tunnel {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 12px 16px;
  box-sizing: border-box;
}

/* 区块标题样式 */
.section-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 3px;
  margin-bottom: 8px;
}

/* 标题左侧蓝色竖条装饰 */
.title-icon {
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  flex-shrink: 0;
}

.title-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #333333;
}

/* 图表外层容器：flex 布局链贯通 */
.chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* 图表容器：撑满父级 */
.chart-container {
  width: 100%;
  flex: 1;
  min-height: 120px;
}</style>