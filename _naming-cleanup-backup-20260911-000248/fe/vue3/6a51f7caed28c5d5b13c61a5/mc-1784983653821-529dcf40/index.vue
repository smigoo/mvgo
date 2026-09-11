<template>
  <div class="mc-1784983653821-529dcf40">
    <!-- 面板标题栏 -->
    <div class="panel-header">
      <div class="header-title">
        <span class="title-text">环境监测</span>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="panel-content">
      <!-- 监测类型切换与工具栏 -->
      <div class="monitor-controls">
        <div class="tab-switch">
          <div 
            v-for="(tab, index) in tabs" 
            :key="index"
            :class="['tab-item', { 'is-active': activeTab === index }]"
            @click="handleTabChange(index)"
          >
            {{ tab }}
          </div>
        </div>
        <div class="action-icons">
          <div class="icon-item" title="图表视图">
            <img src="./resources/images/tabs-icon-43.png" alt="图表视图" class="icon-img" />
          </div>
          <div class="icon-item badge-wrapper" title="列表视图">
            <img src="./resources/images/g-7883.png" alt="列表视图" class="icon-img" />
            <span class="badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="chart-section">
        <div ref="chartRef" class="chart-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

// #region 1. Props定义
const props = defineProps({
  initialTab: { type: Number, default: 0 }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-switch'])
// #endregion

// #region 3. 响应式状态
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强']
const activeTab = ref(props.initialTab)
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 4. 计算属性
// #endregion

// #region 5. 方法
const handleTabChange = (index) => {
  if (activeTab.value === index) return
  activeTab.value = index
  emit('tab-change', index)
  // 实际业务中可根据 index 重新请求数据并更新图表
  updateChartData(index)
}

const handleIconClick = (type) => {
  emit('view-switch', type)
}

const updateChartData = (tabIndex) => {
  if (!chartInstance) return
  // 模拟不同 tab 下的数据变化
  const mockData = [
    [10, 15, 12, 22, 28, 25, 32, 29, 20, 18, 15, 12],
    [5, 8, 15, 25, 30, 28, 20, 15, 10, 8, 5, 4],
    [20, 22, 25, 30, 35, 38, 35, 30, 25, 22, 20, 18],
    [40, 38, 35, 30, 25, 20, 25, 30, 35, 38, 40, 42]
  ]
  chartInstance.setOption({
    series: [{ data: mockData[tabIndex] || mockData[0] }]
  })
}

const initChart = () => {
  if (!chartRef.value) return
  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#559EFF',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      axisPointer: { lineStyle: { color: '#559EFF', type: 'dashed' } }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 10,
      right: 10,
      textStyle: { color: '#333', fontSize: 12 },
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 15
    },
    grid: {
      top: 45,
      left: 45,
      right: 20,
      bottom: 30
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      name: '辆',
      min: 0,
      max: 40,
      nameTextStyle: { color: '#666', fontSize: 11, padding: [0, 20, 0, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: 'dashed' } },
      axisLabel: { color: '#666', fontSize: 11 }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { width: 2, color: '#78D9B5' },
        itemStyle: { color: '#78D9B5', borderWidth: 2, borderColor: '#fff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(120, 217, 181, 0.35)' },
            { offset: 1, color: 'rgba(120, 217, 181, 0.02)' }
          ])
        },
        data: [10, 15, 12, 22, 28, 25, 32, 29, 20, 18, 15, 12],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            type: 'dashed',
            color: '#D9534F',
            width: 1.5
          },
          label: {
            formatter: '预警线',
            color: '#D9534F',
            fontSize: 11,
            position: 'insideEndTop',
            distance: 5
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

const handleResize = () => {
  chartInstance?.resize()
}
// #endregion

// #region 6. 生命周期
onMounted(() => {
  nextTick(() => {
    initChart()
    if (chartRef.value) {
      resizeObserver = new ResizeObserver(() => {
        handleResize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
// #endregion

// #region 7. 监听器
watch(() => props.initialTab, (newVal) => {
  if (newVal !== undefined && newVal !== activeTab.value) {
    activeTab.value = newVal
  }
})
// #endregion
</script>

<style scoped lang="less">
.mc-1784983653821-529dcf40 {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #EDF4FB;
  background-image: url('./resources/images/bg-7880.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 4px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #333333;
  font-size: 14px;
  box-sizing: border-box;

  .panel-header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background-image: url('./resources/images/bg-7890.png');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    flex-shrink: 0;
    
    .header-title {
      display: flex;
      align-items: center;
      
      .title-text {
        font-size: 16px;
        font-weight: 600;
        color: #333333;
        letter-spacing: 1px;
      }
    }
  }

  .panel-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 12px 16px 16px;
    background-image: url('./resources/images/bg-7890.png');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    min-height: 0;

    .monitor-controls {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-shrink: 0;

      .tab-switch {
        display: flex;
        flex-direction: row;
        gap: 4px;
        background: linear-gradient(to right, #559eff, #8ec5ff);
        border-radius: 4px;
        padding: 4px;

        .tab-item {
          padding: 4px 12px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.85);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
          white-space: nowrap;
          user-select: none;

          &:hover {
            color: #ffffff;
          }

          &.is-active {
            background-image: url('./resources/images/bg-tab-active-7891.png');
            background-size: 100% 100%;
            background-repeat: no-repeat;
            background-position: center;
            color: #ffffff;
            font-weight: 500;
            box-shadow: 0 2px 4px rgba(85, 158, 255, 0.3);
          }
        }
      }

      .action-icons {
        display: flex;
        flex-direction: row;
        gap: 16px;
        align-items: center;

        .icon-item {
          position: relative;
          width: 20px;
          height: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;

          &:hover {
            transform: scale(1.1);
          }

          .icon-img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }

          &.badge-wrapper {
            .badge {
              position: absolute;
              top: -6px;
              right: -10px;
              min-width: 16px;
              height: 16px;
              line-height: 16px;
              text-align: center;
              background-color: #ff4d4f;
              color: #fff;
              font-size: 10px;
              border-radius: 8px;
              padding: 0 4px;
              box-sizing: border-box;
              box-shadow: 0 1px 2px rgba(255, 77, 79, 0.4);
            }
          }
        }
      }
    }

    .chart-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      background-image: url('./resources/images/bg-7950.png');
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      border-radius: 4px;
      min-height: 0;
      padding: 8px;
      box-sizing: border-box;

      .chart-container {
        width: 100%;
        height: 100%;
        min-height: 113px;
      }
    }
  }
}
</style>