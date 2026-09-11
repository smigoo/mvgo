<template>
  <div class="environment-monitoring">
    <!-- 头部控制区 -->
    <div class="environment-monitoring-header">
      <div class="header-title-row">
        <h2 class="main-title">环境监测</h2>
        <div class="header-actions">
          <div class="action-btn chart-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#5DADE2">
              <path d="M4 9h4v11H4V9zm6-6h4v17h-4V3zm6 9h4v8h-4v-8z"/>
            </svg>
          </div>
          <div class="action-btn list-btn">
            <div class="badge">6</div>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#5DADE2">
              <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
            </svg>
          </div>
        </div>
      </div>
      
      <div class="tabs-wrapper">
        <div 
          v-for="tab in tabs" 
          :key="tab"
          :class="['tab-item', { active: activeTab === tab }]"
          @click="activeTab = tab"
        >
          {{ tab }}
        </div>
      </div>
    </div>

    <!-- 图表展示区 -->
    <div class="environment-monitoring-chart-area">
      <div ref="chartRef" class="chart-container"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts';
// === API 对接导入 (自动生成) ===
import deviceApi from './api/device.mjs'  // slot-1: 24小时趋势图的X轴时间点数据，由接口返回 deviceList[].historyData[].time 提取
// === END API 导入 ===


const activeTab = ref('一氧化碳');
const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强'];

const chartRef = ref(null);
let chartInstance = null;
let resizeObserver = null;

// Mock data based on screenshot
const xData = ref([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
const yData = ref([4, 5, 3, 2, 3, 5, 10, 13, 12, 10, 5, 1]);

const initChartWhenReady = () => {
  if (!chartRef.value) return;
  if (chartInstance) return;
  
  // Check dimensions
  if (chartRef.value.clientWidth === 0 || chartRef.value.clientHeight === 0) {
    return; // Wait for resize observer or next tick
  }

  chartInstance = echarts.init(chartRef.value);
  
  const option = {
    grid: {
      top: 30,
      bottom: 20,
      left: 30,
      right: 40,
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
        color: '#2C3E50',
        fontSize: 10
      },
      icon: 'rect',
      itemWidth: 12,
      itemHeight: 2
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData.value,
      axisLine: { lineStyle: { color: '#D6EAF8' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#7F8C8D',
        fontSize: 10,
        margin: 8
      },
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#7F8C8D',
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
          color: '#D6EAF8'
        }
      },
      axisLabel: {
        color: '#7F8C8D',
        fontSize: 10
      },
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: '#7F8C8D',
        fontSize: 10,
        padding: [0, 0, 20, 0] // Adjust position
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#2ECC71',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(46, 204, 113, 0.3)' },
            { offset: 1, color: 'rgba(46, 204, 113, 0.05)' }
          ])
        },
        data: yData.value,
        markLine: {
          symbol: ['none', 'none'],
          label: {
            show: true,
            position: 'end',
            formatter: '预警线',
            color: '#E74C3C',
            fontSize: 10
          },
          lineStyle: {
            type: 'dashed',
            color: '#E74C3C'
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  };

  chartInstance.setOption(option);
};

watch(chartRef, (el) => {
  if (el && !chartInstance) {
    nextTick(() => initChartWhenReady());
  }
}, { immediate: true });

onMounted(() => {
  nextTick(() => {
    initChartWhenReady();
    if (chartRef.value && !resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        if (chartInstance) {
          chartInstance.resize();
        } else {
          // Retry init if size becomes available
          initChartWhenReady();
        }
      });
      resizeObserver.observe(chartRef.value);
    }
  });
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
});

// === API 对接注入 (自动生成，请勿手动修改) ===
const markLinedata = ref({})  // slot-3: 预警阈值标记线，根据接口返回的 maxThreshold/minThreshold 生成红色虚线预警线
// === API 对接调用 ===
onMounted(async () => {
  // slot-1: 24小时趋势图的X轴时间点数据，由接口返回 deviceList[].historyData[].time 提取 → device.getMonitor
  try {
    const __res_slot_1 = await deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"})
    if (__res_slot_1?.code === 200 || __res_slot_1?.data) {
      xData.value = __res_slot_1.data || __res_slot_1
    }
  } catch (e) { console.error('slot-1 deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"}):', e) }

  // slot-2: 24小时趋势图的Y轴监测值序列，由接口返回 deviceList[].historyData[].value 提取 → device.getMonitor
  try {
    const __res_slot_2 = await deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"})
    if (__res_slot_2?.code === 200 || __res_slot_2?.data) {
      yData.value = __res_slot_2.data || __res_slot_2
    }
  } catch (e) { console.error('slot-2 deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"}):', e) }

  // slot-3: 预警阈值标记线，根据接口返回的 maxThreshold/minThreshold 生成红色虚线预警线 → device.getMonitor
  try {
    const __res_slot_3 = await deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"})
    if (__res_slot_3?.code === 200 || __res_slot_3?.data) {
      markLinedata.value = __res_slot_3.data || __res_slot_3
    }
  } catch (e) { console.error('slot-3 deviceApi.getMonitor({"sectionNum":"SAMPLE001","productCode":"SAMPLE001","monitorType":"CO"}):', e) }

})
// === END API 对接注入 ===
</script>

<style scoped>
.environment-monitoring {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #F4F9FD; /* Light blueish background */
  display: flex;
  flex-direction: column;
  padding: 10px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  overflow: hidden;
}

.environment-monitoring-header {
  height: 50px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.header-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.main-title {
  margin: 0;
  font-size: 16px;
  color: #5DADE2;
  font-weight: bold;
  letter-spacing: 1px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 24px;
  height: 24px;
  background: #fff;
  border: 1px solid #D6EAF8;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
}

.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: #E74C3C;
  color: white;
  font-size: 10px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  z-index: 2;
}

.tabs-wrapper {
  display: flex;
  background-color: #E1F0FA;
  border-radius: 12px;
  padding: 2px;
  align-items: center;
}

.tab-item {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: #7FB3D5;
  padding: 4px 0;
  cursor: pointer;
  border-radius: 10px;
  transition: all 0.3s;
  white-space: nowrap;
}

.tab-item.active {
  background-color: #5DADE2;
  color: #fff;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(93, 173, 226, 0.3);
}

.environment-monitoring-chart-area {
  flex: 1;
  min-height: 0;
  position: relative;
  width: 100%;
}

.chart-container {
  width: 100%;
  height: 100%;
}
</style>