<template>
  <div class="dashboard-container">
    <!-- 顶部统计栏 -->
    <header class="top-bar">
      <div class="header-left">
        <div class="title-icon">📊</div>
        <span class="title-text">设备监测</span>
      </div>
      <div class="header-stats">
        <div class="stat-item">
          <span class="stat-icon">📋</span>
          <span class="stat-label">设备类型</span>
          <span class="stat-value blue">28</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">📦</span>
          <span class="stat-label">设备总数</span>
          <span class="stat-value blue">68562</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">完好率</span>
          <span class="stat-value green">98%</span>
        </div>
      </div>
    </header>

    <!-- 主体内容 -->
    <div class="main-body">
      <!-- 左侧导航栏 -->
      <aside class="sidebar">
        <div class="nav-badge-top">3/3740</div>
        <div class="nav-item active">
          <span class="nav-text">监控</span>
        </div>
        <div class="nav-item relative">
          <span class="nav-text">照明</span>
          <span class="badge-red">3</span>
        </div>
        <div class="nav-item">
          <span class="nav-text">通风</span>
        </div>
        <div class="nav-item">
          <span class="nav-text">供配电</span>
        </div>
        <div class="nav-item">
          <span class="nav-text">消防</span>
        </div>
        <div class="nav-item">
          <span class="nav-text">交通诱导</span>
        </div>
      </aside>

      <!-- 右侧内容区 -->
      <div class="content-area">
        <!-- 右上数据卡片区 -->
        <div class="top-cards">
          <div class="big-card card-blue">
            <div class="card-header-row">
              <div class="card-icon-box">
                <div class="icon-circle">📡</div>
              </div>
              <div class="card-title-group">
                <span class="card-title">总 数:56302</span>
                <span class="card-subtitle">隧道设备 异常数:<span class="text-red">5</span></span>
              </div>
            </div>
          </div>
          <div class="big-card card-gray">
            <div class="card-header-row">
              <div class="card-icon-box">
                <div class="icon-circle-gray">🌐</div>
              </div>
              <div class="card-title-group">
                <span class="card-title-dark">总 数:1280</span>
                <span class="card-subtitle-dark">南北接线设备 异常数:<span class="text-red">3</span></span>
              </div>
            </div>
          </div>
        </div>

        <!-- 右下设备网格区 -->
        <div class="device-grid">
          <div class="grid-item" v-for="device in devices" :key="device.name">
            <div class="device-icon"></div>
            <div class="device-name">{{ device.name }}</div>
            <div class="device-value">({{ device.current }}/{{ device.total }})</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const devices = [
  { name: '摄像机', current: 2, total: 484 },
  { name: '风速风向仪', current: 1, total: 484 },
  { name: '超高检测器', current: 0, total: 484 },
  { name: '烟道机器人', current: 0, total: 484 },
  { name: '激光雷达', current: 0, total: 484 },
  { name: 'CO₂传感器', current: 0, total: 484 },
  { name: 'CO/VI检测器', current: 0, total: 484 },
  { name: '温湿度传感器', current: 0, total: 484 },
  { name: '压力传感器', current: 0, total: 484 },
  { name: '光照度变送器', current: 0, total: 484 },
  { name: '紧急电话', current: 0, total: 484 },
  { name: '水质监测设备', current: 0, total: 484 },
];
</script>

<style scoped>
.dashboard-container {
  width: 100%;
  height: 100vh;
  background-color: #0f172a;
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
}

/* 顶部统计栏 */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #1e293b;
  padding: 10px 20px;
  border-radius: 4px;
  margin-bottom: 10px;
  border: 1px solid #334155;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  font-size: 20px;
  color: #3b82f6;
}

.title-text {
  font-size: 18px;
  font-weight: bold;
  color: #60a5fa;
}

.header-stats {
  display: flex;
  gap: 30px;
  align-items: center;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
}

.stat-label {
  color: #94a3b8;
}

.stat-value {
  font-weight: bold;
  font-size: 18px;
}

.stat-value.blue {
  color: #3b82f6;
}

.stat-value.green {
  color: #10b981;
}

/* 主体内容 */
.main-body {
  display: flex;
  flex: 1;
  gap: 10px;
  overflow: hidden;
}

/* 左侧导航栏 */
.sidebar {
  width: 60px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  position: relative;
}

.nav-badge-top {
  position: absolute;
  top: -20px;
  left: 0;
  background: #fff;
  color: #333;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 2px;
  z-index: 10;
}

.nav-item {
  background-color: #1e3a8a;
  color: #fff;
  padding: 15px 5px;
  text-align: center;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.nav-item.active {
  background-color: #3b82f6;
  font-weight: bold;
}

.nav-item.relative {
  position: relative;
}

.badge-red {
  position: absolute;
  top: -5px;
  right: -5px;
  background-color: #ef4444;
  color: white;
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 10px;
  writing-mode: horizontal-tb;
}

/* 右侧内容区 */
.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 右上数据卡片区 */
.top-cards {
  display: flex;
  gap: 10px;
  height: 120px;
}

.big-card {
  flex: 1;
  border-radius: 8px;
  padding: 15px;
  display: flex;
  align-items: center;
  position: relative;
  overflow: hidden;
}

.card-blue {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
}

.card-gray {
  background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
  clip-path: polygon(5% 0, 100% 0, 100% 100%, 5% 100%, 0 50%);
  color: #1e293b;
}

.card-header-row {
  display: flex;
  align-items: center;
  gap: 15px;
  width: 100%;
}

.card-icon-box {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.icon-circle {
  width: 50px;
  height: 50px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.icon-circle-gray {
  width: 50px;
  height: 50px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  border: 2px solid rgba(255, 255, 255, 0.8);
}

.card-title-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.card-title {
  font-size: 24px;
  font-weight: bold;
  color: #fff;
}

.card-title-dark {
  font-size: 24px;
  font-weight: bold;
  color: #1e3a8a;
}

.card-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.card-subtitle-dark {
  font-size: 14px;
  color: #475569;
}

.text-red {
  color: #ef4444;
  font-weight: bold;
}

/* 右下设备网格区 */
.device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 10px;
}

.grid-item {
  background-color: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px;
  gap: 8px;
}

.device-icon {
  font-size: 24px;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #3b82f6;
}

.device-name {
  font-size: 14px;
  color: #cbd5e1;
}

.device-value {
  font-size: 16px;
  color: #3b82f6;
  font-weight: bold;
}
</style>