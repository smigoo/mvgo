<template>
  <div class="mv-lite-1787898203685-e91b9a32">
    <!-- 标题区 + Tab 导航区 + 右上角工具栏 -->
    <div class="header-section">
      <div class="title">环境监测</div>
      
      <div class="tabs">
        <div
          v-for="tab in tabs"
          :key="tab"
          class="tab"
          :class="{ active: activeTab === tab }"
          @click="activeTab = tab"
        >
          {{ tab }}
        </div>
      </div>
      
      <div class="toolbar">
        <div class="icon-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="14" width="4" height="10" />
            <rect x="10" y="8" width="4" height="16" />
            <rect x="16" y="4" width="4" height="20" />
          </svg>
        </div>
        <div class="icon-btn has-badge">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="6" width="16" height="3" rx="1" />
            <rect x="4" y="11" width="16" height="3" rx="1" />
            <rect x="4" y="16" width="16" height="3" rx="1" />
          </svg>
          <span class="badge">6</span>
        </div>
      </div>
    </div>
    
    <!-- 图表区 -->
    <div class="chart-section">
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const tabs = ['二氧化碳', '能见度', '洞内照明', '洞外光强']
const activeTab = ref('二氧化碳')

const chartRef = ref(null)
let chart = null
let resizeObserver = null

const xAxisData = ref([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24])
const chartData = ref([5, 7, 6, 5, 8, 12, 15, 12, 8, 5, 3, 2])

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (!chartRef.value || chart) {
      if (chart && chartRef.value.clientWidth > 0 && chartRef.value.clientHeight > 0) {
        chart.resize()
      }
      return
    }
    
    const { clientWidth, clientHeight } = chartRef.value
    if (clientWidth > 0 && clientHeight > 0) {
      chart = echarts.init(chartRef.value)
      
      chart.setOption({
        grid: {
          left: 60,
          right: 40,
          top: 50,
          bottom: 50
        },
        xAxis: {
          type: 'category',
          data: xAxisData.value,
          axisLine: { lineStyle: { color: '#8A9AA8' } },
          axisLabel: { color: '#5A5A5A', fontSize: 14 },
          name: '时',
          nameLocation: 'end',
          nameTextStyle: { color: '#5A5A5A', fontSize: 14, padding: [0, 0, 0, 10] }
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: 40,
          interval: 10,
          axisLine: { show: false },
          axisLabel: { color: '#5A5A5A', fontSize: 14 },
          splitLine: { lineStyle: { color: '#8A9AA8', type: 'dashed' } },
          name: '辅',
          nameLocation: 'end',
          nameTextStyle: { color: '#5A5A5A', fontSize: 14 }
        },
        series: [
          {
            type: 'line',
            data: chartData.value,
            smooth: true,
            lineStyle: { color: '#7ED9C4', width: 2 },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(126, 217, 196, 0.6)' },
                  { offset: 1, color: 'rgba(126, 217, 196, 0.1)' }
                ]
              }
            },
            symbol: 'none',
            name: 'zk3+785CO浓度'
          },
          {
            type: 'line',
            data: Array(xAxisData.value.length).fill(30),
            lineStyle: { color: '#FF4D4D', type: 'dashed', width: 2 },
            symbol: 'none',
            name: '预警线',
            markLine: {
              silent: true,
              label: {
                show: true,
                position: 'end',
                formatter: '预警线',
                color: '#FF4D4D',
                fontSize: 14
              },
              lineStyle: { type: 'dashed', color: '#FF4D4D', width: 2 }
            }
          }
        ],
        legend: {
          data: ['zk3+785CO浓度'],
          right: 20,
          top: 10,
          textStyle: { color: '#5A5A5A', fontSize: 14 },
          itemWidth: 30,
          itemHeight: 2
        }
      })
      
      resizeObserver.observe(chartRef.value)
    }
  })
  
  if (chartRef.value) {
    resizeObserver.observe(chartRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (chart) {
    chart.dispose()
  }
})
</script>

<style scoped>
.mv-lite-1787898203685-e91b9a32 {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: linear-gradient(135deg, #B0B8BE 0%, #D3D8DC 100%);
  padding: 20px 30px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.header-section {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 15px;
}

.title {
  font-size: 32px;
  font-weight: bold;
  color: #4A90E2;
  line-height: 1.4;
  white-space: nowrap;
}

.tabs {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 0;
}

.tab {
  position: relative;
  padding: 8px 20px;
  font-size: 18px;
  color: #5A5A5A;
  background: #E8EBED;
  cursor: pointer;
  white-space: nowrap;
  clip-path: polygon(0 0, calc(100% - 15px) 0, 100% 50%, calc(100% - 15px) 100%, 0 100%, 15px 50%);
  margin-left: -15px;
}

.tab:first-child {
  margin-left: 0;
  clip-path: polygon(0 0, calc(100% - 15px) 0, 100% 50%, calc(100% - 15px) 100%, 0 100%);
}

.tab:last-child {
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 15px 50%);
}

.tab.active {
  background: #4A90E2;
  color: white;
  z-index: 1;
}

.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
}

.icon-btn {
  position: relative;
  width: 40px;
  height: 40px;
  background: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #5A5A5A;
}

.icon-btn svg {
  width: 20px;
  height: 20px;
}

.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #FF4D4D;
  color: white;
  font-size: 12px;
  font-weight: bold;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-section {
  flex: 1;
  min-height: 0;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>