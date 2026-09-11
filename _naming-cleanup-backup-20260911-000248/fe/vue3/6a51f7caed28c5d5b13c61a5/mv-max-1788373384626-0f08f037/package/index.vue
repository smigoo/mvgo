<template>
  <!-- 环境监测主组件：包含标题区、Tab控件、操作按钮、图表区 -->
  <div class="env-monitor-root">
    <!-- 顶部标题行：左侧标题 + 右侧Tab控件 + 操作按钮 -->
    <div class="env-monitor-header-row">
      <PanelHeader />
      <HeaderControls
        :active-tab="activeTab"
        :bg1="bg1"
        :bg2="bg2"
        @tab-change="handleTabChange"
      />
      <HeaderActions
        :icon1="icon1"
        :icon2="icon2"
        :badge-count="badgeCount"
        @chart-click="handleChartClick"
        @message-click="handleMessageClick"
      />
    </div>
    <!-- 图表内容区 -->
    <ChartSection
      :chart-data="chartData"
      :active-tab="activeTab"
    />
  </div>
</template>

<script setup>
import bg1 from '../resources/images/bg-7890.png'
import bg2 from '../resources/images/bg-tab-active-7891.png'
import icon1 from '../resources/images/icon-7941.png'
import icon2 from '../resources/images/icon-7945.png'

// 环境监测主组件
// 职责：组织四个子组件（标题区、Tab控件、操作按钮、图表区），管理全局状态（activeTab、chartData）
// 数据来源：静态 mock，API 绑定通过替换 ref 变量注入真实数据

import { ref, watch} from 'vue'
import PanelHeader from './components/PanelHeader.vue'
import HeaderControls from './components/HeaderControls.vue'
import HeaderActions from './components/HeaderActions.vue'
import ChartSection from './components/ChartSection.vue'

// #region 图片变量（系统自动注入，此处声明接收）
// 背景图变量由系统注入，声明为 props 或直接从外部 import 由预览加载器处理
// 注意：这些变量是静态 import 字符串，不是 ref，直接用即可

// #endregion

// #region 响应式状态

// 当前激活的 Tab（0=一氧化碳, 1=能见度, 2=洞内照明, 3=洞外光强）
const activeTab = ref(0)

// 消息角标数量
const badgeCount = ref(8)

// 图表数据（各 Tab 对应的数据，API 绑定时替换整个数组）
const chartData = ref({
  // 一氧化碳 - X轴时间刻度对应的 Y 值，单位：浓度
  0: [120, 180, 210, 160, 240, 300, 280, 320, 260, 200, 180, 150],
  // 能见度
  1: [400, 350, 300, 380, 420, 460, 440, 500, 480, 400, 360, 320],
  // 洞内照明
  2: [200, 220, 240, 210, 260, 280, 300, 270, 250, 230, 200, 180],
  // 洞外光强
  3: [500, 480, 520, 460, 540, 600, 580, 560, 520, 480, 440, 400]
})

// #endregion

// #region 方法

// Tab 切换处理：更新激活 tab，子组件 ChartSection 会监听 activeTab 联动刷新图表
const handleTabChange = (index) => {
  activeTab.value = index
}

// 图表按钮点击（预留：可触发视图切换或设置）
const handleChartClick = () => {
  console.log('[env-monitor] 图表按钮点击')
}

// 消息按钮点击（预留：显示消息列表）
const handleMessageClick = () => {
  console.log('[env-monitor] 消息按钮点击')
}

// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器：撑满宿主，纵向排列
.env-monitor-root {
  width: 100%;
  height: 100%;
  // 浅色渐变背景（白→浅蓝），Figma bg 节点 fill #edf4fb + 阴影
  background: linear-gradient(180deg, #ffffff 0%, #edf4fb 100%);
  box-shadow: 0 4px 10px 0 rgba(74, 117, 141, 0.25);
  overflow: hidden;
  position: relative;
}

// 顶部行：标题 + Tab控件 + 操作按钮，横向排列，垂直居中
.env-monitor-header-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  padding: 0 10px;
  gap: 0;
}
</style>