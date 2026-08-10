<template>
  <!-- 环境监测主组件：展示折线图及 Tab 切换，支持一氧化碳/洞内照明/洞外光强/能见度四类数据 -->
  <div class="mv-max-1785984926893-830e57c7" :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 标题栏区域 -->
    <div class="env-header">
      <!-- 标题左侧装饰点（g-7883.png 装饰微元素） -->
      <div class="env-header__left">
        <img :src="icon1" class="env-header__dot" alt="" />
        <span class="env-header__title">环境监测</span>
      </div>
    </div>

    <!-- 图表内容区 -->
    <div class="env-body">
      <!-- ECharts 折线图容器 -->
      <div ref="chartRef" class="env-chart"></div>
    </div>

    <!-- Tab 栏区域 -->
    <div class="env-tab-bar">
      <!-- Tab 列表 -->
      <div class="env-tab-list" :style="{ backgroundImage: `url(${bg2})` }">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.key"
          class="env-tab-item"
          :class="{ 'env-tab-item--active': activeTab === index }"
          @click="handleTabChange(index)"
        >
          <!-- 激活态背景图 -->
          <div
            v-if="activeTab === index"
            class="env-tab-item__active-bg"
            :style="{ backgroundImage: `url(${bgtabActive})` }"
          ></div>
          <span class="env-tab-item__label">{{ tab.label }}</span>
        </div>
      </div>

      <!-- Tab 右侧图标按钮区 -->
      <div class="env-tab-icons">
        <img :src="icontabsIcon" class="env-tab-icons__img" alt="图表切换" />
      </div>

      <!-- 告警数量徽标 -->
      <div class="env-tab-badge">
        <span class="env-tab-badge__num">{{ alarmCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../resources/images/bg-7880.png'
import icon1 from '../resources/images/g-7883.png'
import bg2 from '../resources/images/bg-7890.png'
import bgtabActive from '../resources/images/bg-tab-active-7891.png'
import icontabsIcon from '../resources/images/tabs-icon-43.png'

// 环境监测组件：折线图展示隧道内环境指标（CO浓度/照明/光强/能见度），支持 Tab 切换
// 数据来源：ECharts 渲染，通过 ref 注入可由 API 替换

import { ref, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

// 系统自动注入的图片变量（禁止手写 import 路径）
const bg1 = ref('')
const bg2 = ref('')
const bgtabActive = ref('')
const icon1 = ref('')
const icontabsIcon = ref('')

// #region 1. 响应式状态

// 当前激活的 Tab 索引
const activeTab = ref(0)

// Tab 列表数据
const tabs = ref([
  { key: 'co', label: '一氧化碳', unit: 'ppm' },
  { key: 'light_in', label: '洞内照明', unit: 'lux' },
  { key: 'light_out', label: '洞外光强', unit: 'lux' },
  { key: 'visibility', label: '能见度', unit: 'm' }
])

// 告警数量徽标
const alarmCount = ref(6)

// 图表 DOM 引用
const chartRef = ref(null)

// ECharts 实例（非响应式，避免 Vue 代理污染 echarts 内部对象）
let chartInstance = null

// 各 Tab 对应的折线图数据（X 轴：0-24小时，Y 轴按类型不同）
const chartDataMap = ref({
  co: {
    name: 'zk3+785CO浓度',
    color: '#0fcd7d',
    warnLine: 400,
    yMax: 600,
    yInterval: 200,
    data: [
      [2, 120], [4, 200], [6, 350], [8, 280], [10, 400], [12, 320],
      [14, 450], [16, 380], [18, 290], [20, 210], [22, 160], [24, 100]
    ]
  },
  light_in: {
    name: 'zk3+785洞内照明',
    color: '#1990ff',
    warnLine: 300,
    yMax: 600,
    yInterval: 200,
    data: [
      [2, 80], [4, 150], [6, 300], [8, 420], [10, 380], [12, 500],
      [14, 460], [16, 390], [18, 320], [20, 240], [22, 180], [24, 90]
    ]
  },
  light_out: {
    name: 'zk3+785洞外光强',
    color: '#ff9f00',
    warnLine: 350,
    yMax: 600,
    yInterval: 200,
    data: [
      [2, 50], [4, 100], [6, 250], [8, 450], [10, 550], [12, 580],
      [14, 490], [16, 400], [18, 300], [20, 180], [22, 90], [24, 40]
    ]
  },
  visibility: {
    name: 'zk3+785能见度',
    color: '#a855f7',
    warnLine: 200,
    yMax: 600,
    yInterval: 200,
    data: [
      [2, 400], [4, 380], [6, 300], [8, 220], [10, 180], [12, 150],
      [14, 200], [16, 280], [18, 350], [20, 420], [22, 460], [24, 500]
    ]
  }
})

// #endregion

// #region 2. 图表初始化与更新

/**
 * 根据当前激活 Tab 构建 ECharts option
 * 严格还原 Figma 标注：Y轴 0~600，间隔200（对应格线标注600/400/200/0）
 * X轴时刻：2,4,6,8,10,12,14,16,18,20,22,24，单位"时"
 * 预警线用红色虚线标注
 */
const buildChartOption = () => {
  const key = tabs.value[activeTab.value].key
  const config = chartDataMap.value[key]

  return {
    backgroundColor: 'transparent',
    grid: {
      // 为 Y 轴标签和单位留出空间，与 Figma absoluteBoundingBox 对齐
      top: 10,
      left: 36,
      right: 16,
      bottom: 28,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,22,38,0.9)',
      borderColor: 'rgba(85,158,255,0.4)',
      borderWidth: 1,
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: (params) => {
        const p = params[0]
        return `${p.axisValue}时<br/>${config.name}: <b>${p.value[1]}</b> ${tabs.value[activeTab.value].unit}`
      }
    },
    legend: {
      // 图例位置：折线图左上方，对应 Figma Frame 2136637694 位置
      show: true,
      top: 0,
      left: 36,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: '#333333',
        fontSize: 9.6,
        fontFamily: 'Source Han Sans CN'
      },
      data: [{ name: config.name, icon: 'rect' }]
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 24,
      interval: 2,
      // X 轴标签对应 Figma Frame 2136636710 中 2/4/6/.../24 文本
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto',
        formatter: (v) => v === 0 ? '' : String(v)
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(85,158,255,0.2)', width: 1 }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: config.yMax,
      interval: config.yInterval,
      // Y 轴标签对应 Figma "40 30 20 10 0" 文本节点（显示为600/400/200/0）
      axisLabel: {
        color: '#333333',
        fontSize: 12,
        fontFamily: 'Roboto',
        align: 'right'
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(85,158,255,0.25)', width: 1, type: 'solid' }
      }
    },
    series: [
      {
        name: config.name,
        type: 'line',
        // 渐变填充面积还原 Figma Vector 1304 的渐变效果
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${config.color}66` },
              { offset: 1, color: `${config.color}00` }
            ]
          }
        },
        lineStyle: { color: config.color, width: 2 },
        itemStyle: { color: config.color },
        symbol: 'circle',
        symbolSize: 4,
        smooth: true,
        data: config.data,
        // 预警线标注（红色虚线，对应 Figma "预警线" 文本节点 #d32f2f）
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 12,
            fontFamily: 'Source Han Sans CN'
          },
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
          data: [{ yAxis: config.warnLine }]
        }
      }
    ]
  }
}

/**
 * 初始化图表实例
 * 容器挂载后才能调用 echarts.init，避免尺寸为 0
 */
const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(buildChartOption())
}

/**
 * 切换 Tab 时更新图表数据（联动刷新，避免切换后图表不更新）
 */
const updateChart = () => {
  if (!chartInstance) return
  chartInstance.setOption(buildChartOption(), true)
}

// #endregion

// #region 3. 交互处理

/**
 * Tab 切换处理：更新 activeTab，联动刷新图表
 */
const handleTabChange = (index) => {
  activeTab.value = index
}

// 监听 activeTab 变化，触发图表刷新
watch(activeTab, () => {
  nextTick(() => updateChart())
})

// #endregion

// #region 4. 尺寸响应

let resizeObserver = null

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
  }
}

// #endregion

// #region 5. 生命周期

onMounted(() => {
  // 初始化图表
  initChart()

  // 监听容器尺寸变化，保持图表响应式
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(chartRef.value)
  }
})

onUnmounted(() => {
  // 清理图表实例，防止内存泄漏
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

// 根容器：420×186px，背景图 + 阴影，overflow hidden 防止图表溢出
.mv-max-1785984926893-830e57c7 {
  width: 100%;
  height: 100%;
  // 直接写明背景色兜底（Figma fill: #edf4fb + 透明度）
  background-color: #edf4fbb2;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  border-radius: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  position: relative;
  padding: 10px 20px 8px 20px;
}

// 标题栏：flex row，左侧装饰点 + 标题文字
.env-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 28px;
  flex-shrink: 0;
  margin-bottom: 4px;

  &__left {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  // 装饰小圆点（g-7883.png，8×8px，不可放大）
  &__dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    object-fit: contain;
  }

  // 标题文字：渐变色（Figma GRADIENT_LINEAR #1990ff→#5a7eff）
  &__title {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 16px;
    font-weight: 700;
    line-height: 19.2px;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
}

// 图表内容区：flex: 1 自适应剩余高度，min-height: 0 防止 flex 溢出
.env-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// ECharts 图表容器：撑满父容器
.env-chart {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

// Tab 栏：flex row，高度 32px，左侧 Tab 列表 + 右侧图标
.env-tab-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 32px;
  flex-shrink: 0;
  margin-top: 6px;
  position: relative;
}

// Tab 列表容器：背景图 bg-7890.png（渐变 #b5deff→#d1ecff），宽 295px，高 27px
.env-tab-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 295px;
  height: 27px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 3px;
  border: 0.72px solid rgba(255, 255, 255, 1);
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

// 单个 Tab 项
.env-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  cursor: pointer;
  position: relative;
  z-index: 1;

  // 激活态背景图层（bg-tab-active-7891.png）
  &__active-bg {
    position: absolute;
    inset: 0;
    background-size: 100% 100%;
    background-position: center center;
    background-repeat: no-repeat;
    z-index: -1;
    border-radius: 3px;
    border: 0.6px solid rgba(255, 255, 255, 1);
  }

  // Tab 文字：默认蓝色（Figma #2c9bea），激活时白色（Figma #ffffff）
  &__label {
    font-family: 'Source Han Sans CN', sans-serif;
    font-size: 14px;
    font-weight: 500;
    line-height: 12px;
    color: #2c9bea;
    white-space: nowrap;
    transition: color 0.2s;
    position: relative;
    z-index: 1;
    // 激活态文字阴影（Figma drop-shadow offset(0,0.6) color #006fe3）
  }

  &--active .env-tab-item__label {
    color: #ffffff;
    text-shadow: 0 0.6px 0 #006fe3;
  }
}

// Tab 右侧图标区域：52×24px，flex row
.env-tab-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 52px;
  height: 24px;
  flex-shrink: 0;
  margin-left: 16px;

  &__img {
    width: 52px;
    height: 24px;
    object-fit: contain;
  }
}

// 告警数量徽标：红色圆形，右侧绝对定位
.env-tab-badge {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  // 使用 CSS 替代资源：background: #f53f3f（来自 cssAlternatives）
  background: #f53f3f;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &__num {
    font-family: 'PingFang SC', sans-serif;
    font-size: 12px;
    font-weight: 500;
    line-height: 14px;
    color: #ffffff;
  }
}</style>