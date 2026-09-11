<template>
  <div class="equipment-monitor">
    <!-- 顶部统计栏 -->
    <div class="equipment-monitor-header">
      <span class="header-title">设备监测</span>
      <div class="header-stats">
        <div class="stat-item">
          <span class="stat-label">设备类型</span>
          <span class="stat-value" style="color: #3B9EFF;">28</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">设备总数</span>
          <span class="stat-value" style="color: #3B9EFF;">68562</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">完好率</span>
          <span class="stat-value" style="color: #00D4FF;">98%</span>
        </div>
      </div>
    </div>

    <!-- 统计卡片区 -->
    <div class="equipment-monitor-summary">
      <div class="summary-card card-primary">
        <div class="card-icon">
          <svg viewBox="0 0 32 32" width="32" height="32">
            <circle cx="16" cy="20" r="6" fill="#fff" opacity="0.3"/>
            <path d="M16 10 L12 16 L20 16 Z" fill="#fff"/>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">隧道设备</div>
          <div class="card-stats">
            <span>总 数:<span class="num">56302</span></span>
            <span>异常数:<span class="num error">5</span></span>
          </div>
        </div>
      </div>
      <div class="summary-card card-secondary">
        <div class="card-icon">
          <svg viewBox="0 0 32 32" width="32" height="32">
            <ellipse cx="16" cy="16" rx="8" ry="5" fill="#fff" opacity="0.3"/>
            <circle cx="16" cy="16" r="3" fill="#fff"/>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">南北接线设备</div>
          <div class="card-stats">
            <span>总 数:<span class="num">1280</span></span>
            <span>异常数:<span class="num error">3</span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容区：导航栏 + 设备网格 -->
    <div class="equipment-monitor-main">
      <!-- 左侧导航栏 -->
      <div class="equipment-monitor-sidebar">
        <div class="sidebar-badge">3/3740</div>
        <button
          v-for="(tab, index) in tabs"
          :key="index"
          :class="['sidebar-tab', { active: activeTab === index }]"
          @click="activeTab = index"
        >
          <span class="tab-text">{{ tab.label }}</span>
          <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
        </button>
      </div>

      <!-- 设备网格区 -->
      <div class="equipment-monitor-grid">
        <div
          v-for="(device, index) in devices"
          :key="index"
          class="device-card"
        >
          <div class="device-icon">
            <div class="icon-base"></div>
            <div class="icon-symbol">{{ device.icon }}</div>
          </div>
          <div class="device-name">{{ device.name }}</div>
          <div class="device-status">{{ device.status }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeTab = ref(0)

const tabs = [
  { label: '监控', badge: null },
  { label: '照明', badge: '3' },
  { label: '通风', badge: null },
  { label: '供配电', badge: null },
  { label: '消防', badge: null },
  { label: '交通诱导', badge: null }
]

const devices = [
  { name: '摄像机', status: '(2/484)', icon: '📷' },
  { name: '风速风向仪', status: '(1/484)', icon: '🌀' },
  { name: '超高检测器', status: '(0/484)', icon: '📏' },
  { name: '烟道机器人', status: '(0/484)', icon: '🤖' },
  { name: '激光雷达', status: '(0/484)', icon: '📡' },
  { name: 'CO₂传感器', status: '(0/484)', icon: 'CO₂' },
  { name: 'CO/VI检测器', status: '(0/484)', icon: 'CO' },
  { name: '温湿度传感器', status: '(0/484)', icon: '🌡' },
  { name: '压力传感器', status: '(0/484)', icon: '⚡' },
  { name: '光照度变送器', status: '(0/484)', icon: '💡' },
  { name: '紧急电话', status: '(0/484)', icon: '📞' },
  { name: '水质监测设备', status: '(0/484)', icon: '💧' }
]
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #E4EEF9;
  padding: 10px;
  display: flex;
  flex-direction: column;
  font-family: 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}

/* 顶部统计栏 */
.equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  height: 28px;
  flex-shrink: 0;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: #3B9EFF;
}

.header-stats {
  display: flex;
  gap: 14px;
  flex: 1;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.stat-label {
  font-size: 10px;
  color: #2C3E50;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

/* 统计卡片区 */
.equipment-monitor-summary {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  height: 70px;
  flex-shrink: 0;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}

.summary-card::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 20px;
  background: linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.05) 50%);
  transform: skewX(-15deg) translateX(10px);
}

.card-primary {
  flex: 1.8;
  background: linear-gradient(135deg, #3B9EFF 0%, #5AAFFF 100%);
}

.card-secondary {
  flex: 1;
  background: linear-gradient(135deg, #89C4F4 0%, #A8D5F7 100%);
}

.card-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  flex-shrink: 0;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 12px;
  color: #fff;
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
}

.card-stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #fff;
}

.card-stats .num {
  font-weight: 700;
  margin-left: 2px;
}

.card-stats .error {
  color: #FF4D4F;
}

/* 主内容区 */
.equipment-monitor-main {
  display: flex;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 左侧导航栏 */
.equipment-monitor-sidebar {
  width: 36px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  padding-top: 20px;
  flex-shrink: 0;
}

.sidebar-badge {
  position: absolute;
  top: -8px;
  left: 2px;
  background: #3B9EFF;
  color: #fff;
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 8px;
  font-weight: 600;
  z-index: 10;
}

.sidebar-tab {
  writing-mode: vertical-rl;
  white-space: nowrap;
  background: rgba(59, 158, 255, 0.3);
  border: none;
  border-radius: 4px;
  padding: 10px 6px;
  cursor: pointer;
  color: #2C3E50;
  font-size: 11px;
  font-weight: 500;
  position: relative;
  letter-spacing: 2px;
  flex: 1;
  min-height: 0;
  transition: background 0.2s;
}

.sidebar-tab:hover {
  background: rgba(59, 158, 255, 0.4);
}

.sidebar-tab.active {
  background: #3B9EFF;
  color: #fff;
}

.tab-text {
  display: block;
}

.tab-badge {
  position: absolute;
  top: 4px;
  right: -6px;
  background: #FF4D4F;
  color: #fff;
  font-size: 9px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  z-index: 2;
}

/* 设备网格区 */
.equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
}

.device-card {
  background: rgba(213, 224, 232, 0.6);
  border: 1px solid #B8C8D8;
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: transform 0.2s;
  cursor: pointer;
  min-height: 0;
}

.device-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(59, 158, 255, 0.2);
}

.device-icon {
  width: 28px;
  height: 28px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}

.icon-base {
  position: absolute;
  width: 24px;
  height: 16px;
  background: linear-gradient(180deg, #A8C8E0 0%, #8BA8C8 100%);
  border-radius: 50% / 30%;
  bottom: 0;
}

.icon-symbol {
  position: relative;
  font-size: 14px;
  z-index: 1;
}

.device-name {
  font-size: 11px;
  color: #2C3E50;
  font-weight: 500;
  text-align: center;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.device-status {
  font-size: 13px;
  color: #00D4FF;
  font-weight: 700;
}
</style>