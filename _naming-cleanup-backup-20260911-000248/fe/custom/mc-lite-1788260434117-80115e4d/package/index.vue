<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitor-content">
      <!-- 顶部统计区 -->
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
            <span class="c-equipment-monitor-stat-value c-equipment-monitor-rate">98%</span>
          </div>
        </div>
      </div>

      <!-- 箭头统计卡片区 -->
      <div class="c-equipment-monitor-cards">
        <div class="c-equipment-monitor-arrow-card c-equipment-monitor-card-primary">
          <div class="c-equipment-monitor-card-icon">
            <span class="c-equipment-monitor-icon-bell">🔔</span>
          </div>
          <div class="c-equipment-monitor-card-content">
            <div class="c-equipment-monitor-card-row">
              <span class="c-equipment-monitor-card-total">总    数:</span>
              <span class="c-equipment-monitor-card-number">56302</span>
            </div>
            <div class="c-equipment-monitor-card-row">
              <span class="c-equipment-monitor-card-label">隧道设备</span>
              <span class="c-equipment-monitor-card-abnormal">异常数:<span class="c-equipment-monitor-error">5</span></span>
            </div>
          </div>
        </div>
        <div class="c-equipment-monitor-arrow-card c-equipment-monitor-card-secondary">
          <div class="c-equipment-monitor-card-icon">
            <span class="c-equipment-monitor-icon-eye">👁</span>
          </div>
          <div class="c-equipment-monitor-card-content">
            <div class="c-equipment-monitor-card-row">
              <span class="c-equipment-monitor-card-total">总    数:</span>
              <span class="c-equipment-monitor-card-number">1280</span>
            </div>
            <div class="c-equipment-monitor-card-row">
              <span class="c-equipment-monitor-card-label">雨北横线设备</span>
              <span class="c-equipment-monitor-card-abnormal">异常数:<span class="c-equipment-monitor-error">3</span></span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主内容区：左侧导航 + 设备网格 -->
      <div class="c-equipment-monitor-main">
        <!-- 左侧导航栏 -->
        <div class="c-equipment-monitor-nav">
          <div 
            v-for="(item, index) in navItems" 
            :key="index"
            class="c-equipment-monitor-nav-btn"
            :class="{ 'c-equipment-monitor-nav-active': item.active }"
            @click="handleNavClick(item)"
          >
            <span class="c-equipment-monitor-nav-text">{{ item.label }}</span>
            <span v-if="item.badge" class="c-equipment-monitor-nav-badge">{{ item.badge }}</span>
          </div>
        </div>

        <!-- 设备网格区 -->
        <div class="c-equipment-monitor-grid-wrapper">
          <div class="c-equipment-monitor-badge-overlay">3/3740</div>
          <div class="c-equipment-monitor-grid">
            <div 
              v-for="(device, index) in devices" 
              :key="index"
              class="c-equipment-monitor-device-card"
            >
              <div class="c-equipment-monitor-device-icon">
                <div class="c-equipment-monitor-icon-base"></div>
                <div class="c-equipment-monitor-icon-symbol" v-html="device.icon"></div>
              </div>
              <div class="c-equipment-monitor-device-name">{{ device.name }}</div>
              <div 
                class="c-equipment-monitor-device-status"
                :class="{ 'c-equipment-monitor-status-error': device.abnormal > 0 }"
              >
                ({{ device.abnormal }}/484)
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

const navItems = ref([
  { label: '监控', active: true, badge: 3 },
  { label: '照明', active: false, badge: 3 },
  { label: '通风', active: false },
  { label: '供配电', active: false },
  { label: '消防', active: false },
  { label: '交通诱导', active: false }
])

const devices = ref([
  { name: '摄像机', abnormal: 2, icon: '📹' },
  { name: '风速风向仪', abnormal: 1, icon: '🌪' },
  { name: '超高检测器', abnormal: 0, icon: '📏' },
  { name: '烟道机器人', abnormal: 0, icon: '🤖' },
  { name: '激光雷达', abnormal: 0, icon: '🎯' },
  { name: 'CO₂传感器', abnormal: 0, icon: '💨' },
  { name: 'CO/VI检测器', abnormal: 0, icon: '🔬' },
  { name: '温湿度传感器', abnormal: 0, icon: '🌡' },
  { name: '压力传感器', abnormal: 0, icon: '⚙️' },
  { name: '光照度变送器', abnormal: 0, icon: '💡' },
  { name: '紧急电话', abnormal: 0, icon: '📞' },
  { name: '水质监测设备', abnormal: 0, icon: '💧' }
])

const handleNavClick = (item) => {
  navItems.value.forEach(nav => nav.active = false)
  item.active = true
}
</script>

<style scoped>
/*
高度预算分解：
可用高度 H = 389px
根容器 padding = 12px × 2 = 24px
实际可用 = 389 - 24 = 365px
- header: 24px
- cards: 64px
- gap1: 6px
- main区域 = 365 - 24 - 64 - 6 = 271px
  - nav按钮 = 271px ÷ 6 = 45.17px → 取45px，字号10px竖排4字 = 40px < 45px ✓
  - grid: 3列×4行，间距8px
    行高 = (271 - 3×8) / 4 = 61.75px → 取61px
    图标 ≤ 61×0.4 = 24.4px → 取24px
    名称字号 ≤ 61×0.18 = 11px
    状态字号 ≤ 61×0.22 = 13.4px → 取13px
*/

.c-equipment-monitor-content {
  width: 100%;
  height: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #B8C3CE 0%, #D4DCE4 100%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}

/* 顶部统计区 */
.c-equipment-monitor-header {
  height: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.c-equipment-monitor-title {
  font-size: 15px;
  font-weight: 600;
  color: #3B9EFF;
}

.c-equipment-monitor-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.c-equipment-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #5A6670;
}

.c-equipment-monitor-stat-icon {
  font-size: 14px;
  font-weight: 700;
  color: #3B9EFF;
}

.c-equipment-monitor-stat-label {
  font-weight: 400;
}

.c-equipment-monitor-stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #3B9EFF;
}

.c-equipment-monitor-rate {
  color: #00D9B8;
}

/* 箭头卡片区 */
.c-equipment-monitor-cards {
  height: 64px;
  display: flex;
  gap: 10px;
}

.c-equipment-monitor-arrow-card {
  flex: 1;
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  overflow: hidden;
}

.c-equipment-monitor-arrow-card::after {
  content: '';
  position: absolute;
  right: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-left: 16px solid currentColor;
  border-top: 32px solid transparent;
  border-bottom: 32px solid transparent;
  opacity: 0.3;
}

.c-equipment-monitor-card-primary {
  background: linear-gradient(135deg, #2E7DBF 0%, #3B9EFF 100%);
  color: #2E7DBF;
}

.c-equipment-monitor-card-secondary {
  background: linear-gradient(135deg, #7EC8E3 0%, #A8D8E8 100%);
  color: #5BA7C4;
}

.c-equipment-monitor-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.c-equipment-monitor-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-equipment-monitor-card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #FFFFFF;
}

.c-equipment-monitor-card-total {
  font-weight: 400;
}

.c-equipment-monitor-card-number {
  font-size: 18px;
  font-weight: 700;
}

.c-equipment-monitor-card-label {
  font-weight: 400;
  font-size: 10px;
}

.c-equipment-monitor-card-abnormal {
  font-size: 10px;
  font-weight: 400;
  margin-left: auto;
}

.c-equipment-monitor-error {
  color: #FF4757;
  font-weight: 700;
  font-size: 12px;
}

/* 主内容区 */
.c-equipment-monitor-main {
  flex: 1;
  display: flex;
  gap: 0;
  min-height: 0;
  overflow: hidden;
}

/* 左侧导航栏 */
.c-equipment-monitor-nav {
  width: 38px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.c-equipment-monitor-nav-btn {
  height: 45px;
  border-radius: 4px;
  background: rgba(212, 220, 228, 0.6);
  border: 1px solid rgba(160, 173, 184, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
}

.c-equipment-monitor-nav-btn:hover {
  background: rgba(59, 158, 255, 0.15);
  transform: translateX(2px);
}

.c-equipment-monitor-nav-active {
  background: rgba(59, 158, 255, 0.35);
  border-color: rgba(59, 158, 255, 0.5);
}

.c-equipment-monitor-nav-text {
  writing-mode: vertical-rl;
  font-size: 10px;
  font-weight: 500;
  color: #5A6670;
  letter-spacing: 2px;
}

.c-equipment-monitor-nav-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #FF4757;
  color: #FFFFFF;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 设备网格区 */
.c-equipment-monitor-grid-wrapper {
  flex: 1;
  position: relative;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.c-equipment-monitor-badge-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  background: #FFFFFF;
  border: 2px solid #FF4757;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  color: #FF4757;
  z-index: 10;
}

.c-equipment-monitor-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
  height: 100%;
  align-content: start;
}

.c-equipment-monitor-device-card {
  background: rgba(212, 220, 228, 0.5);
  border: 1px solid rgba(160, 173, 184, 0.4);
  border-radius: 5px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.2s;
  cursor: pointer;
}

.c-equipment-monitor-device-card:hover {
  background: rgba(255, 255, 255, 0.7);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.c-equipment-monitor-device-icon {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-equipment-monitor-icon-base {
  position: absolute;
  bottom: 0;
  width: 20px;
  height: 4px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.8) 0%, rgba(200, 210, 220, 0.4) 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.c-equipment-monitor-icon-symbol {
  position: relative;
  font-size: 18px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
  z-index: 1;
}

.c-equipment-monitor-device-name {
  font-size: 11px;
  font-weight: 400;
  color: #5A6670;
  text-align: center;
  line-height: 1.2;
}

.c-equipment-monitor-device-status {
  font-size: 13px;
  font-weight: 600;
  color: #3B9EFF;
}

.c-equipment-monitor-status-error {
  color: #FF4757;
}
</style>