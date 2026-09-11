<template>
  <div class="mv3-mv-1785598006490-82b9f3c4-root">
    <!-- 面板头部 -->
    <div class="mv3-mv-1785598006490-82b9f3c4-header">
      <div class="mv3-mv-1785598006490-82b9f3c4-header-title">
        <!-- 标题装饰菱形图标 -->
        <div class="header-diamond">
          <img :src="icon1" class="header-diamond-dot" alt="" />
        </div>
        <span class="mv3-mv-1785598006490-82b9f3c4-header-title-text">流量监测</span>
      </div>
      <span class="mv3-mv-1785598006490-82b9f3c4-header-update">*数据实时更新</span>
    </div>

    <!-- 内容区域 -->
    <div class="mv3-mv-1785598006490-82b9f3c4-content">
      <!-- 当日总流量区域 -->
      <div class="section-daily">
        <div class="section-header">
          <div class="mv3-mv-1785598006490-82b9f3c4-section-title">
            <div class="mv3-mv-1785598006490-82b9f3c4-title-icon">
              <div class="mv3-mv-1785598006490-82b9f3c4-title-icon-inner"></div>
            </div>
            <span>当日总流量</span>
          </div>
          <!-- 时间选择下拉 -->
          <div
            class="time-selector"
            role="listbox"
            aria-label="时间范围选择"
            tabindex="0"
            @click="toggleDropdown"
            @keydown.enter="toggleDropdown"
            @keydown.space.prevent="toggleDropdown"
            @keydown.escape="closeDropdown"
          >
            <span class="time-selector-text">{{ selectedTime }}</span>
            <span class="time-selector-arrow" :class="{ 'is-open': isDropdownOpen }">▼</span>
            <!-- 下拉菜单 -->
            <div v-if="isDropdownOpen" class="dropdown-menu" role="list">
              <div
                v-for="option in timeOptions"
                :key="option"
                class="dropdown-item"
                :class="{ 'is-active': option === selectedTime }"
                role="option"
                :aria-selected="option === selectedTime"
                tabindex="0"
                @click.stop="selectTime(option)"
                @keydown.enter.stop="selectTime(option)"
              >
                {{ option }}
              </div>
            </div>
          </div>
        </div>

        <!-- 统计卡片行 -->
        <div class="stats-row" :style="{ backgroundImage: `url(${bgm_2})` }">
          <div class="stats-bg-overlay"></div>
          <div class="stat-card stat-tunnel">
            <span class="stat-label">江阴靖江长江隧道</span>
            <span class="stat-value tunnel-value">34,620<span class="stat-unit">辆</span></span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-card stat-bridge">
            <span class="stat-label">江阴大桥</span>
            <span class="stat-value bridge-value">82,379<span class="stat-unit">辆</span></span>
          </div>
        </div>

        <!-- 隧道小时流量柱状图 -->
        <div class="chart-section">
          <div class="chart-title-row">
            <div class="chart-indicator"></div>
            <span class="chart-title-text">江阴靖江长江隧道</span>
          </div>
          <div ref="tunnelChartRef" class="chart-container"></div>
        </div>

        <!-- 大桥小时流量柱状图 -->
        <div class="chart-section">
          <div class="chart-title-row">
            <div class="chart-indicator"></div>
            <span class="chart-title-text">江阴大桥</span>
          </div>
          <div ref="bridgeChartRef" class="chart-container"></div>
        </div>
      </div>

      <!-- 车型分布区域 -->
      <div class="section-vehicle">
        <div class="section-header">
          <div class="mv3-mv-1785598006490-82b9f3c4-section-title">
            <div class="mv3-mv-1785598006490-82b9f3c4-title-icon">
              <div class="mv3-mv-1785598006490-82b9f3c4-title-icon-inner"></div>
            </div>
            <span>车型分布</span>
          </div>
        </div>

        <div class="vehicle-row">
          <!-- 隧道车型 -->
          <div class="vehicle-card" :style="{ backgroundImage: `url(${bgm_4})` }">
            <div class="vehicle-card-bg"></div>
            <div class="vehicle-card-content">
              <div class="vehicle-chart-wrap">
                <div ref="tunnelPieRef" class="vehicle-pie-chart"></div>
                <img :src="iconecharts" class="vehicle-center-icon" alt="" />
              </div>
              <div class="vehicle-label-row">
                <div class="vehicle-title-bar" :style="{ backgroundImage: `url(${bg2})` }"></div>
                <span class="vehicle-location-name">江阴靖江长江隧道</span>
              </div>
              <div class="vehicle-stats">
                <div class="vehicle-stat-item">
                  <span class="vehicle-type-label">客车</span>
                  <span class="vehicle-type-value--bus">22350</span>
                </div>
                <div class="vehicle-stat-item">
                  <span class="vehicle-type-label">货车</span>
                  <span class="vehicle-type-value--truck">16270</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 大桥车型 -->
          <div class="vehicle-card" :style="{ backgroundImage: `url(${bgm_4})` }">
            <div class="vehicle-card-bg"></div>
            <div class="vehicle-card-content">
              <div class="vehicle-chart-wrap">
                <div ref="bridgePieRef" class="vehicle-pie-chart"></div>
                <img :src="icongroup206" class="vehicle-center-icon" alt="" />
              </div>
              <div class="vehicle-label-row">
                <div class="vehicle-title-bar" :style="{ backgroundImage: `url(${bg4})` }"></div>
                <span class="vehicle-location-name">江阴大桥</span>
              </div>
              <div class="vehicle-stats">
                <div class="vehicle-stat-item">
                  <span class="vehicle-type-label">客车</span>
                  <span class="vehicle-type-value--bus">66109</span>
                </div>
                <div class="vehicle-stat-item">
                  <span class="vehicle-type-label">货车</span>
                  <span class="vehicle-type-value--truck">16270</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 流量预测区域 -->
      <div class="section-forecast">
        <div class="section-header forecast-header">
          <div class="mv3-mv-1785598006490-82b9f3c4-section-title">
            <div class="mv3-mv-1785598006490-82b9f3c4-title-icon">
              <div class="mv3-mv-1785598006490-82b9f3c4-title-icon-inner"></div>
            </div>
            <span>流量预测</span>
          </div>
          <!-- Tab 切换 -->
          <div class="forecast-tabs">
            <button
              v-for="(tab, index) in forecastTabs"
              :key="tab"
              class="forecast-tab"
              :class="{ 'is-active': activeForecastTab === index }"
              @click="switchForecastTab(index)"
            >
              {{ tab }}
            </button>
          </div>
          <!-- 节假日预测链接 -->
          <a class="holiday-link" href="javascript:void(0)" @click="handleHolidayClick">
            节假日预测&gt;
          </a>
        </div>

        <!-- 预测图表 -->
        <div class="forecast-chart-section">
          <div ref="forecastChartRef" class="forecast-chart-container"></div>
          <!-- 准确率标注 -->
          <div class="accuracy-row">
            <span class="accuracy-item">准确率98%</span>
            <span class="accuracy-item">准确率96%</span>
            <span class="accuracy-item">准确率92%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../resources/images/g-3552.png'
import bg2 from '../resources/images/bg-3475.png'
import bg4 from '../resources/images/bg-3525.png'
import bgm_2 from '../resources/images/bg-_m-34.png'
import icongroup206 from '../resources/images/Group_206-3455.png'
import bgm_4 from '../resources/images/bg-_m-35.png'
import iconecharts from '../resources/images/echarts-31.png'

// 流量监测面板组件
// 包含当日总流量统计、24小时柱状图、车型分布环形图、流量预测面积图
// 交互：时间下拉选择、Tab切换、节假日链接

import { ref, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

// #region 1. Props定义
const props = defineProps({
  // 时间范围选项
  timeOptions: {
    type: Array,
    default: () => ['24小时', '12小时', '6小时', '1小时']
  },
  // 预测Tab选项
  forecastTabs: {
    type: Array,
    default: () => ['江阴靖江长江隧道', '江阴大桥']
  }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['timeChange', 'tabChange', 'holidayClick'])
// #endregion

// #region 3. 响应式状态
const selectedTime = ref('24小时')
const isDropdownOpen = ref(false)
const activeForecastTab = ref(0)

// 图表 refs
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
const tunnelPieRef = ref(null)
const bridgePieRef = ref(null)
const forecastChartRef = ref(null)

// 图表实例
let tunnelChartInstance = null
let bridgeChartInstance = null
let tunnelPieInstance = null
let bridgePieInstance = null
let forecastChartInstance = null
// #endregion

// #region 4. 计算属性
// 隧道柱状图数据（模拟24小时数据）
const tunnelBarData = {
  beijing: [120, 80, 60, 45, 30, 50, 180, 350, 420, 380, 350, 300, 280, 320, 380, 400, 350, 280, 200, 150, 120, 100, 80, 60],
  shanghai: [100, 70, 50, 40, 35, 55, 200, 380, 450, 400, 370, 320, 300, 340, 400, 420, 370, 300, 220, 160, 130, 110, 90, 70]
}

// 大桥柱状图数据
const bridgeBarData = {
  beijing: [200, 150, 100, 80, 60, 100, 350, 600, 750, 680, 620, 550, 500, 580, 680, 720, 650, 520, 380, 280, 220, 180, 140, 100],
  shanghai: [180, 130, 90, 70, 65, 110, 380, 650, 800, 720, 660, 580, 530, 610, 720, 760, 680, 550, 400, 300, 240, 200, 160, 120]
}

// 预测图表数据
const forecastData = {
  actual: [2800, 3200, 3500, 3400, 3600],
  predicted: [2900, 3100, 3450, 3500, 3550],
  labels: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']
}
// #endregion

// #region 5. 方法

// 切换下拉菜单
const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value
}

// 关闭下拉菜单
const closeDropdown = () => {
  isDropdownOpen.value = false
}

// 选择时间
const selectTime = (option) => {
  selectedTime.value = option
  isDropdownOpen.value = false
  emit('timeChange', option)
  // 切换时间后刷新图表数据
  refreshBarCharts()
}

// 切换预测Tab
const switchForecastTab = (index) => {
  activeForecastTab.value = index
  emit('tabChange', props.forecastTabs[index])
  // 切换Tab后刷新预测图表
  refreshForecastChart()
}

// 节假日预测点击
const handleHolidayClick = () => {
  emit('holidayClick')
}

// 初始化隧道柱状图
const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  tunnelChartInstance = echarts.init(tunnelChartRef.value)
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(p => {
          result += `${p.marker}${p.seriesName}: ${p.value}辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      textStyle: { fontSize: 12, color: '#666' },
      itemWidth: 10,
      itemHeight: 10
    },
    grid: {
      top: 30,
      left: 40,
      right: 15,
      bottom: 25
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => `${i}`),
      axisLabel: { fontSize: 10, color: '#999', interval: 1 },
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 600,
      splitNumber: 3,
      axisLabel: { fontSize: 10, color: '#999' },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: tunnelBarData.beijing,
        barWidth: 4,
        itemStyle: { color: '#3b82f6', borderRadius: [2, 2, 0, 0] }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: tunnelBarData.shanghai,
        barWidth: 4,
        itemStyle: { color: '#06b6d4', borderRadius: [2, 2, 0, 0] }
      }
    ]
  }
  tunnelChartInstance.setOption(option)
}

// 初始化大桥柱状图
const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  bridgeChartInstance = echarts.init(bridgeChartRef.value)
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        let result = `${params[0].axisValue}时<br/>`
        params.forEach(p => {
          result += `${p.marker}${p.seriesName}: ${p.value}辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      textStyle: { fontSize: 12, color: '#666' },
      itemWidth: 10,
      itemHeight: 10
    },
    grid: {
      top: 30,
      left: 40,
      right: 15,
      bottom: 25
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => `${i}`),
      axisLabel: { fontSize: 10, color: '#999', interval: 1 },
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 1000,
      splitNumber: 4,
      axisLabel: { fontSize: 10, color: '#999' },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: bridgeBarData.beijing,
        barWidth: 4,
        itemStyle: { color: '#3b82f6', borderRadius: [2, 2, 0, 0] }
      },
      {
        name: '上海方向',
        type: 'bar',
        data: bridgeBarData.shanghai,
        barWidth: 4,
        itemStyle: { color: '#06b6d4', borderRadius: [2, 2, 0, 0] }
      }
    ]
  }
  bridgeChartInstance.setOption(option)
}

// 初始化隧道车型环形图
const initTunnelPieChart = () => {
  if (!tunnelPieRef.value) return
  tunnelPieInstance = echarts.init(tunnelPieRef.value)
  const total = 22350 + 16270
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        data: [
          { value: 22350, name: '客车', itemStyle: { color: '#1990ff' } },
          { value: 16270, name: '货车', itemStyle: { color: '#f97316' } }
        ],
        label: { show: false },
        emphasis: {
          scaleSize: 4
        }
      }
    ]
  }
  tunnelPieInstance.setOption(option)
}

// 初始化大桥车型环形图
const initBridgePieChart = () => {
  if (!bridgePieRef.value) return
  bridgePieInstance = echarts.init(bridgePieRef.value)
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        data: [
          { value: 66109, name: '客车', itemStyle: { color: '#1990ff' } },
          { value: 16270, name: '货车', itemStyle: { color: '#f97316' } }
        ],
        label: { show: false },
        emphasis: {
          scaleSize: 4
        }
      }
    ]
  }
  bridgePieInstance.setOption(option)
}

// 初始化预测面积图
const initForecastChart = () => {
  if (!forecastChartRef.value) return
  forecastChartInstance = echarts.init(forecastChartRef.value)
  updateForecastOption()
}

// 更新预测图表配置
const updateForecastOption = () => {
  if (!forecastChartInstance) return
  // 根据Tab切换不同数据
  const data = activeForecastTab.value === 0
    ? { actual: [2800, 3200, 3500, 3400, 3600], predicted: [2900, 3100, 3450, 3500, 3550] }
    : { actual: [5200, 5800, 6200, 6000, 6400], predicted: [5300, 5700, 6100, 6150, 6300] }

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        let result = `${params[0].axisValue}<br/>`
        params.forEach(p => {
          result += `${p.marker}${p.seriesName}: ${p.value}辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      textStyle: { fontSize: 12, color: '#666' },
      itemWidth: 14,
      itemHeight: 6
    },
    grid: {
      top: 35,
      left: 40,
      right: 15,
      bottom: 25
    },
    xAxis: {
      type: 'category',
      data: forecastData.labels,
      boundaryGap: false,
      axisLabel: { fontSize: 10, color: '#999' },
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#999' },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: data.actual,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#3385ff', width: 2 },
        itemStyle: { color: '#3385ff', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
              { offset: 1, color: 'rgba(51, 133, 255, 0.02)' }
            ]
          }
        }
      },
      {
        name: '预测流量',
        type: 'line',
        data: data.predicted,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#00cccc', width: 2 },
        itemStyle: { color: '#00cccc', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 204, 204, 0.02)' }
            ]
          }
        }
      }
    ]
  }
  forecastChartInstance.setOption(option)
}

// 刷新柱状图（时间切换时调用）
const refreshBarCharts = () => {
  // 根据选择的时间范围调整数据展示（此处简化为重新设置option）
  if (tunnelChartInstance) {
    tunnelChartInstance.setOption({
      series: [
        { data: tunnelBarData.beijing },
        { data: tunnelBarData.shanghai }
      ]
    })
  }
  if (bridgeChartInstance) {
    bridgeChartInstance.setOption({
      series: [
        { data: bridgeBarData.beijing },
        { data: bridgeBarData.shanghai }
      ]
    })
  }
}

// 刷新预测图表（Tab切换时调用）
const refreshForecastChart = () => {
  updateForecastOption()
}

// 窗口resize处理
const handleResize = () => {
  tunnelChartInstance?.resize()
  bridgeChartInstance?.resize()
  tunnelPieInstance?.resize()
  bridgePieInstance?.resize()
  forecastChartInstance?.resize()
}

// 点击外部关闭下拉
const handleClickOutside = (e) => {
  const selector = document.querySelector('.time-selector')
  if (selector && !selector.contains(e.target)) {
    isDropdownOpen.value = false
  }
}
// #endregion

// #region 6. 生命周期
onMounted(async () => {
  await nextTick()
  // 初始化所有图表
  initTunnelChart()
  initBridgeChart()
  initTunnelPieChart()
  initBridgePieChart()
  initForecastChart()
  // 监听窗口resize
  window.addEventListener('resize', handleResize)
  // 监听点击外部关闭下拉
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  // 清理图表实例
  tunnelChartInstance?.dispose()
  bridgeChartInstance?.dispose()
  tunnelPieInstance?.dispose()
  bridgePieInstance?.dispose()
  forecastChartInstance?.dispose()
  // 移除事件监听
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', handleClickOutside)
})
// #endregion
</script>

<style lang="less" scoped>
@import './resources/styles/index.less';

/* 头部菱形装饰 */
.header-diamond {
  width: 8px;
  height: 8px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-diamond-dot {
  width: 8px;
  height: 8px;
  object-fit: contain;
}

/* 时间选择器 */
.time-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  user-select: none;
  min-width: 100px;

  &:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}

.time-selector-text {
  font-size: 14px;
  color: var(--color-text-base);
}

.time-selector-arrow {
  font-size: 8px;
  color: #999;
  transition: transform 0.2s;

  &.is-open {
    transform: rotate(180deg);
  }
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  margin-top: 4px;
}

.dropdown-item {
  padding: 8px 12px;
  font-size: 14px;
  color: var(--color-text-base);
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: #f0f7ff;
  }

  &.is-active {
    color: var(--color-primary);
    font-weight: 500;
  }

  &:focus {
    outline: none;
    background: #f0f7ff;
  }
}

/* 当日总流量区域 */
.section-daily {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

/* 统计卡片行 */
.stats-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  padding: 16px 20px;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  position: relative;
  border-radius: var(--border-radius-base);
  min-height: 80px;
}

.stats-bg-overlay {
  position: absolute;
  inset: 0;
  background: rgba(237, 244, 251, 0.5);
  border-radius: var(--border-radius-base);
  pointer-events: none;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 1;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-base);
  font-weight: 500;
}

.stat-value {
  font-size: 24px;
  font-weight: 900;
  font-family: 'Roboto', sans-serif;
}

.tunnel-value {
  color: #006fe3;
}

.bridge-value {
  color: #0c9dbe;
}

.stat-unit {
  font-size: 12px;
  font-weight: 400;
  margin-left: 2px;
}

.stat-divider {
  width: 1px;
  height: 40px;
  background: linear-gradient(180deg, transparent, rgba(25, 144, 255, 0.3), transparent);
}

/* 图表区域 */
.chart-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chart-title-row {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 0;
}

.chart-indicator {
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  border-radius: 6px;
}

.chart-title-text {
  font-size: 14px;
  color: var(--color-text-base);
}

.chart-container {
  width: 100%;
  height: 130px;
  min-height: 0;
}

/* 车型分布区域 */
.section-vehicle {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vehicle-row {
  display: flex;
  flex-direction: row;
  gap: 12px;
}

.vehicle-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  position: relative;
  border-radius: var(--border-radius-base);
  padding: 12px;
  min-height: 120px;
  overflow: hidden;
}

.vehicle-card-bg {
  position: absolute;
  inset: 0;
  background: rgba(237, 244, 251, 0.6);
  border-radius: var(--border-radius-base);
  pointer-events: none;
}

.vehicle-card-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.vehicle-chart-wrap {
  position: relative;
  width: 52px;
  height: 52px;
}

.vehicle-pie-chart {
  width: 52px;
  height: 52px;
}

.vehicle-center-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 28px;
  height: 28px;
  object-fit: contain;
  pointer-events: none;
}

.vehicle-label-row {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
}

.vehicle-title-bar {
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 9px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  opacity: 0.5;
}

.vehicle-location-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-base);
  position: relative;
  z-index: 1;
}

.vehicle-stats {
  display: flex;
  flex-direction: row;
  gap: 16px;
  justify-content: center;
}

.vehicle-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.vehicle-type-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.vehicle-type-value--bus {
  font-size: 18px;
  font-weight: 700;
  color: #1399ff;
  font-family: 'Roboto', sans-serif;
}

.vehicle-type-value--truck {
  font-size: 18px;
  font-weight: 700;
  color: #ff6a00;
  font-family: 'Roboto', sans-serif;
}

/* 流量预测区域 */
.section-forecast {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.forecast-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.forecast-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.forecast-tab {
  padding: 2px 14px;
  font-size: 14px;
  border-radius: var(--border-radius-lg);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--color-tab-inactive);
  color: #fff;
  border-color: rgba(172, 196, 225, 1);
  font-family: inherit;
  line-height: 21px;

  &.is-active {
    background: var(--color-tab-active);
    border-color: rgba(199, 224, 255, 1);
    font-weight: 500;
  }

  &:hover:not(.is-active) {
    opacity: 0.85;
  }
}

.holiday-link {
  font-size: 12px;
  color: var(--color-primary);
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}

.forecast-chart-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.forecast-chart-container {
  width: 100%;
  height: 140px;
  min-height: 0;
}

.accuracy-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 21px;
  padding: 4px 0;
}

.accuracy-item {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-base);
}

/* 滚动条美化 */
.mv3-mv-1785598006490-82b9f3c4-content {
  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(25, 144, 255, 0.2);
    border-radius: 2px;
  }
}</style>