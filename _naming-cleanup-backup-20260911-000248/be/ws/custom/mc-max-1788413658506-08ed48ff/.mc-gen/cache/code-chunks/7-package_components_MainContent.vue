<template>
  <div class="c-monitor-main-content">
    <!-- 左侧垂直Tab切换栏 -->
    <div class="c-monitor-left-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === tab.value }]"
        @click="handleTabChange(tab.value)"
      >
        <span class="c-monitor-tab-text">{{ tab.label }}</span>
        <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
      </div>
    </div>

    <!-- 右侧设备类型网格 -->
    <div class="c-monitor-device-grid">
      <div
        v-for="(device, index) in devices"
        :key="device.id"
        class="c-monitor-device-item"
        :style="{ backgroundImage: `url(${getDeviceBg(index)})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <img :src="device.icon" class="c-monitor-device-icon" :alt="device.name" />
        <span class="c-monitor-device-name">{{ device.name }}</span>
        <span class="c-monitor-device-value">
          <span :class="['c-monitor-device-count', device.abnormal > 0 ? 'c-monitor-device-count--danger' : 'c-monitor-device-count--normal']">{{ device.abnormal }}</span><span class="c-monitor-device-total">/{{ device.total }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 左侧垂直Tab数据
const tabs = ref([
  { label: '监控', value: 'monitor', badge: '3/3740' },
  { label: '照明', value: 'lighting', badge: null },
  { label: '通风', value: 'ventilation', badge: null },
  { label: '供配电', value: 'power', badge: null },
  { label: '消防', value: 'fire', badge: null },
  { label: '交通诱导', value: 'traffic', badge: null },
])

const activeTab = ref('monitor')

const handleTabChange = (value) => {
  activeTab.value = value
}

// 设备网格数据（12项，对应icon3~icon14，bg3~bg14）
const devices = ref([
  { id: 'device-1', name: '摄像机', abnormal: 2, total: 484, iconVar: 'icon3' },
  { id: 'device-2', name: '风速风向仪', abnormal: 1, total: 484, iconVar: 'icon4' },
  { id: 'device-3', name: '超高检测器', abnormal: 0, total: 484, iconVar: 'icon5' },
  { id: 'device-4', name: '烟道机器人', abnormal: 0, total: 484, iconVar: 'icon6' },
  { id: 'device-5', name: '激光雷达', abnormal: 0, total: 484, iconVar: 'icon7' },
  { id: 'device-6', name: 'CO₂传感器', abnormal: 0, total: 484, iconVar: 'icon8' },
  { id: 'device-7', name: 'CO/VI检测器', abnormal: 0, total: 484, iconVar: 'icon9' },
  { id: 'device-8', name: '温湿度传感器', abnormal: 0, total: 484, iconVar: 'icon10' },
  { id: 'device-9', name: '压力传感器', abnormal: 0, total: 484, iconVar: 'icon11' },
  { id: 'device-10', name: '光照度变送器', abnormal: 0, total: 484, iconVar: 'icon12' },
  { id: 'device-11', name: '紧急电话', abnormal: 0, total: 484, iconVar: 'icon13' },
  { id: 'device-12', name: '水质监测设备', abnormal: 0, total: 484, iconVar: 'icon14' },
])

// icon变量映射（系统注入）
const iconMap = { icon3, icon4, icon5, icon6, icon7, icon8, icon9, icon10, icon11, icon12, icon13, icon14 }
// bg变量映射（设备格子背景，bg3~bg14）
const bgMap = [bg3, bg4, bg5, bg6, bg7, bg8, bg9, bg10, bg11, bg12, bg13, bg14]

// 为设备注入图标变量
devices.value = devices.value.map((d) => ({
  ...d,
  icon: iconMap[d.iconVar],
}))

const getDeviceBg = (index) => bgMap[index]
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-main-content {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  gap: 4px;
}

.c-monitor-left-tabs {
  display: flex;
  flex-direction: column;
  width: 46px;
  flex-shrink: 0;
  gap: 2px;
  padding-top: 2px;
}

.c-monitor-tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 34px;
  min-height: 40px;
  padding: 4px 2px;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  transition: background 0.2s ease;
  position: relative;

  &--active {
    background: rgba(25, 144, 255, 1);

    .c-monitor-tab-text {
      color: rgba(255, 255, 255, 1);
      font-weight: 700;
    }

    .c-monitor-tab-badge {
      color: rgba(255, 255, 255, 1);
      background: rgba(255, 255, 255, 0.25);
    }
  }
}

.c-monitor-tab-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 1);
  font-weight: 400;
  color: rgba(51, 51, 51, 1);
  line-height: 16px;
  text-align: center;
  writing-mode: vertical-lr;
  letter-spacing: 2px;
  white-space: nowrap;
}

.c-monitor-tab-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  color: rgba(25, 144, 255, 1);
  background: rgba(25, 144, 255, 0.1);
  border-radius: 9px;
  padding: 1px 3px;
  margin-top: 2px;
  white-space: nowrap;
  line-height: 1.2;
  text-align: center;
  writing-mode: horizontal-tb;
  letter-spacing: 0;
  font-size: calc(@fontSize * 0.714);
}

/* 右侧设备网格 */
.c-monitor-device-grid {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 0;
}

.c-monitor-device-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 4px;
  cursor: pointer;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  min-height: 0;
  overflow: hidden;
}

.c-monitor-device-icon {
  width: 27px;
  height: 32px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: rgba(51, 51, 51, 1);
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
}

.c-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  white-space: nowrap;
}

.c-monitor-device-count {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  line-height: 18.75px;

  &--danger {
    color: rgba(255, 100, 100, 1);
  }

  &--normal {
    color: rgba(25, 144, 255, 1);
  }
}

.c-monitor-device-total {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  color: rgba(51, 51, 51, 1);
  line-height: 18.75px;
}
</style>