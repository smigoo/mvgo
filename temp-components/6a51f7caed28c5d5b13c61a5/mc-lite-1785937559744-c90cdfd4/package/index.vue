<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1785937559744-c90cdfd4-container">
      <!-- 顶部全局信息栏 -->
      <div class="c-mc-lite-1785937559744-c90cdfd4-header">
        <div class="c-mc-lite-1785937559744-c90cdfd4-header-left">
          <div class="c-mc-lite-1785937559744-c90cdfd4-title-group">
            <span class="c-mc-lite-1785937559744-c90cdfd4-icon-monitor"></span>
            <span class="c-mc-lite-1785937559744-c90cdfd4-title">设备监测</span>
          </div>
          <div class="c-mc-lite-1785937559744-c90cdfd4-stats-row">
            <span class="c-mc-lite-1785937559744-c90cdfd4-stat-item">
              <span class="c-mc-lite-1785937559744-c90cdfd4-icon-type"></span>
              设备类型 <span class="c-mc-lite-1785937559744-c90cdfd4-text-blue">28</span>
            </span>
            <span class="c-mc-lite-1785937559744-c90cdfd4-stat-item">
              设备总数 <span class="c-mc-lite-1785937559744-c90cdfd4-text-blue">68562</span>
            </span>
            <span class="c-mc-lite-1785937559744-c90cdfd4-stat-item">
              完好率 <span class="c-mc-lite-1785937559744-c90cdfd4-text-green">98%</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 主体内容 -->
      <div class="c-mc-lite-1785937559744-c90cdfd4-main">
        <!-- 左侧垂直导航 -->
        <div class="c-mc-lite-1785937559744-c90cdfd4-sidebar">
          <div class="c-mc-lite-1785937559744-c90cdfd4-float-badge">3/3740</div>
          <div 
            v-for="(item, index) in navItems" 
            :key="index"
            class="c-mc-lite-1785937559744-c90cdfd4-nav-item"
            :class="{ 'c-mc-lite-1785937559744-c90cdfd4-nav-active': item.active }"
            @click="selectNav(index)"
          >
            <span class="c-mc-lite-1785937559744-c90cdfd4-nav-text">{{ item.name }}</span>
            <div v-if="item.badge" class="c-mc-lite-1785937559744-c90cdfd4-nav-badge">{{ item.badge }}</div>
          </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="c-mc-lite-1785937559744-c90cdfd4-content-right">
          <!-- 上方统计卡片 -->
          <div class="c-mc-lite-1785937559744-c90cdfd4-cards-row">
            <!-- 隧道设备卡片 -->
            <div class="c-mc-lite-1785937559744-c90cdfd4-big-card c-mc-lite-1785937559744-c90cdfd4-card-blue">
              <div class="c-mc-lite-1785937559744-c90cdfd4-card-icon-wrap">
                <div class="c-mc-lite-1785937559744-c90cdfd4-icon-tunnel"></div>
                <span class="c-mc-lite-1785937559744-c90cdfd4-card-subtitle">隧道设备</span>
              </div>
              <div class="c-mc-lite-1785937559744-c90cdfd4-card-data">
                <div class="c-mc-lite-1785937559744-c90cdfd4-data-row">
                  <span class="c-mc-lite-1785937559744-c90cdfd4-label">总 数:</span>
                  <span class="c-mc-lite-1785937559744-c90cdfd4-value-white">56302</span>
                </div>
                <div class="c-mc-lite-1785937559744-c90cdfd4-data-row">
                  <span class="c-mc-lite-1785937559744-c90cdfd4-label">异常数:</span>
                  <span class="c-mc-lite-1785937559744-c90cdfd4-value-red">5</span>
                </div>
              </div>
            </div>

            <!-- 南北接线设备卡片 -->
            <div class="c-mc-lite-1785937559744-c90cdfd4-big-card c-mc-lite-1785937559744-c90cdfd4-card-grey">
              <div class="c-mc-lite-1785937559744-c90cdfd4-card-icon-wrap">
                <div class="c-mc-lite-1785937559744-c90cdfd4-icon-line"></div>
                <span class="c-mc-lite-1785937559744-c90cdfd4-card-subtitle">南北接线<br>设备</span>
              </div>
              <div class="c-mc-lite-1785937559744-c90cdfd4-card-data">
                <div class="c-mc-lite-1785937559744-c90cdfd4-data-row">
                  <span class="c-mc-lite-1785937559744-c90cdfd4-label">总 数:</span>
                  <span class="c-mc-lite-1785937559744-c90cdfd4-value-blue">1280</span>
                </div>
                <div class="c-mc-lite-1785937559744-c90cdfd4-data-row">
                  <span class="c-mc-lite-1785937559744-c90cdfd4-label">异常数:</span>
                  <span class="c-mc-lite-1785937559744-c90cdfd4-value-red">3</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 下方设备网格 -->
          <div class="c-mc-lite-1785937559744-c90cdfd4-grid">
            <div 
              v-for="(device, index) in devices" 
              :key="index"
              class="c-mc-lite-1785937559744-c90cdfd4-grid-item"
            >
              <div class="c-mc-lite-1785937559744-c90cdfd4-device-icon">
                <!-- 通用设备图标模拟 -->
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="c-mc-lite-1785937559744-c90cdfd4-svg-icon">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 8v4l3 3"></path>
                </svg>
              </div>
              <div class="c-mc-lite-1785937559744-c90cdfd4-device-info">
                <div class="c-mc-lite-1785937559744-c90cdfd4-device-name">{{ device.name }}</div>
                <div class="c-mc-lite-1785937559744-c90cdfd4-device-data">
                  <span class="c-mc-lite-1785937559744-c90cdfd4-text-red">({{ device.error }}</span>
                  <span class="c-mc-lite-1785937559744-c90cdfd4-text-blue">/{{ device.total }})</span>
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

const navItems = ref([
  { name: '监控', active: true, badge: null },
  { name: '照明', active: false, badge: 3 },
  { name: '通风', active: false, badge: null },
  { name: '供配电', active: false, badge: null },
  { name: '消防', active: false, badge: null },
  { name: '交通诱导', active: false, badge: null },
]);

const devices = ref([
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
  { name: '水质监测设备', error: 0, total: 484 },
]);

const selectNav = (index) => {
  navItems.value.forEach((item, i) => {
    item.active = i === index;
  });
};
</script>

<style scoped>
.c-mc-lite-1785937559744-c90cdfd4-container {
  width: 100%;
  height: 100%;
  background-color: #0f172a; /* 深蓝背景 */
  color: #ffffff;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  font-family: 'Microsoft YaHei', sans-serif;
}

/* 顶部栏 */
.c-mc-lite-1785937559744-c90cdfd4-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px;
  margin-bottom: 10px;
  background: rgba(30, 41, 59, 0.5);
  padding: 0 10px;
  border-radius: 4px;
}

.c-mc-lite-1785937559744-c90cdfd4-header-left {
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;
}

.c-mc-lite-1785937559744-c90cdfd4-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: bold;
  color: #60a5fa;
}

.c-mc-lite-1785937559744-c90cdfd4-icon-monitor {
  display: inline-block;
  width: 16px;
  height: 16px;
  background-color: #60a5fa;
  border-radius: 50%;
  /* 模拟图标 */
  position: relative;
}
.c-mc-lite-1785937559744-c90cdfd4-icon-monitor::after {
  content: '';
  position: absolute;
  top: 4px; left: 4px;
  width: 8px; height: 8px;
  background: #0f172a;
  border-radius: 50%;
}

.c-mc-lite-1785937559744-c90cdfd4-stats-row {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: #94a3b8;
}

.c-mc-lite-1785937559744-c90cdfd4-stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.c-mc-lite-1785937559744-c90cdfd4-icon-type {
  display: inline-block;
  width: 14px;
  height: 14px;
  background-color: #3b82f6;
  border-radius: 2px;
}

.c-mc-lite-1785937559744-c90cdfd4-text-blue { color: #3b82f6; font-weight: bold; font-size: 16px; }
.c-mc-lite-1785937559744-c90cdfd4-text-green { color: #10b981; font-weight: bold; font-size: 16px; }
.c-mc-lite-1785937559744-c90cdfd4-text-red { color: #ef4444; font-weight: bold; }

/* 主体布局 */
.c-mc-lite-1785937559744-c90cdfd4-main {
  display: flex;
  flex: 1;
  gap: 10px;
  overflow: hidden;
}

/* 左侧导航 */
.c-mc-lite-1785937559744-c90cdfd4-sidebar {
  width: 60px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  position: relative;
}

.c-mc-lite-1785937559744-c90cdfd4-float-badge {
  position: absolute;
  top: -5px;
  left: 0;
  background: #fff;
  color: #333;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 2px;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.c-mc-lite-1785937559744-c90cdfd4-nav-item {
  background: #334155;
  color: #94a3b8;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px 0;
  cursor: pointer;
  position: relative;
  border-radius: 4px;
  flex: 1;
}

.c-mc-lite-1785937559744-c90cdfd4-nav-active {
  background: #3b82f6;
  color: #fff;
  font-weight: bold;
}

.c-mc-lite-1785937559744-c90cdfd4-nav-text {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: 14px;
  letter-spacing: 2px;
}

.c-mc-lite-1785937559744-c90cdfd4-nav-badge {
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
  justify-content: center;
  align-items: center;
  font-weight: bold;
}

/* 右侧内容 */
.c-mc-lite-1785937559744-c90cdfd4-content-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 大卡片行 */
.c-mc-lite-1785937559744-c90cdfd4-cards-row {
  display: flex;
  gap: 10px;
  height: 120px;
}

.c-mc-lite-1785937559744-c90cdfd4-big-card {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 10px 20px;
  position: relative;
  /* 箭头形状 */
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
}

.c-mc-lite-1785937559744-c90cdfd4-card-blue {
  background: linear-gradient(90deg, #60a5fa 0%, #3b82f6 100%);
}

.c-mc-lite-1785937559744-c90cdfd4-card-grey {
  background: linear-gradient(90deg, #94a3b8 0%, #64748b 100%);
}

.c-mc-lite-1785937559744-c90cdfd4-card-icon-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 20px;
  width: 60px;
}

.c-mc-lite-1785937559744-c90cdfd4-icon-tunnel,
.c-mc-lite-1785937559744-c90cdfd4-icon-line {
  width: 40px;
  height: 40px;
  background: #fff;
  border-radius: 50%;
  margin-bottom: 5px;
  display: flex;
  justify-content: center;
  align-items: center;
}
/* 模拟内部图标 */
.c-mc-lite-1785937559744-c90cdfd4-icon-tunnel::after { content: ''; font-size: 20px; }
.c-mc-lite-1785937559744-c90cdfd4-icon-line::after { content: '️'; font-size: 20px; }

.c-mc-lite-1785937559744-c90cdfd4-card-subtitle {
  font-size: 12px;
  text-align: center;
  line-height: 1.2;
}

.c-mc-lite-1785937559744-c90cdfd4-card-data {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.c-mc-lite-1785937559744-c90cdfd4-data-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.c-mc-lite-1785937559744-c90cdfd4-label {
  font-size: 14px;
  opacity: 0.9;
}

.c-mc-lite-1785937559744-c90cdfd4-value-white {
  font-size: 28px;
  font-weight: bold;
  color: #fff;
}

.c-mc-lite-1785937559744-c90cdfd4-value-blue {
  font-size: 28px;
  font-weight: bold;
  color: #3b82f6; /* 在灰色背景上显示蓝色 */
  /* 实际上截图里是浅蓝色/白色，这里用亮色 */
  color: #e0f2fe; 
}

.c-mc-lite-1785937559744-c90cdfd4-value-red {
  font-size: 16px;
  font-weight: bold;
  color: #ef4444;
}

/* 网格区域 */
.c-mc-lite-1785937559744-c90cdfd4-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr); /* 3行数据，但截图有12个设备? 不，截图是3列x4行=12个? */
  /* 重新数一下：摄像机, 风速, 超高 (3个); 烟道, 激光, CO2 (3个); CO/VI, 温湿度, 压力 (3个); 光照, 紧急, 水质 (3个)。共12个。 */
  /* 截图显示 3列 x 4行 */
  gap: 10px;
}

.c-mc-lite-1785937559744-c90cdfd4-grid-item {
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid #475569;
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 10px;
  gap: 10px;
}

.c-mc-lite-1785937559744-c90cdfd4-device-icon {
  width: 36px;
  height: 36px;
  background: #3b82f6;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.c-mc-lite-1785937559744-c90cdfd4-svg-icon {
  width: 20px;
  height: 20px;
  color: #fff;
}

.c-mc-lite-1785937559744-c90cdfd4-device-info {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.c-mc-lite-1785937559744-c90cdfd4-device-name {
  font-size: 14px;
  color: #cbd5e1;
}

.c-mc-lite-1785937559744-c90cdfd4-device-data {
  font-size: 14px;
  font-weight: bold;
}

</style>