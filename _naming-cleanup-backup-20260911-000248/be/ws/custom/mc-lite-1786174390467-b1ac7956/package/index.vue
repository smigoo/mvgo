<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1786174390467-b1ac7956-content">
      <!-- 顶部统计栏 -->
      <div class="c-mc-lite-1786174390467-b1ac7956-header">
        <div class="c-mc-lite-1786174390467-b1ac7956-header-title">
          <span class="c-mc-lite-1786174390467-b1ac7956-icon-placeholder">📊</span>
          设备监测
        </div>
        <div class="c-mc-lite-1786174390467-b1ac7956-header-stats">
          <div class="c-mc-lite-1786174390467-b1ac7956-stat-item">
            <span class="c-mc-lite-1786174390467-b1ac7956-icon-placeholder">📋</span>
            设备类型 <span class="c-mc-lite-1786174390467-b1ac7956-text-blue">28</span>
          </div>
          <div class="c-mc-lite-1786174390467-b1ac7956-stat-item">
            设备总数 <span class="c-mc-lite-1786174390467-b1ac7956-text-blue">68562</span>
          </div>
          <div class="c-mc-lite-1786174390467-b1ac7956-stat-item">
            完好率 <span class="c-mc-lite-1786174390467-b1ac7956-text-green">98%</span>
          </div>
        </div>
      </div>

      <!-- 主体内容 -->
      <div class="c-mc-lite-1786174390467-b1ac7956-body">
        <!-- 左侧导航栏 -->
        <div class="c-mc-lite-1786174390467-b1ac7956-sidebar">
          <div class="c-mc-lite-1786174390467-b1ac7956-page-indicator">3/3740</div>
          <div 
            v-for="(item, index) in navItems" 
            :key="index"
            class="c-mc-lite-1786174390467-b1ac7956-nav-item"
            :class="{ 'c-mc-lite-1786174390467-b1ac7956-active': activeNav === item.name }"
            @click="activeNav = item.name"
          >
            <span v-if="item.badge" class="c-mc-lite-1786174390467-b1ac7956-badge">{{ item.badge }}</span>
            {{ item.name }}
          </div>
        </div>

        <!-- 右侧主内容区 -->
        <div class="c-mc-lite-1786174390467-b1ac7956-main">
          <!-- 顶部统计卡片 -->
          <div class="c-mc-lite-1786174390467-b1ac7956-summary-cards">
            <!-- 卡片1：隧道设备 -->
            <div class="c-mc-lite-1786174390467-b1ac7956-card c-mc-lite-1786174390467-b1ac7956-card-blue">
              <div class="c-mc-lite-1786174390467-b1ac7956-card-icon-area">
                <div class="c-mc-lite-1786174390467-b1ac7956-big-icon">🔵</div>
                <div class="c-mc-lite-1786174390467-b1ac7956-card-label">隧道设备</div>
              </div>
              <div class="c-mc-lite-1786174390467-b1ac7956-card-data">
                <div class="c-mc-lite-1786174390467-b1ac7956-card-title">总 数:<span class="c-mc-lite-1786174390467-b1ac7956-text-white-bold">56302</span></div>
                <div class="c-mc-lite-1786174390467-b1ac7956-card-subtitle">异常数:<span class="c-mc-lite-1786174390467-b1ac7956-text-red">5</span></div>
              </div>
            </div>

            <!-- 卡片2：南北接线设备 -->
            <div class="c-mc-lite-1786174390467-b1ac7956-card c-mc-lite-1786174390467-b1ac7956-card-gray">
              <div class="c-mc-lite-1786174390467-b1ac7956-card-icon-area">
                <div class="c-mc-lite-1786174390467-b1ac7956-big-icon-light"></div>
                <div class="c-mc-lite-1786174390467-b1ac7956-card-label-dark">南北接线<br>设备</div>
              </div>
              <div class="c-mc-lite-1786174390467-b1ac7956-card-data">
                <div class="c-mc-lite-1786174390467-b1ac7956-card-title-dark">总 数:<span class="c-mc-lite-1786174390467-b1ac7956-text-blue-bold">1280</span></div>
                <div class="c-mc-lite-1786174390467-b1ac7956-card-subtitle-dark">异常数:<span class="c-mc-lite-1786174390467-b1ac7956-text-red">3</span></div>
              </div>
            </div>
          </div>

          <!-- 设备网格 -->
          <div class="c-mc-lite-1786174390467-b1ac7956-device-grid">
            <div 
              v-for="(device, index) in devices" 
              :key="index"
              class="c-mc-lite-1786174390467-b1ac7956-grid-item"
            >
              <div class="c-mc-lite-1786174390467-b1ac7956-device-icon">
                <div class="c-mc-lite-1786174390467-b1ac7956-icon-circle"></div>
              </div>
              <div class="c-mc-lite-1786174390467-b1ac7956-device-name">{{ device.name }}</div>
              <div class="c-mc-lite-1786174390467-b1ac7956-device-count">
                <span :class="device.count > 0 ? 'c-mc-lite-1786174390467-b1ac7956-text-red' : 'c-mc-lite-1786174390467-b1ac7956-text-blue'">
                  ({{ device.count }}/{{ device.total }})
                </span>
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

const navItems = [
  { name: '监控' },
  { name: '照明', badge: 3 },
  { name: '通风' },
  { name: '供配电' },
  { name: '消防' },
  { name: '交通诱导' }
];

const devices = [
  { name: '摄像机', count: 2, total: 484 },
  { name: '风速风向仪', count: 1, total: 484 },
  { name: '超高检测器', count: 0, total: 484 },
  { name: '烟道机器人', count: 0, total: 484 },
  { name: '激光雷达', count: 0, total: 484 },
  { name: 'CO传感器', count: 0, total: 484 },
  { name: 'CO/VI检测器', count: 0, total: 484 },
  { name: '温湿度传感器', count: 0, total: 484 },
  { name: '压力传感器', count: 0, total: 484 },
  { name: '光照度变送器', count: 0, total: 484 },
  { name: '紧急电话', count: 0, total: 484 },
  { name: '水质监测设备', count: 0, total: 484 }
];
</script>

<style scoped>
.c-mc-lite-1786174390467-b1ac7956-content {
  width: 100%;
  height: 100%;
  background-color: #0b1a30;
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  display: flex;
  flex-direction: column;
  padding: 1%;
  box-sizing: border-box;
  overflow: hidden;
}

/* Header Styles */
.c-mc-lite-1786174390467-b1ac7956-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 8%;
  margin-bottom: 1%;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.5%;
}

.c-mc-lite-1786174390467-b1ac7956-header-title {
  font-size: 1.2rem;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #4facfe;
}

.c-mc-lite-1786174390467-b1ac7956-header-stats {
  display: flex;
  gap: 2rem;
  font-size: 1rem;
}

.c-mc-lite-1786174390467-b1ac7956-stat-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

/* Body Layout */
.c-mc-lite-1786174390467-b1ac7956-body {
  display: flex;
  height: 90%;
  gap: 1%;
}

/* Sidebar Styles */
.c-mc-lite-1786174390467-b1ac7956-sidebar {
  width: 6%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  position: relative;
}

.c-mc-lite-1786174390467-b1ac7956-page-indicator {
  font-size: 0.7rem;
  color: #fff;
  background: #fff;
  color: #333;
  padding: 2px 4px;
  border-radius: 2px;
  margin-bottom: 0.5rem;
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(-20%);
}

.c-mc-lite-1786174390467-b1ac7956-nav-item {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: 1rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  position: relative;
  transition: all 0.3s;
  border: 1px solid transparent;
}

.c-mc-lite-1786174390467-b1ac7956-nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.c-mc-lite-1786174390467-b1ac7956-active {
  background: #1e90ff;
  color: #fff;
  font-weight: bold;
  box-shadow: 0 0 10px rgba(30, 144, 255, 0.5);
}

.c-mc-lite-1786174390467-b1ac7956-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ff4d4f;
  color: white;
  font-size: 0.7rem;
  padding: 2px 5px;
  border-radius: 10px;
  writing-mode: horizontal-tb;
}

/* Main Content Styles */
.c-mc-lite-1786174390467-b1ac7956-main {
  width: 93%;
  display: flex;
  flex-direction: column;
  gap: 1%;
}

/* Summary Cards */
.c-mc-lite-1786174390467-b1ac7956-summary-cards {
  display: flex;
  gap: 1%;
  height: 20%;
}

.c-mc-lite-1786174390467-b1ac7956-card {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 1rem;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

/* Card Shapes mimicking the screenshot (arrow-like right side) */
.c-mc-lite-1786174390467-b1ac7956-card::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 20px;
  background: inherit;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}

.c-mc-lite-1786174390467-b1ac7956-card-blue {
  background: linear-gradient(90deg, #2b7de9 0%, #5ca0f2 100%);
}

.c-mc-lite-1786174390467-b1ac7956-card-gray {
  background: linear-gradient(90deg, #eef2f6 0%, #dce4ec 100%);
}

.c-mc-lite-1786174390467-b1ac7956-card-icon-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 25%;
  margin-right: 1rem;
}

.c-mc-lite-1786174390467-b1ac7956-big-icon {
  font-size: 2rem;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.c-mc-lite-1786174390467-b1ac7956-big-icon-light {
  font-size: 2rem;
  background: rgba(0,0,0,0.05);
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.c-mc-lite-1786174390467-b1ac7956-card-label {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.8);
  text-align: center;
}

.c-mc-lite-1786174390467-b1ac7956-card-label-dark {
  font-size: 0.8rem;
  color: #333;
  text-align: center;
  line-height: 1.2;
}

.c-mc-lite-1786174390467-b1ac7956-card-data {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.c-mc-lite-1786174390467-b1ac7956-card-title {
  font-size: 1.2rem;
  color: rgba(255,255,255,0.9);
  margin-bottom: 0.5rem;
}

.c-mc-lite-1786174390467-b1ac7956-card-title-dark {
  font-size: 1.2rem;
  color: #333;
  margin-bottom: 0.5rem;
}

.c-mc-lite-1786174390467-b1ac7956-card-subtitle {
  font-size: 1rem;
  color: rgba(255,255,255,0.8);
}

.c-mc-lite-1786174390467-b1ac7956-card-subtitle-dark {
  font-size: 1rem;
  color: #666;
}

/* Device Grid */
.c-mc-lite-1786174390467-b1ac7956-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 1%;
  height: 75%;
}

.c-mc-lite-1786174390467-b1ac7956-grid-item {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: background 0.3s;
}

.c-mc-lite-1786174390467-b1ac7956-grid-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.c-mc-lite-1786174390467-b1ac7956-device-icon {
  margin-bottom: 0.5rem;
}

.c-mc-lite-1786174390467-b1ac7956-icon-circle {
  width: 40px;
  height: 40px;
  background: radial-gradient(circle, #4facfe 0%, #00f2fe 100%);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(79, 172, 254, 0.5);
  position: relative;
}

/* Small antenna on icon */
.c-mc-lite-1786174390467-b1ac7956-icon-circle::after {
  content: '';
  position: absolute;
  top: -5px;
  right: 5px;
  width: 4px;
  height: 10px;
  background: #4facfe;
  border-radius: 2px;
  transform: rotate(45deg);
}

.c-mc-lite-1786174390467-b1ac7956-device-name {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: #ccc;
}

.c-mc-lite-1786174390467-b1ac7956-device-count {
  font-size: 1.1rem;
  font-weight: bold;
}

/* Utility Colors */
.c-mc-lite-1786174390467-b1ac7956-text-blue { color: #4facfe; font-weight: bold; }
.c-mc-lite-1786174390467-b1ac7956-text-green { color: #00e676; font-weight: bold; }
.c-mc-lite-1786174390467-b1ac7956-text-red { color: #ff4d4f; font-weight: bold; }
.c-mc-lite-1786174390467-b1ac7956-text-white-bold { color: #fff; font-weight: bold; font-size: 1.5rem; margin-left: 5px;}
.c-mc-lite-1786174390467-b1ac7956-text-blue-bold { color: #1e90ff; font-weight: bold; font-size: 1.5rem; margin-left: 5px;}

.c-mc-lite-1786174390467-b1ac7956-icon-placeholder {
  font-size: 1.2rem;
  margin-right: 5px;
}
</style>