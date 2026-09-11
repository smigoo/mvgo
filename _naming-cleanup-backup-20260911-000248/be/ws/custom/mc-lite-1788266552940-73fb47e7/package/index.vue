<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitor-content">
      <!-- 顶部标题与统计栏 -->
      <div class="c-equipment-monitor-header">
        <div class="c-equipment-monitor-title">设备监测</div>
        <div class="c-equipment-monitor-stats">
          <div class="c-equipment-monitor-stat-item">
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

      <!-- 次级统计卡片区 -->
      <div class="c-equipment-monitor-stat-cards">
        <div class="c-equipment-monitor-stat-card c-equipment-monitor-stat-card-primary">
          <div class="c-equipment-monitor-card-icon">
            <svg viewBox="0 0 40 40" class="c-equipment-monitor-icon-svg">
              <path d="M20 8 L28 12 L28 20 L20 24 L12 20 L12 12 Z" fill="#2B8FE8" opacity="0.6"/>
              <ellipse cx="20" cy="12" rx="8" ry="3" fill="#4DB3FF"/>
            </svg>
          </div>
          <div class="c-equipment-monitor-card-content">
            <div class="c-equipment-monitor-card-title">隧道设备</div>
            <div class="c-equipment-monitor-card-stats">
              <div class="c-equipment-monitor-card-stat">
                <span class="c-equipment-monitor-card-stat-label">总数:</span>
                <span class="c-equipment-monitor-card-stat-value">56302</span>
              </div>
              <div class="c-equipment-monitor-card-stat">
                <span class="c-equipment-monitor-card-stat-label">异常数:</span>
                <span class="c-equipment-monitor-card-stat-value c-equipment-monitor-card-stat-error">5</span>
              </div>
            </div>
          </div>
        </div>
        <div class="c-equipment-monitor-stat-card c-equipment-monitor-stat-card-secondary">
          <div class="c-equipment-monitor-card-icon">
            <svg viewBox="0 0 40 40" class="c-equipment-monitor-icon-svg">
              <path d="M20 8 L28 12 L28 20 L20 24 L12 20 L12 20 L12 12 Z" fill="#5BB7F0" opacity="0.5"/>
              <ellipse cx="20" cy="12" rx="8" ry="3" fill="#7EC8FF"/>
            </svg>
          </div>
          <div class="c-equipment-monitor-card-content">
            <div class="c-equipment-monitor-card-title">南北接线设备</div>
            <div class="c-equipment-monitor-card-stats">
              <div class="c-equipment-monitor-card-stat">
                <span class="c-equipment-monitor-card-stat-label">总数:</span>
                <span class="c-equipment-monitor-card-stat-value">1280</span>
              </div>
              <div class="c-equipment-monitor-card-stat">
                <span class="c-equipment-monitor-card-stat-label">异常数:</span>
                <span class="c-equipment-monitor-card-stat-value c-equipment-monitor-card-stat-error">3</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 主内容区：左侧导航 + 设备网格 -->
      <div class="c-equipment-monitor-main">
        <!-- 左侧分类导航栏 -->
        <div class="c-equipment-monitor-sidebar">
          <div class="c-equipment-monitor-sidebar-badge">3/3740</div>
          <button 
            v-for="(category, index) in categories" 
            :key="index"
            class="c-equipment-monitor-category-btn"
            :class="{ 'c-equipment-monitor-category-btn-active': activeCategory === index }"
            @click="activeCategory = index"
          >
            <span class="c-equipment-monitor-category-text">{{ category.name }}</span>
            <span v-if="category.badge" class="c-equipment-monitor-category-badge">{{ category.badge }}</span>
          </button>
        </div>

        <!-- 设备网格区 -->
        <div class="c-equipment-monitor-grid">
          <div 
            v-for="(device, index) in devices" 
            :key="index"
            class="c-equipment-monitor-device-card"
          >
            <div class="c-equipment-monitor-device-icon">
              <svg viewBox="0 0 60 60" class="c-equipment-monitor-device-icon-svg">
                <!-- 3D圆台效果 -->
                <defs>
                  <radialGradient id="deviceGradient" cx="50%" cy="30%">
                    <stop offset="0%" style="stop-color:#5BC5FF;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#3B9EFF;stop-opacity:1" />
                  </radialGradient>
                </defs>
                <ellipse cx="30" cy="25" rx="18" ry="6" fill="url(#deviceGradient)" opacity="0.9"/>
                <path d="M12 25 L12 35 Q12 38 30 40 Q48 38 48 35 L48 25" fill="#2B7FD8" opacity="0.7"/>
                <ellipse cx="30" cy="35" rx="18" ry="5" fill="#1E6BB8" opacity="0.6"/>
              </svg>
              <!-- 设备类型图标 -->
              <div class="c-equipment-monitor-device-type-icon">
                <component :is="getDeviceIconSvg(device.type)" />
              </div>
            </div>
            <div class="c-equipment-monitor-device-name">{{ device.name }}</div>
            <div class="c-equipment-monitor-device-status">
              <span :class="device.error > 0 ? 'c-equipment-monitor-status-error' : 'c-equipment-monitor-status-normal'">
                ({{ device.error }}/{{ device.total }})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

// 分类导航数据
const categories = ref([
  { name: '监控', badge: null },
  { name: '照明', badge: 3 },
  { name: '通风', badge: null },
  { name: '供配电', badge: null },
  { name: '消防', badge: null },
  { name: '交通诱导', badge: null }
])

const activeCategory = ref(0)

// 设备数据
const devices = ref([
  { name: '摄像机', error: 2, total: 484, type: 'camera' },
  { name: '风速风向仪', error: 1, total: 484, type: 'wind' },
  { name: '超高检测器', error: 0, total: 484, type: 'height' },
  { name: '烟道机器人', error: 0, total: 484, type: 'robot' },
  { name: '激光雷达', error: 0, total: 484, type: 'lidar' },
  { name: 'CO₂传感器', error: 0, total: 484, type: 'co2' },
  { name: 'CO/VI检测器', error: 0, total: 484, type: 'co' },
  { name: '温湿度传感器', error: 0, total: 484, type: 'temp' },
  { name: '压力传感器', error: 0, total: 484, type: 'pressure' },
  { name: '光照度变送器', error: 0, total: 484, type: 'light' },
  { name: '紧急电话', error: 0, total: 484, type: 'phone' },
  { name: '水质监测设备', error: 0, total: 484, type: 'water' }
])

// 设备类型图标SVG
const getDeviceIconSvg = (type) => {
  const iconMap = {
    camera: 'svg',
    wind: 'svg',
    height: 'svg',
    robot: 'svg',
    lidar: 'svg',
    co2: 'svg',
    co: 'svg',
    temp: 'svg',
    pressure: 'svg',
    light: 'svg',
    phone: 'svg',
    water: 'svg'
  }
  return iconMap[type] || 'svg'
}
</script>

<style scoped>
/* 高度预算：可用 389px，padding 10px×2 = 369px
   header 38px + stat-cards 88px + gap 8px = 134px
   main 剩余 = 369 - 134 = 235px
   sidebar + grid 共用 235px 高度 */

.c-equipment-monitor-content {
  width: 100%;
  height: 100%;
  padding: 10px;
  background: #E4EEF9;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 顶部标题与统计栏 */
.c-equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 38px;
}

.c-equipment-monitor-title {
  font-size: 16px;
  font-weight: 500;
  color: #3B9EFF;
  white-space: nowrap;
}

.c-equipment-monitor-stats {
  display: flex;
  align-items: center;
  gap: 24px;
  flex: 1;
}

.c-equipment-monitor-stat-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.c-equipment-monitor-stat-label {
  font-size: 11px;
  color: #4A5568;
  white-space: nowrap;
}

.c-equipment-monitor-stat-value {
  font-size: 19px;
  font-weight: 700;
  color: #3B9EFF;
  white-space: nowrap;
}

/* 次级统计卡片区 */
.c-equipment-monitor-stat-cards {
  display: flex;
  gap: 12px;
  height: 88px;
}

.c-equipment-monitor-stat-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 4px;
  position: relative;
  overflow: visible;
}

.c-equipment-monitor-stat-card::before {
  content: '';
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 44px solid transparent;
  border-bottom: 44px solid transparent;
  z-index: 1;
}

.c-equipment-monitor-stat-card-primary {
  background: linear-gradient(90deg, #3B9EFF 0%, #5BB7F0 100%);
}

.c-equipment-monitor-stat-card-primary::before {
  border-left: 10px solid #5BB7F0;
}

.c-equipment-monitor-stat-card-secondary {
  background: linear-gradient(90deg, #7EC8FF 0%, #ADE0FF 100%);
}

.c-equipment-monitor-stat-card-secondary::before {
  border-left: 10px solid #ADE0FF;
}

.c-equipment-monitor-card-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.c-equipment-monitor-icon-svg {
  width: 100%;
  height: 100%;
}

.c-equipment-monitor-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.c-equipment-monitor-card-title {
  font-size: 13px;
  font-weight: 500;
  color: #FFFFFF;
  white-space: nowrap;
}

.c-equipment-monitor-card-stats {
  display: flex;
  gap: 16px;
}

.c-equipment-monitor-card-stat {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.c-equipment-monitor-card-stat-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
}

.c-equipment-monitor-card-stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #FFFFFF;
  white-space: nowrap;
}

.c-equipment-monitor-card-stat-error {
  color: #FF4D4F;
}

/* 主内容区 */
.c-equipment-monitor-main {
  flex: 1;
  display: flex;
  gap: 8px;
  min-height: 0;
}

/* 左侧导航栏 */
.c-equipment-monitor-sidebar {
  width: 42px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 24px;
  position: relative;
}

.c-equipment-monitor-sidebar-badge {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 6px;
  background: #FFFFFF;
  border: 1px solid #FF4D4F;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 600;
  color: #FF4D4F;
  white-space: nowrap;
  z-index: 2;
}

.c-equipment-monitor-category-btn {
  width: 42px;
  height: 32px;
  background: rgba(173, 216, 255, 0.25);
  border: 1px solid #A0B4C8;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 2px;
}

.c-equipment-monitor-category-btn:hover {
  background: rgba(173, 216, 255, 0.45);
  border-color: #3B9EFF;
}

.c-equipment-monitor-category-btn-active {
  background: #3B9EFF;
  border-color: #3B9EFF;
}

.c-equipment-monitor-category-btn-active .c-equipment-monitor-category-text {
  color: #FFFFFF;
}

.c-equipment-monitor-category-text {
  writing-mode: vertical-rl;
  white-space: nowrap;
  font-size: 11px;
  color: #4A5568;
  letter-spacing: 1px;
}

.c-equipment-monitor-category-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 16px;
  height: 16px;
  background: #FF4D4F;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  color: #FFFFFF;
  z-index: 3;
}

/* 设备网格区 */
.c-equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
}

.c-equipment-monitor-device-card {
  background: rgba(173, 216, 255, 0.25);
  border: 1px solid #A0B4C8;
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.2s;
  cursor: pointer;
  min-height: 0;
}

.c-equipment-monitor-device-card:hover {
  background: rgba(173, 216, 255, 0.45);
  border-color: #3B9EFF;
  box-shadow: 0 2px 8px rgba(59, 158, 255, 0.2);
}

.c-equipment-monitor-device-icon {
  width: 36px;
  height: 36px;
  position: relative;
  flex-shrink: 0;
}

.c-equipment-monitor-device-icon-svg {
  width: 100%;
  height: 100%;
}

.c-equipment-monitor-device-type-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-equipment-monitor-device-type-icon svg {
  width: 100%;
  height: 100%;
  fill: #FFFFFF;
}

.c-equipment-monitor-device-name {
  font-size: 11px;
  color: #4A5568;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.c-equipment-monitor-device-status {
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.c-equipment-monitor-status-error {
  color: #FF4D4F;
}

.c-equipment-monitor-status-normal {
  color: #00D4FF;
}
</style>