<template>
  <div class="monitor-tabs-root">
    <div class="monitor-tabs-title" aria-hidden="true">{{ title }}</div>

    <div class="monitor-tabs-toolbar">
      <div
        class="monitor-tabs-list"
        :style="{ backgroundImage: `url(${tabBackgroundImage})` }"
        role="tablist"
        aria-label="环境监测指标切换"
      >
        <button
          v-for="(tab, index) in tabs"
          :key="`${tab}-${index}`"
          class="monitor-tab-button"
          :class="{ 'monitor-tab-button--active': index === currentActiveIndex }"
          type="button"
          role="tab"
          :aria-selected="index === currentActiveIndex"
          @click="handleTabClick(index)"
        >
          <span
            v-if="index === currentActiveIndex"
            class="tab-active-container"
            :style="{ backgroundImage: `url(${activeBackgroundImage})` }"
          ></span>
          <span class="monitor-tab-label">{{ tab }}</span>
        </button>
      </div>

      <div class="tabs-icon-container">
        <img :src="tabsIcon" class="tabs-mode-icon" alt="图表与列表切换" />
      </div>

      <div class="monitor-warning-badge" aria-label="告警数量">
        {{ warningCount }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

// 本组件负责还原 Figma 的 slot-con 区域：包含标题占位、Tab 背景、激活态背景、右侧模式图标与红色告警角标。
// Tab 列表和告警数量均可能由接口更新，因此在内部使用 ref 同步 props，保证 API 绑定和用户交互都可响应。

// #region 1. Props定义
const props = defineProps({
  title: { type: String, default: 'slot-con' },
  tabs: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  tabBackgroundImage: { type: String, default: '' },
  activeBackgroundImage: { type: String, default: '' },
  tabsIcon: { type: String, default: '' },
  warningCount: { type: Number, default: 0 }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['change'])
// #endregion

// #region 3. 响应式状态
const currentActiveIndex = ref(props.activeIndex)
// #endregion

// #region 4. 方法
const handleTabClick = (nextIndex) => {
  // 点击当前项时不重复触发，避免父组件重复刷新图表数据。
  if (nextIndex === currentActiveIndex.value) return
  currentActiveIndex.value = nextIndex
  emit('change', nextIndex)
}
// #endregion

// #region 5. 生命周期与监听
watch(
  () => props.activeIndex,
  (nextIndex) => {
    // 父组件或 API 绑定更新激活项时，同步本地高亮状态。
    if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < props.tabs.length) {
      currentActiveIndex.value = nextIndex
    }
  }
)
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.monitor-tabs-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  position: relative;
  min-width: 0;
}

.monitor-tabs-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.monitor-tabs-toolbar {
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  min-width: 0;
}

.monitor-tabs-list {
  width: 295px;
  height: 27px;
  margin-top: 0;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 3px 4px;
  background-size: 100% 100%;
  background-position: 0 0;
  background-repeat: no-repeat;
  overflow: hidden;
  flex-shrink: 0;
}

.monitor-tab-button {
  position: relative;
  z-index: 1;
  height: 21px;
  box-sizing: border-box;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #2c9bea;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', Arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  outline: none;
}

.monitor-tab-button:nth-child(1),
.monitor-tab-button:nth-child(2),
.monitor-tab-button:nth-child(3) {
  width: 78px;
}

.monitor-tab-button:nth-child(4) {
  width: 53px;
}

.monitor-tab-button--active {
  color: #ffffff;
  text-shadow: 0 0.6px 0 #006fe3;
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
  z-index: -1;
}

.monitor-tab-label {
  position: relative;
  z-index: 1;
  display: inline-block;
  white-space: nowrap;
}

.tabs-icon-container {
  width: 52px;
  height: 24px;
  margin-left: 33px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.tabs-mode-icon {
  display: block;
  width: 52px;
  height: 24px;
  object-fit: contain;
}

.monitor-warning-badge {
  position: absolute;
  right: 0;
  top: 0;
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
  overflow: hidden;
}</style>