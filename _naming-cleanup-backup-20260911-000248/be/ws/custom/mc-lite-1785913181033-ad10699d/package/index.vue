<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1785913181033-ad10699d-container">
      <!-- 顶部 Header -->
      <div class="c-mc-lite-1785913181033-ad10699d-header">
        <div class="c-mc-lite-1785913181033-ad10699d-header-left">
          <span class="c-mc-lite-1785913181033-ad10699d-header-icon">📊</span>
          <span class="c-mc-lite-1785913181033-ad10699d-header-title">设备监测</span>
        </div>
        <div class="c-mc-lite-1785913181033-ad10699d-header-stats">
          <div class="c-mc-lite-1785913181033-ad10699d-stat-item">
            <span class="c-mc-lite-1785913181033-ad10699d-stat-icon">📋</span>
            <span>设备类型</span>
            <span class="c-mc-lite-1785913181033-ad10699d-text-blue">28</span>
          </div>
          <div class="c-mc-lite-1785913181033-ad10699d-stat-item">
            <span>设备总数</span>
            <span class="c-mc-lite-1785913181033-ad10699d-text-blue">68562</span>
          </div>
          <div class="c-mc-lite-1785913181033-ad10699d-stat-item">
            <span>完好率</span>
            <span class="c-mc-lite-1785913181033-ad10699d-text-green">98%</span>
          </div>
        </div>
      </div>

      <div class="c-mc-lite-1785913181033-ad10699d-body">
        <!-- 左侧导航 -->
        <div class="c-mc-lite-1785913181033-ad10699d-sidebar">
          <div class="c-mc-lite-1785913181033-ad10699d-sidebar-top-badge">3/3740</div>
          <div
            v-for="item in menuItems"
            :key="item"
            class="c-mc-lite-1785913181033-ad10699d-menu-item"
            :class="{ 'c-mc-lite-1785913181033-ad10699d-menu-active': activeMenu === item }"
            @click="activeMenu = item"
          >
            <span class="c-mc-lite-1785913181033-ad10699d-menu-text">{{ item }}</span>
            <span v-if="item === '照明'" class="c-mc-lite-1785913181033-ad10699d-badge">3</span>
          </div>
        </div>

        <!-- 右侧主内容 -->
        <div class="c-mc-lite-1785913181033-ad10699d-main">
          <!-- 上方统计卡片 -->
          <div class="c-mc-lite-1785913181033-ad10699d-cards-container">
            <div class="c-mc-lite-1785913181033-ad10699d-big-card c-mc-lite-1785913181033-ad10699d-card-1">
              <div class="c-mc-lite-1785913181033-ad10699d-card-icon-wrap">
                <div class="c-mc-lite-1785913181033-ad10699d-card-icon"></div>
              </div>
              <div class="c-mc-lite-1785913181033-ad10699d-card-content">
                <div class="c-mc-lite-1785913181033-ad10699d-card-total">总 数:<span class="c-mc-lite-1785913181033-ad10699d-num-large">56302</span></div>
                <div class="c-mc-lite-1785913181033-ad10699d-card-sub">
                  <span class="c-mc-lite-1785913181033-ad10699d-card-label">隧道设备</span>
                  <span>异常数:<span class="c-mc-lite-1785913181033-ad10699d-text-red">5</span></span>
                </div>
              </div>
            </div>
            <div class="c-mc-lite-1785913181033-ad10699d-big-card c-mc-lite-1785913181033-ad10699d-card-2">
              <div class="c-mc-lite-1785913181033-ad10699d-card-icon-wrap">
                <div class="c-mc-lite-1785913181033-ad10699d-card-icon">🌐</div>
              </div>
              <div class="c-mc-lite-1785913181033-ad10699d-card-content">
                <div class="c-mc-lite-1785913181033-ad10699d-card-total">总 数:<span class="c-mc-lite-1785913181033-ad10699d-num-large">1280</span></div>
                <div class="c-mc-lite-1785913181033-ad10699d-card-sub">
                  <span class="c-mc-lite-1785913181033-ad10699d-card-label">南北接线设备</span>
                  <span>异常数:<span class="c-mc-lite-1785913181033-ad10699d-text-red">3</span></span>
                </div>
              </div>
            </div>
          </div>

          <!-- 下方设备网格 -->
          <div class="c-mc-lite-1785913181033-ad10699d-grid">
            <div
              v-for="(device, index) in deviceList"
              :key="index"
              class="c-mc-lite-1785913181033-ad10699d-grid-item"
            >
              <div class="c-mc-lite-1785913181033-ad10699d-grid-icon">📡</div>
              <div class="c-mc-lite-1785913181033-ad10699d-grid-name">{{ device.name }}</div>
              <div class="c-mc-lite-1785913181033-ad10699d-grid-status">
                (<span :class="getAbnormalColor(device.abnormal)">{{ device.abnormal }}</span>/<span class="c-mc-lite-1785913181033-ad10699d-text-blue">{{ device.total }}</span>)
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

const activeMenu = ref('监控');

const menuItems = ['监控', '照明', '通风', '供配电', '消防', '交通诱导'];

const deviceList = [
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

const getAbnormalColor = (val) => {
  if (val === 1) return 'c-mc-lite-1785913181033-ad10699d-text-red';
  if (val === 2) return 'c-mc-lite-1785913181033-ad10699d-text-teal';
  return 'c-mc-lite-1785913181033-ad10699d-text-teal'; // 0 也是绿色/青色
};
</script>

<style scoped>
.c-mc-lite-1785913181033-ad10699d-container {
  width: 100%;
  height: 100%;
  background-color: #1a202c; /* 深色背景 */
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  font-family: sans-serif;
}

/* Header */
.c-mc-lite-1785913181033-ad10699d-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 0 10px;
}

.c-mc-lite-1785913181033-ad10699d-header-left {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: bold;
}

.c-mc-lite-1785913181033-ad10699d-header-icon {
  margin-right: 8px;
  color: #4A90E2;
}

.c-mc-lite-1785913181033-ad10699d-header-title {
  color: #4A90E2;
}

.c-mc-lite-1785913181033-ad10699d-header-stats {
  display: flex;
  gap: 20px;
  font-size: 14px;
}

.c-mc-lite-1785913181033-ad10699d-stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.c-mc-lite-1785913181033-ad10699d-text-blue {
  color: #4A90E2;
  font-weight: bold;
  font-size: 16px;
}

.c-mc-lite-1785913181033-ad10699d-text-green {
  color: #2ecc71;
  font-weight: bold;
  font-size: 16px;
}

.c-mc-lite-1785913181033-ad10699d-text-red {
  color: #e74c3c;
  font-weight: bold;
}

.c-mc-lite-1785913181033-ad10699d-text-teal {
  color: #1abc9c;
  font-weight: bold;
}

/* Body Layout */
.c-mc-lite-1785913181033-ad10699d-body {
  display: flex;
  flex: 1;
  gap: 10px;
  overflow: hidden;
}

/* Sidebar */
.c-mc-lite-1785913181033-ad10699d-sidebar {
  width: 80px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  position: relative;
}

.c-mc-lite-1785913181033-ad10699d-sidebar-top-badge {
  position: absolute;
  top: -10px;
  left: 0;
  background: #fff;
  color: #333;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 2px;
  z-index: 10;
  border: 1px solid #ccc;
}

.c-mc-lite-1785913181033-ad10699d-menu-item {
  background-color: #d6eaf8;
  color: #2c3e50;
  padding: 15px 5px;
  text-align: center;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  font-size: 14px;
  font-weight: bold;
  writing-mode: vertical-rl; /* 竖排文字 */
  text-orientation: mixed;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.c-mc-lite-1785913181033-ad10699d-menu-active {
  background-color: #4A90E2;
  color: #fff;
}

.c-mc-lite-1785913181033-ad10699d-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background-color: #e74c3c;
  color: #fff;
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 10px;
  writing-mode: horizontal-tb;
}

/* Main Content */
.c-mc-lite-1785913181033-ad10699d-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Cards */
.c-mc-lite-1785913181033-ad10699d-cards-container {
  display: flex;
  gap: 10px;
  background-color: #2c3e50; /* 卡片容器背景 */
  padding: 10px;
  border-radius: 8px;
}

.c-mc-lite-1785913181033-ad10699d-big-card {
  flex: 1;
  background: linear-gradient(90deg, #5dade2, #85c1e9);
  border-radius: 8px;
  padding: 15px;
  display: flex;
  align-items: center;
  color: #fff;
  position: relative;
  /* 模拟截图中的多边形形状 */
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
}

.c-mc-lite-1785913181033-ad10699d-card-2 {
  background: linear-gradient(90deg, #85c1e9, #aed6f1);
  clip-path: polygon(5% 0, 100% 0, 100% 100%, 5% 100%, 0 50%);
  margin-left: -20px; /* 重叠效果 */
  padding-left: 30px;
}

.c-mc-lite-1785913181033-ad10699d-card-icon-wrap {
  margin-right: 15px;
}

.c-mc-lite-1785913181033-ad10699d-card-icon {
  font-size: 30px;
  background: #fff;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4A90E2;
}

.c-mc-lite-1785913181033-ad10699d-card-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.c-mc-lite-1785913181033-ad10699d-card-total {
  font-size: 14px;
  margin-bottom: 5px;
}

.c-mc-lite-1785913181033-ad10699d-num-large {
  font-size: 24px;
  font-weight: bold;
  margin-left: 5px;
}

.c-mc-lite-1785913181033-ad10699d-card-sub {
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.c-mc-lite-1785913181033-ad10699d-card-label {
  font-weight: bold;
  font-size: 14px;
}

/* Grid */
.c-mc-lite-1785913181033-ad10699d-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  flex: 1;
  overflow-y: auto;
}

.c-mc-lite-1785913181033-ad10699d-grid-item {
  background-color: #eaf2f8;
  border-radius: 8px;
  padding: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #2c3e50;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.c-mc-lite-1785913181033-ad10699d-grid-icon {
  font-size: 24px;
  color: #4A90E2;
  margin-bottom: 10px;
  background: #fff;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(74, 144, 226, 0.3);
}

.c-mc-lite-1785913181033-ad10699d-grid-name {
  font-size: 14px;
  margin-bottom: 5px;
  font-weight: 500;
}

.c-mc-lite-1785913181033-ad10699d-grid-status {
  font-size: 14px;
  font-weight: bold;
}
</style>