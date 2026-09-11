<template>
  <div class="equipment-monitor">
    <!-- 顶部统计栏 -->
    <div class="equipment-monitor-header">
      <div class="equipment-monitor-header-item">
        <span class="equipment-monitor-header-label">设备监测</span>
      </div>
      <div class="equipment-monitor-header-item">
        <span class="equipment-monitor-header-icon">≡</span>
        <span class="equipment-monitor-header-label">设备类型</span>
        <span class="equipment-monitor-header-value">28</span>
      </div>
      <div class="equipment-monitor-header-item">
        <span class="equipment-monitor-header-label">设备总数</span>
        <span class="equipment-monitor-header-value">68562</span>
      </div>
      <div class="equipment-monitor-header-item">
        <span class="equipment-monitor-header-label">完好率</span>
        <span class="equipment-monitor-header-value">98%</span>
      </div>
    </div>

    <!-- 蓝色卡片区 -->
    <div class="equipment-monitor-cards">
      <div class="equipment-monitor-card equipment-monitor-card-left">
        <div class="equipment-monitor-card-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/>
            <path d="M12 6v6l4 2" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="equipment-monitor-card-content">
          <div class="equipment-monitor-card-row">
            <span class="equipment-monitor-card-label">总</span>
            <span class="equipment-monitor-card-label">数:</span>
            <span class="equipment-monitor-card-number">56302</span>
          </div>
          <div class="equipment-monitor-card-row">
            <span class="equipment-monitor-card-title">隧道设备</span>
            <span class="equipment-monitor-card-label">异常数:</span>
            <span class="equipment-monitor-card-alert">5</span>
          </div>
        </div>
      </div>
      <div class="equipment-monitor-card equipment-monitor-card-right">
        <div class="equipment-monitor-card-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/>
            <ellipse cx="12" cy="12" rx="6" ry="4" stroke="white" stroke-width="2"/>
            <circle cx="12" cy="12" r="2" fill="white"/>
          </svg>
        </div>
        <div class="equipment-monitor-card-content">
          <div class="equipment-monitor-card-row">
            <span class="equipment-monitor-card-label">总</span>
            <span class="equipment-monitor-card-label">数:</span>
            <span class="equipment-monitor-card-number">1280</span>
          </div>
          <div class="equipment-monitor-card-row">
            <span class="equipment-monitor-card-title">南北接线<br>设备</span>
            <span class="equipment-monitor-card-label">异常数:</span>
            <span class="equipment-monitor-card-alert">3</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容区：左侧导航 + 右侧网格 -->
    <div class="equipment-monitor-main">
      <!-- 左侧导航栏 -->
      <div class="equipment-monitor-nav">
        <div class="equipment-monitor-nav-btn equipment-monitor-nav-btn-active">
          <span class="equipment-monitor-nav-badge">3/3740</span>
          <span class="equipment-monitor-nav-text">监控</span>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="equipment-monitor-nav-badge equipment-monitor-nav-badge-small">3</span>
          <span class="equipment-monitor-nav-text">照明</span>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="equipment-monitor-nav-text">通风</span>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="equipment-monitor-nav-text">供配电</span>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="equipment-monitor-nav-text">消防</span>
        </div>
        <div class="equipment-monitor-nav-btn">
          <span class="equipment-monitor-nav-text">交通诱导</span>
        </div>
      </div>

      <!-- 右侧设备网格 -->
      <div class="equipment-monitor-grid">
        <div class="equipment-monitor-grid-item" v-for="item in gridItems" :key="item.name">
          <div class="equipment-monitor-grid-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="24" cy="38" rx="16" ry="4" fill="rgba(255,255,255,0.3)"/>
              <rect x="18" y="20" width="12" height="16" :fill="item.color" rx="2"/>
              <circle cx="24" cy="28" r="3" fill="white" opacity="0.8"/>
            </svg>
          </div>
          <div class="equipment-monitor-grid-name">{{ item.name }}</div>
          <div class="equipment-monitor-grid-status" :class="{'equipment-monitor-grid-status-error': item.error > 0}">
            ({{ item.error }}/{{ item.total }})
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const gridItems = ref([
  { name: '摄像机', error: 2, total: 484, color: '#3B9EFF' },
  { name: '风速风向仪', error: 1, total: 484, color: '#5BAEFF' },
  { name: '超高检测器', error: 0, total: 484, color: '#4FA8FF' },
  { name: '烟道机器人', error: 0, total: 484, color: '#3B9EFF' },
  { name: '激光雷达', error: 0, total: 484, color: '#5BAEFF' },
  { name: 'CO₂传感器', error: 0, total: 484, color: '#4FA8FF' },
  { name: 'CO/VI检测器', error: 0, total: 484, color: '#3B9EFF' },
  { name: '温湿度传感器', error: 0, total: 484, color: '#5BAEFF' },
  { name: '压力传感器', error: 0, total: 484, color: '#4FA8FF' },
  { name: '光照度变送器', error: 0, total: 484, color: '#3B9EFF' },
  { name: '紧急电话', error: 0, total: 484, color: '#5BAEFF' },
  { name: '水质监测设备', error: 0, total: 484, color: '#4FA8FF' }
])
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: linear-gradient(135deg, #E4EEF9 0%, #D8E8F8 100%);
  padding: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 顶部统计栏 */
.equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 32px;
  flex-shrink: 0;
  margin-bottom: 6px;
}

.equipment-monitor-header-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.equipment-monitor-header-label {
  font-size: 13px;
  color: #3B9EFF;
  font-weight: 400;
}

.equipment-monitor-header-value {
  font-size: 16px;
  color: #3B9EFF;
  font-weight: 700;
}

.equipment-monitor-header-icon {
  font-size: 14px;
  color: #3B9EFF;
  font-weight: 700;
}

/* 蓝色卡片区 */
.equipment-monitor-cards {
  display: flex;
  gap: 8px;
  height: 54px;
  flex-shrink: 0;
  margin-bottom: 6px;
}

.equipment-monitor-card {
  flex: 1;
  background: linear-gradient(90deg, #3B9EFF 0%, #5BAEFF 100%);
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  overflow: hidden;
}

.equipment-monitor-card::after {
  content: '';
  position: absolute;
  right: -10px;
  top: 0;
  bottom: 0;
  width: 20px;
  background: inherit;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}

.equipment-monitor-card-right {
  background: linear-gradient(90deg, rgba(59, 158, 255, 0.6) 0%, rgba(91, 174, 255, 0.6) 100%);
}

.equipment-monitor-card-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.equipment-monitor-card-icon svg {
  width: 100%;
  height: 100%;
}

.equipment-monitor-card-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.equipment-monitor-card-row {
  display: flex;
  align-items: center;
  gap: 3px;
}

.equipment-monitor-card-label {
  font-size: 10px;
  color: white;
  font-weight: 400;
}

.equipment-monitor-card-number {
  font-size: 14px;
  color: white;
  font-weight: 700;
}

.equipment-monitor-card-title {
  font-size: 10px;
  color: white;
  font-weight: 400;
  line-height: 1.2;
}

.equipment-monitor-card-alert {
  font-size: 13px;
  color: #FF4D4F;
  font-weight: 700;
}

/* 主内容区 */
.equipment-monitor-main {
  flex: 1;
  display: flex;
  gap: 6px;
  min-height: 0;
}

/* 左侧导航栏 */
.equipment-monitor-nav {
  width: 36px;
  flex-shrink: 0;
  display: grid;
  grid-template-rows: repeat(6, minmax(0, 1fr));
  gap: 5px;
  overflow-y: auto;
  align-content: start;
}

.equipment-monitor-nav-btn {
  background: white;
  border: 1.5px solid #3B9EFF;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  padding: 6px 4px;
  min-height: 48px;
}

.equipment-monitor-nav-btn-active {
  background: rgba(59, 158, 255, 0.1);
}

.equipment-monitor-nav-text {
  writing-mode: vertical-rl;
  font-size: 10px;
  color: #3B9EFF;
  font-weight: 400;
  letter-spacing: 2px;
}

.equipment-monitor-nav-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #FF4D4F;
  color: white;
  font-size: 8px;
  font-weight: 700;
  padding: 2px 4px;
  border-radius: 8px;
  white-space: nowrap;
}

.equipment-monitor-nav-badge-small {
  padding: 2px 5px;
}

/* 右侧网格区 */
.equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 5px;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
}

.equipment-monitor-grid-item {
  background: rgba(173, 216, 255, 0.4);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 70px;
}

.equipment-monitor-grid-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.equipment-monitor-grid-icon svg {
  width: 100%;
  height: 100%;
}

.equipment-monitor-grid-name {
  font-size: 10px;
  color: #2C3E50;
  font-weight: 400;
  text-align: center;
  line-height: 1.3;
}

.equipment-monitor-grid-status {
  font-size: 10px;
  color: #22D3EE;
  font-weight: 400;
}

.equipment-monitor-grid-status-error {
  color: #FF4D4F;
}
</style>