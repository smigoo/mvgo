<template>
  <div class="container">
    <!-- 标题区 -->
    <div class="header">
      <h2 class="title">环境监测</h2>
    </div>

    <!-- 导航与操作区 -->
    <div class="nav-row">
      <div class="tab-container">
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

      <div class="action-buttons">
        <div class="icon-btn chart-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="12" width="4" height="8" rx="1" fill="white" stroke="none"/>
            <rect x="10" y="6" width="4" height="14" rx="1" fill="white" stroke="none"/>
            <rect x="16" y="16" width="4" height="4" rx="1" fill="white" stroke="none"/>
          </svg>
        </div>
        <div class="icon-btn list-icon-wrapper">
          <div class="icon-btn list-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="20" y2="6" stroke="white" stroke-width="2" stroke-linecap="round"/>
              <line x1="8" y1="12" x2="20" y2="12" stroke="white" stroke-width="2" stroke-linecap="round"/>
              <line x1="8" y1="18" x2="20" y2="18" stroke="white" stroke-width="2" stroke-linecap="round"/>
              <line x1="4" y1="6" x2="4" y2="6" stroke="white" stroke-width="2" stroke-linecap="round"/>
              <line x1="4" y1="12" x2="4" y2="12" stroke="white" stroke-width="2" stroke-linecap="round"/>
              <line x1="4" y1="18" x2="4" y2="18" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="badge">6</div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-wrapper">
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';
// === API 对接导入 (自动生成) ===
import deviceApi from './api/device.mjs'  // slot-2: 环境监测24小时趋势数据及预警阈值
import { mockTabs } from './api/stub-slot-1.mjs'  // stub slot-1
// === END API 导入 ===

const currentTab = ref('一氧化碳');
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强']);
const chartRef = ref(null);
let chartInstance = null;

onMounted(() => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value);
    const option = {
      grid: {
        top: 40,
        right: 40,
        bottom: 20,
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
          color: '#333', // 截图里图例文字看起来像深色，或者黑色
          fontSize: 12
        },
        icon: 'rect' // 简化图例图标
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
        axisLine: { show: false },
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
        max: 40,
        interval: 10,
        splitLine: {
          lineStyle: {
            type: 'dashed',
            color: '#d1d5db' // 浅灰色虚线
          }
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#666'
        },
        name: '辆',
        nameLocation: 'end',
        nameTextStyle: {
          color: '#666',
          padding: [0, 0, 20, 0],
          align: 'left'
        }
      },
      series: [
        {
          name: 'zk3+785CO浓度',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: {
            color: '#2ecc71', // 绿色
            width: 2
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(46, 204, 113, 0.4)' },
              { offset: 1, color: 'rgba(46, 204, 113, 0.1)' }
            ])
          },
          data: [5, 7, 6, 4, 3, 5, 10, 13, 12, 10, 5, 1],
          markLine: {
            symbol: 'none',
            label: {
              position: 'end',
              formatter: '预警线',
              color: '#d9534f',
              fontSize: 14
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



// === API 对接注入 (自动生成，请勿手动修改) ===
const chartData = ref({})  // slot-2: 环境监测24小时趋势数据及预警阈值
// === API 对接调用 ===
onMounted(async () => {
  // slot-2: 环境监测24小时趋势数据及预警阈值 → device.getMonitor
  try {
    const __res_slot_2 = await deviceApi.getMonitor({"sectionNum":"G21","productCode":"1","monitorType":"CO"})
    if (__res_slot_2?.code === 200 || __res_slot_2?.data) {
      chartData.value = __res_slot_2.data || __res_slot_2
    }
  } catch (e) { console.error('slot-2 deviceApi.getMonitor({"sectionNum":"G21","productCode":"1","monitorType":"CO"}):', e) }

  // stub slot-1: tabs — 使用 mock data
  tabs.value = mockTabs
  // TODO: 接口就绪后替换为真实调用

})
// === END API 对接注入 ===
</script>

<style scoped>
.container {
  background-color: #8a96a3; /* 截图背景色 */
  padding: 20px;
  font-family: sans-serif;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  color: #fff;
}

.header {
  margin-bottom: 10px;
}

.title {
  color: #5b9bd5;
  font-size: 24px;
  margin: 0;
  font-weight: bold;
}

.nav-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  position: relative;
}

/* Tab 容器样式模拟截图中的箭头长条 */
.tab-container {
  display: flex;
  background-color: #a4c8e8; /* 浅蓝色背景 */
  border-radius: 4px;
  /* 模拟左侧箭头形状 */
  clip-path: polygon(15px 0, 100% 0, 100% 100%, 15px 100%, 0 50%);
  padding-left: 15px; /* 给箭头留空间 */
  height: 40px;
  align-items: center;
  flex: 1;
  max-width: 70%;
}

.tab-item {
  padding: 0 20px;
  height: 100%;
  display: flex;
  align-items: center;
  font-size: 16px;
  color: #fff;
  cursor: pointer;
  transition: background-color 0.3s;
}

.tab-item.active {
  background-color: #2b7cb6; /* 深蓝色激活态 */
  /* 激活态也可以做个小箭头，这里简化处理 */
  clip-path: polygon(0 0, 100% 0, 90% 50%, 100% 100%, 0 100%);
  margin-right: -10px; /* 重叠一点 */
  z-index: 2;
  font-weight: bold;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-left: 20px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  background-color: #fff;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  position: relative;
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
  top: -8px;
  right: -8px;
  background-color: #ff4d4f;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  font-weight: bold;
  border: 2px solid #8a96a3; /* 与背景色融合 */
}

.chart-wrapper {
  flex: 1;
  background-color: transparent;
  position: relative;
  min-height: 300px;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>