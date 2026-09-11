<template>
  <div class="equipment-monitor">
    <!-- 顶部标题栏 -->
    <div class="equipment-monitor-header">
      <div class="equipment-monitor-header-title">设备监测</div>
      <div class="equipment-monitor-header-stats">
        <div class="equipment-monitor-header-stat">
          <span class="equipment-monitor-header-stat-icon">≡</span>
          <span class="equipment-monitor-header-stat-label">设备类型</span>
          <span class="equipment-monitor-header-stat-value">28</span>
        </div>
        <div class="equipment-monitor-header-stat">
          <span class="equipment-monitor-header-stat-label">设备总数</span>
          <span class="equipment-monitor-header-stat-value">68562</span>
        </div>
        <div class="equipment-monitor-header-stat">
          <span class="equipment-monitor-header-stat-label">完好率</span>
          <span class="equipment-monitor-header-stat-value">98%</span>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="equipment-monitor-content">
      <!-- 左侧分类导航 -->
      <div class="equipment-monitor-sidebar">
        <div class="equipment-monitor-sidebar-btn active">
          <span class="equipment-monitor-sidebar-badge">3/3740</span>
          <span class="equipment-monitor-sidebar-text">监控</span>
        </div>
        <div class="equipment-monitor-sidebar-btn">
          <span class="equipment-monitor-sidebar-badge small">3</span>
          <span class="equipment-monitor-sidebar-text">照明</span>
        </div>
        <div class="equipment-monitor-sidebar-btn">
          <span class="equipment-monitor-sidebar-text">通风</span>
        </div>
        <div class="equipment-monitor-sidebar-btn">
          <span class="equipment-monitor-sidebar-text">供配电</span>
        </div>
        <div class="equipment-monitor-sidebar-btn">
          <span class="equipment-monitor-sidebar-text">消防</span>
        </div>
        <div class="equipment-monitor-sidebar-btn">
          <span class="equipment-monitor-sidebar-text">交通诱导</span>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <div class="equipment-monitor-main">
        <!-- 统计卡片区 -->
        <div class="equipment-monitor-cards">
          <div class="equipment-monitor-card primary">
            <div class="equipment-monitor-card-icon">
              <svg viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="20" fill="rgba(255,255,255,0.2)" />
                <path d="M24 12 L32 20 L24 28 L16 20 Z" fill="currentColor" />
              </svg>
            </div>
            <div class="equipment-monitor-card-content">
              <div class="equipment-monitor-card-title">隧道设备</div>
              <div class="equipment-monitor-card-stats">
                <div class="equipment-monitor-card-stat">
                  <span class="equipment-monitor-card-stat-label">总 数:</span>
                  <span class="equipment-monitor-card-stat-value">56302</span>
                </div>
                <div class="equipment-monitor-card-stat">
                  <span class="equipment-monitor-card-stat-label">异常数:</span>
                  <span class="equipment-monitor-card-stat-value error">5</span>
                </div>
              </div>
            </div>
          </div>
          <div class="equipment-monitor-card secondary">
            <div class="equipment-monitor-card-icon">
              <svg viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="20" fill="rgba(255,255,255,0.2)" />
                <ellipse cx="24" cy="24" rx="12" ry="8" fill="currentColor" />
              </svg>
            </div>
            <div class="equipment-monitor-card-content">
              <div class="equipment-monitor-card-title">南北接线设备</div>
              <div class="equipment-monitor-card-stats">
                <div class="equipment-monitor-card-stat">
                  <span class="equipment-monitor-card-stat-label">总 数:</span>
                  <span class="equipment-monitor-card-stat-value">1280</span>
                </div>
                <div class="equipment-monitor-card-stat">
                  <span class="equipment-monitor-card-stat-label">异常数:</span>
                  <span class="equipment-monitor-card-stat-value error">3</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 设备网格区 -->
        <div class="equipment-monitor-grid">
          <div v-for="item in equipmentList" :key="item.name" class="equipment-monitor-grid-item">
            <div class="equipment-monitor-grid-icon">
              <div class="equipment-monitor-grid-icon-base"></div>
              <div class="equipment-monitor-grid-icon-symbol">
                <component :is="item.icon" />
              </div>
            </div>
            <div class="equipment-monitor-grid-info">
              <div class="equipment-monitor-grid-name">{{ item.name }}</div>
              <div class="equipment-monitor-grid-status">{{ item.status }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const equipmentList = ref([
  { name: '摄像机', status: '(2/484)', icon: 'IconCamera' },
  { name: '风速风向仪', status: '(1/484)', icon: 'IconWind' },
  { name: '超高检测器', status: '(0/484)', icon: 'IconHeight' },
  { name: '烟道机器人', status: '(0/484)', icon: 'IconRobot' },
  { name: '激光雷达', status: '(0/484)', icon: 'IconRadar' },
  { name: 'CO₂传感器', status: '(0/484)', icon: 'IconCO2' },
  { name: 'CO/VI检测器', status: '(0/484)', icon: 'IconCO' },
  { name: '温湿度传感器', status: '(0/484)', icon: 'IconTemp' },
  { name: '压力传感器', status: '(0/484)', icon: 'IconPressure' },
  { name: '光照度变送器', status: '(0/484)', icon: 'IconLight' },
  { name: '紧急电话', status: '(0/484)', icon: 'IconPhone' },
  { name: '水质监测设备', status: '(0/484)', icon: 'IconWater' }
])
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #E4EEF9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 顶部标题栏 */
.equipment-monitor-header {
  height: 32px;
  background: rgba(59, 158, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.equipment-monitor-header-title {
  font-size: 16px;
  font-weight: 500;
  color: #2C3E50;
}

.equipment-monitor-header-stats {
  display: flex;
  gap: 24px;
}

.equipment-monitor-header-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.equipment-monitor-header-stat-icon {
  color: #3B9EFF;
  font-size: 16px;
  font-weight: 700;
}

.equipment-monitor-header-stat-label {
  color: #2C3E50;
}

.equipment-monitor-header-stat-value {
  color: #3B9EFF;
  font-weight: 700;
  font-size: 16px;
}

/* 主内容区 */
.equipment-monitor-content {
  flex: 1;
  display: flex;
  gap: 10px;
  padding: 12px 10px 10px;
  min-height: 0;
  overflow: hidden;
}

/* 左侧分类导航 */
.equipment-monitor-sidebar {
  width: 42px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  overflow-y: auto;
  min-height: 0;
}

.equipment-monitor-sidebar-btn {
  background: rgba(59, 158, 255, 0.25);
  border-radius: 8px;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  position: relative;
  min-height: 50px;
  transition: background 0.2s;
}

.equipment-monitor-sidebar-btn:hover {
  background: rgba(59, 158, 255, 0.35);
}

.equipment-monitor-sidebar-btn.active {
  background: rgba(59, 158, 255, 0.5);
}

.equipment-monitor-sidebar-text {
  writing-mode: vertical-rl;
  font-size: 12px;
  color: #2C3E50;
  font-weight: 500;
  letter-spacing: 2px;
}

.equipment-monitor-sidebar-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #FF4D4F;
  color: white;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 8px;
  font-weight: 600;
  white-space: nowrap;
}

.equipment-monitor-sidebar-badge.small {
  padding: 2px 5px;
  min-width: 16px;
  text-align: center;
}

/* 右侧主内容 */
.equipment-monitor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

/* 统计卡片区 */
.equipment-monitor-cards {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.equipment-monitor-card {
  flex: 1;
  min-height: 95px;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  overflow: hidden;
}

.equipment-monitor-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 30px;
  height: 100%;
  background: rgba(255, 255, 255, 0.15);
  clip-path: polygon(100% 0, 100% 100%, 0 100%, 40% 50%, 0 0);
}

.equipment-monitor-card.primary {
  background: linear-gradient(135deg, #3B9EFF 0%, #1E7FCF 100%);
}

.equipment-monitor-card.secondary {
  background: linear-gradient(135deg, #7CB9E8 0%, #5BA3D0 100%);
}

.equipment-monitor-card-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.9);
}

.equipment-monitor-card-icon svg {
  width: 100%;
  height: 100%;
}

.equipment-monitor-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.equipment-monitor-card-title {
  font-size: 14px;
  color: white;
  font-weight: 500;
}

.equipment-monitor-card-stats {
  display: flex;
  gap: 16px;
}

.equipment-monitor-card-stat {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.equipment-monitor-card-stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
}

.equipment-monitor-card-stat-value {
  font-size: 22px;
  font-weight: 700;
  color: white;
}

.equipment-monitor-card-stat-value.error {
  color: #FF4D4F;
  font-size: 18px;
}

/* 设备网格区 */
.equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, min-content);
  gap: 8px 10px;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
  padding-bottom: 4px;
}

.equipment-monitor-grid-item {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.equipment-monitor-grid-item:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 158, 255, 0.15);
}

.equipment-monitor-grid-icon {
  width: 40px;
  height: 40px;
  position: relative;
  flex-shrink: 0;
}

.equipment-monitor-grid-icon-base {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 12px;
  background: linear-gradient(180deg, rgba(59, 158, 255, 0.3) 0%, rgba(59, 158, 255, 0.1) 100%);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(59, 158, 255, 0.2);
}

.equipment-monitor-grid-icon-symbol {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #3B9EFF 0%, #1E7FCF 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 16px;
  box-shadow: 0 2px 6px rgba(59, 158, 255, 0.3);
}

.equipment-monitor-grid-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.equipment-monitor-grid-name {
  font-size: 11px;
  color: #2C3E50;
  font-weight: 400;
  line-height: 1.3;
}

.equipment-monitor-grid-status {
  font-size: 13px;
  color: #00D4FF;
  font-weight: 600;
}
</style>