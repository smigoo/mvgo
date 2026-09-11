<template>
  <div class="mv-1785481347329-dfc3ee4b">
    <div class="header">
      <div class="header-icon"></div>
      <span class="title-text">{{ props.title }}</span>
    </div>
    <div class="content">
      <div class="control-bar">
        <div class="tabs">
          <div
            v-for="(tab, index) in tabs"
            :key="index"
            :class="['tab-item', { active: activeTab === index }]"
            @click="handleTabClick(index)"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="right-actions">
          <div class="icon-group"></div>
          <div class="badge" aria-label="6">6</div>
        </div>
      </div>
      <div class="chart-area" ref="chartRef"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  title: {
    type: String,
    default: '环境监测'
  }
})

const emit = defineEmits(['update:activeTab'])

const tabs = [
  { label: '一氧化碳' },
  { label: '能见度' },
  { label: '洞内照明' },
  { label: '洞外光强' }
];

const activeTab = ref(0);
const chartRef = ref(null);
let chartInstance = null;
let resizeObserver = null;

const handleTabClick = (index) => {
  activeTab.value = index;
  emit('update:activeTab', index);
};

const getChartOption = () => {
  return {
    grid: {
      top: 20,
      bottom: 20,
      left: 30,
      right: 20
    },
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      name: '时',
      nameLocation: 'end',
      nameTextStyle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        align: 'right'
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'end',
      nameTextStyle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        align: 'left'
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10
      },
      splitLine: {
        lineStyle: {
          type: 'dashed',
          color: 'rgba(255,255,255,0.2)'
        }
      }
    },
    legend: {
      data: ['zk3+785CO浓度'],
      right: 0,
      top: 0,
      textStyle: {
        color: '#5cb85c',
        fontSize: 10
      },
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 4
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
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(92, 184, 92, 0.5)' },
              { offset: 1, color: 'rgba(92, 184, 92, 0.1)' }
            ]
          }
        },
        data: [2, 3, 5, 4, 3, 3, 5, 8, 12, 10, 8, 5],
        markLine: {
          symbol: 'none',
          label: {
            formatter: '预警线',
            position: 'end',
            color: '#f53f3f',
            fontSize: 10
          },
          lineStyle: {
            type: 'dashed',
            color: '#f53f3f'
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  };
};

const initChart = () => {
  if (!chartRef.value) return;
  try {
    if (chartInstance) {
      chartInstance.dispose();
    }
    chartInstance = echarts.init(chartRef.value);
    chartInstance.setOption(getChartOption());
  } catch (e) {
    console.error('ECharts initialization error:', e);
  }
};

watch(chartRef, (newVal) => {
  if (newVal) {
    nextTick(() => {
      initChart();
    });
  }
});

onMounted(() => {
  nextTick(() => {
    initChart();
  });
  
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (chartInstance) {
        chartInstance.resize();
      }
    });
    resizeObserver.observe(chartRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
});
</script>

<style lang="less" scoped>
.mv-1785481347329-dfc3ee4b {
  width: 100%;
  height: 100%;
  background: #edf4fbb2;
  border-radius: 4px;
  padding: 12px 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 24px;
    margin-bottom: 8px;

    .header-icon {
      width: 8px;
      height: 8px;
      background-image: url('../resources/images/g-7883.png');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    }

    .title-text {
      font-size: 16px;
      font-weight: bold;
      background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;
      line-height: 1;
    }
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;

    .control-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 32px;
      margin-bottom: 4px;

      .tabs {
        display: flex;
        align-items: center;
        gap: 16px;

        .tab-item {
          font-size: 12px;
          color: #ffffff;
          cursor: pointer;
          padding: 4px 12px;
          border-radius: 12px;
          transition: all 0.3s;
          line-height: 1.2;

          &.active {
            background: linear-gradient(90deg, #1099b1 0%, #038fff 100%);
          }
        }
      }

      .right-actions {
        display: flex;
        align-items: center;
        gap: 8px;

        .icon-group {
          width: 52px;
          height: 24px;
          background-image: url('../resources/images/tabs-icon-43.png');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
        }

        .badge {
          width: 14px;
          height: 14px;
          background: #f53f3f;
          border-radius: 50%;
          color: #ffffff;
          font-size: 10px;
          display: flex;
          justify-content: center;
          align-items: center;
          line-height: 1;
        }
      }
    }

    .chart-area {
      width: 100%;
      flex: 1;
      min-height: 0;
    }
  }
}</style>