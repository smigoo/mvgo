<template>
  <div class="device-monitor">
    <!-- 顶部标题统计行 -->
    <div class="header">
      <div class="title">设备监测</div>
      <div class="stats">
        <div class="stat-item">
          <span class="icon-list"></span>
          <span class="label">设备类型</span>
          <span class="value">28</span>
        </div>
        <div class="stat-item">
          <span class="label">设备总数</span>
          <span class="value">68562</span>
        </div>
        <div class="stat-item">
          <span class="label">完好率</span>
          <span class="value">98%</span>
        </div>
      </div>
    </div>

    <!-- 汇总卡区域 -->
    <div class="summary-cards">
      <div class="card tunnel-card active">
        <div class="card-left">
          <div class="icon-wrapper">
            <span class="icon-tunnel"></span>
          </div>
          <div class="card-label">隧道设备</div>
        </div>
        <div class="card-right">
          <div class="card-stat">总　数:<span class="num">56302</span></div>
          <div class="card-stat">异常数:<span class="num error">5</span></div>
        </div>
      </div>
      <div class="card junction-card">
        <div class="card-left">
          <div class="icon-wrapper">
            <span class="icon-junction"></span>
          </div>
          <div class="card-label">
            <div>南北接线</div>
            <div>设备</div>
          </div>
        </div>
        <div class="card-right">
          <div class="card-stat">总　数:<span class="num">1280</span></div>
          <div class="card-stat">异常数:<span class="num error">3</span></div>
        </div>
      </div>
    </div>

    <!-- 主体内容区 -->
    <div class="main-content">
      <!-- 左侧竖排Tab导航 -->
      <div class="tab-nav">
        <div
          v-for="(tab, index) in tabs"
          :key="index"
          :class="['tab-item', { active: activeTab === index }]"
          @click="activeTab = index"
        >
          <div v-if="activeTab === index && index === 0" class="tab-badge">3/3740</div>
          <span class="tab-text">{{ tab }}</span>
          <span v-if="index === 1" class="red-badge">3</span>
        </div>
      </div>

      <!-- 设备指标网格区 -->
      <div class="device-grid">
        <div
          v-for="(device, index) in devices"
          :key="index"
          class="device-item"
          @click="handleDeviceClick(device)"
        >
          <div class="device-icon">
            <div class="icon-base"></div>
            <span :class="['device-symbol', `icon-${device.type}`]"></span>
          </div>
          <div class="device-info">
            <div class="device-name">{{ device.name }}</div>
            <div class="device-count">
              (<span :class="{ error: device.error > 0 }">{{ device.error }}</span>/<span class="total">{{ device.total }}</span>)
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeTab = ref(0)
const tabs = ['监控', '照明', '通风', '供配电', '消防', '交通诱导']

const devices = ref([
  { name: '摄像机', error: 2, total: 484, type: 'camera' },
  { name: '风速风向仪', error: 1, total: 484, type: 'wind' },
  { name: '超高检测器', error: 0, total: 484, type: 'height' },
  { name: '烟道机器人', error: 0, total: 484, type: 'robot' },
  { name: '激光雷达', error: 0, total: 484, type: 'lidar' },
  { name: 'CO₂传感器', error: 0, total: 484, type: 'co2' },
  { name: 'CO/VI检测器', error: 0, total: 484, type: 'covi' },
  { name: '温湿度传感器', error: 0, total: 484, type: 'temp' },
  { name: '压力传感器', error: 0, total: 484, type: 'pressure' },
  { name: '光照度变送器', error: 0, total: 484, type: 'light' },
  { name: '紧急电话', error: 0, total: 484, type: 'phone' },
  { name: '水质监测设备', error: 0, total: 484, type: 'water' }
])

const handleDeviceClick = (device) => {
  console.log('Device clicked:', device)
}
</script>

<style scoped>
.device-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #1B2430;
  color: #FFFFFF;
  padding: 16px 20px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 顶部标题统计行 */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 4px;
  margin-bottom: 12px;
}

.title {
  font-size: 32px;
  font-weight: bold;
  color: #2E9CF6;
}

.stats {
  display: flex;
  gap: 32px;
  align-items: center;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-list {
  display: inline-block;
  width: 16px;
  height: 16px;
  background: #2E9CF6;
  border-radius: 2px;
  position: relative;
}

.icon-list::before,
.icon-list::after {
  content: '';
  position: absolute;
  background: #1B2430;
  border-radius: 1px;
}

.icon-list::before {
  width: 2px;
  height: 10px;
  left: 3px;
  top: 3px;
}

.icon-list::after {
  width: 8px;
  height: 2px;
  right: 2px;
  top: 7px;
}

.stat-item .label {
  font-size: 18px;
  color: #FFFFFF;
  opacity: 0.8;
}

.stat-item .value {
  font-size: 32px;
  font-weight: bold;
  color: #2E9CF6;
}

/* 汇总卡区域 */
.summary-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-radius: 8px;
  cursor: pointer;
}

.tunnel-card {
  flex: 1;
  background: linear-gradient(90deg, #2E9CF6 0%, #1E7AC6 100%);
  position: relative;
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
}

.tunnel-card::before {
  content: '';
  position: absolute;
  left: 120px;
  top: 10px;
  bottom: 10px;
  width: 1px;
  background: rgba(255, 255, 255, 0.3);
}

.junction-card {
  width: 42%;
  background: rgba(42, 53, 66, 0.4);
  border: 1px solid #3C4A5A;
  position: relative;
}

.junction-card::before,
.junction-card::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border: 1px solid #3C4A5A;
}

.junction-card::before {
  top: -1px;
  right: -1px;
  border-left: none;
  border-bottom: none;
}

.junction-card::after {
  bottom: -1px;
  right: -1px;
  border-left: none;
  border-top: none;
}

.card-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-tunnel,
.icon-junction {
  display: inline-block;
  width: 28px;
  height: 28px;
  background: #FFFFFF;
  border-radius: 4px;
}

.card-label {
  font-size: 18px;
  line-height: 1.3;
}

.card-right {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-stat {
  font-size: 18px;
  text-align: right;
}

.card-stat .num {
  font-size: 28px;
  font-weight: bold;
  margin-left: 8px;
}

.card-stat .num.error {
  color: #FF4D4F;
}

/* 主体内容区 */
.main-content {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

/* 左侧Tab导航 */
.tab-nav {
  width: 88px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tab-item {
  position: relative;
  padding: 12px 8px;
  background: rgba(42, 53, 66, 0.4);
  border-radius: 6px;
  cursor: pointer;
  writing-mode: vertical-rl;
  text-align: center;
  font-size: 17px;
  transition: all 0.3s;
}

.tab-item:hover {
  background: rgba(46, 156, 246, 0.2);
}

.tab-item.active {
  background: rgba(46, 156, 246, 0.3);
  color: #2E9CF6;
  font-weight: bold;
  border-left: 3px solid #2E9CF6;
}

.tab-text {
  letter-spacing: 2px;
}

.tab-badge {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: #2E9CF6;
  color: #FFFFFF;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 13px;
  white-space: nowrap;
  writing-mode: horizontal-tb;
}

.red-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #FF4D4F;
  color: #FFFFFF;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  writing-mode: horizontal-tb;
}

/* 设备指标网格区 */
.device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 14px;
  min-height: 0;
}

.device-item {
  background: rgba(42, 53, 66, 0.4);
  border: 1px solid rgba(60, 74, 90, 0.6);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.device-item:hover {
  background: rgba(46, 156, 246, 0.1);
  border-color: #2E9CF6;
}

.device-icon {
  position: relative;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-base {
  position: absolute;
  bottom: 0;
  width: 56px;
  height: 16px;
  background: radial-gradient(ellipse at center, rgba(46, 156, 246, 0.4) 0%, transparent 70%);
  border-radius: 50%;
}

.device-symbol {
  display: inline-block;
  width: 36px;
  height: 36px;
  background: #2E9CF6;
  border-radius: 6px;
  position: relative;
  z-index: 1;
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-name {
  font-size: 18px;
  line-height: 1.4;
  margin-bottom: 4px;
}

.device-count {
  font-size: 18px;
  color: #00D9D9;
}

.device-count .error {
  color: #FF4D4F;
}

.device-count .total {
  color: #2E9CF6;
}
</style>