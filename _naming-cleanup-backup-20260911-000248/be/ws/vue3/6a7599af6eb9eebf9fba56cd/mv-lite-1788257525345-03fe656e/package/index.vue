<template>
  <div class="equipment-monitor">
    <!-- 顶部统计横幅 -->
    <div class="equipment-monitor-header">
      <div class="equipment-monitor-header-left">
        <span class="equipment-monitor-title">设备监测</span>
      </div>
      <div class="equipment-monitor-header-stats">
        <div class="equipment-monitor-stat-item">
          <span class="equipment-monitor-stat-icon">≡</span>
          <span class="equipment-monitor-stat-label">设备类型</span>
          <span class="equipment-monitor-stat-value primary">28</span>
        </div>
        <div class="equipment-monitor-stat-item">
          <span class="equipment-monitor-stat-label">设备总数</span>
          <span class="equipment-monitor-stat-value primary">68562</span>
        </div>
        <div class="equipment-monitor-stat-item">
          <span class="equipment-monitor-stat-label">完好率</span>
          <span class="equipment-monitor-stat-value success">98%</span>
        </div>
      </div>
    </div>

    <div class="equipment-monitor-content">
      <!-- 左侧分类导航 -->
      <div class="equipment-monitor-nav">
        <button 
          v-for="(item, index) in navItems" 
          :key="index"
          :class="['equipment-monitor-nav-btn', { active: activeNav === index }]"
          @click="activeNav = index"
        >
          {{ item.label }}
          <span v-if="item.badge" class="equipment-monitor-nav-badge">{{ item.badge }}</span>
        </button>
      </div>

      <!-- 右侧主区域 -->
      <div class="equipment-monitor-main">
        <!-- 顶部设备卡片区 -->
        <div class="equipment-monitor-cards">
          <div class="equipment-monitor-card tunnel">
            <div class="equipment-monitor-card-icon">
              <svg viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="16" fill="white" opacity="0.3"/>
                <path d="M24 14 L24 34 M16 24 L32 24" stroke="white" stroke-width="3" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="equipment-monitor-card-content">
              <div class="equipment-monitor-card-title">隧道设备</div>
              <div class="equipment-monitor-card-stats">
                <span>总 数:<span class="value">56302</span></span>
                <span>异常数:<span class="error">5</span></span>
              </div>
            </div>
            <div class="equipment-monitor-card-arrow"></div>
          </div>

          <div class="equipment-monitor-card横线">
            <div class="equipment-monitor-card-icon">
              <svg viewBox="0 0 48 48" fill="none">
                <ellipse cx="24" cy="24" rx="14" ry="8" fill="white" opacity="0.3"/>
                <path d="M18 24 Q24 20, 30 24 Q24 28, 18 24" fill="white" opacity="0.5"/>
              </svg>
            </div>
            <div class="equipment-monitor-card-content">
              <div class="equipment-monitor-card-title">雨北横线设备</div>
              <div class="equipment-monitor-card-stats">
                <span>总 数:<span class="value">1280</span></span>
                <span>异常数:<span class="error">3</span></span>
              </div>
            </div>
            <div class="equipment-monitor-card-arrow"></div>
          </div>
        </div>

        <!-- 主设备网格区 -->
        <div class="equipment-monitor-grid">
          <div 
            v-for="(device, index) in devices" 
            :key="index"
            class="equipment-monitor-device-card"
          >
            <div class="equipment-monitor-device-icon">
              <div class="equipment-monitor-icon-base"></div>
              <component :is="device.icon" class="equipment-monitor-icon-svg" />
            </div>
            <div class="equipment-monitor-device-info">
              <div class="equipment-monitor-device-name">{{ device.name }}</div>
              <div class="equipment-monitor-device-count">
                (<span :class="device.error > 0 ? 'error' : 'normal'">{{ device.error }}</span>/{{ device.total }})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeNav = ref(0)

const navItems = [
  { label: '监控', badge: '3/3740' },
  { label: '照明', badge: '3' },
  { label: '通风', badge: null },
  { label: '供配电', badge: null },
  { label: '消防', badge: null },
  { label: '交通诱导', badge: null }
]

const devices = [
  { name: '摄像机', error: 2, total: 484, icon: 'IconCamera' },
  { name: '风速风向仪', error: 1, total: 484, icon: 'IconWind' },
  { name: '超高检测器', error: 0, total: 484, icon: 'IconHeight' },
  { name: '烟道机器人', error: 0, total: 484, icon: 'IconRobot' },
  { name: '激光雷达', error: 0, total: 484, icon: 'IconRadar' },
  { name: 'CO₂传感器', error: 0, total: 484, icon: 'IconCO2' },
  { name: 'CO/VI检测器', error: 0, total: 484, icon: 'IconCO' },
  { name: '温湿度传感器', error: 0, total: 484, icon: 'IconTemp' },
  { name: '压力传感器', error: 0, total: 484, icon: 'IconPressure' },
  { name: '光照度变送器', error: 0, total: 484, icon: 'IconLight' },
  { name: '紧急电话', error: 0, total: 484, icon: 'IconPhone' },
  { name: '水质监测设备', error: 0, total: 484, icon: 'IconWater' }
]
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #B0B8C0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* 顶部统计横幅 */
.equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.equipment-monitor-header-left {
  background: linear-gradient(90deg, #2B8FE8 0%, rgba(43, 143, 232, 0.3) 100%);
  padding: 16px 24px;
  border-radius: 4px;
  flex-shrink: 0;
}

.equipment-monitor-title {
  font-size: 40px;
  font-weight: bold;
  color: #38BDF8;
  letter-spacing: 2px;
}

.equipment-monitor-header-stats {
  display: flex;
  gap: 32px;
  align-items: center;
}

.equipment-monitor-stat-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.equipment-monitor-stat-icon {
  font-size: 24px;
  color: #38BDF8;
  font-weight: bold;
}

.equipment-monitor-stat-label {
  font-size: 18px;
  color: #1F2937;
}

.equipment-monitor-stat-value {
  font-size: 36px;
  font-weight: 800;
  line-height: 1;
}

.equipment-monitor-stat-value.primary {
  color: #38BDF8;
}

.equipment-monitor-stat-value.success {
  color: #10B981;
}

/* 内容区域 */
.equipment-monitor-content {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 左侧导航 */
.equipment-monitor-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 72px;
  flex-shrink: 0;
}

.equipment-monitor-nav-btn {
  position: relative;
  background: #38BDF8;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 16px 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 4px;
  white-space: nowrap;
}

.equipment-monitor-nav-btn:hover {
  background: #0EA5E9;
  transform: translateX(-2px);
}

.equipment-monitor-nav-btn.active {
  background: #2563EB;
}

.equipment-monitor-nav-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #EF4444;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  writing-mode: horizontal-tb;
  min-width: 20px;
  text-align: center;
  white-space: nowrap;
}

/* 右侧主区域 */
.equipment-monitor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

/* 顶部设备卡片 */
.equipment-monitor-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  flex-shrink: 0;
}

.equipment-monitor-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 8px;
  overflow: hidden;
}

.equipment-monitor-card.tunnel {
  background: linear-gradient(90deg, #1E5FA8 0%, #4A9FE8 100%);
}

.equipment-monitor-card.横线 {
  background: linear-gradient(90deg, #6BA8D8 0%, #A8D0E8 100%);
}

.equipment-monitor-card-icon {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}

.equipment-monitor-card-icon svg {
  width: 100%;
  height: 100%;
}

.equipment-monitor-card-content {
  flex: 1;
  color: white;
}

.equipment-monitor-card-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.equipment-monitor-card-stats {
  display: flex;
  gap: 20px;
  font-size: 14px;
}

.equipment-monitor-card-stats .value {
  font-size: 28px;
  font-weight: 800;
  margin-left: 4px;
}

.equipment-monitor-card-stats .error {
  font-size: 28px;
  font-weight: 800;
  color: #EF4444;
  margin-left: 4px;
}

.equipment-monitor-card-arrow {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 40px;
  background: linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.1) 50%);
}

/* 设备网格 */
.equipment-monitor-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, min-content);
  gap: 12px;
  overflow-y: auto;
  align-content: start;
  min-height: 0;
  padding-bottom: 4px;
}

.equipment-monitor-device-card {
  background: #D8E0E8;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s;
  cursor: pointer;
  border: 1px solid #C0C8D0;
}

.equipment-monitor-device-card:hover {
  background: #E0E8F0;
  transform: translateY(-2px);
}

.equipment-monitor-device-icon {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.equipment-monitor-icon-base {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%);
  border-radius: 50%;
}

.equipment-monitor-icon-svg {
  position: relative;
  width: 100%;
  height: 100%;
  color: #38BDF8;
}

.equipment-monitor-device-info {
  flex: 1;
  min-width: 0;
}

.equipment-monitor-device-name {
  font-size: 16px;
  font-weight: 500;
  color: #1F2937;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.equipment-monitor-device-count {
  font-size: 18px;
  font-weight: 600;
  color: #38BDF8;
}

.equipment-monitor-device-count .error {
  color: #EF4444;
}

.equipment-monitor-device-count .normal {
  color: #38BDF8;
}

/* 图标组件样式 */
svg.equipment-monitor-icon-svg {
  display: block;
}
</style>