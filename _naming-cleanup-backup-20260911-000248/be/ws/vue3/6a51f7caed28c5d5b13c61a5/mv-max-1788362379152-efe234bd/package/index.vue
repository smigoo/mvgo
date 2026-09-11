<template>
  <div class="env-monitor-root">
    <!-- 标签页导航 -->
<HeaderTabs :active-tab="activeTab" @tab-change="handleTabChange" />
    
    <!-- 右侧控件 -->
    <HeaderControls />
    
    <!-- 数据展示区 -->
    <DataDisplay :active-tab="activeTab" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import HeaderTabs from './components/HeaderTabs.vue'
import HeaderControls from './components/HeaderControls.vue'
import DataDisplay from './components/DataDisplay.vue'

// #region 响应式状态
// 当前激活的标签页索引（0:氧化碳, 1:能见度, 2:洞内照明, 3:洞外光强）
const activeTab = ref(0)
// #endregion

// #region 方法
// 处理标签页切换事件，更新激活状态并触发数据刷新
const handleTabChange = (index) => { activeTab.value = index
  console.log('[环境监测] 切换标签页:', ['氧化碳', '能见度', '洞内照明', '洞外光强'][index])
}
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.env-monitor-root {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>