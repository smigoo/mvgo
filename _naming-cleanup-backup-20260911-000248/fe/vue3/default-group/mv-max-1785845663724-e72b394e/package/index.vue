<template>
  <div class="dashboard-container">
    <!-- 顶部标题栏 -->
    <header class="top-header">
      <div class="header-left">
        <h1 class="title">设备监测</h1>
        <div class="global-stats">
          <span class="stat-item">
            <span class="icon-eq">≡</span> 设备类型 <span class="num blue">28</span>
          </span>
          <span class="stat-item">
            设备总数 <span class="num blue">68562</span>
          </span>
          <span class="stat-item">
            完好率 <span class="num green">98%</span>
          </span>
        </div>
      </div>
    </header>

    <div class="main-layout">
      <!-- 左侧导航栏 -->
      <aside class="sidebar">
        <div class="menu-list">
          <div class="menu-item-wrapper relative">
            <span class="badge-top">3/3740</span>
            <div class="menu-item active">监控</div>
          </div>
          <div class="menu-item-wrapper relative">
            <span class="badge-corner">3</span>
            <div class="menu-item">照明</div>
          </div>
          <div class="menu-item">通风</div>
          <div class="menu-item">供配电</div>
          <div class="menu-item">消防</div>
          <div class="menu-item">交通诱导</div>
        </div>
      </aside>

      <!-- 右侧主体区域 -->
      <main class="content-area">
        <!-- 统计卡片区 -->
        <div class="stats-cards-row">
          <!-- 隧道设备卡片 -->
          <div class="stat-card card-blue">
            <div class="card-icon-wrapper">
              <div class="icon-circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
            </div>
            <div class="card-content">
              <div class="card-row-1">
                <span class="label">总 数:</span>
                <span class="value white bold">56302</span>
              </div>
              <div class="card-row-2">
                <span class="sub-label">隧道设备</span>
                <span class="sub-value">异常数:<span class="red bold">5</span></span>
              </div>
            </div>
            <div class="card-arrow"></div>
          </div>

          <!-- 南北接线设备卡片 -->
          <div class="stat-card card-gray">
            <div class="card-icon-wrapper">
              <div class="icon-circle gray-bg">
                <svg viewBox="0 0 24 24" fill="none" stroke="#409eff" stroke-width="2">
                  <rect x="2" y="7" width="20" height="10" rx="2"/>
                  <path d="M6 11h.01M10 11h.01M14 11h.01M18 11h.01"/>
                </svg>
              </div>
            </div>
            <div class="card-content">
              <div class="card-row-1">
                <span class="label dark">总 数:</span>
                <span class="value blue bold">1280</span>
              </div>
              <div class="card-row-2">
                <span class="sub-label dark">南北接线设备</span>
                <span class="sub-value dark">异常数:<span class="red bold">3</span></span>
              </div>
            </div>
            <div class="card-arrow gray-arrow"></div>
          </div>
        </div>

        <!-- 设备列表区 -->
        <div class="device-grid">
          <div v-for="(device, index) in devices" :key="index" class="device-item">
            <div class="device-icon-area">
              <div class="device-base">
                <div class="base-plate"></div>
                <div class="base-glow"></div>
              </div>
              <div class="device-svg">
                <!-- 简单模拟图标 -->
                <component :is="getIcon(device.name)" />
              </div>
            </div>
            <div class="device-info">
              <div class="device-name">{{ device.name }}</div>
              <div class="device-status">
                <span :class="['status-num', device.abnormal > 0 ? 'red' : 'cyan']">({{ device.abnormal }}</span>
                <span class="status-total">/{{ device.total }})</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

// 简单的 SVG 图标组件映射
const icons = {
  '摄像机': `<svg viewBox="0 0 24 24" fill="#409eff"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
  '风速风向仪': `<svg viewBox="0 0 24 24" fill="none" stroke="#409eff" stroke-width="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>`,
  '超高检测器': `<svg viewBox="0 0 24 24" fill="#409eff"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  '烟道机器人': `<svg viewBox="0 0 24 24" fill="#409eff"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`,
  '激光雷达': `<svg viewBox="0 0 24 24" fill="none" stroke="#409eff" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  'CO2传感器': `<svg viewBox="0 0 24 24" fill="#409eff"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><text x="12" y="16" font-size="6" text-anchor="middle" fill="#fff">CO2</text></svg>`,
  'CO/VI检测器': `<svg viewBox="0 0 24 24" fill="#409eff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
  '温湿度传感器': `<svg viewBox="0 0 24 24" fill="#409eff"><path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-2V5c0-.55.45-1 1-1s1 .45 1 1v1h-1v1h1v2h-1v1h1v1h-2z"/></svg>`,
  '压力传感器': `<svg viewBox="0 0 24 24" fill="none" stroke="#409eff" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  '光照度变送器': `<svg viewBox="0 0 24 24" fill="#409eff"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  '紧急电话': `<svg viewBox="0 0 24 24" fill="#409eff"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`,
  '水质监测设备': `<svg viewBox="0 0 24 24" fill="#409eff"><path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.79 6 9.14 0 3.63-2.65 6.2-6 6.2z"/></svg>`
};

const getIcon = (name) => {
  // 返回一个简单的 div 包含 SVG 字符串，实际项目中可以用 v-html 或组件
  return {
    template: `<div v-html="svg"></div>`,
    data() { return { svg: icons[name] || icons['摄像机'] } }
  };
};

const devices = ref([
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
]);
</script>

<style scoped>
/* 全局重置与基础样式 */
* {
  box-sizing: border-box;
}

.dashboard-container {
  width: 100%;
  height: 100vh;
  background-color: #9caebf; /* 截图背景色 */
  font-family: "Microsoft YaHei", sans-serif;
  color: #333;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
}

/* 顶部标题栏 */
.top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 40px;
}

.title {
  color: #5cadff; /* 浅蓝色标题 */
  font-size: 28px;
  margin: 0;
  font-weight: bold;
  letter-spacing: 2px;
}

.global-stats {
  display: flex;
  gap: 30px;
  font-size: 20px;
  color: #333; /* 深灰色文字 */
  font-weight: 500;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.icon-eq {
  color: #409eff;
  font-size: 24px;
  margin-right: 5px;
}

.num {
  font-weight: bold;
  font-size: 24px;
  margin-left: 5px;
}

.num.blue { color: #409eff; }
.num.green { color: #00bfa5; } /* 98% 的颜色 */

/* 主体布局 */