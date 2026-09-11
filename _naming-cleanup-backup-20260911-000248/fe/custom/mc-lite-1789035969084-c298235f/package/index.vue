<template>
  <base-panel panelKey="default-panel">
    <div class="c-environment-monitor-content">
      <!-- 标题栏 -->
      <div class="c-environment-monitor-header">
        <div class="c-environment-monitor-title-group">
          <h3 class="c-environment-monitor-title">环境监测</h3>
          <span class="c-environment-monitor-subtitle">6 辆</span>
        </div>
        <div class="c-environment-monitor-actions">
          <button class="c-environment-monitor-icon-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
            </svg>
          </button>
          <button class="c-environment-monitor-icon-btn c-environment-monitor-icon-btn-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
            <span class="c-environment-monitor-badge">6</span>
          </button>
        </div>
      </div>

      <!-- Tab 切换栏 -->
      <div class="c-environment-monitor-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          :class="[
            'c-environment-monitor-tab',
            { 'c-environment-monitor-tab-active': activeTab === tab.value }
          ]"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- 图表区域 -->
      <div class="c-environment-monitor-chart-wrapper">
        <div ref="chartRef" class="c-environment-monitor-chart"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'

const activeTab = ref('co')
const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor' },
  { label: '洞外光强', value: 'outdoor' }
]

const chartRef = ref(null)
let chart = null
let resizeObserver = null

const chartData = ref([5, 6, 5, 4, 3, 5, 8, 12, 14, 15, 13, 11, 9, 7, 6, 5, 4, 3, 2, 1, 0])

const initChartWhenReady = () => {
  if (!chartRef.value || chart) return

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return

    const { width, height } = entry.contentRect
    if (width > 0 && height > 0) {
      if (!chart) {
        chart = echarts.init(chartRef.value)
        
        const option = {
          grid: {
            left: 28,
            right: 20,
            top: 30,
            bottom: 24
          },
          xAxis: {
            type: 'category',
            data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
            axisLabel: {
              color: '#3D4852',
              fontSize: 9,
              formatter: (value, index) => {
                return index === 11 ? value + ' 时' : value
              }
            },
            axisLine: {
              lineStyle: { color: '#8A9199' }
            },
            axisTick: {
              show: false
            }
          },
          yAxis: {
            type: 'value',
            name: '辆',
            nameTextStyle: {
              color: '#3D4852',
              fontSize: 11,
              align: 'left',
              padding: [0, 0, 0, -18]
            },
            max: 40,
            interval: 10,
            axisLabel: {
              color: '#3D4852',
              fontSize: 11
            },
            splitLine: {
              lineStyle: {
                color: '#B8BFC7',
                type: 'dashed'
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
              name: 'zk3+785CO浓度',
              type: 'line',
              data: chartData.value,
              smooth: true,
              symbol: 'none',
              lineStyle: {
                color: '#40D9A0',
                width: 2
              },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(64, 217, 160, 0.6)' },
                  { offset: 1, color: 'rgba(64, 217, 160, 0.05)' }
                ])
              }
            }
          ],
          legend: {
            data: ['zk3+785CO浓度'],
            right: 10,
            top: 8,
            textStyle: {
              color: '#3D4852',
              fontSize: 10
            },
            itemWidth: 20,
            itemHeight: 2
          }
        }

        // 添加预警线
        option.series.push({
          name: '预警线',
          type: 'line',
          data: Array(12).fill(30),
          symbol: 'none',
          lineStyle: {
            color: '#E74C3C',
            width: 1,
            type: 'dashed'
          },
          markLine: {
            silent: true,
            symbol: 'none',
            label: {
              show: true,
              position: 'end',
              formatter: '预警线',
              color: '#E74C3C',
              fontSize: 10
            },
            lineStyle: {
              color: '#E74C3C',
              type: 'dashed',
              width: 1
            },
            data: [{ yAxis: 30 }]
          }
        })

        chart.setOption(option)

        // 监听容器尺寸变化
        resizeObserver.observe(chartRef.value)
      } else {
        chart.resize()
      }
    }
  })

  resizeObserver.observe(chartRef.value)
}

watch(chartRef, (el) => {
  if (el && !chart) {
    nextTick(() => initChartWhenReady())
  }
}, { immediate: true })

onMounted(() => {
  nextTick(initChartWhenReady)
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
/*
 * 高度预算分解（可用高度 150px）：
 * - 根容器 padding: 12px × 2 = 24px
 * - 可用高度 H = 150px - 24px = 126px
 * - header: 24px
 * - tabs: 24px
 * - gap between header-tabs: 8px
 * - gap between tabs-chart: 6px
 * - chart: 126px - 24px - 8px - 24px - 6px = 64px
 */

.c-environment-monitor-content {
  width: 100%;
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 标题栏 */
.c-environment-monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  margin-bottom: 8px;
}

.c-environment-monitor-title-group {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.c-environment-monitor-title {
  margin: 0;
  /* M5-7：字号改为引用主题变量，禁止硬编码 */
  font-size: var(--mc-font-size-lg);
  font-weight: 500;
  color: #4A90E2;
  line-height: 1;
}

.c-environment-monitor-subtitle {
  /* M5-7：字号改为引用主题变量，禁止硬编码 */
  font-size: var(--mc-font-size-sm);
  color: #3D4852;
  font-weight: 400;
}

.c-environment-monitor-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.c-environment-monitor-icon-btn {
  width: 24px;
  height: 24px;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #4A90E2;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.c-environment-monitor-icon-btn svg {
  width: 100%;
  height: 100%;
}

.c-environment-monitor-icon-btn:hover {
  opacity: 0.8;
}

.c-environment-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #E74C3C;
  color: #FFFFFF;
  /* M5-7：字号改为引用主题变量，禁止硬编码 */
  font-size: var(--mc-font-size-xs);
  font-weight: 500;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  z-index: 1;
}

/* Tab 切换栏 */
.c-environment-monitor-tabs {
  display: flex;
  gap: 2px;
  height: 24px;
  margin-bottom: 6px;
}

.c-environment-monitor-tab {
  flex: 1;
  border: none;
  background: transparent;
  cursor: pointer;
  /* M5-7：字号改为引用主题变量，禁止硬编码 */
  font-size: var(--mc-font-size-sm);
  color: #3D4852;
  position: relative;
  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  border: 1px solid #8A9199;
  transition: all 0.2s;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.c-environment-monitor-tab:first-child {
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
}

.c-environment-monitor-tab:last-child {
  clip-path: polygon(8px 0, 100% 0, 100% 100%, 0 100%);
}

.c-environment-monitor-tab-active {
  background: #4A90E2;
  color: #FFFFFF;
  border-color: #4A90E2;
}

.c-environment-monitor-tab:hover:not(.c-environment-monitor-tab-active) {
  background: rgba(74, 144, 226, 0.1);
}

/* 图表区域 */
.c-environment-monitor-chart-wrapper {
  flex: 1;
  min-height: 0;
  background: #E4EEF5;
  border-radius: 4px;
  padding: 8px;
}

.c-environment-monitor-chart {
  width: 100%;
  height: 100%;
}
</style>

<!-- 微码规范 M4-6：resources/styles/index.less 必须在 package/ 内被引用 -->
<style lang="less">
@import '../resources/styles/index.less';
</style>
