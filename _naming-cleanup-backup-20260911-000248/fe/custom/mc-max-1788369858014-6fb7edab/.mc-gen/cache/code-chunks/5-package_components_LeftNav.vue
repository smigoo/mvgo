<template>
  <div class="c-monitor-left-nav">
    <div
      v-for="tab in navTabs"
      :key="tab.value"
      :class="['c-monitor-nav-item', { 'c-monitor-nav-item--active': activeTab === tab.value }]"
      @click="handleTabClick(tab.value)"
    >
      <span class="c-monitor-nav-label">{{ tab.label }}</span>
      <span v-if="tab.badge" class="c-monitor-nav-badge">{{ tab.badge }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  activeTab: {
    type: String,
    default: '监控'
  }
})

const emit = defineEmits(['tab-change'])

// 导航标签列表（从设计稿文字清单提取）
const navTabs = ref([
  { label: '监控', value: '监控', badge: null },
  { label: '照明', value: '照明', badge: '3' },
  { label: '通风', value: '通风', badge: null },
  { label: '消防', value: '消防', badge: null },
  { label: '交通诱导', value: '交通诱导', badge: null },
  { label: '供配电', value: '供配电', badge: null }
])

const handleTabClick = (value) => {
  emit('tab-change', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
