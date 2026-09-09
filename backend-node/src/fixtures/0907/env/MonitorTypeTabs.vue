<template>
  <div class="c-env-monitor-tabs-section" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <div class="c-env-monitor-tabs-container">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.value"
        :class="[
          'c-env-monitor-tab-item',
          { 'c-env-monitor-tab-item--active': currentTab === tab.value }
        ]"
        :style="getTabStyle(index)"
        @click="handleTabClick(tab.value)"
      >
        <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bgtabActive from '../../resources/images/bg-tab-active-7891.png'


import { ref, computed} from 'vue'

// Tab 选项数据
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

// 当前激活的 tab
const currentTab = ref('co')

// 计算每个 tab 的样式
const getTabStyle = (index) => {
  const isActive = currentTab.value === tabs.value[index].value
  if (isActive && index === 0) {
    return {
      backgroundImage: `url(${bgtabActive})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }
  }
  return {}
}

// Tab 切换处理
const handleTabClick = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  // 触发父组件的事件或执行其他逻辑
}

// 暴露给父组件
defineExpose({
  currentTab
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-section {
height: 100%;

  width: 100%;
  flex-shrink: 0;
}

.c-env-monitor-tabs-container {
  display: flex;
  align-items: center;
  gap: 0;
}

.c-env-monitor-tab-item {
  flex: 1;
  height: 27px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;

  &--active {
    .c-env-monitor-tab-text {
      color: #ffffff;
      text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
    }
  }

  &:not(.c-env-monitor-tab-item--active) {
    .c-env-monitor-tab-text {
      color: #2c9bea;
    }
  }
}

.c-env-monitor-tab-text {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 500;
  line-min-height: 12px;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>