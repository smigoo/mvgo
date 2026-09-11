<template>
  <div class="mv3-mv-max-1785921967238-0c5422f6">
    <!-- 面板头部标题区 -->
    <div class="panel-header">
      <div class="header-decoration">
        <img :src="icon1" class="header-dot" />
        <div class="header-line"></div>
      </div>
      <div class="header-title">环境监测</div>
    </div>

    <!-- 内容区域 -->
    <div class="panel-content">
      <!-- Tab 切换栏 -->
      <div class="tab-bar">
        <div class="tabs-list">
          <div
            v-for="(tab, index) in tabs"
            :key="tab"
            :class="['tab-item', { 'tab-item--active': activeTab === index }]"
            @click="handleTabClick(index)"
          >
            <div v-if="activeTab === index" class="tab-active-bg"></div>
            <span class="tab-text">{{ tab }}</span>
          </div>
        </div>
        <div class="tabs-icons">
          <div class="icon-btn icon-btn--bar">
            <span class="bar-icon"></span>
          </div>
          <div class="icon-btn icon-btn--list" @click="handleListViewClick">
            <span class="list-icon"></span>
            <span class="badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="chart-container">
        <div ref="chartRef" class="chart-canvas"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'

/**
 * 环境监测面板组件
 * 功能：展示隧道环境监测数据，包含CO浓度、能见度、洞内照明、洞外光强等指标切换
 * 交互：Tab切换不同监测指标，右上角视图切换按钮
 * 图表：面积图展示CO浓度趋势，含预警线标记
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region 1. Props定义
const props = defineProps({
  chartData: { type: Array, default: () => [] },
  warningValue: { type: Number, default: 30 }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-switch'])
// #endregion

// #region 3. 响应式状态
// Tab 切换数据
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])
const activeTab = ref(0)

// 图表实例引用
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 图表数据（模拟趋势数据，14-18时有隆起）
const chartSeriesData = ref([
  5, 4, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22,
  28, 35, 38, 36, 32, 25, 18, 12, 8, 6, 5
])
// #endregion

// #region 4. 计算属性
const xAxisData = ref([
  '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'
])
// #endregion

// #region 5. 方法
// Tab 切换处理
const handleTabClick = (index) => {
  activeTab.value = index
  emit('tab-change', { index, label: tabs.value[index] })
  updateChart()
}

// 列表视图点击
const handleListViewClick = () => {
  emit('view-switch', { type: 'list' })
}

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    grid: {
      top: 30,
      right: 20,
      bottom: 25,
      left: 35
    },
    legend: {
      show: true,
      top: 5,
      right: 10,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        fontSize: 10,
        color: '#333333'
      },
      data: ['zk3+785CO浓度']
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e8e8e8',
      textStyle: {
        color: '#333',
        fontSize: 12
      },
      formatter: (params) => {
        const data = params[0]
        return `${data.name}时<br/>CO浓度: ${data.value}`
      }
    },
    xAxis: {
      type: 'category',
      data: xAxisData.value,
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'right',
        verticalAlign: 'top'
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(85, 158, 255, 0.3)'
        }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#333333',
        fontSize: 12
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        align: 'left',
        verticalAlign: 'bottom'
      },
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#333333',
        fontSize: 10
      },
      splitLine: {
        lineStyle: {
          color: '#bdd4e8',
          type: 'solid',
          width: 0.8
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartSeriesData.value,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#0fcd7d',
          width: 1
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0)' }
          ])
        }
      },
      {
        name: '预警线',
        type: 'line',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1
          },
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
}

const updateChart = () => {
  if (chartInstance) {
    chartInstance.setOption({
      series: [{
        data: chartSeriesData.value
      }]
    })
  }
}

watch(activeTab, () => {
  nextTick(() => {
    updateChart()
  })
})
// #endregion

// #region 6. 生命周期
onMounted(() => {
  nextTick(() => {
    initChart()
  })
  
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize()
    })
    resizeObserver.observe(chartRef.value)
  }
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器 - 面板整体
.mv3-mv-max-1785921967238-0c5422f6 {
  /* [Layout Refine] Figma layoutMode=VERTICAL → flex-direction: column */
  /* [Style Refine] fills[0].color → rgb(237, 244, 251) */
  /* [Style Refine] effects[0] → box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25) */
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: rgb(237, 244, 251);
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  padding: 10px 20px 8px 20px;
  box-sizing: border-box;
  overflow: hidden;
}

// 面板头部标题区
.panel-header {
  /* [Layout Refine] Figma layoutMode=HORIZONTAL → flex-direction: row */
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 28px;
  margin-bottom: 5px;
  
  .header-decoration {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    
    .header-dot {
      width: 8px;
      height: 8px;
      object-fit: contain;
      flex-shrink: 0;
    }
    
    .header-line {
      /* [Style Refine] fills[0].gradientStops → linear-gradient */
      width: 362px;
      height: 6px;
      background: linear-gradient(90deg, rgba(85, 158, 255, 0.3) 0%, rgba(85, 158, 255, 0) 100%);
    }
  }
  
  .header-title {
    /* [Style Refine] fills[0].gradientStops → linear-gradient */
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 16px;
    font-weight: 700;
    background: linear-gradient(90deg, #1990ff 0%, rgba(90, 126, 255, 0.83) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 19px;
    margin-left: 8px;
  }
}

// 内容区域
.panel-content {
  /* [Layout Refine] flex: 1, min-height: 0 */
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

// Tab 切换栏
.tab-bar {
  /* [Layout Refine] Figma layoutMode=HORIZONTAL, primaryAxisAlignItems=SPACE_BETWEEN */
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  
  .tabs-list {
    /* [Layout Refine] Figma layoutMode=HORIZONTAL */
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 295px;
    height: 27px;
    padding: 3px;
    border-radius: 6px;
    /* [Style Refine] fills[0].gradientStops → linear-gradient */
    background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
    /* [Style Refine] strokes[0] → border */
    border: 0.72px solid #ffffff;
    gap: 2px;
    
    .tab-item {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      
      .tab-active-bg {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: 4px;
        /* [Style Refine] fills[0].gradientStops → linear-gradient */
        background: linear-gradient(180deg, #1099b1 0%, #038fff 100%);
        /* [Style Refine] strokes[0] → border */
        border: 0.6px solid #ffffff;
      }
      
      .tab-text {
        position: relative;
        z-index: 1;
        font-family: 'Source Han Sans CN', sans-serif;
        font-size: 14px;
        font-weight: 500;
        /* [Style Refine] fills[0].color → #2c9bea */
        color: #2c9bea;
        white-space: nowrap;
      }
      
      &--active {
        .tab-text {
          /* [Style Refine] fills[0].color → #ffffff */
          color: #ffffff;
          /* [Style Refine] effects[0] → text-shadow */
          text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
        }
      }
      
      &:hover:not(.tab-item--active) {
        background: rgba(255, 255, 255, 0.3);
      }
    }
  }
  
  .tabs-icons {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    
    .icon-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      border-radius: 4px;
      transition: background 0.2s;
      /* [Style Refine] fills[0] & strokes[0] */
      background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
      border: 1px solid #a1cdff;
      
      &:hover {
        background: rgba(85, 158, 255, 0.1);
      }
      
      // 柱状图图标 - CSS绘制
      &--bar {
        .bar-icon {
          display: block;
          width: 16px;
          height: 14px;
          position: relative;
          
          &::before,
          &::after {
            content: '';
            position: absolute;
            bottom: 0;
            background: #2c9bea;
            border-radius: 1px;
          }
          
          &::before {
            left: 0;
            width: 4px;
            height: 8px;
          }
          
          &::after {
            left: 6px;
            width: 4px;
            height: 14px;
          }
        }
        
        .bar-icon {
          background: linear-gradient(#2c9bea 10px, #2c9bea 14px);
          background-position: bottom left;
          background-size: 4px 10px;
        }
      }
      
      // 列表图标 - CSS绘制
      &--list {
        .list-icon {
          display: block;
          width: 14px;
          height: 12px;
          position: relative;
          
          &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: #2c9bea;
            border-radius: 1px;
            box-shadow: 0 5px 0 #2c9bea, 0 10px 0 #2c9bea;
          }
        }
        
        .badge {
          position: absolute;
          top: -5px;
          right: -5px;
          min-width: 14px;
          height: 14px;
          padding: 0 3px;
          /* [Style Refine] fills[0].color → #f53f3f */
          background: #f53f3f;
          border-radius: 29px;
          color: #ffffff;
          font-family: 'PingFang SC', sans-serif;
          font-size: 12px;
          font-weight: 500;
          line-height: 14px;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      }
    }
  }
}

// 图表容器
.chart-container {
  /* [Layout Refine] flex: 1, min-height: 0 */
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 5px;
  
  .chart-canvas {
    width: 100%;
    height: 100%;
    min-height: 100px;
  }
}
</style>