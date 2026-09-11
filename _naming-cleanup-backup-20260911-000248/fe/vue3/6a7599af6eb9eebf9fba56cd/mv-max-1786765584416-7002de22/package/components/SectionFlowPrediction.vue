<template>
  <!-- 流量预测区块 -->
  <div class="flow-prediction-section">
    <!-- 区块头部：标题 + Tab切换 + 节假日链接 -->
    <div class="section-header">
      <!-- 左侧：标题 -->
      <div class="header-title-group">
        <!-- 标题装饰图标 -->
        <span class="title-icon"></span>
        <h3 class="section-title">流量预测</h3>
      </div>
      
      <!-- 中间：Tab切换 -->
      <div class="location-tabs">
        <button
          v-for="(tab, index) in locationTabs"
          :key="index"
          :class="['tab-btn', { active: activeTabIndex === index }]"
          @click="handleTabChange(index)"
        >
          {{ tab }}
        </button>
      </div>
      
      <!-- 右侧：节假日预测链接 -->
      <a class="holiday-link" @click="handleHolidayClick">
        节假日预测 &gt;
      </a>
    </div>

    <!-- 图表区域 -->
    <div class="chart-container">
      <!-- ECharts 面积图 -->
      <div ref="chartRef" class="prediction-chart"></div>
      
      <!-- 准确率文字 -->
      <div class="accuracy-text">
        <span class="accuracy-item">准确率98%</span>
        <span class="accuracy-item">准确率96%</span>
        <span class="accuracy-item">准确率92%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 流量预测区块组件
 * 功能：展示流量预测趋势图，支持地点切换
 * 包含：标题、Tab切换、面积图、准确率文字
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region 1. Props定义
// 无需外部 props
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['holiday-click'])
// #endregion

// #region 3. 响应式状态
// 地点 Tab 列表
const locationTabs = ref(['江阴靖江长江隧道', '江阴大桥'])
// 当前激活的 Tab 索引
const activeTabIndex = ref(0)
// 图表 DOM 引用
const chartRef = ref(null)
// ECharts 实例
let chartInstance = null
// ResizeObserver 实例（用于监听容器尺寸变化）
let resizeObserver = null

// 图表数据（按地点区分）
const chartDataMap = {
  0: {
    // 江阴靖江长江隧道
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [1200, 1800, 2400, 2100, 1600],
    predicted: [1150, 1750, 2350, 2200, 1700]
  },
  1: {
    // 江阴大桥
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    actual: [2800, 3200, 3800, 3500, 3000],
    predicted: [2750, 3150, 3750, 3600, 3100]
  }
}
// #endregion

// #region 4. 计算属性
// 当前地点的图表数据
const currentChartData = () => {
  return chartDataMap[activeTabIndex.value]
}
// #endregion

// #region 5. 方法
/**
 * 初始化 ECharts 图表
 */
const initChart = () => {
  if (!chartRef.value) return
  
  // 销毁旧实例
  if (chartInstance) {
    chartInstance.dispose()
  }
  
  // 创建新实例
  chartInstance = echarts.init(chartRef.value)
  updateChart()
}

/**
 * 更新图表配置和数据
 */
const updateChart = () => {
  if (!chartInstance) return
  
  const data = currentChartData()
  
  const option = {
    // 图例配置
    legend: {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 6,
      itemGap: 10,
      textStyle: {
        fontSize: 12,
        color: '#333333'
      },
      data: ['实际流量', '预测流量']
    },
    // 提示框
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#333333',
        fontSize: 12
      },
      formatter: (params) => {
        let result = `<div style="font-weight: 500; margin-bottom: 4px;">${params[0].axisValue}</div>`
        params.forEach(param => {
          result += `<div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${param.color};"></span>
            <span>${param.seriesName}：</span>
            <span style="font-weight: 500;">${param.value} 辆</span>
          </div>`
        })
        return result
      }
    },
    // 网格配置
    grid: {
      top: 30,
      left: 40,
      right: 20,
      bottom: 30
    },
    // X轴
    xAxis: {
      type: 'category',
      data: data.xAxis,
      axisLine: {
        lineStyle: {
          color: '#e8e8e8'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        fontSize: 12,
        color: '#666666'
      }
    },
    // Y轴
    yAxis: {
      type: 'value',
      max: 4000,
      splitNumber: 4,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        fontSize: 12,
        color: '#666666',
        formatter: '{value}'
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
          type: 'dashed'
        }
      }
    },
    // 系列配置
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: '#3385ff'
        },
        itemStyle: {
          color: '#3385ff',
          borderColor: '#ffffff',
          borderWidth: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
              { offset: 1, color: 'rgba(51, 133, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predicted,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: '#00cccc'
        },
        itemStyle: {
          color: '#00cccc',
          borderColor: '#ffffff',
          borderWidth: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 204, 204, 0.05)' }
            ]
          }
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
}

/**
 * 处理 Tab 切换
 */
const handleTabChange = (index) => {
  activeTabIndex.value = index
  // 切换后更新图表
  nextTick(() => {
    updateChart()
  })
}

/**
 * 处理节假日预测链接点击
 */
const handleHolidayClick = () => {
  emit('holiday-click')
}

/**
 * 处理窗口尺寸变化
 */
const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
  }
}
// #endregion

// #region 6. 生命周期
onMounted(() => {
  // 初始化图表
  initChart()
  
  // 监听容器尺寸变化
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(chartRef.value)
  }
  
  // 监听窗口 resize
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  // 清理 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  
  // 移除窗口监听
  window.removeEventListener('resize', handleResize)
  
  // 销毁 ECharts 实例
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})

// 监听 Tab 切换，更新图表
watch(activeTabIndex, () => {
  updateChart()
})
// #endregion
</script>

<style lang="less" scoped>
/* 引入共享样式 */
@import '../../resources/styles/index.less';

/* [Layout Refine] Figma slot x=35.8, root x=10 → padding: 0 25px */
/* 流量预测区块根容器 */
.flow-prediction-section {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 174px;
  padding: 0 25px;
}

/* 区块头部 */
.section-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

/* 标题组 */
.header-title-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  
  /* 标题装饰图标：菱形嵌套 */
  .title-icon {
    width: 18px;
    height: 18px;
    position: relative;
    flex-shrink: 0;
    
    /* 外层菱形 */
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 18px;
      height: 18px;
      background: #1990ff;
      transform: rotate(45deg);
      border-radius: 2px;
    }
    
    /* 中层菱形 */
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(45deg);
      width: 13px;
      height: 13px;
      background: #ffffff;
      border-radius: 1px;
    }
  }
  
  /* 标题文字 */
  .section-title {
    font-size: 16px;
    font-weight: 500;
    color: #333333;
    margin: 0;
    padding: 0;
    line-height: 24px;
    white-space: nowrap;
    text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
  }
}

/* 地点 Tab 切换 */
.location-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  
  /* [Style Refine] Figma paddingLeft/Right=10.23 → padding: 0 10px */
  .tab-btn {
    padding: 0 10px;
    height: 19px;
    border-radius: 20px;
    border: 0.73px solid rgba(172, 196, 225, 1);
    background: #6680a0;
    color: #ffffff;
    font-size: 14px;
    font-weight: 400;
    line-height: 21px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    
    &:hover {
      opacity: 0.9;
    }
    
    /* 激活态 */
    &.active {
      background: #1990ff;
      border-color: rgba(199, 224, 255, 1);
      font-weight: 500;
    }
  }
}

/* 节假日预测链接 */
.holiday-link {
  font-size: 12px;
  font-weight: 400;
  color: #1990ff;
  line-height: 18px;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  
  &:hover {
    opacity: 0.8;
  }
}

/* 图表容器 */
.chart-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  
  /* ECharts 图表 */
  .prediction-chart {
    flex: 1;
    width: 100%;
    min-height: 120px;
  }
  
  /* 准确率文字 */
  .accuracy-text {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 21px;
    padding: 4px 0;
    
    /* [Style Refine] Figma 准确率 fills → color: #17c02e */
    .accuracy-item {
      font-size: 12px;
      font-weight: 500;
      color: #17c02e;
      line-height: 12px;
    }
  }
}</style>