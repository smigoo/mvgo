<template>
  <!-- 环境监测主组件：包含标题栏、Tab切换栏、折线图区域 -->
  <div class="env-monitor-root">
    <!-- 顶部标题区域 -->
    <SectionHeader />

    <!-- Tab切换栏与操作区 -->
    <SectionTabs 
      :active-tab="activeTab" 
      :active-view="activeView" 
      :bg1="bg1" 
      :bg2="bg2" 
      :icon1="icon1" 
      :icon2="icon2" 
      @tab-change="handleTabChange" 
      @view-change="handleViewChange" 
    />

    <!-- 图表/数据可视化区域 -->
    <SectionChart 
      :chart-data="chartData" 
      :active-tab="activeTab" 
      :active-view="activeView" 
    />
  </div>
</template>

<script setup>
import bg1 from '../resources/images/bg-7890.png'
import bg2 from '../resources/images/bg-tab-active-7891.png'
import icon1 from '../resources/images/icon-7941.png'
import icon2 from '../resources/images/icon-7945.png'

/**
 * 环境监测主组件
 * 组织标题栏、Tab切换栏、图表区三大子组件
 * 管理 activeTab（监测指标切换）与 activeView（图表/表格视图切换）两个全局状态
 * 图片变量由系统自动注入，禁止手写 import
 */
import { ref} from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import SectionTabs from './components/SectionTabs.vue'
import SectionChart from './components/SectionChart.vue'

// #region 图片变量（由 injectResourceImports 自动注入，此处声明接收）
// bg1: tabs-list 整块背景图（295×27）
// bg2: 激活 Tab 状态背景图（78×21）
// icon1: 图表视图图标（24×24）
// icon2: 表格视图图标（24×24）
// #endregion

// #region Tab 切换状态
// tabs 列表：一氧化碳 / 能见度 / 洞内照明 / 洞外光强
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])
// 当前激活的监测指标 Tab，默认「一氧化碳」
const activeTab = ref('一氧化碳')
// #endregion

// #region 视图切换状态（图表视图 / 表格视图）
// 'chart' | 'table'，默认图表视图
const activeView = ref('chart')
// #endregion

// #region 图表数据
// X 轴时间刻度：2~24 时（按视觉坐标从左到右升序排列，修复 TEXT-001）
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

// 各监测指标图表数据：key 与 tabs 列表对应
const chartDataMap = ref({
  '一氧化碳': [3, 5, 8, 12, 18, 25, 32, 35, 30, 22, 14, 8],
  '能见度':   [80, 75, 70, 65, 60, 55, 60, 65, 70, 72, 74, 76],
  '洞内照明': [30, 32, 35, 38, 40, 38, 36, 34, 32, 30, 28, 26],
  '洞外光强': [0, 2, 10, 25, 40, 55, 60, 55, 45, 30, 10, 1],
})

// 当前激活 Tab 对应的图表数据（传给 SectionChart）
const chartData = ref({
  xData: xAxisData.value,
  seriesData: chartDataMap.value['一氧化碳'],
  tabName: '一氧化碳',
})
// #endregion

// #region 事件处理

/**
 * 处理 Tab 切换事件
 * 来自 SectionTabs 的 @tab-change 事件
 * 切换后同步更新 chartData，驱动 SectionChart 重新渲染
 * @param {string} tabName - 被点击的 Tab 名称
 */
const handleTabChange = (tabName) => {
  activeTab.value = tabName
  chartData.value = {
    xData: xAxisData.value,
    seriesData: chartDataMap.value[tabName] || [],
    tabName,
  }
}

/**
 * 处理视图切换事件（图表视图 / 表格视图）
 * 来自 SectionTabs 的 @view-change 事件
 * @param {string} view - 'chart' | 'table'
 */
const handleViewChange = (view) => {
  activeView.value = view
}

// #endregion
</script>

<style lang="less" scoped>
/* 引入根共享样式：theme-vars.less + common.less */
@import '../resources/styles/index.less';

/* 环境监测主容器：纵向弹性布局，盛满父级 */
.env-monitor-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: rgba(30, 40, 60, 1); /* 深色背景，直接硬编码（backgroundBrightness=dark） */;
  color: @color-text-base;
  font-size: 14px;
  overflow: hidden; /* 承载背景的容器按需 overflow: hidden */;
}
</style>