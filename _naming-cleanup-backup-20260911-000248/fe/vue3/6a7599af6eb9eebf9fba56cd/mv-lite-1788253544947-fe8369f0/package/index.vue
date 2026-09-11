<template>
  <div class="mv-lite-1788253544947-fe8369f0">
    <!-- 顶部统计栏 -->
    <div class="top-stats">
      <div class="title">设备监测</div>
      <div class="stats-items">
        <div class="stat-item">
          <span class="icon">≡</span>
          <span class="label">设备类型</span>
          <span class="value primary">28</span>
        </div>
        <div class="stat-item">
          <span class="label">设备总数</span>
          <span class="value primary">68562</span>
        </div>
        <div class="stat-item">
          <span class="label">完好率</span>
          <span class="value success">98%</span>
        </div>
      </div>
    </div>

    <!-- 次级统计卡片区 -->
    <div class="secondary-stats">
      <div class="stat-card gradient-blue">
        <div class="card-icon">
          <div class="icon-tunnel"></div>
        </div>
        <div class="card-content">
          <div class="card-title">膜道设备</div>
          <div class="card-data">
            <span class="label">总数:</span>
            <span class="value">56302</span>
          </div>
          <div class="card-data">
            <span class="label">异常数:</span>
            <span class="value error">5</span>
          </div>
        </div>
        <div class="arrow-decoration"></div>
      </div>

      <div class="stat-card gradient-blue">
        <div class="card-icon">
          <div class="icon-anchor"></div>
        </div>
        <div class="card-content">
          <div class="card-title">南北锚线<br/>设备</div>
          <div class="card-data">
            <span class="label">总数:</span>
            <span class="value">1280</span>
          </div>
          <div class="card-data">
            <span class="label">异常数:</span>
            <span class="value error">3</span>
          </div>
        </div>
        <div class="arrow-decoration"></div>
      </div>
    </div>

    <!-- 主体内容区 -->
    <div class="main-content">
      <!-- 左侧导航栏 -->
      <div class="left-nav">
        <div class="nav-badge">3/3740</div>
        <div
          v-for="(item, index) in navItems"
          :key="index"
          :class="['nav-item', { active: activeNav === index }]"
          @click="activeNav = index"
        >
          <span class="nav-text">{{ item }}</span>
          <span v-if="index === 0" class="nav-count">3</span>
        </div>
      </div>

      <!-- 设备卡片网格区 -->
      <div class="device-grid">
        <div
          v-for="(device, index) in devices"
          :key="index"
          class="device-card"
          @click="handleDeviceClick(device)"
        >
          <div class="device-icon">
            <div :class="['icon-platform', device.iconClass]"></div>
          </div>
          <div class="device-name">{{ device.name }}</div>
          <div class="device-stats">
            <span :class="['abnormal', { error: device.abnormal > 0 }]">{{ device.abnormal }}</span>
            <span class="separator">/</span>
            <span class="total">{{ device.total }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeNav = ref(0)

const navItems = ['监控', '照明', '通风', '供配电', '消防', '交通诱导']

const devices = [
  { name: '摄像机', abnormal: 2, total: 484, iconClass: 'camera' },
  { name: '风速风向仪', abnormal: 1, total: 484, iconClass: 'wind' },
  { name: '超高检测器', abnormal: 0, total: 484, iconClass: 'height' },
  { name: '烟道机器人', abnormal: 0, total: 484, iconClass: 'robot' },
  { name: '激光雷达', abnormal: 0, total: 484, iconClass: 'lidar' },
  { name: 'CO₂传感器', abnormal: 0, total: 484, iconClass: 'co2' },
  { name: 'CO/VI检测器', abnormal: 0, total: 484, iconClass: 'covi' },
  { name: '温湿度传感器', abnormal: 0, total: 484, iconClass: 'temp' },
  { name: '压力传感器', abnormal: 0, total: 484, iconClass: 'pressure' },
  { name: '光照度变送器', abnormal: 0, total: 484, iconClass: 'light' },
  { name: '紧急电话', abnormal: 0, total: 484, iconClass: 'phone' },
  { name: '水质监测设备', abnormal: 0, total: 484, iconClass: 'water' }
]

const handleDeviceClick = (device) => {
  console.log('Device clicked:', device.name)
}
</script>

<style scoped>
.mv-lite-1788253544947-fe8369f0 {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #E8F4FF;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* 顶部统计栏 */
.top-stats {
  background: linear-gradient(to right, #CCE5FF, #E8F4FF);
  border-radius: 8px;
  padding: 15px 25px;
  display: flex;
  align-items: center;
  gap: 40px;
  margin-bottom: 15px;
  position: relative;
}

.top-stats::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
  background: #3399FF;
  border-radius: 8px 0 0 8px;
}

.top-stats .title {
  font-size: 32px;
  font-weight: 700;
  color: #3399FF;
  line-height: 1.2;
}

.stats-items {
  display: flex;
  align-items: center;
  gap: 50px;
  flex: 1;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-item .icon {
  font-size: 24px;
  color: #3399FF;
  font-weight: 700;
}

.stat-item .label {
  font-size: 18px;
  color: #333;
  font-weight: 400;
}

.stat-item .value {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
}

.stat-item .value.primary {
  color: #3399FF;
}

.stat-item .value.success {
  color: #00C896;
}

/* 次级统计卡片区 */
.secondary-stats {
  display: flex;
  gap: 40px;
  margin-bottom: 20px;
}

.stat-card {
  flex: 1;
  background: linear-gradient(135deg, #4DB8FF 0%, #2B8FFF 100%);
  border-radius: 12px;
  padding: 25px;
  display: flex;
  align-items: center;
  gap: 20px;
  position: relative;
  overflow: hidden;
  color: white;
}

.stat-card::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 50px 120px 0;
  border-color: transparent rgba(255, 255, 255, 0.1) transparent transparent;
}

.card-icon {
  width: 80px;
  height: 80px;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-tunnel,
.icon-anchor {
  width: 50px;
  height: 50px;
  background: linear-gradient(135deg, #3399FF, #2B8FFF);
  border-radius: 8px;
}

.card-content {
  flex: 1;
}

.card-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 10px;
  line-height: 1.3;
}

.card-data {
  font-size: 18px;
  margin-bottom: 5px;
}

.card-data .label {
  font-weight: 400;
}

.card-data .value {
  font-size: 28px;
  font-weight: 700;
  margin-left: 8px;
}

.card-data .value.error {
  color: #FF4444;
}

.arrow-decoration {
  position: absolute;
  right: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 30px 0 30px 20px;
  border-color: transparent transparent transparent rgba(255, 255, 255, 0.2);
}

/* 主体内容区 */
.main-content {
  display: flex;
  gap: 20px;
  height: calc(100% - 280px);
}

/* 左侧导航栏 */
.left-nav {
  width: 80px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  position: relative;
}

.nav-badge {
  position: absolute;
  top: -10px;
  left: -10px;
  background: white;
  border: 2px solid #FF4444;
  color: #FF4444;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  z-index: 10;
}

.nav-item {
  background: rgba(255, 255, 255, 0.6);
  border-radius: 10px;
  padding: 15px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  min-height: 80px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.8);
}

.nav-item.active {
  background: #3399FF;
}

.nav-item.active .nav-text {
  color: white;
}

.nav-text {
  font-size: 16px;
  font-weight: 400;
  color: #333;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 2px;
}

.nav-count {
  position: absolute;
  top: 5px;
  right: 5px;
  background: #FF4444;
  color: white;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

/* 设备卡片网格区 */
.device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 25px 30px;
}

.device-card {
  background: white;
  border: 1px solid #CCE5FF;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(51, 153, 255, 0.1);
}

.device-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(51, 153, 255, 0.2);
}

.device-icon {
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-platform {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #4DB8FF, #2B8FFF);
  border-radius: 50%;
  position: relative;
}

.icon-platform::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 30px;
  height: 30px;
  background: white;
  border-radius: 4px;
  opacity: 0.9;
}

.device-name {
  font-size: 16px;
  font-weight: 400;
  color: #333;
  text-align: center;
  line-height: 1.3;
}

.device-stats {
  font-size: 24px;
  font-weight: 700;
  color: #3399FF;
}

.device-stats .abnormal {
  color: #3399FF;
}

.device-stats .abnormal.error {
  color: #FF4444;
}

.device-stats .separator {
  margin: 0 4px;
  color: #999;
  font-weight: 400;
}

.device-stats .total {
  color: #999;
  font-weight: 400;
}
</style>