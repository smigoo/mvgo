<template>
  <!-- 环境监测主组件：包含顶部标题装饰、tab切换栏、图表控制栏、面积图区域 -->
  <div class="env-monitor-root">
      <div ref="chartRef" class="c-mc-chart-chart-canvas" style="width:100%;height:160px;flex:1;min-height:160px;"></div>
    <!-- 顶部标题区域：蓝色装饰线 + 标题文字 -->
    <div class="env-monitor-header">
      <div class="header-decoration">
        <div class="decoration-dot">
          <div class="dot-inner"></div>
        </div>
        <div class="decoration-line"></div>
      </div>
      <div class="header-title">环境监测</div>
    </div>

    <!-- 内容区域：tab栏 + 图表控制 + 图表 -->
    <div class="env-monitor-body">
      <!-- 顶部tab栏子组件 -->
      <HeaderTabs
        :tabs="tabs"
        :activeTab="activeTab"
        :bg1="bg1"
        :bg2="bg2"
        :icon1="icon1"
        :activeViewMode="activeViewMode"
        :notificationCount="notificationCount"
        @tab-change="handleTabChange"
        @view-mode-change="handleViewModeChange"
      />

      <!-- 图表控制栏子组件 -->
      <ChartControls
        :activeTab="activeTab"
        :activeViewMode="activeViewMode"
      />

      <!-- 图表区域子组件 -->
      <ChartArea
        :activeTab="activeTab"
        :activeViewMode="activeViewMode"
        :chartData="chartData"
      />
    </div>
  </div>
</template>

<script setup>
// 环境监测主组件：管理tab切换状态、视图切换状态、图表数据，协调子组件通信
import { ref} from 'vue'
import HeaderTabs from './components/HeaderTabs.vue'
import ChartControls from './components/ChartControls.vue'
import ChartArea from './components/ChartArea.vue'

// 系统自动注入的图片变量（静态字符串，禁止写.value）
// import bg1 from '../resources/images/bg-7890.png'
// import bg2 from '../resources/images/bg-tab-active-7891.png'
// import icon1 from '../resources/images/icon-7945.png'

// #region 1. Props定义（主组件通常无props，由外部注入数据）
// #endregion

// #region 2. 响应式状态

// tab列表（与Figma一致：气化版/能见度/洞内照明/洞外光强）
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])

// 当前激活的tab索引（默认气化版/一氧化碳激活，索引0）
const activeTab = ref(0)

// 当前视图模式：'chart'图表视图 | 'list'列表视图（默认图表）
const activeViewMode = ref('chart')

// 通知徽章数字
const notificationCount = ref(8)

// 图表数据（面积图CO浓度数据，可被API绑定替换）
// X轴为0-24时，Y轴为CO浓度值
const chartData = ref([
  { time: 0,  value: 5  },
  { time: 2,  value: 12 },
  { time: 4,  value: 8  },
  { time: 6,  value: 25 },
  { time: 8,  value: 18 },
  { time: 10, value: 32 },
  { time: 12, value: 28 },
  { time: 14, value: 35 },
  { time: 16, value: 22 },
  { time: 18, value: 15 },
  { time: 20, value: 20 },
  { time: 22, value: 10 },
  { time: 24, value: 6  }
])

// 图片变量（系统注入，这里声明占位供传递给子组件）
// 注意：实际由系统 import 注入，此处仅为子组件 prop 传递兼容

// #endregion

// #region 3. 方法

// 处理tab切换（联动图表数据刷新）
const handleTabChange = (index) => {
  activeTab.value = index
  // TODO: 根据tab索引加载对应监测指标数据
}

// 处理视图模式切换（图表/列表）
const handleViewModeChange = (mode) => {
  activeViewMode.value = mode
}
// #endregion

import * as echarts from 'echarts'
import { onMounted, onUnmounted, nextTick} from 'vue'
const chartRef = ref(null); let mcChartInstance = null
const getOption = () => ({
  grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },
  xAxis: { type: 'category', data: ['2','4','6','8','10','12','14','16','18','20','22','24'] },
  yAxis: { type: 'value' },
  series: [{ name: "CO浓度", type: 'area', data: [] }]
})
onMounted(() => { nextTick(() => { if (chartRef.value) { mcChartInstance = echarts.init(chartRef.value); mcChartInstance.setOption(getOption()) } }) })
onUnmounted(() => { mcChartInstance?.dispose() })
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器：浅灰蓝色背景，完全填充父容器，纵向弹性布局
.env-monitor-root {
  width: 100%;
  height: 100%;
  // 根容器背景：Figma bg节点 SOLID #edf4fb，加阴影 DROP_SHADOW(0,4,10,0,rgba(74,117,141,0.25))
  // 注意：bg节点图片下载失败，按CSS替代方案：渐变背景
  background: linear-gradient(180deg, #edf4fb, #d6e8f5);
  box-shadow: 0 4px 10px 0 rgba(74, 117, 141, 0.25);
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}

// 顶部标题区域：装饰线 + 标题
.env-monitor-header {
  position: relative;
  padding: 8px 20px 4px 20px;
  flex-shrink: 0;
}

// 装饰线容器：蓝色渐变横线 + 左侧圆点装饰
.header-decoration {
  display: flex;
  align-items: center;
  margin-bottom: 2px;
}

// 左侧圆形装饰点（Figma g/circle节点：外圆黑色，内圆蓝色渐变，中心点蓝色）
.decoration-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #000000;
  flex-shrink: 0;
  margin-right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

// 内圆：蓝色渐变
.dot-inner {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1252fa 0%, #d6effc 100%);
}

// 蓝色装饰横线（Figma Vector 1476：GRADIENT_LINEAR #559eff→#559eff）
.decoration-line {
  flex: 1;
  height: 6px;
  background: linear-gradient(90deg, #559eff 0%, #559eff 100%);
  border-radius: 0 3px 3px 0;
}

// 标题文字（Figma：16px 700 渐变色 #1990ff→#5a7eff）
.header-title {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  // 渐变文字用 background-clip 实现（less变量，不用CSS变量）
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  display: inline-block;
  margin-top: 2px;
}

// 内容区域：flex弹性填充剩余空间
.env-monitor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>