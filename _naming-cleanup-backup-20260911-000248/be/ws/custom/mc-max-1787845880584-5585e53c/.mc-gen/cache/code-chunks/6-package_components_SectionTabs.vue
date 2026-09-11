<template>
  <div class="c-env-monitor-section-tabs">
    <!-- Tab 列表容器 -->
    <div class="c-env-monitor-tabs-list">
      <div
        v-for="tab in tabs"
        :key="tab"
        :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === tab }]"
        @click="handleTabClick(tab)"
      >
        {{ tab }}
      </div>
    </div>

    <!-- 视图切换图标组 -->
    <div class="c-env-monitor-tabs-icons">
      <div class="c-env-monitor-icon-wrapper">
        <img :src="icon1" alt="柱状图视图" class="c-env-monitor-icon" />
      </div>
      <div class="c-env-monitor-icon-wrapper c-env-monitor-icon-wrapper--badge">
        <img :src="icon2" alt="列表视图" class="c-env-monitor-icon" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

// Props
const props = defineProps({
  activeTab: {
    type: String,
    default: '一氧化碳'
  }
})

// Emits
const emit = defineEmits(['tab-change'])

// Tab 列表（从设计稿文字清单提取）
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强']

// 资源变量（系统注入）
const icon1 = 'icon1'
const icon2 = 'icon2'

// 事件处理
const handleTabClick = (tab) => {
  emit('tab-change', tab)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>