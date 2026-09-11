<template>
  <div class="env-monitor-root" :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 头部标题区 -->
    <div class="monitor-header">
      <div class="header-decoration">
        <img :src="icon1" class="header-dot" />
        <span class="header-line"></span>
      </div>
      <h2 class="header-title">环境监测</h2>
    </div>

    <!-- 内容区 -->
    <div class="monitor-content">
      <!-- Tab 切换栏 -->
      <div class="tab-section">
        <div class="tabs-list" :style="{ backgroundImage: `url(${bg2})` }">
          <div
            v-for="(tab, index) in tabs"
            :key="tab.name"
            :class="['tab-item', { active: activeTab === index }]"
            @click="handleTabClick(index)"
          >
            <div v-if="activeTab === index" class="tab-active-bg" :style="{ backgroundImage: `url(${bg3})` }"></div>
            <span class="tab-text">{{ tab.name }}</span>
          </div>
        </div>
        <!-- 右侧视图切换图标 -->
        <div class="view-icons">
          <div class="icon-btn" @click="handleViewSwitch('chart')">
            <div class="chart-icon"></div>
          </div>
          <div class="icon-btn icon-btn--list" @click="handleViewSwitch('list')">
            <div class="list-icon"></div>
            <span class="badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="chart-section">
        <div class="chart-container" ref="chartRef"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
const bg1 = new URL('../resources/images/bg-7880.png', import.meta.url).href
const icon1 = new URL('../resources/images/g-7883.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-7890.png', import.meta.url).href
const bg3 = new URL('../resources/images/bg-tab-active-7891.png', import.meta.url).href
/**
 * 环境监测组件
 * 功能：展示隧道环境监测数据（一氧化碳、能见度、洞内照明、洞外光强）
 * 交互：Tab切换监测指标、右上角视图切换
 * 图表：ECharts 面积图展示CO浓度趋势，含预警线
 */
import { ref, onMounted, onUnmounted, nextTick} from 'vue'
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
// Tab 数据
const tabs = ref([
  { name: '一氧化碳', key: 'co' },
  { name: '能见度', key: 'visibility' },
  { name: '洞内照明', key: 'indoor-light' },
  { name: '洞外光强', key: 'outdoor-light' }
])
const activeTab = ref(0)

// 图表数据（X轴时间标签）
const xLabels = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
// 图表Y轴数据（CO浓度值）
const chartData = ref([5, 8, 12, 18, 25, 32, 28, 22, 15, 10, 7, 4])

// 图表实例引用
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 4. 计算属性
// 当前选中Tab的key
const currentTabKey = computed(() => tabs.value[activeTab.value]?.key || 'co')
// #endregion

// #region 5. 方法
// Tab 切换处理
const handleTabClick = (index) => {
  activeTab.value = index
  emit('tab-change', tabs.value[index])
  // 切换Tab后刷新图表数据
  updateChart()
}

// 视图切换处理
const handleViewSwitch = (type) => {
  emit('view-switch', type)
}

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    // 图例配置
    legend: {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: '#333333',
        fontSize: 10
      },
      data: ['zk3+785CO浓度']
    },
    // 提示框
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e8e8e8',
      textStyle: {
        color: '#333',
        fontSize: 12
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    // 网格配置
    grid: {
      top: 30,
      right: 20,
      bottom: 30,
      left: 40
    },
    // X轴配置
    xAxis: {
      type: 'category',
      data: xLabels.value,
      axisLine: {
        lineStyle: { color: '#e0e0e0' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#666',
        fontSize: 12
      },
      name: '时',
      nameTextStyle: {
        color: '#666',
        fontSize: 12,
        padding: [0, 0, 0, -20]
      }
    },
    // Y轴配置
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#333',
        fontSize: 12
      },
      name: '辆',
      nameTextStyle: {
        color: '#666',
        fontSize: 12
      }
    },
    // 数据系列
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartData.value,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.6)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ])
        },
        // 预警线
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          lineStyle: {
            color: '#f53f3f',
            type: 'dashed',
            width: 1.5
          },
          data: [
            { yAxis: props.warningValue }
          ]
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
}

// 更新图表数据
const updateChart = () => {
  if (!chartInstance) return
  chartInstance.setOption({
    series: [{
      data: chartData.value
    }]
  })
}
// #endregion

// #region 6. 生命周期
onMounted(async () => {
  // 等待DOM更新后再初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
    // 监听容器尺寸变化
    if (chartRef.value) {
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
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* 根容器 - 浅灰蓝背景 + 阴影 */
.env-monitor-root {
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
  padding: 12px 20px;
}

/* 头部标题区 */
.monitor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  flex-shrink: 0;
}

.header-decoration {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-dot {
  width: 8px;
  height: 8px;
  object-fit: contain;
}

.header-line {
  display: block;
  width: 60px;
  height: 3px;
  background: linear-gradient(90deg, #559eff 0%, #559eff 100%);
  border-radius: 2px;
}

.header-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
}

/* 内容区 */
.monitor-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Tab 切换栏 */
.tab-section {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  padding: 3px;
  gap: 2px;
}

.tab-item {
  position: relative;
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
}

.tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  border: 0.6px solid rgba(255, 255, 255, 1);
  border-radius: 3px;
  z-index: 0;
}

.tab-text {
  position: relative;
  z-index: 1;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  white-space: nowrap;
}

.tab-item.active .tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

/* 右侧视图切换图标 */
.view-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

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

  &:hover {
    background: rgba(85, 158, 255, 0.1);
  }
}

/* 柱状图图标 - CSS绘制 */
.chart-icon {
  width: 16px;
  height: 15px;
  position: relative;
  
  &::before {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 4px;
    height: 8px;
    background: #559eff;
    border-radius: 1px;
  }
  
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 6px;
    width: 4px;
    height: 15px;
    background: #559eff;
    border-radius: 1px;
  }
}

/* 列表图标 - CSS绘制 */
.list-icon {
  width: 14px;
  height: 14px;
  position: relative;
  
  &::before {
    content: '';
    position: absolute;
    top: 1px;
    left: 0;
    width: 14px;
    height: 2px;
    background: #559eff;
    border-radius: 1px;
    box-shadow: 0 5px 0 #559eff, 0 10px 0 #559eff;
  }
}

.icon-btn--list {
  position: relative;
}

/* 红色角标 */
.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  color: #ffffff;
  font-size: 10px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  line-height: 1;
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
  min-height: 0;
  width: 100%;
}</style>