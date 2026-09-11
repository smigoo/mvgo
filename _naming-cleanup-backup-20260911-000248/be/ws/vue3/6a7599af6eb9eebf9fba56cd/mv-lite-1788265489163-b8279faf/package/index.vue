<template>
  <div class="equipment-monitor">
    <!-- 顶部统计栏 -->
    <div class="equipment-monitor-header">
      <div class="equipment-monitor-title">设备监测</div>
      <div class="equipment-monitor-stats">
        <div class="stat-item stat-type">
          <span class="stat-icon">≡</span>
          <span class="stat-label">设备类型</span>
          <span class="stat-value">28</span>
        </div>
        <div class="stat-item stat-total">
          <span class="stat-label">设备总数</span>
          <span class="stat-value">68562</span>
        </div>
        <div class="stat-item stat-rate">
          <span class="stat-label">完好率</span>
          <span class="stat-value">98%</span>
        </div>
      </div>
    </div>

    <div class="equipment-monitor-body">
      <!-- 左侧分类导航栏 -->
      <div class="equipment-monitor-sidebar">
        <div
          v-for="(category, index) in categories"
          :key="index"
          :class="['sidebar-button', { active: activeCategory === index }]"
          @click="activeCategory = index"
        >
          <div v-if="category.badge" class="sidebar-badge">{{ category.badge }}</div>
          <div class="sidebar-text">{{ category.name }}</div>
        </div>
      </div>

      <!-- 右侧主内容区 -->
      <div class="equipment-monitor-content">
        <!-- 两个统计卡片 -->
        <div class="equipment-monitor-summary">
          <div class="summary-card summary-card-tunnel">
            <div class="summary-icon">
              <div class="icon-circle"></div>
            </div>
            <div class="summary-info">
              <div class="summary-title">隧道设备</div>
              <div class="summary-row">
                <span class="summary-label">总 数:</span>
                <span class="summary-number">56302</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">异常数:</span>
                <span class="summary-number summary-error">5</span>
              </div>
            </div>
          </div>
          <div class="summary-card summary-card-junction">
            <div class="summary-icon">
              <div class="icon-circle"></div>
            </div>
            <div class="summary-info">
              <div class="summary-title">南北接线<br>设备</div>
              <div class="summary-row">
                <span class="summary-label">总 数:</span>
                <span class="summary-number">1280</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">异常数:</span>
                <span class="summary-number summary-error">3</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 设备网格 -->
        <div class="equipment-monitor-grid">
          <div v-for="(device, index) in devices" :key="index" class="device-card">
            <div class="device-icon">
              <div class="device-icon-base"></div>
              <div class="device-icon-symbol">{{ device.icon }}</div>
            </div>
            <div class="device-name">{{ device.name }}</div>
            <div class="device-status">{{ device.status }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeCategory = ref(0)

const categories = [
  { name: '监控', badge: '3/3740' },
  { name: '照明', badge: '3' },
  { name: '通风', badge: null },
  { name: '供配电', badge: null },
  { name: '消防', badge: null },
  { name: '交通诱导', badge: null }
]

const devices = [
  { name: '摄像机', status: '(2/484)', icon: '📷' },
  { name: '风速风向仪', status: '(1/484)', icon: '🌀' },
  { name: '超高检测器', status: '(0/484)', icon: '📏' },
  { name: '烟道机器人', status: '(0/484)', icon: '🤖' },
  { name: '激光雷达', status: '(0/484)', icon: '⊙' },
  { name: 'CO₂传感器', status: '(0/484)', icon: 'CO₂' },
  { name: 'CO/VI检测器', status: '(0/484)', icon: '◇' },
  { name: '温湿度传感器', status: '(0/484)', icon: '🌡' },
  { name: '压力传感器', status: '(0/484)', icon: '⊕' },
  { name: '光照度变送器', status: '(0/484)', icon: '◐' },
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
  padding: 6px 10px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 顶部统计栏 */
.equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 28px;
  flex-shrink: 0;
  margin-bottom: 12px;
}

.equipment-monitor-title {
  font-size: 15px;
  font-weight: 500;
  color: #4FA8F5;
  white-space: nowrap;
}

.equipment-monitor-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.stat-icon {
  font-size: 14px;
  color: #4FA8F5;
}

.stat-label {
  font-size: 11px;
  color: #3D5568;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
}

.stat-type .stat-value {
  color: #4FA8F5;
}

.stat-total .stat-value {
  color: #2E7DB8;
}

.stat-rate .stat-value {
  color: #52C41A;
}

/* 主体区域 */
.equipment-monitor-body {
  display: flex;
  gap: 5px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 左侧导航栏 */
.equipment-monitor-sidebar {
  width: 43px;
  flex-shrink: 0;
  display: grid;
  grid-template-rows: repeat(6, minmax(0, 1fr));
  gap: 4px;
}

.sidebar-button {
  background: #D4DDE5;
  border-radius: 4px;
  writing-mode: vertical-rl;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  overflow: visible;
  padding: 8px 0;
}

.sidebar-button.active {
  background: #3A8FD5;
}

.sidebar-text {
  font-size: 12px;
  color: #3D5568;
  letter-spacing: 2px;
}

.sidebar-button.active .sidebar-text {
  color: #FFFFFF;
}

.sidebar-badge {
  position: absolute;
  left: 4px;
  top: -6px;
  background: #FF3B3B;
  color: #FFFFFF;
  font-size: 9px;
  padding: 2px 4px;
  border-radius: 8px;
  white-space: nowrap;
  writing-mode: horizontal-tb;
  z-index: 10;
}

/* 右侧内容区 */
.equipment-monitor-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

/* 统计卡片 */
.equipment-monitor-summary {
  display: flex;
  gap: 5px;
  height: 58px;
  flex-shrink: 0;
}

.summary-card {
  flex: 1;
  min-width: 0;
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.summary-card-tunnel {
  background: linear-gradient(90deg, #3A9EF5 0%, #7EC3F8 100%);
}

.summary-card-junction {
  background: linear-gradient(90deg, #74B8F1 0%, #A8D5F8 100%);
}

.summary-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.3), 0 0 0 6px rgba(255, 255, 255, 0.15);
}

.summary-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-title {
  font-size: 11px;
  color: #FFFFFF;
  line-height: 1.3;
  font-weight: 500;
}

.summary-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  line-height: 1.2;
}

.summary-label {
  font-size: 9px;
  color: #FFFFFF;
}

.summary-number {
  font-size: 16px;
  font-weight: 700;
  color: #FFFFFF;
}

.summary-number.summary-error {
  color: #FF3B3B;
}

/* 设备网格 */
.equipment-monitor-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, min-content);
  gap: 5px 5px;
  overflow-y: auto;
  align-content: start;
}

.device-card {
  background: rgba(212, 221, 229, 0.6);
  border: 1px solid #A8B8C5;
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.device-icon {
  width: 40px;
  height: 40px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}

.device-icon-base {
  position: absolute;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #F0F4F8 0%, #D8E2EC 100%);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.4), 0 2px 4px rgba(0, 0, 0, 0.1);
}

.device-icon-symbol {
  position: relative;
  font-size: 18px;
  color: #4FA8F5;
  z-index: 1;
}

.device-name {
  font-size: 11px;
  color: #3D5568;
  text-align: center;
  line-height: 1.3;
  font-weight: 400;
}

.device-status {
  font-size: 13px;
  color: #00D4FF;
  font-weight: 500;
}
</style>