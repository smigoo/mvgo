<template>
  <div class="monitor-container">
    <!-- 标题栏 -->
    <div class="header">
      <h1 class="title">环境监测</h1>
    </div>

    <!-- 导航栏 -->
    <div class="nav-bar">
      <div class="tabs-wrapper">
        <div class="tabs-container">
          <div 
            v-for="tab in tabs" 
            :key="tab" 
            class="tab-item" 
            :class="{ active: currentTab === tab }"
            @click="currentTab = tab"
          >
            {{ tab }}
          </div>
        </div>
      </div>
      
      <div class="action-icons">
        <div class="icon-btn chart-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#5b9bd5">
            <rect x="4" y="12" width="4" height="8" rx="1"/>
            <rect x="10" y="6" width="4" height="14" rx="1"/>
            <rect x="16" y="16" width="4" height="4" rx="1"/>
          </svg>
        </div>
        <div class="icon-btn list-icon-wrapper">
          <div class="icon-btn list-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="#5b9bd5">
              <rect x="4" y="4" width="16" height="3" rx="1"/>
              <rect x="4" y="10" width="16" height="3" rx="1"/>
              <rect x="4" y="16" width="16" height="3" rx="1"/>
            </svg>
          </div>
          <span class="badge">6</span>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-area">
      <!-- 图例 -->
      <div class="legend">
        <span class="legend-line"></span>
        <span class="legend-text">zk3+785CO浓度</span>
      </div>

      <!-- Y轴单位 -->
      <div class="y-axis-label-top">辆</div>

      <!-- 预警线文字 -->
      <div class="warning-label">预警线</div>

      <svg class="chart-svg" viewBox="0 0 800 300" preserveAspectRatio="none">
        <!-- 网格线 -->
        <line x1="0" y1="60" x2="800" y2="60" stroke="#ffffff" stroke-width="1" stroke-dasharray="5,5" opacity="0.5"/>
        <line x1="0" y1="120" x2="800" y2="120" stroke="#ffffff" stroke-width="1" stroke-dasharray="5,5" opacity="0.5"/>
        <line x1="0" y1="180" x2="800" y2="180" stroke="#ffffff" stroke-width="1" stroke-dasharray="5,5" opacity="0.5"/>
        <line x1="0" y1="240" x2="800" y2="240" stroke="#ffffff" stroke-width="1" stroke-dasharray="5,5" opacity="0.5"/>
        
        <!-- 预警线 (y=30 -> 30/40 * 240 = 180 offset from bottom? No. 0 is at bottom) -->
        <!-- Height 300. Max 40. Scale: 300/40 = 7.5 px per unit. -->
        <!-- y=0 -> 280 (bottom padding) -->
        <!-- y=40 -> 40 (top padding) -->
        <!-- Range 240px. -->
        <!-- y=30 -> 280 - 30*6 = 100. Wait. 280 - (30/40)*240 = 280 - 180 = 100. -->
        <line x1="0" y1="100" x2="800" y2="100" stroke="#e74c3c" stroke-width="2" stroke-dasharray="5,5"/>

        <!-- 折线填充区域 -->
        <path :d="areaPath" fill="rgba(46, 204, 113, 0.3)" />
        
        <!-- 折线 -->
        <path :d="linePath" fill="none" stroke="#2ecc71" stroke-width="3" />
      </svg>

      <!-- 坐标轴标签 -->
      <div class="axis-labels y-axis">
        <span>40</span>
        <span class="warning-text">30</span>
        <span>20</span>
        <span>10</span>
        <span>0</span>
      </div>

      <div class="axis-labels x-axis">
        <span v-for="x in xTicks" :key="x">{{ x }}</span>
        <span class="x-unit">时</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];
const currentTab = ref('一氧化碳');

const xTicks = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

// 模拟数据
const dataPoints = [
  { x: 0, y: 5 },
  { x: 2, y: 6 },
  { x: 4, y: 7 },
  { x: 6, y: 6 },
  { x: 8, y: 3 },
  { x: 10, y: 2 },
  { x: 12, y: 5 },
  { x: 14, y: 12 },
  { x: 16, y: 14 },
  { x: 18, y: 13 },
  { x: 20, y: 10 },
  { x: 22, y: 5 },
  { x: 24, y: 0 }
];

// 图表尺寸映射
// SVG viewBox: 0 0 800 300
// X: 0-24 -> 0-800 (padding left 50, right 50 -> 700 width)
// Y: 0-40 -> 280-40 (height 240)
const width = 800;
const height = 300;
const paddingLeft = 60;
const paddingRight = 40;
const paddingTop = 40;
const paddingBottom = 40;
const chartW = width - paddingLeft - paddingRight;
const chartH = height - paddingTop - paddingBottom;

const maxX = 24;
const maxY = 40;

const getX = (val) => paddingLeft + (val / maxX) * chartW;
const getY = (val) => height - paddingBottom - (val / maxY) * chartH;

const linePath = computed(() => {
  return dataPoints.map((p, i) => {
    const x = getX(p.x);
    const y = getY(p.y);
    // 使用贝塞尔曲线让线条更平滑，或者简单的 L
    // 这里用简单的 L 模拟，为了平滑可以用 S 或 C，但数据点少，直接 L 加一点圆角或者就 L
    // 截图看起来比较平滑，用简单的折线即可，或者 quadratic bezier
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
});

const areaPath = computed(() => {
  const line = linePath.value;
  const lastX = getX(dataPoints[dataPoints.length - 1].x);
  const firstX = getX(dataPoints[0].x);
  const bottomY = height - paddingBottom;
  return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
});

</script>

<style scoped>
.monitor-container {
  background-color: #a8b0b8;
  color: #333;
  font-family: "Microsoft YaHei", sans-serif;
  padding: 20px;
  border-radius: 8px;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

.header {
  margin-bottom: 10px;
}

.title {
  color: #5b9bd5;
  font-size: 24px;
  margin: 0;
  font-weight: bold;
}

.nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  position: relative;
}

.tabs-wrapper {
  flex: 1;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 5px;
  margin-right: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.tabs-container {
  display: flex;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  overflow: hidden;
  /* 模拟截图中的长条形状 */
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%, 5% 50%);
  /* 简单的圆角模拟 */
  border-radius: 25px; 
  display: flex;
}

.tab-item {
  padding: 8px 20px;
  color: #85c1e9;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  background-color: #2e86c1; /* 深蓝色 */
  color: #ffffff;
  font-weight: bold;
  /* 截图里选中项左边有个箭头形状，这里简化处理 */
  clip-path: polygon(10% 0, 100% 0, 90% 100%, 0% 100%);
  margin-left: -10px;
  padding-left: 30px;
  z-index: 2;
}

.action-icons {
  display: flex;
  gap: 10px;
  align-items: center;
}

.icon-btn {
  background: #ffffff;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.list-icon-wrapper {
  position: relative;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #e74c3c;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}

.chart-area {
  position: relative;
  height: 300px;
  margin-top: 20px;
}

.chart-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.legend {
  position: absolute;
  top: 0;
  right: 20px;
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #333;
}

.legend-line {
  display: inline-block;
  width: 20px;
  height: 3px;
  background-color: #2ecc71;
  margin-right: 5px;
}

.y-axis-label-top {
  position: absolute;
  top: -20px;
  left: 10px;
  color: #666;
  font-size: 14px;
}

.warning-label {
  position: absolute;
  top: 85px; /* 对应 y=30 的位置附近 */
  right: 40px;
  color: #e74c3c;
  font-size: 14px;
}

.axis-labels {
  position: absolute;
  display: flex;
  color: #666;
  font-size: 14px;
}

.y-axis {
  flex-direction: column;
  justify-content: space-between;
  height: 240px; /* 对应图表高度 */
  top: 40px;
  left: 10px;
  align-items: flex-end;
  padding-right: 10px;
}

.y-axis span {
  line-height: 1;
}

.y-axis .warning-text {
  color: #e74c3c;
}

.x-axis {
  bottom: 0;
  left: 60px;
  right: 40px;
  justify-content: space-between;
  padding-top: 5px;
}

.x-unit {
  position: absolute;
  right: -20px;
  bottom: 0;
}

</style>