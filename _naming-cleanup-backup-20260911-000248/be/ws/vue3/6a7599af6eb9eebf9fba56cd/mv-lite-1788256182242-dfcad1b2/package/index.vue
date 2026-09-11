<template>
  <div class="mv-lite-1788256182242-dfcad1b2">
    <!-- 左侧垂直导航栏 -->
    <div class="sidebar">
      <div 
        v-for="(tab, index) in tabs" 
        :key="index"
        class="sidebar-tab"
        :class="{ active: activeTab === index }"
        @click="activeTab = index"
      >
        <span class="tab-text">{{ tab.name }}</span>
        <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
      </div>
    </div>

    <!-- 右侧主内容区 -->
    <div class="main-content">
      <!-- 顶部统计横幅 -->
      <div class="stats-banner">
        <div class="banner-title">设备监测</div>
        <div class="banner-stats">
          <div class="stat-item">
            <span class="stat-icon">≡</span>
            <span class="stat-label">设备类型</span>
            <span class="stat-value primary">28</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">设备总数</span>
            <span class="stat-value primary">68562</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">完好率</span>
            <span class="stat-value success">98%</span>
          </div>
        </div>
      </div>

      <!-- 两个大状态卡片 -->
      <div class="status-cards">
        <div class="status-card blue-card">
          <div class="card-icon">
            <div class="icon-bg"></div>
            <div class="icon-symbol">🔔</div>
          </div>
          <div class="card-content">
            <div class="card-title">隧道设备</div>
            <div class="card-stats">
              <span class="card-label">总数:</span>
              <span class="card-number">56302</span>
            </div>
            <div class="card-stats">
              <span class="card-label">异常数:</span>
              <span class="card-number error">5</span>
            </div>
          </div>
          <div class="card-arrow"></div>
        </div>

        <div class="status-card light-card">
          <div class="card-icon">
            <div class="icon-bg"></div>
            <div class="icon-symbol">💾</div>
          </div>
          <div class="card-content">
            <div class="card-title">南北接线<br>设备</div>
            <div class="card-stats">
              <span class="card-label">总数:</span>
              <span class="card-number">1280</span>
            </div>
            <div class="card-stats">
              <span class="card-label">异常数:</span>
              <span class="card-number error">3</span>
            </div>
          </div>
          <div class="card-arrow"></div>
        </div>
      </div>

      <!-- 设备网格矩阵 -->
      <div class="device-grid">
        <div 
          v-for="(device, index) in devices" 
          :key="index"
          class="device-card"
          @click="handleDeviceClick(device)"
        >
          <div class="device-icon-wrapper">
            <div class="device-icon-base"></div>
            <div class="device-icon">{{ device.icon }}</div>
          </div>
          <div class="device-name">{{ device.name }}</div>
          <div class="device-status">
            <span class="status-error">{{ device.error }}</span>
            <span class="status-divider">/</span>
            <span class="status-total">{{ device.total }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeTab = ref(0)

const tabs = [
  { name: '监控', badge: '3' },
  { name: '照明', badge: '3' },
  { name: '通风', badge: null },
  { name: '供配电', badge: null },
  { name: '消防', badge: null },
  { name: '交通诱导', badge: null }
]

const devices = [
  { name: '摄像机', error: 2, total: 484, icon: '📹' },
  { name: '风速风向仪', error: 1, total: 484, icon: '🌬️' },
  { name: '超高检测器', error: 0, total: 484, icon: '📏' },
  { name: '烟道机器人', error: 0, total: 484, icon: '🤖' },
  { name: '激光雷达', error: 0, total: 484, icon: '🎯' },
  { name: 'CO₂传感器', error: 0, total: 484, icon: '💨' },
  { name: 'CO/VI检测器', error: 0, total: 484, icon: '🔍' },
  { name: '温湿度传感器', error: 0, total: 484, icon: '🌡️' },
  { name: '压力传感器', error: 0, total: 484, icon: '⚡' },
  { name: '光照度变送器', error: 0, total: 484, icon: '💡' },
  { name: '紧急电话', error: 0, total: 484, icon: '📞' },
  { name: '水质监测设备', error: 0, total: 484, icon: '💧' }
]

const handleDeviceClick = (device) => {
  console.log('Device clicked:', device.name)
}
</script>

<style scoped>
.mv-lite-1788256182242-dfcad1b2 {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  background: #E8F3FF;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  padding: 20px;
  gap: 12px;
}

/* 左侧垂直导航栏 */
.sidebar {
  width: 48px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-tab {
  position: relative;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid #B8D9F5;
  border-radius: 8px;
  padding: 16px 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
}

.sidebar-tab:hover {
  background: #FFFFFF;
  box-shadow: 0 2px 8px rgba(59, 158, 255, 0.15);
}

.sidebar-tab.active {
  background: #3B9EFF;
}

.tab-text {
  writing-mode: vertical-rl;
  font-size: 16px;
  font-weight: 500;
  color: #3B9EFF;
  letter-spacing: 2px;
}

.sidebar-tab.active .tab-text {
  color: #FFFFFF;
}

.tab-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #FF3B30;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

/* 右侧主内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* 顶部统计横幅 */
.stats-banner {
  display: flex;
  align-items: center;
  gap: 30px;
  padding: 12px 20px;
  background: transparent;
}

.banner-title {
  font-size: 28px;
  font-weight: 600;
  color: #3B9EFF;
  white-space: nowrap;
}

.banner-stats {
  display: flex;
  align-items: center;
  gap: 40px;
  flex: 1;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 20px;
  color: #3B9EFF;
}

.stat-label {
  font-size: 16px;
  color: #666666;
}

.stat-value {
  font-size: 42px;
  font-weight: 800;
  line-height: 1;
}

.stat-value.primary {
  color: #3B9EFF;
}

.stat-value.success {
  color: #00C853;
}

/* 两个大状态卡片 */
.status-cards {
  display: flex;
  gap: 20px;
}

.status-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
  border-radius: 14px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s;
  min-height: 85px;
}

.status-card:hover {
  transform: translateY(-2px);
}

.blue-card {
  background: linear-gradient(135deg, #3B9EFF 0%, #5CB3FF 100%);
  border: 1px solid #2A8EEE;
}

.light-card {
  background: linear-gradient(135deg, #E8F5FF 0%, #D0E9FF 100%);
  border: 1px solid #B8D9F5;
}

.card-icon {
  position: relative;
  width: 50px;
  height: 50px;
  flex-shrink: 0;
}

.icon-bg {
  position: absolute;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0) 70%);
}

.icon-symbol {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 28px;
}

.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #FFFFFF;
  line-height: 1.3;
  margin-bottom: 4px;
}

.light-card .card-title {
  color: #333333;
}

.card-stats {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.card-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.light-card .card-label {
  color: #666666;
}

.card-number {
  font-size: 32px;
  font-weight: 800;
  color: #FFFFFF;
  line-height: 1;
}

.light-card .card-number {
  color: #3B9EFF;
}

.card-number.error {
  color: #FF3B30;
}

.card-arrow {
  position: absolute;
  right: -1px;
  top: 0;
  bottom: 0;
  width: 50px;
  background: linear-gradient(135deg, transparent 0%, transparent 50%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.1) 100%);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 30% 100%);
}

/* 设备网格矩阵 */
.device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px 16px;
  flex: 1;
}

.device-card {
  background: #FFFFFF;
  border: 1px solid #B8D9F5;
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.device-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 158, 255, 0.15);
  border-color: #3B9EFF;
}

.device-icon-wrapper {
  position: relative;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.device-icon-base {
  position: absolute;
  width: 60px;
  height: 20px;
  bottom: 0;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(59, 158, 255, 0.2) 0%, rgba(59, 158, 255, 0.05) 60%, transparent 100%);
}

.device-icon {
  font-size: 36px;
  position: relative;
  z-index: 1;
}

.device-name {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  text-align: center;
  line-height: 1.3;
}

.device-status {
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.status-error {
  color: #FF3B30;
}

.status-divider {
  color: #999999;
  font-size: 20px;
  font-weight: 400;
}

.status-total {
  color: #3B9EFF;
  font-size: 20px;
}
</style>