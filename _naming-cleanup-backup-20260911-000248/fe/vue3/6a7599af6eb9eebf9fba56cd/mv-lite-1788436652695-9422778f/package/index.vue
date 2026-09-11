<template>
  <div class="verify-repair">
    <!-- 标题栏 -->
    <div class="verify-repair-header">
      <div class="verify-repair-title">环境监测</div>
      <div class="verify-repair-icons">
        <div class="icon-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        </div>
        <div class="icon-box badge-wrapper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
          <span class="badge">6</span>
        </div>
      </div>
    </div>

    <!-- Tab导航栏 -->
    <div class="verify-repair-tabs-container">
      <div class="verify-repair-tabs">
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

    <!-- 图表区域 -->
    <div class="verify-repair-chart-area">
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
// === API 对接导入 (自动生成) ===
import deviceApi from './api/device.mjs'  // slot-1: 当前选中监测类型的24小时监测值趋势序列，对应接口返回的historyData[].value
// === END API 导入 ===


const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];
const currentTab = ref('一氧化碳');
const chartRef = ref(null);
let chart = null;
let resizeObserver = null;

// 模拟数据
const xData = ref([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
// 为了曲线平滑，使用更多数据点模拟截图形状
const seriesData = ref([
  2, 3, 4, 3, 2, 2, 3, 2, 2, 3, 4, 5, 6, 8, 10, 12, 11, 9, 7, 5, 3, 2, 1, 0
]);
const xAxisFullData = ref(Array.from({length: 24}, (_, i) => i + 1));

const initChartWhenReady = () => {
  if (!chartRef.value || chart) return;
  if (chartRef.value.clientWidth === 0 || chartRef.value.clientHeight === 0) return;

  chart = echarts.init(chartRef.value);
  
  const option = {
    grid: {
      top: 25,
      right: 10,
      bottom: 15,
      left: 25,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['zk3+785CO浓度', '预警线'],
      top: 5,
      right: 5,
      textStyle: {
        fontSize: 9,
        color: '#666'
      },
      itemWidth: 15,
      itemHeight: 2
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisFullData.value,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 9,
        color: '#888',
        interval: 1, // 显示 2, 4, 6...
        formatter: (value) => {
          if (value % 2 === 0) return value;
          return '';
        }
      },
      axisPointer: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'start',
      nameTextStyle: {
        fontSize: 9,
        color: '#888',
        padding: [0, 0, 0, -10]
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: '#ddd'
        }
      },
      axisLabel: {
        fontSize: 9,
        color: '#888'
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: seriesData.value,
        lineStyle: {
          color: '#76C7C0',
          width: 1
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(118, 199, 192, 0.5)' },
            { offset: 1, color: 'rgba(118, 199, 192, 0.1)' }
          ])
        }
      },
      {
        name: '预警线',
        type: 'line',
        symbol: 'none',
        data: Array(24).fill(30),
        lineStyle: {
          type: 'dashed',
          color: '#D9534F',
          width: 1
        }
      }
    ]
  };

  chart.setOption(option);

  resizeObserver = new ResizeObserver(() => {
    if (chart) {
      chart.resize();
    }
  });
  resizeObserver.observe(chartRef.value);
};

watch(chartRef, (el) => {
  if (el && !chart) {
    nextTick(() => initChartWhenReady());
  }
}, { immediate: true });

onMounted(() => {
  nextTick(initChartWhenReady);
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

// === API 对接注入 (自动生成，请勿手动修改) ===
// === API 对接调用 ===
onMounted(async () => {
  // slot-1: 当前选中监测类型的24小时监测值趋势序列，对应接口返回的historyData[].value → device.getMonitor
  try {
    const __res_slot_1 = await deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"})
    if (__res_slot_1?.code === 200 || __res_slot_1?.data) {
      seriesData.value = __res_slot_1.data || __res_slot_1
    }
  } catch (e) { console.error('slot-1 deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"}):', e) }

})
// === END API 对接注入 ===
</script>

<style scoped>
.verify-repair {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #B4B9C2;
  display: flex;
  flex-direction: column;
  padding: 4px 6px;
  font-family: sans-serif;
  overflow: hidden;
}

.verify-repair-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 16px;
  margin-bottom: 4px;
}

.verify-repair-title {
  color: #5B9BD5;
  font-size: 12px;
  font-weight: 500;
}

.verify-repair-icons {
  display: flex;
  gap: 6px;
  align-items: center;
}

.icon-box {
  width: 16px;
  height: 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  position: relative;
}

.icon-svg {
  width: 10px;
  height: 10px;
  color: #fff;
}

.badge-wrapper {
  position: relative;
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background-color: #D9534F;
  color: #fff;
  font-size: 8px;
  line-height: 10px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  text-align: center;
  z-index: 10;
}

.verify-repair-tabs-container {
  margin-bottom: 4px;
}

.verify-repair-tabs {
  display: flex;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 2px;
  width: 80%;
}

.tab-item {
  flex: 1;
  text-align: center;
  font-size: 9px;
  color: #fff;
  padding: 2px 0;
  cursor: pointer;
  border-radius: 8px;
  white-space: nowrap;
}

.tab-item.active {
  background-color: #6BA3D6;
  color: #fff;
}

.verify-repair-chart-area {
  flex: 1;
  min-height: 0;
  position: relative;
  width: 100%;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>