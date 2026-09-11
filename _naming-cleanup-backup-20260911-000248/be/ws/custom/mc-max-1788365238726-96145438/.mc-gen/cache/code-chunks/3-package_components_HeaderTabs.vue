<template>
  <div class="c-env-monitor-header-tabs">
    <!-- Tab 切换栏 -->
    <div class="c-env-monitor-tabs-list">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        class="c-env-monitor-tab-item"
        :class="{ 'c-env-monitor-tab-item--active': activeTab === tab.value }"
        @click="handleTabClick(tab.value)"
      >
        <span
          class="c-env-monitor-tab-text"
          :class="{ 'c-env-monitor-tab-text--active': activeTab === tab.value }"
        >{{ tab.label }}</span>
      </div>
    </div>

    <!-- 右侧图标区 -->
    <div class="c-env-monitor-tabs-icons">
      <div class="c-env-monitor-icon-btn" @click="handleChartIconClick" title="图表视图">
        <img :src="icon1" alt="图表" class="c-env-monitor-icon-img" />
      </div>
      <div class="c-env-monitor-icon-btn" @click="handleExportIconClick" title="数据导出">
        <img :src="icon2" alt="导出" class="c-env-monitor-icon-img" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  activeTab: {
    type: String,
    default: '一氧化碳'
  },
  icon1: {
    type: String,
    default: ''
  },
  icon2: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['tab-change'])

// Tab 列表，文字来自设计稿文字清单
const tabs = [
  { label: '一氧化碳', value: '一氧化碳' },
  { label: '能见度', value: '能见度' },
  { label: '洞内照明', value: '洞内照明' },
  { label: '洞外光强', value: '洞外光强' }
]

const handleTabClick = (value) => {
  if (props.activeTab === value) return
  emit('tab-change', value)
}

const handleChartIconClick = () => {
  // 图表视图切换，功能留给业务层扩展
}

const handleExportIconClick = () => {
  // 数据导出，功能留给业务层扩展
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.c-env-monitor-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  height: 100%;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: background 0.2s;

  &--active {
    background: linear-gradient(90deg, #1099b1 0%, #038fff 100%);
    border: 0.6px solid rgba(255, 255, 255, 1);
    border-radius: 3px;
  }
}

.c-env-monitor-tab-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  white-space: nowrap;

  &--active {
    color: #ffffff;
    text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-tabs-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    opacity: 0.8;
  }
}

.c-env-monitor-icon-img {
  width: 24px;
  height: 24px;
  display: block;
  flex-shrink: 0;
  object-fit: contain;
}
</style>