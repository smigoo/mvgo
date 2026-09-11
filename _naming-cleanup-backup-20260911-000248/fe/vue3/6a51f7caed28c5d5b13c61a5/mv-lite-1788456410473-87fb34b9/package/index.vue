<template>
  <div class="environment-monitoring">
    <!-- 标题区 -->
    <div class="em-header">
      <h2 class="em-title">环境监测</h2>
    </div>

    <!-- 导航控制区 -->
    <div class="em-nav">
      <div class="em-tabs-container">
        <div 
          v-for="tab in tabs" 
          :key="tab"
          class="em-tab"
          :class="{ active: activeTab === tab }"
          @click="activeTab = tab"
        >
          {{ tab }}
        </div>
      </div>
      
      <div class="em-actions">
        <button class="em-icon-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
        </button>
        <button class="em-icon-btn relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span class="em-badge">6</span>
        </button>
      </div>
    </div>

    <!-- 图表展示区 -->
    <div class="em-chart-wrapper">
      <div ref="chartRef" class="em-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';

// 状态数据
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];
const activeTab = ref('一氧化碳');

// 图表数据 (响应式)
const xData = ref(['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']);
const yData = ref([4, 6, 5, 4, 3, 3, 5, 10, 13, 12, 10, 5, 1]);

// DOM 引用
const chartRef = ref(null);
let chart = null;
let resizeObserver = null;

// 初始化图表逻辑
const initChartWhenReady = () => {
  if (!chartRef.value) return;
  if (chartRef.value.clientWidth === 0 || chartRef.value.clientHeight === 0) return;
  if (chart) return; // 防重复初始化

  chart = echarts.init(chartRef.value);
  
  const option = {
    grid: {
      top: 30,
      right: 20,
      bottom: 20,
      left: 30,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['zk3+785CO浓度'],
      top: 0,
      right: 0,
      textStyle: {
        fontSize: 10,
        color: '#666'
      },
      icon: 'rect'
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData.value,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#999',
        fontSize: 10,
        margin: 10
      },
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#999',
        fontSize: 10,
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
          color: '#E5E7EB'
        }
      },
      axisLabel: {
        color: '#999',
        fontSize: 10
      },
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#999',
        fontSize: 10,
        padding: [0, 0, 10, 0]
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#10B981', // 绿色
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(16, 185, 129, 0.4)' },
            { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
          ])
        },
        data: yData.value,
        markLine: {
          symbol: ['none', 'none'],
          label: {
            formatter: '预警线',
            position: 'end',
            color: '#EF4444',
            fontSize: 10
          },
          lineStyle: {
            type: 'dashed',
            color: '#EF4444'
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  };

  chart.setOption(option);
};

// 监听 ref 变化
watch(chartRef, (el) => {
  if (el && !chart) {
    nextTick(() => initChartWhenReady());
  }
}, { immediate: true });

onMounted(() => {
  nextTick(() => initChartWhenReady());
  
  // 监听尺寸变化
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (chart) {
        chart.resize();
      } else {
        initChartWhenReady();
      }
    });
    resizeObserver.observe(chartRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (chart) {
    chart.dispose();
    chart = null;
  }
});
</script>

<style scoped>
.environment-monitoring {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #F0F6FF; /* 浅蓝背景 */
  padding: 10px;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  overflow: hidden;
}

/* 标题区 */
.em-header {
  height: 24px;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.em-title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: #3B82F6; /* 蓝色标题 */
  line-height: 1.2;
}

/* 导航控制区 */
.em-nav {
  height: 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.em-tabs-container {
  display: flex;
  background-color: #DDEEFF; /* 浅蓝底 */
  border-radius: 4px;
  overflow: hidden;
  height: 28px;
  align-items: center;
  /* 模拟左侧箭头形状 */
  clip-path: polygon(0 50%, 12px 0, 100% 0, 100% 100%, 12px 100%);
  padding-left: 12px; /* 补偿 clip-path 切掉的部分 */
}

.em-tab {
  padding: 0 12px;
  font-size: 13px;
  color: #3B82F6;
  cursor: pointer;
  height: 100%;
  display: flex;
  align-items: center;
  white-space: nowrap;
  transition: all 0.3s;
}

.em-tab.active {
  background-color: #3B82F6; /* 深蓝选中 */
  color: #FFFFFF;
  font-weight: 500;
}

.em-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.em-icon-btn {
  width: 28px;
  height: 28px;
  background-color: #3B82F6;
  border: none;
  border-radius: 4px;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  padding: 0;
}

.em-icon-btn svg {
  width: 16px;
  height: 16px;
}

.em-icon-btn.relative {
  position: relative;
}

.em-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: #EF4444;
  color: white;
  font-size: 10px;
  font-weight: bold;
  border-radius: 10px;
  width: 16px;
  height: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 1px solid #F0F6FF; /* 与背景同色描边，制造镂空感 */
  z-index: 10;
}

/* 图表区 */
.em-chart-wrapper {
  flex: 1;
  min-height: 0; /* 关键：防止 flex 子元素撑破 */
  position: relative;
  background-color: transparent;
}

.em-chart {
  width: 100%;
  height: 100%;
}
</style>