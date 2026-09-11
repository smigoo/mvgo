<template>
  <div class="mc-container">
    <!-- 顶部区域 -->
    <div class="header">
      <div class="title-row">
        <span class="main-title">环境监测</span>
      </div>
      
      <div class="nav-row">
        <div class="tabs">
          <div class="tab active">
            <span class="tab-text">一氧化碳</span>
          </div>
          <div class="tab">
            <span class="tab-text">能见度</span>
          </div>
          <div class="tab">
            <span class="tab-text">洞内照明</span>
          </div>
          <div class="tab">
            <span class="tab-text">洞外光强</span>
          </div>
        </div>

        <div class="icons">
          <div class="icon-box chart-icon">
            <div class="bar b1"></div>
            <div class="bar b2"></div>
            <div class="bar b3"></div>
          </div>
          <div class="icon-box list-icon">
            <div class="line l1"></div>
            <div class="line l2"></div>
            <div class="line l3"></div>
            <div class="badge">6</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="chart-area">
      <!-- 图例 -->
      <div class="legend">
        <span class="legend-line"></span>
        <span class="legend-text">zk3+785CO浓度</span>
      </div>

      <!-- Y轴标签 -->
      <div class="y-axis">
        <div class="y-label-unit">铺</div>
        <div class="y-labels">
          <div class="y-label">50</div>
          <div class="y-label">40</div>
          <div class="y-label warn-label">30</div>
          <div class="y-label">20</div>
          <div class="y-label">10</div>
          <div class="y-label">0</div>
        </div>
      </div>

      <!-- 图表主体 SVG -->
      <div class="svg-container">
        <svg viewBox="0 0 800 300" preserveAspectRatio="none" class="chart-svg">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2ecc71" stop-opacity="0.4" />
              <stop offset="100%" stop-color="#2ecc71" stop-opacity="0.05" />
            </linearGradient>
          </defs>

          <!-- 网格线 -->
          <line x1="0" y1="60" x2="800" y2="60" stroke="#ccc" stroke-width="1" stroke-dasharray="4,4" />
          <line x1="0" y1="120" x2="800" y2="120" stroke="#ccc" stroke-width="1" stroke-dasharray="4,4" />
          <line x1="0" y1="180" x2="800" y2="180" stroke="#ccc" stroke-width="1" stroke-dasharray="4,4" />
          <line x1="0" y1="240" x2="800" y2="240" stroke="#ccc" stroke-width="1" stroke-dasharray="4,4" />
          
          <!-- 预警线 (30的位置，对应y=180，假设0在300，50在0，每10单位60px。30对应 300 - 3*60 = 120? 不对。
               0 -> 300 (bottom)
               50 -> 0 (top) -> 实际上留点边距。
               设高度300。
               0 -> 280
               50 -> 20
               间距 (280-20)/5 = 52px.
               30 -> 280 - 3*52 = 124.
          -->
          <line x1="0" y1="124" x2="800" y2="124" stroke="#e74c3c" stroke-width="1.5" stroke-dasharray="6,4" />
          <text x="750" y="115" fill="#e74c3c" font-size="14">预警线</text>

          <!-- 面积填充 -->
          <path d="M 20,260 C 100,250 150,270 250,275 C 350,280 400,220 500,200 C 600,180 700,240 780,270 L 780,280 L 20,280 Z" fill="url(#areaGradient)" />
          
          <!-- 曲线 -->
          <path d="M 20,260 C 100,250 150,270 250,275 C 350,280 400,220 500,200 C 600,180 700,240 780,270" fill="none" stroke="#2ecc71" stroke-width="2" />
        </svg>
      </div>

      <!-- X轴标签 -->
      <div class="x-axis">
        <div class="x-labels">
          <span>2</span><span>4</span><span>6</span><span>8</span><span>10</span><span>12</span>
          <span>14</span><span>16</span><span>18</span><span>20</span><span>22</span><span>24</span>
        </div>
        <div class="x-label-unit">时</div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 静态布局组件，无逻辑
</script>

<style scoped>
.mc-container {
  width: 100%;
  height: 100%;
  background-color: #dcdcdc;
  border: 2px solid #333; /* 模拟截图的黑色边框 */
  display: flex;
  flex-direction: column;
  font-family: sans-serif;
  box-sizing: border-box;
  padding: 10px;
  position: relative;
}

/* 顶部区域 */
.header {
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
}

.title-row {
  margin-bottom: 10px;
}

.main-title {
  color: #5dade2;
  font-size: 20px;
  font-weight: bold;
}

.nav-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255,255,255,0.1); /* 稍微区分一下 */
  padding: 5px 10px;
  border-radius: 4px;
}

.tabs {
  display: flex;
  gap: 5px;
  align-items: center;
}

.tab {
  padding: 6px 15px;
  color: #333;
  font-size: 14px;
  cursor: pointer;
  position: relative;
}

.tab.active {
  background-color: #85c1e9; /* 浅蓝色 */
  color: white;
  /* 模拟箭头形状 */
  clip-path: polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%);
  padding: 6px 20px;
  font-weight: bold;
}

.tab-text {
  white-space: nowrap;
}

.icons {
  display: flex;
  gap: 15px;
  align-items: center;
}

.icon-box {
  width: 30px;
  height: 30px;
  background-color: #5dade2; /* 蓝色背景图标 */
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  cursor: pointer;
}

/* 柱状图图标模拟 */
.chart-icon {
  gap: 2px;
  padding: 6px;
  box-sizing: border-box;
}
.bar {
  width: 4px;
  background: white;
  border-radius: 1px;
}
.b1 { height: 10px; }
.b2 { height: 16px; }
.b3 { height: 12px; }

/* 列表图标模拟 */
.list-icon {
  flex-direction: column;
  gap: 3px;
  padding: 6px;
  box-sizing: border-box;
}
.line {
  width: 16px;
  height: 2px;
  background: white;
}

.badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background-color: #e74c3c;
  color: white;
  font-size: 10px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
}

/* 图表区域 */
.chart-area {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  padding-left: 40px; /* 给Y轴留空间 */
  padding-bottom: 30px; /* 给X轴留空间 */
}

.legend {
  position: absolute;
  top: 10px;
  right: 20px;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #333;
}

.legend-line {
  display: inline-block;
  width: 20px;
  height: 2px;
  background-color: #2ecc71;
  margin-right: 5px;
}

.y-axis {
  position: absolute;
  left: 0;
  top: 20px;
  bottom: 30px;
  width: 40px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  padding-right: 5px;
  box-sizing: border-box;
}

.y-label-unit {
  position: absolute;
  top: -20px;
  left: 0;
  font-size: 12px;
  color: #666;
}

.y-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  text-align: right;
  font-size: 12px;
  color: #666;
}

.warn-label {
  color: #e74c3c;
}

.svg-container {
  flex: 1;
  position: relative;
  margin-left: 10px;
  border-bottom: 1px solid #ccc; /* X轴线 */
  border-left: 1px solid #ccc; /* Y轴线 */
}

.chart-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.x-axis {
  position: absolute;
  bottom: 0;
  left: 40px;
  right: 0;
  height: 30px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-top: 5px;
  box-sizing: border-box;
}

.x-labels {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-size: 12px;
  color: #666;
  padding: 0 10px;
  box-sizing: border-box;
}

.x-label-unit {
  position: absolute;
  right: 0;
  bottom: 5px;
  font-size: 12px;
  color: #666;
}
</style>