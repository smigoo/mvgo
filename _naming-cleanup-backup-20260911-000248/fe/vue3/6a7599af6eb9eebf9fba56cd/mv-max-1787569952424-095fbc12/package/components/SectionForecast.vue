<template>
  <div class="section-forecast">
    <!-- 头部：标题 + 控件 -->
    <div class="forecast-header">
      <div class="header-title">
        <span class="title-icon"></span>
        <span class="title-text">流量预测</span>
      </div>
      <div class="header-controls">
        <!-- 地点切换 Tab -->
        <div class="location-tabs">
          <div 
            v-for="(tab, index) in locationTabs" 
            :key="index"
            :class="['tab-item', { active: activeTab === index }]"
            @click="handleTabClick(index)"
          >
            {{ tab }}
          </div>
        </div>
        <!-- 节假日预测链接 -->
        <div class="holiday-link" @click="handleHolidayClick">
          节假日预测 &gt;
        </div>
      </div>
    </div>

    <!-- 图表与准确率标签区 -->
    <div class="forecast-chart-wrapper">
      <div ref="chartRef" class="forecast-chart"></div>
      <!-- 底部准确率标签 -->
      <div class="accuracy-labels">
        <span v-for="(label, index) in accuracyLabels" :key="index" class="accuracy-label">
          {{ label }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 流量预测子组件
 * 职责：展示流量预测面积折线图，支持地点 Tab 切换与节假日预测跳转。
 * 交互：Tab 切换联动图表数据刷新，点击节假日预测触发事件。
 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'

// #region 1. Props & Emits
const emit = defineEmits(['holiday-click'])
// #endregion

// #region 2. 响应式状态
// Tab 切换数据
const locationTabs = ref(['江阴靖江长江隧道', '江阴大桥'])
const activeTab = ref(0)

// 准确率标签
const accuracyLabels = ref(['准确率98%', '准确率96%', '准确率92%'])

// 图表数据（使用 ref 以支持 API 绑定与交互切换）
const xData = ref(['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'])
const actualData = ref([1200, 1800, 2500, 2200, 1500])
const forecastData = ref([1100, 1900, 2600, 2400, 1600])

// 图表 DOM 引用
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 3. 计算属性
// 图表配置项（依赖 ref 数据，自动响应变化）
const chartOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: '#e0e0e0',
    textStyle: { color: '#333', fontSize: 12 },
    formatter: (params) => {
      let res = `<div style="font-weight:500;margin-bottom:4px">${params[0].axisValue}</div>`
      params.forEach(p => {
        res += `<div>${p.marker} ${p.seriesName}：<b>${p.value}</b> 辆</div>`
      })
      return res
    }
  },
  legend: {
    data: ['实际流量', '预测流量'],
    top: 0,
    right: 0,
    textStyle: { color: '#666', fontSize: 12 },
    itemWidth: 14,
    itemHeight: 6,
    itemGap: 16
  },
  grid: {
    top: 30,
    left: 45,
    right: 20,
    bottom: 30
  },
  xAxis: {
    type: 'category',
    data: xData.value,
    boundaryGap: false,
    axisLine: { lineStyle: { color: '#e0e0e0' } },
    axisTick: { show: false },
    axisLabel: { color: '#666', fontSize: 12, margin: 12 }
  },
  yAxis: {
    type: 'value',
    name: '辆',
    nameTextStyle: { color: '#666', fontSize: 12, align: 'right', padding: [0, 20, 0, 0] },
    max: 4000,
    splitNumber: 4,
    splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#666', fontSize: 12 }
  },
  series: [
    {
      name: '实际流量',
      type: 'line',
      smooth: true,
      data: actualData.value,
      lineStyle: { color: '#3385ff', width: 2 },
      itemStyle: { color: '#3385ff', borderWidth: 2, borderColor: '#fff' },
      symbol: 'circle',
      symbolSize: 6,
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(51, 133, 255, 0.35)' },
            { offset: 1, color: 'rgba(51, 133, 255, 0.02)' }
          ]
        }
      },
      // 当前时间垂直分割线
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#5bbbef', type: 'solid', width: 1 },
        data: [{ xAxis: '当前时间' }],
        label: { show: false }
      }
    },
    {
      name: '预测流量',
      type: 'line',
      smooth: true,
      data: forecastData.value,
      lineStyle: { color: '#00cccc', width: 2 },
      itemStyle: { color: '#00cccc', borderWidth: 2, borderColor: '#fff' },
      symbol: 'circle',
      symbolSize: 6,
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(0, 204, 204, 0.35)' },
            { offset: 1, color: 'rgba(0, 204, 204, 0.02)' }
          ]
        }
      }
    }
  ]
}))
// #endregion

// #region 4. 方法
// 切换地点 Tab
const handleTabClick = (index) => {
  if (activeTab.value === index) return
  activeTab.value = index
  
  // 模拟不同地点的数据差异
  if (index === 0) {
    actualData.value = [1200, 1800, 2500, 2200, 1500]
    forecastData.value = [1100, 1900, 2600, 2400, 1600]
  } else {
    actualData.value = [2000, 2800, 3500, 3200, 2500]
    forecastData.value = [1900, 2900, 3600, 3400, 2600]
  }
  
  // 更新图表
  chartInstance?.setOption(chartOption.value)
}

// 点击节假日预测
const handleHolidayClick = () => {
  emit('holiday-click')
}
// #endregion

// #region 5. 生命周期
onMounted(async () => {
  // 等待 DOM 更新与布局 settle
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value) {
      chartInstance = echarts.init(chartRef.value)
      chartInstance.setOption(chartOption.value)
      
      // 监听容器尺寸变化，自适应图表
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
})

onUnmounted(() => {
  // 清理资源，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.section-forecast {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 头部区域 */
.forecast-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  flex-shrink: 0;
}

.header-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  
  .title-icon {
    width: 18px;
    height: 18px;
    background: #1990ff;
    border-radius: 2px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    
    &::before {
      content: '';
      width: 13px;
      height: 13px;
      background: #fff;
      border-radius: 1px;
    }
    
    &::after {
      content: '';
      position: absolute;
      width: 8px;
      height: 8px;
      background: linear-gradient(135deg, #1990ff 0%, #5a7eff 100%);
      border-radius: 1px;
    }
  }
  
  .title-text {
    font-size: 16px;
    font-weight: 500;
    color: #333333;
    text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
  }
}

.header-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
}

/* 地点切换 Tab */
.location-tabs {
  display: flex;
  flex-direction: row;
  gap: 8px;
  
  .tab-item {
    padding: 0 12px;
    height: 19px;
    line-height: 17px;
    border-radius: 20px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
    background: #6680a0;
    border: 0.73px solid rgba(172, 196, 225, 1);
    color: #ffffff;
    user-select: none;
    
    &.active {
      background: #1990ff;
      border: 0.73px solid rgba(199, 224, 255, 1);
      font-weight: 500;
    }
    
    &:hover:not(.active) {
      background: #7a92b0;
    }
  }
}

/* 节假日预测链接 */
.holiday-link {
  font-size: 12px;
  color: #1990ff;
  cursor: pointer;
  white-space: nowrap;
  
  &:hover {
    opacity: 0.8;
    text-decoration: underline;
  }
}

/* 图表容器 */
.forecast-chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.forecast-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
}

/* 底部准确率标签 */
.accuracy-labels {
  height: 16px;
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  // padding 对齐图表 grid 的 left(45px) 和 right(20px)
  padding: 0 20px 0 45px;
  flex-shrink: 0;
  
  .accuracy-label {
    font-size: 12px;
    font-weight: 500;
    color: #666666;
  }
}</style>