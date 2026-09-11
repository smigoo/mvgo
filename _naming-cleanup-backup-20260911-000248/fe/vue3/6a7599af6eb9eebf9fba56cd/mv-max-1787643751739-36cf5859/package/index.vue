<template>
  <div class="env-monitor-root" :style="rootStyle">
    <!-- 面板背景层 -->
    <div class="env-monitor-bg" :style="bgStyle"></div>

    <!-- 头部标题区 -->
    <div class="env-monitor-header">
      <div class="env-monitor-decoration">
        <img :src="icon1" style="width: 8px; height: 8px; object-fit: contain;" />
        <img :src="icon2" style="width: 6px; height: 6px; object-fit: contain;" />
        <img :src="icon3" style="width: 2px; height: 2px; object-fit: contain;" />
      </div>
      <span class="env-monitor-title">环境监测</span>
    </div>

    <!-- 内容区 -->
    <div class="env-monitor-content">
      <!-- 子头部：Tab + 视图切换 -->
      <div class="env-monitor-sub-header">
        <!-- Tab 切换栏 -->
        <div class="env-monitor-tabs" :style="tabsBgStyle">
          <!-- 激活态背景 -->
          <div
            class="env-monitor-tab-active-bg"
            :style="activeTabBgStyle"
          ></div>
          <div
            v-for="(tab, index) in tabs"
            :key="tab"
            :class="[
              'env-monitor-tab-item',
              { 'env-monitor-tab-item--active': activeTab === index }
            ]"
            @click="handleTabClick(index)"
          >
            {{ tab }}
          </div>
        </div>

        <!-- 视图切换图标 -->
        <div class="env-monitor-view-switch">
          <div class="env-monitor-view-icon">
            <img :src="icon4" />
          </div>
          <div class="env-monitor-view-icon">
            <img :src="icon5" />
            <span class="env-monitor-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="env-monitor-chart-wrapper">
        <!-- 图例 -->
        <div class="env-monitor-chart-legend">
          <div class="env-monitor-legend-item">
            <div class="env-monitor-legend-line"></div>
            <span class="env-monitor-legend-text">zk3+785CO浓度</span>
          </div>
        </div>
        <!-- ECharts 图表容器 -->
        <div class="env-monitor-chart-container" ref="chartRef"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../resources/images/circle-7884.png'
import icon2 from '../resources/images/circle-7885.png'
import icon3 from '../resources/images/path-7886.png'
import icon4 from '../resources/images/icon-7941.png'
import icon5 from '../resources/images/icon-7945.png'
import bg1 from '../resources/images/bg-7880.png'
import bg2 from '../resources/images/bg-7890.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'

/**
 * 环境监测面板组件
 * 功能：展示隧道环境监测数据，包含 CO 浓度、能见度、洞内照明、洞外光强等指标切换
 * 图表：面积图展示 CO 浓度趋势，含红色预警线
 * 交互：Tab 切换监测指标、视图切换图标
 */
import { ref, onMounted, onUnmounted, nextTick, computed} from 'vue'
import * as echarts from 'echarts'

// 系统自动注入的图片变量（bg1/bg2/bg3/icon1~icon5）
// 此处使用占位，实际由预览加载器注入

// #region 1. Props定义
const props = defineProps({
  // 面板标题
  title: { type: String, default: '环境监测' }
})

// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-switch'])
// #endregion

// #region 3. 响应式状态
// Tab 数据（API 可绑定）
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])
const activeTab = ref(0)

// 图表 X 轴数据
const xData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

// 图表 Y 轴数据（CO 浓度趋势）
const chartData = ref([0 /* 🎯 待接入(5) */, 8, 6, 10, 12, 0 /* 🎯 待接入(15) */, 22, 0 /* 🎯 待接入(28) */, 0 /* 🎯 待接入(25) */, 18, 12, 8])

// 预警线值
const warningValue = ref(30)

// 视图模式
const viewMode = ref('chart')

// ECharts 实例
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 4. 计算属性
// 根容器样式
const rootStyle = computed(() => ({
  background: '#EDF4FB',
  borderRadius: '0px'
}))

// 面板背景图样式
const bgStyle = computed(() => ({
  backgroundImage: bg1.value ? `url(${bg1.value})` : 'none',
  backgroundSize: '100% 100%',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat',
  position: 'absolute',
  top: 0,
  left: 0,
  width: '0' /* 🎯 待接入(100%) */,
  height: '0' /* 🎯 待接入(100%) */,
  zIndex: 0,
  opacity: 0 /* 🎯 待接入(0.7) */
}))

// Tab 栏背景样式
const tabsBgStyle = computed(() => ({
  backgroundImage: bg2.value ? `url(${bg2.value})` : 'linear-gradient(180deg, #b5deff 0 /* 🎯 待接入(0%) */, #d1ecff 100%)',
  backgroundSize: '100% 100%',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat'
}))

// 激活 Tab 背景样式
const activeTabBgStyle = computed(() => {
  const tabWidth = 78
  const left = activeTab.value * tabWidth
  return {
    left: left + 'px',
    width: tabWidth + 'px',
    backgroundImage: bg3.value ? `url(${bg3.value})` : 'linear-gradient(180deg, #1099b1 0 /* 🎯 待接入(0%) */, #038fff 100%)',
    backgroundSize: '100% 100%',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat'
  }
})
// #endregion

// #region 5. 方法
// Tab 切换处理
const handleTabClick = (index) => {
  activeTab.value = index
  emit('tab-change', { index, tab: tabs.value[index] })
  // 切换 Tab 后刷新图表数据
  updateChartData()
}

// 更新图表数据（根据当前 Tab 模拟不同数据）
const updateChartData = () => {
  if (!chartInstance) return
  // 根据 Tab 切换更新数据（模拟）
  const dataMap = {
    0: [0 /* 🎯 待接入(5) */, 8, 6, 10, 12, 0 /* 🎯 待接入(15) */, 22, 0 /* 🎯 待接入(28) */, 0 /* 🎯 待接入(25) */, 18, 12, 8],
    1: [200, 0 /* 🎯 待接入(180) */, 0 /* 🎯 待接入(150) */, 0 /* 🎯 待接入(120) */, 100, 0 /* 🎯 待接入(80) */, 0 /* 🎯 待接入(60) */, 0 /* 🎯 待接入(50) */, 0 /* 🎯 待接入(70) */, 0 /* 🎯 待接入(90) */, 0 /* 🎯 待接入(130) */, 0 /* 🎯 待接入(180) */],
    2: [0 /* 🎯 待接入(50) */, 0 /* 🎯 待接入(45) */, 40, 0 /* 🎯 待接入(35) */, 30, 0 /* 🎯 待接入(28) */, 0 /* 🎯 待接入(25) */, 30, 0 /* 🎯 待接入(35) */, 40, 0 /* 🎯 待接入(45) */, 0 /* 🎯 待接入(50) */],
    3: [0 /* 🎯 待接入(800) */, 0 /* 🎯 待接入(750) */, 600, 400, 200, 0 /* 🎯 待接入(150) */, 100, 0 /* 🎯 待接入(150) */, 0 /* 🎯 待接入(300) */, 0 /* 🎯 待接入(500) */, 0 /* 🎯 待接入(700) */, 0 /* 🎯 待接入(800) */]
  }
  chartData.value = dataMap[activeTab.value] || dataMap[0]
  chartInstance.setOption({
    series: [{
      data: chartData.value
    }]
  })
}

// 初始化 ECharts 图表
const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)

  const option = {
    // 关闭内置 tooltip（设计稿未显示）
    tooltip: {
      show: false
    },
    // 关闭内置图例（使用自定义 DOM 图例）
    legend: {
      show: false
    },
    grid: {
      top: 10,
      right: 20,
      bottom: 30,
      left: 40,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: xData.value,
      axisLine: {
        lineStyle: {
          color: '#cccccc'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      name: '时',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 0, 0, 0 /* 🎯 待接入(-10) */]
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      splitNumber: 4,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: '#e0e0e0',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#333333',
        fontSize: 10,
        fontFamily: 'Roboto'
      },
      name: '辆',
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        padding: [0, 30, 0, 0]
      }
    },
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
            { offset: 0, color: 'rgba(0 /* 🎯 待接入(15) */, 0 /* 🎯 待接入(205) */, 0 /* 🎯 待接入(125) */, 0.4)' },
            { offset: 1, color: 'rgba(0 /* 🎯 待接入(15) */, 0 /* 🎯 待接入(205) */, 0 /* 🎯 待接入(125) */, 0.05)' }
          ])
        }
      },
      {
        // 预警线（markLine）
        name: '预警线',
        type: 'line',
        data: [],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 0 /* 🎯 待接入(1.5) */
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12
          },
          data: [
            {
              yAxis: warningValue.value
            }
          ]
        }
      }
    ]
  }

  chartInstance.setOption(option)

  // 挂载 ResizeObserver 监听容器尺寸变化
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}
// #endregion

// #region 6. 生命周期
const chartRef = ref(null)

onMounted(async () => {
  // 等待 DOM 更新后再初始化图表，确保 flex 布局已 settle
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理 ResizeObserver 和 ECharts 实例
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.env-monitor-root {
  position: relative;
  max-width: 100%;
  max-height: 100vh;

  background-image: url('../resources/images/bg-7880.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
}

.env-monitor-bg {
  pointer-events: none;
}

// 确保 header 和 content 在背景之上
.env-monitor-header,
.env-monitor-content {
  position: relative;
  z-index: 1;
}</style>