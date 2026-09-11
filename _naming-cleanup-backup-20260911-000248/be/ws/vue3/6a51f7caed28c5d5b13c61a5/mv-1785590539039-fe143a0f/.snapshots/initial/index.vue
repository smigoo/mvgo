<template>
  <div class="mv-1785590539039-fe143a0f">
    <!-- Header -->
    <div class="header">
      <div class="bg-container" :style="{ backgroundImage: `url(${bg1})` }"></div>
      <div class="header-content">
        <div class="header-left">
          <img :src="icon1" class="header-icon" />
          <span class="header-title">设备监测</span>
        </div>
        <div class="header-right">
          <div class="stat-item">
            <span class="stat-label">设备类型</span>
            <span class="stat-value">28</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">设备总数</span>
            <span class="stat-value">68562</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">完好率</span>
            <span class="stat-value">98%</span>
          </div>
          <img :src="icon2" class="refresh-icon" />
        </div>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-cards">
      <div class="bg-container" :style="{ backgroundImage: `url(${bg2})` }"></div>
      <div class="stats-content">
        <div class="stat-card">
          <img :src="icon3" class="card-icon" />
          <div class="card-content">
            <div class="card-title">隧道设备</div>
            <div class="card-info">
              <span>总数: <b>56302</b></span>
              <span class="error-text">异常数: <b>5</b></span>
            </div>
          </div>
        </div>
        <div class="stat-card">
          <img :src="icon4" class="card-icon" />
          <div class="card-content">
            <div class="card-title">南北接线设备</div>
            <div class="card-info">
              <span>总数: <b>1280</b></span>
              <span class="error-text">异常数: <b>3</b></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Sidebar -->
      <div class="sidebar">
        <div 
          v-for="(item, index) in sidebarItems" 
          :key="index" 
          class="sidebar-item"
          :class="{ active: item.active }"
        >
          <span>{{ item.label }}</span>
          <span v-if="item.badge" class="badge">{{ item.badge }}</span>
        </div>
      </div>

      <!-- Device Grid -->
      <div class="device-grid">
        <div 
          v-for="(device, index) in deviceList" 
          :key="index" 
          class="device-card"
          :style="{ backgroundImage: `url(${device.bg})` }"
        >
          <img :src="device.icon" class="device-icon" />
          <div class="device-info">
            <div class="device-name">{{ device.name }}</div>
            <div class="device-status">
              <span class="error-count">{{ device.error }}</span>
              <span class="total-count">/{{ device.total }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from './resources/images/bg-8788.png'
import icon1 from './resources/images/g-8421.png'
import icon2 from './resources/images/Frame-8856.png'
import bg2 from './resources/images/bg-8807.png'
import icon3 from './resources/images/icon-8798.png'
import icon4 from './resources/images/icon-8817.png'
import icon5 from './resources/images/icon-8444.png'
import bg3 from './resources/images/bg-8439.png'
import icon6 from './resources/images/icon-8473.png'
import bg4 from './resources/images/bg-8468.png'
import icon7 from './resources/images/icon-8503.png'
import bg5 from './resources/images/bg-8498.png'
import icon8 from './resources/images/icon-8532.png'
import bg6 from './resources/images/bg-8527.png'
import icon9 from './resources/images/icon-8561.png'
import bg7 from './resources/images/bg-8556.png'
import icon10 from './resources/images/icon-8590.png'
import bg8 from './resources/images/bg-8585.png'
import icon11 from './resources/images/icon-8619.png'
import bg9 from './resources/images/bg-8614.png'
import icon12 from './resources/images/icon-8648.png'
import bg10 from './resources/images/bg-8643.png'
import icon13 from './resources/images/icon-8677.png'
import bg11 from './resources/images/bg-8672.png'
import icon14 from './resources/images/icon-8706.png'
import bg12 from './resources/images/bg-8701.png'
import icon15 from './resources/images/icon-8735.png'
import bg13 from './resources/images/bg-8730.png'
import icon16 from './resources/images/icon-8764.png'
import bg14 from './resources/images/bg-8759.png'

import { ref} from 'vue'

const sidebarItems = ref([
  { label: '监控', active: true },
  { label: '照明', badge: 3 },
  { label: '通风' },
  { label: '供配电' },
  { label: '消防' },
  { label: '交通诱导' }
])

const deviceList = ref([
  { name: '摄像机', error: 2, total: 484, icon: icon5, bg: bg3 },
  { name: '风速风向仪', error: 1, total: 484, icon: icon6, bg: bg4 },
  { name: '超高检测器', error: 0, total: 484, icon: icon7, bg: bg5 },
  { name: '车辆检测器', error: 0, total: 484, icon: icon8, bg: bg6 },
  { name: '光强检测器', error: 0, total: 484, icon: icon9, bg: bg7 },
  { name: 'CO检测器', error: 0, total: 484, icon: icon10, bg: bg8 },
  { name: 'VI检测器', error: 0, total: 484, icon: icon11, bg: bg9 },
  { name: '火灾报警', error: 0, total: 484, icon: icon12, bg: bg10 },
  { name: '手动报警', error: 0, total: 484, icon: icon13, bg: bg11 },
  { name: '车道指示器', error: 0, total: 484, icon: icon14, bg: bg12 },
  { name: '交通信号灯', error: 0, total: 484, icon: icon15, bg: bg13 },
  { name: '可变情报板', error: 0, total: 484, icon: icon16, bg: bg14 }
])
</script>

<style scoped>
.mv-1785590539039-fe143a0f {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #edf4fbb2;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #333333;
  overflow: hidden;
}

.bg-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  z-index: 0;
  pointer-events: none;
}

/* Header */
.header {
  height: 8%;
  min-height: 50px;
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 20px;
  box-sizing: border-box;
}

.header-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 1;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  width: 8px;
  height: 8px;
  object-fit: contain;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: #333333;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stat-label {
  font-size: 14px;
  color: #666666;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #333333;
}

.refresh-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  cursor: pointer;
}

/* Stats Cards */
.stats-cards {
  height: 17%;
  min-height: 100px;
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 20px;
  box-sizing: border-box;
}

.stats-content {
  width: 100%;
  display: flex;
  gap: 16px;
  z-index: 1;
}

.stat-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  background: #ffffff;
  border-radius: 8px;
  padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
}

.card-icon {
  width: 35px;
  height: 28px;
  object-fit: contain;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #333333;
}

.card-info {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: #666666;
}

.card-info b {
  color: #333333;
  font-weight: 600;
}

.error-text {
  color: #f53f3f;
}

.error-text b {
  color: #f53f3f;
}

/* Main Content */
.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  padding: 0 20px 20px;
  box-sizing: border-box;
}

/* Sidebar */
.sidebar {
  width: 11%;
  min-width: 100px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
}

.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: #333333;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
}

.sidebar-item:hover {
  background: rgba(25, 144, 255, 0.1);
}

.sidebar-item.active {
  background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
  color: #ffffff;
  font-weight: 600;
}

.badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: #f53f3f;
  color: #ffffff;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
}

/* Device Grid */
.device-grid {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 16px;
}

.device-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  border-radius: 8px;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.device-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  z-index: 1;
}

.device-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 1;
}

.device-name {
  font-size: 14px;
  font-weight: 600;
  color: #333333;
}

.device-status {
  font-size: 14px;
}

.error-count {
  color: #f53f3f;
  font-weight: 600;
}

.total-count {
  color: #666666;
}</style>