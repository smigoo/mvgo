<template>
  <div class="c-env-monitor-toolbar">
    <!-- 左侧 Tab 切换栏 -->
    <div class="c-env-monitor-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        class="c-env-monitor-tab-item"
        :class="{ 'c-env-monitor-tab-item--active': currentTab === tab.value }"
        :style="currentTab === tab.value ? activeTabStyle : null"
        @click="handleTabClick(tab.value)"
      >
        <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
      </div>
    </div>

    <!-- 右侧视图切换图标组 -->
    <div class="c-env-monitor-toolbar-icons">
      <!-- 图表视图图标 -->
      <div
        class="c-env-monitor-icon-wrapper"
        :class="{ 'c-env-monitor-icon-wrapper--active': currentView === 'chart' }"
        @click="handleViewClick('chart')"
      >
        <img :src="icon1" alt="图表视图" class="c-env-monitor-icon" />
      </div>
      <!-- 列表视图图标（带角标） -->
      <div
        class="c-env-monitor-icon-wrapper"
        :class="{ 'c-env-monitor-icon-wrapper--active': currentView === 'list' }"
        @click="handleViewClick('list')"
      >
        <img :src="icon2" alt="列表视图" class="c-env-monitor-icon" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, provide } from 'vue'

// Tab 数据（按 Figma 节点真实顺序）
const tabs = [
  { label: '一氧化碳', value: '一氧化碳' },
  { label: '洞内照明', value: '洞内照明' },
  { label: '洞外光强', value: '洞外光强' },
  { label: '能见度', value: '能见度' }
]

// 当前激活 Tab
const currentTab = ref('一氧化碳')
// 当前视图：chart / list
const currentView = ref('chart')

// 向子组件（SectionChart）提供当前 Tab 和视图，实现数据联动
provide('currentTab', currentTab)
provide('currentView', currentView)

// 激活 Tab 背景样式（使用 bg2 资源）
const activeTabStyle = {
  backgroundImage: `url(${bg2})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat'
}

// Tab 点击事件
const emits = defineEmits(['tab-change', 'view-change'])

function handleTabClick(value) {
  if (currentTab.value === value) return
  currentTab.value = value
  emits('tab-change', value)
}

// 视图切换点击事件
function handleViewClick(view) {
  if (currentView.value === view) return
  currentView.value = view
  emits('view-change', view)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

/* Tab 容器 */
.c-env-monitor-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 16px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  overflow: hidden;
}

/* 单个 Tab 项 */
.c-env-monitor-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 21px;
  box-sizing: border-box;
}

/* Tab 文字 */
.c-env-monitor-tab-text {
  font-size: @fontSize; /* 14px */
  line-height: 1;
  color: #2c9bea;
  user-select: none;
}

/* 未激活 Tab hover 反馈 */
.c-env-monitor-tab-item:not(.c-env-monitor-tab-item--active):hover {
  background: rgba(255, 255, 255, 0.35);
}

/* 激活 Tab：背景图由 :style 提供，这里只处理文字颜色和阴影 */
.c-env-monitor-tab-item--active {
  background-image: none; /* 背景图由内联样式覆盖 */
}

.c-env-monitor-tab-item--active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
}

/* 右侧图标组 */
.c-env-monitor-toolbar-icons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 图标包装器（定位角标） */
.c-env-monitor-icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.c-env-monitor-icon-wrapper--active {
  opacity: 1;
}

.c-env-monitor-icon {
  width: 24px;
  height: 24px;
  display: block;
}

/* 角标 */
.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f53f3f;
  color: #ffffff;
  font-size: calc(@fontSize * 0.857); /* ≈ 12px */
  line-height: 1;
  border-radius: 50%;
  box-sizing: border-box;
}
</style>