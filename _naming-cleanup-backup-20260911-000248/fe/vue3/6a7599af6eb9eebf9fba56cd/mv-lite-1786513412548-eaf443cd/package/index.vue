<template>
  <div class="dashboard-container">
    <!-- 标题区 -->
    <div class="header-section">
      <h1 class="main-title">环境监测</h1>
    </div>

    <!-- 导航区 -->
    <div class="nav-section">
      <div class="tab-bar-wrapper">
        <div class="tab-bar">
          <div 
            v-for="(tab, index) in tabs" 
            :key="index"
            class="tab-item"
            :class="{ active: currentTab === index }"
            @click="currentTab = index"
          >
            {{ tab }}
          </div>
        </div>
      </div>
      
      <div class="action-buttons">
        <div class="icon-btn">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#4A90E2">
            <path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 9h4v8h-4v-8z"/>
          </svg>
        </div>
        <div class="icon-btn relative">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#4A90E2">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
          </svg>
          <div class="badge">6</div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-section">
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const currentTab = ref(0);
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];
const chartRef = ref(null);
let chartInstance = null;

onMounted(() => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value);
    const option = {
      grid: {
        top: 40,
        right: 40,
        bottom: 30,
        left: 40,
        containLabel: true
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['zk3+785CO浓度'],
        right: 20,
        top: 10,
        textStyle: {
          color: '#333', // 截图里看起来像深色，或者根据背景调整
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
        boundaryGap: false,
        data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
        axisLine: {
          lineStyle: { color: '#888' }
        },
        axisTick: { show: false },
        axisLabel: {
          color: '#555',
          margin: 15
        },
        name: '时',
        nameLocation: 'end',
        nameTextStyle: {
          color: '#555',
          padding: [0, 0, 0, 10]
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 40,
        interval: 10,
        splitLine: {
          lineStyle: {
            type: 'dashed',
            color: 'rgba(255, 255, 255, 0.6)'
          }
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#555',
          formatter: (value) => {
            if (value === 30) return '{red|30}';
            return value;
          },
          rich: {
            red: {
              color: '#d9534f',
              fontWeight: 'bold'
            }
          }
        },
        name: '辆',
        nameLocation: 'end',
        nameTextStyle: {
          color: '#555',
          padding: [0, 0, 20, 0],
          align: 'left'
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
              { offset: 1, color: 'rgba(46, 204, 113, 0.1)' }
            ])
          },
          data: [5, 7, 6, 4, 3, 4, 9, 13, 14, 12, 6, 1],
          markLine: {
            symbol: 'none',
            label: {
              formatter: '预警线',
              position: 'end',
              color: '#d9534f',
              fontSize: 14
            },
            lineStyle: {
              type: 'dashed',
              color: '#d9534f'
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
  background-color: #9ba6b5; /* 截图背景色 */
  width: 100%;
  height: 100%;
  min-height: 400px;
  padding: 20px;
  box-sizing: border-box;
  font-family: 'Microsoft YaHei', sans-serif;
  display: flex;
  flex-direction: column;
  border: 4px solid #000; /* 模拟截图外框 */
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.header-section {
  margin-bottom: 10px;
}

.main-title {
  color: #5dade2;
  font-size: 24px;
  margin: 0;
  font-weight: bold;
  letter-spacing: 1px;
}

.nav-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  position: relative;
}

.tab-bar-wrapper {
  flex: 1;
  margin-right: 20px;
}

.tab-bar {
  display: flex;
  background-color: #b3cde0; /* 浅蓝灰条背景 */
  border-radius: 4px;
  padding: 4px;
  position: relative;
  /* 模拟截图中的长条形状 */
  clip-path: polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%);
  /* 或者简单的圆角 */
  border-radius: 20px; 
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255,255,255,0.3);
}

.tab-item {
  padding: 8px 20px;
  color: #aaddff;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  background-color: #4ca3af; /* 深青色 */
  color: #fff;
  border-radius: 20px;
  font-weight: bold;
  /* 模拟箭头形状 */
  clip-path: polygon(0 0, 90% 0, 100% 50%, 90% 100%, 0 100%);
  margin-right: -10px;
  z-index: 2;
  padding-right: 30px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  z-index: 10;
}

.icon-btn {
  width: 36px;
  height: 36px;
  background-color: #fff;
  border-radius: 6px;
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
  border: 2px solid #9ba6b5; /* 匹配背景色以产生镂空效果 */
}

.chart-section {
  flex: 1;
  position: relative;
  width: 100%;
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>