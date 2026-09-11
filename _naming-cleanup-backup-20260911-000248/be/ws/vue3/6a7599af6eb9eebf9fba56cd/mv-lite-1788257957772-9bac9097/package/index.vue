<template>
  <div class="equipment-monitor">
    <!-- 顶部统计横幅 -->
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
        <span class="equipment-monitor-header-value highlight">98%</span>
      </div>
    </div>

    <!-- 异常设备统计卡片组 -->
    <div class="equipment-monitor-stats">
      <div class="equipment-monitor-stats-card card-left">
        <div class="equipment-monitor-stats-icon">
          <div class="icon-tunnel"></div>
        </div>
        <div class="equipment-monitor-stats-content">
          <div class="equipment-monitor-stats-title">隧道设备</div>
          <div class="equipment-monitor-stats-row">
            <span class="label">总</span>
            <span class="label-space">数:</span>
            <span class="value">56302</span>
          </div>
          <div class="equipment-monitor-stats-row">
            <span class="label">异常数:</span>
            <span class="value error">5</span>
          </div>
        </div>
      </div>
      <div class="equipment-monitor-stats-card card-right">
        <div class="equipment-monitor-stats-icon">
          <div class="icon-line"></div>
        </div>
        <div class="equipment-monitor-stats-content">
          <div class="equipment-monitor-stats-title">雨北横线<br/>设备</div>
          <div class="equipment-monitor-stats-row">
            <span class="label">总</span>
            <span class="label-space">数:</span>
            <span class="value">1280</span>
          </div>
          <div class="equipment-monitor-stats-row">
            <span class="label">异常数:</span>
            <span class="value error">3</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容区域：左侧导航 + 设备网格 -->
    <div class="equipment-monitor-main">
      <!-- 左侧垂直导航栏 -->
      <div class="equipment-monitor-sidebar">
        <div
          v-for="(tab, index) in tabs"
          :key="index"
          class="equipment-monitor-sidebar-tab"
          :class="{ active: activeTab === index }"
          @click="activeTab = index"
        >
          <span class="tab-text">{{ tab.label }}</span>
          <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
        </div>
      </div>

      <!-- 设备类型网格 -->
      <div class="equipment-monitor-grid">
        <div
          v-for="(device, index) in devices"
          :key="index"
          class="equipment-monitor-grid-card"
        >
          <div class="equipment-monitor-grid-icon">
            <div :class="['device-icon', `device-icon-${index + 1}`]"></div>
          </div>
          <div class="equipment-monitor-grid-name">{{ device.name }}</div>
          <div class="equipment-monitor-grid-stats">
            <span class="stats-error">{{ device.error }}</span>
            <span class="stats-separator">/</span>
            <span class="stats-total">{{ device.total }}</span>
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
  { label: '监控', badge: 3 },
  { label: '照明' },
  { label: '通风' },
  { label: '供配电' },
  { label: '消防' },
  { label: '交通诱导' }
]

const devices = [
  { name: '摄像机', error: 2, total: 484 },
  { name: '风速风向仪', error: 1, total: 484 },
  { name: '超高检测器', error: 0, total: 484 },
  { name: '烟道机器人', error: 0, total: 484 },
  { name: '激光雷达', error: 0, total: 484 },
  { name: 'CO₂传感器', error: 0, total: 484 },
  { name: 'CO/VI检测器', error: 0, total: 484 },
  { name: '温湿度传感器', error: 0, total: 484 },
  { name: '压力传感器', error: 0, total: 484 },
  { name: '光照度变送器', error: 0, total: 484 },
  { name: '紧急电话', error: 0, total: 484 },
  { name: '水质监测设备', error: 0, total: 484 }
]
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #A8B2BC;
  padding: 10px;
  overflow-y: auto;
  min-height: 0;
}

/* 顶部统计横幅 */
.equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 12px;
}

.equipment-monitor-header-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.equipment-monitor-header-label {
  font-size: 16px;
  font-weight: 400;
  color: #1F2937;
}

.equipment-monitor-header-icon {
  font-size: 18px;
  font-weight: 600;
  color: #38BDF8;
}

.equipment-monitor-header-value {
  font-size: 24px;
  font-weight: 600;
  color: #38BDF8;
}

.equipment-monitor-header-value.highlight {
  color: #4FD1C5;
}

/* 异常设备统计卡片组 */
.equipment-monitor-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.equipment-monitor-stats-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  position: relative;
}

.equipment-monitor-stats-card.card-left {
  background: linear-gradient(90deg, #3B9EF8 0%, #6BB8F9 100%);
  clip-path: polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%);
}

.equipment-monitor-stats-card.card-right {
  background: linear-gradient(90deg, #6BB8F9 0%, #9AD4FB 100%);
  clip-path: polygon(8% 0, 100% 0, 100% 100%, 8% 100%, 0 50%);
}

.equipment-monitor-stats-icon {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-tunnel,
.icon-line {
  width: 28px;
  height: 28px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 50%;
}

.equipment-monitor-stats-content {
  flex: 1;
  color: #FFFFFF;
}

.equipment-monitor-stats-title {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  line-height: 1.2;
}

.equipment-monitor-stats-row {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin-bottom: 2px;
}

.equipment-monitor-stats-row .label {
  font-size: 11px;
  font-weight: 400;
}

.equipment-monitor-stats-row .label-space {
  font-size: 11px;
  font-weight: 400;
  margin-right: 2px;
}

.equipment-monitor-stats-row .value {
  font-size: 18px;
  font-weight: 600;
}

.equipment-monitor-stats-row .value.error {
  color: #F97316;
}

/* 主内容区域 */
.equipment-monitor-main {
  display: flex;
  gap: 0;
  min-height: 0;
}

/* 左侧垂直导航栏 */
.equipment-monitor-sidebar {
  width: 48px;
  background: rgba(59, 158, 248, 0.5);
  border-radius: 8px;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  align-self: flex-start;
}

.equipment-monitor-sidebar-tab {
  padding: 10px 6px;
  font-size: 13px;
  font-weight: 400;
  color: #1F2937;
  text-align: center;
  cursor: pointer;
  position: relative;
  border-radius: 4px;
  margin: 0 4px;
  line-height: 1.3;
  word-break: break-all;
}

.equipment-monitor-sidebar-tab.active {
  background: rgba(59, 130, 246, 0.8);
  color: #FFFFFF;
}

.equipment-monitor-sidebar-tab .tab-text {
  display: block;
}

.equipment-monitor-sidebar-tab .tab-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  background: #EF4444;
  color: #FFFFFF;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* 设备类型网格 */
.equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, min-content);
  gap: 12px;
  padding-left: 12px;
  overflow-y: auto;
  min-height: 0;
  align-content: start;
}

.equipment-monitor-grid-card {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.equipment-monitor-grid-icon {
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.device-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #38BDF8 0%, #22D3EE 100%);
  border-radius: 50%;
  position: relative;
}

.device-icon::before {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 44px;
  height: 6px;
  background: rgba(56, 189, 248, 0.2);
  border-radius: 50%;
}

.equipment-monitor-grid-name {
  font-size: 12px;
  font-weight: 400;
  color: #1F2937;
  text-align: center;
  line-height: 1.3;
  min-height: 28px;
  display: flex;
  align-items: center;
}

.equipment-monitor-grid-stats {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.stats-error {
  color: #EF4444;
}

.stats-separator {
  color: #38BDF8;
  font-weight: 400;
}

.stats-total {
  color: #38BDF8;
}
</style>