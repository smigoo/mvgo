<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1786175495130-b0c63b2b-content">
      <!-- 顶部统计栏 -->
      <div class="c-mc-lite-1786175495130-b0c63b2b-header">
        <div class="c-mc-lite-1786175495130-b0c63b2b-header-title">
          <span class="c-mc-lite-1786175495130-b0c63b2b-icon-box"></span>
          设备监测
        </div>
        <div class="c-mc-lite-1786175495130-b0c63b2b-header-stats">
          <span class="c-mc-lite-1786175495130-b0c63b2b-stat-item">
            <span class="c-mc-lite-1786175495130-b0c63b2b-icon-small"></span>
            设备类型 <span class="c-mc-lite-1786175495130-b0c63b2b-text-blue">28</span>
          </span>
          <span class="c-mc-lite-1786175495130-b0c63b2b-stat-item">
            设备总数 <span class="c-mc-lite-1786175495130-b0c63b2b-text-blue">68562</span>
          </span>
          <span class="c-mc-lite-1786175495130-b0c63b2b-stat-item">
            完好率 <span class="c-mc-lite-1786175495130-b0c63b2b-text-green">98%</span>
          </span>
        </div>
      </div>

      <!-- 主体区域 -->
      <div class="c-mc-lite-1786175495130-b0c63b2b-main">
        <!-- 左侧导航栏 -->
        <div class="c-mc-lite-1786175495130-b0c63b2b-sidebar">
          <div class="c-mc-lite-1786175495130-b0c63b2b-sidebar-badge-top">3/3740</div>
          <div 
            v-for="(item, index) in navItems" 
            :key="index"
            class="c-mc-lite-1786175495130-b0c63b2b-nav-item"
            :class="{ 'c-mc-lite-1786175495130-b0c63b2b-nav-active': activeNav === item.name }"
            @click="activeNav = item.name"
          >
            <span v-if="item.badge" class="c-mc-lite-1786175495130-b0c63b2b-nav-badge">{{ item.badge }}</span>
            {{ item.name }}
          </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="c-mc-lite-1786175495130-b0c63b2b-right-content">
          <!-- 上部卡片区 -->
          <div class="c-mc-lite-1786175495130-b0c63b2b-top-cards">
            <!-- 卡片1：隧道设备 -->
            <div class="c-mc-lite-1786175495130-b0c63b2b-card-large c-mc-lite-1786175495130-b0c63b2b-card-blue">
              <div class="c-mc-lite-1786175495130-b0c63b2b-card-icon-wrapper">
                <div class="c-mc-lite-1786175495130-b0c63b2b-card-icon-bg">
                  <div class="c-mc-lite-1786175495130-b0c63b2b-card-icon-shape"></div>
                </div>
              </div>
              <div class="c-mc-lite-1786175495130-b0c63b2b-card-info">
                <div class="c-mc-lite-1786175495130-b0c63b2b-card-title-row">
                  <span class="c-mc-lite-1786175495130-b0c63b2b-card-label">总 数:</span>
                  <span class="c-mc-lite-1786175495130-b0c63b2b-card-value">56302</span>
                </div>
                <div class="c-mc-lite-1786175495130-b0c63b2b-card-subtitle">隧道设备</div>
                <div class="c-mc-lite-1786175495130-b0c63b2b-card-exception">
                  异常数:<span class="c-mc-lite-1786175495130-b0c63b2b-text-red">5</span>
                </div>
              </div>
            </div>

            <!-- 卡片2：南北接线设备 -->
            <div class="c-mc-lite-1786175495130-b0c63b2b-card-large c-mc-lite-1786175495130-b0c63b2b-card-gray">
              <div class="c-mc-lite-1786175495130-b0c63b2b-card-icon-wrapper">
                <div class="c-mc-lite-1786175495130-b0c63b2b-card-icon-bg-gray">
                  <div class="c-mc-lite-1786175495130-b0c63b2b-card-icon-shape-gray"></div>
                </div>
              </div>
              <div class="c-mc-lite-1786175495130-b0c63b2b-card-info">
                <div class="c-mc-lite-1786175495130-b0c63b2b-card-title-row">
                  <span class="c-mc-lite-1786175495130-b0c63b2b-card-label-gray">总 数:</span>
                  <span class="c-mc-lite-1786175495130-b0c63b2b-card-value-gray">1280</span>
                </div>
                <div class="c-mc-lite-1786175495130-b0c63b2b-card-subtitle-gray">南北接线<br>设备</div>
                <div class="c-mc-lite-1786175495130-b0c63b2b-card-exception-gray">
                  异常数:<span class="c-mc-lite-1786175495130-b0c63b2b-text-red">3</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 下部网格区 -->
          <div class="c-mc-lite-1786175495130-b0c63b2b-grid">
            <div 
              v-for="(device, index) in deviceList" 
              :key="index"
              class="c-mc-lite-1786175495130-b0c63b2b-grid-item"
            >
              <div class="c-mc-lite-1786175495130-b0c63b2b-grid-icon-area">
                <div class="c-mc-lite-1786175495130-b0c63b2b-grid-icon-base"></div>
                <div class="c-mc-lite-1786175495130-b0c63b2b-grid-icon-top"></div>
              </div>
              <div class="c-mc-lite-1786175495130-b0c63b2b-grid-text-area">
                <div class="c-mc-lite-1786175495130-b0c63b2b-grid-device-name">{{ device.name }}</div>
                <div class="c-mc-lite-1786175495130-b0c63b2b-grid-device-count">
                  <span :class="device.count > 0 ? 'c-mc-lite-1786175495130-b0c63b2b-text-red' : 'c-mc-lite-1786175495130-b0c63b2b-text-green'">
                    ({{ device.count }}/{{ device.total }})
                  </span>
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

const navItems = [
  { name: '监控' },
  { name: '照明', badge: 3 },
  { name: '通风' },
  { name: '供配电' },
  { name: '消防' },
  { name: '交通诱导' }
];

const deviceList = [
  { name: '摄像机', count: 2, total: 484 },
  { name: '风速风向仪', count: 1, total: 484 },
  { name: '超高检测器', count: 0, total: 484 },
  { name: '烟道机器人', count: 0, total: 484 },
  { name: '激光雷达', count: 0, total: 484 },
  { name: 'CO₂传感器', count: 0, total: 484 },
  { name: 'CO/VI检测器', count: 0, total: 484 },
  { name: '温湿度传感器', count: 0, total: 484 },
  { name: '压力传感器', count: 0, total: 484 },
  { name: '光照度变送器', count: 0, total: 484 },
  { name: '紧急电话', count: 0, total: 484 },
  { name: '水质监测设备', count: 0, total: 484 }
];
</script>

<style scoped>
.c-mc-lite-1786175495130-b0c63b2b-content {
  width: 100%;
  height: 100%;
  background-color: #eef2f6;
  display: flex;
  flex-direction: column;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #333;
  box-sizing: border-box;
  padding: 10px;
  overflow: hidden;
}

/* Header Styles */
.c-mc-lite-1786175495130-b0c63b2b-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 8%;
  min-height: 40px;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: bold;
  color: #1e3a8a;
}

.c-mc-lite-1786175495130-b0c63b2b-header-title {
  display: flex;
  align-items: center;
  font-size: 16px;
}

.c-mc-lite-1786175495130-b0c63b2b-icon-box {
  display: inline-block;
  width: 16px;
  height: 16px;
  background-color: #3b82f6;
  margin-right: 8px;
  border-radius: 2px;
}

.c-mc-lite-1786175495130-b0c63b2b-header-stats {
  display: flex;
  gap: 20px;
  font-size: 14px;
}

.c-mc-lite-1786175495130-b0c63b2b-stat-item {
  display: flex;
  align-items: center;
}

.c-mc-lite-1786175495130-b0c63b2b-icon-small {
  display: inline-block;
  width: 12px;
  height: 12px;
  background-color: #3b82f6;
  border-radius: 50%;
  margin-right: 5px;
  opacity: 0.5;
}

.c-mc-lite-1786175495130-b0c63b2b-text-blue {
  color: #3b82f6;
  font-size: 18px;
  font-weight: bold;
  margin-left: 4px;
}

.c-mc-lite-1786175495130-b0c63b2b-text-green {
  color: #10b981;
  font-size: 18px;
  font-weight: bold;
  margin-left: 4px;
}

.c-mc-lite-1786175495130-b0c63b2b-text-red {
  color: #ef4444;
  font-weight: bold;
}

/* Main Layout */
.c-mc-lite-1786175495130-b0c63b2b-main {
  display: flex;
  flex: 1;
  gap: 10px;
  height: 92%;
}

/* Sidebar Styles */
.c-mc-lite-1786175495130-b0c63b2b-sidebar {
  width: 60px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  position: relative;
}

.c-mc-lite-1786175495130-b0c63b2b-sidebar-badge-top {
  position: absolute;
  top: -20px;
  left: 0;
  background: #fff;
  border: 1px solid #ccc;
  font-size: 10px;
  padding: 2px 4px;
  color: #666;
  z-index: 10;
}

.c-mc-lite-1786175495130-b0c63b2b-nav-item {
  background-color: #dce6f2;
  color: #555;
  text-align: center;
  padding: 10px 0;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  position: relative;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #cbd5e1;
}

.c-mc-lite-1786175495130-b0c63b2b-nav-active {
  background-color: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
  font-weight: bold;
}

.c-mc-lite-1786175495130-b0c63b2b-nav-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background-color: #ef4444;
  color: white;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 10px;
  writing-mode: horizontal-tb;
}

/* Right Content Area */
.c-mc-lite-1786175495130-b0c63b2b-right-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Top Cards */
.c-mc-lite-1786175495130-b0c63b2b-top-cards {
  display: flex;
  height: 25%;
  min-height: 100px;
  gap: 0; /* Cards are joined */
}

.c-mc-lite-1786175495130-b0c63b2b-card-large {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 10px 20px;
  position: relative;
}

/* Card 1 (Blue) */
.c-mc-lite-1786175495130-b0c63b2b-card-blue {
  background: linear-gradient(90deg, #60a5fa 0%, #3b82f6 100%);
  border-radius: 10px 0 0 10px;
  /* Creating the arrow shape effect roughly */
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
  margin-right: -20px;
  z-index: 1;
  color: #fff;
}

.c-mc-lite-1786175495130-b0c63b2b-card-blue .c-mc-lite-1786175495130-b0c63b2b-card-label {
  color: #fff;
}
.c-mc-lite-1786175495130-b0c63b2b-card-blue .c-mc-lite-1786175495130-b0c63b2b-card-value {
  color: #fff;
  font-size: 24px;
  font-weight: bold;
}
.c-mc-lite-1786175495130-b0c63b2b-card-blue .c-mc-lite-1786175495130-b0c63b2b-card-subtitle {
  color: #fff;
  font-size: 12px;
  margin-top: 5px;
}
.c-mc-lite-1786175495130-b0c63b2b-card-blue .c-mc-lite-1786175495130-b0c63b2b-card-exception {
  color: #fff;
  font-size: 12px;
  margin-top: 5px;
}

/* Card 2 (Gray) */
.c-mc-lite-1786175495130-b0c63b2b-card-gray {
  background-color: #dce6f2;
  border-radius: 0 10px 10px 0;
  clip-path: polygon(5% 0, 100% 0, 100% 100%, 5% 100%, 0 50%);
  margin-left: 10px;
  color: #333;
}

.c-mc-lite-1786175495130-b0c63b2b-card-icon-wrapper {
  margin-right: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.c-mc-lite-1786175495130-b0c63b2b-card-icon-bg {
  width: 40px;
  height: 40px;
  background-color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.c-mc-lite-1786175495130-b0c63b2b-card-icon-shape {
  width: 20px;
  height: 20px;
  background-color: #3b82f6;
  border-radius: 50%;
  border: 2px solid #fff;
}

.c-mc-lite-1786175495130-b0c63b2b-card-icon-bg-gray {
  width: 40px;
  height: 40px;
  background-color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.c-mc-lite-1786175495130-b0c63b2b-card-icon-shape-gray {
  width: 20px;
  height: 10px;
  background-color: #3b82f6;
  border-radius: 10px 10px 0 0;
}

.c-mc-lite-1786175495130-b0c63b2b-card-info {
  display: flex;
  flex-direction: column;
}

.c-mc-lite-1786175495130-b0c63b2b-card-title-row {
  font-size: 14px;
  margin-bottom: 5px;
}

.c-mc-lite-1786175495130-b0c63b2b-card-label {
  color: #fff;
  font-size: 12px;
}

.c-mc-lite-1786175495130-b0c63b2b-card-value {
  color: #000;
  font-size: 20px;
  font-weight: bold;
  margin-left: 5px;
}

.c-mc-lite-1786175495130-b0c63b2b-card-label-gray {
  color: #666;
  font-size: 12px;
}

.c-mc-lite-1786175495130-b0c63b2b-card-value-gray {
  color: #3b82f6;
  font-size: 20px;
  font-weight: bold;
  margin-left: 5px;
}

.c-mc-lite-1786175495130-b0c63b2b-card-subtitle {
  color: #fff;
  font-size: 12px;
  font-weight: bold;
}

.c-mc-lite-1786175495130-b0c63b2b-card-subtitle-gray {
  color: #666;
  font-size: 12px;
  font-weight: bold;
  line-height: 1.2;
}

.c-mc-lite-1786175495130-b0c63b2b-card-exception {
  color: #fff;
  font-size: 12px;
  margin-top: 5px;
}

.c-mc-lite-1786175495130-b0c63b2b-card-exception-gray {
  color: #666;
  font-size: 12px;
  margin-top: 5px;
}

/* Grid Area */
.c-mc-lite-1786175495130-b0c63b2b-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 10px;
  padding: 10px;
  background-color: transparent;
}

.c-mc-lite-1786175495130-b0c63b2b-grid-item {
  background-color: #dce6f2;
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 10px 15px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.c-mc-lite-1786175495130-b0c63b2b-grid-icon-area {
  position: relative;
  width: 30px;
  height: 30px;
  margin-right: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.c-mc-lite-1786175495130-b0c63b2b-grid-icon-base {
  width: 24px;
  height: 8px;
  background-color: #3b82f6;
  border-radius: 50%;
  position: absolute;
  bottom: 0;
  opacity: 0.8;
}

.c-mc-lite-1786175495130-b0c63b2b-grid-icon-top {
  width: 16px;
  height: 16px;
  background-color: #3b82f6;
  border-radius: 50% 50% 0 0;
  position: absolute;
  bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* Simulating different icons with simple shapes */
.c-mc-lite-1786175495130-b0c63b2b-grid-item:nth-child(2) .c-mc-lite-1786175495130-b0c63b2b-grid-icon-top { border-radius: 50%; background: transparent; border: 2px solid #3b82f6; }
.c-mc-lite-1786175495130-b0c63b2b-grid-item:nth-child(3) .c-mc-lite-1786175495130-b0c63b2b-grid-icon-top { border-radius: 4px; }
.c-mc-lite-1786175495130-b0c63b2b-grid-item:nth-child(11) .c-mc-lite-1786175495130-b0c63b2b-grid-icon-top { border-radius: 2px; height: 12px; width: 12px; background: #3b82f6; }


.c-mc-lite-1786175495130-b0c63b2b-grid-text-area {
  display: flex;
  flex-direction: column;
}

.c-mc-lite-1786175495130-b0c63b2b-grid-device-name {
  font-size: 13px;
  color: #333;
  margin-bottom: 4px;
}

.c-mc-lite-1786175495130-b0c63b2b-grid-device-count {
  font-size: 14px;
  font-weight: bold;
}

</style>