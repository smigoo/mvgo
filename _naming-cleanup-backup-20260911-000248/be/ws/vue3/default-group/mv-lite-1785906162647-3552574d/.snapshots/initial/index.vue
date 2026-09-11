<template>
  <div class="dashboard-container">
    <!-- 标题区 -->
    <div class="header">
      <h2 class="title">环境监测</h2>
    </div>

    <!-- 导航操作区 -->
    <div class="nav-bar">
      <div class="tabs-container">
        <div class="tab-item active">
          <span class="arrow-shape"></span>
          一氧化碳
        </div>
        <div class="tab-item">能见度</div>
        <div class="tab-item">洞内照明</div>
        <div class="tab-item">洞外光强</div>
      </div>
      
      <div class="action-icons">
        <div class="icon-btn bar-chart-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
            <rect x="4" y="12" width="4" height="8" />
            <rect x="10" y="6" width="4" height="14" />
            <rect x="16" y="16" width="4" height="4" />
          </svg>
        </div>
        <div class="icon-btn list-icon-wrapper">
          <div class="icon-btn list-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
              <rect x="4" y="6" width="16" height="2" />
              <rect x="4" y="11" width="16" height="2" />
              <rect x="4" y="16" width="16" height="2" />
            </svg>
          </div>
          <div class="badge">6</div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-area">
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
        right: 80,
        bottom: 30,
        left: 50,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
        axisLine: { lineStyle: { color: '#999' } },
        axisTick: { show: false },
        axisLabel: { color: '#666', margin: 15 },
        name: '时',
        nameLocation: 'end',
        nameTextStyle: { color: '#666', padding: [0, 0, 0, 10] }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 50,
        interval: 10,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#666' },
        splitLine: {
          lineStyle: {
            type: 'dashed',
            color: '#e0e0e0'
          }
        },
        name: '辆',
        nameLocation: 'end',
        nameTextStyle: { color: '#666', padding: [0, 0, 20, 0] }
      },
      series: [
        {
          name: 'zk3+785CO浓度',
          type: 'line',
          smooth: true,
          symbol: 'none',
          itemStyle: {
            color: '#5cb85c'
          },
          lineStyle: {
            width: 2,
            color: '#5cb85c'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(92, 184, 92, 0.4)' },
              { offset: 1, color: 'rgba(92, 184, 92, 0.05)' }
            ])
          },
          data: [2, 5, 6, 4, 2, 1, 2, 8, 12, 10, 6, 2],
          markLine: {
            symbol: 'none',
            label: {
              formatter: '预警线',
              position: 'end',
              color: '#d9534f',
              fontSize: 12
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
  }
});

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose();
  }
});
</script>

<style scoped>
.dashboard-container {
  background-color: #d3d8dc;
  width: 100%;
  height: 100%;
  min-height: 400px;
  padding: 20px;
  box-sizing: border-box;
  font-family: sans-serif;
  display: flex;
  flex-direction: column;
}

.header {
  margin-bottom: 15px;
}

.title {
  color: #5bc0de;
  font-size: 20px;
  margin: 0;
  font-weight: bold;
}

.nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: rgba(255, 255, 255, 0.1); /* 轻微的背景区分 */
  padding: 10px 0;
}

.tabs-container {
  display: flex;
  align-items: center;
  background: #eef2f5; /* 浅灰色底条 */
  border-radius: 20px;
  padding: 5px;
  position: relative;
}

.tab-item {
  padding: 8px 20px;
  font-size: 14px;
  color: #555;
  cursor: pointer;
  position: relative;
  z-index: 1;
}

.tab-item.active {
  background: #5bc0de;
  color: white;
  border-radius: 20px 0 0 20px; /* 左侧圆角 */
  /* 模拟箭头形状 */
  clip-path: polygon(0 50%, 15px 0, 100% 0, 100% 100%, 15px 100%);
  padding-left: 25px;
  margin-right: -10px; /* 重叠一点 */
  z-index: 2;
}

.action-icons {
  display: flex;
  gap: 10px;
  align-items: center;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.bar-chart-icon {
  background-color: #5bc0de;
}

.list-icon-wrapper {
  position: relative;
}

.list-icon {
  background-color: #f0ad4e;
}

.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #d9534f;
  color: white;
  font-size: 12px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
}

.chart-area {
  flex: 1;
  position: relative;
  background: transparent;
}

.chart-legend {
  position: absolute;
  top: 10px;
  right: 40px;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #666;
  z-index: 10;
}

.legend-line {
  display: inline-block;
  width: 20px;
  height: 2px;
  background-color: #5cb85c;
  margin-right: 5px;
}

.echarts-container {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>