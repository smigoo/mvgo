<template>
  <div class="c-device-monitor-type-root">
    <div class="c-device-monitor-type-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.key"
        :class="['c-device-monitor-type-tab', { 'is-active': activeTab === tab.key }]"
        @click="activeTab = tab.key"
      >
        <div class="c-device-monitor-type-tab-name">{{ tab.name }}</div>
        <div v-if="tab.badge" class="c-device-monitor-type-tab-badge">{{ tab.badge }}</div>
      </div>
    </div>
    <div class="c-device-monitor-type-grid">
      <div
        v-for="device in currentDevices"
        :key="device.name"
        class="c-device-monitor-type-item"
      >
        <img v-if="device.icon" :src="device.icon" class="c-device-monitor-type-icon" />
        <div v-else class="c-device-monitor-type-icon-placeholder"></div>
        <div class="c-device-monitor-type-name">{{ device.name }}</div>
        <div class="c-device-monitor-type-value">
          <span :class="device.error > 0 ? 'is-error' : 'is-normal'">({{ device.error }}</span>
          <span class="is-sep">/</span>
          <span class="is-total">{{ device.total }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon7 from '../../resources/images/icon-8503.png'
import icon8 from '../../resources/images/icon-8532.png'
import icon9 from '../../resources/images/icon-8561.png'
import icon10 from '../../resources/images/icon-8590.png'
import icon11 from '../../resources/images/icon-8619.png'
import icon12 from '../../resources/images/icon-8648.png'
import icon13 from '../../resources/images/icon-8677.png'
import icon14 from '../../resources/images/icon-8706.png'
import icon15 from '../../resources/images/icon-8735.png'
import icon16 from '../../resources/images/icon-8764.png'

import { ref, computed} from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  if (builder) {
    runtimeBuilder = builder.runtimeBuilder || null
  }
} catch (e) {
  console.warn('[DeviceTypeChart] $mcComponentBuilder 初始化失败:', e)
}

const tabs = ref([
  { key: 'monitor', name: '监控', badge: '3/3740' },
  { key: 'lighting', name: '照明', badge: '3' },
  { key: 'vent', name: '通风', badge: '' },
  { key: 'power', name: '供配电', badge: '' },
  { key: 'fire', name: '消防', badge: '' },
  { key: 'traffic', name: '交通诱导', badge: '' }
])

const activeTab = ref('monitor')

const devicesData = {
  monitor: [
    { name: '摄像机', error: 2, total: 484, icon: icon7 },
    { name: '风速风向仪', error: 1, total: 484, icon: icon8 },
    { name: '超高检测器', error: 0, total: 484, icon: icon9 },
    { name: '烟道机器人', error: 0, total: 484, icon: icon10 },
    { name: '激光雷达', error: 0, total: 484, icon: icon11 },
    { name: 'CO₂传感器', error: 0, total: 484, icon: icon12 },
    { name: 'CO/VI检测器', error: 0, total: 484, icon: icon13 },
    { name: '温湿度传感器', error: 0, total: 484, icon: icon14 },
    { name: '压力传感器', error: 0, total: 484, icon: icon15 },
    { name: '光照度变送器', error: 0, total: 484, icon: icon16 },
    { name: '紧急电话', error: 0, total: 484, icon: null },
    { name: '水质监测设备', error: 0, total: 484, icon: null }
  ],
  lighting: [],
  vent: [],
  power: [],
  fire: [],
  traffic: []
}

const currentDevices = computed(() => devicesData[activeTab.value] || [])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-type-root {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-device-monitor-type-tabs {
  width: 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8px;
  flex-shrink: 0;
}

.c-device-monitor-type-tab {
  width: 34px;
  padding: 8px 0;
  text-align: center;
  cursor: pointer;
  font-size: 14px;
  color: #333333;
  border-radius: 4px;
  margin-bottom: 4px;
  transition: all 0.3s;

  &:hover {
    background: rgba(25, 144, 255, 0.05);
  }

  &.is-active {
    background: rgba(25, 144, 255, 0.1);
    color: #1990FF;
    font-weight: 700;
  }
}

.c-device-monitor-type-tab-name {
  line-height: 18px;
}

.c-device-monitor-type-tab-badge {
  font-size: 12px;
  color: #1990FF;
  line-height: 16px;
  margin-top: 2px;
  font-weight: 500;
}

.c-device-monitor-type-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 8px;
  align-content: start;
  min-width: 0;
  overflow-y: auto;
}

.c-device-monitor-type-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 64px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
  padding: 4px;
}

.c-device-monitor-type-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  margin-bottom: 2px;
}

.c-device-monitor-type-icon-placeholder {
  width: 27px;
  height: 32px;
  margin-bottom: 2px;
}

.c-device-monitor-type-name {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.c-device-monitor-type-value {
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  display: flex;
  align-items: center;

  .is-error {
    color: #F53F3F;
    font-weight: 700;
  }

  .is-normal {
    color: #08A3A5;
    font-weight: 700;
  }

  .is-sep {
    color: #333333;
    margin: 0 1px;
  }

  .is-total {
    color: #1990FF;
  }
}
</style>