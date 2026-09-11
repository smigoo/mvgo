<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitor-content">
      <!-- 顶部统计栏 -->
      <div class="c-equipment-monitor-header">
        <div class="c-equipment-monitor-title">设备监测</div>
        <div class="c-equipment-monitor-stats">
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-icon">≡</span>
            <span class="c-equipment-monitor-stat-label">设备类型</span>
            <span class="c-equipment-monitor-stat-value">28</span>
          </div>
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">设备总数</span>
            <span class="c-equipment-monitor-stat-value">68562</span>
          </div>
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">完好率</span>
            <span class="c-equipment-monitor-stat-value c-equipment-monitor-stat-success">98%</span>
          </div>
        </div>
        
        <!-- 两个大卡片 -->
        <div class="c-equipment-monitor-summary-cards">
          <div class="c-equipment-monitor-summary-card c-equipment-monitor-summary-card-primary">
            <div class="c-equipment-monitor-summary-icon">
              <div class="c-equipment-monitor-icon-circle">
                <span class="c-equipment-monitor-icon-bell">🔔</span>
              </div>
            </div>
            <div class="c-equipment-monitor-summary-content">
              <div class="c-equipment-monitor-summary-total">
                <span class="c-equipment-monitor-summary-label">总</span>
                <span class="c-equipment-monitor-summary-label">数:</span>
                <span class="c-equipment-monitor-summary-number">56302</span>
              </div>
              <div class="c-equipment-monitor-summary-info">
                <span class="c-equipment-monitor-summary-name">隧道设备</span>
                <span class="c-equipment-monitor-summary-error">异常数:<span class="c-equipment-monitor-error-value">5</span></span>
              </div>
            </div>
          </div>
          
          <div class="c-equipment-monitor-summary-card c-equipment-monitor-summary-card-secondary">
            <div class="c-equipment-monitor-summary-icon">
              <div class="c-equipment-monitor-icon-circle">
                <span class="c-equipment-monitor-icon-device">🔷</span>
              </div>
            </div>
            <div class="c-equipment-monitor-summary-content">
              <div class="c-equipment-monitor-summary-total">
                <span class="c-equipment-monitor-summary-label">总</span>
                <span class="c-equipment-monitor-summary-label">数:</span>
                <span class="c-equipment-monitor-summary-number">1280</span>
              </div>
              <div class="c-equipment-monitor-summary-info">
                <span class="c-equipment-monitor-summary-name">雨北掩线设备</span>
                <span class="c-equipment-monitor-summary-error">异常数:<span class="c-equipment-monitor-error-value">3</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 主内容区：左侧导航 + 设备卡片网格 -->
      <div class="c-equipment-monitor-main">
        <!-- 左侧导航栏 -->
        <div class="c-equipment-monitor-sidebar">
          <div class="c-equipment-monitor-counter">3/3740</div>
          <div 
            v-for="(tab, index) in tabs" 
            :key="index"
            class="c-equipment-monitor-tab"
            :class="{ 'c-equipment-monitor-tab-active': activeTab === index }"
            @click="activeTab = index"
          >
            <span class="c-equipment-monitor-tab-text">{{ tab.name }}</span>
            <span v-if="tab.badge" class="c-equipment-monitor-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>
        
        <!-- 设备卡片网格 -->
        <div class="c-equipment-monitor-grid">
          <div 
            v-for="(device, index) in devices" 
            :key="index"
            class="c-equipment-monitor-card"
            @click="handleDeviceClick(device)"
          >
            <div class="c-equipment-monitor-device-icon">
              <div class="c-equipment-monitor-icon-base">
                <span class="c-equipment-monitor-icon-symbol">{{ device.icon }}</span>
              </div>
            </div>
            <div class="c-equipment-monitor-device-name">{{ device.name }}</div>
            <div class="c-equipment-monitor-device-stats">
              <span class="c-equipment-monitor-device-error">{{ device.error }}</span>
              <span class="c-equipment-monitor-device-separator">/</span>
              <span class="c-equipment-monitor-device-total">{{ device.total }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

const activeTab = ref(1)

const tabs = ref([
  { name: '监控' },
  { name: '照明', badge: 3 },
  { name: '通风' },
  { name: '供配电' },
  { name: '消防' },
  { name: '交通诱导' }
])

const devices = ref([
  { name: '摄像机', icon: '📷', error: 2, total: 484 },
  { name: '风速风向仪', icon: '🌪️', error: 1, total: 484 },
  { name: '超高检测器', icon: '📡', error: 0, total: 484 },
  { name: '烟道机器人', icon: '🤖', error: 0, total: 484 },
  { name: '激光雷达', icon: '⚡', error: 0, total: 484 },
  { name: 'CO₂传感器', icon: '💨', error: 0, total: 484 },
  { name: 'CO/VI检测器', icon: '🔵', error: 0, total: 484 },
  { name: '温湿度传感器', icon: '🌡️', error: 0, total: 484 },
  { name: '压力传感器', icon: '⚙️', error: 0, total: 484 },
  { name: '光照度变送器', icon: '💡', error: 0, total: 484 },
  { name: '紧急电话', icon: '📞', error: 0, total: 484 },
  { name: '水质监测设备', icon: '💧', error: 0, total: 484 }
])

const handleDeviceClick = (device) => {
  console.log('Device clicked:', device.name)
}
</script>

<style scoped>
.c-equipment-monitor-content {
  width: 100%;
  height: 100%;
  background: #A8B2BC;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 顶部统计栏 */
.c-equipment-monitor-header {
  padding: 20px 20px 0 20px;
  flex-shrink: 0;
}

.c-equipment-monitor-title {
  font-size: 32px;
  font-weight: 500;
  color: #38BDF8;
  margin-bottom: 12px;
}

.c-equipment-monitor-stats {
  display: flex;
  gap: 30px;
  align-items: center;
  margin-bottom: 16px;
}

.c-equipment-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: #1F2937;
}

.c-equipment-monitor-stat-icon {
  font-size: 20px;
  color: #38BDF8;
}

.c-equipment-monitor-stat-label {
  font-weight: 400;
}

.c-equipment-monitor-stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #38BDF8;
}

.c-equipment-monitor-stat-success {
  color: #06B6D4;
}

/* 大卡片 */
.c-equipment-monitor-summary-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.c-equipment-monitor-summary-card {
  flex: 1;
  background: linear-gradient(135deg, #38BDF8 0%, #60C5F0 100%);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
  overflow: hidden;
}

.c-equipment-monitor-summary-card::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 40px;
  background: linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.1) 50%);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 30% 100%);
}

.c-equipment-monitor-summary-card-secondary {
  background: linear-gradient(135deg, #BFD4E5 0%, #A8C5DC 100%);
}

.c-equipment-monitor-summary-icon {
  flex-shrink: 0;
}

.c-equipment-monitor-icon-circle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
}

.c-equipment-monitor-summary-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c-equipment-monitor-summary-total {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.c-equipment-monitor-summary-label {
  font-size: 16px;
  font-weight: 400;
  color: #FFFFFF;
}

.c-equipment-monitor-summary-number {
  font-size: 48px;
  font-weight: 700;
  color: #FFFFFF;
  line-height: 1;
}

.c-equipment-monitor-summary-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.c-equipment-monitor-summary-name {
  font-size: 16px;
  font-weight: 500;
  color: #1F2937;
}

.c-equipment-monitor-summary-error {
  font-size: 14px;
  font-weight: 400;
  color: #1F2937;
}

.c-equipment-monitor-error-value {
  font-size: 24px;
  font-weight: 700;
  color: #EF4444;
  margin-left: 4px;
}

/* 主内容区 */
.c-equipment-monitor-main {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 0 20px 20px 20px;
  min-height: 0;
  overflow: hidden;
}

/* 左侧导航栏 */
.c-equipment-monitor-sidebar {
  width: 90px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  min-height: 0;
}

.c-equipment-monitor-counter {
  background: #FFFFFF;
  border-radius: 8px;
  padding: 8px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: #EF4444;
  border: 1px solid #8CA3B8;
}

.c-equipment-monitor-tab {
  background: #BFD4E5;
  border-radius: 8px;
  padding: 16px 8px;
  text-align: center;
  font-size: 14px;
  font-weight: 400;
  color: #1F2937;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid #8CA3B8;
  position: relative;
  word-break: keep-all;
  white-space: nowrap;
}

.c-equipment-monitor-tab:hover {
  background: #D0E3F0;
  transform: translateX(2px);
}

.c-equipment-monitor-tab-active {
  background: #38BDF8;
  color: #FFFFFF;
  border-color: #38BDF8;
}

.c-equipment-monitor-tab-text {
  display: block;
}

.c-equipment-monitor-tab-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #EF4444;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 700;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 设备卡片网格 */
.c-equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 14px;
  overflow-y: auto;
  align-content: start;
  min-height: 0;
}

.c-equipment-monitor-card {
  background: #BFD4E5;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid #8CA3B8;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.c-equipment-monitor-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
  background: #D0E3F0;
}

.c-equipment-monitor-device-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-equipment-monitor-icon-base {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: radial-gradient(circle, #FFFFFF 0%, #E8F0F5 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
  position: relative;
}

.c-equipment-monitor-icon-base::after {
  content: '';
  position: absolute;
  bottom: -8px;
  width: 70px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.15) 0%, transparent 60%);
}

.c-equipment-monitor-icon-symbol {
  font-size: 32px;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1));
}

.c-equipment-monitor-device-name {
  font-size: 16px;
  font-weight: 500;
  color: #1F2937;
  text-align: center;
  line-height: 1.3;
  margin-top: 4px;
}

.c-equipment-monitor-device-stats {
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-equipment-monitor-device-error {
  color: #EF4444;
}

.c-equipment-monitor-device-separator {
  color: #1F2937;
  font-weight: 400;
}

.c-equipment-monitor-device-total {
  color: #06B6D4;
}
</style>