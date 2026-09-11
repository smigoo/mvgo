<template>
  <div class="cp-env-monitor" :style="cssVars">
    <!-- 头部控制区 -->
    <div class="header">
      <h2 class="title">{{ title }}</h2>
      
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

      <div class="actions">
        <button class="icon-btn" @click="handleAction('chart')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 9h4v8h-4v-8z"/>
          </svg>
        </button>
        <button class="icon-btn relative" @click="handleAction('list')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
          </svg>
          <span v-if="badgeCount > 0" class="badge">{{ badgeCount }}</span>
        </button>
      </div>
    </div>

    <!-- 图表数据区 -->
    <div class="chart-container">
      <!-- 图例 -->
      <div class="legend">
        <span class="legend-line"></span>
        <span class="legend-text">{{ chartLabel }}</span>
      </div>

      <div class="chart-body">
        <!-- Y轴 -->
        <div class="y-axis">
          <div class="y-label top">辆</div>
          <div v-for="val in yTicks" :key="val" class="y-label" :style="{ top: getYPercent(val) + '%' }">
            {{ val }}
          </div>
        </div>

        <!-- SVG 图表 -->
        <div class="svg-wrapper">
          <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" class="chart-svg">
            <!-- 网格线 (对应Y轴刻度) -->
            <line v-for="val in yTicks" :key="'grid-'+val" 
              x1="0" :y1="height - (val / maxY) * height" 
              x2="width" :y2="height - (val / maxY) * height" 
              stroke="#e0e0e0" stroke-dasharray="4" stroke-width="1" />
            
            <!-- 预警线 -->
            <line 
              x1="0" :y1="height - (warningValue / maxY) * height" 
              x2="width" :y2="height - (warningValue / maxY) * height" 
              stroke="#d9534f" stroke-dasharray="6" stroke-width="2" />
            <text x="width - 10" :y="height - (warningValue / maxY) * height - 5" fill="#d9534f" font-size="12" text-anchor="end">预警线</text>

            <!-- 面积图路径 -->
            <path :d="areaPath" fill="url(#areaGradient)" opacity="0.6" />
            <!-- 折线路径 -->
            <path :d="linePath" fill="none" stroke="#2ecc71" stroke-width="2" />
            
            <!-- 渐变定义 -->
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#2ecc71" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="#2ecc71" stop-opacity="0.1"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <!-- X轴 -->
      <div class="x-axis">
        <div v-for="val in xTicks" :key="val" class="x-label" :style="{ left: getXPercent(val) + '%' }">
          {{ val }}
        </div>
        <div class="x-label-end">时</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineProps, defineEmits } from 'vue';

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
  chartLabel: {
    type: String,
    default: 'zk3+785CO浓度'
  },
  warningValue: {
    type: Number,
    default: 30
  },
  badgeCount: {
    type: Number,
    default: 6
  },
  // 模拟数据，实际开发中应由外部传入
  chartData: {
    type: Array,
    default: () => [
      { x: 2, y: 5 }, { x: 4, y: 6 }, { x: 6, y: 5 }, { x: 8, y: 4 }, 
      { x: 10, y: 3 }, { x: 12, y: 5 }, { x: 14, y: 10 }, { x: 16, y: 15 }, 
      { x: 18, y: 16 }, { x: 20, y: 15 }, { x: 22, y: 10 }, { x: 24, y: 2 }
    ]
  }
});

const emit = defineEmits(['tab-change', 'action-click']);

const maxY = 50;
const width = 800;
const height = 300;
const xTicks = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
const yTicks = [0, 10, 20, 30, 40, 50];

const cssVars = computed(() => ({
  '--primary-color': '#8ecae6',
  '--bg-color': '#d0d5db',
  '--text-color': '#333333',
  '--text-light': '#ffffff',
  '--warning-color': '#d9534f',
  '--chart-color': '#2ecc71'
}));

const handleTabClick = (tab) => {
  emit('tab-change', tab);
};

const handleAction = (type) => {
  emit('action-click', type);
};

const getXPercent = (val) => {
  return (val / 24) * 100;
};

const getYPercent = (val) => {
  return 100 - (val / maxY) * 100;
};

// 生成SVG路径
const pathData = computed(() => {
  const data = props.chartData;
  if (!data || data.length === 0) return '';
  
  // 映射坐标
  const points = data.map(d => {
    const x = (d.x / 24) * width;
    const y = height - (d.y / maxY) * height;
    return { x, y };
  });

  // 简单的直线连接，若要平滑可使用贝塞尔曲线
  let lineD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    // 使用简单的曲线平滑 (Catmull-Rom 或 二次贝塞尔近似，这里用直线演示，若要平滑可改)
    // 为了更像截图，使用简单的 L 命令，或者 Q 命令
    // 截图看起来比较平滑，这里用简单的 L
    lineD += ` L ${points[i].x} ${points[i].y}`;
  }
  
  // 面积图闭合路径
  const areaD = `${lineD} L ${points[points.length-1].x} ${height} L ${points[0].x} ${height} Z`;
  
  return { line: lineD, area: areaD };
});

const linePath = computed(() => pathData.value.line);
const areaPath = computed(() => pathData.value.area);

</script>

<style scoped>
.cp-env-monitor {
  background-color: var(--bg-color);
  color: var(--text-color);
  font-family: sans-serif;
  padding: 10px;
  border-radius: 4px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  position: relative;
}

.title {
  font-size: 18px;
  font-weight: bold;
  color: #2c3e50; /* 深蓝色标题 */
  margin: 0 20px 0 0;
}

.tabs-container {
  display: flex;
  background: #7f8c8d; /* 未选中背景 */
  border-radius: 20px;
  padding: 2px;
  flex: 1;
  max-width: 600px;
}

.tab-item {
  padding: 6px 20px;
  border-radius: 18px;
  cursor: pointer;
  font-size: 14px;
  color: #fff;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  background-color: var(--primary-color);
  color: #fff;
  font-weight: bold;
  /* 模拟截图中的箭头形状背景，这里简化为圆角矩形 */
  clip-path: polygon(10% 0, 100% 0, 90% 100%, 0% 100%);
  padding-left: 25px; 
}

.actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}

.icon-btn {
  background: #fff;
  border: none;
  border-radius: 4px;
  padding: 6px;
  cursor: pointer;
  color: #555;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.icon-btn.relative {
  position: relative;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #e74c3c;
  color: white;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--bg-color);
}

.chart-container {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 10px 0;
}

.legend {
  position: absolute;
  top: 10px;
  right: 20px;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #555;
  z-index: 10;
}

.legend-line {
  display: inline-block;
  width: 20px;
  height: 2px;
  background-color: var(--chart-color);
  margin-right: 5px;
}

.chart-body {
  display: flex;
  flex: 1;
  position: relative;
  margin-top: 20px; /* 给图例留空间 */
}

.y-axis {
  width: 40px;
  position: relative;
  height: 100%;
}

.y-label {
  position: absolute;
  right: 5px;
  transform: translateY(-50%);
  font-size: 12px;
  color: #666;
}
.y-label.top {
  top: -20px;
  transform: none;
}

.svg-wrapper {
  flex: 1;
  height: 100%;
  position: relative;
}

.chart-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.x-axis {
  display: flex;
  justify-content: space-between;
  padding-left: 40px; /* 对齐Y轴 */
  position: relative;
  height: 20px;
}

.x-label {
  position: absolute;
  transform: translateX(-50%);
  font-size: 12px;
  color: #666;
  bottom: 0;
}

.x-label-end {
  position: absolute;
  right: 0;
  font-size: 12px;
  color: #666;
}
</style>