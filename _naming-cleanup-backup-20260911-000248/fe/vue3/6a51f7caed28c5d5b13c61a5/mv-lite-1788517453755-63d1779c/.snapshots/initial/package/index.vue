<template>
  <div class="environment-monitor">
    <div class="environment-monitor-header">
      <div class="environment-monitor-title">环境监测</div>
      <div class="environment-monitor-tabs">
        <div
          v-for="tab in tabs"
          :key="tab"
          :class="['tab-item', { active: activeTab === tab }]"
          @click="activeTab = tab"
        >
          {{ tab }}
        </div>
      </div>
      <div class="environment-monitor-actions">
        <div class="action-btn chart-btn"></div>
        <div class="action-btn table-btn">
          <div class="badge">8</div>
        </div>
      </div>
    </div>
    <div class="environment-monitor-chart">
      <div ref="chartRef" class="chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'

const tabs = ['一氧化碳', '能见度', '河内照明', '河外光强']
const activeTab = ref('一氧化碳')

const chartRef = ref(null)
let chart = null
let resizeObserver = null

const chartData = ref([
  8, 10, 9, 8, 9, 10, 12, 13, 14, 15, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3
])

const initChartWhenReady = () => {
  if (!chartRef.value || chart) return

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    const { width, height } = entry.contentRect
    
    if (width > 0 && height > 0) {
      if (!chart) {
        chart = echarts.init(chartRef.value)
        
        const option = {
          grid: {
            left: 20,
            right: 40,
            top: 15,
            bottom: 20
          },
          xAxis: {
            type: 'category',
            data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
            axisLabel: {
              color: '#8B92A0',
              fontSize: 9,
              formatter: (value, index) => {
                return index === 11 ? value + '时' : value
              }
            },
            axisLine: {
              lineStyle: {
                color: '#D1D9E0'
              }
            },
            axisTick: {
              show: false
            }
          },
          yAxis: {
            type: 'value',
            min: 0,
            max: 40,
            interval: 10,
            axisLabel: {
              color: '#8B92A0',
              fontSize: 9,
              formatter: (value) => {
                return value === 30 ? `{red|${value}}` : value
              },
              rich: {
                red: {
                  color: '#E74C3C'
                }
              }
            },
            splitLine: {
              lineStyle: {
                color: '#E5E9ED',
                type: 'solid'
              }
            },
            axisLine: {
              show: false
            },
            axisTick: {
              show: false
            }
          },
          series: [
            {
              data: chartData.value,
              type: 'line',
              smooth: true,
              symbol: 'none',
              lineStyle: {
                color: '#52C41A',
                width: 1.5
              },
              areaStyle: {
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    {
                      offset: 0,
                      color: 'rgba(82, 196, 26, 0.4)'
                    },
                    {
                      offset: 1,
                      color: 'rgba(82, 196, 26, 0.05)'
                    }
                  ]
                }
              },
              markLine: {
                symbol: 'none',
                label: {
                  show: true,
                  position: 'end',
                  formatter: '抑製线',
                  color: '#E74C3C',
                  fontSize: 9
                },
                lineStyle: {
                  type: 'dashed',
                  color: '#E74C3C',
                  width: 1
                },
                data: [{ yAxis: 30 }]
              }
            }
          ],
          graphic: [
            {
              type: 'text',
              right: 40,
              top: 8,
              style: {
                text: '2k3+7850CD火度',
                fontSize: 10,
                fill: '#4A5568'
              }
            }
          ]
        }
        
        chart.setOption(option)
        
        const chartResizeObserver = new ResizeObserver(() => {
          if (chart) {
            chart.resize()
          }
        })
        chartResizeObserver.observe(chartRef.value)
      } else {
        chart.resize()
      }
    }
  })
  
  resizeObserver.observe(chartRef.value)
}

watch(
  chartRef,
  (el) => {
    if (el && !chart) {
      nextTick(() => initChartWhenReady())
    }
  },
  { immediate: true }
)

onMounted(() => {
  nextTick(initChartWhenReady)
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<style scoped>
.environment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #EAEEF2;
  padding: 6px 12px 8px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.environment-monitor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  height: 18px;
  flex-shrink: 0;
}

.environment-monitor-title {
  font-size: 12px;
  font-weight: 500;
  color: #5CADEC;
  white-space: nowrap;
}

.environment-monitor-tabs {
  display: flex;
  gap: 6px;
  flex: 1;
}

.tab-item {
  padding: 3px 10px;
  font-size: 10px;
  font-weight: 400;
  color: #8B92A0;
  background: transparent;
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.tab-item.active {
  background: rgba(255, 255, 255, 0.6);
  color: #4A5568;
  font-weight: 500;
}

.environment-monitor-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.action-btn {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
}

.chart-btn {
  background: linear-gradient(135deg, #5CADEC 0%, #4A9BD8 100%);
}

.chart-btn::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  background: linear-gradient(to top,
    #fff 0%, #fff 20%,
    transparent 20%, transparent 40%,
    #fff 40%, #fff 60%,
    transparent 60%, transparent 80%,
    #fff 80%, #fff 100%
  );
  background-size: 2px 10px;
  background-repeat: repeat-x;
  background-position: 0 0;
}

.table-btn {
  background: rgba(255, 255, 255, 0.9);
}

.table-btn::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  background-image: 
    linear-gradient(#8B92A0 1px, transparent 1px),
    linear-gradient(90deg, #8B92A0 1px, transparent 1px);
  background-size: 100% 4px, 4px 100%;
  background-position: 0 0, 0 0;
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #E74C3C;
  color: #fff;
  font-size: 8px;
  font-weight: 500;
  min-width: 12px;
  height: 12px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  z-index: 1;
}

.environment-monitor-chart {
  flex: 1;
  min-height: 0;
  position: relative;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>