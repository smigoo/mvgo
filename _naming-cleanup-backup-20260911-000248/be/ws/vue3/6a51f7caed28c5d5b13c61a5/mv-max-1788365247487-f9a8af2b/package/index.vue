<template>
  <!-- 环境监测主组件：包含标题区、Tab切换区、图表区 -->
  <div class="env-monitor-root">
    <!-- 顶部标题区 -->
    <SectionHeader />

    <!-- Tab切换区与右侧操作区 -->
<SectionTabs :active-tab="activeTab" :active-view="activeView" :bg1="bg1" :bg2="bg2" :icon1="icon1" :icon2="icon2" @tab-change="handleTabChange" @view-change="handleViewChange" />

    <!-- 图表/数据可视化区 -->
<SectionChart :active-tab="activeTab" :active-view="activeView" :chart-data="chartData" :bg-chart="bgChart" />
  </div>
</template>

<script setup>
import bg1 from '../resources/images/bg-7890.png'
import bg2 from '../resources/images/bg-tab-active-7891.png'
import icon1 from '../resources/images/icon-7941.png'
import icon2 from '../resources/images/icon-7945.png'


// 环境监测主组件
// 职责：状态管理（activeTab / activeView）、资源变量注入、子组件编排
// 资源变量由系统自动注入，禁止手写 import
import { ref} from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import SectionTabs from './components/SectionTabs.vue'
import SectionChart from './components/SectionChart.vue'

// #region 资源变量（系统自动注入，此处声明接收）
// 背景图：tabs-list 整体背景

// 背景图：激活态 Tab 背景

// 图表视图图标

// 列表视图图标

// 图表区底图（bg-7890.png）
const bgChart = typeof _bgChart !== 'undefined' ? _bgChart : ''
// #endregion

// #region 响应式状态
// 当前激活的 Tab 索引（0=一氧化碳, 1=能见度, 2=洞内照明, 3=洞外光强）
const activeTab = ref(0)
// 当前视图模式（'chart' | 'list'）
const activeView = ref('chart')

// 图表数据，绑定 ref 以便 API 注入驱动图表更新
const chartData = ref([ { time: 2,  value: 8 }, { time: 4,  value: 15 }, { time: 6,  value: 22 }, { time: 8,  value: 18 }, { time: 10, value: 25 }, { time: 12, value: 30 }, { time: 14, value: 28 }, { time: 16, value: 35 }, { time: 18, value: 20 }, { time: 20, value: 12 }, { time: 22, value: 10 }, { time: 24, value: 8 }
])
// #endregion

// #region 事件处理
// 切换 Tab，联动图表数据刷新
const handleTabChange = (index) => { activeTab.value = index
}

// 切换视图（图表 / 列表）
const handleViewChange = (view) => { activeView.value = view
}
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器：盛满父级，纵向 flex 以支持 header/tabs/chart 三段分配
.env-monitor-root {
  width: 100%;
  height: 100%;
  // 根面板背景：深色系，bg 资源缺失时降级为深灰蓝（符合 Figma 描述）
  background: linear-gradient(180deg, #0f1419 0%, #1a1f2e 100%);
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}
</style>