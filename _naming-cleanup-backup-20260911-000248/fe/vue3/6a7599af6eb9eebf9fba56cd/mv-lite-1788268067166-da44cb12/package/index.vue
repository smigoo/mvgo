<template>
  <div class="equipment-monitor">
    <!-- 左侧导航栏 -->
    <div class="equipment-monitor-sidebar">
      <div class="equipment-monitor-sidebar-count">3/3740</div>
      <div class="equipment-monitor-sidebar-buttons">
        <button class="equipment-monitor-sidebar-button">监控</button>
        <button class="equipment-monitor-sidebar-button equipment-monitor-sidebar-button-badge">
          照明
          <span class="equipment-monitor-badge">3</span>
        </button>
        <button class="equipment-monitor-sidebar-button">通风</button>
        <button class="equipment-monitor-sidebar-button">供配电</button>
        <button class="equipment-monitor-sidebar-button">消防</button>
        <button class="equipment-monitor-sidebar-button">交通诱导</button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="equipment-monitor-main">
      <!-- 顶部统计栏 -->
      <div class="equipment-monitor-header">
        <span class="equipment-monitor-header-title">设备监测</span>
        <span class="equipment-monitor-header-label">设备类型</span>
        <span class="equipment-monitor-header-value">28</span>
        <span class="equipment-monitor-header-label">设备总数</span>
        <span class="equipment-monitor-header-value">68562</span>
        <span class="equipment-monitor-header-label">完好率</span>
        <span class="equipment-monitor-header-value equipment-monitor-header-rate">98%</span>
      </div>

      <!-- 箭头卡片区域 -->
      <div class="equipment-monitor-cards">
        <div class="equipment-monitor-card equipment-monitor-card-left">
          <div class="equipment-monitor-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </div>
          <div class="equipment-monitor-card-content">
            <div class="equipment-monitor-card-total">总 数:56302</div>
            <div class="equipment-monitor-card-subtitle">隧道设备 <span class="equipment-monitor-card-error">异常数:5</span></div>
          </div>
        </div>

        <div class="equipment-monitor-card equipment-monitor-card-right">
          <div class="equipment-monitor-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </div>
          <div class="equipment-monitor-card-content">
            <div class="equipment-monitor-card-total equipment-monitor-card-total-alt">总 数:1280</div>
            <div class="equipment-monitor-card-subtitle">南北接线设备 <span class="equipment-monitor-card-error">异常数:3</span></div>
          </div>
        </div>
      </div>

      <!-- 设备网格 -->
      <div class="equipment-monitor-grid">
        <div v-for="device in devices" :key="device.name" class="equipment-monitor-device">
          <div class="equipment-monitor-device-icon-wrapper">
            <div class="equipment-monitor-device-pedestal"></div>
            <div class="equipment-monitor-device-icon" v-html="device.icon"></div>
          </div>
          <div class="equipment-monitor-device-name">{{ device.name }}</div>
          <div class="equipment-monitor-device-status" :class="{'has-error': device.error > 0}">
            (<span class="error-count">{{ device.error }}</span>/<span class="total-count">{{ device.total }}</span>)
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const devices = ref([
  { name: '摄像机', error: 2, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>' },
  { name: '风速风向仪', error: 1, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z"/></svg>' },
  { name: '超高检测器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4V8h16v10z"/></svg>' },
  { name: '烟道机器人', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 16c-.83 0-1.5-.67-1.5-1.5S6.67 13 7.5 13s1.5.67 1.5 1.5S8.33 16 7.5 16zm3-7C9.12 9 8 7.88 8 6.5S9.12 4 10.5 4s2.5 1.12 2.5 2.5S11.88 9 10.5 9zm6 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>' },
  { name: '激光雷达', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/></svg>' },
  { name: 'CO2传感器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-5h2v5zm4 0h-2V7h2v10zm4 0h-2v-7h2v7z"/></svg>' },
  { name: 'CO/VI检测器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>' },
  { name: '温湿度传感器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z"/></svg>' },
  { name: '压力传感器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>' },
  { name: '光照度变送器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>' },
  { name: '紧急电话', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>' },
  { name: '水质监测设备', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>' }
])
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #E4EEF9;
  display: flex;
  padding: 10px;
  gap: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

.equipment-monitor-sidebar {
  width: 42px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
}

.equipment-monitor-sidebar-count {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #3B9EFF;
  flex-shrink: 0;
}

.equipment-monitor-sidebar-buttons {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow: visible;
  padding-top: 12px;
}

.equipment-monitor-sidebar-button {
  flex: 1;
  min-height: 0;
  background: rgba(59, 158, 255, 0.15);
  border: 1px solid rgba(59, 158, 255, 0.3);
  border-radius: 4px;
  color: #3B9EFF;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.5px;
  cursor: pointer;
  writing-mode: vertical-rl;
  white-space: nowrap;
  padding: 8px 4px;
  position: relative;
  transition: background 0.2s;
}

.equipment-monitor-sidebar-button:hover {
  background: rgba(59, 158, 255, 0.25);
}

.equipment-monitor-sidebar-button-badge {
  overflow: visible;
}

.equipment-monitor-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #FF3B30;
  color: white;
  font-size: 9px;
  font-weight: 600;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: horizontal-tb;
  z-index: 10;
}

.equipment-monitor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
}

.equipment-monitor-header {
  height: 38px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  flex-shrink: 0;
}

.equipment-monitor-header-title {
  font-size: 14px;
  font-weight: 600;
  color: #3B9EFF;
  margin-right: 8px;
}

.equipment-monitor-header-label {
  color: #2C3E50;
  font-weight: 500;
}

.equipment-monitor-header-value {
  color: #3B9EFF;
  font-weight: 700;
  font-size: 13px;
  margin-right: 6px;
}

.equipment-monitor-header-rate {
  color: #00D4AA;
}

.equipment-monitor-cards {
  height: 58px;
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.equipment-monitor-card {
  flex: 1;
  min-width: 0;
  background: linear-gradient(135deg, rgba(59, 158, 255, 0.25) 0%, rgba(59, 158, 255, 0.15) 100%);
  border: 1px solid rgba(59, 158, 255, 0.3);
  clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%);
  display: flex;
  align-items: center;
  padding: 10px 14px;
  gap: 12px;
}

.equipment-monitor-card-left {
  background: linear-gradient(135deg, rgba(59, 158, 255, 0.3) 0%, rgba(59, 158, 255, 0.2) 100%);
}

.equipment-monitor-card-right {
  background: linear-gradient(135deg, rgba(135, 206, 250, 0.25) 0%, rgba(135, 206, 250, 0.15) 100%);
  border-color: rgba(135, 206, 250, 0.3);
}

.equipment-monitor-card-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  border: 2px solid rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.equipment-monitor-card-icon svg {
  width: 18px;
  height: 18px;
}

.equipment-monitor-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.equipment-monitor-card-total {
  font-size: 15px;
  font-weight: 700;
  color: white;
  white-space: nowrap;
}

.equipment-monitor-card-total-alt {
  color: #87CEFA;
}

.equipment-monitor-card-subtitle {
  font-size: 10px;
  font-weight: 500;
  color: white;
  white-space: nowrap;
}

.equipment-monitor-card-error {
  color: #FF3B30;
  font-weight: 600;
}

.equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
}

.equipment-monitor-device {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(224, 230, 237, 0.5);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 0;
}

.equipment-monitor-device-icon-wrapper {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.equipment-monitor-device-pedestal {
  position: absolute;
  bottom: 0;
  width: 36px;
  height: 12px;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.2));
  border-radius: 50% / 40%;
}

.equipment-monitor-device-icon {
  width: 24px;
  height: 24px;
  color: #3B9EFF;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

.equipment-monitor-device-icon svg {
  width: 100%;
  height: 100%;
}

.equipment-monitor-device-name {
  font-size: 10px;
  font-weight: 500;
  color: #2C3E50;
  text-align: center;
  line-height: 1.2;
  white-space: nowrap;
}

.equipment-monitor-device-status {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.equipment-monitor-device-status .error-count {
  color: #FF3B30;
}

.equipment-monitor-device-status .total-count {
  color: #00D4FF;
}

.equipment-monitor-device-status.has-error .error-count {
  color: #FF3B30;
}
</style>