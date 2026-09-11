<template>
  <div class="panel-container">
    <!-- 标题区 -->
    <div class="header">
      <h2 class="title">环境监测</h2>
    </div>

    <!-- 导航操作区 -->
    <div class="nav-bar">
      <div class="tabs-container">
        <div class="tab active">一氧化碳</div>
        <div class="tab">能见度</div>
        <div class="tab">洞内照明</div>
        <div class="tab">洞外光强</div>
      </div>
      
      <div class="actions">
        <div class="icon-btn chart-icon">
          <div class="bar b1"></div>
          <div class="bar b2"></div>
          <div class="bar b3"></div>
        </div>
        <div class="icon-btn list-icon-wrapper">
          <div class="icon-btn list-icon">
            <div class="line l1"></div>
            <div class="line l2"></div>
            <div class="line l3"></div>
          </div>
          <div class="badge">6</div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-area">
      <div class="y-axis-label">辆</div>
      
      <div class="legend">
        <span class="legend-line"></span>
        <span class="legend-text">zk3+785CO浓度</span>
      </div>

      <div class="chart-content">
        <!-- Y轴刻度 -->
        <div class="y-axis">
          <div class="tick" style="top: 0%">50</div>
          <div class="tick" style="top: 20%">40</div>
          <div class="tick" style="top: 40%">30</div>
          <div class="tick" style="top: 60%">20</div>
          <div class="tick" style="top: 80%">10</div>
          <div class="tick" style="top: 100%">0</div>
        </div>

        <!-- SVG 绘图区 -->
        <div class="svg-container">
          <svg viewBox="0 0 800 300" preserveAspectRatio="none" class="chart-svg">
            <!-- 网格线 -->
            <line x1="0" y1="60" x2="800" y2="60" stroke="#fff" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"/>
            <line x1="0" y1="120" x2="800" y2="120" stroke="#fff" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"/>
            <line x1="0" y1="180" x2="800" y2="180" stroke="#fff" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"/>
            <line x1="0" y1="240" x2="800" y2="240" stroke="#fff" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"/>
            <line x1="0" y1="300" x2="800" y2="300" stroke="#fff" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"/>

            <!-- 预警线 (30 -> 180px height in 300px total, 0 is bottom) -->
            <!-- 50 is top (0px), 0 is bottom (300px). 30 is at 300 - (30/50)*300 = 120px -->
            <line x1="0" y1="120" x2="800" y2="120" stroke="#d9534f" stroke-width="2" stroke-dasharray="6 4"/>
            <text x="750" y="110" fill="#d9534f" font-size="14">预警线</text>

            <!-- 面积图填充 -->
            <path d="M 0,270 Q 100,260 200,275 T 400,260 T 500,210 T 650,230 T 800,280 L 800,300 L 0,300 Z" fill="rgba(100, 220, 150, 0.3)" />
            
            <!-- 折线 -->
            <path d="M 0,270 Q 100,260 200,275 T 400,260 T 500,210 T 650,230 T 800,280" fill="none" stroke="#66cc99" stroke-width="2" />
          </svg>
        </div>

        <!-- X轴刻度 -->
        <div class="x-axis">
          <div class="tick" style="left: 4%">2</div>
          <div class="tick" style="left: 12%">4</div>
          <div class="tick" style="left: 21%">6</div>
          <div class="tick" style="left: 29%">8</div>
          <div class="tick" style="left: 37%">10</div>
          <div class="tick" style="left: 45%">12</div>
          <div class="tick" style="left: 54%">14</div>
          <div class="tick" style="left: 62%">16</div>
          <div class="tick" style="left: 70%">18</div>
          <div class="tick" style="left: 79%">20</div>
          <div class="tick" style="left: 87%">22</div>
          <div class="tick" style="left: 95%">24</div>
          <div class="tick unit" style="left: 98%">时</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 无脚本逻辑
</script>

<style scoped>
.panel-container {
  width: 100%;
  height: 100%;
  background-color: #dcdcdc; /* 截图背景色 */
  padding: 20px;
  box-sizing: border-box;
  font-family: sans-serif;
  display: flex;
  flex-direction: column;
  border: 2px solid #000; /* 模拟截图黑色边框 */
  position: relative;
  overflow: hidden;
}

/* 标题区 */
.header {
  margin-bottom: 15px;
}
.title {
  color: #5bc0de;
  font-size: 20px;
  margin: 0;
  font-weight: bold;
}

/* 导航操作区 */
.nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 0 10px;
}

.tabs-container {
  display: flex;
  align-items: center;
  background: rgba(255,255,255,0.1); /* 轻微背景 */
  border-radius: 20px;
  padding: 2px;
}

.tab {
  padding: 8px 20px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  border-radius: 18px;
  margin-right: 5px;
}

.tab.active {
  background-color: #5bc0de;
  color: #fff;
  font-weight: bold;
}

.actions {
  display: flex;
  gap: 15px;
  align-items: center;
}

.icon-btn {
  width: 32px;
  height: 32px;
  background-color: #5bc0de; /* 图标背景 */
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  cursor: pointer;
}

/* 柱状图图标 */
.chart-icon {
  gap: 3px;
  padding: 6px;
  box-sizing: border-box;
}
.bar {
  width: 4px;
  background-color: #fff;
  border-radius: 1px;
}
.b1 { height: 10px; }
.b2 { height: 16px; }
.b3 { height: 12px; }

/* 列表图标 */
.list-icon-wrapper {
  background: transparent;
  width: auto;
  height: auto;
}
.list-icon {
  gap: 3px;
  padding: 6px;
  box-sizing: border-box;
  flex-direction: column;
}
.line {
  width: 16px;
  height: 3px;
  background-color: #fff;
  border-radius: 1px;
}

/* 角标 */
.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #d9534f;
  color: #fff;
  font-size: 12px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
}

/* 图表区 */
.chart-area {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
}

.y-axis-label {
  position: absolute;
  top: -10px;
  left: 0;
  font-size: 12px;
  color: #666;
}

.legend {
  position: absolute;
  top: 10px;
  right: 20px;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #333;
  z-index: 10;
}
.legend-line {
  display: inline-block;
  width: 20px;
  height: 2px;
  background-color: #66cc99;
  margin-right: 5px;
}

.chart-content {
  flex: 1;
  position: relative;
  margin-top: 20px;
  margin-left: 30px; /* 给Y轴留空间 */
  margin-bottom: 20px; /* 给X轴留空间 */
}

.y-axis {
  position: absolute;
  left: -30px;
  top: 0;
  bottom: 0;
  width: 30px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  font-size: 12px;
  color: #666;
  padding-bottom: 20px; /* 对齐X轴 */
}
.y-axis .tick {
  transform: translateY(-50%);
}
.y-axis .tick:first-child { transform: translateY(0); }
.y-axis .tick:last-child { transform: translateY(0); }

.x-axis {
  position: absolute;
  bottom: -25px;
  left: 0;
  right: 0;
  height: 20px;
  font-size: 12px;
  color: #666;
}
.x-axis .tick {
  position: absolute;
  transform: translateX(-50%);
}
.x-axis .unit {
  transform: translateX(0);
}

.svg-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}
.chart-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

</style>