<template>
  <div class="mc-container">
    <!-- 标题区 -->
    <div class="header-section">
      <h2 class="main-title">环境监测</h2>
    </div>

    <!-- 导航操作区 -->
    <div class="nav-section">
      <div class="tab-container">
        <div 
          v-for="tab in tabs" 
          :key="tab.key"
          class="tab-item"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </div>
      </div>
      
      <div class="action-buttons">
        <button class="icon-btn" @click="handleAction('chart')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 9h4v8h-4v-8z"/></svg>
        </button>
        <button class="icon-btn relative" @click="handleAction('list')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/></svg>
          <span class="badge">6</span>
        </button>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-section">
      <div ref="chartRef" class="chart-box"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const activeTab = ref('co');
const chartRef = ref(null);
let chartInstance = null;

const tabs = [
  { key: 'co', label: '一氧化碳' },
  { key: 'vis', label: '能见度' },
  { key: 'in-light', label: '洞内照明' },
  { key: 'out-light', label: '洞外光强' }
];

const handleAction = (type) => {
  console.log(`Action clicked: ${type}`);
};

const initChart = () => {
  if (!chartRef.value) return;
  chartInstance = echarts.init(chartRef.value);

  const option = {
    grid: {
      top: 40,
      right: 60,
      bottom: 30,
      left: 40,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 10,
      right: 20,
      textStyle: {
        color: '#333', // 截图里看起来像深色，或者根据背景调整。截图背景灰，文字可能是深色或白色。看截图图例文字是黑色的 "zk3+785CO浓度"。
        fontSize: 12
      },
      icon: 'rect',
      itemWidth: 15,
      itemHeight: 3,
      itemStyle: {
        color: '#2ecc71'
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666',
        padding: [0, 0, 0, 10]
      },
      axisLine: {
        lineStyle: { color: '#ccc' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#666',
        margin: 15
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          color: 'rgba(255,255,255,0.5)'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666',
        padding: [0, 0, 20, 0] // 调整位置到顶部
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#666',
        formatter: (value) => {
          if (value === 30) return '{red|30}';
          return value;
        },
        rich: {
          red: { color: '#d9534f', fontWeight: 'bold' }
        }
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          color: 'rgba(255,255,255,0.6)'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#2ecc71',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(46, 204, 113, 0.4)' },
            { offset: 1, color: 'rgba(46, 204, 113, 0.05)' }
          ])
        },
        data: [5, 7, 6, 3, 2, 5, 10, 13, 12, 10, 5, 0],
        markLine: {
          symbol: 'none',
          label: {
            formatter: '预警线',
            position: 'end', // 放在右边
            color: '#d9534f',
            fontSize: 14,
            offset: [0, -10] // 向上偏移
          },
          lineStyle: {
            type: 'dashed',
            color: '#d9534f',
            width: 1
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  };

  chartInstance.setOption(option);
};

onMounted(() => {
  initChart();
  window.addEventListener('resize', () => chartInstance?.resize());
});

onUnmounted(() => {
  window.removeEventListener('resize', () => chartInstance?.resize());
  chartInstance?.dispose();
});
</script>

<style scoped>
.mc-container {
  background-color: #9ca3af; /* 截图背景色 */
  padding: 20px;
  border-radius: 8px;
  font-family: sans-serif;
  color: #333;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header-section {
  margin-bottom: 10px;
}

.main-title {
  color: #5b9bd5; /* 标题蓝色 */
  font-size: 24px;
  margin: 0;
  font-weight: bold;
}

.nav-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: rgba(255, 255, 255, 0.1); /* 轻微背景区分 */
  padding: 10px;
  border-radius: 8px;
}

.tab-container {
  display: flex;
  background: rgba(200, 220, 240, 0.3); /* 浅蓝底色 */
  border-radius: 20px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.tab-item {
  padding: 8px 20px;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  border-radius: 16px;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  background-color: #2980b9; /* 选中深蓝 */
  color: #fff;
  font-weight: bold;
  /* 模拟截图中的箭头形状效果，简单用圆角 */
  clip-path: polygon(10% 0, 100% 0, 90% 100%, 0% 100%);
  padding-left: 25px;
  margin-left: -5px;
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.icon-btn {
  background-color: #fff;
  border: none;
  border-radius: 6px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  position: relative;
}

.icon-btn svg {
  fill: #5b9bd5;
}

.relative {
  position: relative;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #e74c3c;
  color: white;
  font-size: 12px;
  font-weight: bold;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #9ca3af; /* 匹配背景色以产生镂空感 */
}

.chart-section {
  flex: 1;
  position: relative;
  min-height: 300px;
}

.chart-box {
  width: 100%;
  height: 100%;
}
</style>