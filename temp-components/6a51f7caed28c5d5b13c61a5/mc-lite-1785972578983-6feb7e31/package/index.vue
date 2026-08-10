<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1785972578983-6feb7e31-content">
      <!-- 顶部统计栏 -->
      <div class="c-mc-lite-1785972578983-6feb7e31-header">
        <div class="c-mc-lite-1785972578983-6feb7e31-title-group">
          <img src="../resources/images/g-8421.png" class="title-deco-icon" />
          <span class="c-mc-lite-1785972578983-6feb7e31-main-title">设备监测</span>
        </div>
        <div class="c-mc-lite-1785972578983-6feb7e31-stats-group">
          <div class="c-mc-lite-1785972578983-6feb7e31-stat-item">
            <img src="../resources/images/g-8421.png" class="c-mc-lite-1785972578983-6feb7e31-stat-icon" />
            <span class="c-mc-lite-1785972578983-6feb7e31-stat-label">设备类型</span>
            <span class="c-mc-lite-1785972578983-6feb7e31-stat-value blue">28</span>
          </div>
          <div class="c-mc-lite-1785972578983-6feb7e31-stat-item">
            <span class="c-mc-lite-1785972578983-6feb7e31-stat-label">设备总数</span>
            <span class="c-mc-lite-1785972578983-6feb7e31-stat-value blue">68562</span>
          </div>
          <div class="c-mc-lite-1785972578983-6feb7e31-stat-item">
            <span class="c-mc-lite-1785972578983-6feb7e31-stat-label">完好率</span>
            <span class="c-mc-lite-1785972578983-6feb7e31-stat-value green">98%</span>
          </div>
        </div>
        <img src="../resources/images/Frame-8856.png" class="header-action-icon" />
      </div>

      <!-- 主体区域 -->
      <div class="c-mc-lite-1785972578983-6feb7e31-body">
        <!-- 左侧导航栏 -->
        <div class="c-mc-lite-1785972578983-6feb7e31-sidebar">
          <div class="c-mc-lite-1785972578983-6feb7e31-sidebar-tag">3/3740</div>
          <div 
            v-for="(item, index) in menuItems" 
            :key="index"
            class="c-mc-lite-1785972578983-6feb7e31-menu-item"
            :class="{ 'c-mc-lite-1785972578983-6feb7e31-active': activeMenu === item }"
            @click="activeMenu = item"
          >
            <img v-if="activeMenu === item" src="../resources/images/icon-8798.png" class="menu-active-icon" />
            <img v-else src="../resources/images/icon-8817.png" class="menu-default-icon" />
            <span class="c-mc-lite-1785972578983-6feb7e31-menu-text">{{ item }}</span>
            <div v-if="item === '照明'" class="c-mc-lite-1785972578983-6feb7e31-badge">3</div>
          </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="c-mc-lite-1785972578983-6feb7e31-main-content">
          <!-- 上方数据卡片 -->
          <div class="c-mc-lite-1785972578983-6feb7e31-cards-row">
            <!-- 卡片1：隧道设备 -->
            <div class="c-mc-lite-1785972578983-6feb7e31-card c-mc-lite-1785972578983-6feb7e31-card-blue">
              <div class="c-mc-lite-1785972578983-6feb7e31-card-icon-wrapper">
                <div class="c-mc-lite-1785972578983-6feb7e31-card-icon">🔔</div>
              </div>
              <div class="c-mc-lite-1785972578983-6feb7e31-card-info">
                <div class="c-mc-lite-1785972578983-6feb7e31-card-row">
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-label">总 数:</span>
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-value">56302</span>
                </div>
                <div class="c-mc-lite-1785972578983-6feb7e31-card-row">
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-sub-label">隧道设备</span>
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-sub-label">异常数:</span>
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-value red">5</span>
                </div>
              </div>
            </div>

            <!-- 卡片2：南北接线设备 -->
            <div class="c-mc-lite-1785972578983-6feb7e31-card c-mc-lite-1785972578983-6feb7e31-card-gray">
              <div class="c-mc-lite-1785972578983-6feb7e31-card-icon-wrapper gray">
                <div class="c-mc-lite-1785972578983-6feb7e31-card-icon">📟</div>
              </div>
              <div class="c-mc-lite-1785972578983-6feb7e31-card-info">
                <div class="c-mc-lite-1785972578983-6feb7e31-card-row">
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-label dark">总 数:</span>
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-value blue">1280</span>
                </div>
                <div class="c-mc-lite-1785972578983-6feb7e31-card-row">
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-sub-label dark">南北接线设备</span>
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-sub-label dark">异常数:</span>
                  <span class="c-mc-lite-1785972578983-6feb7e31-card-value red">3</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 下方设备网格 -->
          <div class="c-mc-lite-1785972578983-6feb7e31-grid">
            <div 
              v-for="(device, index) in devices" 
              :key="index"
              class="c-mc-lite-1785972578983-6feb7e31-grid-item"
            >
              <div class="c-mc-lite-1785972578983-6feb7e31-grid-icon-area">
                <div class="c-mc-lite-1785972578983-6feb7e31-icon-base"></div>
                <img v-if="index === 0" src="../resources/images/icon-8444.png" class="device-icon" />
                <img v-else-if="index === 1" src="../resources/images/icon-8473.png" class="device-icon" />
                <img v-else-if="index === 2" src="../resources/images/icon-8503.png" class="device-icon" />
                <img v-else-if="index === 3" src="../resources/images/icon-8532.png" class="device-icon" />
                <img v-else-if="index === 4" src="../resources/images/icon-8561.png" class="device-icon" />
                <img v-else-if="index === 5" src="../resources/images/icon-8590.png" class="device-icon" />
                <img v-else-if="index === 6" src="../resources/images/icon-8619.png" class="device-icon" />
                <img v-else-if="index === 7" src="../resources/images/icon-8648.png" class="device-icon" />
                <img v-else-if="index === 8" src="../resources/images/icon-8677.png" class="device-icon" />
                <img v-else-if="index === 9" src="../resources/images/icon-8706.png" class="device-icon" />
                <img v-else-if="index === 10" src="../resources/images/icon-8735.png" class="device-icon" />
                <img v-else-if="index === 11" src="../resources/images/icon-8764.png" class="device-icon" />
                <div v-else class="c-mc-lite-1785972578983-6feb7e31-icon-symbol">{{ getIcon(device.name) }}</div>
              </div>
              <div class="c-mc-lite-1785972578983-6feb7e31-grid-text-area">
                <div class="c-mc-lite-1785972578983-6feb7e31-device-name">{{ device.name }}</div>
                <div class="c-mc-lite-1785972578983-6feb7e31-device-status">
                  <span :class="device.abnormal > 0 ? 'red' : 'blue'">({{ device.abnormal }}/{{ device.total }})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue';

const activeMenu = ref('监控');
const menuItems = ['监控', '照明', '通风', '供配电', '消防', '交通诱导'];

const devices = [
  { name: '摄像机', abnormal: 2, total: 484 },
  { name: '风速风向仪', abnormal: 1, total: 484 },
  { name: '超高检测器', abnormal: 0, total: 484 },
  { name: '烟道机器人', abnormal: 0, total: 484 },
  { name: '激光雷达', abnormal: 0, total: 484 },
  { name: 'CO2传感器', abnormal: 0, total: 484 },
  { name: 'CO/VI检测器', abnormal: 0, total: 484 },
  { name: '温湿度传感器', abnormal: 0, total: 484 },
  { name: '压力传感器', abnormal: 0, total: 484 },
  { name: '光照度变送器', abnormal: 0, total: 484 },
  { name: '紧急电话', abnormal: 0, total: 484 },
  { name: '水质监测设备', abnormal: 0, total: 484 },
];

const iconMap = {
  '摄像机': '📷',
  '风速风向仪': '🌬️',
  '超高检测器': '🚛',
  '烟道机器人': '🤖',
  '激光雷达': '📡',
  'CO2传感器': '💨',
  'CO/VI检测器': '☁️',
  '温湿度传感器': '🌡️',
  '压力传感器': '⏲️',
  '光照度变送器': '💡',
  '紧急电话': '📞',
  '水质监测设备': '💧'
};

const getIcon = (name) => iconMap[name] || '📦';
</script>

<style scoped>
.c-mc-lite-1785972578983-6feb7e31-content {
  width: 100%;
  height: 100%;
  background-image: url('../resources/images/bg-8418.png');
  background-size: cover;
  background-color: #aebbc9;
  display: flex;
  flex-direction: column;
  padding: 15px;
  box-sizing: border-box;
  font-family: 'Microsoft YaHei', sans-serif;
  color: #1e293b;
}

/* Header */
.c-mc-lite-1785972578983-6feb7e31-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  height: 40px;
}

.c-mc-lite-1785972578983-6feb7e31-main-title {
  font-size: 24px;
  font-weight: bold;
  color: #3b82f6;
  margin-right: 20px;
}

.title-deco-icon {
  width: 8px;
  height: 8px;
  margin-right: 8px;
}

.header-action-icon {
  width: 16px;
  height: 16px;
  margin-left: 15px;
  cursor: pointer;
}

.c-mc-lite-1785972578983-6feb7e31-stats-group {
  display: flex;
  gap: 20px;
  align-items: center;
  font-size: 16px;
}

.c-mc-lite-1785972578983-6feb7e31-stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.c-mc-lite-1785972578983-6feb7e31-stat-icon {
  width: 8px;
  height: 8px;
}

.c-mc-lite-1785972578983-6feb7e31-stat-label {
  color: #334155;
  font-weight: normal;
}

.c-mc-lite-1785972578983-6feb7e31-stat-value {
  font-weight: bold;
  font-size: 20px;
}

.c-mc-lite-1785972578983-6feb7e31-stat-value.blue { color: #3b82f6; }
.c-mc-lite-1785972578983-6feb7e31-stat-value.green { color: #10b981; }

/* Body Layout */
.c-mc-lite-1785972578983-6feb7e31-body {
  display: flex;
  flex: 1;
  gap: 15px;
  overflow: hidden;
}

/* Sidebar */
.c-mc-lite-1785972578983-6feb7e31-sidebar {
  width: 60px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

.c-mc-lite-1785972578983-6feb7e31-sidebar-tag {
  position: absolute;
  top: -10px;
  left: 0;
  background: #fff;
  color: #333;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.c-mc-lite-1785972578983-6feb7e31-menu-item {
  background-image: url('../resources/images/bg-8807.png');
  background-size: 100% 100%;
  border-radius: 8px;
  padding: 10px 5px;
  text-align: center;
  cursor: pointer;
  position: relative;
  color: #64748b;
  font-size: 14px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #cbd5e1;
  transition: all 0.3s;
}

.c-mc-lite-1785972578983-6feb7e31-menu-item.c-mc-lite-1785972578983-6feb7e31-active {
  background-image: url('../resources/images/bg-8788.png');
  background-size: 100% 100%;
  color: #fff;
  border-color: #3b82f6;
}

.menu-active-icon, .menu-default-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  writing-mode: horizontal-tb;
  margin-bottom: 4px;
}

.c-mc-lite-1785972578983-6feb7e31-menu-text {
  letter-spacing: 2px;
}

.c-mc-lite-1785972578983-6feb7e31-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: horizontal-tb;
}

/* Main Content */
.c-mc-lite-1785972578983-6feb7e31-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* Cards Row */
.c-mc-lite-1785972578983-6feb7e31-cards-row {
  display: flex;
  gap: 15px;
  height: 100px;
}

.c-mc-lite-1785972578983-6feb7e31-card {
  flex: 1;
  border-radius: 12px;
  display: flex;
  align-items: center;
  padding: 15px;
  position: relative;
  overflow: hidden;
}

.c-mc-lite-1785972578983-6feb7e31-card-blue {
  background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
  color: #fff;
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
}

.c-mc-lite-1785972578983-6feb7e31-card-gray {
  background: #cbd5e1;
  color: #1e293b;
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
}

.c-mc-lite-1785972578983-6feb7e31-card-icon-wrapper {
  width: 60px;
  height: 60px;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
  border: 2px solid rgba(255,255,255,0.5);
}

.c-mc-lite-1785972578983-6feb7e31-card-icon-wrapper.gray {
  background: #fff;
  border-color: #e2e8f0;
}

.c-mc-lite-1785972578983-6feb7e31-card-icon {
  font-size: 24px;
}

.c-mc-lite-1785972578983-6feb7e31-card-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.c-mc-lite-1785972578983-6feb7e31-card-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.c-mc-lite-1785972578983-6feb7e31-card-label {
  font-size: 18px;
  opacity: 0.9;
}

.c-mc-lite-1785972578983-6feb7e31-card-label.dark {
  color: #475569;
}

.c-mc-lite-1785972578983-6feb7e31-card-value {
  font-size: 28px;
  font-weight: bold;
}

.c-mc-lite-1785972578983-6feb7e31-card-value.red {
  color: #ef4444;
  font-size: 24px;
}

.c-mc-lite-1785972578983-6feb7e31-card-value.blue {
  color: #3b82f6;
}

.c-mc-lite-1785972578983-6feb7e31-card-sub-label {
  font-size: 14px;
  opacity: 0.8;
}

.c-mc-lite-1785972578983-6feb7e31-card-sub-label.dark {
  color: #475569;
  font-weight: bold;
}

/* Grid */
.c-mc-lite-1785972578983-6feb7e31-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 10px;
}

.c-mc-lite-1785972578983-6feb7e31-grid-item {
  background-color: #cbd5e1;
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 10px 15px;
  gap: 15px;
  border: 1px solid #94a3b8;
}

.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(1) { background-image: url('../resources/images/bg-8439.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(2) { background-image: url('../resources/images/bg-8468.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(3) { background-image: url('../resources/images/bg-8498.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(4) { background-image: url('../resources/images/bg-8527.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(5) { background-image: url('../resources/images/bg-8556.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(6) { background-image: url('../resources/images/bg-8585.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(7) { background-image: url('../resources/images/bg-8614.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(8) { background-image: url('../resources/images/bg-8643.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(9) { background-image: url('../resources/images/bg-8672.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(10) { background-image: url('../resources/images/bg-8701.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(11) { background-image: url('../resources/images/bg-8730.png'); background-size: 100% 100%; }
.c-mc-lite-1785972578983-6feb7e31-grid-item:nth-child(12) { background-image: url('../resources/images/bg-8759.png'); background-size: 100% 100%; }

.c-mc-lite-1785972578983-6feb7e31-grid-icon-area {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-mc-lite-1785972578983-6feb7e31-icon-base {
  position: absolute;
  bottom: 0;
  width: 36px;
  height: 12px;
  background: linear-gradient(to bottom, #e2e8f0, #fff);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 1;
}

.device-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  position: relative;
  z-index: 2;
}

.c-mc-lite-1785972578983-6feb7e31-icon-symbol {
  position: relative;
  z-index: 2;
  font-size: 20px;
  margin-bottom: 5px;
  color: #3b82f6;
}

.c-mc-lite-1785972578983-6feb7e31-grid-text-area {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.c-mc-lite-1785972578983-6feb7e31-device-name {
  font-size: 14px;
  color: #1e293b;
}

.c-mc-lite-1785972578983-6feb7e31-device-status {
  font-size: 16px;
  font-weight: bold;
}

.c-mc-lite-1785972578983-6feb7e31-device-status .red { color: #ef4444; }
.c-mc-lite-1785972578983-6feb7e31-device-status .blue { color: #3b82f6; }

</style>
