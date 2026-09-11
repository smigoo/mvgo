<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitor-content">
      <!-- 顶部统计栏 -->
      <div class="c-equipment-monitor-header">
        <span class="c-equipment-monitor-title">设备监测</span>
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
            <span class="c-equipment-monitor-stat-value">98%</span>
          </div>
        </div>
      </div>

      <!-- 主体区域：左侧导航 + 右侧内容 -->
      <div class="c-equipment-monitor-main">
        <!-- 左侧竖排导航 -->
        <div class="c-equipment-monitor-nav">
          <div class="c-equipment-monitor-nav-badge">3/3740</div>
          <button 
            v-for="(item, index) in navItems" 
            :key="index"
            class="c-equipment-monitor-nav-btn"
            :class="{ 'is-active': activeNav === index }"
            @click="activeNav = index"
          >
            <span v-for="(char, i) in item.label.split('')" :key="i" class="c-equipment-monitor-nav-char">{{ char }}</span>
            <span v-if="item.badge" class="c-equipment-monitor-nav-btn-badge">{{ item.badge }}</span>
          </button>
        </div>

        <!-- 右侧内容区 -->
        <div class="c-equipment-monitor-right">
          <!-- 顶部两个汇总卡片 -->
          <div class="c-equipment-monitor-summary">
            <div class="c-equipment-monitor-summary-card c-equipment-monitor-summary-card-primary">
              <div class="c-equipment-monitor-summary-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C10.9 2 10 2.9 10 4V4.29C7.03 5.17 5 7.9 5 11V17L3 19V20H21V19L19 17V11C19 7.9 16.97 5.17 14 4.29V4C14 2.9 13.1 2 12 2Z"/>
                </svg>
              </div>
              <div class="c-equipment-monitor-summary-content">
                <div class="c-equipment-monitor-summary-row">
                  <span class="c-equipment-monitor-summary-label">总数:</span>
                  <span class="c-equipment-monitor-summary-number">56302</span>
                </div>
                <div class="c-equipment-monitor-summary-row">
                  <span class="c-equipment-monitor-summary-text">隧道设备</span>
                  <span class="c-equipment-monitor-summary-label">异常数:</span>
                  <span class="c-equipment-monitor-summary-error">5</span>
                </div>
              </div>
            </div>

            <div class="c-equipment-monitor-summary-card c-equipment-monitor-summary-card-secondary">
              <div class="c-equipment-monitor-summary-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5S21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12S9.24 7 12 7 17 9.24 17 12 14.76 17 12 17ZM12 9C10.34 9 9 10.34 9 12S10.34 15 12 15 15 13.66 15 12 13.66 9 12 9Z"/>
                </svg>
              </div>
              <div class="c-equipment-monitor-summary-content">
                <div class="c-equipment-monitor-summary-row">
                  <span class="c-equipment-monitor-summary-label">总数:</span>
                  <span class="c-equipment-monitor-summary-number">1280</span>
                </div>
                <div class="c-equipment-monitor-summary-row">
                  <span class="c-equipment-monitor-summary-text">南北接线设备</span>
                  <span class="c-equipment-monitor-summary-label">异常数:</span>
                  <span class="c-equipment-monitor-summary-error">3</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 设备网格 -->
          <div class="c-equipment-monitor-grid">
            <div 
              v-for="(device, index) in devices" 
              :key="index"
              class="c-equipment-monitor-card"
              @click="handleDeviceClick(device)"
            >
              <div class="c-equipment-monitor-device-icon">
                <div class="c-equipment-monitor-icon-base"></div>
                <div class="c-equipment-monitor-icon-symbol" v-html="device.icon"></div>
              </div>
              <div class="c-equipment-monitor-device-name">{{ device.name }}</div>
              <div class="c-equipment-monitor-device-status" :class="{ 'is-error': device.error > 0 }">
                ({{ device.error }}/{{ device.total }})
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

const activeNav = ref(0)

const navItems = ref([
  { label: '监控' },
  { label: '照明', badge: 3 },
  { label: '通风' },
  { label: '供配电' },
  { label: '消防' },
  { label: '交通诱导' }
])

const devices = ref([
  { name: '摄像机', icon: '📹', error: 2, total: 484 },
  { name: '风速风向仪', icon: '🌬', error: 1, total: 484 },
  { name: '超高检测器', icon: '📏', error: 0, total: 484 },
  { name: '烟道机器人', icon: '🤖', error: 0, total: 484 },
  { name: '激光雷达', icon: '🎯', error: 0, total: 484 },
  { name: 'CO₂传感器', icon: 'CO₂', error: 0, total: 484 },
  { name: 'CO/VI检测器', icon: '🔵', error: 0, total: 484 },
  { name: '温湿度传感器', icon: '🌡', error: 0, total: 484 },
  { name: '压力传感器', icon: '⚡', error: 0, total: 484 },
  { name: '光照度变送器', icon: '💡', error: 0, total: 484 },
  { name: '紧急电话', icon: '📞', error: 0, total: 484 },
  { name: '水质监测设备', icon: '💧', error: 0, total: 484 }
])

const handleDeviceClick = (device) => {
  console.log('Device clicked:', device)
}
</script>

<style scoped>
/*
 * 高度预算分解（画布 420×425px，面板头占 36px，内容区 389px）：
 * 根容器 padding: 8px × 2 = 16px
 * 可用高度 H = 389 - 16 = 373px
 * header: 28px
 * main: 373 - 28 - 6 = 339px
 *   nav: 339px（撑满）
 *   right: 339px
 *     summary: 62px
 *     grid: 339 - 62 - 6 = 271px
 *       4 行网格，gap 6px，单行高度 = (271 - 3×6) / 4 ≈ 63px
 *       图标 ≈ 28px (63×0.45)，名称字号 ≈ 13px，状态字号 ≈ 12px
 */

.c-equipment-monitor-content {
  width: 100%;
  height: 100%;
  padding: 8px;
  background: #B0BEC5;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}

/* 顶部统计栏 */
.c-equipment-monitor-header {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.c-equipment-monitor-title {
  font-size: 15px;
  font-weight: 600;
  color: #38BDF8;
  white-space: nowrap;
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
  white-space: nowrap;
}

.c-equipment-monitor-stat-icon {
  font-size: 14px;
  color: #38BDF8;
  font-weight: 700;
}

.c-equipment-monitor-stat-label {
  font-size: 12px;
  color: #263238;
}

.c-equipment-monitor-stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #38BDF8;
}

/* 主体区域 */
.c-equipment-monitor-main {
  flex: 1;
  display: flex;
  gap: 0;
  min-height: 0;
}

/* 左侧导航 */
.c-equipment-monitor-nav {
  width: 42px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  position: relative;
}

.c-equipment-monitor-nav-badge {
  position: absolute;
  top: -6px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 9px;
  color: #38BDF8;
  background: #FFFFFF;
  border-radius: 4px;
  padding: 2px 4px;
  font-weight: 600;
  z-index: 1;
}

.c-equipment-monitor-nav-btn {
  flex: 1;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.6) 0%, rgba(56, 189, 248, 0.4) 100%);
  border: none;
  border-radius: 6px;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  letter-spacing: 1px;
  position: relative;
  transition: all 0.2s;
  min-height: 0;
}

.c-equipment-monitor-nav-btn:first-of-type {
  margin-top: 18px;
}

.c-equipment-monitor-nav-btn:hover {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.8) 0%, rgba(56, 189, 248, 0.6) 100%);
  transform: translateX(2px);
}

.c-equipment-monitor-nav-btn.is-active {
  background: linear-gradient(135deg, #38BDF8 0%, #22D3EE 100%);
  box-shadow: 0 2px 8px rgba(56, 189, 248, 0.4);
}

.c-equipment-monitor-nav-char {
  display: block;
  line-height: 1;
}

.c-equipment-monitor-nav-btn-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: #EF4444;
  color: #FFFFFF;
  font-size: 9px;
  font-weight: 700;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* 右侧内容区 */
.c-equipment-monitor-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

/* 顶部汇总卡片 */
.c-equipment-monitor-summary {
  height: 62px;
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.c-equipment-monitor-summary-card {
  flex: 1;
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #FFFFFF;
  cursor: pointer;
  transition: transform 0.2s;
}

.c-equipment-monitor-summary-card:hover {
  transform: translateY(-2px);
}

.c-equipment-monitor-summary-card-primary {
  background: linear-gradient(90deg, #38BDF8 0%, #60A5FA 100%);
}

.c-equipment-monitor-summary-card-secondary {
  background: linear-gradient(90deg, #7DD3FC 0%, #BAE6FD 100%);
}

.c-equipment-monitor-summary-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
}

.c-equipment-monitor-summary-icon svg {
  width: 100%;
  height: 100%;
}

.c-equipment-monitor-summary-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.c-equipment-monitor-summary-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1.2;
}

.c-equipment-monitor-summary-label {
  font-size: 10px;
  opacity: 0.9;
}

.c-equipment-monitor-summary-number {
  font-size: 14px;
  font-weight: 700;
}

.c-equipment-monitor-summary-text {
  font-size: 11px;
  opacity: 0.95;
  margin-right: auto;
}

.c-equipment-monitor-summary-error {
  font-size: 13px;
  font-weight: 700;
  color: #EF4444;
}

/* 设备网格 */
.c-equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
}

.c-equipment-monitor-card {
  background: rgba(227, 242, 253, 0.7);
  border-radius: 8px;
  border: 1px solid rgba(144, 164, 174, 0.3);
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.c-equipment-monitor-card:hover {
  background: rgba(227, 242, 253, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.2);
}

.c-equipment-monitor-device-icon {
  width: 36px;
  height: 36px;
  position: relative;
  flex-shrink: 0;
}

.c-equipment-monitor-icon-base {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 50%, #90CAF9 100%);
  border-radius: 50%;
  box-shadow: 
    0 2px 4px rgba(0, 0, 0, 0.1),
    inset 0 -2px 4px rgba(0, 0, 0, 0.05);
  position: relative;
}

.c-equipment-monitor-icon-base::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 44px;
  height: 6px;
  background: radial-gradient(ellipse at center, rgba(144, 164, 174, 0.3) 0%, transparent 70%);
  border-radius: 50%;
}

.c-equipment-monitor-icon-symbol {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 18px;
  color: #38BDF8;
  font-weight: 600;
}

.c-equipment-monitor-device-name {
  font-size: 12px;
  color: #263238;
  font-weight: 500;
  text-align: center;
  line-height: 1.2;
}

.c-equipment-monitor-device-status {
  font-size: 11px;
  color: #22D3EE;
  font-weight: 600;
}

.c-equipment-monitor-device-status.is-error {
  color: #EF4444;
}
</style>