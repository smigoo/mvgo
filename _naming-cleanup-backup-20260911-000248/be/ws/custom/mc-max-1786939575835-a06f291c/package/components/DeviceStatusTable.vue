<template>
  <div class="c-device-status-root">
    <div class="c-device-status-sidebar">
      <div
        v-for="tab in tabs"
        :key="tab.name"
        :class="['c-device-status-tab', { 'is-active': tab.active }]"
        @click="handleTabClick(tab)"
      >
        <div class="c-device-status-tab-name">{{ tab.name }}</div>
        <div v-if="tab.badge" class="c-device-status-tab-badge">{{ tab.badge }}</div>
      </div>
    </div>
    <div class="c-device-status-grid">
      <div
        v-for="item in deviceList"
        :key="item.name"
        class="c-device-status-item"
      >
        <div class="c-device-status-item-icon">
          <img :src="item.icon" :alt="item.name" />
        </div>
        <div class="c-device-status-item-info">
          <div class="c-device-status-item-name">{{ item.name }}</div>
          <div class="c-device-status-item-value">
            <span :class="item.error > 0 ? 'c-device-status-val-error' : 'c-device-status-val-normal'">{{ item.error }}</span>
            <span class="c-device-status-val-sep">/</span>
            <span class="c-device-status-val-total">{{ item.total }}</span>
          </div>
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
  { name: '监控', active: true, badge: '3/3740' },
  { name: '照明', active: false, badge: '3' },
  { name: '通风', active: false, badge: '' },
  { name: '供配电', active: false, badge: '' },
  { name: '消防', active: false, badge: '' },
  { name: '交通诱导', active: false, badge: '' }
])

const deviceList = ref([
  { name: '摄像机', error: 2, total: 484, icon: icon7 },
  { name: '风速风向仪', error: 1, total: 484, icon: icon8 },
  { name: '超高检测器', error: 0, total: 484, icon: icon9 },
  { name: '烟道机器人', error: 0, total: 484, icon: icon10 },
  { name: '激光雷达', error: 0, total: 484, icon: icon11 },
  { name: 'CO2传感器', error: 0, total: 484, icon: icon12 },
  { name: 'CO/VI检测器', error: 0, total: 484, icon: icon13 },
  { name: '温湿度传感器', error: 0, total: 484, icon: icon14 },
  { name: '压力传感器', error: 0, total: 484, icon: icon15 },
  { name: '光照度变送器', error: 0, total: 484, icon: icon16 },
  { name: '紧急电话', error: 0, total: 484, icon: icon3 },
  { name: '水质监测设备', error: 0, total: 484, icon: icon4 }
])

const handleTabClick = (tab) => {
  tabs.value.forEach(t => t.active = false)
  tab.active = true
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-status-root {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  gap: 6px;
}

.c-device-status-sidebar {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 4px;
}

.c-device-status-tab {
  width: 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  padding: 6px 0;
  border-radius: 4px;
  transition: all 0.3s;

  &.is-active {
    background: rgba(25, 144, 255, 0.1);
    
    .c-device-status-tab-name {
      color: #1990FF;
      font-weight: 700;
    }
  }
}

.c-device-status-tab-name {
  font-size: 14px;
  color: #333333;
  text-align: center;
  line-height: 18px;
}

.c-device-status-tab-badge {
  font-size: 12px;
  color: #1990FF;
  margin-top: 2px;
  font-weight: 500;
}

.c-device-status-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 8px;
  min-width: 0;
  padding: 4px 0;
}

.c-device-status-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
  gap: 8px;
  box-sizing: border-box;
}

.c-device-status-item-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.c-device-status-item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;}

.c-device-status-item-name {
  font-size: 12px;
  color: #333333;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-device-status-item-value {
  font-size: 16px;
  font-weight: 500;
  line-height: 18px;
  display: flex;
  align-items: baseline;
}

.c-device-status-val-error {
  color: #F53F3F;
}

.c-device-status-val-normal {
  color: #08A3A5;
}

.c-device-status-val-sep {
  color: #333333;
  margin: 0 1px;
}

.c-device-status-val-total {
  color: #1990FF;
}
</style>