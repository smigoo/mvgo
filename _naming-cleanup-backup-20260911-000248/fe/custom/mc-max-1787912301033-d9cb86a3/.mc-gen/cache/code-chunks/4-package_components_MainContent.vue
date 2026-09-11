<template>
  <div class="c-monitor-main-content">
    <!-- 左侧导航 -->
    <div class="c-monitor-nav-tabs">
      <div
        v-for="item in navItems"
        :key="item.value"
        :class="['c-monitor-nav-item', { active: activeCategory === item.value }]"
        @click="handleCategoryClick(item.value)"
      >
        <span class="c-monitor-nav-label">{{ item.label }}</span>
        <span v-if="item.badge" class="c-monitor-nav-badge">{{ item.badge }}</span>
      </div>
    </div>

    <!-- 右侧设备网格 -->
    <div class="c-monitor-device-grid">
      <div
        v-for="device in deviceList"
        :key="device.id"
        class="c-monitor-device-card"
        @click="handleDeviceClick(device)"
      >
        <div class="c-monitor-device-icon-wrapper">
          <div class="c-monitor-device-icon-bg"></div>
          <div class="c-monitor-device-icon-inner"></div>
        </div>
        <div class="c-monitor-device-info">
          <div class="c-monitor-device-name">{{ device.name }}</div>
          <div class="c-monitor-device-count">{{ device.count }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  navItems: {
    type: Array,
    default: () => []
  },
  deviceList: {
    type: Array,
    default: () => []
  },
  activeCategory: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['category-change', 'device-click'])

const handleCategoryClick = (value) => {
  emit('category-change', value)
}

const handleDeviceClick = (device) => {
  emit('device-click', device)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
```