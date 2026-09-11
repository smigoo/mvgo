<template>
  <div class="c-monitor-tabs-wrapper">
    <div class="c-monitor-tabs-list">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.value"
        :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === tab.value }]"
        @click="handleTabClick(tab.value)"
      >
        <div class="c-monitor-tab-bg" :style="getTabBgStyle(tab.value)"></div>
        <div class="c-monitor-tab-content">
          <div class="c-monitor-tab-title">{{ tab.label }}</div>
          <div class="c-monitor-tab-stats">
            <div class="c-monitor-tab-stat-row">
              <span class="c-monitor-tab-stat-label">总数:</span>
              <span class="c-monitor-tab-stat-value">{{ tab.total }}</span>
            </div>
            <div class="c-monitor-tab-stat-row">
              <span class="c-monitor-tab-stat-label">异常数:</span>
              <span class="c-monitor-tab-stat-value c-monitor-tab-stat-value--danger">{{ tab.abnormal }}</span>
            </div>
          </div>
          <img v-if="tab.icon" :src="tab.icon" class="c-monitor-tab-icon" alt="icon" />
        </div>
        <div v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const activeTab = ref('tunnel')

const tabs = ref([
  {
    label: '隧道设备',
    value: 'tunnel',
    total: '56302',
    abnormal: '5',
    icon: icon1,
    badge: null
  },
  {
    label: '南北接线设备',
    value: 'connection',
    total: '1280',
    abnormal: '3',
    icon: icon2,
    badge: null
  }
])

const handleTabClick = (value) => {
  if (activeTab.value !== value) {
    activeTab.value = value
  }
}

const getTabBgStyle = (value) => {
  if (activeTab.value === value) {
    return {
      backgroundImage: `url(${bg1})`
    }
  }
  return {
    backgroundImage: `url(${bg2})`
  }
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-tabs-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.c-monitor-tabs-list {
  display: flex;
  gap: 12px;
}

.c-monitor-tab-item {
  position: relative;
  flex: 1;
  min-height: 64px;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
  }
}

.c-monitor-tab-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 6px;
}

.c-monitor-tab-content {
  position: relative;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  z-index: 1;
}

.c-monitor-tab-title {
  font-size: calc(@fontSize * 0.86);
  font-weight: 400;
  color: @color-tab-title;
  line-height: 1.2;
}

.c-monitor-tab-item--active .c-monitor-tab-title {
  color: @color-tab-title-active;
  font-weight: @fontWeightStrong;
}

.c-monitor-tab-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-tab-stat-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-tab-stat-label {
  font-size: calc(@fontSize * 1);
  color: @color-tab-stat-label;
  line-height: 1.5;
}

.c-monitor-tab-item--active .c-monitor-tab-stat-label {
  color: @color-tab-stat-label-active;
}

.c-monitor-tab-stat-value {
  font-size: calc(@fontSize * 1.43);
  font-weight: @fontWeightStrong;
  color: @color-tab-stat-value;
  line-height: 1.17;
}

.c-monitor-tab-item--active .c-monitor-tab-stat-value {
  color: @color-tab-stat-value-active;
}

.c-monitor-tab-stat-value--danger {
  color: @color-danger;
}

.c-monitor-tab-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 35px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-monitor-tab-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: @color-danger;
  color: #ffffff;
  font-size: calc(@fontSize * 0.86);
  font-weight: @fontWeightStrong;
  border-radius: 9px;
  z-index: 2;
}
</style>
