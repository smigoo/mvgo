<template>
  <div class="mv3-monitor-root" :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 标题栏 -->
    <div class="mv3-header">
      <div class="mv3-header-left">
        <img :src="icon1" class="mv3-header-dot" />
        <span class="mv3-header-title">环境监测</span>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="mv3-content">
      <!-- Tab 栏 -->
      <div class="mv3-tabs-bar" :style="{ backgroundImage: `url(${bg2})` }">
        <div class="mv3-tabs-list">
          <div
            v-for="(tab, index) in tabs"
            :key="index"
            :class="['mv3-tab-item', { 'mv3-tab-item--active': activeTab === index }]"
            :style="activeTab === index ? { backgroundImage: `url(${bg3})` } : {}"
            @click="activeTab = index"
          >
            {{ tab }}
          </div>
        </div>
        <div class="mv3-view-icons">
          <div class="mv3-icon-group">
            <img :src="icon2" class="mv3-view-icon" />
            <div class="mv3-badge">6</div>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="mv3-chart-area">
        <div ref="chartRef" class="mv3-chart-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
const bg1 = new URL('../resources/images/bg-7880.png', import.meta.url).href
const icon1 = new URL('../resources/images/g-7883.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-7890.png', import.meta.url).href
const bg3 = new URL('../resources/images/bg-tab-active-7891.png', import.meta.url).href
const icon2 = new URL('../resources/images/tabs-icon-43.png', import.meta.url).href
// 环境监测面板：包含监测指标Tab切换、视图切换按钮以及CO浓度趋势面积图
import { ref, onMounted, onUnmounted, nextTick} from 'vue'
import * as echarts from 'echarts'

// 资源变量由系统自动注入：bg1(根背景), bg2(Tab栏背景), bg3(激活Tab背景), icon1(标题装饰点), icon2(视图图标组)

// Tab 数据与状态
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])
const activeTab = ref(0)

// 图表相关引用与实例
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 图表数据（X轴时间，Y轴浓度值）
const xData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
const yData = ref([5, 12, 18, 25, 22, 15, 10, 8, 14, 28, 35, 20])

// 初始化 ECharts 图表
const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderColor: '#eee',
      textStyle: { color: '#333', fontSize: 12 }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: { color: '#333', fontSize: 10 },
      itemWidth: 14,
      itemHeight: 2
    },
    grid: {
      top: 30,
      right: 10,
      bottom: 20,
      left: 40
    },
    xAxis: {
      type: 'category',
      data: xData.value,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { color: '#666', fontSize: 10 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eee', type: 'dashed' } },
      axisLabel: { color: '#333', fontSize: 10 }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: yData.value,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#00b578', width: 2 },
        itemStyle: { color: '#00b578' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15,205,125,0.4)' },
            { offset: 1, color: 'rgba(15,205,125,0.05)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#f53f3f', width: 1 },
          data: [
            {
              yAxis: 30,
              label: {
                formatter: '预警线',
                color: '#d32f2f',
                fontSize: 10,
                position: 'insideEndTop'
              }
            }
          ]
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

onMounted(async () => {
  // 等待 DOM 更新和布局 settle 后再初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理资源，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.mv3-monitor-root {
  width: 100%;
  height: 100%;
  background-color: #edf4fb;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.mv3-header {
  height: 28px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  
  .mv3-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .mv3-header-dot {
    width: 8px;
    height: 8px;
    object-fit: contain;
  }
  
  .mv3-header-title {
    font-size: 16px;
    font-weight: 700;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    color: transparent;
    line-height: 1;
  }
}

.mv3-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 12px 12px;
}

.mv3-tabs-bar {
  height: 27px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px;
  box-sizing: border-box;
  margin-bottom: 8px;
  flex-shrink: 0;
  
  .mv3-tabs-list {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 100%;
  }
  
  .mv3-tab-item {
    height: 21px;
    padding: 0 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 500;
    color: #2c9bea;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    
    &--active {
      color: #ffffff;
      text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
    }
  }
  
  .mv3-view-icons {
    display: flex;
    align-items: center;
    height: 100%;
  }
  
  .mv3-icon-group {
    position: relative;
    width: 52px;
    height: 24px;
    
    .mv3-view-icon {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    
    .mv3-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 14px;
      height: 14px;
      background: #f53f3f;
      border-radius: 29px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 500;
      color: #ffffff;
      line-height: 1;
    }
  }
}

.mv3-chart-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  
  .mv3-chart-container {
    flex: 1;
    min-height: 0;
    width: 100%;
  }
}</style>