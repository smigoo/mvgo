<template>
  <div class="env-monitor-container">
    <!-- 顶部控制区 -->
    <div class="header-section">
      <div class="title-row">
        <h1 class="main-title">环境监测</h1>
      </div>
      
      <div class="control-row">
        <div class="tabs-wrapper">
          <div class="tab-shape-container">
            <div 
              v-for="(tab, index) in tabs" 
              :key="index"
              class="tab-item"
              :class="{ active: activeTab === tab }"
              @click="activeTab = tab"
            >
              {{ tab }}
            </div>
          </div>
        </div>

        <div class="tools-wrapper">
          <div class="icon-btn chart-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="#4facfe">
              <path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 10h4v7h-4v-7z"/>
            </svg>
          </div>
          <div class="icon-btn list-icon-wrapper">
            <div class="icon-btn list-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#4facfe">
                <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
              </svg>
            </div>
            <div class="badge">6</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表数据区 -->
    <div class="chart-section">
      <div class="chart-legend">
        <div class="legend-item">
          <span class="legend-line green"></span>
          <span class="legend-text">zk3+785CO浓度</span>
        </div>
      </div>
      
      <div class="chart-container">
        <!-- Y轴标签 -->
        <div class="y-axis-labels">
          <div class="y-label-unit">辆</div>
          <div class="y-label" v-for="i in 5" :key="i" :style="{ top: `${(5-i)*25}%` }">{{ (i-1)*10 }}</div>
          <!-- 修正Y轴顺序，从下到上 0, 10, 20, 30, 40 -->
          <div class="y-label" style="bottom: 10%">0</div>
          <div class="y-label" style="bottom: 32.5%">10</div>
          <div class="y-label" style="bottom: 55%">20</div>
          <div class="y-label warning-text" style="bottom: 77.5%">30</div>
          <div class="y-label" style="bottom: 100%">40</div>
        </div>

        <!-- SVG 图表 -->
        <svg class="main-chart" viewBox="0 0 800 400" preserveAspectRatio="none">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2ecc71" stop-opacity="0.4" />
              <stop offset="100%" stop-color="#2ecc71" stop-opacity="0.05" />
            </linearGradient>
          </defs>

          <!-- 网格线 -->
          <line x1="60" y1="360" x2="760" y2="360" stroke="#e0e6ed" stroke-width="1" stroke-dasharray="4 4" />
          <line x1="60" y1="270" x2="760" y2="270" stroke="#e0e6ed" stroke-width="1" stroke-dasharray="4 4" />
          <line x1="60" y1="180" x2="760" y2="180" stroke="#e0e6ed" stroke-width="1" stroke-dasharray="4 4" />
          <line x1="60" y1="90" x2="760" y2="90" stroke="#e0e6ed" stroke-width="1" stroke-dasharray="4 4" />
          <line x1="60" y1="0" x2="760" y2="0" stroke="#e0e6ed" stroke-width="1" stroke-dasharray="4 4" /> <!-- 40 -->
          
          <!-- 重新计算网格线位置 based on viewBox 0 0 800 400 -->
          <!-- Y range: 360 (0) to 60 (40). Step 75px for 10 units. -->
          <!-- 0 -> 360, 10 -> 285, 20 -> 210, 30 -> 135, 40 -> 60 -->
          <line x1="60" y1="360" x2="760" y2="360" stroke="#dce2e8" stroke-width="1" stroke-dasharray="5 5" />
          <line x1="60" y1="285" x2="760" y2="285" stroke="#dce2e8" stroke-width="1" stroke-dasharray="5 5" />
          <line x1="60" y1="210" x2="760" y2="210" stroke="#dce2e8" stroke-width="1" stroke-dasharray="5 5" />
          <line x1="60" y1="135" x2="760" y2="135" stroke="#dce2e8" stroke-width="1" stroke-dasharray="5 5" />
          <line x1="60" y1="60" x2="760" y2="60" stroke="#dce2e8" stroke-width="1" stroke-dasharray="5 5" />

          <!-- 预警线 -->
          <line x1="60" y1="135" x2="760" y2="135" stroke="#ff4d4f" stroke-width="2" stroke-dasharray="6 4" />
          <text x="750" y="125" fill="#ff4d4f" font-size="14" text-anchor="end">预警线</text>

          <!-- 面积图 -->
          <path 
            d="M 60 337.5 C 120 337.5, 150 315, 176 315 S 280 345, 351 345 S 420 270, 468 270 S 520 255, 556 255 S 650 322.5, 701 322.5 S 740 352.5, 760 352.5 L 760 360 L 60 360 Z" 
            fill="url(#areaGradient)" 
          />

          <!-- 折线图 -->
          <path 
            d="M 60 337.5 C 120 337.5, 150 315, 176 315 S 280 345, 351 345 S 420 270, 468 270 S 520 255, 556 255 S 650 322.5, 701 322.5 S 740 352.5, 760 352.5" 
            fill="none" 
            stroke="#2ecc71" 
            stroke-width="3" 
          />
        </svg>

        <!-- X轴标签 -->
        <div class="x-axis-labels">
          <span class="x-label" v-for="i in 12" :key="i" :style="{ left: `${(i-1)*8.33 + 4}%` }">{{ i*2 }}</span>
          <span class="x-label-unit">时</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强']);
const activeTab = ref('一氧化碳');
</script>

<style scoped>
.env-monitor-container {
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background-color: #f4f7fc;
  /* 模拟地图纹理背景 */
  background-image: radial-gradient(#eef2f6 1px, transparent 1px);
  background-size: 20px 20px;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  color: #333;
  position: relative;
  overflow: hidden;
}

/* 顶部控制区 */
.header-section {
  margin-bottom: 20px;
}

.title-row {
  margin-bottom: 15px;
}

.main-title {
  font-size: 24px;
  font-weight: bold;
  color: #4facfe;
  margin: 0;
  display: flex;
  align-items: center;
}

.main-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 24px;
  background: #4facfe;
  margin-right: 10px;
  border-radius: 2px;
}

.control-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
}

/* Tabs */
.tabs-wrapper {
  flex: 1;
}

.tab-shape-container {
  display: flex;
  background: #eef6ff;
  border-radius: 20px; /* 圆角长条 */
  padding: 4px;
  position: relative;
}

.tab-item {
  padding: 8px 24px;
  font-size: 16px;
  color: #4facfe;
  cursor: pointer;
  border-radius: 16px;
  transition: all 0.3s;
  position: relative;
  z-index: 1;
}

.tab-item.active {
  background: #4facfe; /* 截图里偏青色，这里用主色 */
  background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%); /* 渐变更像截图 */
  background: #5bc0de; /* 截图里的深青色 */
  color: #fff;
  font-weight: bold;
  box-shadow: 0 2px 6px rgba(79, 172, 254, 0.3);
}

/* 模拟截图里的箭头/六边形效果 */
.tab-shape-container {
  background: transparent;
  display: flex;
  align-items: center;
}

.tab-item {
  background: #eef6ff;
  color: #4facfe;
  border: 1px solid #dceefb;
  margin-right: -1px; /* 拼接 */
}

.tab-item:first-child {
  border-radius: 20px 0 0 20px;
  /* 截图里第一个tab左边有个尖角，这里简化处理 */
  clip-path: polygon(10% 0, 100% 0, 100% 100%, 0 100%, 0 50%);
  padding-left: 30px;
}

.tab-item:last-child {
  border-radius: 0 20px 20px 0;
  clip-path: polygon(0 0, 90% 0, 100% 50%, 90% 100%, 0 100%);
  padding-right: 30px;
}

.tab-item.active {
  background: #4facfe;
  color: white;
  z-index: 2;
  border-color: #4facfe;
}

/* Tools */
.tools-wrapper {
  display: flex;
  gap: 15px;
  align-items: center;
}

.icon-btn {
  width: 36px;
  height: 36px;
  background: #fff;
  border: 1px solid #e0e6ed;
  border-radius: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  position: relative;
}

.list-icon-wrapper {
  position: relative;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: #ff4d4f;
  color: white;
  font-size: 12px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
  border: 2px solid #fff;
}

/* 图表区 */
.chart-section {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  position: relative;
  height: 400px;
}

.chart-legend {
  position: absolute;
  top: 20px;
  right: 30px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 10;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #333;
}

.legend-line {
  width: 20px;
  height: 3px;
  display: inline-block;
}

.legend-line.green {
  background: #2ecc71;
}

.chart-container {
  position: relative;
  width: 100%;
  height: 100%;
  margin-top: 20px;
}

.y-axis-labels {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 30px;
  width: 40px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  padding-right: 10px;
  box-sizing: border-box;
}

.y-label {
  font-size: 12px;
  color: #666;
  position: absolute;
  right: 10px;
  transform: translateY(50%);
}

.y-label-unit {
  position: absolute;
  top: -20px;
  left: 0;
  font-size: 12px;
  color: #666;
}

.warning-text {
  color: #ff4d4f;
  font-weight: bold;
}

.main-chart {
  position: absolute;
  left: 50px;
  right: 20px;
  top: 0;
  bottom: 30px;
  width: calc(100% - 70px);
  height: calc(100% - 30px);
}

.x-axis-labels {
  position: absolute;
  bottom: 0;
  left: 50px;
  right: 20px;
  height: 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
  box-sizing: border-box;
}

.x-label {
  font-size: 12px;
  color: #666;
  position: absolute;
  transform: translateX(-50%);
}

.x-label-unit {
  position: absolute;
  right: 0;
  bottom: 5px;
  font-size: 12px;
  color: #666;
}