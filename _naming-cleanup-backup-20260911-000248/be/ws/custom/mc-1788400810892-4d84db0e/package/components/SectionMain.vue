<template>
  <div class="c-monitor-main">
    <!-- 左侧垂直Tab切换栏 -->
    <div class="c-monitor-tab-bar">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === tab.id }]"
        @click="handleTabChange(tab.id)"
      >
        <span class="c-monitor-tab-label">{{ tab.name }}</span>
        <span v-if="tab.badge" :class="['c-monitor-tab-badge', tab.id === 'monitor' ? 'c-monitor-tab-badge--blue' : 'c-monitor-tab-badge--red']">
          {{ tab.badge }}
        </span>
      </div>
    </div>

    <!-- 右侧内容区 -->
    <div class="c-monitor-content">
      <!-- 顶部切换开关：隧道设备 / 南北拦线设备 -->
      <div class="c-monitor-switch-row">
        <!-- 激活态：隧道设备 -->
        <div
          :class="['c-monitor-switch-card', 'c-monitor-switch-card--active', { 'c-monitor-switch-card--selected': activeSwitch === 'tunnel' }]"
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          @click="handleSwitchChange('tunnel')"
        >
          <div class="c-monitor-switch-icon-wrap">
            <img :src="icon1" class="c-monitor-switch-icon" alt="隧道设备图标"/>
          </div>
          <div class="c-monitor-switch-info">
            <span class="c-monitor-switch-title c-monitor-switch-title--active" :style="{ backgroundImage: 'url(' + bg8 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">隧道设备</span>
            <div class="c-monitor-switch-stat-row" :style="{ backgroundImage: 'url(' + bg9 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
              <span class="c-monitor-switch-stat-label" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">总&nbsp;&nbsp;数：</span>
              <span class="c-monitor-switch-stat-value c-monitor-switch-stat-value--blue" :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">56302</span>
            </div>
            <div class="c-monitor-switch-stat-row">
              <span class="c-monitor-switch-stat-label">异常数：</span>
              <span class="c-monitor-switch-stat-value c-monitor-switch-stat-value--red" :style="{ backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">5</span>
            </div>
          </div>
        </div>

        <!-- 默认态：南北拦线设备 -->
        <div
          :class="['c-monitor-switch-card', 'c-monitor-switch-card--default', { 'c-monitor-switch-card--selected': activeSwitch === 'barrier' }]"
          :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          @click="handleSwitchChange('barrier')"
        >
          <div class="c-monitor-switch-icon-wrap">
            <img :src="icon2" class="c-monitor-switch-icon" alt="南北拦线设备图标"  :style="{ backgroundImage: 'url(' + bg10 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"/>
          </div>
          <div class="c-monitor-switch-info">
            <span class="c-monitor-switch-title c-monitor-switch-title--default" :style="{ backgroundImage: 'url(' + bg11 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">南北拦线设备</span>
            <div class="c-monitor-switch-stat-row">
              <span class="c-monitor-switch-stat-label">总&nbsp;&nbsp;数：</span>
              <span class="c-monitor-switch-stat-value c-monitor-switch-stat-value--blue">1280</span>
            </div>
            <div class="c-monitor-switch-stat-row">
              <span class="c-monitor-switch-stat-label">异常数：</span>
              <span class="c-monitor-switch-stat-value c-monitor-switch-stat-value--red">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 设备类型监测网格 4行3列 -->
      <div class="c-monitor-device-grid">
        <div
          v-for="device in deviceList"
          :key="device.id"
          class="c-monitor-device-card"
          :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          @click="handleDeviceClick(device)"
        >
          <img :src="device.icon" class="c-monitor-device-icon" :alt="device.name" />
          <span class="c-monitor-device-name">{{ device.name }}</span>
          <div class="c-monitor-device-value">
            <span :class="['c-monitor-device-num', device.abnormal > 0 ? 'c-monitor-device-num--red' : 'c-monitor-device-num--normal']">
              {{ device.abnormal }}
            </span>
            <span class="c-monitor-device-total">/{{ device.total }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-8788.png'
import icon1 from '../../resources/images/icon-8798.png'
import bg8 from '../../resources/images/bg-8439.png'
import bg2 from '../../resources/images/bg-8807.png'
import icon2 from '../../resources/images/icon-8817.png'
import icon3 from '../../resources/images/icon-8444.png'
import icon14 from '../../resources/images/icon-8764.png'
import icon4 from '../../resources/images/icon-8473.png'
import icon5 from '../../resources/images/icon-8503.png'
import icon6 from '../../resources/images/icon-8532.png'
import icon7 from '../../resources/images/icon-8561.png'
import icon8 from '../../resources/images/icon-8590.png'
import icon9 from '../../resources/images/icon-8619.png'
import icon10 from '../../resources/images/icon-8648.png'
import icon11 from '../../resources/images/icon-8677.png'
import icon12 from '../../resources/images/icon-8706.png'
import icon13 from '../../resources/images/icon-8735.png'
const bg9 = bg8
const bg4 = bg8
const bg5 = bg8
const bg6 = bg8
const bg10 = bg8
const bg11 = bg8
const bg3 = bg8
const bg14 = bg8
const bg13 = bg8
const bg12 = bg8
const bg7 = bg8


import { ref, watch} from 'vue'

// 资源变量由系统注入
/* eslint-disable no-undef */

// 左侧Tab数据
const tabs = ref([
  { id: 'monitor', name: '监控', badge: '3/3740' },
  { id: 'lighting', name: '照明', badge: '3' },
  { id: 'ventilation', name: '通风', badge: null },
  { id: 'power', name: '供配电', badge: null },
  { id: 'fire', name: '消防', badge: null },
  { id: 'traffic', name: '交通诱导', badge: null },
])

const activeTab = ref('monitor')
const activeSwitch = ref('tunnel')

// 设备列表（图标顺序与资源映射对应：icon3~icon14）
const deviceList = ref([
  { id: 'camera', name: '摄像机', icon: icon3, abnormal: 2, total: 484 },
  { id: 'wind-sensor', name: '风速风向仪', icon: icon4, abnormal: 1, total: 484 },
  { id: 'overheight', name: '超高检测器', icon: icon5, abnormal: 0, total: 484 },
  { id: 'flue-robot', name: '烟道机器人', icon: icon6, abnormal: 0, total: 484 },
  { id: 'lidar', name: '激光雷达', icon: icon7, abnormal: 0, total: 484 },
  { id: 'co2', name: 'CO2传感器', icon: icon8, abnormal: 0, total: 484 },
  { id: 'co-vi', name: 'CO/VI检测器', icon: icon9, abnormal: 0, total: 484 },
  { id: 'temp-humidity', name: '温湿度传感器', icon: icon10, abnormal: 0, total: 484 },
  { id: 'pressure', name: '压力传感器', icon: icon11, abnormal: 0, total: 484 },
  { id: 'illuminance', name: '光照度变送器', icon: icon12, abnormal: 0, total: 484 },
  { id: 'emergency-phone', name: '紧急电话', icon: icon13, abnormal: 0, total: 484 },
  { id: 'water-monitor', name: '水质监测设备', icon: icon14, abnormal: 0, total: 484 },
])

const handleTabChange = (tabId) => {
  if (activeTab.value === tabId) return
  activeTab.value = tabId
}

const handleSwitchChange = (switchId) => {
  if (activeSwitch.value === switchId) return
  activeSwitch.value = switchId
}

const handleDeviceClick = (device) => {
  // 设备卡片点击，可扩展跳转逻辑
  console.log('[SectionMain] 设备卡片点击:', device.id, device.name)
}

watch(activeTab, (newTab) => {
  console.log('[SectionMain] Tab切换:', newTab)
})

watch(activeSwitch, (newSwitch) => {
  console.log('[SectionMain] 切换开关:', newSwitch)
})
</script>

<style lang="less" scoped>
@fontSize: 14px;

@import '../../resources/styles/index.less';

.c-monitor-main {
  display: flex;
  flex-direction: row;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.c-monitor-tab-bar {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
}

.c-monitor-tab-item {
  width: 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  cursor: pointer;
  background: rgba(237, 244, 251, 1);
  position: relative;
  box-sizing: border-box;

  &--active {
    background: rgba(25, 144, 255, 0.15);

    .c-monitor-tab-label {
      color: rgba(25, 144, 255, 1);
      font-weight: 700;
    }
  }
}

.c-monitor-tab-label {
  font-size: @fontSize;
  color: rgba(51, 51, 51, 1);
  font-weight: 400;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 2px;
  white-space: nowrap;
  line-height: 1.2;
}

.c-monitor-tab-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(@fontSize * 0.7143);
  font-weight: 500;
  line-height: 1;
  border-radius: 7px;
  padding: 2px 4px;
  margin-top: 4px;
  min-width: 14px;
  height: 14px;
  white-space: nowrap;

  &--blue {
    background: rgba(25, 144, 255, 0.15);
    color: rgba(25, 144, 255, 1);
  }

  &--red {
    background: rgba(255, 77, 79, 0.15);
    color: rgba(255, 77, 79, 1);
  }
}

.c-monitor-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  box-sizing: border-box;
  overflow: hidden;
  min-height: 0;}

/* 切换开关区域 */
.c-monitor-switch-row {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  height: 65px;
  gap: 0;
}

.c-monitor-switch-card {
  width: 50%;
  height: 65px;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0 8px;
  box-sizing: border-box;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  gap: 8px;
}

.c-monitor-switch-icon-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-switch-icon {
  width: 35px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-monitor-switch-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.c-monitor-switch-title {
  font-size: calc(@fontSize * 0.8571);
  font-weight: 400;
  line-height: 1.3;
  white-space: nowrap;

  &--active {
    color: rgba(255, 255, 255, 1);
  }

  &--default {
    color: rgba(51, 51, 51, 1);
  }
}

.c-monitor-switch-stat-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
}

.c-monitor-switch-stat-label {
  font-size: @fontSize;
  color: rgba(51, 51, 51, 1);
  font-weight: 400;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-monitor-switch-stat-value {
  font-size: calc(@fontSize * 1.4286);
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;

  &--blue {
    color: rgba(25, 144, 255, 1);
  }

  &--red {
    color: rgba(255, 77, 79, 1);
  }
}

/* 设备类型网格 */
.c-monitor-device-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 4px 0;
  overflow: hidden;
  align-content: start;
}

.c-monitor-device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 72px;
  box-sizing: border-box;
  cursor: pointer;
  overflow: hidden;
  padding: 4px;
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-monitor-device-name {
  font-size: calc(@fontSize * 0.8571);
  color: rgba(51, 51, 51, 1);
  font-weight: 400;
  text-align: center;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.c-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 0;
}

.c-monitor-device-num {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  line-height: 1;

  &--red {
    color: rgba(255, 77, 79, 1);
  }

  &--normal {
    color: rgba(51, 51, 51, 1);
  }
}

.c-monitor-device-total {
  font-size: calc(@fontSize * 1.1429);
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
  line-height: 1;
}
</style>