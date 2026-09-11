<template>
  <div class="mc-container">
    <!-- 背景纹理模拟 (可选) -->
    <div class="bg-texture">华士镇</div>

    <!-- 标题栏 -->
    <div class="header">
      <h1 class="title">{{ title }}</h1>
    </div>

    <!-- 导航与工具栏 -->
    <div class="nav-toolbar">
      <div class="tabs-container">
        <div 
          v-for="(tab, index) in tabs" 
          :key="index"
          class="tab-item"
          :class="{ active: activeTab === tab }"
          @click="handleTabClick(tab)"
        >
          {{ tab }}
        </div>
      </div>

      <div class="tools">
        <div class="icon-btn chart-icon">
          <!-- 模拟柱状图图标 -->
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="12" width="4" height="8" rx="1" fill="#409EFF" stroke="none"/>
            <rect x="10" y="6" width="4" height="14" rx="1" fill="#409EFF" stroke="none"/>
            <rect x="16" y="10" width="4" height="10" rx="1" fill="#409EFF" stroke="none"/>
          </svg>
        </div>
        <div class="icon-btn list-icon">
          <!-- 模拟列表图标 -->
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#409EFF" stroke-width="2">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <line x1="8" y1="8" x2="16" y2="8" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="8" y1="16" x2="16" y2="16" />
          </svg>
          <span class="badge">{{ badgeCount }}</span>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="chart-area">
      <!-- 图例 -->
      <div class="legend">
        <div class="legend-item">
          <span class="legend-line success"></span>
          <span class="legend-text">zk3+785CO浓度</span>
        </div>
      </div>
      <div class="legend warning-legend">
        <span class="legend-text danger">预警线</span>
      </div>

      <!-- Y轴标签 -->
      <div class="y-axis">
        <div class="y-label unit-label">辆</div>
        <div class="y-label" v-for="y in yTicks" :key="y" :style="{ bottom: getYPercent(y) + '%' }" :class="{ 'danger-text': y === warningValue }">
          {{ y }}
        </div>
      </div>

      <!-- 图表主体 (SVG) -->
      <div class="svg-container">
        <svg :viewBox="`0 0 ${svgWidth} ${svgHeight}`" preserveAspectRatio="none" class="chart-svg">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--success-color)" stop-opacity="0.3" />
              <stop offset="100%" stop-color="var(--success-color)" stop-opacity="0.05" />
            </linearGradient>
          </defs>

          <!-- 网格线 -->
          <g class="grid-lines">
            <line v-for="y in yTicks" :key="'grid-'+y" 
              :x1="0" :y1="svgHeight - getYPercent(y) * svgHeight / 100" 
              :x2="svgWidth" :y2="svgHeight - getYPercent(y) * svgHeight / 100" 
              stroke="#E0E6ED" stroke-dasharray="4 4" />
          </g>

          <!-- 预警线 -->
          <line 
            :x1="0" 
            :y1="svgHeight - getYPercent(warningValue) * svgHeight / 100" 
            :x2="svgWidth" 
            :y2="svgHeight - getYPercent(warningValue) * svgHeight / 100" 
            stroke="var(--danger-color)" 
            stroke-dasharray="6 4" 
            stroke-width="2"
          />

          <!-- 数据面积 -->
          <path :d="areaPath" fill="url(#areaGradient)" />
          
          <!-- 数据折线 -->
          <path :d="linePath" fill="none" stroke="var(--success-color)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>

        <!-- X轴标签 -->
        <div class="x-axis">
          <div class="x-label unit-label-x">时</div>
          <div class="x-label" v-for="x in xTicks" :key="x" :style="{ left: getXPercent(x) + '%' }">
            {{ x }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

// Props
const props = defineProps({
  title: {
    type: String,
    default: '环境监测'
  },
  tabs: {
    type: Array,
    default: () => ['一氧化碳', '能见度', '洞内照明', '洞外光强']
  },
  activeTab: {
    type: String,
    default: '一氧化碳'
  },
  badgeCount: {
    type: [Number, String],
    default: 6
  },
  warningValue: {
    type: Number,
    default: 30
  },
  yMax: {
    type: Number,
    default: 40 // 根据截图，最高刻度是40，但上面还有空间，这里设为40或50均可，截图看起来像40是最高标值
  }
});

// Emits
const emit = defineEmits(['tab-change']);

// State
const activeTab = ref(props.activeTab);

// Chart Config
const svgWidth = 1000;
const svgHeight = 400;
const yTicks = [0, 10, 20, 30, 40];
const xTicks = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

// Mock Data (模拟截图中的曲线走势)
// x: 0-24, y: 0-40
const chartData = [
  { x: 0, y: 3 },
  { x: 2, y: 5 },
  { x: 4, y: 6 },
  { x: 6, y: 4 },
  { x: 8, y: 3 },
  { x: 10, y: 2 },
  { x: 12, y: 5 },
  { x: 14, y: 11 },
  { x: 16, y: 13 },
  { x: 18, y: 12 },
  { x: 20, y: 10 },
  { x: 22, y: 5 },
  { x: 24, y: 1 }
];

// Methods
const handleTabClick = (tab) => {
  activeTab.value = tab;
  emit('tab-change', tab);
};

const getYPercent = (val) => {
  // 假设Y轴最大值为 props.yMax (这里为了显示效果，稍微放大一点比例，比如按50算，或者就按40算)
  // 截图里40上面还有一条线，可能是50? 不，看间距，0-10-20-30-40。
  // 让我们按 50 作为最大计算范围，这样40在80%高度处。
  const max = 50; 
  return (val / max) * 100;
};

const getXPercent = (val) => {
  const max = 24;
  // 留一点边距，从5%到95%
  return 5 + (val / max) * 90;
};

// Generate SVG Path
const generatePath = (isArea) => {
  if (chartData.length === 0) return '';
  
  let d = '';
  const max = 50;
  
  // 起点
  const startX = (chartData[0].x / 24) * 900 + 50; // 映射到 50-950
  const startY = svgHeight - (chartData[0].y / max) * 350 - 20; // 映射高度，留底边距
  
  d += `M ${startX} ${startY}`;

  // 简单的平滑曲线模拟 (使用 Catmull-Rom 或 贝塞尔，这里用简单的 L 连接，因为点够密，或者用 Q)
  // 为了更像截图，使用简单的曲线连接
  for (let i = 1; i < chartData.length; i++) {
    const x = (chartData[i].x / 24) * 900 + 50;
    const y = svgHeight - (chartData[i].y / max) * 350 - 20;
    const prevX = (chartData[i-1].x / 24) * 900 + 50;
    const prevY = svgHeight - (chartData[i-1].y / max) * 350 - 20;
    
    // 控制点
    const cpX = (prevX + x) / 2;
    
    // 使用二次贝塞尔曲线 Q
    d += ` Q ${cpX} ${prevY}, ${cpX} ${(prevY + y) / 2} T ${x} ${y}`; 
    // 或者简单的 L: d += ` L ${x} ${y}`;
    // 截图非常平滑，用 S (平滑贝塞尔) 更好，但手写复杂。
    // 这里用简单的 L 配合 stroke-linejoin="round" 也可以，或者用上面的 Q 近似。
    // 让我们用更简单的 L，因为微码通常不要求完美复刻曲线算法，只要趋势对。
    // 修正：为了好看，用 L。
    d += ` L ${x} ${y}`;
  }

  if (isArea) {
    const endX = (chartData[chartData.length - 1].x / 24) * 900 + 50;
    const startX0 = (chartData[0].x / 24) * 900 + 50;
    d += ` L ${endX} ${svgHeight} L ${startX0} ${svgHeight} Z`;
  }

  return d;
};

// 重新计算路径，使用更平滑的方式
const linePath = computed(() => {
   // 手动构造一个平滑路径字符串以匹配截图
   // 截图看起来像样条曲线。
   // 这里用简单的 L 路径，靠 CSS stroke-linejoin 圆滑
   let d = `M 50 ${svgHeight - 20 - (3/50)*350}`; // x=0, y=3
   // 为了简单，直接硬编码几个关键点的平滑路径，或者用 L
   // 使用 L 命令
   chartData.forEach((pt, i) => {
     if (i === 0) return;
     const x = 50 + (pt.x / 24) * 900;
     const y = svgHeight - 20 - (pt.y / 50) * 350;
     d += ` L ${x} ${y}`;
   });
   return d;
});

const areaPath = computed(() => {
   let d = linePath.value;
   const lastX = 50 + (24/24)*900;
   const firstX = 50;
   d += ` L ${lastX} ${svgHeight - 20} L ${firstX} ${svgHeight - 20} Z`;
   return d;
});

</script>

<style scoped>
:root {
  --primary-color: #409EFF;
  --primary-dark: #2B74B6; /* 标题颜色 */
  --bg-color: #F0F7FF;
  --tab-bg: #E6F2FF;
  --tab-active-bg: #5B9BD5; /* 截图中的深蓝/蓝绿 */
  --text-main: #333333;
  --text-light: #666666;
  --success-color: #2ECC71; /* 截图绿色 */
  --danger-color: #FF4D4F; /* 截图红色 */
  --border-color: #E0E6ED;
}

.mc-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  background-color: var(--bg-color);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
  padding: 20px;
  box-sizing: border-box;
}

.bg-texture {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  color: rgba(0, 0, 0, 0.03);
  font-size: 40px;
  font-weight: bold;
  pointer-events: none;
  z-index: 0;
  display: flex;
  justify-content: center;
  padding-top: 20px;
}

.header {
  position: relative;
  z-index: 1;
  margin-bottom: 10px;
}

.title {
  color: var(--primary-dark);
  font-size: 24px;
  font-weight: bold;
  margin: 0;
}

.nav-toolbar {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.tabs-container {
  display: flex;
  background-color: var(--tab-bg);
  border-radius: 20px; /* 胶囊状 */
  padding: 4px;
  /* 截图里Tab背景是一个长条六边形或者圆角矩形，这里用圆角矩形模拟 */
  background: linear-gradient(to right, #E6F2FF, #F0F7FF);
  border: 1px solid #B3D8FF;
}

.tab-item {
  padding: 8px 20px;
  font-size: 16px;
  color: var(--primary-color);
  cursor: pointer;
  border-radius: 16px;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  background-color: var(--tab-active-bg);
  color: #fff;
  font-weight: bold;
  /* 截图里选中项左边有个尖角，这里简化为圆角 */
}

.tools {
  display: flex;
  gap: 10px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  background: #fff;
  border: 1px solid var(--primary-color);
  border-radius: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  position: relative;
  color: var(--primary-color);
}

.list-icon {
  position: relative;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: var(--danger-color);
  color: #fff;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: bold;
}

/* Chart Area */
.chart-area {
  position: relative;
  z-index: 1;
  height: calc(100% - 100px);
  min-height: 300px;
  margin-left: 40px; /* 给Y轴留空间 */
  margin-bottom: 30px; /* 给X轴留空间 */
}

.legend {
  position: absolute;
  top: 10px;
  right: 20px;
  display: flex;
  align-items: center;
  font