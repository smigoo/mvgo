<template>
  <div class="dashboard-container">
    <!-- 左侧导航栏 -->
    <div class="sidebar">
      <div class="nav-item active" style="position: relative;">
        <div class="floating-tag">3/3740</div>
        <span class="nav-text">监控</span>
      </div>
      <div class="nav-item" style="position: relative;">
        <span class="nav-text">照明</span>
        <div class="badge">3</div>
      </div>
      <div class="nav-item">
        <span class="nav-text">通风</span>
      </div>
      <div class="nav-item">
        <span class="nav-text">供配电</span>
      </div>
      <div class="nav-item">
        <span class="nav-text">消防</span>
      </div>
      <div class="nav-item">
        <span class="nav-text">交通诱导</span>
      </div>
    </div>

    <!-- 右侧主内容区 -->
    <div class="main-content">
      <!-- 顶部统计栏 -->
      <div class="top-header">
        <div class="header-title">
          <div class="icon-box blue-bg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <span class="title-text">设备监测</span>
        </div>
        <div class="header-stats">
          <div class="stat-item">
            <span class="stat-icon">📊</span>
            <span class="stat-label">设备类型</span>
            <span class="stat-value blue">28</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">设备总数</span>
            <span class="stat-value blue">68562</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">完好率</span>
            <span class="stat-value green">98%</span>
          </div>
        </div>
      </div>

      <!-- 顶部卡片区域 -->
      <div class="top-cards">
        <div class="card card-left">
          <div class="card-icon-wrapper">
            <div class="icon-circle white-bg">
              <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M3 21h18M5 21V7l8-4 8 4v14M8 21v-9a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v9"/></svg>
            </div>
            <div class="card-label-group">
              <span class="card-label-title">隧道设备</span>
            </div>
          </div>
          <div class="card-data">
            <div class="data-row">
              <span class="data-label">总 数:</span>
              <span class="data-value white">56302</span>
            </div>
            <div class="data-row">
              <span class="data-label">异常数:</span>
              <span class="data-value red">5</span>
            </div>
          </div>
        </div>

        <div class="card card-right">
          <div class="card-icon-wrapper">
            <div class="icon-circle blue-bg-light">
              <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div class="card-label-group">
              <span class="card-label-title dark">南北接线<br>设备</span>
            </div>
          </div>
          <div class="card-data">
            <div class="data-row">
              <span class="data-label dark">总 数:</span>
              <span class="data-value blue">1280</span>
            </div>
            <div class="data-row">
              <span class="data-label dark">异常数:</span>
              <span class="data-value red">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 设备网格区域 -->
      <div class="device-grid">
        <div class="grid-item" v-for="(device, index) in devices" :key="index">
          <div class="device-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.5">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" opacity="0.2"/>
              <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/>
              <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
            </svg>
          </div>
          <div class="device-name">{{ device.name }}</div>
          <div class="device-status">
            <span :class="device.val > 0 ? 'text-red' : 'text-cyan'">({{ device.val }}</span>
            <span class="text-blue">/{{ device.total }})</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const devices = ref([
  { name: '摄像机', val: 2, total: 484 },
  { name: '风速风向仪', val: 1, total: 484 },
  { name: '超高检测器', val: 0, total: 484 },
  { name: '烟道机器人', val: 0, total: 484 },
  { name: '激光雷达', val: 0, total: 484 },
  { name: 'CO₂传感器', val: 0, total: 484 },
  { name: 'CO/VI检测器', val: 0, total: 484 },
  { name: '温湿度传感器', val: 0, total: 484 },
  { name: '压力传感器', val: 0, total: 484 },
  { name: '光照度变送器', val: 0, total: 484 },
  { name: '紧急电话', val: 0, total: 484 },
  { name: '水质监测设备', val: 0, total: 484 },
]);
</script>

<style scoped>
/* 全局重置与基础样式 */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.dashboard-container {
  display: flex;
  width: 100%;
  height: 100vh;
  background-color: #111827; /* 深色背景 */
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  padding: 20px;
  gap: 20px;
}

/* 左侧导航栏 */
.sidebar {
  width: 60px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.nav-item {
  background-color: #1e3a8a; /* 深蓝背景 */
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 15px 0;
  cursor: pointer;
  position: relative;
  transition: all 0.3s;
}

.nav-item.active {
  background-color: #3b82f6; /* 亮蓝选中 */
}

.nav-text {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: 14px;
  letter-spacing: 2px;
  font-weight: bold;
}

.floating-tag {
  position: absolute;
  top: -25px;
  left: 0;
  background: #fff;
  color: #333;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 2px;
  border: 1px solid #ccc;
  white-space: nowrap;
  z-index: 10;
}

.badge {
  position: absolute;
  top: -5px;
  right: -10px;
  background: #ef4444;
  color: white;
  font-size: 10px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
}

/* 右侧主内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
}

/* 顶部统计栏 */
.top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: bold;
  color: #60a5fa;
}

.icon-box {
  width: 24px;
  height: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 4px;
}

.icon-box svg {
  width: 16px;
  height: 16px;
  color: white;
}

.blue-bg {
  background-color: #3b82f6;
}

.header-stats {
  display: flex;
  gap: 30px;
  font-size: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-label {
  color: #9ca3af;
}

.stat-value {
  font-weight: bold;
  font-size: 20px;
}

.stat-value.blue { color: #3b82f6; }
.stat-value.green { color: #10b981; }

/* 顶部卡片区域 */
.top-cards {
  display: flex;
  gap: 20px;
  height: 140px;
}

.card {
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1;
}

.card-left {
  background: linear-gradient(90deg, #2563eb, #60a5fa);
  flex: 1.5;
  position: relative;
  overflow: hidden;
}

/* 模拟截图中的多边形切角效果 */
.card-left::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 40px;
  background: rgba(255,255,255,0.1);
  clip-path: polygon(20% 0, 100% 0, 100% 100%, 0% 100%);
}

.card-right {
  background: #e2e8f0;
  color: #1e293b;
  flex: 1;
  position: relative;
  overflow: hidden;
}

.card-right::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 40px;
  background: rgba(0,0,0,0.05);
  clip-path: polygon(20% 0, 100% 0, 100% 100%, 0% 100%);
}

.card-icon-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 2;
}

.icon-circle {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.icon-circle svg {
  width: 30px;
  height: 30px;
}

.white-bg { background: #ffffff; }
.blue-bg-light { background: #ffffff; }

.card-label-title {
  font-size: 12px;
  color: rgba(255,255,255,0.8);
  text-align: center;
  line-height: 1.2;
}

.card-label-title.dark {
  color: #475569;
  font-weight: bold;
}

.card-data {
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 2;
  margin-left: 20px;
}

.data-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.data-label {
  font-size: 14px;
  color: rgba(255,255,255,0.8);
}

.data-label.dark {
  color: #475569;
}

.data-value {
  font-size: 24px;
  font-weight: bold;
}

.data-value.white { color: #ffffff; }
.data-value.blue { color: #2563eb; }
.data-value.red { color: #ef4444; }

/* 设备网格区域 */
.device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 15px;
  flex: 1;
}

.grid-item {
  background: rgba(44, 74, 124, 0.4); /* 半透明浅蓝灰 */
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 15px;
  border: 1px solid rgba(255,255,255,0.05);
}

.device-icon {
  width: 40px;
  height: 40px;
  margin-bottom: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.device-icon svg {
  width: 100%;
  height: 100%;
}

.device-name {
  font-size: 14px;
  color: #cbd5e1;
  margin-bottom: 8px;
}

.device-status {
  font-size: 14px;
  font-weight: bold;
}

.text-red { color: #ef4444; }
.text-cyan { color: #06b6d4; } /* 0的时候看起来像青色或浅蓝 */
.text-blue { color: #3b82f6; }

</style>