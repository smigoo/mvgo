<template>
  <div class="chart-panel">
    <!-- 顶部控制区 -->
    <div class="header-section">
      <div class="title-row">
        <h2 class="main-title">环境监测</h2>
      </div>
      
      <div class="nav-bar">
        <div class="tabs-container">
          <div class="tab-item active">
            <span class="arrow-shape"></span>
            <span class="tab-text">一氧化碳</span>
          </div>
          <div class="tab-item">
            <span class="tab-text">能见度</span>
          </div>
          <div class="tab-item">
            <span class="tab-text">洞内照明</span>
          </div>
          <div class="tab-item">
            <span class="tab-text">洞外光强</span>
          </div>
        </div>
        
        <div class="icons-container">
          <div class="icon-box">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
              <path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 9h4v8h-4v-8z"/>
            </svg>
          </div>
          <div class="icon-box relative">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
              <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
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

const chartRef = ref(null);
let chartInstance = null;

onMounted(() => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value);
    
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
          color: '#333',
          fontSize: 12
        },
        icon: 'rect' // 简化图例图标
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '15%',
        containLabel: true
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
          margin: 10
        },
        name: '时',
        nameLocation: 'end',
        nameTextStyle: {
          color: '#666',
          padding: [0, 0, 0, 10]
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
          padding: [0, 0, 20, 0] // 调整名称位置
        },
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        splitLine: {
          lineStyle: {
            type: 'dashed',
            color: '#e0e0e0'
          }
        },
        axisLabel: {
          color: '#666'
        }
      },
      series: [
        {
          name: 'zk3+785CO浓度',
          type: 'line',
          smooth: true,
          symbol: 'none',
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
          data: [2, 5, 6, 5, 3, 4, 8, 15, 12, 10, 6, 2],
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
.chart-panel {
  width: 100%;
  height: 100%;
  background-color: #d3d8e0; /* 浅灰蓝背景 */
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  font-family: sans-serif;
}

.header-section {
  height: 20%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.title-row {
  margin-bottom: 10px;
  padding-left: 10px;
}

.main-title {
  color: #4db6ac; /* 青色标题 */
  font-size: 18px;
  margin: 0;
  font-weight: bold;
}

.nav-bar {
  background-color: #8fa3b5; /* 导航条背景 */
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  height: 40px;
}

.tabs-container {
  display: flex;
  align-items: center;
  height: 100%;
}

.tab-item {
  padding: 0 15px;
  height: 100%;
  display: flex;
  align-items: center;
  color: white;
  font-size: 14px;
  cursor: pointer;
  position: relative;
}

.tab-item.active {
  background-color: #5bc0de; /* 选中态青色 */
  /* 制造左侧箭头效果 */
  clip-path: polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%);
  margin-right: 5px;
  padding-left: 20px; /* 补偿clip-path切掉的部分 */
  font-weight: bold;
}

/* 模拟左侧箭头突出 */
.tab-item.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 0;
  width: 0;
  height: 0;
  border-top: 20px solid transparent;
  border-bottom: 20px solid transparent;
  border-right: 10px solid #5bc0de;
  /* 由于clip-path的存在，这个伪元素可能不可见，直接用clip-path形状即可 */
  display: none; 
}

.icons-container {
  display: flex;
  gap: 15px;
  align-items: center;
  padding-right: 10px;
}

.icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.relative {
  position: relative;
}

.badge {
  position: absolute;
  top: -5px;
  right: -8px;
  background-color: #d9534f;
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

.chart-section {
  height: 80%;
  width: 100%;
  position: relative;
}

.echarts-container {
  width: 100%;
  height: 100%;
}
</style>