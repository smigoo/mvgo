<template>
  <div class="c-device-overview-root">
    <!-- 汇总卡片区域 -->
    <div class="c-device-overview-summary">
      <!-- 左卡片：隧道设备（蓝色渐变强调） -->
      <div class="c-device-overview-card c-device-overview-card-main">
        <img :src="icon3" class="c-device-overview-card-icon" alt="隧道设备图标" />
        <div class="c-device-overview-card-content">
          <div class="c-device-overview-card-title">隧道设备</div>
          <div class="c-device-overview-card-line">
            <span class="c-device-overview-card-label">总数:</span>
            <span class="c-device-overview-card-value">56302</span>
          </div>
          <div class="c-device-overview-card-line">
            <span class="c-device-overview-card-label c-device-overview-card-label-abnormal">异常数:</span>
            <span class="c-device-overview-card-value c-device-overview-card-value-danger">5</span>
          </div>
        </div>
      </div>

      <!-- 右卡片：南北接线/设备（浅色简约） -->
      <div class="c-device-overview-card c-device-overview-card-sub">
        <img :src="icon4" class="c-device-overview-card-icon" alt="南北排异图标" />
        <div class="c-device-overview-card-content">
          <div class="c-device-overview-card-title">南北接线 / 设备</div>
          <div class="c-device-overview-card-line">
            <span class="c-device-overview-card-label c-device-overview-card-label-sub">总数:</span>
            <span class="c-device-overview-card-value c-device-overview-card-value-info">1280</span>
          </div>
          <div class="c-device-overview-card-line">
            <span class="c-device-overview-card-label c-device-overview-card-label-sub">异常数:</span>
            <span class="c-device-overview-card-value c-device-overview-card-value-danger">3</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容：左侧导航 + 右侧设备网格 -->
    <div class="c-device-overview-main">
      <!-- 左侧功能导航 -->
      <div class="c-device-overview-nav">
        <div
          v-for="tab in navTabs"
          :key="tab.id"
          :class="['c-device-overview-nav-item', { 'c-device-overview-nav-item-active': activeNav === tab.id }]"
          @click="handleNavChange(tab.id)"
        >
          <span class="c-device-overview-nav-text">{{ tab.name }}</span>
          <span v-if="tab.badge" class="c-device-overview-nav-badge">{{ tab.badge }}</span>
        </div>
      </div>

      <!-- 右侧设备状态网格 -->
      <div class="c-device-overview-grid">
        <div
          v-for="device in deviceList"
          :key="device.id"
          class="c-device-overview-device"
          @click="handleDeviceClick(device)"
        >
          <img :src="device.icon" class="c-device-overview-device-icon" :alt="device.name" />
          <div class="c-device-overview-device-info">
            <div class="c-device-overview-device-name">{{ device.name }}</div>
            <div class="c-device-overview-device-status">
              <span class="c-device-overview-device-abnormal">{{ device.abnormal }}</span>
              <span class="c-device-overview-device-total">/{{ device.total }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量由系统自动注入，禁止手动 import
// icon3: icon-8798.png（隧道设备）
// icon4: icon-8817.png（南北排异）
// 其他图标用于设备网格

const activeNav = ref('nav-monitor')

const navTabs = ref([
  { id: 'nav-monitor', name: '监控', badge: '3/740' },
  { id: 'nav-lighting', name: '照明', badge: '3' },
  { id: 'nav-ventilation', name: '通风', badge: '' },
  { id: 'nav-power', name: '供配电', badge: '' },
  { id: 'nav-fire', name: '消防', badge: '' },
  { id: 'nav-traffic', name: '交通诱导', badge: '' }
])

const deviceList = ref([
  { id: 'device-camera', name: '摄像机', icon: icon5, abnormal: '2', total: '484' },
  { id: 'device-wind', name: '风速风向仪', icon: icon6, abnormal: '1', total: '484' },
  { id: 'device-height', name: '超高检测器', icon: icon7, abnormal: '0', total: '484' },
  { id: 'device-robot', name: '烟道机器人', icon: icon8, abnormal: '0', total: '484' },
  { id: 'device-lidar', name: '激光雷达', icon: icon9, abnormal: '0', total: '484' },
  { id: 'device-co', name: 'CO2传感器', icon: icon10, abnormal: '0', total: '484' },
  { id: 'device-covi', name: 'CO/VI检测器', icon: icon11, abnormal: '0', total: '484' },
  { id: 'device-temp-humi', name: '温湿度传感器', icon: icon12, abnormal: '0', total: '484' },
  { id: 'device-pressure', name: '压力传感器', icon: icon13, abnormal: '0', total: '484' },
  { id: 'device-light-sensor', name: '光照度变送器', icon: icon14, abnormal: '0', total: '484' },
  { id: 'device-emergency-phone', name: '紧急电话', icon: icon15, abnormal: '0', total: '484' },
  { id: 'device-water-quality', name: '水质监测设备', icon: icon16, abnormal: '0', total: '484' }
])

const handleNavChange = (tabId) => {
  activeNav.value = tabId
}

const handleDeviceClick = (device) => {
  // 预留设备卡片点击事件，暂不实现跳转
  console.log('点击设备卡片:', device)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>