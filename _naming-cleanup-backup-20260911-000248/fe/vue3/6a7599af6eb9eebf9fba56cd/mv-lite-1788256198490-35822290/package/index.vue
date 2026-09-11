<template>
  <div class="device-monitor">
    <!-- 顶部统计横幅 -->
    <div class="stats-banner">
      <div class="banner-title">设备监测</div>
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

    <!-- 设备分类卡片区 -->
    <div class="category-cards">
      <div class="category-card primary-gradient">
        <div class="category-icon">
          <div class="icon-circle">🔔</div>
        </div>
        <div class="category-content">
          <div class="category-name">隧道设备</div>
          <div class="category-stats">
            <span class="category-label">总 数:</span>
            <span class="category-number">56302</span>
          </div>
          <div class="category-stats">
            <span class="category-label">异常数:</span>
            <span class="category-number danger">5</span>
          </div>
        </div>
      </div>
      <div class="category-card secondary">
        <div class="category-icon">
          <div class="icon-circle">💎</div>
        </div>
        <div class="category-content">
          <div class="category-name">雨北接线设备</div>
          <div class="category-stats">
            <span class="category-label">总 数:</span>
            <span class="category-number">1280</span>
          </div>
          <div class="category-stats">
            <span class="category-label">异常数:</span>
            <span class="category-number danger">3</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容区：左侧导航 + 设备网格 -->
    <div class="main-content">
      <!-- 左侧垂直导航栏 -->
      <div class="nav-sidebar">
        <div class="nav-item active">
          <div class="nav-badge">3</div>
          <div class="nav-label">监控</div>
          <div class="nav-counter">3/3740</div>
        </div>
        <div class="nav-item">
          <div class="nav-badge-placeholder">3</div>
          <div class="nav-label">照明</div>
        </div>
        <div class="nav-item">
          <div class="nav-label">通风</div>
        </div>
        <div class="nav-item">
          <div class="nav-label">供配电</div>
        </div>
        <div class="nav-item">
          <div class="nav-label">消防</div>
        </div>
        <div class="nav-item">
          <div class="nav-label">交通诱导</div>
        </div>
      </div>

      <!-- 设备网格区 -->
      <div class="device-grid">
        <div v-for="device in devices" :key="device.name" class="device-card">
          <div class="device-icon-base">
            <div class="icon-platform"></div>
            <div class="device-icon" v-html="device.icon"></div>
          </div>
          <div class="device-name">{{ device.name }}</div>
          <div class="device-status">
            <span class="status-error">{{ device.error }}</span>
            <span class="status-total">/{{ device.total }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const devices = ref([
  { name: '摄像机', error: '2', total: '484', icon: '📹' },
  { name: '风速风向仪', error: '1', total: '484', icon: '🌪️' },
  { name: '超高检测器', error: '0', total: '484', icon: '📏' },
  { name: '烟道机器人', error: '0', total: '484', icon: '🤖' },
  { name: '激光雷达', error: '0', total: '484', icon: '🎯' },
  { name: 'CO₂传感器', error: '0', total: '484', icon: '💨' },
  { name: 'CO/VI检测器', error: '0', total: '484', icon: '⚗️' },
  { name: '温湿度传感器', error: '0', total: '484', icon: '🌡️' },
  { name: '压力传感器', error: '0', total: '484', icon: '📊' },
  { name: '光照度变送器', error: '0', total: '484', icon: '💡' },
  { name: '紧急电话', error: '0', total: '484', icon: '☎️' },
  { name: '水质监测设备', error: '0', total: '484', icon: '💧' }
])
</script>

<style scoped>
.device-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #A8B5C0;
  padding: 15px;
  overflow: auto;
}

/* 顶部统计横幅 */
.stats-banner {
  background: #C8D4E0;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 30px;
  border-radius: 6px;
  margin-bottom: 15px;
}

.banner-title {
  font-size: 20px;
  font-weight: 700;
  color: #38BDF8;
  margin-right: 20px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 18px;
  color: #38BDF8;
}

.stat-label {
  font-size: 13px;
  color: #1F2937;
  font-weight: 500;
}

.stat-value {
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
}

.stat-value.primary {
  color: #38BDF8;
}

.stat-value.success {
  color: #10B981;
}

/* 设备分类卡片区 */
.category-cards {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
}

.category-card {
  flex: 1;
  padding: 18px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 15px;
  position: relative;
}

.category-card.primary-gradient {
  background: linear-gradient(to right, #3B9EFF, #7BC4FF);
  clip-path: polygon(0 0, calc(100% - 25px) 0, 100% 50%, calc(100% - 25px) 100%, 0 100%);
}

.category-card.secondary {
  background: #A8C5E0;
}

.category-icon {
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-circle {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.category-content {
  flex: 1;
}

.category-name {
  font-size: 16px;
  font-weight: 700;
  color: #1F2937;
  margin-bottom: 6px;
}

.category-stats {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}

.category-label {
  font-size: 12px;
  color: #1F2937;
  font-weight: 500;
}

.category-number {
  font-size: 22px;
  font-weight: 700;
  color: #1F2937;
}

.category-number.danger {
  color: #EF4444;
}

/* 主内容区 */
.main-content {
  display: flex;
  gap: 12px;
}

/* 左侧导航栏 */
.nav-sidebar {
  width: 72px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nav-item {
  background: rgba(59, 158, 255, 0.6);
  border-radius: 8px;
  padding: 10px 8px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60px;
}

.nav-item:hover {
  background: rgba(59, 158, 255, 0.8);
}

.nav-item.active {
  background: rgba(59, 158, 255, 0.75);
}

.nav-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #EF4444;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-badge-placeholder {
  opacity: 0;
}

.nav-label {
  font-size: 13px;
  font-weight: 600;
  color: #1F2937;
  text-align: center;
  line-height: 1.3;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}

.nav-counter {
  position: absolute;
  left: -48px;
  top: 50%;
  transform: translateY(-50%);
  background: #FFFFFF;
  border: 2px solid #EF4444;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 700;
  color: #EF4444;
  white-space: nowrap;
}

/* 设备网格区 */
.device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  align-content: start;
}

.device-card {
  background: rgba(208, 220, 232, 0.7);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.2s, background 0.2s;
}

.device-card:hover {
  background: rgba(208, 220, 232, 0.9);
  transform: translateY(-2px);
}

.device-icon-base {
  position: relative;
  width: 55px;
  height: 55px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-platform {
  position: absolute;
  bottom: 0;
  width: 55px;
  height: 20px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.5) 70%, transparent 100%);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.device-icon {
  position: relative;
  font-size: 28px;
  z-index: 1;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.device-name {
  font-size: 13px;
  font-weight: 600;
  color: #1F2937;
  margin-bottom: 4px;
  text-align: center;
}

.device-status {
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.status-error {
  color: #EF4444;
}

.status-total {
  color: #22D3EE;
}
</style>