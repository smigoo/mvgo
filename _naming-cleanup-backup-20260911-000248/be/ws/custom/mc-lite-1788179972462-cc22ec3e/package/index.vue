<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1788179972462-cc22ec3e-content">
      <!-- 标题与工具栏 -->
      <div class="c-mc-lite-1788179972462-cc22ec3e-header">
        <div class="c-mc-lite-1788179972462-cc22ec3e-title">环境监测</div>
        <div class="c-mc-lite-1788179972462-cc22ec3e-toolbar">
          <div class="c-mc-lite-1788179972462-cc22ec3e-icon-btn" @click="handleChartView">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="14" width="4" height="6"/>
              <rect x="10" y="10" width="4" height="10"/>
              <rect x="16" y="6" width="4" height="14"/>
            </svg>
          </div>
          <div class="c-mc-lite-1788179972462-cc22ec3e-icon-btn c-mc-lite-1788179972462-cc22ec3e-has-badge" @click="handleListView">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="6" width="14" height="2"/>
              <rect x="5" y="11" width="14" height="2"/>
              <rect x="5" y="16" width="14" height="2"/>
            </svg>
            <span class="c-mc-lite-1788179972462-cc22ec3e-badge">6</span>
          </div>
        </div>
      </div>

      <!-- Tab 导航区 -->
      <div class="c-mc-lite-1788179972462-cc22ec3e-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          :class="[
            'c-mc-lite-1788179972462-cc22ec3e-tab',
            { 'c-mc-lite-1788179972462-cc22ec3e-tab-active': activeTab === tab.value }
          ]"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </div>
      </div>

      <!-- 图表区 -->
      <div class="c-mc-lite-1788179972462-cc22ec3e-chart-wrapper">
        <div ref="chartRef" class="c-mc-lite-1788179972462-cc22ec3e-chart"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
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

// 图表数据（响应式变量）
const chartData = ref([
  3, 5, 4, 3, 2, 1, 2, 3, 5, 8, 12, 15, 14, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0.5, 0
])

const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])

onMounted(() => {
  if (!chartRef.value) return

  // 使用 ResizeObserver 监听图表容器本身
  resizeObserver = new ResizeObserver(() => {
    const container = chartRef.value
    if (!container) return

    // 只有当容器尺寸大于 0 时才初始化
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      if (!chart) {
        chart = echarts.init(container)
        
        const option = {
          grid: {
            left: '8%',
            right: '5%',
            top: '15%',
            bottom: '12%',
            containLabel: false
          },
          xAxis: {
            type: 'category',
            data: xAxisData.value,
            axisLine: { lineStyle: { color: '#E0E0E0' } },
            axisTick: { show: false },
            axisLabel: { color: '#999', fontSize: 11 },
            boundaryGap: false
          },
          yAxis: {
            type: 'value',
            min: 0,
            max: 40,
            interval: 10,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: '#999', fontSize: 11 },
            splitLine: { lineStyle: { color: '#F0F0F0', type: 'solid' } }
          },
          series: [
            {
              name: 'zk3+785CO浓度',
              type: 'line',
              data: chartData.value,
              smooth: true,
              symbol: 'none',
              lineStyle: { color: '#52C41A', width: 2 },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
                  { offset: 1, color: 'rgba(82, 196, 26, 0.05)' }
                ])
              }
            }
          ],
          legend: {
            data: ['zk3+785CO浓度'],
            right: '5%',
            top: '5%',
            textStyle: { color: '#333', fontSize: 12 },
            icon: 'rect',
            itemWidth: 20,
            itemHeight: 2
          }
        }
        
        chart.setOption(option)

        // 添加预警线标注
        chart.setOption({
          series: [{
            markLine: {
              silent: true,
              symbol: 'none',
              label: { 
                show: true, 
                position: 'end',
                formatter: '预警线',
                color: '#FF4D4F',
                fontSize: 11
              },
              lineStyle: { color: '#FF4D4F', type: 'dashed', width: 1 },
              data: [{ yAxis: 30 }]
            }
          }]
        })

        // 监听容器尺寸变化以调整图表
        const chartResizeObserver = new ResizeObserver(() => {
          if (chart) chart.resize()
        })
        chartResizeObserver.observe(container)
        
        // 保存到全局以便清理
        resizeObserver.chartResize = chartResizeObserver
      }
    }
  })

  resizeObserver.observe(chartRef.value)
})

onUnmounted(() => {
  if (resizeObserver) {
    if (resizeObserver.chartResize) {
      resizeObserver.chartResize.disconnect()
    }
    resizeObserver.disconnect()
  }
  if (chart) {
    chart.dispose()
    chart = null
  }
})

const handleChartView = () => {
  console.log('切换到图表视图')
}

const handleListView = () => {
  console.log('切换到列表视图')
}
</script>

<style scoped>
.c-mc-lite-1788179972462-cc22ec3e-content {
  width: 100%;
  height: 100%;
  padding: 15px 20px;
  background: #FFFFFF;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-mc-lite-1788179972462-cc22ec3e-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.c-mc-lite-1788179972462-cc22ec3e-title {
  font-size: 24px;
  font-weight: 700;
  color: #5CB3E0;
}

.c-mc-lite-1788179972462-cc22ec3e-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.c-mc-lite-1788179972462-cc22ec3e-icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5CB3E0;
  cursor: pointer;
  position: relative;
  transition: opacity 0.2s;
}

.c-mc-lite-1788179972462-cc22ec3e-icon-btn:hover {
  opacity: 0.7;
}

.c-mc-lite-1788179972462-cc22ec3e-icon-btn svg {
  width: 20px;
  height: 20px;
}

.c-mc-lite-1788179972462-cc22ec3e-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #FF4D4F;
  color: #FFFFFF;
  font-size: 10px;
  font-weight: 500;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.c-mc-lite-1788179972462-cc22ec3e-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 15px;
}

.c-mc-lite-1788179972462-cc22ec3e-tab {
  padding: 8px 16px;
  font-size: 14px;
  color: #999;
  background: #F5F8FA;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.c-mc-lite-1788179972462-cc22ec3e-tab:hover {
  background: #E8F4F8;
  color: #5CB3E0;
}

.c-mc-lite-1788179972462-cc22ec3e-tab-active {
  background: #5CB3E0;
  color: #FFFFFF;
  font-weight: 500;
}

.c-mc-lite-1788179972462-cc22ec3e-chart-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
}

.c-mc-lite-1788179972462-cc22ec3e-chart {
  width: 100%;
  height: 100%;
}
</style>