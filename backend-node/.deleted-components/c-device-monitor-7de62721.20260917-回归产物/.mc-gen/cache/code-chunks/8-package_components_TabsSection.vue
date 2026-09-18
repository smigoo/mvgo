<template>
  <div class="c-device-monitor-tabs">
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      :class="['c-device-monitor-tab-item', { 'c-device-monitor-tab-item--active': tab.active }]"
      @click="handleTabClick(tab.id)"
    >
      <span class="c-device-monitor-tab-label">{{ tab.label }}</span>
      <span v-if="tab.badge" :class="['c-device-monitor-tab-badge', { 'c-device-monitor-tab-badge--active': tab.active }]">
        {{ tab.badge }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const tabs = ref([
  { id: 'monitor', label: '监控', badge: '3/3740', active: true },
  { id: 'lighting', label: '照明', badge: '3', active: false },
  { id: 'ventilation', label: '通风', badge: null, active: false },
  { id: 'fire', label: '消防', badge: null, active: false },
  { id: 'traffic', label: '交通诱导', badge: null, active: false },
  { id: 'power', label: '供配电', badge: null, active: false }
])

const handleTabClick = (tabId) => {
  tabs.value.forEach(tab => {
    tab.active = tab.id === tabId
  })
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-tabs {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.c-device-monitor-tab-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  cursor: pointer;
  transition: all 0.3s;
  border-radius: 4px;
  margin-bottom: 4px;

  &:not(.c-device-monitor-tab-item--active) {
    background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
    border: 1px solid #f0f5ff;

    .c-device-monitor-tab-label {
      color: #3b80e7;
      font-size: calc(@fontSize * 1);
      font-weight: normal;
      line-height: 1.14;
      writing-mode: vertical-rl;
      text-align: center;
    }

    .c-device-monitor-tab-badge {
      background: #f53f3f;
      color: #ffffff;
      font-size: calc(@fontSize * 0.857);
      font-weight: normal;
      padding: 2px 4px;
      border-radius: 2px;
      margin-top: 4px;
    }
  }

  &.c-device-monitor-tab-item--active {
    background: linear-gradient(180deg, #318aff 0%, #70bfff 100%);
    border: 1px solid #f0f5ff;

    .c-device-monitor-tab-label {
      color: #ffffff;
      font-size: calc(@fontSize * 1);
      font-weight: bold;
      line-height: 1.29;
      writing-mode: vertical-rl;
      text-align: center;
    }

    .c-device-monitor-tab-badge {
      background: #ffffff;
      color: #3b80e7;
      border: 1px solid #258dc8;
      font-size: calc(@fontSize * 1);
      font-weight: normal;
      padding: 4px 6px;
      border-radius: 4px;
      margin-top: 4px;
      line-height: 1.29;
    }
  }
}
</style>
