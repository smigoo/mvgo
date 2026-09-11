<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1786519330809-425be5f2-content">
      <!-- 顶部统计栏 -->
      <div class="c-mc-lite-1786519330809-425be5f2-header">
        <div class="c-mc-lite-1786519330809-425be5f2-title-group">
          <span class="c-mc-lite-1786519330809-425be5f2-main-title">设备监测</span>
          <div class="c-mc-lite-1786519330809-425be5f2-stats">
            <div class="c-mc-lite-1786519330809-425be5f2-stat-item">
              <span class="c-mc-lite-1786519330809-425be5f2-icon-eq">=</span>
              <span class="c-mc-lite-1786519330809-425be5f2-label">设备类型</span>
              <span class="c-mc-lite-1786519330809-425be5f2-value blue">28</span>
            </div>
            <div class="c-mc-lite-1786519330809-425be5f2-stat-item">
              <span class="c-mc-lite-1786519330809-425be5f2-label">设备总数</span>
              <span class="c-mc-lite-1786519330809-425be5f2-value blue">68562</span>
            </div>
            <div class="c-mc-lite-1786519330809-425be5f2-stat-item">
              <span class="c-mc-lite-1786519330809-425be5f2-label">完好率</span>
              <span class="c-mc-lite-1786519330809-425be5f2-value green">98%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主体区域 -->
      <div class="c-mc-lite-1786519330809-425be5f2-body">
        <!-- 左侧导航 -->
        <div class="c-mc-lite-1786519330809-425be5f2-sidebar">
          <div class="c-mc-lite-1786519330809-425be5f2-badge-top">3/3740</div>
          <div 
            v-for="(item, index) in navItems" 
            :key="index"
            class="c-mc-lite-1786519330809-425be5f2-nav-item"
            :class="{ 'c-mc-lite-1786519330809-425be5f2-active': activeNav === item }"
            @click="activeNav = item"
          >
            {{ item }}
            <span v-if="item === '照明'" class="c-mc-lite-1786519330809-425be5f2-red-badge">3</span>
          </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="c-mc-lite-1786519330809-425be5f2-main-content">
          <!-- 大型数据卡片 -->
          <div class="c-mc-lite-1786519330809-425be5f2-cards-row">
            <!-- 隧道设备卡片 -->
            <div class="c-mc-lite-1786519330809-425be5f2-card c-mc-lite-1786519330809-425be5f2-card-blue">
              <div class="c-mc-lite-1786519330809-425be5f2-card-icon-wrap">
                <div class="c-mc-lite-1786519330809-425be5f2-icon-circle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>
                </div>
              </div>
              <div class="c-mc-lite-1786519330809-425be5f2-card-info">
                <div class="c-mc-lite-1786519330809-425be5f2-card-row">
                  <span class="c-mc-lite-1786519330809-425be5f2-card-label">总 数:</span>
                  <span class="c-mc-lite-1786519330809-425be5f2-card-value white">56302</span>
                </div>
                <div class="c-mc-lite-1786519330809-425be5f2-card-row">
                  <span class="c-mc-lite-1786519330809-425be5f2-card-subtitle">隧道设备</span>
                  <span class="c-mc-lite-1786519330809-425be5f2-card-label">异常数:</span>
                  <span class="c-mc-lite-1786519330809-425be5f2-card-value red">5</span>
                </div>
              </div>
            </div>

            <!-- 南北接线设备卡片 -->
            <div class="c-mc-lite-1786519330809-425be5f2-card c-mc-lite-1786519330809-425be5f2-card-gray">
              <div class="c-mc-lite-1786519330809-425be5f2-card-icon-wrap">
                <div class="c-mc-lite-1786519330809-425be5f2-icon-circle gray-bg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#1890FF" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4m-2-2v4"/></svg>
                </div>
              </div>
              <div class="c-mc-lite-1786519330809-425be5f2-card-info">
                <div class="c-mc-lite-1786519330809-425be5f2-card-row">
                  <span class="c-mc-lite-1786519330809-425be5f2-card-label">总 数:</span>
                  <span class="c-mc-lite-1786519330809-425be5f2-card-value blue">1280</span>
                </div>
                <div class="c-mc-lite-1786519330809-425be5f2-card-row">
                  <span class="c-mc-lite-1786519330809-425be5f2-card-subtitle dark">南北接线设备</span>
                  <span class="c-mc-lite-1786519330809-425be5f2-card-label">异常数:</span>
                  <span class="c-mc-lite-1786519330809-425be5f2-card-value red">3</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 设备网格区 -->
          <div class="c-mc-lite-1786519330809-425be5f2-grid">
            <div 
              v-for="(device, index) in devices" 
              :key="index"
              class="c-mc-lite-1786519330809-425be5f2-grid-item"
            >
              <div class="c-mc-lite-1786519330809-425be5f2-device-icon">
                <div class="c-mc-lite-1786519330809-425be5f2-base"></div>
                <div class="c-mc-lite-1786519330809-425be5f2-device-symbol">
                   <!-- 简单模拟图标 -->
                   <span v-if="device.name.includes('摄像')" class="c-mc-lite-1786519330809-425be5f2-emoji"></span>
                   <span v-else-if="device.name.includes('风')" class="c-mc-lite-1786519330809-425be5f2-emoji">💨</span>
                   <span v-else-if="device.name.includes('超高')" class="c-mc-lite-1786519330809-425be5f2-emoji">🚛</span>
                   <span v-else-if="device.name.includes('机器人')" class="c-mc-lite-1786519330809-425be5f2-emoji"></span>
                   <span v-else-if="device.name.includes('雷达')" class="c-mc-lite-1786519330809-425be5f2-emoji">📡</span>
                   <span v-else-if="device.name.includes('CO2')" class="c-mc-lite-1786519330809-425be5f2-emoji">🌫️</span>
                   <span v-else-if="device.name.includes('CO/VI')" class="c-mc-lite-1786519330809-425be5f2-emoji">☁️</span>
                   <span v-else-if="device.name.includes('温湿度')" class="c-mc-lite-1786519330809-425be5f2-emoji">🌡️</span>
                   <span v-else-if="device.name.includes('压力')" class="c-mc-lite-1786519330809-425be5f2-emoji">⏲️</span>
                   <span v-else-if="device.name.includes('光照')" class="c-mc-lite-1786519330809-425be5f2-emoji">☀️</span>
                   <span v-else-if="device.name.includes('电话')" class="c-mc-lite-1786519330809-425be5f2-emoji"></span>
                   <span v-else class="c-mc-lite-1786519330809-425be5f2-emoji">💧</span>
                </div>
              </div>
              <div class="c-mc-lite-1786519330809-425be5f2-device-info">
                <div class="c-mc-lite-1786519330809-425be5f2-device-name">{{ device.name }}</div>
                <div class="c-mc-lite-1786519330809-425be5f2-device-status">
                  <span :class="device.abnormal > 0 ? 'c-mc-lite-1786519330809-425be5f2-text-red' : 'c-mc-lite-1786519330809-425be5f2-text-blue'">({{ device.abnormal }}</span>
                  <span class="c-mc-lite-1786519330809-425be5f2-text-blue">/{{ device.total }})</span>
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
.c-mc-lite-1786519330809-425be5f2-content {
  width: 100%;
  height: 100%;
  background-color: #E4E9ED;
  display: flex;
  flex-direction: column;
  padding: 1%;
  box-sizing: border-box;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #333;
}

/* Header */
.c-mc-lite-1786519330809-425be5f2-header {
  height: 10%;
  display: flex;
  align-items: center;
  margin-bottom: 1%;
}

.c-mc-lite-1786519330809-425be5f2-title-group {
  display: flex;
  align-items: center;
  width: 100%;
}

.c-mc-lite-1786519330809-425be5f2-main-title {
  font-size: 1.5rem;
  font-weight: bold;
  color: #5B9BD5;
  margin-right: 2rem;
}

.c-mc-lite-1786519330809-425be5f2-stats {
  display: flex;
  gap: 1.5rem;
  align-items: center;
  font-size: 1.1rem;
}

.c-mc-lite-1786519330809-425be5f2-stat-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.c-mc-lite-1786519330809-425be5f2-icon-eq {
  color: #5B9BD5;
  font-weight: bold;
  font-size: 1.2rem;
  margin-right: 0.2rem;
}

.c-mc-lite-1786519330809-425be5f2-label {
  color: #555;
}

.c-mc-lite-1786519330809-425be5f2-value {
  font-weight: bold;
  font-size: 1.4rem;
}

.c-mc-lite-1786519330809-425be5f2-value.blue { color: #1890FF; }
.c-mc-lite-1786519330809-425be5f2-value.green { color: #00BFA5; }

/* Body Layout */
.c-mc-lite-1786519330809-425be5f2-body {
  display: flex;
  flex: 1;
  gap: 1%;
  height: 90%;
}

/* Sidebar */
.c-mc-lite-1786519330809-425be5f2-sidebar {
  width: 8%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: relative;
}

.c-mc-lite-1786519330809-425be5f2-badge-top {
  position: absolute;
  top: -10px;
  left: 0;
  background: #fff;
  border: 1px solid #ccc;
  padding: 2px 5px;
  font-size: 0.8rem;
  border-radius: 4px;
  z-index: 10;
  color: #333;
}

.c-mc-lite-1786519330809-425be5f2-nav-item {
  background: #F0F4F8;
  border: 1px solid #D0D8E0;
  border-radius: 8px;
  padding: 1rem 0.5rem;
  text-align: center;
  cursor: pointer;
  font-size: 1.1rem;
  color: #5B9BD5;
  position: relative;
  transition: all 0.3s;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  height: 60px; /* Fixed height for vertical text alignment */
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-mc-lite-1786519330809-425be5f2-nav-item.c-mc-lite-1786519330809-425be5f2-active {
  background: #1890FF;
  color: #fff;
  border-color: #1890FF;
  font-weight: bold;
}

.c-mc-lite-1786519330809-425be5f2-red-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #FF4D4F;
  color: #fff;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: horizontal-tb;
}

/* Main Content */
.c-mc-lite-1786519330809-425be5f2-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1%;
}

/* Cards Row */
.c-mc-lite-1786519330809-425be5f2-cards-row {
  display: flex;
  gap: 2%;
  height: 20%;
}

.c-mc-lite-1786519330809-425be5f2-card {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 1rem 2rem;
  position: relative;
  border-radius: 8px;
  /* Arrow shape simulation */
  clip-path: polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%);
}

.c-mc-lite-1786519330809-425be5f2-card-blue {
  background: linear-gradient(90deg, #409EFF 0%, #66B1FF 100%);
  color: #fff;
}

.c-mc-lite-1786519330809-425be5f2-card-gray {
  background: linear-gradient(90deg, #DCE6F0 0%, #E8F0F8 100%);
  color: #333;
}

.c-mc-lite-1786519330809-425be5f2-card-icon-wrap {
  margin-right: 1.5rem;
}

.c-mc-lite-1786519330809-425be5f2-icon-circle {
  width: 50px;
  height: 50px;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255,255,255,0.5);
}

.c-mc-lite-1786519330809-425be5f2-icon-circle.gray-bg {
  background: #fff;
  border-color: #D0D8E0;
}

.c-mc-lite-1786519330809-425be5f2-icon-circle svg {
  width: 30px;
  height: 30px;
  color: #fff;
}

.c-mc-lite-1786519330809-425be5f2-card-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.c-mc-lite-1786519330809-425be5f2-card-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.c-mc-lite-1786519330809-425be5f2-card-label {
  font-size: 1.2rem;
  opacity: 0.9;
}

.c-mc-lite-1786519330809-425be5f2-card-value {
  font-size: 1.8rem;
  font-weight: bold;
}

.c-mc-lite-1786519330809-425be5f2-card-value.white { color: #fff; }
.c-mc-lite-1786519330809-425be5f2-card-value.blue { color: #1890FF; }
.c-mc-lite-1786519330809-425be5f2-card-value.red { color: #FF4D4F; }

.c-mc-lite-1786519330809-425be5f2-card-subtitle {
  font-size: 1rem;
  opacity: 0.8;
  margin-right: 1rem;
}
.c-mc-lite-1786519330809-425be5f2-card-subtitle.dark {
  color: #333;
  font-weight: bold;
  font-style: italic;
}

/* Grid */
.c-mc-lite-1786519330809-425be5f2-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 1%;
}

.c-mc-lite-1786519330809-425be5f2-grid-item {
  background: #D6E4F0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 1rem;
  gap: 1rem;
  border: 1px solid #C0D0E0;
}

.c-mc-lite-1786519330809-425be5f2-device-icon {
  position: relative;
  width: 50px;
  height: 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.c-mc-lite-1786519330809-425be5f2-base {
  width: 40px;
  height: 10px;
  background: linear-gradient(to bottom, #fff, #A0C4E8);
  border-radius: 50%;
  position: absolute;
  bottom: 5px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.c-mc-lite-1786519330809-425be5f2-device-symbol {
  position: absolute;
  bottom: 15px;
  font-size: 1.5rem;
  z-index: 2;
}

.c-mc-lite-1786519330809-425be5f2-emoji {
  filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));
}

.c-mc-lite-1786519330809-425be5f2-device-info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.c-mc-lite-1786519330809-425be5f2-device-name {
  font-size: 1.1rem;
  color: #333;
}

.c-mc-lite-1786519330809-425be5f2-device-status {
  font-size: 1.2rem;
  font-weight: bold;
}

.c-mc-lite-1786519330809-425be5f2-text-red { color: #FF4D4F; }
.c-mc-lite-1786519330809-425be5f2-text-blue { color: #1890FF; }

</style>