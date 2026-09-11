<template>
  <div class="equipment-monitor">
    <!-- 顶部标题栏 -->
    <div class="equipment-monitor-header">
      <span class="equipment-monitor-title">设备监测</span>
      <div class="equipment-monitor-stats">
        <span class="equipment-monitor-stat-item">
          <span class="equipment-monitor-stat-label">设备类型</span>
          <span class="equipment-monitor-stat-value">28</span>
        </span>
        <span class="equipment-monitor-stat-item">
          <span class="equipment-monitor-stat-label">设备总数</span>
          <span class="equipment-monitor-stat-value">68562</span>
        </span>
        <span class="equipment-monitor-stat-item">
          <span class="equipment-monitor-stat-label">完好率</span>
          <span class="equipment-monitor-stat-value">98%</span>
        </span>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="equipment-monitor-main">
      <!-- 左侧导航栏 -->
      <div class="equipment-monitor-nav">
        <div class="equipment-monitor-nav-badge">3/3740</div>
        <button class="equipment-monitor-nav-btn">监控</button>
        <button class="equipment-monitor-nav-btn equipment-monitor-nav-btn-active">
          照明
          <span class="equipment-monitor-nav-btn-badge">3</span>
        </button>
        <button class="equipment-monitor-nav-btn">通风</button>
        <button class="equipment-monitor-nav-btn">供配电</button>
        <button class="equipment-monitor-nav-btn">消防</button>
        <button class="equipment-monitor-nav-btn">交通诱导</button>
      </div>

      <!-- 右侧内容区 -->
      <div class="equipment-monitor-content">
        <!-- 统计卡片区 -->
        <div class="equipment-monitor-summary">
          <div class="equipment-monitor-summary-card equipment-monitor-summary-card-left">
            <div class="equipment-monitor-summary-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
              </svg>
            </div>
            <div class="equipment-monitor-summary-info">
              <div class="equipment-monitor-summary-label">隧道设备</div>
              <div class="equipment-monitor-summary-row">
                <span class="equipment-monitor-summary-text">总数:</span>
                <span class="equipment-monitor-summary-number">56302</span>
              </div>
              <div class="equipment-monitor-summary-row">
                <span class="equipment-monitor-summary-text">异常数:</span>
                <span class="equipment-monitor-summary-number equipment-monitor-summary-number-error">5</span>
              </div>
            </div>
          </div>

          <div class="equipment-monitor-summary-card equipment-monitor-summary-card-right">
            <div class="equipment-monitor-summary-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
            </div>
            <div class="equipment-monitor-summary-info">
              <div class="equipment-monitor-summary-label">南北接线<br>设备</div>
              <div class="equipment-monitor-summary-row">
                <span class="equipment-monitor-summary-text">总数:</span>
                <span class="equipment-monitor-summary-number">1280</span>
              </div>
              <div class="equipment-monitor-summary-row">
                <span class="equipment-monitor-summary-text">异常数:</span>
                <span class="equipment-monitor-summary-number equipment-monitor-summary-number-error">3</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 设备网格 -->
        <div class="equipment-monitor-grid">
          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">摄像机</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-error">(2/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">风速风向仪</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-error">(1/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm0-4h2v2h-2z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">超高检测器</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">烟道机器人</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5l7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">激光雷达</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-5h2v5zm4 0h-2v-3h2v3zm0-5h-2v-2h2v2zm4 5h-2V7h2v10z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">CO₂传感器</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">CO/VI检测器</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">温湿度传感器</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">压力传感器</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.69 2 6 4.69 6 8c0 2.5 1.5 4.67 3.67 5.67L8 22h8l-1.67-8.33C16.5 12.67 18 10.5 18 8c0-3.31-2.69-6-6-6zm0 2c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">光照度变送器</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">紧急电话</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>

          <div class="equipment-monitor-device-card">
            <div class="equipment-monitor-device-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
            <div class="equipment-monitor-device-name">水质监测设备</div>
            <div class="equipment-monitor-device-status equipment-monitor-device-status-normal">(0/484)</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #E4EEF9;
  padding: 10px;
  display: flex;
  flex-direction: column;
  font-family: 'Microsoft YaHei', sans-serif;
  min-height: 0;
}

/* 顶部标题栏 */
.equipment-monitor-header {
  height: 30px;
  background: linear-gradient(90deg, #1E5BA8 0%, #2B7BC9 100%);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  flex-shrink: 0;
}

.equipment-monitor-title {
  font-size: 14px;
  font-weight: 500;
  color: #88D4FF;
}

.equipment-monitor-stats {
  display: flex;
  gap: 16px;
}

.equipment-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.equipment-monitor-stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.equipment-monitor-stat-value {
  font-size: 14px;
  font-weight: 700;
  color: #3B9EFF;
}

/* 主内容区 */
.equipment-monitor-main {
  flex: 1;
  display: flex;
  gap: 8px;
  margin-top: 10px;
  min-height: 0;
}

/* 左侧导航栏 */
.equipment-monitor-nav {
  width: 38px;
  background: rgba(30, 91, 168, 0.15);
  border-radius: 6px;
  padding: 22px 5px 5px 5px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  flex-shrink: 0;
  overflow: visible;
}

.equipment-monitor-nav-badge {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  background: #FF4D4F;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 8px;
  white-space: nowrap;
  z-index: 10;
}

.equipment-monitor-nav-btn {
  writing-mode: vertical-rl;
  white-space: nowrap;
  background: rgba(59, 158, 255, 0.2);
  border: none;
  border-radius: 4px;
  color: #2C5AA0;
  font-size: 11px;
  font-weight: 500;
  padding: 8px 6px;
  cursor: pointer;
  position: relative;
  letter-spacing: 1px;
  height: 52px;
  flex-shrink: 0;
}

.equipment-monitor-nav-btn:hover {
  background: rgba(59, 158, 255, 0.35);
}

.equipment-monitor-nav-btn-active {
  background: rgba(59, 158, 255, 0.4);
}

.equipment-monitor-nav-btn-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #FF4D4F;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: horizontal-tb;
  z-index: 2;
}

/* 右侧内容区 */
.equipment-monitor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

/* 统计卡片区 */
.equipment-monitor-summary {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.equipment-monitor-summary-card {
  flex: 1;
  height: 80px;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  overflow: hidden;
}

.equipment-monitor-summary-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 60%;
  height: 100%;
  background: linear-gradient(135deg, transparent 30%, rgba(255, 255, 255, 0.1) 100%);
  clip-path: polygon(20% 0, 100% 0, 100% 100%, 0 100%);
}

.equipment-monitor-summary-card-left {
  background: linear-gradient(135deg, #2563B8 0%, #3B7FD8 100%);
}

.equipment-monitor-summary-card-right {
  background: linear-gradient(135deg, #4A8FCA 0%, #7AB8E8 100%);
}

.equipment-monitor-summary-icon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}

.equipment-monitor-summary-icon svg {
  width: 24px;
  height: 24px;
}

.equipment-monitor-summary-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.equipment-monitor-summary-label {
  font-size: 12px;
  font-weight: 500;
  color: #E8F4FF;
  line-height: 1.2;
}

.equipment-monitor-summary-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.equipment-monitor-summary-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
}

.equipment-monitor-summary-number {
  font-size: 16px;
  font-weight: 700;
  color: #00D4FF;
}

.equipment-monitor-summary-number-error {
  color: #FF4D4F;
}

/* 设备网格 */
.equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, min-content);
  gap: 8px;
  overflow-y: auto;
  align-content: start;
  min-height: 0;
}

.equipment-monitor-device-card {
  background: rgba(255, 255, 255, 0.35);
  border: 1px solid rgba(59, 158, 255, 0.25);
  border-radius: 6px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.equipment-monitor-device-card:hover {
  background: rgba(255, 255, 255, 0.5);
  border-color: rgba(59, 158, 255, 0.5);
  transform: translateY(-2px);
}

.equipment-monitor-device-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(59, 158, 255, 0.2) 0%, rgba(59, 158, 255, 0.4) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3B9EFF;
  flex-shrink: 0;
}

.equipment-monitor-device-icon svg {
  width: 18px;
  height: 18px;
}

.equipment-monitor-device-name {
  font-size: 11px;
  font-weight: 500;
  color: #2C3E50;
  text-align: center;
  line-height: 1.3;
}

.equipment-monitor-device-status {
  font-size: 12px;
  font-weight: 700;
}

.equipment-monitor-device-status-normal {
  color: #00D4FF;
}

.equipment-monitor-device-status-error {
  color: #FF4D4F;
}
</style>