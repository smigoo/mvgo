<template>
  <div class="mc-lite-echarts-test">
    <!-- 顶部导航区 -->
    <div class="header">
      <div class="title">环境监测</div>
      
      <div class="nav-container">
        <div class="tabs">
          <div 
            v-for="tab in tabs" 
            :key="tab"
            :class="['tab-item', { active: currentTab === tab }]"
            @click="handleTabClick(tab)"
          >
            {{ tab }}
          </div>
        </div>
        
        <div class="tools">
          <div class="icon-btn chart-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4" y="12" width="4" height="8" rx="1" fill="white" stroke="white"/>
              <rect x="10" y="6" width="4" height="14" rx="1" fill="white" stroke="white"/>
              <rect x="16" y="16" width="4" height="4" rx="1" fill="white" stroke="white"/>
            </svg>
          </div>
          <div class="icon-btn list-icon-wrapper">
            <div class="icon-btn list-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <line x1="8" y1="12" x2="21" y2="12" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <line x1="8" y1="18" x2="21" y2="18" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <line x1="3" y1="6" x2="3.01" y2="6" stroke="white" stroke-width="3" stroke-linecap="round"/>
                <line x1="3" y1="12" x2="3.01" y2="12" stroke="white" stroke-width="3" stroke-linecap="round"/>
                <line x1="3" y1="18" x2="3.01" y2="18" stroke="white" stroke-width="3" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="badge">6</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-area">
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';

const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];
const currentTab = ref('一氧化碳');
const chartRef = ref(null);
let chartInstance = null;

const handleTabClick = (tab) => {
  currentTab.value = tab;
  // 模拟切换数据，实际项目中会根据 tab 请求不同数据
  updateChartOption(tab);
};

// 模拟数据生成
const generateData = () => {
  const data = [];
  for (let i = 2; i <= 24; i += 2) {
    // 模拟一个类似截图的曲线：中午/下午高，早晚低
    let val = 2;
    if (i >= 12 && i <= 20) {
      val = 5 + Math.random() * 10; 
      if (i === 16) val = 15; // 峰值
    } else {
      val = 2 + Math.random() * 3;
    }
    data.push([i, val]);
  }
  return data;
};

const initChart = () => {
  if (!chartRef.value) return;
  chartInstance = echarts.init(chartRef.value);
  updateChartOption(currentTab.value);
};

const updateChartOption = (tab) => {
  if (!chartInstance) return;
  
  const option = {
    color: ['#2ecc71'],
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['zk3+785CO浓度'],
      right: 40,
      top: 10,
      textStyle: {
        color: '#666',
        fontSize: 12
      },
      icon: 'rect'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 24,
      interval: 2,
      axisLabel: {
        color: '#888',
        formatter: '{value}'
      },
      axisLine: {
        lineStyle: { color: '#ccc' }
      },
      splitLine: {
        show: false
      },
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#888',
        padding: [0, 0, 0, 10]
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 50,
      interval: 10,
      axisLabel: {
        color: '#888'
      },
      axisLine: {
        show: true,
        lineStyle: { color: '#ccc' }
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#e0e0e0'
        }
      },
      name: '辆', // 截图里Y轴有个“辆”字，虽然单位可能是错的，但为了还原
      nameLocation: 'end',
      nameTextStyle: {
        color: '#888',
        align: 'right'
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
        data: generateData(),
        markLine: {
          symbol: 'none',
          label: {
            position: 'end',
            formatter: '预警线',
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

  // 根据Tab简单调整一下标题或数据（模拟交互）
  if (tab !== '一氧化碳') {
     // 这里只是演示，实际可以换数据
     option.series[0].name = `${tab}数据`;
     option.legend.data = [`${tab}数据`];
  }

  chartInstance.setOption(option, true);
};

onMounted(() => {
  initChart();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose();
  }
  window.removeEventListener('resize', handleResize);
});

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize();
  }
};
</script>

<style scoped>
.mc-lite-echarts-test {
  width: 100%;
  height: 100%;
  background-color: #dcdcdc; /* 根据拆解 */
  border-radius: 4px;
  padding: 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  font-family: sans-serif;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.header {
  height: 15%;
  min-height: 60px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin-bottom: 10px;
}

.title {
  font-size: 18px;
  font-weight: bold;
  color: #5bc0de; /* primary color */
  margin-bottom: 5px;
}

.nav-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #eef2f5; /* 稍微亮一点的背景给导航条 */
  border-radius: 20px;
  padding: 5px 10px;
  height: 40px;
}

.tabs {
  display: flex;
  gap: 5px;
  flex: 1;
}

.tab-item {
  padding: 6px 15px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.3s;
  /* 默认样式 */
}

.tab-item.active {
  background: linear-gradient(90deg, #5bc0de, #87d3e8);
  color: #fff;
  font-weight: bold;
  /* 箭头形状模拟 */
  clip-path: polygon(10% 0, 100% 0, 90% 100%, 0% 100%);
  padding-left: 20px;
  margin-right: 5px;
}

.tools {
  display: flex;
  gap: 15px;
  align-items: center;
  padding-right: 10px;
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
}

.icon-btn svg {
  width: 20px;
  height: 20px;
}

.list-icon-wrapper {
  position: relative;
}

.badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background-color: #e74c3c;
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
  flex: 1;
  height: 85%;
  position: relative;
  background-color: #dcdcdc; /* 保持背景一致 */
}

.chart-container {
  width: 100%;
  height: 100%;
}
</style>