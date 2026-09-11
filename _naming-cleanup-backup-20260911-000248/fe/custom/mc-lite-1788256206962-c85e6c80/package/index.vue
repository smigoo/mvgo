<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1788256206962-c85e6c80-content">
      <!-- 顶部统计横幅 -->
      <div class="c-mc-lite-1788256206962-c85e6c80-header">
        <div class="c-mc-lite-1788256206962-c85e6c80-title">设备监测</div>
        <div class="c-mc-lite-1788256206962-c85e6c80-stats">
          <div class="c-mc-lite-1788256206962-c85e6c80-stat-item">
            <span class="c-mc-lite-1788256206962-c85e6c80-stat-label">设备类型</span>
            <span class="c-mc-lite-1788256206962-c85e6c80-stat-value">28</span>
          </div>
          <div class="c-mc-lite-1788256206962-c85e6c80-stat-item">
            <span class="c-mc-lite-1788256206962-c85e6c80-stat-label">设备总数</span>
            <span class="c-mc-lite-1788256206962-c85e6c80-stat-value">68562</span>
          </div>
          <div class="c-mc-lite-1788256206962-c85e6c80-stat-item">
            <span class="c-mc-lite-1788256206962-c85e6c80-stat-label">完好率</span>
            <span class="c-mc-lite-1788256206962-c85e6c80-stat-value c-mc-lite-1788256206962-c85e6c80-success">98%</span>
          </div>
        </div>
      </div>

      <!-- 设备统计卡片组 -->
      <div class="c-mc-lite-1788256206962-c85e6c80-summary-cards">
        <div class="c-mc-lite-1788256206962-c85e6c80-arrow-card c-mc-lite-1788256206962-c85e6c80-arrow-card-primary">
          <div class="c-mc-lite-1788256206962-c85e6c80-card-icon">
            <svg viewBox="0 0 40 40" class="c-mc-lite-1788256206962-c85e6c80-icon">
              <circle cx="20" cy="20" r="16" fill="currentColor" opacity="0.3"/>
              <path d="M20 12 L20 28 M14 22 L20 28 L26 22" stroke="currentColor" stroke-width="2" fill="none"/>
            </svg>
          </div>
          <div class="c-mc-lite-1788256206962-c85e6c80-card-content">
            <div class="c-mc-lite-1788256206962-c85e6c80-card-title">隧道设备</div>
            <div class="c-mc-lite-1788256206962-c85e6c80-card-total">
              <span class="c-mc-lite-1788256206962-c85e6c80-label">总 数:</span>
              <span class="c-mc-lite-1788256206962-c85e6c80-number">56302</span>
            </div>
            <div class="c-mc-lite-1788256206962-c85e6c80-card-error">
              <span class="c-mc-lite-1788256206962-c85e6c80-label">异常数:</span>
              <span class="c-mc-lite-1788256206962-c85e6c80-number">5</span>
            </div>
          </div>
        </div>

        <div class="c-mc-lite-1788256206962-c85e6c80-arrow-card c-mc-lite-1788256206962-c85e6c80-arrow-card-secondary">
          <div class="c-mc-lite-1788256206962-c85e6c80-card-icon">
            <svg viewBox="0 0 40 40" class="c-mc-lite-1788256206962-c85e6c80-icon">
              <ellipse cx="20" cy="20" rx="14" ry="8" fill="currentColor" opacity="0.3"/>
              <path d="M10 16 Q20 10 30 16" stroke="currentColor" stroke-width="2" fill="none"/>
            </svg>
          </div>
          <div class="c-mc-lite-1788256206962-c85e6c80-card-content">
            <div class="c-mc-lite-1788256206962-c85e6c80-card-title">南北接线设备</div>
            <div class="c-mc-lite-1788256206962-c85e6c80-card-total">
              <span class="c-mc-lite-1788256206962-c85e6c80-label">总 数:</span>
              <span class="c-mc-lite-1788256206962-c85e6c80-number">1280</span>
            </div>
            <div class="c-mc-lite-1788256206962-c85e6c80-card-error">
              <span class="c-mc-lite-1788256206962-c85e6c80-label">异常数:</span>
              <span class="c-mc-lite-1788256206962-c85e6c80-number">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="c-mc-lite-1788256206962-c85e6c80-main">
        <!-- 左侧导航栏 -->
        <div class="c-mc-lite-1788256206962-c85e6c80-sidebar">
          <div
            v-for="(tab, index) in tabs"
            :key="index"
            :class="[
              'c-mc-lite-1788256206962-c85e6c80-tab',
              { 'c-mc-lite-1788256206962-c85e6c80-tab-active': activeTab === index }
            ]"
            @click="activeTab = index"
          >
            <span class="c-mc-lite-1788256206962-c85e6c80-tab-text">{{ tab.name }}</span>
            <span v-if="tab.badge" class="c-mc-lite-1788256206962-c85e6c80-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 设备卡片网格 -->
        <div class="c-mc-lite-1788256206962-c85e6c80-grid">
          <div
            v-for="(device, index) in devices"
            :key="index"
            class="c-mc-lite-1788256206962-c85e6c80-device-card"
          >
            <div class="c-mc-lite-1788256206962-c85e6c80-device-icon-wrapper">
              <div class="c-mc-lite-1788256206962-c85e6c80-device-icon-base"></div>
              <div class="c-mc-lite-1788256206962-c85e6c80-device-icon">
                <component :is="device.icon" />
              </div>
            </div>
            <div class="c-mc-lite-1788256206962-c85e6c80-device-name">{{ device.name }}</div>
            <div class="c-mc-lite-1788256206962-c85e6c80-device-status">
              <span :class="[
                'c-mc-lite-1788256206962-c85e6c80-status-error',
                { 'c-mc-lite-1788256206962-c85e6c80-status-normal': device.error === 0 }
              ]">{{ device.error }}</span>
              <span class="c-mc-lite-1788256206962-c85e6c80-status-divider">/</span>
              <span class="c-mc-lite-1788256206962-c85e6c80-status-total">{{ device.total }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, h } from 'vue'

const activeTab = ref(0)

const tabs = [
  { name: '监控', badge: '3/3740' },
  { name: '照明', badge: '3' },
  { name: '通风', badge: null },
  { name: '供配电', badge: null },
  { name: '消防', badge: null },
  { name: '交通诱导', badge: null }
]

// 简化的图标组件
const CameraIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('path', { d: 'M4 8h2V6h2V4H6C4.9 4 4 4.9 4 6v2zm12-4v2h2v2h2V6c0-1.1-.9-2-2-2h-2zM4 16v2c0 1.1.9 2 2 2h2v-2H6v-2H4zm14 2v-2h2v-2h-2v2h-2v2h2c1.1 0 2-.9 2-2v2c0 1.1-.9 2-2 2h-2zm-8-4c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4z' })
])

const WindIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('path', { d: 'M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z' })
])

const SensorIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('rect', { x: '8', y: '4', width: '8', height: '16', rx: '2' }),
  h('circle', { cx: '12', cy: '12', r: '3', fill: 'white' })
])

const RobotIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('rect', { x: '6', y: '8', width: '12', height: '10', rx: '2' }),
  h('circle', { cx: '9', cy: '12', r: '1.5', fill: 'white' }),
  h('circle', { cx: '15', cy: '12', r: '1.5', fill: 'white' }),
  h('path', { d: 'M12 4V8', stroke: 'white', 'stroke-width': '2' })
])

const RadarIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('circle', { cx: '12', cy: '12', r: '8', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }),
  h('path', { d: 'M12 4L16 16L8 12L12 4Z' })
])

const CO2Icon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('text', { x: '12', y: '16', 'text-anchor': 'middle', 'font-size': '10', fill: 'white', 'font-weight': 'bold' }, 'CO₂')
])

const COIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('text', { x: '12', y: '16', 'text-anchor': 'middle', 'font-size': '10', fill: 'white', 'font-weight': 'bold' }, 'CO')
])

const TempIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('path', { d: 'M15 6v8c1.1.5 2 1.5 2 3 0 1.7-1.3 3-3 3s-3-1.3-3-3c0-1.5.9-2.5 2-3V6h2z' }),
  h('rect', { x: '13', y: '3', width: '2', height: '11', rx: '1' })
])

const PressureIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('circle', { cx: '12', cy: '12', r: '8' }),
  h('path', { d: 'M12 8v8M8 12h8', stroke: 'white', 'stroke-width': '2' })
])

const LightIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('circle', { cx: '12', cy: '12', r: '4' }),
  h('path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12', stroke: 'currentColor', 'stroke-width': '2' })
])

const PhoneIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('path', { d: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z' })
])

const WaterIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
  h('path', { d: 'M12 2.69l5.66 5.66a8 8 0 11-11.31 0z' })
])

const devices = [
  { name: '摄像机', error: 2, total: 484, icon: CameraIcon },
  { name: '风速风向仪', error: 1, total: 484, icon: WindIcon },
  { name: '超高检测器', error: 0, total: 484, icon: SensorIcon },
  { name: '烟道机器人', error: 0, total: 484, icon: RobotIcon },
  { name: '激光雷达', error: 0, total: 484, icon: RadarIcon },
  { name: 'CO₂传感器', error: 0, total: 484, icon: CO2Icon },
  { name: 'CO/VI检测器', error: 0, total: 484, icon: COIcon },
  { name: '温湿度传感器', error: 0, total: 484, icon: TempIcon },
  { name: '压力传感器', error: 0, total: 484, icon: PressureIcon },
  { name: '光照度变送器', error: 0, total: 484, icon: LightIcon },
  { name: '紧急电话', error: 0, total: 484, icon: PhoneIcon },
  { name: '水质监测设备', error: 0, total: 484, icon: WaterIcon }
]
</script>

<style scoped>
.c-mc-lite-1788256206962-c85e6c80-content {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #B8C5D0 0%, #A8B5C0 100%);
  padding: 12px 16px;
  color: #2C3E50;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* 顶部统计横幅 */
.c-mc-lite-1788256206962-c85e6c80-header {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 12px;
}

.c-mc-lite-1788256206962-c85e6c80-title {
  font-size: 24px;
  font-weight: 700;
  color: #38BDF8;
}

.c-mc-lite-1788256206962-c85e6c80-stats {
  display: flex;
  gap: 32px;
  flex: 1;
}

.c-mc-lite-1788256206962-c85e6c80-stat-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.c-mc-lite-1788256206962-c85e6c80-stat-label {
  font-size: 14px;
  color: #2C3E50;
}

.c-mc-lite-1788256206962-c85e6c80-stat-value {
  font-size: 36px;
  font-weight: 700;
  color: #38BDF8;
}

.c-mc-lite-1788256206962-c85e6c80-stat-value.c-mc-lite-1788256206962-c85e6c80-success {
  color: #22D3EE;
}

/* 设备统计卡片组 */
.c-mc-lite-1788256206962-c85e6c80-summary-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

.c-mc-lite-1788256206962-c85e6c80-arrow-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.c-mc-lite-1788256206962-c85e6c80-arrow-card::after {
  content: '';
  position: absolute;
  right: -20px;
  top: 0;
  bottom: 0;
  width: 60px;
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 100%);
  clip-path: polygon(30% 0, 100% 50%, 30% 100%, 0 100%, 70% 50%, 0 0);
}

.c-mc-lite-1788256206962-c85e6c80-arrow-card-primary {
  background: linear-gradient(135deg, #2B8FC9 0%, #38BDF8 100%);
  color: white;
}

.c-mc-lite-1788256206962-c85e6c80-arrow-card-secondary {
  background: linear-gradient(135deg, #6BB5DD 0%, #A0D8F0 100%);
  color: #2C3E50;
}

.c-mc-lite-1788256206962-c85e6c80-card-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  flex-shrink: 0;
}

.c-mc-lite-1788256206962-c85e6c80-icon {
  width: 28px;
  height: 28px;
  color: white;
}

.c-mc-lite-1788256206962-c85e6c80-card-content {
  flex: 1;
}

.c-mc-lite-1788256206962-c85e6c80-card-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.c-mc-lite-1788256206962-c85e6c80-card-total,
.c-mc-lite-1788256206962-c85e6c80-card-error {
  font-size: 13px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.c-mc-lite-1788256206962-c85e6c80-card-total .c-mc-lite-1788256206962-c85e6c80-number {
  font-size: 24px;
  font-weight: 700;
}

.c-mc-lite-1788256206962-c85e6c80-card-error .c-mc-lite-1788256206962-c85e6c80-number {
  font-size: 20px;
  font-weight: 700;
  color: #FF4444;
}

.c-mc-lite-1788256206962-c85e6c80-arrow-card-secondary .c-mc-lite-1788256206962-c85e6c80-card-error .c-mc-lite-1788256206962-c85e6c80-number {
  color: #FF4444;
}

/* 主内容区域 */
.c-mc-lite-1788256206962-c85e6c80-main {
  display: flex;
  gap: 8px;
  height: calc(100% - 140px);
}

/* 左侧导航栏 */
.c-mc-lite-1788256206962-c85e6c80-sidebar {
  width: 56px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.c-mc-lite-1788256206962-c85e6c80-tab {
  position: relative;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-mc-lite-1788256206962-c85e6c80-tab:hover {
  background: rgba(255, 255, 255, 0.5);
}

.c-mc-lite-1788256206962-c85e6c80-tab-active {
  background: #38BDF8;
  color: white;
}

.c-mc-lite-1788256206962-c85e6c80-tab-text {
  font-size: 14px;
  font-weight: 500;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 2px;
}

.c-mc-lite-1788256206962-c85e6c80-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: #FF4444;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
  min-width: 18px;
  text-align: center;
}

/* 设备卡片网格 */
.c-mc-lite-1788256206962-c85e6c80-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 12px;
  overflow: hidden;
}

.c-mc-lite-1788256206962-c85e6c80-device-card {
  background: rgba(184, 197, 208, 0.6);
  border: 1px solid rgba(139, 150, 163, 0.4);
  border-radius: 10px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.c-mc-lite-1788256206962-c85e6c80-device-card:hover {
  background: rgba(184, 197, 208, 0.8);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.c-mc-lite-1788256206962-c85e6c80-device-icon-wrapper {
  position: relative;
  width: 48px;
  height: 48px;
}

.c-mc-lite-1788256206962-c85e6c80-device-icon-base {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 44px;
  height: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 100%);
  border-radius: 50%;
  filter: blur(2px);
}

.c-mc-lite-1788256206962-c85e6c80-device-icon {
  position: absolute;
  top: 0;
  left: 0;
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #38BDF8 0%, #22D3EE 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.4);
  color: white;
}

.c-mc-lite-1788256206962-c85e6c80-device-icon svg {
  width: 24px;
  height: 24px;
}

.c-mc-lite-1788256206962-c85e6c80-device-name {
  font-size: 13px;
  font-weight: 500;
  color: #2C3E50;
  text-align: center;
  line-height: 1.4;
}

.c-mc-lite-1788256206962-c85e6c80-device-status {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-mc-lite-1788256206962-c85e6c80-status-error {
  color: #FF4444;
}

.c-mc-lite-1788256206962-c85e6c80-status-normal {
  color: #22D3EE;
}

.c-mc-lite-1788256206962-c85e6c80-status-divider {
  color: #8B96A3;
}

.c-mc-lite-1788256206962-c85e6c80-status-total {
  color: #22D3EE;
}
</style>