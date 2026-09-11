<template>
  <div class="environment-monitor-root">
    <!-- 面板头部 -->
    <div class="panel-header">
      <div class="title-text">环境监测</div>
      <div class="header-right-slot">
        <div class="stats-indicator">2k3+7850次</div>
        <img :src="icon1" class="icon-chart" alt="图表图标" />
        <div class="icon-notification-wrapper">
          <img :src="icon2" class="icon-notification" alt="通知图标" />
          <span class="badge">8</span>
        </div>
      </div>
    </div>

    <!-- 选项卡切换区 -->
    <div class="tabs-section" :style="{ backgroundImage: `url(${bg1})` }">
      <div 
        v-for="(tab, index) in tabs" 
        :key="index"
        class="tab-item"
        :class="{ 'tab-item-active': activeTabIndex === index }"
        :style="activeTabIndex === index ? { backgroundImage: `url(${bg2})` } : {}"
        @click="handleTabChange(index)"
      >
        {{ tab }}
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-section">
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../resources/images/icon-7941.png'
import icon2 from '../resources/images/icon-7945.png'
import bg1 from '../resources/images/bg-7890.png'
import bg2 from '../resources/images/bg-tab-active-7891.png'

import { ref, onMounted, onUnmounted, nextTick} from 'vue'
import * as echarts from 'echarts'
// === API 对接导入 (自动生成) ===
import deviceApi from './api/device.mjs'  // slot-2: 监测趋势图
// === END API 导入 ===


// #region 图片资源（由系统自动注入）

// #endregion

// #region 数据状态
// 选项卡数据
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])
const activeTabIndex = ref(0)

// 图表数据（模拟24小时趋势数据）
const chartData = ref([
  12, 18, 22, 28, 35, 32, 28, 25, 22, 18, 15, 12,
  15, 18, 22, 26, 30, 28, 25, 20, 18, 15, 12, 10
])
// #endregion

// #region 图表实例
let chartInstance = null
const chartRef = ref(null)
let resizeObserver = null
// #endregion

// #region 交互事件
// 选项卡切换
const handleTabChange = (index) => {
  activeTabIndex.value = index
  // 切换后刷新图表数据（模拟不同监测指标）
  updateChartData(index)
}

// 更新图表数据
const updateChartData = (tabIndex) => {
  if (!chartInstance) return
  
  // 模拟不同选项卡的数据
  const dataMap = [
    [12, 18, 22, 28, 35, 32, 28, 25, 22, 18, 15, 12, 15, 18, 22, 26, 30, 28, 25, 20, 18, 15, 12, 10],
    [8, 12, 15, 18, 22, 25, 28, 30, 32, 28, 25, 20, 18, 15, 12, 10, 8, 12, 15, 18, 22, 25, 28, 30],
    [20, 25, 28, 32, 35, 38, 40, 38, 35, 32, 28, 25, 22, 20, 18, 15, 20, 25, 28, 32, 35, 38, 40, 38],
    [15, 18, 22, 25, 28, 32, 35, 38, 40, 42, 40, 38, 35, 32, 28, 25, 22, 18, 15, 18, 22, 25, 28, 32]
  ]
  
  chartData.value = dataMap[tabIndex]
  
  chartInstance.setOption({
    series: [{
      data: chartData.value
    }]
  })
}

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    grid: {
      left: 40,
      right: 20,
      top: 40,
      bottom: 30
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLabel: {
        show: true,
        color: '#666666',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
      axisLabel: {
        show: true,
        color: '#333333',
        fontSize: 12
      },
      axisTick: {
        show: true
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.06)',
          type: 'solid'
        }
      }
    },
    series: [{
      type: 'line',
      data: chartData.value,
      smooth: true,
      symbol: 'none',
      lineStyle: {
        color: 'rgba(15, 205, 125, 1)',
        width: 2
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [{
            offset: 0,
            color: 'rgba(102, 204, 153, 0.3)'
          }, {
            offset: 1,
            color: 'rgba(102, 204, 153, 0.05)'
          }]
        }
      }
    }],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.2)',
          type: 'dashed'
        }
      },
      formatter: (params) => {
        const data = params[0]
        return `${data.name}时<br/>${data.value}辆`
      }
    },
    // 红色预警线
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: {
        color: 'rgba(245, 63, 63, 1)',
        type: 'dashed',
        width: 2
      },
      label: {
        show: true,
        position: 'end',
        formatter: '预警线',
        color: 'rgba(245, 63, 63, 1)',
        fontSize: 12
      },
      data: [{
        yAxis: 30
      }]
    }
  }
  
  chartInstance.setOption(option)
  
  // 挂载 ResizeObserver
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}
// #endregion

// #region 生命周期
onMounted(async () => {
  // 等待 DOM 渲染完成后初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理图表实例和监听器
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
// #endregion

// === API 对接注入 (自动生成，请勿手动修改) ===
// === API 对接调用 ===
onMounted(async () => {
  // slot-2: 监测趋势图 → device.getMonitor
  try {
    const __res_slot_2 = await deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"})
    if (__res_slot_2?.code === 200 || __res_slot_2?.data) {
      chartData.value = __res_slot_2.data || __res_slot_2
    }
  } catch (e) { console.error('slot-2 deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"}):', e) }

})
// === END API 对接注入 ===
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* 根容器 */
.environment-monitor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(237, 244, 251, 1); /* Figma 根面板背景色真值 */;
  padding: 16px 20px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 面板头部 */
.panel-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.title-text {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(90deg, rgba(25, 144, 255, 1) 0%, rgba(90, 126, 255, 1) 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 19.2px;
}

.header-right-slot {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.stats-indicator {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
  line-height: 1.2;
}

.icon-chart {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  object-fit: contain;
  cursor: pointer;
}

.icon-notification-wrapper {
  position: relative;
  cursor: pointer;
}

.icon-notification {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  object-fit: contain;
}

.badge {
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: #ffffff;
  background: #f53f3f;
  border-radius: 29px;
  line-height: 1;
}

/* 选项卡切换区 */
.tabs-section {
  display: flex;
  flex-direction: row;
  gap: 0;
  margin-bottom: 12px;
  flex-shrink: 0;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 3px;
  border-radius: 4px;
}

.tab-item {
  flex: 1;
  padding: 7px 16px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(44, 155, 234, 1);
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  background: transparent;
  line-height: 12px;
  user-select: none;
}

.tab-item:first-child {
  border-radius: 4px 0 0 4px;
}

.tab-item:last-child {
  border-radius: 0 4px 4px 0;
}

.tab-item-active {
  color: rgba(255, 255, 255, 1);
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

/* 图表区 */
.chart-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chart-container {
  flex: 1;
  min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */;
  width: 100%;
  height: 100%;
}
</style>