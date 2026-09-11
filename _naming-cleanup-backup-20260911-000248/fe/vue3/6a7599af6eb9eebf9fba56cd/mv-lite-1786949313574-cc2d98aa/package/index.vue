<template>
  <div class="container">
    <!-- 顶部区域 -->
    <div class="header">
      <div class="title">环境监测</div>
      
      <div class="nav-row">
        <!-- Tab 切换栏 -->
        <div class="tab-wrapper">
          <div class="tab-shape">
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
        </div>

        <!-- 右上角图标 -->
        <div class="icons">
          <div class="icon-btn blue-bg">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
              <rect x="4" y="12" width="4" height="8" />
              <rect x="10" y="6" width="4" height="14" />
              <rect x="16" y="10" width="4" height="10" />
            </svg>
          </div>
          <div class="icon-btn blue-bg">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
              <rect x="4" y="6" width="16" height="2" />
              <rect x="4" y="11" width="16" height="2" />
              <rect x="4" y="16" width="16" height="2" />
            </svg>
          </div>
          <div class="icon-btn relative">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#888">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
            <div class="badge">6</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 主体图表区 -->
    <div class="chart-container">
      <div class="y-axis-label">辆</div>
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const currentTab = ref('一氧化碳');
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];

const chartRef = ref(null);
let chart = null;
let resizeObserver = null;

// Mock 数据
const xData = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
const yData = [2, 3, 4, 3, 2, 2, 3, 6, 10, 12, 10, 6];
const warningValue = 30;

const initChart = () => {
  if (!chartRef.value || chart) return;
  if (chartRef.value.clientWidth === 0 || chartRef.value.clientHeight === 0) return;

  chart = echarts.init(chartRef.value);

  const option = {
    grid: {
      top: 25,
      right: 50,
      bottom: 20,
      left: 30,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['zk3+785CO浓度'],
      right: 10,
      top: 0,
      textStyle: {
        color: '#333',
        fontSize: 10
      },
      icon: 'rect'
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#666',
        fontSize: 10,
        margin: 10
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          color: '#E0E0E0'
        }
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'start',
      nameTextStyle: {
        color: '#666',
        fontSize: 10,
        padding: [0, 0, 0, -20] // 调整位置
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#666',
        fontSize: 10
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          color: '#E0E0E0'
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: yData,
        lineStyle: {
          color: '#50E3C2',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(80, 227, 194, 0.5)' },
            { offset: 1, color: 'rgba(80, 227, 194, 0.1)' }
          ])
        }
      },
      {
        name: '预警线',
        type: 'line',
        symbol: 'none',
        data: Array(xData.length).fill(warningValue),
        lineStyle: {
          color: '#F56C6C',
          type: 'dashed',
          width: 1
        },
        markPoint: {
          data: [
            {
              type: 'max',
              name: '预警线',
              label: {
                show: true,
                position: 'right',
                formatter: '预警线',
                color: '#F56C6C',
                fontSize: 10
              }
            }
          ],
          symbol: 'none',
          label: {
             show: true,
             position: 'right',
             formatter: '预警线',
             color: '#F56C6C',
             fontSize: 10
          }
        }
      }
    ]
  };

  // 手动添加预警线文字标注，因为 markPoint 可能位置不准
  // 使用 graphic 组件或者直接在 series 里处理
  // 这里简化处理，依靠 markLine 或单独 series
  
  // 修正：使用 markLine 更合适
  option.series[0].markLine = {
    symbol: 'none',
    label: {
      show: true,
      position: 'end',
      formatter: '预警线',
      color: '#F56C6C',
      fontSize: 10
    },
    lineStyle: {
      color: '#F56C6C',
      type: 'dashed'
    },
    data: [
      { yAxis: warningValue }
    ]
  };
  
  // 移除第二个 series，改用 markLine
  option.series.pop();

  chart.setOption(option);
};

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        if (!chart) {
          initChart();
        } else {
          chart.resize();
        }
      }
    }
  });
  
  if (chartRef.value) {
    resizeObserver.observe(chartRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (chart) {
    chart.dispose();
  }
});
</script>

<style scoped>
.container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #D3D3D3;
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  font-family: sans-serif;
  overflow: hidden;
}

.header {
  display: flex;
  flex-direction: column;
  margin-bottom: 5px;
}

.title {
  color: #4A90E2;
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 6px;
}

.nav-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tab-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
}

.tab-shape {
  display: flex;
  background: #E8E8E8;
  border-radius: 4px;
  /* 模拟左侧箭头效果 */
  position: relative;
  padding-left: 10px;
  clip-path: polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%);
  background: #F0F0F0;
}

.tab-item {
  padding: 4px 10px;
  font-size: 11px;
  color: #555;
  cursor: pointer;
  white-space: nowrap;
}

.tab-item.active {
  background: #8CB4D8;
  color: #fff;
  border-radius: 2px;
  font-weight: bold;
}

.icons {
  display: flex;
  gap: 6px;
  margin-left: 10px;
}

.icon-btn {
  width: 20px;
  height: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 2px;
  cursor: pointer;
}

.blue-bg {
  background: #4A90E2;
}

.relative {
  position: relative;
  background: #E0E0E0;
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #F56C6C;
  color: white;
  font-size: 8px;
  border-radius: 50%;
  width: 12px;
  height: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  line-height: 1;
}

.chart-container {
  flex: 1;
  min-height: 0;
  position: relative;
  width: 100%;
}

.y-axis-label {
  position: absolute;
  top: 0;
  left: 0;
  font-size: 10px;
  color: #666;
  z-index: 10;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>