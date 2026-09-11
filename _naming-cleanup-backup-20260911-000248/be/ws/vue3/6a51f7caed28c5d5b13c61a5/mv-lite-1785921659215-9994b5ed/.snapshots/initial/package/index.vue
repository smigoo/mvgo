<template>
  <div class="container">
    <!-- 标题区 -->
    <div class="header">
      <h1 class="title">环境监测</h1>
    </div>

    <!-- 导航Tab区 -->
    <div class="nav-bar">
      <div class="tabs-container">
        <img src="../resources/images/tabs-icon-43.png" class="tabs-icon" alt="tabs-icon" />
        <div 
          v-for="tab in tabs" 
          :key="tab"
          class="tab-item"
          :class="{ active: currentTab === tab }"
          :style="currentTab === tab ? { backgroundImage: \"url('../resources/images/bg-tab-active-7891.png')\", backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : {}"
          @click="currentTab = tab"
        >
          {{ tab }}
        </div>
      </div>
      
      <div class="actions">
        <div class="icon-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="#4fa4d8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        </div>
        <div class="icon-btn relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="#4fa4d8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
          <div class="badge">6</div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-container">
      <div class="y-axis-label top-left">辆</div>
      <div class="x-axis-label bottom-right">时</div>
      <div ref="chartRef" class="echarts-box"></div>
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
          margin: 15
        },
        splitLine: {
          show: false
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
          color: '#666',
          formatter: '{value}'
        },
        splitLine: {
          lineStyle: {
            type: 'dashed',
            color: '#dcdcdc'
          }
        }
      },
      series: [
        {
          name: 'zk3+785CO浓度',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: {
            color: '#4ade80', // 绿色
            width: 2
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(74, 222, 128, 0.4)' },
              { offset: 1, color: 'rgba(74, 222, 128, 0.05)' }
            ])
          },
          data: [5, 7, 6, 4, 3, 5, 11, 14, 13, 11, 5, 1],
          markLine: {
            symbol: 'none',
            label: {
              position: 'end',
              formatter: '预警线',
              color: '#ef4444',
              fontSize: 14,
              offset: [0, -10]
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
      ],
      legend: {
        data: ['zk3+785CO浓度'],
        right: 20,
        top: 10,
        textStyle: {
          color: '#333'
        },
        icon: 'rect'
      }
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
  background-image: url('../resources/images/bg-7880.png');
  background-size: cover;
  background-repeat: no-repeat;
  width: 100%;
  height: 100%;
  min-height: 500px;
  padding: 20px 30px;
  box-sizing: border-box;
  font-family: sans-serif;
  position: relative;
  display: flex;
  flex-direction: column;
}

.header {
  margin-bottom: 10px;
}

.title {
  color: #5b9bd5;
  font-size: 24px;
  margin: 0;
  font-weight: bold;
  letter-spacing: 1px;
}

.nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  position: relative;
}

.tabs-container {
  display: flex;
  background-image: url('../resources/images/bg-7890.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  /* 模拟左侧箭头形状 */
  clip-path: polygon(20px 0, 100% 0, 100% 100%, 20px 100%, 0 50%);
  padding-left: 25px; /* 给箭头留空间 */
  padding-right: 10px;
  height: 40px;
  align-items: center;
  flex: 1;
  max-width: 70%;
  margin-right: 20px;
}

.tabs-icon {
  width: 52px;
  height: 24px;
  margin-right: 8px;
  flex-shrink: 0;
}

.tab-item {
  padding: 0 20px;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  height: 100%;
  display: flex;
  align-items: center;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  /* 激活项也需要稍微调整形状以匹配整体，这里简化处理，主要靠背景色区分 */
  clip-path: polygon(15px 0, 100% 0, 100% 100%, 15px 100%, 0 50%);
  margin-left: -15px; /* 向左偏移覆盖箭头 */
  padding-left: 30px;
  font-weight: bold;
  z-index: 2;
}

.actions {
  display: flex;
  gap: 10px;
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

.icon-btn svg {
  width: 20px;
  height: 20px;
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
  font-size: 12px;
  font-weight: bold;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 2px solid #9ba4ad; /* 匹配背景色以产生镂空感 */
}

.chart-container {
  flex: 1;
  position: relative;
  background: transparent;
}

.echarts-box {
  width: 100%;
  height: 100%;
  min-height: 300px;
}

.y-axis-label {
  position: absolute;
  top: 10px;
  left: 10px;
  color: #666;
  font-size: 14px;
  z-index: 10;
}

.x-axis-label {
  position: absolute;
  bottom: 10px;
  right: 10px;
  color: #666;
  font-size: 14px;
  z-index: 10;
}
</style>
