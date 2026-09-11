<template>
  <!-- 环境监测面板根容器：真实渲染背景图与阴影 -->
  <div class="mv3-env-monitor-root" :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 顶部标题区 -->
    <SectionHeader />

    <!-- Tab 切换与视图控制区 -->
    <SectionTabsControls 
      :activeTab="activeTab" 
      :tabs="tabs" 
      :viewMode="viewMode" 
      :badgeCount="badgeCount" 
      @tab-change="handleTabChange" 
      @view-change="handleViewChange" 
    />

    <!-- 图表/数据可视化区 -->
    <SectionChart :activeTab="activeTab" :viewMode="viewMode" />
  </div>
</template>

<script setup>
const bg1 = new URL('../resources/images/bg-7880.png', import.meta.url).href /** * 环境监测面板 - 主组件 * 数据来源：环境监测接口（CO浓度、能见度、洞内照明、洞外光强） * 关键交互：Tab 切换监测指标、右上角视图切换（图表/列表） */
import { ref, onMounted, onUnmounted} from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import SectionTabsControls from './components/SectionTabsControls.vue'
import SectionChart from './components/SectionChart.vue'

// #region 1. Props定义
// 主组件无外部 props，内部状态自管理
// #endregion

// #region 2. Emits定义
// 主组件不向外 emit，子组件通过事件通知主组件
// #endregion

// #region 3. 响应式状态
// Tab 切换状态（API 可绑定替换）
const activeTab = ref(0)
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])

// 视图模式：chart 或 list
const viewMode = ref('chart')

// 列表视图未读/告警数
const badgeCount = ref(6) // #endregion

// #region 4. 计算属性
// 无派生计算
// #endregion

// #region 5. 方法
// 处理 Tab 切换
const handleTabChange = (index) => { activeTab.value = index }

// 处理视图切换（图表/列表）
const handleViewChange = (mode) => { viewMode.value = mode }
// #endregion

// #region 6. 生命周期
onMounted(() => {
  // 面板初始化完成
})

onUnmounted(() => {
  // 清理资源
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* [Layout Refine] Figma root frame 420x186, padding 20px left/right */
/* [Style Refine] fills[0].color → rgb(237, 244, 251), effects → box-shadow */
.mv3-env-monitor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px 20px 8px 20px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', 'PingFang SC', sans-serif;
  background-color: rgb(237, 244, 251);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
}
</style>