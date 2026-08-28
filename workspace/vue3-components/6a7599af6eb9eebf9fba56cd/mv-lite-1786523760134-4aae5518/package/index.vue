<template>
  <div class="container">
    <!-- 顶部导航区 -->
    <div class="header">
      <div class="title-row">
        <h2 class="main-title">环境监测</h2>
      </div>
      
      <div class="nav-row">
        <div class="tab-container">
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

        <div class="icon-group">
          <div class="icon-btn chart-icon">
            <!-- 模拟柱状图图标 -->
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
              <rect x="4" y="12" width="4" height="8" rx="1"/>
              <rect x="10" y="6" width="4" height="14" rx="1"/>
              <rect x="16" y="16" width="4" height="4" rx="1"/>
            </svg>
          </div>
          <div class="icon-btn list-icon">
            <!-- 模拟列表图标 -->
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
              <rect x="4" y="4" width="16" height="3" rx="1"/>
              <rect x="4" y="10" width="16" height="3" rx="1"/>
              <rect x="4" y="16" width="16" height="3" rx="1"/>
            </svg>
            <div class="badge">6</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表展示区 -->
    <div class="chart-area">
      <div class="chart-header">
        <div class="y-axis-label">辆</div>
        <div class="legend">
          <span class="legend-line"></span>
          <span class="legend-text">zK3+785CO浓度</span>
        </div>
      </div>
      <div ref="chartRef" class="echarts-container"></div>
      <div class="x-axis-label">时</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const currentTab = ref('一氧化碳');
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];
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
          color: '#666',
          margin: 10
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
            color: '#eee'
          }
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 50,
        interval: 10,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#666'
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
            color: '#e0e0e0'
          }
        }
      },
      series: [
        {
          name: 'zK3+785CO浓度',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: [5, 6, 5, 3, 2, 2, 4, 8, 15, 14, 10, 2],
          lineStyle: {
            color: '#4caf50',
            width: 2
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(76, 175, 80, 0.4)' },
              { offset: 1, color: 'rgba(76, 175, 80, 0.05)' }
            ])
          },
          markLine: {
            symbol: 'none',
            label: {
              position: 'end',
              formatter: '预警线',
              color: '#d32f2f',
              fontSize: 12
            },
            lineStyle: {
              type: 'dashed',
              color: '#d32f2f'
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
  width: 100%;
  height: 100%;
  background-color: #dcdcdc;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  font-family: sans-serif;
}

.header {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-bottom: 10px;
}

.title-row {
  margin-bottom: 10px;
}

.main-title {
  color: #4db6ac; /* 青色 */
  font-size: 20px;
  margin: 0;
  font-weight: bold;
}

.nav-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tab-container {
  display: flex;
  background-color: #b0bec5; /* 深一点的灰色背景作为Tab容器 */
  border-radius: 20px;
  padding: 4px;
  /* 截图里的Tab看起来像是一个长条 */
  background: linear-gradient(to right, #90caf9, #b0bec5); 
  border-radius: 25px;
  overflow: hidden;
}

.tab-item {
  padding: 8px 20px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  background-color: #81d4fa; /* 浅蓝色选中背景 */
  color: #fff;
  font-weight: bold;
  border-radius: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.icon-group {
  display: flex;
  gap: 15px;
  align-items: center;
}

.icon-btn {
  width: 36px;
  height: 36px;
  background-color: #90a4ae;
  border-radius: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  position: relative;
}

.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: #ff5252;
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

.chart-area {
  flex: 4;
  background-color: #dcdcdc;
  position: relative;
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0 10px;
  position: relative;
  height: 30px;
}

.y-axis-label {
  position: absolute;
  left: 0;
  top: 0;
  color: #666;
  font-size: 12px;
}

.legend {
  position: absolute;
  right: 20px;
  top: 0;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #666;
}

.legend-line {
  display: inline-block;
  width: 20px;
  height: 2px;
  background-color: #4caf50;
  margin-right: 5px;
}

.echarts-container {
  width: 100%;
  height: 100%;
  flex: 1;
}

.x-axis-label {
  position: absolute;
  right: 10px;
  bottom: 10px;
  color: #666;
  font-size: 12px;
}
</style>