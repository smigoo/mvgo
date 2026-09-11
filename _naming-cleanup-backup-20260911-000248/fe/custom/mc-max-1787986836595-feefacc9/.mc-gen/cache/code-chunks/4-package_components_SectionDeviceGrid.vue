<template>
  <div
    class="c-monitor-device-grid"
    :style="{
      backgroundImage: `url(${bg3})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }"
  >
    <div class="c-monitor-nav-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.text"
        :class="['c-monitor-nav-tab', tab.text === activeTab ? 'c-monitor-nav-tab-active' : 'c-monitor-nav-tab-default']"
        @click="handleTabClick(tab.text)"
      >
        <span class="c-monitor-nav-tab-text">{{ tab.text }}</span>
        <span v-if="tab.text === activeTab && tab.badge" class="c-monitor-nav-tab-count">{{ tab.badge }}</span>
        <span v-else-if="tab.badge" class="c-monitor-nav-tab-dot">{{ tab.badge }}</span>
      </div>
    </div>

    <div class="c-monitor-device-cards">
      <div v-for="device in devices" :key="device.id" class="c-monitor-device-card">
        <div class="c-monitor-device-card-icon"></div>
        <span class="c-monitor-device-card-label">{{ device.label }}</span>
        <span
          :class="[
            'c-monitor-device-card-value',
            device.abnormal ? 'c-monitor-device-card-value-abnormal' : 'c-monitor-device-card-value-normal'
          ]"
        >{{ device.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量由系统自动注入（bg2、bg3、icon1、icon2），此处仅使用 bg3
// eslint-disable-next-line no-undef
const bg3Var = typeof bg3 !== 'undefined' ? bg3 : ''

const activeTab = ref('监控')

// 左侧导航标签（来自 Figma slot-con/@antd/tab 节点，逐字取自设计稿）
const tabs = ref([
  { text: '监控', badge: '3/3740' },
  { text: '照明', badge: '3' },
  { text: '通风', badge: '' },
  { text: '供配电', badge: '' },
  { text: '消防', badge: '' },
  { text: '交通诱导', badge: '' }
])

// 设备卡片网格（来自 Figma slot-con/@antd/tab/cons 节点，逐字取自设计稿）
const devices = ref([
  { id: 'camera', label: '摄像机', value: '(2/484)', abnormal: true },
  { id: 'wind', label: '风速风向仪', value: '(1/484)', abnormal: true },
  { id: 'height', label: '超高检测器', value: '(0/484)', abnormal: false },
  { id: 'robot', label: '烟道机器人', value: '(0/484)', abnormal: false },
  { id: 'lidar', label: '激光雷达', value: '(0/484)', abnormal: false },
  { id: 'co2', label: 'CO2传感器', value: '(0/484)', abnormal: false },
  { id: 'covi', label: 'CO/VI检测器', value: '(0/484)', abnormal: false },
  { id: 'temp', label: '温湿度传感器', value: '(0/484)', abnormal: false },
  { id: 'pressure', label: '压力传感器', value: '(0/484)', abnormal: false },
  { id: 'light', label: '光照度变送器', value: '(0/484)', abnormal: false },
  { id: 'phone', label: '紧急电话', value: '(0/484)', abnormal: false },
  { id: 'water', label: '水质监测设备', value: '(0/484)', abnormal: false }
])

const handleTabClick = (text) => {
  activeTab.value = text
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
