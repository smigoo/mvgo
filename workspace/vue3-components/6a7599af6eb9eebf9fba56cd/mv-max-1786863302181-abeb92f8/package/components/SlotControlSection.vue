<template>
  <section class="slot-control-section">
    <div class="slot-control-title" aria-hidden="true">{{ title }}</div>
    <div class="slot-control-content">
      <div class="monitor-tabs-panel" :style="tabsPanelStyle">
        <button
          v-for="tab in tabs"
          :key="tab"
          type="button"
          :class="['monitor-tab-button', { 'monitor-tab-button--active': tab === activeTab }]"
          @click="handleTabClick(tab)"
        >
          <span
            v-if="tab === activeTab"
            class="tab-active-container"
            :style="activeTabStyle"
            aria-hidden="true"
          ></span>
          <span class="monitor-tab-text">{{ tab }}</span>
        </button>
      </div>

      <div class="tabs-icon-container">
        <img :src="tabsIcon" class="tabs-control-icon" alt="图表切换" />
        <span class="tabs-warning-badge">{{ badgeCount }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

// 本组件负责还原 Figma 中 slot-con 区域：包含指标 Tab 列表、右侧图表/列表切换图标与红色告警角标。
// Tab 状态由主组件传入，点击后通过 change 事件回传，确保图表区可以联动刷新。

// #region 1. Props定义
const props = defineProps({
  title: { type: String, default: 'slot-con' },
  tabs: { type: Array, default: () => ['一氧化碳', '洞内照明', '洞外光强', '能见度'] },
  activeTab: { type: String, default: '一氧化碳' },
  tabsBg: { type: String, default: '' },
  activeBg: { type: String, default: '' },
  tabsIcon: { type: String, default: '' },
  badgeCount: { type: [Number, String], default: 6 }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['change'])
// #endregion

// #region 4. 计算属性
const tabsPanelStyle = computed(() => ({
  backgroundImage: props.tabsBg ? `url(${props.tabsBg})` : 'none'
}))

const activeTabStyle = computed(() => ({
  backgroundImage: props.activeBg ? `url(${props.activeBg})` : 'none'
}))
// #endregion

// #region 5. 方法
const handleTabClick = (tabName) => {
  // 点击 Tab 后只向外抛出语义化名称，避免子组件直接修改父级状态导致数据流混乱。
  emit('change', tabName)
}
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.slot-control-section {
  width: 100%;
  height: 32px;
  padding: 0 20px;
  box-sizing: border-box;
  position: relative;
}

.slot-control-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.slot-control-content {
  width: 100%;
  height: 32px;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  min-width: 0;
  box-sizing: border-box;
}

.monitor-tabs-panel {
  width: 295px;
  height: 27px;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 3px 4px;
  box-sizing: border-box;
  background-size: 100% 100%;
  background-position: 0 0;
  background-repeat: no-repeat;
}

.monitor-tab-button {
  width: 72px;
  height: 21px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  box-sizing: border-box;
}

.monitor-tab-button--active {
  width: 78px;
}

.tab-active-container {
  position: absolute;
  left: 0;
  top: 0;
  width: 78px;
  height: 21px;
  background-size: 100% 100%;
  background-position: 0 0;
  background-repeat: no-repeat;
  pointer-events: none;
}

.monitor-tab-text {
  position: relative;
  z-index: 1;
  font-family: 'Source Han Sans CN', 'PingFang SC', Arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  white-space: nowrap;
}

.monitor-tab-button--active .monitor-tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 #006fe3;
}

.tabs-icon-container {
  width: 66px;
  height: 24px;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  box-sizing: border-box;
}

.tabs-control-icon {
  width: 52px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
  display: block;
}

.tabs-warning-badge {
  position: absolute;
  right: -1px;
  top: -5px;
  width: 14px;
  height: 14px;
  border-radius: 29px;
  background: #f53f3f;
  color: #ffffff;
  font-family: 'PingFang SC', Arial, sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  box-sizing: border-box;
}</style>