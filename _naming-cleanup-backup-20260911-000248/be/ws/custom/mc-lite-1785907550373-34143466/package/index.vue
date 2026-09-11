<template>
  <div class="mc-container">
    <!-- 顶部导航区 -->
    <div class="header">
      <div class="header-title">环境监测</div>
      
      <div class="tabs-wrapper">
        <div class="tabs">
          <div 
            v-for="tab in tabs" 
            :key="tab" 
            :class="['tab-item', { active: activeTab === tab }]"
            @click="activeTab = tab"
          >
            {{ tab }}
          </div>
        </div>
      </div>

      <div class="header-tools">
        <div class="tool-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff">
            <path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 9h4v8h-4v-8z"/>
          </svg>
        </div>
        <div class="tool-icon relative">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
          </svg>
          <div class="badge">6</div>
        </div>
      </div>
    </div>

    <!-- 主体图表区 -->
    <div class="main-content">
      <div ref="chartRef" class="chart-box"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const activeTab = ref('一氧化碳');
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];
const chartRef = ref(null);
let chartInstance = null;

const initChart = () => {
  if (!chartRef.value) return;
  chartInstance = echarts.init(chartRef.value);

  const option = {
    grid: {
      top: 40,
      right: 80,
      bottom: 30,
      left: 50,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['zk3+785CO浓度'],
      right: 20,
      top: 10,
      textStyle: {
        color: '#333',
        fontSize: 12
      },
      icon: 'rect'
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: { lineStyle: { color: '#ccc' } },
      axisLabel: { color: '#666', fontSize: 12 },
      name: '时',
      nameLocation: 'end',
      nameTextStyle: { color: '#666', padding: [0, 0, 0, 10] }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: { color: '#666', padding: [0, 0, 20, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#e0e0e0'
        }
      },
      axisLabel: { color: '#666', fontSize: 12 }
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
        data: [2, 3, 4, 3, 2, 2, 3, 8, 15, 16, 12, 5, 2], // 对应 2, 4, 6... 24 (大概13个点，这里简化映射)
        // 重新映射数据以匹配X轴 2,4,6...24 (12个点)
        data: [2, 3, 4, 3, 2, 3, 5, 12, 16, 14, 8, 2] 
      },
      {
        type: 'line',
        markLine: {
          symbol: 'none',
          label: {
            formatter: '预警线',
            position: 'end',
            color: '#e74c3c',
            fontSize: 12
          },
          lineStyle: {
            type: 'dashed',
            color: '#e74c3c'
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
  window.addEventListener('resize', () => chartInstance && chartInstance.resize());
});

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose();
  }
  window.removeEventListener('resize', () => chartInstance && chartInstance.resize());
});
</script>

<style scoped>
.mc-container {
  width: 100%;
  height: 100%;
  background-color: #dcdcdc; /* 根据拆解 */
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  font-family: sans-serif;
  border-radius: 4px;
  overflow: hidden;
}

.header {
  height: 25%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  position: relative;
}

.header-title {
  font-size: 18px;
  font-weight: bold;
  color: #5bc0de; /* 标题颜色 */
  position: absolute;
  top: 10px;
  left: 10px;
}

.tabs-wrapper {
  flex: 1;
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.tabs {
  display: flex;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  padding: 4px;
  /* 模拟截图中的长条背景 */
  background: linear-gradient(to right, #eef2f5, #dcdcdc); 
  border: 1px solid #ccc;
}

.tab-item {
  padding: 6px 16px;
  font-size: 14px;
  color: #fff; /* 默认白色文字，因为背景较深？不，截图背景是灰的，文字是白的或者深的。看截图未选中是白色文字。 */
  color: #fff;
  cursor: pointer;
  border-radius: 15px;
  transition: all 0.3s;
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.tab-item.active {
  background: linear-gradient(90deg, #5bc0de, #87ceeb); /* 蓝白渐变/青色渐变 */
  color: #fff;
  font-weight: bold;
  /* 模拟箭头形状 */
  clip-path: polygon(10% 0, 100% 0, 100% 100%, 10% 100%, 0 50%);
  padding-left: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header-tools {
  display: flex;
  gap: 15px;
  margin-left: auto;
  margin-right: 10px;
  margin-top: -20px; /* 调整位置 */
}

.tool-icon {
  width: 32px;
  height: 32px;
  background: #5bc0de; /* 图标背景色 */
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.tool-icon.relative {
  position: relative;
}

.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #e74c3c;
  color: #fff;
  font-size: 10px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.main-content {
  height: 75%;
  width: 100%;
  position: relative;
  background: #dcdcdc;
}

.chart-box {
  width: 100%;
  height: 100%;
}
</style>