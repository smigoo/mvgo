<template>
  <div class="device-monitor-container">
    <!-- 顶部统计栏 -->
    <header class="top-header">
      <h1 class="main-title">设备监测</h1>
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-icon">≡</span>
          <span class="stat-label">设备类型</span>
          <span class="stat-value blue-text">28</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">设备总数</span>
          <span class="stat-value blue-text">68562</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">完好率</span>
          <span class="stat-value green-text">98%</span>
        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧导航栏 -->
      <aside class="left-nav">
        <div 
          v-for="(item, index) in navItems" 
          :key="index"
          :class="['nav-item', { active: activeNav === index }]"
          @click="activeNav = index"
        >
          <span class="nav-text">{{ item.name }}</span>
          <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
        </div>
      </aside>

      <!-- 右侧内容区 -->
      <section class="right-panel">
        <!-- 概览卡片区 -->
        <div class="overview-cards">
          <!-- 隧道设备卡片 -->
          <div class="overview-card tunnel-card">
            <div class="card-icon-wrapper">
              <div class="icon-circle">
                <svg viewBox="0 0 24 24" fill="#2196F3" width="28" height="28">
                  <path d="M12 2C9.24 2 7 4.24 7 7c0 1.85.99 3.47 2.46 4.36L9 22h6l-.46-10.64C16.01 10.47 17 8.85 17 7c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
                </svg>
              </div>
            </div>
            <div class="card-info">
              <div class="info-main">
                <span class="label">总 数:</span>
                <span class="value large">56302</span>
              </div>
              <div class="info-sub">
                <span class="label-bold">隧道设备</span>
                <span class="label">异常数:</span>
                <span class="value red">5</span>
              </div>
            </div>
            <div class="arrow-right"></div>
          </div>

          <!-- 南北接线设备卡片 -->
          <div class="overview-card connector-card">
            <div class="card-icon-wrapper">
              <div class="icon-circle">
                <svg viewBox="0 0 24 24" fill="#2196F3" width="28" height="28">
                  <path d="M20 2H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h4v4l4-4h8c1.11 0 2-.89 2-2V4c0-1.11-.89-2-2-2zm0 14H11.17L9 18.17V16H4V4h16v12z"/>
                  <circle cx="8" cy="9" r="1.5"/>
                  <circle cx="12" cy="9" r="1.5"/>
                  <circle cx="16" cy="9" r="1.5"/>
                </svg>
              </div>
            </div>
            <div class="card-info">
              <div class="info-main">
                <span class="label">总 数:</span>
                <span class="value large blue-text">1280</span>
              </div>
              <div class="info-sub">
                <span class="label-bold">南北接线<br>设备</span>
                <span class="label">异常数:</span>
                <span class="value red">3</span>
              </div>
            </div>
            <div class="arrow-right"></div>
          </div>
        </div>

        <!-- 设备网格区 -->
        <div class="device-grid">
          <div 
            v-for="(device, idx) in devices" 
            :key="idx"
            class="device-card"
          >
            <div class="device-icon-wrapper">
              <div class="device-icon-circle">
                <component :is="getDeviceIcon(device.icon)" />
              </div>
            </div>
            <div class="device-name">{{ device.name }}</div>
            <div class="device-status" :class="{ 'red': device.abnormal > 0 }">
              ({{ device.abnormal }}/{{ device.total }})
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, h } from 'vue'

const activeNav = ref(0)

const navItems = [
  { name: '监控', badge: '3/3740' },
  { name: '照明', badge: '3' },
  { name: '通风', badge: null },
  { name: '供配电', badge: null },
  { name: '消防', badge: null },
  { name: '交通诱导', badge: null }
]

const devices = [
  { name: '摄像机', icon: 'camera', abnormal: 2, total: 484 },
  { name: '风速风向仪', icon: 'wind', abnormal: 1, total: 484 },
  { name: '超高检测器', icon: 'height', abnormal: 0, total: 484 },
  { name: '烟道机器人', icon: 'robot', abnormal: 0, total: 484 },
  { name: '激光雷达', icon: 'radar', abnormal: 0, total: 484 },
  { name: 'CO₂传感器', icon: 'co2', abnormal: 0, total: 484 },
  { name: 'CO/VI检测器', icon: 'co', abnormal: 0, total: 484 },
  { name: '温湿度传感器', icon: 'temp', abnormal: 0, total: 484 },
  { name: '压力传感器', icon: 'pressure', abnormal: 0, total: 484 },
  { name: '光照度变送器', icon: 'light', abnormal: 0, total: 484 },
  { name: '紧急电话', icon: 'phone', abnormal: 0, total: 484 },
  { name: '水质监测设备', icon: 'water', abnormal: 0, total: 484 },
]

const getDeviceIcon = (type) => {
  const icons = {
    camera: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z' })
    ]),
    wind: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z' })
    ]),
    height: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z' })
    ]),
    robot: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2zM8.5 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z' })
    ]),
    radar: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-5.5-8c0 3.03 2.47 5.5 5.5 5.5s5.5-2.47 5.5-5.5S15.03 6.5 12 6.5 6.5 8.97 6.5 12z' }),
      h('circle', { cx: '12', cy: '12', r: '2' })
    ]),
    co2: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' }),
      h('text', { x: '12', y: '14', 'text-anchor': 'middle', 'font-size': '8', fill: '#fff' }, 'CO₂')
    ]),
    co: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z' })
    ]),
    temp: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z' })
    ]),
    pressure: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z' })
    ]),
    light: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z' })
    ]),
    phone: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z' })
    ]),
    water: () => h('svg', { viewBox: '0 0 24 24', fill: '#2196F3', width: '24', height: '24' }, [
      h('path', { d: 'M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.79 6 9.14 0 3.63-2.65 6.2-6 6.2z' })
    ])
  }
  return icons[type] || icons.camera
}
</script>

<style scoped>
.device-monitor-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #A0A0A0;
  display: flex;
  flex-direction: column;
  padding: 15px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* 顶部统计栏 */
.top-header {
  margin-bottom: 10px;
}

.main-title {
  font-size: 24px;
  font-weight: 700;
  color: #2196F3;
  margin: 0 0 8px 0;
  line-height: 1.2;
}

.stats-row {
  display: flex;
  gap: 20px;
  align-items: center;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 16px;
  color: #333;
}

.stat-icon {
  font-size: 18px;
  font-weight: bold;
  color: #2196F3;
}

.stat-label {
  font-weight: 400;
}

.stat-value {
  font-weight: 700;
  font-size: 20px;
}

.blue-text {
  color: #2196F3;
}

.green-text {
  color: #4CAF50;
}

/* 主内容区 */
.main-content {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 10px;
}

/* 左侧导航栏 */
.left-nav {
  width: 60px;
  display: flex;
  flex-direction: column;
  gap: 0;
  background-color: transparent;
}

.nav-item {
  position: relative;
  padding: 10px 8px;
  text-align: center;
  cursor: pointer;
  border-radius: 6px;
  margin-bottom: 2px;
  transition: all 0.3s ease;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background-color: rgba(255, 255, 255, 0.15);
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-item.active {
  background-color: #2196F3;
  border-color: #2196F3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.nav-text {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  line-height: 1.3;
  writing-mode: vertical-lr;
  letter-spacing: 2px;
}

.nav-item.active .nav-text {
  color: #fff;
}

.nav-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: #E53935;
  color: white;
  font-size: 10px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  font-weight: bold;
  line-height: 1;
  z-index: 1;
}

/* 右侧面板 */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* 概览卡片区 */
.overview-cards {
  display: flex;
  gap: 20px;
  height: 70px;
}

.overview-card {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  padding: 12px 40px 12px 15px;
  border-radius: 8px;
  overflow: visible;
  clip-path: polygon(
    0% 0%, 
    calc(100% - 20px) 0%, 
    100% 50%, 
    calc(100% - 20px) 100%, 
    0% 100%
  );
}

.tunnel-card {
  background: linear-gradient(135deg, #42A5F5 0%, #2196F3 100%);
  color: white;
}

.connector-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.25) 100%);
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.card-icon-wrapper {
  margin-right: 12px;
  flex-shrink: 0;
}

.icon-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-main {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.info-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.label {
  font-size: 14px;
  opacity: 0.9;
  font-weight: 500;
}

.label-bold {
  font-weight: 700;
  font-size: 13px;
  margin-right: auto;
  line-height: 1.2;
}

.value {
  font-weight: 700;
  font-size: 18px;
}

.value.large {
  font-size: 28px;
  font-weight: 700;
}

.value.red {
  color: #E53935;
}

.arrow-right {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 20px solid transparent;
  border-bottom: 20px solid transparent;
  border-left: 20px solid inherit;
  filter: brightness(0.95);
}

.tunnel-card .arrow-right {
  border-left-color: #2196F3;
}

.connector-card .arrow-right {
  border-left-color: rgba(255, 255, 255, 0.3);
}

/* 设备网格区 */
.device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(5, 1fr);
  gap: 10px;
  min-height: 0;
}

.device-card {
  background-color: rgba(255, 255, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(4px);
}

.device-card:hover {
  background-color: rgba(255, 255, 255, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.device-icon-wrapper {
  flex-shrink: 0;
}

.device-icon-circle {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.device-name {
  font-size: 15px;
  color: #333;
  font-weight: 500;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-status {
  font-size: 18px;
  font-weight: 700;
  color: #4CAF50;
  white-space: nowrap;
  flex-shrink: 0;
}

.device-status.red {
  color: #E53935;
}
</style>