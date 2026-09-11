<template>
  <div class="c-monitor-device-list">
    <!-- 左侧导航 Tab -->
    <div class="c-monitor-sidebar-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.name"
        :class="['c-monitor-tab-item', { 'is-active': activeTab === tab.name }]"
        @click="activeTab = tab.name"
      >
        <span class="c-monitor-tab-text">{{ tab.name }}</span>
        <span
          v-if="tab.badge"
          :class="['c-monitor-tab-badge', { 'is-danger': tab.isDanger }]"
        >{{ tab.badge }}</span>
      </div>
    </div>

    <!-- 右侧设备网格 -->
    <div class="c-monitor-device-grid">
      <div
        v-for="device in devices"
        :key="device.name"
        class="c-monitor-device-item"
      >
        <img :src="device.icon" class="c-monitor-device-icon" />
        <div class="c-monitor-device-info">
          <span class="c-monitor-device-name">{{ device.name }}</span>
          <span
            :class="['c-monitor-device-value', device.hasError ? 'is-danger' : 'is-success']"
          >{{ device.value }}</span>
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
import icon3 from '../../resources/images/icon-8798.png'
import icon4 from '../../resources/images/icon-8817.png'

import { ref} from 'vue'

const tabs = ref([
  { name: '监控', badge: '3/3740', isDanger: false },
  { name: '照明', badge: '3', isDanger: true },
  { name: '通风', badge: '', isDanger: false },
  { name: '供配电', badge: '', isDanger: false },
  { name: '消防', badge: '', isDanger: false },
  { name: '交通诱导', badge: '', isDanger: false }
])

const activeTab = ref('监控')

const devices = ref([
  { name: '摄像机', value: '(2/484)', hasError: true, icon: icon7 },
  { name: '风速风向仪', value: '(1/484)', hasError: true, icon: icon8 },
  { name: '超高检测器', value: '(0/484)', hasError: false, icon: icon9 },
  { name: '烟道机器人', value: '(0/484)', hasError: false, icon: icon10 },
  { name: '激光雷达', value: '(0/484)', hasError: false, icon: icon11 },
  { name: 'CO2传感器', value: '(0/484)', hasError: false, icon: icon12 },
  { name: 'CO/VI检测器', value: '(0/484)', hasError: false, icon: icon13 },
  { name: '温湿度传感器', value: '(0/484)', hasError: false, icon: icon14 },
  { name: '压力传感器', value: '(0/484)', hasError: false, icon: icon15 },
  { name: '光照度变送器', value: '(0/484)', hasError: false, icon: icon16 },
  { name: '紧急电话', value: '(0/484)', hasError: false, icon: icon3 },
  { name: '水质监测设备', value: '(0/484)', hasError: false, icon: icon4 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-list {
  display: flex;
  width: 100%;
  height: 100%;
  gap: 10px;
}

.c-monitor-sidebar-tabs {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-tab-item {
  width: 46px;
  min-height: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  position: relative;
  transition: all 0.3s;
  gap: 2px;

  &.is-active {
    background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
    
    .c-monitor-tab-text {
      color: #ffffff;
      font-weight: 700;
    }
    
    .c-monitor-tab-badge {
      color: #ffffff;
    }
  }
}

.c-monitor-tab-text {
  font-size: 14px;
  color: #333333;
  font-weight: 400;
  line-height: 18px;
  text-align: center;
}

.c-monitor-tab-badge {
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  color: #333333;
  
  &.is-danger {
    background: #f53f3f;
    color: #ffffff;
    border-radius: 7px;
    padding: 0 4px;
    min-width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
}

.c-monitor-device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  align-content: start;
  overflow-y: auto;
}

.c-monitor-device-item {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(237, 244, 251, 0.6) 100%);
  border: 1px solid rgba(25, 144, 255, 0.2);
  border-radius: 4px;
  gap: 8px;
  position: relative;

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    border: 1px solid #1990ff;
  }

  &::before {
    top: -1px;
    left: -1px;
    border-right: none;
    border-bottom: none;
  }

  &::after {
    bottom: -1px;
    right: -1px;
    border-left: none;
    border-top: none;
  }
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
}

.c-monitor-device-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.c-monitor-device-name {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-monitor-device-value {
  font-size: 16px;
  font-weight: 500;
  line-height: 19px;

  &.is-danger {
    color: #f53f3f;
  }

  &.is-success {
    color: #08a3a5;
  }
}
</style>