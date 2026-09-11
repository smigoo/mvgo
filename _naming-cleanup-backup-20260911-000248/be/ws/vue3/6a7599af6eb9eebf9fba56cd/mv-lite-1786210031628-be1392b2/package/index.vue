<template>
  <div class="dashboard-container">
    <!-- 顶部导航区 -->
    <div class="header-section">
      <div class="title">环境监测</div>
      
      <div class="nav-row">
        <div class="tab-group">
          <div 
            class="tab-item" 
            :class="{ active: currentTab === 'co' }" 
            @click="currentTab = 'co'"
          >
            一氧化碳
          </div>
          <div class="tab-item" @click="currentTab = 'vis'">能见度</div>
          <div class="tab-item" @click="currentTab = 'in-light'">洞内照明</div>
          <div class="tab-item" @click="currentTab = 'out-light'">洞外光强</div>
        </div>

        <div class="icon-group">
          <div class="icon-btn">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
              <path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 9h4v8h-4v-8z"/>
            </svg>
          </div>
          <div class="icon-btn relative">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
              <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
            </svg>
            <span class="badge">6</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表展示区 -->
    <div class="chart-section">
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const currentTab = ref('co');
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
      right: 40,
      top: 10,
      textStyle: {
        color: '#333',
        fontSize: 12
      },
      icon: 'rect' // 简化图例图标
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      axisLine: {
        lineStyle: { color: '#999' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#666',
        margin: 15
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
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#ccc'
        }
      },
      axisLabel: {
        color: '#666'
      },
      name: '辆', // 忠实还原截图文字
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666',
        align: 'right',
        padding: [0, 0, 20, 0]
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#5cb85c',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(92, 184, 92, 0.4)' },
            { offset: 1, color: 'rgba(92, 184, 92, 0.05)' }
          ])
        },
        data: [3, 5, 4, 3, 2, 3, 5, 10, 15, 16, 14, 10, 5, 2] 
        // 映射到 2, 4, 6... 24 (12个点)
        // 数据估算: 2->3, 4->5, 6->4, 8->3, 10->2, 12->3, 14->5, 16->10(峰值偏左), 18->15, 20->14, 22->10, 24->2
        // 重新调整数据以匹配截图形状: 0-12较低, 14-20隆起
      },
      {
        name: '预警线',
        type: 'line',
        symbol: 'none',
        lineStyle: {
          type: 'dashed',
          color: '#d9534f',
          width: 1
        },
        markLine: {
          symbol: 'none',
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#d9534f',
            distance: 10
          },
          lineStyle: {
            type: 'dashed',
            color: '#d9534f'
          },
          data: [
            { yAxis: 30 }
          ]
        },
        data: [] 
      }
    ]
  };

  // 修正数据点以匹配X轴
  // X轴: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24
  // 截图曲线: 2-10 很低 (~2-5), 12开始上升, 16最高 (~15), 22下降
  option.series[0].data = [3, 4, 3, 2, 2, 3, 6, 12, 15, 14, 10, 2];

  chartInstance.setOption(option);
};
</script>

<style scoped>
.dashboard-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
  background-color: #cfd4d9; /* 接近截图的灰蓝色背景 */
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  font-family: sans-serif;
}

.header-section {
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}

.title {
  color: #4db6c2;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 15px;
}

.nav-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tab-group {
  display: flex;
  background-color: #eef2f6; /* Tab 容器背景 */
  border-radius: 25px;
  padding: 4px;
  /* 截图里Tab栏左边有个尖角，这里简化为圆角矩形 */
  background: linear-gradient(to right, #dce6f0, #eef2f6);
  border: 1px solid #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.tab-item {
  padding: 8px 20px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  border-radius: 20px;
  transition: all 0.3s;
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.tab-item.active {
  background-color: #8cbdd6; /* 激活态浅蓝色 */
  color: #fff;
  font-weight: bold;
  box-shadow: inset 0 1px 3px rgba(255,255,255,0.5);
}

.icon-group {
  display: flex;
  gap: 15px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  background-color: #fff;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.icon-btn svg {
  fill: #5bc0de; /* 图标颜色 */
}

.relative {
  position: relative;
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
  border: 2px solid #cfd4d9; /* 与背景色融合 */
}

.chart-section {
  flex: 1;
  background-color: #cfd4d9;
  position: relative;
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>