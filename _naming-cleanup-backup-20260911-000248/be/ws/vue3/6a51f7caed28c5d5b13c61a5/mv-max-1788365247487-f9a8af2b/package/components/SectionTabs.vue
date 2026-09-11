<template>
  <!-- Tab切换区与右侧操作区：包含四个监测指标Tab + 图表/列表视图切换图标 + 红色badge -->
  <div class="section-tabs">
    <!-- Tab切换列表：使用bg1作为整体背景图，bg2作为激活态tab背景 -->
<div class="tabs-list" :style="{ backgroundImage: `url(${bg1})` }" >
<div v-for="(tab, index) in tabList" :key="tab.key" class="tab-item" :class="{ 'tab-item--active': activeTab === index }" :style="activeTab === index ? { backgroundImage: `url(${bg2})` } : {}" @click="handleTabClick(index)" >
        {{ tab.label }}
      </div>
    </div>

    <!-- 右侧图标操作区：图表/列表视图切换 + 红色badge角标 -->
<TabsIconArea :active-view="activeView" :icon1="icon1" :icon2="icon2" @view-change="handleViewChange" />
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

// Tab切换区组件：管理四个环境监测指标Tab的切换状态，以及图表/列表视图的切换
// 背景图bg1为tabs-list整体背景，bg2为激活态Tab背景
import { ref} from 'vue'
import TabsIconArea from './TabsIconArea.vue'

// #region 1. Props定义
const props = defineProps({ activeTab: { type: Number, default: 0 }, activeView: { type: String, default: 'chart' }, bg1: { type: String, default: '' }, bg2: { type: String, default: '' }, icon1: { type: String, default: '' }, icon2: { type: String, default: '' }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-change'])
// #endregion

// #region 3. 响应式状态
// Tab列表数据，按Figma顺序：一氧化碳、能见度、洞内照明、洞外光强
const tabList = ref([ { key: 'co', label: '一氧化碳' }, { key: 'visibility', label: '能见度' }, { key: 'indoor-light', label: '洞内照明' }, { key: 'outdoor-light', label: '洞外光强' }
])
// #endregion

// #region 4. 方法
// 点击Tab时向父组件派发tab-change事件
const handleTabClick = (index) => { emit('tab-change', index)
}

// 视图切换（图表/列表）向父组件派发view-change事件
const handleViewChange = (view) => { emit('view-change', view)
}
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// Tab切换区整体容器：横向排列，左侧Tab列表 + 右侧图标操作区
.section-tabs {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0 0 4px 0;
}

// Tab列表容器：使用bg1背景图，固定宽高按Figma标注
.tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  width: 295px;
  height: 27px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  padding: 3px 4px;
  box-sizing: border-box;
  border-radius: 4px;
}

// 单个Tab项：默认透明背景，白色半透明文字
.tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-weight: 500;
  color: @color-text-secondary;
  cursor: pointer;
  white-space: nowrap;
  // 过渡效果，切换Tab时平滑变化
  transition: color 0.2s ease;

  // 激活态：使用bg2背景图，白色文字，文字阴影
  &--active {
    color: @color-text-base;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: center;
    // 激活Tab的文字阴影，来自Figma DROP_SHADOW效果
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}
</style>