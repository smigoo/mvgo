<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitor-content">
      <!-- 顶部统计横条 -->
      <div class="c-equipment-monitor-header">
        <span class="c-equipment-monitor-title">设备监测</span>
        <div class="c-equipment-monitor-stats">
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">设备类型</span>
            <span class="c-equipment-monitor-stat-value c-equipment-monitor-stat-value--blue">28</span>
          </div>
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">设备总数</span>
            <span class="c-equipment-monitor-stat-value c-equipment-monitor-stat-value--cyan">68562</span>
          </div>
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">完好率</span>
            <span class="c-equipment-monitor-stat-value c-equipment-monitor-stat-value--green">98%</span>
          </div>
        </div>
      </div>

      <!-- 主内容区：左侧导航栏 + 右侧内容 -->
      <div class="c-equipment-monitor-main">
        <!-- 左侧垂直导航栏 -->
        <div class="c-equipment-monitor-sidebar">
          <div class="c-equipment-monitor-badge-wrapper">
            <div class="c-equipment-monitor-badge">3/3740</div>
          </div>
          <button
            v-for="(nav, index) in navItems"
            :key="index"
            :class="['c-equipment-monitor-nav-btn', { 'c-equipment-monitor-nav-btn--active': nav.active }]"
            @click="handleNavClick(nav.label)"
          >
            <span class="c-equipment-monitor-nav-text">{{ nav.label }}</span>
            <span v-if="nav.count" class="c-equipment-monitor-nav-count">{{ nav.count }}</span>
          </button>
        </div>

        <!-- 右侧内容区 -->
        <div class="c-equipment-monitor-right">
          <!-- 统计卡片区 -->
          <div class="c-equipment-monitor-cards">
            <div class="c-equipment-monitor-card c-equipment-monitor-card--tunnel">
              <div class="c-equipment-monitor-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
                </svg>
              </div>
              <div class="c-equipment-monitor-card-stats">
                <div class="c-equipment-monitor-card-row">
                  <span class="c-equipment-monitor-card-label">总</span>
                  <span class="c-equipment-monitor-card-label">数:</span>
                  <span class="c-equipment-monitor-card-number">56302</span>
                </div>
                <div class="c-equipment-monitor-card-row">
                  <span class="c-equipment-monitor-card-label">异常数:</span>
                  <span class="c-equipment-monitor-card-number c-equipment-monitor-card-number--error">5</span>
                </div>
              </div>
              <div class="c-equipment-monitor-card-tag c-equipment-monitor-card-tag--red">隧道设备</div>
            </div>

            <div class="c-equipment-monitor-card c-equipment-monitor-card--junction">
              <div class="c-equipment-monitor-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
              </div>
              <div class="c-equipment-monitor-card-stats">
                <div class="c-equipment-monitor-card-row">
                  <span class="c-equipment-monitor-card-label">总</span>
                  <span class="c-equipment-monitor-card-label">数:</span>
                  <span class="c-equipment-monitor-card-number">1280</span>
                </div>
                <div class="c-equipment-monitor-card-row">
                  <span class="c-equipment-monitor-card-label">异常数:</span>
                  <span class="c-equipment-monitor-card-number c-equipment-monitor-card-number--error">3</span>
                </div>
              </div>
              <div class="c-equipment-monitor-card-tag c-equipment-monitor-card-tag--gray">南北接线设备</div>
            </div>
          </div>

          <!-- 设备网格区 -->
          <div class="c-equipment-monitor-grid">
            <div
              v-for="(device, index) in devices"
              :key="index"
              class="c-equipment-monitor-device-card"
              @click="handleDeviceClick(device.name)"
            >
              <div class="c-equipment-monitor-device-icon-wrapper">
                <div class="c-equipment-monitor-device-icon-base"></div>
                <div class="c-equipment-monitor-device-icon">
                  <component :is="getDeviceIcon(device.icon)" />
                </div>
              </div>
              <div class="c-equipment-monitor-device-name">{{ device.name }}</div>
              <div
                :class="[
                  'c-equipment-monitor-device-count',
                  device.error > 0 ? 'c-equipment-monitor-device-count--error' : ''
                ]"
              >
                ({{ device.error }}/{{ device.total }})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, h } from 'vue'

// 导航栏数据
const navItems = ref([
  { label: '监控', active: true, count: 3 },
  { label: '照明', active: false },
  { label: '通风', active: false },
  { label: '供配电', active: false },
  { label: '消防', active: false },
  { label: '交通诱导', active: false }
])

// 设备网格数据
const devices = ref([
  { name: '摄像机', icon: 'camera', error: 2, total: 484 },
  { name: '风速风向仪', icon: 'wind', error: 1, total: 484 },
  { name: '超高检测器', icon: 'height', error: 0, total: 484 },
  { name: '烟道机器人', icon: 'robot', error: 0, total: 484 },
  { name: '激光雷达', icon: 'radar', error: 0, total: 484 },
  { name: 'CO₂传感器', icon: 'co2', error: 0, total: 484 },
  { name: 'CO/VI检测器', icon: 'detector', error: 0, total: 484 },
  { name: '温湿度传感器', icon: 'temp', error: 0, total: 484 },
  { name: '压力传感器', icon: 'pressure', error: 0, total: 484 },
  { name: '光照度变送器', icon: 'light', error: 0, total: 484 },
  { name: '紧急电话', icon: 'phone', error: 0, total: 484 },
  { name: '水质监测设备', icon: 'water', error: 0, total: 484 }
])

// 导航点击
const handleNavClick = (label) => {
  navItems.value.forEach(item => {
    item.active = item.label === label
  })
  console.log('导航切换:', label)
}

// 设备点击
const handleDeviceClick = (name) => {
  console.log('设备点击:', name)
}

// 设备图标映射
const getDeviceIcon = (type) => {
  const icons = {
    camera: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z' })
    ]),
    wind: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z' })
    ]),
    height: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z' })
    ]),
    robot: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-.5-4c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z' })
    ]),
    radar: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z' })
    ]),
    co2: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' })
    ]),
    detector: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z' })
    ]),
    temp: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z' })
    ]),
    pressure: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z' })
    ]),
    light: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z' })
    ]),
    phone: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z' })
    ]),
    water: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
      h('path', { d: 'M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.79 6 9.14 0 3.63-2.65 6.2-6 6.2z' })
    ])
  }
  return icons[type] || icons.camera
}
</script>

<style scoped>
/*
高度预算分解（画布逻辑尺寸 420×425px）：
base-panel 头部 ≈ 36px，内容区可用高度 H = 425 - 36 = 389px
根容器 padding: 12px → 可用 H' = 389 - 12×2 = 365px
  - 顶部统计横条: 36px
  - gap: 8px
  - 统计卡片区: 85px
  - gap: 8px
  - 设备网格区: 365 - 36 - 8 - 85 - 8 = 228px
    grid 4行 + 3gap(5px×3=15px) → 行高 = (228 - 15) / 4 ≈ 53px
    图标基座 ≈ 24px, 名称 ≈ 11px, 分数 ≈ 12px
*/

.c-equipment-monitor-content {
  width: 100%;
  height: 100%;
  padding: 12px;
  background: #E4EEF9;
  overflow: hidden;
}

/* 顶部统计横条 */
.c-equipment-monitor-header {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.c-equipment-monitor-title {
  font-size: 15px;
  font-weight: 500;
  color: #3B9EFF;
  white-space: nowrap;
}

.c-equipment-monitor-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.c-equipment-monitor-stat-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
}

.c-equipment-monitor-stat-label {
  font-size: 12px;
  color: #4A5568;
}

.c-equipment-monitor-stat-value {
  font-size: 20px;
  font-weight: 700;
}

.c-equipment-monitor-stat-value--blue {
  color: #3B9EFF;
}

.c-equipment-monitor-stat-value--cyan {
  color: #00D4FF;
}

.c-equipment-monitor-stat-value--green {
  color: #00D896;
}

/* 主内容区 */
.c-equipment-monitor-main {
  display: flex;
  gap: 8px;
  height: calc(100% - 44px);
  min-height: 0;
}

/* 左侧垂直导航栏 */
.c-equipment-monitor-sidebar {
  width: 40px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 20px;
  position: relative;
  flex-shrink: 0;
}

.c-equipment-monitor-badge-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 18px;
  display: flex;
  justify-content: center;
}

.c-equipment-monitor-badge {
  font-size: 10px;
  color: #FF4444;
  border: 1px solid #FF4444;
  border-radius: 3px;
  padding: 1px 4px;
  background: rgba(255, 255, 255, 0.9);
  line-height: 1.2;
  white-space: nowrap;
}

.c-equipment-monitor-nav-btn {
  writing-mode: vertical-rl;
  white-space: nowrap;
  height: 48px;
  border: none;
  border-radius: 6px;
  background: rgba(59, 158, 255, 0.15);
  color: #3B9EFF;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  padding: 6px 0;
  position: relative;
  letter-spacing: 1px;
}

.c-equipment-monitor-nav-btn:hover {
  background: rgba(59, 158, 255, 0.25);
}

.c-equipment-monitor-nav-btn--active {
  background: #3B9EFF;
  color: #FFFFFF;
}

.c-equipment-monitor-nav-text {
  display: inline-block;
}

.c-equipment-monitor-nav-count {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #FF4444;
  color: #FFFFFF;
  font-size: 10px;
  border-radius: 8px;
  min-width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  z-index: 10;
  writing-mode: horizontal-tb;
}

/* 右侧内容区 */
.c-equipment-monitor-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
}

/* 统计卡片区 */
.c-equipment-monitor-cards {
  display: flex;
  gap: 8px;
  height: 85px;
  flex-shrink: 0;
}

.c-equipment-monitor-card {
  flex: 1;
  border-radius: 4px;
  padding: 12px;
  display: flex;
  position: relative;
  overflow: hidden;
  min-width: 0;
}

.c-equipment-monitor-card--tunnel {
  background: linear-gradient(135deg, #4BA8FF 0%, #6BC0FF 100%);
}

.c-equipment-monitor-card--junction {
  background: linear-gradient(135deg, rgba(75, 168, 255, 0.3) 0%, rgba(107, 192, 255, 0.2) 100%);
}

.c-equipment-monitor-card-icon {
  width: 40px;
  height: 40px;
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-equipment-monitor-card-icon svg {
  width: 28px;
  height: 28px;
}

.c-equipment-monitor-card-stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  margin-left: 8px;
  min-width: 0;
}

.c-equipment-monitor-card-row {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.c-equipment-monitor-card-label {
  font-size: 11px;
  color: #FFFFFF;
  white-space: nowrap;
}

.c-equipment-monitor-card-number {
  font-size: 22px;
  font-weight: 700;
  color: #FFFFFF;
}

.c-equipment-monitor-card-number--error {
  color: #FF4444;
}

.c-equipment-monitor-card-tag {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.c-equipment-monitor-card-tag--red {
  background: rgba(255, 68, 68, 0.9);
  color: #FFFFFF;
}

.c-equipment-monitor-card-tag--gray {
  background: rgba(74, 85, 104, 0.7);
  color: #FFFFFF;
}

/* 设备网格区 */
.c-equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 5px;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
}

.c-equipment-monitor-device-card {
  background: #E8EDF2;
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 0;
}

.c-equipment-monitor-device-card:hover {
  background: #D8E3EE;
  transform: translateY(-1px);
}

.c-equipment-monitor-device-icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.c-equipment-monitor-device-icon-base {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #FFFFFF 0%, #E8EDF2 100%);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.c-equipment-monitor-device-icon {
  position: relative;
  width: 100%;
  height: 100%;
  color: #3B9EFF;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-equipment-monitor-device-icon svg {
  width: 16px;
  height: 16px;
}

.c-equipment-monitor-device-name {
  font-size: 11px;
  color: #4A5568;
  text-align: center;
  line-height: 1.3;
  word-break: keep-all;
  overflow-wrap: break-word;
}

.c-equipment-monitor-device-count {
  font-size: 12px;
  font-weight: 600;
  color: #00D4FF;
}

.c-equipment-monitor-device-count--error {
  color: #FF4444;
}
</style>