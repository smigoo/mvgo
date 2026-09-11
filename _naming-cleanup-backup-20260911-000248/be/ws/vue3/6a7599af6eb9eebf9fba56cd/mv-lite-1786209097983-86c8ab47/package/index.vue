<template>
  <div class="dashboard-container">
    <!-- 标题区 -->
    <div class="header-section">
      <h1 class="main-title">环境监测</h1>
    </div>

    <!-- 导航Tab区 -->
    <div class="nav-section">
      <div class="tabs-wrapper">
        <div class="tab-shape">
          <div class="tab-item active">一氧化碳</div>
          <div class="tab-item">能见度</div>
          <div class="tab-item">洞内照明</div>
          <div class="tab-item">洞外光强</div>
        </div>
      </div>
      
      <div class="icon-buttons">
        <div class="icon-btn">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#5b9bd5">
            <path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 9h4v8h-4v-8z"/>
          </svg>
        </div>
        <div class="icon-btn relative">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#5b9bd5">
            <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
          </svg>
          <span class="badge">6</span>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-section">
      <div class="y-axis-label top-left">辆</div>
      <div class="x-axis-label bottom-right">时</div>
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
        right: 20,
        top: 10,
        textStyle: {
          color: '#333',
          fontSize: 12
        },
        icon: 'rect',
        itemWidth: 20,
        itemHeight: 3,
        itemStyle: {
          color: '#2ecc71'
        }
      },
      xAxis: {
        type: 'category',
        data: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
        axisLine: {
          show: true,
          lineStyle: { color: '#888' }
        },
        axisTick: { show: false },
        axisLabel: {
          color: '#555',
          fontSize: 14,
          margin: 10
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
            color: 'rgba(255, 255, 255, 0.5)'
          }
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
          color: '#555',
          fontSize: 14,
          formatter: '{value}'
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
            color: 'rgba(255, 255, 255, 0.5)'
          }
        }
      },
      series: [
        {
          name: 'zk3+785CO浓度',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: [5, 7, 6, 3, 2, 5, 11, 14, 13, 10, 4, 0],
          itemStyle: {
            color: '#2ecc71'
          },
          lineStyle: {
            width: 2,
            color: '#2ecc71'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(46, 204, 113, 0.4)' },
              { offset: 1, color: 'rgba(46, 204, 113, 0.05)' }
            ])
          },
          markLine: {
            symbol: 'none',
            data: [
              {
                yAxis: 30,
                lineStyle: {
                  type: 'dashed',
                  color: '#e74c3c',
                  width: 1
                },
                label: {
                  position: 'end',
                  formatter: '预警线',
                  color: '#e74c3c',
                  fontSize: 14,
                  offset: [0, -10]
                }
              }
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
  width: 100%;
  height: 100%;
  background-color: #9ca3af; /* 截图背景灰 */
  border: 4px solid #000;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 20px 30px;
  font-family: sans-serif;
  position: relative;
  overflow: hidden;
}

/* 标题区 */
.header-section {
  height: 10%;
  display: flex;
  align-items: flex-start;
}

.main-title {
  color: #5b9bd5;
  font-size: 24px;
  font-weight: bold;
  margin: 0;
  letter-spacing: 1px;
}

/* 导航Tab区 */
.nav-section {
  height: 15%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.tabs-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
}

/* 模拟截图中的长条Tab背景 */
.tab-shape {
  display: flex;
  background: rgba(173, 216, 230, 0.2); /* 浅蓝半透明 */
  border: 1px solid rgba(173, 216, 230, 0.5);
  border-radius: 4px;
  padding: 5px;
  position: relative;
  /* 简单的形状模拟 */
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
  padding-left: 20px;
  padding-right: 10px;
  height: 40px;
  align-items: center;
  background: linear-gradient(90deg, rgba(135, 206, 235, 0.3) 0%, rgba(135, 206, 235, 0.1) 100%);
}

.tab-item {
  padding: 8px 20px;
  font-size: 18px;
  color: #aaddff;
  cursor: pointer;
  white-space: nowrap;
}

.tab-item.active {
  background-color: #4a8b9e; /* 深青色 */
  color: #fff;
  border-radius: 4px;
  font-weight: bold;
  /* 模拟选中项的箭头形状 */
  clip-path: polygon(0 0, 90% 0, 100% 50%, 90% 100%, 0 100%);
  padding-left: 25px;
  margin-left: -15px;
}

.icon-buttons {
  display: flex;
  gap: 10px;
  margin-right: 20px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  background-color: #fff;
  border-radius: 4px;
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
  background-color: #e74c3c;
  color: white;
  font-size: 12px;
  font-weight: bold;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 2px solid #9ca3af; /* 匹配背景色以产生镂空感 */
}

/* 图表区 */
.chart-section {
  flex: 1;
  position: relative;
  width: 100%;
}

.echarts-container {
  width: 100%;
  height: 100%;
}

.y-axis-label {
  position: absolute;
  top: 20px;
  left: 10px;
  color: #555;
  font-size: 14px;
  z-index: 10;
}

.x-axis-label {
  position: absolute;
  bottom: 10px;
  right: 10px;
  color: #555;
  font-size: 14px;
  z-index: 10;
}

</style>