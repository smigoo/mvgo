<template>
  <div class="c-monitor-device-tabs">
    <div
      v-for="tab in tabs"
      :key="tab.key"
      :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === tab.key }]"
      @click="handleTabClick(tab.key)"
    >
      <div class="c-monitor-tab-content">
        <div class="c-monitor-tab-header">
          <span class="c-monitor-tab-label">{{ tab.label }}</span>
        </div>
        <div class="c-monitor-tab-stats">
          <div class="c-monitor-tab-stat">
            <span class="c-monitor-tab-stat-label">总数:</span>
            <span class="c-monitor-tab-stat-value">{{ tab.totalCount }}</span>
          </div>
          <div class="c-monitor-tab-stat">
            <span class="c-monitor-tab-stat-label">异常数:</span>
            <span class="c-monitor-tab-stat-value c-monitor-tab-stat-value--error">{{ tab.errorCount }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  tabs: {
    type: Array,
    default: () => []
  },
  activeTab: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['tab-change'])

const handleTabClick = (tabKey) => {
  if (tabKey !== props.activeTab) {
    emit('tab-change', tabKey)
  }
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
