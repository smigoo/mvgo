<template>
  <div class="container">
    <!-- 顶部控制区 -->
    <div class="header">
      <div class="header-left">
        <h2 class="title">环境监测</h2>
        <div class="tabs">
          <div 
            v-for="tab in tabs" 
            :key="tab" 
            class="tab-item" 
            :class="{ active: currentTab === tab }"
            @click="currentTab = tab"
          >
            <span v-if="currentTab === tab" class="tab-arrow"></span>
            {{ tab }}
          </div>
        </div>
      </div>
      
      <div class="header-right">
        <div class="icon-btn chart-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
            <rect x="4" y="12" width="4" height="8" rx="1"/>
            <rect x="10" y="6" width="4" height="14" rx="1"/>
            <rect x="16" y="16" width="4" height="4" rx="1"/>
          </svg>
        </div>
        <div class="icon-btn list-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
            <rect x="4" y="4" width="16" height="3" rx="1"/>
            <rect x="4" y="10" width="16" height="3" rx="1"/>
            <rect x="4" y="16" width="16" height="3" rx="1"/>
          </svg>
          <div class="badge">6</div>
        </div>
      </div>
    </div>

    <!-- 图表展示区 -->
    <div class="chart-wrapper">
      <div ref="chartRef" class="chart-container"></div>
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
      bottom: 30,
      left: 40,
      right: 40,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 10,
      right: 20,
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
      axisLabel: {
        color: '#666',
        fontSize: 12
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
        color: '#666',
        fontSize: 12
      },
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#666',
        padding: [0, 0, 20, 0]
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
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
        data: [3, 5, 6, 5, 4, 5, 10, 16, 15, 12, 8, 2]
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
        data: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        markPoint: {
          data: [
            {
              coord: [11, 30], // 对应 x轴最后一个点附近
              value: '预警线',
              itemStyle: { color: 'transparent' },
              label: {
                show: true,
                position: 'right',
                color: '#d9534f',
                fontSize: 12,
                formatter: '预警线'
              }
            }
          ]
        }
      }
    ]
  };

  // 手动添加预警线文字，因为 markPoint 可能位置不准，直接用 graphic 或者调整 data
  // 这里为了简单，直接在 series 里用 markLine 或者单独画
  // 重新调整预警线实现方式，使用 markLine 更标准，但截图里文字在右边
  
  option.series[1].markPoint = undefined;
  option.graphic = {
    elements: [
      {
        type: 'text',
        left: '85%',
        top: '32%', // 对应 30 的位置 (50-30)/50 = 40% from top. grid top is 40.
        style: {
          text: '预警线',
          fill: '#d9534f',
          fontSize: 12
        }
      }
    ]
  };

  chartInstance.setOption(option);
};
</script>

<style scoped>
.container {
  width: 100%;
  height: 100%;
  min-height: 400px;
  background-color: #8fa0b0; /* 截图背景色，偏蓝灰 */
  padding: 15px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  font-family: sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  height: 20%;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.title {
  color: #00d2d3; /* 青色标题 */
  font-size: 18px;
  margin: 0;
  font-weight: bold;
}

.tabs {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.1); /* 稍微深一点的背景衬托Tab */
  border-radius: 20px;
  padding: 2px;
}

.tab-item {
  padding: 6px 16px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  border-radius: 18px;
  position: relative;
  display: flex;
  align-items: center;
  transition: all 0.3s;
}

.tab-item.active {
  background-color: #7ab8d6; /* 浅蓝色激活态 */
  color: #fff;
  font-weight: bold;
  /* 模拟左侧箭头效果 */
  border-top-left-radius: 18px;
  border-bottom-left-radius: 18px;
  margin-right: 5px;
}

/* 模拟截图里一氧化碳左边的尖角/箭头形状 */
.tab-arrow {
  display: inline-block;
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 8px solid #7ab8d6; /* 和背景色一致，制造缺口效果，或者反过来 */
  margin-right: 4px;
  /* 截图里其实是一个整体的胶囊，左边比较尖。这里简化处理 */
  display: none; 
}

/* 重新调整 Tab 样式以更像截图 */
.tabs {
  background: transparent;
  display: flex;
  gap: 10px;
}

.tab-item {
  background: transparent;
  color: #444;
}

.tab-item.active {
  background: #87ceeb; /* 天蓝色 */
  color: white;
  border-radius: 4px 15px 15px 4px; /* 右边圆，左边稍微方一点或者带箭头 */
  padding-left: 20px;
  position: relative;
}

/* 模拟左侧箭头 */
.tab-item.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 0;
  width: 0;
  height: 0;
  border-top: 14px solid transparent;
  border-bottom: 14px solid transparent;
  border-right: 12px solid #87ceeb;
}


.header-right {
  display: flex;
  gap: 15px;
  align-items: center;
}

.icon-btn {
  width: 32px;
  height: 32px;
  background: rgba(255,255,255,0.2);
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  position: relative;
}

.list-icon {
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

.chart-wrapper {
  flex: 1;
  background-color: #dcdcdc; /* 图表区域背景，截图里看起来比外框亮，或者就是灰色 */
  /* 截图整体背景看起来像 #9aa5b1，图表区域也是这个颜色，只是有网格 */
  background-color: #9aa5b1; 
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.chart-container {
  width: 100%;
  height: 100%;
}
</style>