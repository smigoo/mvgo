<template>
  <div class="equipment-monitor">
    <!-- 顶部统计横幅 -->
    <div class="equipment-monitor-header">
      <div class="header-title">设备监测</div>
      <div class="header-stats">
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
          <span class="stat-value large">98%</span>
        </div>
      </div>
    </div>

    <!-- 异常数统计卡片区 -->
    <div class="equipment-monitor-summary">
      <div class="summary-card primary">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path fill="currentColor" d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-label">健康设备</div>
          <div class="card-total">总数:<span class="total-number">56302</span></div>
          <div class="card-abnormal">异常数:<span class="abnormal-number">5</span></div>
        </div>
      </div>
      <div class="summary-card secondary">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-label">两止掉线设备</div>
          <div class="card-total">总数:<span class="total-number">1280</span></div>
          <div class="card-abnormal">异常数:<span class="abnormal-number">3</span></div>
        </div>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="equipment-monitor-main">
      <!-- 左侧导航按钮栏 -->
      <div class="equipment-monitor-sidebar">
        <div class="sidebar-button" :class="{ active: activeCategory === '监控' }" @click="activeCategory = '监控'">
          <span class="button-badge">3</span>
          <div class="button-text">监控</div>
        </div>
        <div class="sidebar-button" :class="{ active: activeCategory === '照明' }" @click="activeCategory = '照明'">
          <div class="button-text">照明</div>
        </div>
        <div class="sidebar-button" :class="{ active: activeCategory === '通风' }" @click="activeCategory = '通风'">
          <div class="button-text">通风</div>
        </div>
        <div class="sidebar-button" :class="{ active: activeCategory === '供配电' }" @click="activeCategory = '供配电'">
          <div class="button-text">供配电</div>
        </div>
        <div class="sidebar-button" :class="{ active: activeCategory === '消防' }" @click="activeCategory = '消防'">
          <div class="button-text">消防</div>
        </div>
        <div class="sidebar-button" :class="{ active: activeCategory === '交通诱导' }" @click="activeCategory = '交通诱导'">
          <div class="button-text">交通诱导</div>
        </div>
        <div class="sidebar-indicator">
          <span class="indicator-text">3/3740</span>
        </div>
      </div>

      <!-- 设备类型网格区 -->
      <div class="equipment-monitor-grid">
        <div v-for="(item, index) in equipmentList" :key="index" class="equipment-card">
          <div class="equipment-icon">
            <div class="icon-ripple"></div>
            <div class="icon-ripple mid"></div>
            <div class="icon-ripple inner"></div>
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" :d="item.iconPath"/>
            </svg>
          </div>
          <div class="equipment-name">{{ item.name }}</div>
          <div class="equipment-status">
            <span :class="{ error: item.abnormal > 0 }">({{ item.abnormal }}/{{ item.total }})</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeCategory = ref('监控')

const equipmentList = ref([
  { name: '摄像机', abnormal: 2, total: 484, iconPath: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z' },
  { name: '风速风向仪', abnormal: 1, total: 484, iconPath: 'M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z' },
  { name: '超高检测器', abnormal: 0, total: 484, iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z' },
  { name: '烟道机器人', abnormal: 0, total: 484, iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM7.07 18.28c.43-.9 3.05-1.78 4.93-1.78s4.51.88 4.93 1.78C15.57 19.36 13.86 20 12 20s-3.57-.64-4.93-1.72zm11.29-1.45c-1.43-1.74-4.9-2.33-6.36-2.33s-4.93.59-6.36 2.33C4.62 15.49 4 13.82 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8c0 1.82-.62 3.49-1.64 4.83zM12 6c-1.94 0-3.5 1.56-3.5 3.5S10.06 13 12 13s3.5-1.56 3.5-3.5S13.94 6 12 6zm0 5c-.83 0-1.5-.67-1.5-1.5S11.17 8 12 8s1.5.67 1.5 1.5S12.83 11 12 11z' },
  { name: '激光雷达', abnormal: 0, total: 484, iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z' },
  { name: 'CO₂传感器', abnormal: 0, total: 484, iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
  { name: 'CO/VI检测器', abnormal: 0, total: 484, iconPath: 'M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z' },
  { name: '温湿度传感器', abnormal: 0, total: 484, iconPath: 'M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z' },
  { name: '压力传感器', abnormal: 0, total: 484, iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z' },
  { name: '光照度变送器', abnormal: 0, total: 484, iconPath: 'M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z' },
  { name: '紧急电话', abnormal: 0, total: 484, iconPath: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z' },
  { name: '水质监测设备', abnormal: 0, total: 484, iconPath: 'M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.79 6 9.14 0 3.63-2.65 6.2-6 6.2z' }
])
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: linear-gradient(to bottom, #E8F1F8, #F0F6FB);
  padding: 12px 19px;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #2E5C7D;
  min-height: 0;
}

/* 顶部统计横幅 */
.equipment-monitor-header {
  height: 35px;
  background: linear-gradient(to right, #B8D9F0, #D0E7F7);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  margin-bottom: 4px;
}

.header-title {
  font-size: 12px;
  font-weight: 400;
  color: #3A9FF5;
}

.header-stats {
  display: flex;
  gap: 18px;
  align-items: center;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.stat-label {
  font-size: 11px;
  color: #3A9FF5;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #3A9FF5;
}

.stat-value.large {
  font-size: 20px;
  font-weight: 700;
}

/* 异常数统计卡片区 */
.equipment-monitor-summary {
  height: 65px;
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 8px;
  position: relative;
  overflow: visible;
}

.summary-card.primary {
  flex: 1.22;
  background: linear-gradient(135deg, #3A9FF5 0%, #5CB3F9 100%);
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%);
}

.summary-card.secondary {
  flex: 1;
  background: linear-gradient(135deg, #A8D8F5 0%, #C9E8FA 100%);
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%);
}

.card-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.card-label {
  font-size: 11px;
  color: white;
  font-weight: 400;
}

.card-total {
  font-size: 11px;
  color: white;
}

.total-number {
  font-size: 16px;
  font-weight: 600;
  margin-left: 4px;
}

.card-abnormal {
  font-size: 11px;
  color: white;
}

.abnormal-number {
  font-size: 12px;
  font-weight: 600;
  color: #FF4D4F;
  margin-left: 4px;
}

/* 主内容区域 */
.equipment-monitor-main {
  flex: 1;
  display: flex;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

/* 左侧导航按钮栏 */
.equipment-monitor-sidebar {
  width: 32px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  position: relative;
  padding-top: 12px;
  overflow: visible;
}

.sidebar-button {
  height: 42px;
  background: linear-gradient(135deg, #B8D9F0, #D0E7F7);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: visible;
}

.sidebar-button:hover {
  background: linear-gradient(135deg, #A0C8E8, #B8D9F0);
  transform: translateX(2px);
}

.sidebar-button.active {
  background: linear-gradient(135deg, #3A9FF5, #5CB3F9);
}

.sidebar-button.active .button-text {
  color: white;
}

.button-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 16px;
  height: 16px;
  background: #FF4D4F;
  color: white;
  border-radius: 50%;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.button-text {
  writing-mode: vertical-rl;
  white-space: nowrap;
  font-size: 9px;
  color: #3A9FF5;
  font-weight: 500;
  letter-spacing: 1px;
}

.sidebar-indicator {
  margin-top: auto;
  height: 46px;
  background: linear-gradient(135deg, #B8D9F0, #D0E7F7);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.indicator-text {
  writing-mode: vertical-rl;
  white-space: nowrap;
  font-size: 9px;
  color: #FF4D4F;
  font-weight: 600;
  letter-spacing: 1px;
}

/* 设备类型网格区 */
.equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px 11px;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
}

.equipment-card {
  background: linear-gradient(135deg, #D9EDFA 0%, #E5F3FB 100%);
  border-radius: 8px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 68px;
}

.equipment-card:hover {
  background: linear-gradient(135deg, #C9E3F5 0%, #D9EDFA 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(58, 159, 245, 0.15);
}

.equipment-icon {
  width: 32px;
  height: 32px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3A9FF5;
}

.icon-ripple {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid rgba(58, 159, 245, 0.2);
}

.icon-ripple.mid {
  width: 75%;
  height: 75%;
  border-color: rgba(58, 159, 245, 0.3);
}

.icon-ripple.inner {
  width: 50%;
  height: 50%;
  background: rgba(58, 159, 245, 0.1);
  border-color: rgba(58, 159, 245, 0.4);
}

.equipment-name {
  font-size: 11px;
  color: #2E5C7D;
  font-weight: 400;
  text-align: center;
  line-height: 1.3;
  max-width: 100%;
}

.equipment-status {
  font-size: 11px;
  color: #3A9FF5;
  font-weight: 500;
}

.equipment-status .error {
  color: #FF4D4F;
}
</style>