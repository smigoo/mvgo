<template>
  <div class="section-forecast">
    <!-- 标题与控件区 -->
    <div class="section-header">
      <div class="header-left">
        <img :src="icon7" class="header-icon" />
        <span class="header-title">流量预测</span>
      </div>
      <div class="header-right">
        <div class="tab-switch">
<div v-for="tab in tabs" :key="tab" :class="['tab-item', { active: activeTab === tab }]" @click="activeTab = tab" >
            {{ tab }}
          </div>
        </div>
        <a class="holiday-link" @click="handleHolidayClick">节假日预测&gt;</a>
      </div>
    </div>
    
    <!-- 图表区域 -->
    <div class="chart-container">
      <div ref="chartRef" class="chart-canvas"></div>
    </div>
    
    <!-- 底部准确率指示 -->
    <div class="accuracy-bar">
      <span class="accuracy-text">准确率</span>
      <span class="accuracy-value">98%</span>
      <span class="accuracy-value">96%</span>
      <span class="accuracy-value">92%</span>
    </div>
  </div>
</template>

<script setup>
import icon7 from '../../resources/images/icon-3573.png'

/**
 * 流量预测子组件
 * 功能：展示隧道/大桥的流量预测趋势（面积图），支持地点 Tab 切换与节假日预测跳转
 * 数据来源：API 接口注入（通过 ref 变量绑定）
 * 交互：Tab 切换联动图表数据刷新、链接点击事件
 */
import { ref, onMounted, onUnmounted, nextTick, watch} from 'vue'
import * as echarts from 'echarts'

// #region 1. Props & Emits
// 本组件为独立区块，无需外部 Props
// #endregion

// #region 2. 响应式状态
// Tab 切换数据
const tabs = ref(['江阴靖江长江隧道', '江阴大桥'])
const activeTab = ref('江阴靖江长江隧道')

// 图表容器与实例
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 图表数据（使用 ref 以支持 API 绑定与交互刷新）
const xData = ref(['2小时前', '1小时前', '当前', '1小时后', '2小时后'])
const actualData = ref([1200, 1500, 1800, 1600, 1400])
const forecastData = ref([1100, 1450, 1850, 1700, 1500])
// #endregion

// #region 3. 方法
// 节假日预测链接点击
const handleHolidayClick = () => { console.log('跳转至节假日预测详情')
}

// 初始化 ECharts 图表
const initChart = () => { if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
const option = { tooltip: { trigger: 'axis', formatter: (params) => {
        let res = `${params[0].axisValue}<br/>`
        params.forEach(p => {
          res += `${p.marker}${p.seriesName}: ${p.value} 辆<br/>`
        })
        return res
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      textStyle: { color: '#666666', fontSize: 12 },
      itemWidth: 10,
      itemHeight: 10
    },
    grid: {
      top: 30,
      left: 40,
      right: 20,
      bottom: 30
    },
    xAxis: {
      type: 'category',
      data: xData.value,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisLabel: { color: '#666666', fontSize: 12 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666666', fontSize: 12 }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: actualData.value,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#1890ff' },
        itemStyle: { color: '#1890ff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
            { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
          ])
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: forecastData.value,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#52c41a', type: 'dashed' },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
          ])
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
  
  // 监听容器尺寸变化，自适应图表
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}
// #endregion

// #region 4. 交互监听
// 监听 Tab 切换，联动刷新图表数据
watch(activeTab, (newVal) => {
  if (newVal === '江阴大桥') {
    actualData.value = [2000, 2200, 2500, 2300, 2100]
    forecastData.value = [1900, 2150, 2600, 2400, 2200]
  } else {
    actualData.value = [1200, 1500, 1800, 1600, 1400]
    forecastData.value = [1100, 1450, 1850, 1700, 1500]
  }
  
  if (chartInstance) {
    chartInstance.setOption({
      xAxis: { data: xData.value },
      series: [
        { data: actualData.value },
        { data: forecastData.value }
      ]
    })
  }
})
// #endregion

// #region 5. 生命周期
onMounted(async () => {
  // 等待 DOM 更新与布局 settle 后再初始化图表，避免 canvas 尺寸异常
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理监听器与图表实例，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.section-forecast {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: transparent;
  border-radius: 8px;
  padding: 12px 16px;
  box-sizing: border-box;
}

.section-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.header-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

.header-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
}

.tab-switch {
  display: flex;
  flex-direction: row;
  background: #f0f5ff;
  border-radius: 4px;
  padding: 2px;
}

.tab-item {
  padding: 4px 12px;
  font-size: 12px;
  color: #666666;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.3s;
  white-space: nowrap;

  &.active {
    background: #1990ff;
    color: #ffffff;
  }
}

.holiday-link {
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}

.chart-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.chart-canvas {
  flex: 1;
  min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */;
  width: 100%;
  height: 100%;
}

.accuracy-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-left: 40px;
  flex-shrink: 0;
}

.accuracy-text {
  font-size: 12px;
  color: #666666;
}

.accuracy-value {
  font-size: 12px;
  color: #52c41a;
  font-weight: 500;
}</style>