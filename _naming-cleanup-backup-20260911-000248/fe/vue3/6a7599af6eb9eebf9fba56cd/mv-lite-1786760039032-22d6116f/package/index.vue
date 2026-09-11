<template>
  <div class="container">
    <!-- 顶部区域 -->
    <div class="header">
      <div class="title-row">
        <h1 class="main-title">环境监测</h1>
        <div class="logo-placeholder"></div>
      </div>

      <div class="nav-row">
        <div class="tab-container">
          <div 
            class="tab-item active" 
            :class="{ active: currentTab === '一氧化碳' }"
            @click="currentTab = '一氧化碳'"
          >
            一氧化碳
          </div>
          <div 
            class="tab-item" 
            v-for="tab in otherTabs" 
            :key="tab"
            :class="{ active: currentTab === tab }"
            @click="currentTab = tab"
          >
            {{ tab }}
          </div>
        </div>

        <div class="action-buttons">
          <div class="btn-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#4A90E2">
              <path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 9h4v8h-4v-8z"/>
            </svg>
          </div>
          <div class="btn-icon relative">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#4A90E2">
              <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
            </svg>
            <div class="badge">6</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="chart-section">
      <div class="chart-legend">
        <span class="legend-line"></span>
        <span class="legend-text">zk3+785CO浓度</span>
      </div>
      
      <div class="axis-label y-label">辆</div>
      <div class="axis-label x-label">时</div>

      <div ref="chartRef" class="echarts-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const currentTab = ref('一氧化碳');
const otherTabs = ['能见度', '洞内照明', '洞外光强'];
const chartRef = ref(null);
let chartInstance = null;

onMounted(() => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value);
    
    const option = {
      grid: {
        top: 40,
        right: 60,
        bottom: 30,
        left: 40,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#555',
          fontSize: 14,
          margin: 15
        },
        boundaryGap: false
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 40,
        interval: 10,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#555',
          fontSize: 14,
          margin: 15
        },
        splitLine: {
          lineStyle: {
            type: 'dashed',
            color: 'rgba(255, 255, 255, 0.6)'
          }
        }
      },
      series: [
        {
          name: 'zk3+785CO浓度',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: [5, 7, 6, 3, 2, 5, 12, 14, 13, 10, 5, 0],
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
          markLine: {
            symbol: 'none',
            label: {
              position: 'end',
              formatter: '预警线',
              color: '#e74c3c',
              fontSize: 14,
              distance: [0, -10]
            },
            lineStyle: {
              type: 'dashed',
              color: '#e74c3c',
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
.container {
  width: 100%;
  height: 100%;
  min-height: 500px;
  background-color: #9ba4b0; /* 截图背景灰蓝色 */
  padding: 20px 30px;
  box-sizing: border-box;
  font-family: sans-serif;
  display: flex;
  flex-direction: column;
  border: 4px solid #000; /* 模拟黑色边框 */
}

.header {
  margin-bottom: 20px;
}

.title-row {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  position: relative;
}

.main-title {
  color: #5dade2;
  font-size: 28px;
  margin: 0;
  font-weight: bold;
  letter-spacing: 1px;
}

.logo-placeholder {
  width: 12px;
  height: 12px;
  border: 2px solid #5dade2;
  border-radius: 50%;
  margin-left: 10px;
  opacity: 0.6;
}

.nav-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tab-container {
  background-color: #aed6f1; /* 浅蓝长条背景 */
  border-radius: 25px;
  display: flex;
  align-items: center;
  padding: 4px;
  position: relative;
  flex: 1;
  max-width: 70%;
}

.tab-item {
  padding: 8px 20px;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  position: relative;
  z-index: 1;
  transition: all 0.3s;
}

.tab-item.active {
  background-color: #2980b9; /* 深蓝选中背景 */
  color: #fff;
  font-weight: bold;
  border-radius: 20px 0 0 20px;
  /* 模拟箭头形状 */
  clip-path: polygon(0 0, 90% 0, 100% 50%, 90% 100%, 0 100%);
  padding-right: 30px;
  margin-right: -10px;
  z-index: 2;
}

/* 非选中项在浅蓝背景上，文字颜色调整 */
.tab-container .tab-item:not(.active) {
  color: #fff; /* 截图里文字看起来像白色或很浅的蓝色，对比度不高，这里用白色 */
  text-shadow: 0 0 2px rgba(0,0,0,0.1);
}
/* 修正：截图里未选中文字是浅蓝色/白色，背景是浅蓝条。看截图“能见度”是白色的。 */

.action-buttons {
  display: flex;
  gap: 10px;
  margin-left: 20px;
}

.btn-icon {
  background-color: #fff;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  background-color: #e74c3c;
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #9ba4b0; /* 与背景色融合 */
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
  z-index: 10;
}

.legend-line {
  display: inline-block;
  width: 20px;
  height: 3px;
  background-color: #2ecc71;
  margin-right: 8px;
}

.legend-text {
  color: #333;
  font-size: 14px;
}

.axis-label {
  position: absolute;
  color: #555;
  font-size: 16px;
  z-index: 10;
}

.y-label {
  top: 40px;
  left: 10px;
}

.x-label {
  bottom: 10px;
  right: 10px;
}

.echarts-container {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>