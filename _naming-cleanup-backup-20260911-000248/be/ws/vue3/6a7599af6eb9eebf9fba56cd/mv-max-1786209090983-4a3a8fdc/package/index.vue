<template>
  <div class="env-monitor-root" :style="rootBgStyle">
    <!-- 头部标题区 -->
    <SectionHeader />
    <!-- 筛选与视图控制区 -->
<SectionControls :activeTab="activeTab" :viewMode="viewMode" @tab-change="handleTabChange" @view-toggle="handleViewToggle" />
    <!-- 趋势图表区 -->
    <SectionChart :activeTab="activeTab" />
  </div>
</template>

<script setup>
const bg1 = new URL('../resources/images/bg-7880.png', import.meta.url).href /** * 环境监测面板 - 主组件 * 功能：展示隧道/道路环境监测数据 * - 头部：面板标题"环境监测"带渐变效果 * - 控制区：Tab 切换监测指标（一氧化碳/能见度/洞内照明/洞外光强）+ 视图切换按钮 * - 图表区：ECharts 面积图展示 CO 浓度趋势，含红色预警线 * * 交互： * 1. Tab 切换 - 切换不同监测指标 * 2. 视图切换 - 图表/列表视图切换（右侧图标按钮） */
import { ref, computed} from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import SectionControls from './components/SectionControls.vue'
import SectionChart from './components/SectionChart.vue'

// 背景图资源（根面板背景）
const bg1 = '../resources/images/bg-7880.png'

// 根容器背景样式（直接落地 Figma 值，不走 CSS 变量）
/* [Layout Refine] 背景图使用 100% 100% 满足红线1 */
const rootBgStyle = computed(() => ({ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundColor: '#edf4fb' }))

// 当前激活的 Tab 索引（默认选中"一氧化碳"）
const activeTab = ref(0)

// 当前视图模式（chart / list）
const viewMode = ref('chart')

// Tab 切换处理
const handleTabChange = (index) => { activeTab.value = index }

// 视图切换处理
const handleViewToggle = (mode) => { viewMode.value = mode }
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器 - 直接落地 Figma 背景值
.env-monitor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #edf4fb;
  /* [Layout Refine] 背景图使用 100% 100% 满足红线1 */
  background-size: 100% 100%
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  /* [Style Refine] 移除无依据的 border-radius */
  font-family: 'Source Han Sans CN', 'Noto Sans SC', 'Roboto', sans-serif;
}</style>