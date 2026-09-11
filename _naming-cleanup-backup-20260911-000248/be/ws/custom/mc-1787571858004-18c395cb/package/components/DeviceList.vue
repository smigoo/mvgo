<template>
  <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-device-list">
    <!-- 左侧导航栏 -->
    <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-sidebar">
<div v-for="tab in tabs" :key="tab.key" :class="['c-monitor-tab-item', { 'is-active': activeTab === tab.key }]" @click="handleTabChange(tab.key)" >
        <span class="c-mc-max-1787565993770-7ada59d5-c-monitor-tab-label">{{ tab.label }}</span>
        <span v-if="tab.badge" class="c-mc-max-1787565993770-7ada59d5-c-monitor-tab-badge">{{ tab.badge }}</span>
      </div>
    </div>

    <!-- 右侧设备网格 -->
    <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-grid">
<div v-for="(device, index) in currentDevices" :key="index" class="c-mc-max-1787565993770-7ada59d5-c-monitor-device-card" >
        <img :src="device.icon" class="c-mc-max-1787565993770-7ada59d5-c-monitor-device-icon" :alt="device.name" />
        <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-device-info">
          <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-device-name">{{ device.name }}</div>
          <div :class="['c-monitor-device-value', { 'is-danger': device.abnormal > 0 }]">
            ({{ device.abnormal }}/{{ device.total }})
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon6 from '../../resources/images/icon-8503.png'
import icon7 from '../../resources/images/icon-8532.png'
import icon8 from '../../resources/images/icon-8561.png'
import icon9 from '../../resources/images/icon-8590.png'
import icon10 from '../../resources/images/icon-8619.png'
import icon11 from '../../resources/images/icon-8648.png'
import icon12 from '../../resources/images/icon-8677.png'
import icon13 from '../../resources/images/icon-8706.png'
import icon14 from '../../resources/images/icon-8735.png'
import icon15 from '../../resources/images/icon-8764.png'
import icon5 from '../../resources/images/icon-8473.png'

import { ref, computed} from 'vue'

// Tab 选项数据
const tabs = ref([ { key: 'monitor', label: '监控', badge: null }, { key: 'lighting', label: '照明', badge: '3' }, { key: 'ventilation', label: '通风', badge: null }, { key: 'power', label: '供配电', badge: null }, { key: 'fire', label: '消防', badge: null }, { key: 'traffic', label: '交通诱导', badge: null }
])

// 当前激活的 Tab
const activeTab = ref('monitor')

// 设备数据映射（按分类）
const deviceDataMap = { monitor: [ { name: '摄像机', icon: icon6, abnormal: 2, total: 484 }, { name: '风速风向仪', icon: icon7, abnormal: 1, total: 484 }, { name: '超高检测器', icon: icon8, abnormal: 0, total: 484 }, { name: '烟道机器人', icon: icon9, abnormal: 0, total: 484 }, { name: '激光雷达', icon: icon10, abnormal: 0, total: 484 }, { name: 'CO传感器', icon: icon11, abnormal: 0, total: 484 }, { name: 'CO/VI检测器', icon: icon12, abnormal: 0, total: 484 }, { name: '温湿度传感器', icon: icon13, abnormal: 0, total: 484 }, { name: '压力传感器', icon: icon14, abnormal: 0, total: 484 }, { name: '光照度变送器', icon: icon15, abnormal: 0, total: 484 }, { name: '紧急电话', icon: icon5, abnormal: 0, total: 484 }, { name: '水质监测设备', icon: icon6, abnormal: 0, total: 484 }
  ],
  lighting: [
    { name: '照明控制器', icon: icon15, abnormal: 3, total: 120 },
    { name: '光强检测器', icon: icon10, abnormal: 0, total: 80 },
    { name: '调光模块', icon: icon14, abnormal: 0, total: 45 }
  ],
  ventilation: [
    { name: '射流风机', icon: icon7, abnormal: 0, total: 50 },
    { name: '轴流风机', icon: icon9, abnormal: 0, total: 30 }
  ],
  power: [
    { name: '低压配电柜', icon: icon14, abnormal: 0, total: 30 },
    { name: 'UPS电源', icon: icon5, abnormal: 0, total: 12 }
  ],
  fire: [
    { name: '火灾报警控制器', icon: icon11, abnormal: 0, total: 100 },
    { name: '手动报警按钮', icon: icon12, abnormal: 0, total: 200 }
  ],
  traffic: [
    { name: '可变情报板', icon: icon12, abnormal: 0, total: 20 },
    { name: '车道指示器', icon: icon8, abnormal: 0, total: 40 }
  ]
}

// 当前分类的设备列表
const currentDevices = computed(() => deviceDataMap[activeTab.value] || [])

// Tab 切换处理
const handleTabChange = (key) => { if (activeTab.value === key) return
  activeTab.value = key
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-list {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 8px;
}

.c-monitor-sidebar {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.c-monitor-tab-item {
  position: relative;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  color: rgba(51, 51, 51, 1);
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    background: rgba(25, 144, 255, 0.08);
  }

  &.is-active {
    background: rgba(25, 144, 255, 1);
    color: #ffffff;
    font-weight: 700;

    &:hover {
      background: rgba(25, 144, 255, 1);
    }
  }
}

.c-monitor-tab-label {
  font-size: 14px;
  line-height: 16px;
  text-align: center;
  white-space: nowrap;
}

.c-monitor-tab-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #f53f3f;
  border-radius: 7px;
  font-size: 10px;
  font-family: Roboto, sans-serif;
  font-weight: 500;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.c-monitor-grid {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  align-content: start;
}

.c-monitor-device-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(25, 144, 255, 0.15);
  border-radius: 4px;
  gap: 8px;
  box-sizing: border-box;
  height: 64px;
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-monitor-device-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  gap: 2px;
  min-height: 0;}

.c-monitor-device-name {
  font-size: 12px;
  font-weight: 400;
  color: rgba(51, 51, 51, 1);
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-monitor-device-value {
  font-size: 16px;
  font-family: Roboto, sans-serif;
  font-weight: 500;
  color: #08a3a5;
  line-height: 18.75px;

  &.is-danger {
    color: #f53f3f;
  }
}
</style>