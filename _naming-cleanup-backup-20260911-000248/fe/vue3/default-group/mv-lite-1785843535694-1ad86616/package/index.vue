<template>
  <div class="dashboard-container">
    <!-- 顶部导航区 -->
    <div class="header-section">
      <div class="title-row">
        <h1 class="main-title">环境监测</h1>
      </div>
      
      <div class="nav-row">
        <div class="tabs-wrapper">
          <div class="tabs-container">
            <div class="tab-item active">一氧化碳</div>
            <div class="tab-item">能见度</div>
            <div class="tab-item">洞内照明</div>
            <div class="tab-item">洞外光强</div>
          </div>
        </div>

        <div class="icon-group">
          <div class="icon-btn chart-icon">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <rect x="4" y="12" width="4" height="8" fill="#5bc0be" rx="1"/>
              <rect x="10" y="6" width="4" height="14" fill="#5bc0be" rx="1"/>
              <rect x="16" y="10" width="4" height="10" fill="#5bc0be" rx="1"/>
            </svg>
          </div>
          <div class="icon-btn list-icon">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <rect x="4" y="4" width="16" height="3" fill="#5bc0be" rx="1"/>
              <rect x="4" y="10" width="16" height="3" fill="#5bc0be" rx="1"/>
              <rect x="4" y="16" width="16" height="3" fill="#5bc0be" rx="1"/>
            </svg>
            <span class="badge">6</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表展示区 -->
    <div class="chart-section">
      <div class="legend-area">
        <div class="legend-item">
          <span class="legend-line"></span>
          <span class="legend-text">zk3+785CO浓度</span>
        </div>
      </div>

      <div class="chart-content">
        <!-- Y轴标签 -->
        <div class="y-axis-labels">
          <div class="y-unit">辆</div>
          <div class="y-label">40</div>
          <div class="y-label warning-label">30</div>
          <div class="y-label">20</div>
          <div class="y-label">10</div>
          <div class="y-label">0</div>
        </div>

        <!-- 图表主体 -->
        <div class="chart-graph">
          <!-- 网格线 -->
          <div class="grid-lines">
            <div class="grid-line" style="top: 0%"></div>
            <div class="grid-line warning-line" style="top: 25%">
              <span class="warning-text">预警线</span>
            </div>
            <div class="grid-line" style="top: 50%"></div>
            <div class="grid-line" style="top: 75%"></div>
            <div class="grid-line" style="top: 100%"></div>
          </div>

          <!-- SVG 曲线 -->
          <svg class="data-svg" viewBox="0 0 1000 200" preserveAspectRatio="none">
            <!-- 面积填充 -->
            <path 
              d="M 0 170 Q 50 160 100 165 T 200 175 T 300 180 T 400 170 T 500 140 T 600 120 T 700 125 T 800 140 T 900 170 T 1000 190 L 1000 200 L 0 200 Z" 
              fill="rgba(91, 192, 190, 0.3)" 
            />
            <!-- 折线 -->
            <path 
              d="M 0 170 Q 50 160 100 165 T 200 175 T 300 180 T 400 170 T 500 140 T 600 120 T 700 125 T 800 140 T 900 170 T 1000 190" 
              fill="none" 
              stroke="#5bc0be" 
              stroke-width="3"
            />
          </svg>
        </div>

        <!-- X轴标签 -->
        <div class="x-axis-labels">
          <div class="x-label" v-for="i in 12" :key="i">{{ i * 2 }}</div>
          <div class="x-unit">时</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 无需额外逻辑，纯展示组件
</script>

<style scoped>
.dashboard-container {
  background-color: #a4adb5;
  color: #ffffff;
  font-family: "Microsoft YaHei", sans-serif;
  padding: 20px;
  border-radius: 8px;
  width: 100%;
  max-width: 900px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

/* 顶部导航区 */
.header-section {
  margin-bottom: 20px;
}

.title-row {
  margin-bottom: 10px;
}

.main-title {
  color: #64b5f6; /* 浅蓝色标题 */
  font-size: 24px;
  margin: 0;
  font-weight: bold;
  letter-spacing: 1px;
}

.nav-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tabs-wrapper {
  flex: 1;
  margin-right: 20px;
}

.tabs-container {
  display: flex;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 4px;
  align-items: center;
}

.tab-item {
  padding: 8px 20px;
  font-size: 16px;
  color: #ffffff;
  cursor: pointer;
  border-radius: 16px;
  transition: all 0.3s;
}

.tab-item.active {
  background-color: #5bc0be; /* 选中态深青色 */
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.icon-group {
  display: flex;
  gap: 10px;
}

.icon-btn {
  background-color: #ffffff;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  width: 36px;
  height: 36px;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #ff4d4f;
  color: white;
  font-size: 12px;
  font-weight: bold;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #a4adb5; /* 与背景色融合 */
}

/* 图表展示区 */
.chart-section {
  position: relative;
  height: 300px;
}

.legend-area {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #333; /* 图例文字颜色较深，因为背景是灰的，但截图里看起来像黑色或深灰 */
  color: #2c3e50;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-line {
  display: inline-block;
  width: 20px;
  height: 3px;
  background-color: #5bc0be;
}

.chart-content {
  display: flex;
  height: 100%;
  margin-top: 20px;
  position: relative;
}

.y-axis-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 200px; /* 对应图表高度 */
  padding-right: 10px;
  font-size: 14px;
  color: #555;
  position: relative;
}

.y-unit {
  position: absolute;
  top: -25px;
  left: 0;
  color: #555;
}

.y-label {
  line-height: 1;
}

.warning-label {
  color: #ff4d4f;
}

.chart-graph {
  flex: 1;
  position: relative;
  height: 200px;
}

.grid-lines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
}

.grid-line {
  width: 100%;
  border-top: 1px dashed rgba(255, 255, 255, 0.5);
  position: relative;
}

.warning-line {
  border-top: 1px dashed #ff4d4f;
}

.warning-text {
  position: absolute;
  right: 0;
  top: -20px;
  color: #ff4d4f;
  font-size: 14px;
}

.data-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.x-axis-labels {
  position: absolute;
  bottom: -25px;
  left: 0; /* 对齐图表左侧，需要微调 */
  right: 0;
  display: flex;
  justify-content: space-between;
  padding-left: 20px; /* 稍微偏移以对齐刻度 */
  padding-right: 20px;
  font-size: 14px;
  color: #555;
}

.x-unit {
  position: absolute;
  right: -20px;
  bottom: 0;
  color: #555;
}

/* 调整X轴标签位置以匹配截图 */
.x-axis-labels {
  justify-content: space-around;
  padding-left: 40px; 
}

</style>