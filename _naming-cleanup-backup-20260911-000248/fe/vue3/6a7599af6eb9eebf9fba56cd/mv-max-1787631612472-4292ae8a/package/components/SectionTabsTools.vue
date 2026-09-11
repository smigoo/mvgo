<template>
  <!-- 标签页切换与工具栏：水平布局，左侧Tab切换，右侧视图工具 -->
  <div class="tabs-tools-section">
    <!-- 左侧监测指标 Tab 切换区 -->
    <div class="tabs-list" :style="{ backgroundImage: `url(${bg2})` }">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.name"
        :class="['tab-item', { 'tab-item--active': activeTab === index }]"
        @click="handleTabClick(index)"
      >
        <!-- 选中态背景图（仅激活时渲染） -->
        <div
          v-if="activeTab === index"
          class="tab-active-bg"
          :style="{ backgroundImage: `url(${bg3})` }"
        ></div>
        <span class="tab-text">{{ tab.name }}</span>
      </div>
    </div>

    <!-- 右侧视图工具按钮区 -->
    <div class="view-tools">
      <!-- 图表视图按钮 -->
      <div
        class="tool-btn"
        :class="{ 'tool-btn--active': viewMode === 'chart' }"
        @click="handleViewChange('chart')"
      >
        <div class="tool-icon-sprite tool-icon-chart"></div>
      </div>
      
      <!-- 列表视图按钮（含消息角标） -->
      <div
        class="tool-btn"
        :class="{ 'tool-btn--active': viewMode === 'list' }"
        @click="handleViewChange('list')"
      >
        <div class="tool-icon-sprite tool-icon-list"></div>
        <!-- 红色消息角标 -->
        <span class="badge">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-7890.png'
import bg3 from '../../resources/images/bg-tab-active-7891.png'

import { ref } from 'vue'

// 监测指标 Tab 数据（使用 ref 以支持 API 绑定）
const tabs = ref([
  { name: '一氧化碳' },
  { name: '能见度' },
  { name: '洞内照明' },
  { name: '洞外光强' }
])

// 当前选中的 Tab 索引，默认选中第一个（一氧化碳）
const activeTab = ref(0)

// 当前视图模式（chart: 图表视图, list: 列表视图）
const viewMode = ref('chart')

// 切换监测指标 Tab
const handleTabClick = (index) => {
  activeTab.value = index
}

// 切换右侧视图模式
const handleViewChange = (mode) => {
  viewMode.value = mode
}
</script>

<style scoped>
/* 标签页与工具栏根容器：水平排列，两端对齐 */
.tabs-tools-section {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 16px;
  box-sizing: border-box;
}

/* 左侧 Tab 列表容器 */
.tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  position: relative;
  padding: 3px;
  gap: 2px;
}

/* 单个 Tab 项 */
.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  padding: 0 12px;
  cursor: pointer;
  z-index: 1;
  border-radius: 3px;
  overflow: hidden;
}

.tab-item .tab-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  white-space: nowrap;
  position: relative;
  z-index: 2;
  line-height: 12px;
}

/* 选中态样式 */
.tab-item--active .tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

/* 选中态背景图层（绝对定位覆盖） */
.tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 0.6px solid rgba(255, 255, 255, 1);
  border-radius: 3px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  z-index: 1;
}

/* 右侧视图工具容器 */
.view-tools {
  display: flex;
  flex-direction: row;
  gap: 8px;
}

/* 视图工具按钮 */
.tool-btn {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  border-color: rgba(43, 125, 224, 0.6);
}

/* 激活态：蓝色渐变背景（与 Figma 选中按钮一致） */
.tool-btn--active {
  background: linear-gradient(180deg, #3a8fd4 0%, #2a7bc8 50%, #1d6db5 100%);
  border-color: rgba(43, 125, 224, 0.8);
}

/* Sprite 图标：tabs-icon-43.png 是 104×48 的左右拼图（左=图表，右=列表） */
.tool-icon-sprite {
  width: 18px;
  height: 18px;
  background-image: url('../../resources/images/tabs-icon-43.png');
  background-size: 104px 48px;
  background-repeat: no-repeat;
}

.tool-icon-chart {
  background-position: 0 0;
}

.tool-icon-list {
  background-position: -52px 0;
}

/* 消息角标（红色圆点） */
.badge {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #ffffff;
  line-height: 1;
  z-index: 10;
}
</style>
