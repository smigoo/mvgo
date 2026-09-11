<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1785941241031-4f1d5a5d-content">
      <!-- 顶部指标栏 -->
      <div class="c-mc-lite-1785941241031-4f1d5a5d-header">
        <div class="c-mc-lite-1785941241031-4f1d5a5d-title-group">
          <span class="c-mc-lite-1785941241031-4f1d5a5d-main-title">设备监测</span>
        </div>
        <div class="c-mc-lite-1785941241031-4f1d5a5d-indicators">
          <div class="c-mc-lite-1785941241031-4f1d5a5d-indicator-item">
            <span class="c-mc-lite-1785941241031-4f1d5a5d-ind-icon">☰</span>
            <span class="c-mc-lite-1785941241031-4f1d5a5d-ind-label">设备类型</span>
            <span class="c-mc-lite-1785941241031-4f1d5a5d-ind-value blue">28</span>
          </div>
          <div class="c-mc-lite-1785941241031-4f1d5a5d-indicator-item">
            <span class="c-mc-lite-1785941241031-4f1d5a5d-ind-label">设备总数</span>
            <span class="c-mc-lite-1785941241031-4f1d5a5d-ind-value blue">68562</span>
          </div>
          <div class="c-mc-lite-1785941241031-4f1d5a5d-indicator-item">
            <span class="c-mc-lite-1785941241031-4f1d5a5d-ind-label">完好率</span>
            <span class="c-mc-lite-1785941241031-4f1d5a5d-ind-value green">98%</span>
          </div>
        </div>
      </div>

      <!-- 主体区域 -->
      <div class="c-mc-lite-1785941241031-4f1d5a5d-body">
        <!-- 左侧导航栏 -->
        <div class="c-mc-lite-1785941241031-4f1d5a5d-sidebar">
          <div class="c-mc-lite-1785941241031-4f1d5a5d-nav-wrapper">
            <div class="c-mc-lite-1785941241031-4f1d5a5d-nav-tag">3/3740</div>
            <div 
              v-for="item in navItems" 
              :key="item"
              class="c-mc-lite-1785941241031-4f1d5a5d-nav-item"
              :class="{ 'active': activeNav === item }"
              @click="activeNav = item"
            >
              <span class="c-mc-lite-1785941241031-4f1d5a5d-nav-text">{{ item }}</span>
              <div v-if="item === '照明'" class="c-mc-lite-1785941241031-4f1d5a5d-badge">3</div>
            </div>
          </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="c-mc-lite-1785941241031-4f1d5a5d-main-content">
          <!-- 上方数据卡片 -->
          <div class="c-mc-lite-1785941241031-4f1d5a5d-cards-row">
            <!-- 卡片1：隧道设备 -->
            <div class="c-mc-lite-1785941241031-4f1d5a5d-card card-blue">
              <div class="c-mc-lite-1785941241031-4f1d5a5d-card-icon-wrap">
                <div class="c-mc-lite-1785941241031-4f1d5a5d-icon-circle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="c-mc-lite-1785941241031-4f1d5a5d-svg-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
              </div>
              <div class="c-mc-lite-1785941241031-4f1d5a5d-card-info">
                <div class="c-mc-lite-1785941241031-4f1d5a5d-card-row">
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-label">总 数:</span>
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-value white">56302</span>
                </div>
                <div class="c-mc-lite-1785941241031-4f1d5a5d-card-row">
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-subtitle">隧道设备</span>
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-label">异常数:</span>
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-value red">5</span>
                </div>
              </div>
            </div>

            <!-- 卡片2：南北接线设备 -->
            <div class="c-mc-lite-1785941241031-4f1d5a5d-card card-grey">
              <div class="c-mc-lite-1785941241031-4f1d5a5d-card-icon-wrap">
                <div class="c-mc-lite-1785941241031-4f1d5a5d-icon-circle grey-bg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" class="c-mc-lite-1785941241031-4f1d5a5d-svg-icon"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4m-2-2v4m8-2h2"/></svg>
                </div>
              </div>
              <div class="c-mc-lite-1785941241031-4f1d5a5d-card-info">
                <div class="c-mc-lite-1785941241031-4f1d5a5d-card-row">
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-label dark">总 数:</span>
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-value blue">1280</span>
                </div>
                <div class="c-mc-lite-1785941241031-4f1d5a5d-card-row">
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-subtitle dark">南北接线设备</span>
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-label dark">异常数:</span>
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-card-value red">3</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 下方设备网格 -->
          <div class="c-mc-lite-1785941241031-4f1d5a5d-grid">
            <div v-for="(device, index) in devices" :key="index" class="c-mc-lite-1785941241031-4f1d5a5d-grid-item">
              <div class="c-mc-lite-1785941241031-4f1d5a5d-item-icon-area">
                <div class="c-mc-lite-1785941241031-4f1d5a5d-base-plate"></div>
                <div class="c-mc-lite-1785941241031-4f1d5a5d-device-icon">
                  <!-- 简单模拟图标 -->
                  <span v-if="device.name.includes('摄像')" class="icon-emoji">📷</span>
                  <span v-else-if="device.name.includes('风速')" class="icon-emoji">️</span>
                  <span v-else-if="device.name.includes('超高')" class="icon-emoji">🚛</span>
                  <span v-else-if="device.name.includes('机器人')" class="icon-emoji">🤖</span>
                  <span v-else-if="device.name.includes('雷达')" class="icon-emoji">📡</span>
                  <span v-else-if="device.name.includes('CO2')" class="icon-emoji">🌫️</span>
                  <span v-else-if="device.name.includes('CO/VI')" class="icon-emoji">☁️</span>
                  <span v-else-if="device.name.includes('温湿度')" class="icon-emoji">🌡️</span>
                  <span v-else-if="device.name.includes('压力')" class="icon-emoji">⏲️</span>
                  <span v-else-if="device.name.includes('光照')" class="icon-emoji">☀️</span>
                  <span v-else-if="device.name.includes('电话')" class="icon-emoji">📞</span>
                  <span v-else-if="device.name.includes('水质')" class="icon-emoji">💧</span>
                  <span v-else class="icon-emoji">📟</span>
                </div>
              </div>
              <div class="c-mc-lite-1785941241031-4f1d5a5d-item-text">
                <div class="c-mc-lite-1785941241031-4f1d5a5d-item-name">{{ device.name }}</div>
                <div class="c-mc-lite-1785941241031-4f1d5a5d-item-status">
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-status-abnormal" :class="{ 'has-error': device.abnormal > 0 }">({{ device.abnormal }}</span>
                  <span class="c-mc-lite-1785941241031-4f1d5a5d-status-total">/{{ device.total }})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue';

const activeNav = ref('监控');

const navItems = ['监控', '照明', '通风', '供配电', '消防', '交通诱导'];

const devices = [
  { name: '摄像机', abnormal: 2, total: 484 },
  { name: '风速风向仪', abnormal: 1, total: 484 },
  { name: '超高检测器', abnormal: 0, total: 484 },
  { name: '烟道机器人', abnormal: 0, total: 484 },
  { name: '激光雷达', abnormal: 0, total: 484 },
  { name: 'CO₂传感器', abnormal: 0, total: 484 },
  { name: 'CO/VI检测器', abnormal: 0, total: 484 },
  { name: '温湿度传感器', abnormal: 0, total: 484 },
  { name: '压力传感器', abnormal: 0, total: 484 },
  { name: '光照度变送器', abnormal: 0, total: 484 },
  { name: '紧急电话', abnormal: 0, total: 484 },
  { name: '水质监测设备', abnormal: 0, total: 484 },
];
</script>

<style scoped>
.c-mc-lite-1785941241031-4f1d5a5d-content {
  width: 100%;
  height: 100%;
  background-color: #8fa3b8; /* 整体背景偏蓝灰 */
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #1e293b;
}

/* Header */
.c-mc-lite-1785941241031-4f1d5a5d-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding: 0 10px;
}

.c-mc-lite-1785941241031-4f1d5a5d-main-title {
  font-size: 24px;
  font-weight: bold;
  color: #3b82f6;
  margin-right: 20px;
}

.c-mc-lite-1785941241031-4f1d5a5d-indicators {
  display: flex;
  gap: 20px;
  align-items: center;
  font-size: 16px;
}

.c-mc-lite-1785941241031-4f1d5a5d-indicator-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.c-mc-lite-1785941241031-4f1d5a5d-ind-icon {
  color: #3b82f6;
  font-size: 18px;
  margin-right: 5px;
}

.c-mc-lite-1785941241031-4f1d5a5d-ind-label {
  color: #1e293b;
}

.c-mc-lite-1785941241031-4f1d5a5d-ind-value {
  font-size: 24px;
  font-weight: bold;
}

.c-mc-lite-1785941241031-4f1d5a5d-ind-value.blue { color: #3b82f6; }
.c-mc-lite-1785941241031-4f1d5a5d-ind-value.green { color: #10b981; }

/* Body Layout */
.c-mc-lite-1785941241031-4f1d5a5d-body {
  display: flex;
  flex: 1;
  gap: 15px;
  overflow: hidden;
}

/* Sidebar */
.c-mc-lite-1785941241031-4f1d5a5d-sidebar {
  width: 80px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.c-mc-lite-1785941241031-4f1d5a5d-nav-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

.c-mc-lite-1785941241031-4f1d5a5d-nav-tag {
  position: absolute;
  top: -25px;
  left: 0;
  background: #fff;
  color: #ef4444;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  z-index: 10;
  border: 1px solid #cbd5e1;
}

.c-mc-lite-1785941241031-4f1d5a5d-nav-item {
  background: #cbd5e1;
  border-radius: 8px;
  padding: 15px 5px;
  text-align: center;
  cursor: pointer;
  position: relative;
  transition: all 0.3s;
  border: 1px solid #94a3b8;
}

.c-mc-lite-1785941241031-4f1d5a5d-nav-item.active {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}

.c-mc-lite-1785941241031-4f1d5a5d-nav-text {
  font-size: 16px;
  font-weight: bold;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 4px;
}

.c-mc-lite-1785941241031-4f1d5a5d-nav-item:not(.active) .c-mc-lite-1785941241031-4f1d5a5d-nav-text {
  color: #3b82f6;
}

.c-mc-lite-1785941241031-4f1d5a5d-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ef4444;
  color: #fff;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* Main Content */
.c-mc-lite-1785941241031-4f1d5a5d-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Cards Row */
.c-mc-lite-1785941241031-4f1d5a5d-cards-row {
  display: flex;
  gap: 20px;
  height: 120px;
}

.c-mc-lite-1785941241031-4f1d5a5d-card {
  flex: 1;
  border-radius: 12px;
  padding: 15px 25px;
  display: flex;
  align-items: center;
  gap: 20px;
  position: relative;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

/* Card 1: Blue */
.c-mc-lite-1785941241031-4f1d5a5d-card.card-blue {
  background: #3b82f6;
  color: #fff;
  /* 箭头形状模拟 */
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
  padding-right: 40px;
}

/* Card 2: Grey */
.c-mc-lite-1785941241031-4f1d5a5d-card.card-grey {
  background: #cbd5e1;
  color: #1e293b;
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
  padding-right: 40px;
}

.c-mc-lite-1785941241031-4f1d5a5d-card-icon-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.c-mc-lite-1785941241031-4f1d5a5d-icon-circle {
  width: 50px;
  height: 50px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.c-mc-lite-1785941241031-4f1d5a5d-icon-circle.grey-bg {
  background: #fff;
}

.c-mc-lite-1785941241031-4f1d5a5d-svg-icon {
  width: 28px;
  height: 28px;
  color: #3b82f6;
}

.c-mc-lite-1785941241031-4f1d5a5d-card-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.c-mc-lite-1785941241031-4f1d5a5d-card-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.c-mc-lite-1785941241031-4f1d5a5d-card-label {
  font-size: 18px;
  color: rgba(255,255,255,0.8);
}
.c-mc-lite-1785941241031-4f1d5a5d-card-label.dark {
  color: #1e293b;
}

.c-mc-lite-1785941241031-4f1d5a5d-card-value {
  font-size: 28px;
  font-weight: bold;
}
.c-mc-lite-1785941241031-4f1d5a5d-card-value.white { color: #fff; }
.c-mc-lite-1785941241031-4f1d5a5d-card-value.blue { color: #3b82f6; }
.c-mc-lite-1785941241031-4f1d5a5d-card-value.red { color: #ef4444; }

.c-mc-lite-1785941241031-4f1d5a5d-card-subtitle {
  font-size: 14px;
  color: rgba(255,255,255,0.9);
  margin-right: 10px;
}
.c-mc-lite-1785941241031-4f1d5a5d-card-subtitle.dark {
  color: #1e293b;
  font-weight: bold;
}

/* Grid */
.c-mc-lite-1785941241031-4f1d5a5d-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 15px;
  flex: 1;
}

.c-mc-lite-1785941241031-4f1d5a5d-grid-item {
  background: #cbd5e1;
  border-radius: 8px;
  padding: 15px;
  display: flex;
  align-items: center;
  gap: 15px;
  border: 1px solid #94a3b8;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.c-mc-lite-1785941241031-4f1d5a5d-item-icon-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  width: 50px;
}

.c-mc-lite-1785941241031-4f1d5a5d-base-plate {
  width: 40px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  margin-top: -5px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 1;
}

.c-mc-lite-1785941241031-4f1d5a5d-device-icon {
  font-size: 24px;
  margin-bottom: 5px;
  z-index: 2;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));
}

.icon-emoji {
  font-size: 24px;
}

.c-mc-lite-1785941241031-4f1d5a5d-item-text {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.c-mc-lite-1785941241031-4f1d5a5d-item-name {
  font-size: 16px;
  color: #1e293b;
  font-weight: 500;
}

.c-mc-lite-1785941241031-4f1d5a5d-item-status {
  font-size: 20px;
  font-weight: bold;
  display: flex;
}

.c-mc-lite-1785941241031-4f1d5a5d-status-abnormal {
  color: #3b82f6; /* 默认蓝色 */
}
.c-mc-lite-1785941241031-4f1d5a5d-status-abnormal.has-error {
  color: #ef4444; /* 有异常变红 */
}

.c-mc-lite-1785941241031-4f1d5a5d-status-total {
  color: #3b82f6;
}

</style>