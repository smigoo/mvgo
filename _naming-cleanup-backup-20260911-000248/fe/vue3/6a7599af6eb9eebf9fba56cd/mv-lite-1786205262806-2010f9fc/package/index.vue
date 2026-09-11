<template>
  <div class="panel-container">
    <!-- 顶部控制区 -->
    <div class="header-section">
      <div class="title-row">
        <h2 class="main-title">环境监测</h2>
      </div>
      
      <div class="control-row">
        <div class="tab-group">
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
            <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
              <rect x="4" y="12" width="4" height="8" rx="1"/>
              <rect x="10" y="6" width="4" height="14" rx="1"/>
              <rect x="16" y="10" width="4" height="10" rx="1"/>
            </svg>
          </div>
          <div class="icon-btn list-icon">
            <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
              <rect x="4" y="5" width="16" height="3" rx="1"/>
              <rect x="4" y="10.5" width="16" height="3" rx="1"/>
              <rect x="4" y="16" width="16" height="3" rx="1"/>
            </svg>
            <div class="badge">6</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表展示区 -->
    <div class="chart-section">
      <div ref="chartRef" class="echarts-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];
const currentTab = ref('一氧化碳');
const chartRef = ref(null);
let chartInstance = null;

onMounted(() => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value);
    setChartOption();
  }
});

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose();
  }
});

const setChartOption = () => {
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
      icon: 'rect',
      itemWidth: 15,
      itemHeight: 2
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
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
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666',
        padding: [0, 0, 10, 0]
      },
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
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: [5, 6, 5, 4, 3, 4, 6, 10, 14, 12, 8, 2],
        itemStyle: {
          color: '#4caf50'
        },
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
          data: [
            {
              yAxis: 30,
              label: {
                formatter: '预警线',
                position: 'end',
                color: '#d9534f',
                fontSize: 12
              },
              lineStyle: {
                type: 'dashed',
                color: '#d9534f'
              }
            }
          ]
        }
      }
    ]
  };

  chartInstance.setOption(option);
};
</script>

<style scoped>
.panel-container {
  width: 100%;
  height: 100%;
  background-color: #dcdcdc;
  border-radius: 4px;
  padding: 15px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  font-family: sans-serif;
}

.header-section {
  height: 20%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin-bottom: 10px;
}

.title-row {
  margin-bottom: 10px;
}

.main-title {
  margin: 0;
  color: #5bc0de;
  font-size: 18px;
  font-weight: bold;
}

.control-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tab-group {
  display: flex;
  background-color: #9cb4c4; /* 浅蓝灰色背景条 */
  border-radius: 20px;
  padding: 4px;
  overflow: hidden;
}

.tab-item {
  padding: 6px 16px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  border-radius: 16px;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  background-color: #5bc0de;
  color: #fff;
  font-weight: bold;
}

.icon-group {
  display: flex;
  gap: 10px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  background-color: #5bc0de;
  border-radius: 4px;
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
  background-color: #d9534f;
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

.chart-section {
  height: 80%;
  flex: 1;
  position: relative;
  background-color: transparent;
}

.echarts-container {
  width: 100%;
  height: 100%;
}
</style>