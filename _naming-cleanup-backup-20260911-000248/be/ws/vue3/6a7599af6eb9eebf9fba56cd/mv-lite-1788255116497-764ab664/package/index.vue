<template>
  <div class="equipment-monitor">
    <!-- 头部统计栏 -->
    <div class="header-stats">
      <span class="title">设备监测</span>
      <span class="stat-item">
        <span class="stat-icon">≡</span>
        <span class="stat-label">设备类型</span>
        <span class="stat-value">28</span>
      </span>
      <span class="stat-item">
        <span class="stat-label">设备总数</span>
        <span class="stat-value large">68562</span>
      </span>
      <span class="stat-item">
        <span class="stat-label">完好率</span>
        <span class="stat-value success">98%</span>
      </span>
    </div>

    <!-- 两个大卡片统计区 -->
    <div class="summary-cards">
      <div class="summary-card blue">
        <div class="card-icon">
          <div class="icon-bg"></div>
        </div>
        <div class="card-content">
          <div class="card-title">隧道设备</div>
          <div class="card-stats">
            <span class="total">总 数:<span class="num">56302</span></span>
            <span class="abnormal">异常数:<span class="num">5</span></span>
          </div>
        </div>
        <div class="arrow-right"></div>
      </div>
      <div class="summary-card light-blue">
        <div class="card-icon">
          <div class="icon-bg diamond"></div>
        </div>
        <div class="card-content">
          <div class="card-title">南北横线设备</div>
          <div class="card-stats">
            <span class="total">总 数:<span class="num">1280</span></span>
            <span class="abnormal">异常数:<span class="num">3</span></span>
          </div>
        </div>
        <div class="arrow-right"></div>
      </div>
    </div>

    <!-- 主内容区：左侧导航 + 设备网格 -->
    <div class="main-content">
      <!-- 左侧导航栏 -->
      <div class="sidebar-nav">
        <div class="nav-badge">3/3740</div>
        <button 
          v-for="item in navItems" 
          :key="item.id"
          class="nav-btn"
          :class="{ active: activeNav === item.id }"
          @click="activeNav = item.id"
        >
          {{ item.label }}
          <span v-if="item.badge" class="badge">{{ item.badge }}</span>
        </button>
      </div>

      <!-- 设备网格区 -->
      <div class="device-grid">
        <div 
          v-for="device in devices" 
          :key="device.name"
          class="device-card"
        >
          <div class="device-icon">
            <div class="icon-base"></div>
            <div class="icon-symbol" :style="{ color: device.iconColor }">
              {{ device.icon }}
            </div>
          </div>
          <div class="device-name">{{ device.name }}</div>
          <div class="device-stats">
            (<span :class="device.abnormal > 0 ? 'abnormal' : 'normal'">{{ device.abnormal }}</span>/<span class="total-count">484</span>)
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeNav = ref('照明')

const navItems = [
  { id: '监控', label: '监控' },
  { id: '照明', label: '照明', badge: 3 },
  { id: '通风', label: '通风' },
  { id: '供配电', label: '供配电' },
  { id: '消防', label: '消防' },
  { id: '交通诱导', label: '交通诱导' }
]

const devices = [
  { name: '摄像机', abnormal: 2, icon: '📷', iconColor: '#3B9EFF' },
  { name: '风速风向仪', abnormal: 1, icon: '🌀', iconColor: '#3B9EFF' },
  { name: '超高检测器', abnormal: 0, icon: '📡', iconColor: '#3B9EFF' },
  { name: '烟道机器人', abnormal: 0, icon: '🤖', iconColor: '#3B9EFF' },
  { name: '激光雷达', abnormal: 0, icon: '⊙', iconColor: '#3B9EFF' },
  { name: 'CO₂传感器', abnormal: 0, icon: 'CO₂', iconColor: '#3B9EFF' },
  { name: 'CO/VI检测器', abnormal: 0, icon: '⚡', iconColor: '#3B9EFF' },
  { name: '温湿度传感器', abnormal: 0, icon: '🌡', iconColor: '#3B9EFF' },
  { name: '压力传感器', abnormal: 0, icon: '⊕', iconColor: '#3B9EFF' },
  { name: '光照度变送器', abnormal: 0, icon: '◐', iconColor: '#3B9EFF' },
  { name: '紧急电话', abnormal: 0, icon: '📞', iconColor: '#3B9EFF' },
  { name: '水质监测设备', abnormal: 0, icon: '💧', iconColor: '#3B9EFF' }
]
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #A8B5C0;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 头部统计栏 */
.header-stats {
  display: flex;
  align-items: center;
  gap: 24px;
  color: #333;
  font-size: 16px;
  padding: 0 8px;
}

.title {
  font-size: 24px;
  font-weight: 600;
  color: #3B9EFF;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon {
  color: #3B9EFF;
  font-weight: bold;
}

.stat-label {
  color: #333;
}

.stat-value {
  font-weight: bold;
  color: #3B9EFF;
  font-size: 18px;
}

.stat-value.large {
  font-size: 26px;
}

.stat-value.success {
  color: #34C759;
}

/* 两个大卡片统计区 */
.summary-cards {
  display: flex;
  gap: 16px;
}

.summary-card {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
  min-height: 70px;
}

.summary-card.blue {
  background: linear-gradient(135deg, #3B9EFF 0%, #5AAFFF 100%);
}

.summary-card.light-blue {
  background: linear-gradient(135deg, #B8D4E8 0%, #D0E5F5 100%);
}

.card-icon {
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
}

.icon-bg {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.icon-bg.diamond {
  border-radius: 8px;
  transform: rotate(45deg);
}

.card-content {
  flex: 1;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 8px;
}

.summary-card.light-blue .card-title {
  color: #333;
}

.card-stats {
  display: flex;
  gap: 20px;
  font-size: 14px;
}

.card-stats .total,
.card-stats .abnormal {
  color: #fff;
}

.summary-card.light-blue .card-stats .total,
.summary-card.light-blue .card-stats .abnormal {
  color: #333;
}

.card-stats .num {
  font-weight: bold;
  font-size: 16px;
  margin-left: 4px;
}

.card-stats .abnormal .num {
  color: #FF3B30;
}

.arrow-right {
  width: 0;
  height: 0;
  border-top: 35px solid transparent;
  border-bottom: 35px solid transparent;
  border-left: 20px solid rgba(255, 255, 255, 0.2);
  position: absolute;
  right: 0;
}

/* 主内容区 */
.main-content {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

/* 左侧导航栏
 * 2026-09-01 同 grid 修复：column-flex 无 min-height:0 + 内容超高（6 按钮≈322px）
 * 会撑破 main-content。加 min-height:0 + overflow-y:auto 内部滚动，不再溢出外层画布。 */
.sidebar-nav {
  width: 48px;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}

.nav-badge {
  background: #fff;
  color: #3B9EFF;
  font-size: 12px;
  font-weight: bold;
  padding: 4px 8px;
  border-radius: 6px;
  text-align: center;
  border: 1px solid #7A99B3;
  margin-bottom: 4px;
}

.nav-btn {
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid #7A99B3;
  border-radius: 8px;
  padding: 12px 4px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.7);
}

.nav-btn.active {
  background: rgba(59, 158, 255, 0.2);
  border-color: #3B9EFF;
  color: #3B9EFF;
}

.nav-btn .badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #FF3B30;
  color: #fff;
  font-size: 11px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: horizontal-tb;
  font-weight: bold;
}

/* 设备网格区
 * 2026-09-01 修复「内部尺寸超大导致下面内容被截掉」：
 * 原 grid-template-rows: repeat(4, 1fr) 的行高下限=卡片内容 min-content 高度（≈119px），
 * 4 行被撑到 508px 超出画布剩余 203px，逐层溢出被预览 overflow:hidden 裁切。
 * 改为 min-content 行高 + 容器内部滚动，网格内容完整展示且不再撑破外层画布。 */
.device-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, min-content);
  gap: 12px;
  align-content: start;
}

.device-card {
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid #7A99B3;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.device-card:hover {
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.device-icon {
  width: 50px;
  height: 50px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-base {
  position: absolute;
  width: 100%;
  height: 50%;
  bottom: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(184, 212, 232, 0.8) 100%);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.icon-symbol {
  position: relative;
  font-size: 24px;
  z-index: 1;
}

.device-name {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  text-align: center;
}

.device-stats {
  font-size: 13px;
  color: #666;
}

.device-stats .abnormal {
  color: #FF3B30;
  font-weight: bold;
}

.device-stats .normal {
  color: #00BCD4;
  font-weight: bold;
}

.device-stats .total-count {
  color: #00BCD4;
}
</style>