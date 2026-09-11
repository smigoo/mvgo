<template>
  <div class="c-monitor-main-content">
    <!-- 顶部切换区域（隧道设备 / 南北接线设备） -->
    <div class="c-monitor-switch-bar">
      <div
        :class="['c-monitor-switch-item', 'c-monitor-switch-item--active', { 'c-monitor-switch-item--selected': activeSwitch === 'tunnel' }]"
        @click="handleSwitchChange('tunnel')"
      >
        <div class="c-monitor-switch-item-icon">
          <img :src="icon1" alt="隧道设备图标" class="c-monitor-switch-icon-img"  :style="{ backgroundImage: 'url(' + bg11 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"/>
        </div>
        <div class="c-monitor-switch-item-info">
          <div class="c-monitor-switch-item-title" :style="{ backgroundImage: 'url(' + bg12 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">隧道设备</div>
          <div class="c-monitor-switch-item-stats" :style="{ backgroundImage: 'url(' + bg13 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
            <div class="c-monitor-switch-stat-line" :style="{ backgroundImage: 'url(' + bg8 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
              <span class="c-monitor-switch-stat-label" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">总数:</span>
              <span class="c-monitor-switch-stat-value c-monitor-switch-stat-value--blue" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">56302</span>
            </div>
            <div class="c-monitor-switch-stat-line">
              <span class="c-monitor-switch-stat-label">异常数:</span>
              <span class="c-monitor-switch-stat-value c-monitor-switch-stat-value--red" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">5</span>
            </div>
          </div>
        </div>
      </div>

      <div
        :class="['c-monitor-switch-item', { 'c-monitor-switch-item--selected': activeSwitch === 'south-north' }]"
        @click="handleSwitchChange('south-north')"
      >
        <div class="c-monitor-switch-item-icon">
          <img :src="icon2" alt="南北接线设备图标" class="c-monitor-switch-icon-img"  :style="{ backgroundImage: 'url(' + bg14 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"/>
        </div>
        <div class="c-monitor-switch-item-info">
          <div class="c-monitor-switch-item-title">南北接线 / 设备</div>
          <div class="c-monitor-switch-item-stats">
            <div class="c-monitor-switch-stat-line">
              <span class="c-monitor-switch-stat-label">总数:</span>
              <span class="c-monitor-switch-stat-value c-monitor-switch-stat-value--blue">1280</span>
            </div>
            <div class="c-monitor-switch-stat-line">
              <span class="c-monitor-switch-stat-label">异常数:</span>
              <span class="c-monitor-switch-stat-value c-monitor-switch-stat-value--red">3</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 设备网格区域 + 左侧垂直 Tab -->
    <div class="c-monitor-content-body">
      <!-- 左侧垂直 Tab 导航（监控分类） -->
      <div class="c-monitor-vertical-tabs">
        <div
          v-for="tab in verticalTabs"
          :key="tab.value"
          :class="['c-monitor-vtab-item', { 'c-monitor-vtab-item--active': activeTab === tab.value }]"
          @click="handleTabChange(tab.value)"
        >
          <span class="c-monitor-vtab-label">{{ tab.label }}</span>
          <span v-if="tab.badge" class="c-monitor-vtab-badge">{{ tab.badge }}</span>
        </div>
      </div>

      <!-- 右侧设备卡片网格（3列） -->
      <div class="c-monitor-device-grid">
        <div
          v-for="device in currentDevices"
          :key="device.id"
          class="c-monitor-device-card"
        >
          <div class="c-monitor-device-card-inner">
            <img :src="device.icon" :alt="device.name" class="c-monitor-device-icon"  :style="{ backgroundImage: 'url(' + bg9 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"/>
            <div class="c-monitor-device-info" :style="{ backgroundImage: 'url(' + bg10 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
              <div class="c-monitor-device-name" :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ device.name }}</div>
              <div class="c-monitor-device-count" :style="{ backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
                <span class="c-monitor-device-count-text" :style="{ backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ device.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-8798.png'
import bg11 from '../../resources/images/bg-8439.png'
import bg1 from '../../resources/images/bg-8788.png'
import bg2 from '../../resources/images/bg-8807.png'
import icon2 from '../../resources/images/icon-8817.png'
import icon3 from '../../resources/images/icon-8444.png'
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
import icon14 from '../../resources/images/icon-8764.png'
const bg12 = bg11
const bg13 = bg11
const bg8 = bg11
const bg4 = bg11
const bg14 = bg11
const bg9 = bg11
const bg10 = bg11
const bg5 = bg11
const bg6 = bg11
const bg7 = bg11


import { ref, computed, watch} from 'vue'

/* 系统自动注入资源变量，无需手写 import */

// 切换状态（隧道设备 / 南北接线设备）
const activeSwitch = ref('tunnel')

// 垂直 Tab 状态
const activeTab = ref('monitor')

// 切换处理
const handleSwitchChange = (value) => {
  if (activeSwitch.value === value) return
  activeSwitch.value = value
}

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
}

// 垂直 Tab 列表（来自文字清单）
const verticalTabs = ref([
  { label: '监控', value: 'monitor', badge: null, count: '3/3740' },
  { label: '照明', value: 'lighting', badge: '3', count: null },
  { label: '通风', value: 'ventilation', badge: null, count: null },
  { label: '消防', value: 'fire', badge: null, count: null },
  { label: '交通诱导', value: 'traffic', badge: null, count: null },
  { label: '供配电', value: 'power', badge: null, count: null },
])

// 设备卡片数据（按照 Figma 文字清单 + 资源映射）
const allDevices = ref([
  { id: 'camera', name: '摄像机', count: '(2/484)', iconVar: 'icon3' },
  { id: 'robot', name: '烟道机器人', count: '(0/484)', iconVar: 'icon4' },
  { id: 'covi', name: 'CO/VI检测器', count: '(0/484)', iconVar: 'icon5' },
  { id: 'light-sensor', name: '光照度变送器', count: '(0/484)', iconVar: 'icon6' },
  { id: 'lidar', name: '激光雷达', count: '(0/484)', iconVar: 'icon7' },
  { id: 'wind', name: '风速风向仪', count: '(1/484)', iconVar: 'icon8' },
  { id: 'temp-humid', name: '温湿度传感器', count: '(0/484)', iconVar: 'icon9' },
  { id: 'emergency-phone', name: '紧急电话', count: '(0/484)', iconVar: 'icon10' },
  { id: 'height-detector', name: '超高检测器', count: '(0/484)', iconVar: 'icon11' },
  { id: 'co2', name: 'CO2传感器', count: '(0/484)', iconVar: 'icon12' },
  { id: 'pressure', name: '压力传感器', count: '(0/484)', iconVar: 'icon13' },
  { id: 'water', name: '水质监测设备', count: '(0/484)', iconVar: 'icon14' },
])

// 将 iconVar 映射为实际变量
// 系统注入变量在 <script setup> 作用域内可直接访问
const iconMap = computed(() => ({
  icon3,
  icon4,
  icon5,
  icon6,
  icon7,
  icon8,
  icon9,
  icon10,
  icon11,
  icon12,
  icon13,
  icon14,
}))

const currentDevices = computed(() => {
  return allDevices.value.map(d => ({
    ...d,
    icon: iconMap.value[d.iconVar],
  }))
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 主内容区根容器 */
.c-monitor-main-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

/* 顶部切换栏 */
.c-monitor-switch-bar {
  display: flex;
  flex-direction: row;
  gap: 8px;
  flex-shrink: 0;
  padding: 0 4px 6px 4px;
}

/* 切换项 */
.c-monitor-switch-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  background: rgba(25, 144, 255, 0.08);
  border: 1px solid rgba(25, 144, 255, 0.18);
  transition: background 0.2s;

  &--selected {
    background: rgba(25, 144, 255, 0.22);
    border-color: rgba(25, 144, 255, 0.5);
  }

  &:hover {
    background: rgba(25, 144, 255, 0.16);
  }
}

.c-monitor-switch-item-icon {
  flex-shrink: 0;
  width: 35px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-switch-icon-img {
  width: 35px;
  height: 28px;
  object-fit: contain;
}

.c-monitor-switch-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.c-monitor-switch-item-title {
  font-family: 'YouSheBiaoTiHei', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 400;
  color: #333333;
  white-space: nowrap;
  line-height: 1.3;
}

.c-monitor-switch-item--selected .c-monitor-switch-item-title {
  color: #ffffff;
}

.c-monitor-switch-item-stats {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.c-monitor-switch-stat-line {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
}

.c-monitor-switch-stat-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 400;
  color: rgba(0, 0, 0, 0.55);
  line-height: 1.5;
  white-space: nowrap;
}

.c-monitor-switch-item--selected .c-monitor-switch-stat-label {
  color: rgba(255, 255, 255, 0.75);
}

.c-monitor-switch-stat-value {
  font-family: 'Roboto', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1.143);
  font-weight: 700;
  line-height: 1.2;

  &--blue {
    color: rgba(25, 144, 255, 1);
  }

  &--red {
    color: rgba(255, 77, 79, 1);
  }
}

/* 内容主体（垂直 Tab + 设备网格） */
.c-monitor-content-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  gap: 0;
  overflow: hidden;
}

/* 垂直 Tab 导航 */
.c-monitor-vertical-tabs {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 46px;
  overflow-y: auto;
  overflow-x: hidden;
  background: transparent;
}

.c-monitor-vtab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 46px;
  min-height: 40px;
  padding: 6px 4px;
  cursor: pointer;
  background: transparent;
  transition: background 0.2s;

  &--active {
    background: rgba(25, 144, 255, 0.15);
  }

  &:hover:not(&--active) {
    background: rgba(25, 144, 255, 0.08);
  }
}

.c-monitor-vtab-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px));
  font-weight: 400;
  color: rgba(51, 51, 51, 0.85);
  text-align: center;
  line-height: 1.4;
  writing-mode: vertical-lr;
  white-space: nowrap;

  .c-monitor-vtab-item--active & {
    font-weight: 700;
    color: #ffffff;
  }
}

.c-monitor-vtab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  margin-top: 2px;
  background: rgba(255, 77, 79, 1);
  color: #ffffff;
  font-family: 'Roboto', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 500;
  border-radius: 7px;
  line-height: 1;
  flex-shrink: 0;
}

/* 设备卡片网格 */
.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  align-content: start;
  padding: 2px;
}

/* 设备卡片 */
.c-monitor-device-card {
  width: 100%;
  height: 64px;
  box-sizing: border-box;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.85;
  }
}

.c-monitor-device-card-inner {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  width: 100%;
  flex: 1 1 0;
  padding: 6px 8px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(25, 144, 255, 0.12);
  border-radius: 4px;
  box-shadow: 0px 2px 4px 0px rgba(74, 117, 141, 0.12);
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-monitor-device-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
  min-height: 0;}

.c-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 400;
  color: rgba(51, 51, 51, 0.9);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-monitor-device-count {
  display: flex;
  align-items: center;
}

.c-monitor-device-count-text {
  font-family: 'Roboto', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 500;
  color: rgba(25, 144, 255, 1);
  line-height: 1.4;
}
</style>