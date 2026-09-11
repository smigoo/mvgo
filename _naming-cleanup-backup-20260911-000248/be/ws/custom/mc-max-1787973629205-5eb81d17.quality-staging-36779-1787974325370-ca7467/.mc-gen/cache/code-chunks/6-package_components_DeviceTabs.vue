<template>
  <div class="c-monitor-device-tabs">
    <div
      v-for="tab in tabs"
      :key="tab.value"
      :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': currentTab === tab.value }]"
      @click="handleTabChange(tab.value)"
    >
      <div class="c-monitor-tab-content">
        <div class="c-monitor-tab-header">
          <img v-if="tab.icon" :src="tab.icon" class="c-monitor-tab-icon" alt="" />
          <span class="c-monitor-tab-label">{{ tab.label }}</span>
        </div>
        <div class="c-monitor-tab-stats">
          <div class="c-monitor-stat-line">
            <span class="c-monitor-stat-label">总数:</span>
            <span class="c-monitor-stat-value">{{ tab.total }}</span>
          </div>
          <div class="c-monitor-stat-line">
            <span class="c-monitor-stat-label">异常数:</span>
            <span class="c-monitor-stat-value c-monitor-stat-value--danger">{{ tab.abnormal }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 从父组件传入的资源变量（由系统注入）
const props = defineProps({
  icon1: { type: String, default: '' },
  icon2: { type: String, default: '' }
})

// Tab 配置
const tabs = ref([
  {
    value: 'sensor',
    label: '传感设备',
    icon: props.icon1,
    total: '56302',
    abnormal: '5'
  },
  {
    value: 'facility',
    label: '房屋建筑设备',
    icon: props.icon2,
    total: '1280',
    abnormal: '3'
  }
])

// 当前激活的 Tab
const currentTab = ref('sensor')

// Tab 切换处理
const handleTabChange = (value) => {
  if (currentTab.value === value) return
  currentTab.value = value
  // 父组件可通过监听事件处理切换后的数据更新
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
