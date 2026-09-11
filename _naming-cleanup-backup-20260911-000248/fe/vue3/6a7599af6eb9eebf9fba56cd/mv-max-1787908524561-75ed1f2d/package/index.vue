<template>
  <div class="environment-monitor-root">
    <!-- 标题区 -->
    <div class="monitor-header">
      <img :src="icon1" class="header-icon" alt="装饰图标" />
      <h3 class="header-title">环境监测</h3>
    </div>

    <!-- Tab 切换栏 -->
    <div class="monitor-tabs" :style="{ backgroundImage: `url(${bg2})` }">
      <div
        v-for="(tab, index) in tabs"
        :key="index"
        class="tab-item"
        :class="{ active: activeTabIndex === index }"
        :style="activeTabIndex === index ? { backgroundImage: `url(${bg3})` } : {}"
        @click="handleTabChange(index)"
      >
        {{ tab }}
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="monitor-chart-wrapper">
      <!-- 右上角控件 -->
      <div class="chart-header-controls">
        <div class="control-item">
          <img :src="icon1" class="control-icon" alt="统计" />
          <span class="badge">8</span>
        </div>
        <div class="control-item">
          <img :src="icon2" class="control-icon" alt="导出" />
        </div>
      </div>

      <!-- 当前指标标签 -->
      <div class="chart-labels">
        <span class="label-text">2k3+785CD入度</span>
        <span class="label-adjust-line">调整线</span>
      </div>

      <!-- 图表容器 -->
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../resources/images/icon-7941.png'
import bg2 from '../resources/images/bg-7890.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon2 from '../resources/images/icon-7945.png'

import { ref, onMounted, onUnmounted, nextTick} from 'vue'
import * as echarts from 'echarts'

// Tab 数据
const tabs = ref(['气化版', '能见度', '洞内照明', '洞外光强'])
const activeTabIndex = ref(0)

// 图表相关
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 图表数据（使用 ref 以支持 API 绑定）
const chartData = ref([25, 28, 32, 30, 35, 38, 36, 34, 32, 30, 28, 26])
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

// Tab 切换处理
const handleTabChange = (index) => {
  activeTabIndex.value = index
  // 切换 Tab 后刷新图表数据（实际项目中应调用 API）
  console.log(`切换到 Tab: ${tabs.value[index]}`)
}

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)

  const option = {
    grid: {
      left: 40,
      right: 20,
      top: 20,
      bottom: 30
    },
    xAxis: {
      type: 'category',
      data: xAxisData.value,
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.15)'
        }
      },
      axisLabel: {
        color: 'rgba(0, 0, 0, 0.45)',
        fontSize: 10
      },
      axisTick: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: 'rgba(0, 0, 0, 0.45)',
        fontSize: 10
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)'
        }
      }
    },
    series: [
      {
        type: 'line',
        data: chartData.value,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: 'rgba(82, 196, 26, 1)',
          width: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0)' }
            ]
          }
        },
        // 调整线标记（红色虚线）
        markLine: {
          symbol: 'none',
          data: [
            {
              yAxis: 30,
              lineStyle: {
                type: 'dashed',
                color: 'rgba(245, 63, 63, 1)',
                width: 1
              },
              label: {
                show: false
              }
            }
          ]
        }
      }
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      borderColor: 'rgba(0, 0, 0, 0)',
      textStyle: {
        color: '#fff',
        fontSize: 12
      },
      formatter: (params) => {
        const param = params[0]
        return `${param.name}时<br/>能见度: ${param.value}`
      }
    }
  }

  chartInstance.setOption(option)
}

// 生命周期钩子
onMounted(async () => {
  // 等待 DOM 完全渲染后再初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value) {
      initChart()

      // 监听容器尺寸变化
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
})

onUnmounted(() => {
  // 清理资源
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.environment-monitor-root {
  width: 420px;
  height: 186px;
  display: flex;
  flex-direction: column;
  background: #edf4fb;
  padding: 14px;
  box-sizing: border-box;
  border-radius: 4px;
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  max-width: 100%;
  max-height: 100vh;
}

// 标题区
.monitor-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  .header-icon {
    width: 8px;
    height: 8px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .header-title {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    background: linear-gradient(135deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 0;
    width: 362px;
    height: 6px;
    background: linear-gradient(90deg, rgba(85, 158, 255, 0.8) 0%, rgba(85, 158, 255, 0) 100%);
  }
}

// Tab 切换栏
.monitor-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 12px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 4px;
  padding: 3px;

  .tab-item {
    flex: 1;
    padding: 6px 16px;
    font-size: 14px;
    color: #2c9bea;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    border-radius: 2px;

    &.active {
      color: #ffffff;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      box-shadow: 0 1px 4px rgba(3, 143, 255, 0.3);
    }

    &:hover:not(.active) {
      background: rgba(85, 158, 255, 0.08);
    }
  }
}

// 图表区域
.monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  padding: 12px;
  border-radius: 4px;

  // 右上角控件
  .chart-header-controls {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 12px;
    z-index: 10;

    .control-item {
      position: relative;
      cursor: pointer;

      .control-icon {
        width: 16px;
        height: 16px;
        object-fit: contain;
      }

      .badge {
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 14px;
        height: 14px;
        padding: 0 4px;
        background: #f53f3f;
        color: #ffffff;
        font-size: 10px;
        line-height: 14px;
        text-align: center;
        border-radius: 7px;
      }
    }
  }

  // 当前指标标签
  .chart-labels {
    display: flex;
    gap: 16px;
    margin-bottom: 8px;
    font-size: 12px;

    .label-text {
      color: rgba(0, 0, 0, 0.45);
    }

    .label-adjust-line {
      color: rgba(245, 63, 63, 1);
    }
  }

  // 图表容器（flex 自适应填充剩余空间）
  .chart-container {
    flex: 1;
    min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */;
    width: 100%;
  }
}</style>