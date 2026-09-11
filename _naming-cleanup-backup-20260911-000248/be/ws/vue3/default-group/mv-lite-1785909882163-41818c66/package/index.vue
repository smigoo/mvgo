<template>
  <div class="container">
    <!-- 顶部导航区 -->
    <div class="header">
      <div class="title">环境监测</div>
      
      <div class="tabs-container">
        <div class="tabs-wrapper">
          <div 
            v-for="tab in tabs" 
            :key="tab" 
            class="tab-item" 
            :class="{ active: activeTab === tab }"
            @click="activeTab = tab"
          >
            {{ tab }}
          </div>
        </div>
      </div>

      <div class="icons">
        <div class="icon-btn chart-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#4A90E2">
            <rect x="4" y="12" width="4" height="8" rx="1"/>
            <rect x="10" y="6" width="4" height="14" rx="1"/>
            <rect x="16" y="16" width="4" height="4" rx="1"/>
          </svg>
        </div>
        <div class="icon-btn list-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#4A90E2">
            <rect x="4" y="6" width="16" height="3" rx="1"/>
            <rect x="4" y="11" width="16" height="3" rx="1"/>
            <rect x="4" y="16" width="16" height="3" rx="1"/>
          </svg>
          <div class="badge">6</div>
        </div>
      </div>
    </div>

    <!-- 主体图表区 -->
    <div class="chart-container">
      <div ref="chartRef" class="echarts-box"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];
const activeTab = ref('一氧化碳');
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
        icon: 'rect' // 模拟短线
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
        axisLine: {
          lineStyle: { color: '#ccc' }
        },
        axisLabel: {
          color: '#666',
          fontSize: 12
        },
        axisTick: { show: false }
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
          padding: [0, 0, 20, 0], // 调整name位置到上方
          align: 'right'
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#666',
          fontSize: 12
        },
        splitLine: {
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
          data: [5, 6, 5, 4, 5, 5, 6, 10, 15, 14, 12, 8, 2],
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
          markLine: {
            symbol: ['none', 'none'],
            label: {
              formatter: '预警线',
              position: 'end',
              color: '#d9534f',
              fontSize: 12,
              padding: [0, 0, 0, 10]
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
.container {
  width: 100%;
  height: 100%;
  background-color: #d3d8e0; /* 截图背景色 */
  border-radius: 8px;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  font-family: sans-serif;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  height: 60px;
}

.title {
  font-size: 20px;
  font-weight: bold;
  color: #4facfe; /* 标题蓝色 */
  margin-right: 20px;
}

.tabs-container {
  flex: 1;
  display: flex;
  align-items: center;
}

.tabs-wrapper {
  display: flex;
  background-color: #a8cce8; /* Tab栏背景 */
  border-radius: 20px;
  padding: 4px;
  overflow: hidden;
}

.tab-item {
  padding: 6px 20px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  border-radius: 16px;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  background-color: #4A90E2; /* 激活态蓝色 */
  color: #fff;
  font-weight: bold;
}

.icons {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-left: 20px;
}

.icon-btn {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background-color: #fff; /* 图标背景可能是白色或透明，截图看起来像蓝色图标在灰色背景上，或者蓝色块 */
  /* 截图里图标是蓝色的，背景看起来像是浅蓝色块或者就是蓝色图标 */
  background: transparent; 
}

/* 模拟截图中的蓝色图标块 */
.chart-icon, .list-icon {
  background-color: #4A90E2;
  border-radius: 4px;
  padding: 4px;
}
.chart-icon svg, .list-icon svg {
  fill: #fff; /* 图标内部白色 */
  width: 20px;
  height: 20px;
}

.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: #ff4d4f;
  color: white;
  font-size: 10px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.chart-container {
  flex: 1;
  position: relative;
  background-color: #d3d8e0; /* 与背景一致 */
}

.echarts-box {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>