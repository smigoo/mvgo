<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1788256185993-bed4fd47-content">
      <!-- 左侧导航栏 -->
      <div class="c-mc-lite-1788256185993-bed4fd47-sidebar">
        <div 
          v-for="(tab, index) in tabs" 
          :key="index"
          class="c-mc-lite-1788256185993-bed4fd47-tab"
          :class="{ 'c-mc-lite-1788256185993-bed4fd47-tab-active': activeTab === index }"
          @click="activeTab = index"
        >
          <span class="c-mc-lite-1788256185993-bed4fd47-tab-text">{{ tab.name }}</span>
          <span v-if="tab.badge" class="c-mc-lite-1788256185993-bed4fd47-badge">{{ tab.badge }}</span>
        </div>
      </div>

      <!-- 右侧主内容区 -->
      <div class="c-mc-lite-1788256185993-bed4fd47-main">
        <!-- 顶部统计栏 -->
        <div class="c-mc-lite-1788256185993-bed4fd47-stats-bar">
          <div class="c-mc-lite-1788256185993-bed4fd47-stats-title">设备监测</div>
          <div class="c-mc-lite-1788256185993-bed4fd47-stats-items">
            <div class="c-mc-lite-1788256185993-bed4fd47-stat-item">
              <span class="c-mc-lite-1788256185993-bed4fd47-stat-label">设备类型</span>
              <span class="c-mc-lite-1788256185993-bed4fd47-stat-value">28</span>
            </div>
            <div class="c-mc-lite-1788256185993-bed4fd47-stat-item">
              <span class="c-mc-lite-1788256185993-bed4fd47-stat-label">设备总数</span>
              <span class="c-mc-lite-1788256185993-bed4fd47-stat-value">68562</span>
            </div>
            <div class="c-mc-lite-1788256185993-bed4fd47-stat-item">
              <span class="c-mc-lite-1788256185993-bed4fd47-stat-label">完好率</span>
              <span class="c-mc-lite-1788256185993-bed4fd47-stat-value c-mc-lite-1788256185993-bed4fd47-stat-success">98%</span>
            </div>
          </div>
        </div>

        <!-- 两个大卡片 -->
        <div class="c-mc-lite-1788256185993-bed4fd47-cards-row">
          <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card c-mc-lite-1788256185993-bed4fd47-arrow-card-primary">
            <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-icon">
              <div class="c-mc-lite-1788256185993-bed4fd47-icon-bell"></div>
            </div>
            <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-content">
              <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-title">隧道设备</div>
              <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-stats">
                <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-stat">
                  <span class="c-mc-lite-1788256185993-bed4fd47-arrow-label">总数:</span>
                  <span class="c-mc-lite-1788256185993-bed4fd47-arrow-value">56302</span>
                </div>
                <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-stat">
                  <span class="c-mc-lite-1788256185993-bed4fd47-arrow-label">异常数:</span>
                  <span class="c-mc-lite-1788256185993-bed4fd47-arrow-value c-mc-lite-1788256185993-bed4fd47-arrow-error">5</span>
                </div>
              </div>
            </div>
          </div>

          <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card c-mc-lite-1788256185993-bed4fd47-arrow-card-light">
            <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-icon">
              <div class="c-mc-lite-1788256185993-bed4fd47-icon-chip"></div>
            </div>
            <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-content">
              <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-title c-mc-lite-1788256185993-bed4fd47-arrow-card-title-dark">南北接续<br>设备</div>
              <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-stats">
                <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-stat">
                  <span class="c-mc-lite-1788256185993-bed4fd47-arrow-label c-mc-lite-1788256185993-bed4fd47-arrow-label-dark">总数:</span>
                  <span class="c-mc-lite-1788256185993-bed4fd47-arrow-value">1280</span>
                </div>
                <div class="c-mc-lite-1788256185993-bed4fd47-arrow-card-stat">
                  <span class="c-mc-lite-1788256185993-bed4fd47-arrow-label c-mc-lite-1788256185993-bed4fd47-arrow-label-dark">异常数:</span>
                  <span class="c-mc-lite-1788256185993-bed4fd47-arrow-value c-mc-lite-1788256185993-bed4fd47-arrow-error">3</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 设备网格 -->
        <div class="c-mc-lite-1788256185993-bed4fd47-grid">
          <div 
            v-for="(device, index) in devices" 
            :key="index"
            class="c-mc-lite-1788256185993-bed4fd47-device-card"
          >
            <div class="c-mc-lite-1788256185993-bed4fd47-device-icon">
              <div :class="`c-mc-lite-1788256185993-bed4fd47-icon-${device.icon}`"></div>
            </div>
            <div class="c-mc-lite-1788256185993-bed4fd47-device-info">
              <div class="c-mc-lite-1788256185993-bed4fd47-device-name">{{ device.name }}</div>
              <div class="c-mc-lite-1788256185993-bed4fd47-device-stats">
                <span :class="['c-mc-lite-1788256185993-bed4fd47-device-abnormal', device.abnormal > 0 ? 'c-mc-lite-1788256185993-bed4fd47-has-error' : '']">{{ device.abnormal }}</span>
                <span class="c-mc-lite-1788256185993-bed4fd47-device-separator">/</span>
                <span class="c-mc-lite-1788256185993-bed4fd47-device-total">{{ device.total }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

const activeTab = ref(0)

const tabs = ref([
  { name: '监控', badge: 3 },
  { name: '照明' },
  { name: '通风' },
  { name: '供配电' },
  { name: '消防' },
  { name: '交通诱导' }
])

const devices = ref([
  { name: '摄像机', abnormal: 2, total: 484, icon: 'camera' },
  { name: '风速风向仪', abnormal: 1, total: 484, icon: 'wind' },
  { name: '超高检测器', abnormal: 0, total: 484, icon: 'height' },
  { name: '烟道机器人', abnormal: 0, total: 484, icon: 'robot' },
  { name: '激光雷达', abnormal: 0, total: 484, icon: 'radar' },
  { name: 'CO₂传感器', abnormal: 0, total: 484, icon: 'co2' },
  { name: 'CO/VI检测器', abnormal: 0, total: 484, icon: 'co' },
  { name: '温湿度传感器', abnormal: 0, total: 484, icon: 'temp' },
  { name: '压力传感器', abnormal: 0, total: 484, icon: 'pressure' },
  { name: '光照度变送器', abnormal: 0, total: 484, icon: 'light' },
  { name: '紧急电话', abnormal: 0, total: 484, icon: 'phone' },
  { name: '水质监测设备', abnormal: 0, total: 484, icon: 'water' }
])
</script>

<style scoped>
.c-mc-lite-1788256185993-bed4fd47-content {
  width: 100%;
  height: 100%;
  display: flex;
  background: linear-gradient(to bottom, #E8F4FB 0%, #F0F7FC 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* 左侧导航栏 */
.c-mc-lite-1788256185993-bed4fd47-sidebar {
  width: 8%;
  background: rgba(255, 255, 255, 0.4);
  padding: 1.4% 0;
  display: flex;
  flex-direction: column;
  gap: 2.8%;
}

.c-mc-lite-1788256185993-bed4fd47-tab {
  position: relative;
  padding: 4% 0;
  margin: 0 8%;
  background: rgba(33, 150, 243, 0.15);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-mc-lite-1788256185993-bed4fd47-tab-active {
  background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
}

.c-mc-lite-1788256185993-bed4fd47-tab-text {
  font-size: 1.8vh;
  color: #2196F3;
  font-weight: 400;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 0.15em;
}

.c-mc-lite-1788256185993-bed4fd47-tab-active .c-mc-lite-1788256185993-bed4fd47-tab-text {
  color: #FFFFFF;
}

.c-mc-lite-1788256185993-bed4fd47-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: linear-gradient(135deg, #FF4444 0%, #CC0000 100%);
  color: #FFFFFF;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4vh;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(255, 68, 68, 0.4);
}

/* 右侧主内容区 */
.c-mc-lite-1788256185993-bed4fd47-main {
  flex: 1;
  padding: 2% 3%;
  display: flex;
  flex-direction: column;
  gap: 2%;
}

/* 顶部统计栏 */
.c-mc-lite-1788256185993-bed4fd47-stats-bar {
  background: linear-gradient(90deg, #2196F3 0%, #64B5F6 50%, #90CAF9 100%);
  border-radius: 8px;
  padding: 2% 3%;
  display: flex;
  align-items: center;
  gap: 4%;
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.25);
}

.c-mc-lite-1788256185993-bed4fd47-stats-title {
  font-size: 2.6vh;
  color: #FFFFFF;
  font-weight: 500;
}

.c-mc-lite-1788256185993-bed4fd47-stats-items {
  display: flex;
  gap: 5%;
  flex: 1;
}

.c-mc-lite-1788256185993-bed4fd47-stat-item {
  display: flex;
  align-items: baseline;
  gap: 1%;
}

.c-mc-lite-1788256185993-bed4fd47-stat-label {
  font-size: 1.8vh;
  color: rgba(255, 255, 255, 0.9);
}

.c-mc-lite-1788256185993-bed4fd47-stat-value {
  font-size: 3.2vh;
  color: #FFFFFF;
  font-weight: 700;
}

.c-mc-lite-1788256185993-bed4fd47-stat-success {
  color: #4CAF50;
}

/* 大卡片行 */
.c-mc-lite-1788256185993-bed4fd47-cards-row {
  display: flex;
  gap: 2.5%;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card {
  flex: 1;
  position: relative;
  border-radius: 12px;
  padding: 3% 4%;
  display: flex;
  align-items: center;
  gap: 3%;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: transform 0.3s;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card:hover {
  transform: translateY(-2px);
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card::after {
  content: '';
  position: absolute;
  right: -10%;
  top: 0;
  width: 30%;
  height: 100%;
  background: inherit;
  transform: skewX(-15deg);
  filter: brightness(1.1);
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card-primary {
  background: linear-gradient(135deg, #2196F3 0%, #1565C0 100%);
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card-light {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(189, 231, 252, 0.6) 100%);
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card-icon {
  width: 15%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

.c-mc-lite-1788256185993-bed4fd47-icon-bell,
.c-mc-lite-1788256185993-bed4fd47-icon-chip {
  width: 60%;
  height: 60%;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card-content {
  flex: 1;
  position: relative;
  z-index: 1;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card-title {
  font-size: 2.4vh;
  color: #FFFFFF;
  font-weight: 500;
  margin-bottom: 1.5%;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card-title-dark {
  color: #333333;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card-stats {
  display: flex;
  gap: 4%;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card-stat {
  display: flex;
  align-items: baseline;
  gap: 1%;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-label {
  font-size: 1.8vh;
  color: rgba(255, 255, 255, 0.9);
}

.c-mc-lite-1788256185993-bed4fd47-arrow-label-dark {
  color: #666666;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-value {
  font-size: 3.2vh;
  color: #FFFFFF;
  font-weight: 700;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-card-light .c-mc-lite-1788256185993-bed4fd47-arrow-value {
  color: #2196F3;
}

.c-mc-lite-1788256185993-bed4fd47-arrow-error {
  color: #FF4444 !important;
}

/* 设备网格 */
.c-mc-lite-1788256185993-bed4fd47-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2.5%;
  flex: 1;
}

.c-mc-lite-1788256185993-bed4fd47-device-card {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(33, 150, 243, 0.15);
  border-radius: 12px;
  padding: 4% 5%;
  display: flex;
  align-items: center;
  gap: 4%;
  cursor: pointer;
  transition: all 0.3s;
}

.c-mc-lite-1788256185993-bed4fd47-device-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(33, 150, 243, 0.15);
}

.c-mc-lite-1788256185993-bed4fd47-device-icon {
  width: 20%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.c-mc-lite-1788256185993-bed4fd47-device-icon::after {
  content: '';
  position: absolute;
  bottom: -8%;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  height: 20%;
  background: radial-gradient(ellipse, rgba(33, 150, 243, 0.2) 0%, transparent 70%);
  filter: blur(4px);
}

.c-mc-lite-1788256185993-bed4fd47-device-icon > div {
  width: 50%;
  height: 50%;
  background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
  border-radius: 50%;
}

.c-mc-lite-1788256185993-bed4fd47-device-info {
  flex: 1;
}

.c-mc-lite-1788256185993-bed4fd47-device-name {
  font-size: 2vh;
  color: #333333;
  font-weight: 400;
  margin-bottom: 1.5%;
}

.c-mc-lite-1788256185993-bed4fd47-device-stats {
  font-size: 2.6vh;
  display: flex;
  align-items: center;
  gap: 1%;
}

.c-mc-lite-1788256185993-bed4fd47-device-abnormal {
  color: #00B0FF;
  font-weight: 700;
}

.c-mc-lite-1788256185993-bed4fd47-has-error {
  color: #FF4444;
}

.c-mc-lite-1788256185993-bed4fd47-device-separator {
  color: #CCCCCC;
}

.c-mc-lite-1788256185993-bed4fd47-device-total {
  color: #00B0FF;
  font-weight: 700;
}
</style>