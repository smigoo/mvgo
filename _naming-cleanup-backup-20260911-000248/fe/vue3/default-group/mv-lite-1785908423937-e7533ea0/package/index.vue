<template>
  <div class="container">
    <!-- 标题区 -->
    <div class="header">
      <h1 class="title">环境监测</h1>
    </div>

    <!-- 导航操作区 -->
    <div class="nav-bar">
      <div class="tabs-wrapper">
        <div class="tab-item active">一氧化碳</div>
        <div class="tab-item">能见度</div>
        <div class="tab-item">洞内照明</div>
        <div class="tab-item">洞外光强</div>
      </div>
      
      <div class="action-icons">
        <div class="icon-box chart-icon">
          <!-- 模拟柱状图图标 -->
          <svg viewBox="0 0 24 24" width="24" height="24">
            <rect x="4" y="14" width="4" height="6" fill="white" rx="1"/>
            <rect x="10" y="8" width="4" height="12" fill="white" rx="1"/>
            <rect x="16" y="4" width="4" height="16" fill="white" rx="1"/>
          </svg>
        </div>
        <div class="icon-box list-icon relative">
          <!-- 模拟列表图标 -->
          <svg viewBox="0 0 24 24" width="24" height="24">
            <rect x="4" y="4" width="16" height="3" fill="white" rx="1"/>
            <rect x="4" y="10" width="16" height="3" fill="white" rx="1"/>
            <rect x="4" y="16" width="16" height="3" fill="white" rx="1"/>
            <circle cx="6" cy="5.5" r="1" fill="#4A90E2"/>
            <circle cx="6" cy="11.5" r="1" fill="#4A90E2"/>
            <circle cx="6" cy="17.5" r="1" fill="#4A90E2"/>
          </svg>
          <div class="badge">6</div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-section">
      <div class="chart-legend">
        <span class="legend-line"></span>
        <span class="legend-text">zk3+785CO浓度</span>
      </div>
      <div ref="chartRef" class="echarts-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const chartRef = ref(null);
let chartInstance = null;

onMounted(() => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value);
    
    const option = {
      grid: {
        top: 40,
        bottom: 30,
        left: 40,
        right: 40,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#4B5563',
          fontSize: 14,
          margin: 15
        },
        name: '时',
        nameLocation: 'end',
        nameTextStyle: {
          color: '#4B5563',
          fontSize: 14,
          padding: [0, 0, 0, 10]
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 40,
        interval: 10,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#4B5563',
          fontSize: 14
        },
        splitLine: {
          lineStyle: {
            type: 'dashed',
            color: 'rgba(255, 255, 255, 0.6)'
          }
        },
        name: '辆',
        nameLocation: 'end',
        nameTextStyle: {
          color: '#4B5563',
          fontSize: 14,
          padding: [0, 0, 20, 0]
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
          data: [5, 7, 6, 3, 2, 5, 12, 14, 12, 10, 5, 0],
          markLine: {
            symbol: 'none',
            label: {
              position: 'end',
              formatter: '预警线',
              color: '#ef4444',
              fontSize: 14,
              distance: 10
            },
            lineStyle: {
              type: 'dashed',
              color: '#ef4444'
            },
            data: [
              { yAxis: 30 }
            ]
          }
        }
      ]
    };

    chartInstance.setOption(option);
  }
});

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose();
  }
});
</script>

<style scoped>
.container {
  background-color: #9ca3af; /* 截图背景灰 */
  width: 100%;
  height: 100%;
  min-height: 500px;
  padding: 20px 30px;
  box-sizing: border-box;
  font-family: sans-serif;
  display: flex;
  flex-direction: column;
}

.header {
  margin-bottom: 10px;
}

.title {
  color: #60a5fa; /* 蓝色标题 */
  font-size: 24px;
  font-weight: bold;
  margin: 0;
}

.nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.tabs-wrapper {
  background-color: #bfdbfe; /* 浅蓝背景条 */
  border-radius: 25px;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  /* 模拟截图中的长条形状 */
  width: 70%;
  position: relative;
}

.tab-item {
  padding: 8px 20px;
  color: #60a5fa;
  font-size: 16px;
  cursor: pointer;
  border-radius: 20px;
  transition: all 0.3s;
}

.tab-item.active {
  background-color: #38bdf8; /* 选中项深蓝/青色 */
  color: white;
  font-weight: bold;
  /* 模拟箭头形状 */
  clip-path: polygon(10% 0, 100% 0, 90% 100%, 0% 100%);
  padding-left: 25px;
  margin-right: 10px;
}

.action-icons {
  display: flex;
  gap: 10px;
}

.icon-box {
  background-color: white;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.relative {
  position: relative;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #ef4444;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  font-weight: bold;
}

.chart-section {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
}

.chart-legend {
  position: absolute;
  top: 10px;
  right: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
}

.legend-line {
  display: inline-block;
  width: 20px;
  height: 3px;
  background-color: #2ecc71;
}

.legend-text {
  color: #374151;
  font-size: 14px;
}

.echarts-container {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>