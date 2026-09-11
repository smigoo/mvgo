<template>
  <div :class="['mv-1785646963826-ccd751a2-container']">
    <!-- 面板头部 -->
    <div :class="['mv-1785646963826-ccd751a2-header']">
      <div :class="['mv-1785646963826-ccd751a2-header-icon']">
        <img :src="icon1" alt="" :class="['header-dot-icon']" />
      </div>
      <span :class="['mv-1785646963826-ccd751a2-header-title']">流量监测</span>
      <span :class="['mv-1785646963826-ccd751a2-header-update']">*数据实时更新</span>
    </div>

    <!-- 内容区 -->
    <div :class="['mv-1785646963826-ccd751a2-content']">
      <!-- 当日总流量区域 -->
      <div :class="['mv-1785646963826-ccd751a2-section']">
        <!-- 子标题行 -->
        <div :class="['mv-1785646963826-ccd751a2-sub-header']">
          <div :class="['mv-1785646963826-ccd751a2-sub-title-wrap']">
            <div :class="['mv-1785646963826-ccd751a2-sub-title-icon']">
              <img :src="icon2" alt="" :class="['sub-title-img']" />
            </div>
            <span :class="['mv-1785646963826-ccd751a2-sub-title']">当日总流量</span>
          </div>
          <!-- 时间选择下拉框 -->
          <div 
            :class="['mv-1785646963826-ccd751a2-dropdown']"
            @click="toggleDropdown"
            role="button"
            aria-label="选择时间范围"
            aria-expanded="isDropdownOpen"
          >
            <span :class="['mv-1785646963826-ccd751a2-dropdown-text']">{{ selectedTime }}</span>
            <span :class="['mv-1785646963826-ccd751a2-dropdown-arrow']"></span>
            <!-- 下拉菜单 -->
            <div v-if="isDropdownOpen" :class="['mv-1785646963826-ccd751a2-dropdown-menu']">
              <div 
                v-for="option in timeOptions" 
                :key="option"
                :class="['mv-1785646963826-ccd751a2-dropdown-menu-item']"
                @click.stop="selectTime(option)"
              >
                {{ option }}
              </div>
            </div>
          </div>
        </div>

        <!-- 统计数值行 -->
        <div 
          :class="['mv-1785646963826-ccd751a2-stats-row']"
          :style="{ backgroundImage: `url(${bgm_2})` }"
        >
          <div :class="['mv-1785646963826-ccd751a2-stat-card']">
            <span :class="['mv-1785646963826-ccd751a2-stat-label']">江阴靖江长江隧道</span>
            <span :class="['mv-1785646963826-ccd751a2-stat-value', 'mv-1785646963826-ccd751a2-stat-value--tunnel']">34,620</span>
          </div>
          <div :class="['mv-1785646963826-ccd751a2-stat-card']">
            <span :class="['mv-1785646963826-ccd751a2-stat-label']">江阴大桥</span>
            <span :class="['mv-1785646963826-ccd751a2-stat-value', 'mv-1785646963826-ccd751a2-stat-value--bridge']">82,379</span>
          </div>
        </div>

        <!-- 隧道流量柱状图 -->
        <div :class="['mv-1785646963826-ccd751a2-chart-section']">
          <div :class="['mv-1785646963826-ccd751a2-chart-title']">
            <span :class="['mv-1785646963826-ccd751a2-chart-title-text']">江阴靖江长江隧道</span>
          </div>
          <div ref="tunnelChartRef" :class="['mv-1785646963826-ccd751a2-chart-container']"></div>
        </div>

        <!-- 大桥流量柱状图 -->
        <div :class="['mv-1785646963826-ccd751a2-chart-section']">
          <div :class="['mv-1785646963826-ccd751a2-chart-title']">
            <span :class="['mv-1785646963826-ccd751a2-chart-title-text']">江阴大桥</span>
          </div>
          <div ref="bridgeChartRef" :class="['mv-1785646963826-ccd751a2-chart-container']"></div>
        </div>
      </div>

      <!-- 车型分布区域 -->
      <div :class="['mv-1785646963826-ccd751a2-section']">
        <div :class="['mv-1785646963826-ccd751a2-sub-header']">
          <div :class="['mv-1785646963826-ccd751a2-sub-title-wrap']">
            <div :class="['mv-1785646963826-ccd751a2-sub-title-icon']">
              <img :src="icon53" alt="" :class="['sub-title-img']" />
            </div>
            <span :class="['mv-1785646963826-ccd751a2-sub-title']">车型分布</span>
          </div>
        </div>

        <div :class="['mv-1785646963826-ccd751a2-vehicle-section']">
          <!-- 隧道车型卡片 -->
          <div 
            :class="['mv-1785646963826-ccd751a2-vehicle-card']"
            :style="{ backgroundImage: `url(${bgm_3})` }"
          >
            <div :class="['mv-1785646963826-ccd751a2-vehicle-card-title']">
              <span :class="['mv-1785646963826-ccd751a2-vehicle-card-title-text']">江阴靖江长江隧道</span>
            </div>
            <div :class="['mv-1785646963826-ccd751a2-vehicle-card-content']">
              <div :class="['mv-1785646963826-ccd751a2-vehicle-stat']">
                <span :class="['mv-1785646963826-ccd751a2-vehicle-stat-label']">客车</span>
                <span :class="['mv-1785646963826-ccd751a2-vehicle-stat-value', 'mv-1785646963826-ccd751a2-vehicle-stat-value--car']">22350</span>
              </div>
              <img :src="iconecharts" alt="" :class="['mv-1785646963826-ccd751a2-vehicle-chart']" />
              <div :class="['mv-1785646963826-ccd751a2-vehicle-stat']">
                <span :class="['mv-1785646963826-ccd751a2-vehicle-stat-label']">货车</span>
                <span :class="['mv-1785646963826-ccd751a2-vehicle-stat-value', 'mv-1785646963826-ccd751a2-vehicle-stat-value--truck']">16270</span>
              </div>
            </div>
          </div>

          <!-- 大桥车型卡片 -->
          <div 
            :class="['mv-1785646963826-ccd751a2-vehicle-card']"
            :style="{ backgroundImage: `url(${bgm_4})` }"
          >
            <div :class="['mv-1785646963826-ccd751a2-vehicle-card-title']">
              <span :class="['mv-1785646963826-ccd751a2-vehicle-card-title-text']">江阴大桥</span>
            </div>
            <div :class="['mv-1785646963826-ccd751a2-vehicle-card-content']">
              <div :class="['mv-1785646963826-ccd751a2-vehicle-stat']">
                <span :class="['mv-1785646963826-ccd751a2-vehicle-stat-label']">客车</span>
                <span :class="['mv-1785646963826-ccd751a2-vehicle-stat-value', 'mv-1785646963826-ccd751a2-vehicle-stat-value--car']">66109</span>
              </div>
              <img :src="iconecharts" alt="" :class="['mv-1785646963826-ccd751a2-vehicle-chart']" />
              <div :class="['mv-1785646963826-ccd751a2-vehicle-stat']">
                <span :class="['mv-1785646963826-ccd751a2-vehicle-stat-label']">货车</span>
                <span :class="['mv-1785646963826-ccd751a2-vehicle-stat-value', 'mv-1785646963826-ccd751a2-vehicle-stat-value--truck']">16270</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 流量预测区域 -->
      <div :class="['mv-1785646963826-ccd751a2-section']">
        <div :class="['mv-1785646963826-ccd751a2-sub-header', 'mv-1785646963826-ccd751a2-prediction-header']">
          <div :class="['mv-1785646963826-ccd751a2-sub-title-wrap']">
            <div :class="['mv-1785646963826-ccd751a2-sub-title-icon']">
              <img :src="icon56" alt="" :class="['sub-title-img']" />
            </div>
            <span :class="['mv-1785646963826-ccd751a2-sub-title']">流量预测</span>
          </div>
          <!-- Tab 切换 -->
          <div :class="['mv-1785646963826-ccd751a2-tab-group']">
            <button
              v-for="(tab, index) in predictionTabs"
              :key="tab"
              :class="[
                'mv-1785646963826-ccd751a2-tab-btn',
                { 'mv-1785646963826-ccd751a2-tab-btn--active': activeTabIndex === index }
              ]"
              @click="switchTab(index)"
              role="tab"
              :aria-selected="activeTabIndex === index"
            >
              {{ tab }}
            </button>
          </div>
          <!-- 节假日预测链接 -->
          <span 
            :class="['mv-1785646963826-ccd751a2-prediction-link']"
            @click="goToHolidayPrediction"
            role="link"
          >
            节假日预测 >
          </span>
        </div>

        <!-- 预测图表 -->
        <div ref="predictionChartRef" :class="['mv-1785646963826-ccd751a2-prediction-chart']"></div>
        
        <!-- 准确率 -->
        <div :class="['mv-1785646963826-ccd751a2-accuracy-row']">
          <span :class="['mv-1785646963826-ccd751a2-accuracy-item']">准确率98%</span>
          <span :class="['mv-1785646963826-ccd751a2-accuracy-item']">准确率96%</span>
          <span :class="['mv-1785646963826-ccd751a2-accuracy-item']">准确率92%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from './resources/images/g-3552.png'
import icon2 from './resources/images/icon-3561.png'
import icon53 from './resources/images/icon-3441.png'
import icon56 from './resources/images/icon-3573.png'
import bgm_2 from './resources/images/bg-_m-34.png'
import bgm_3 from './resources/images/bg-_m-36.png'
import bgm_4 from './resources/images/bg-_m-35.png'
import iconecharts from './resources/images/echarts-31.png'

/**
 * 流量监测面板组件
 * 功能：展示江阴靖江长江隧道和江阴大桥的当日流量统计、车型分布、流量预测
 * 交互：时间范围下拉选择、地点Tab切换、节假日预测链接跳转
 */
import { ref, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

// 引入图片资源变量（系统自动注入）

  // 隧道流量数据
  tunnelData: { 
    type: Object, 
    default: () => ({
      total: '34,620',
      carCount: 22350,
      truckCount: 16270,
      hourlyData: []
    })
  },
  // 大桥流量数据
  bridgeData: { 
    type: Object, 
    default: () => ({
      total: '82,379',
      carCount: 66109,
      truckCount: 16270,
      hourlyData: []
    })
  }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['timeChange', 'locationChange', 'holidayClick'])
// #endregion

// #region 3. 响应式状态
// 下拉框状态
const isDropdownOpen = ref(false)
const selectedTime = ref('24小时')
const timeOptions = ref(['24小时', '12小时', '6小时', '1小时'])

// Tab切换状态
const activeTabIndex = ref(0)
const predictionTabs = ref(['江阴靖江长江隧道', '江阴大桥'])

// 图表实例
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
const predictionChartRef = ref(null)
let tunnelChart = null
let bridgeChart = null
let predictionChart = null
// #endregion

// #region 4. 计算属性
// 当前选中的预测地点
const currentPredictionLocation = computed(() => {
  return predictionTabs.value[activeTabIndex.value]
})
// #endregion

// #region 5. 方法
// 切换下拉框
const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value
}

// 选择时间
const selectTime = (time) => {
  selectedTime.value = time
  isDropdownOpen.value = false
  emit('timeChange', time)
  // 切换时间后刷新图表数据
  refreshCharts()
}

// 切换Tab
const switchTab = (index) => {
  activeTabIndex.value = index
  emit('locationChange', predictionTabs.value[index])
  // 切换地点后刷新预测图表
  refreshPredictionChart()
}

// 跳转节假日预测
const goToHolidayPrediction = () => {
  emit('holidayClick')
  console.log('跳转到节假日预测页面')
}

// 初始化隧道柱状图
const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  
  tunnelChart = echarts.init(tunnelChartRef.value)
  
  // 模拟24小时数据
  const hours = Array.from({ length: 24 }, (_, i) => `${i}`)
  const beijingData = [200, 150, 100, 80, 100, 200, 400, 800, 1200, 1000, 800, 600, 500, 600, 800, 1000, 1200, 1500, 1200, 800, 600, 400, 300, 200]
  const shanghaiData = [180, 130, 90, 70, 90, 180, 350, 700, 1100, 900, 700, 550, 450, 550, 700, 900, 1100, 1300, 1100, 700, 550, 350, 280, 180]
  
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const time = params[0].axisValue + '时'
        let result = `${time}<br/>`
        params.forEach(param => {
          result += `${param.marker}${param.seriesName}: ${param.value}辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        fontSize: 12,
        color: '#333333'
      }
    },
    grid: {
      left: 40,
      right: 10,
      top: 30,
      bottom: 20
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisLabel: { 
        color: '#666',
        fontSize: 10,
        interval: 3
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisLabel: { 
        color: '#666',
        fontSize: 10
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        itemStyle: { color: '#2f74d6' },
        barWidth: 4,
        barGap: '30%'
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        itemStyle: { color: '#5bc0de' },
        barWidth: 4
      }
    ]
  }
  
  tunnelChart.setOption(option)
}

// 初始化大桥柱状图
const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  
  bridgeChart = echarts.init(bridgeChartRef.value)
  
  // 模拟24小时数据（大桥流量更大）
  const hours = Array.from({ length: 24 }, (_, i) => `${i}`)
  const beijingData = [500, 400, 300, 250, 300, 500, 1000, 2000, 3000, 2500, 2000, 1500, 1200, 1500, 2000, 2500, 3000, 3500, 3000, 2000, 1500, 1000, 700, 500]
  const shanghaiData = [450, 350, 280, 220, 280, 450, 900, 1800, 2700, 2200, 1800, 1350, 1100, 1350, 1800, 2200, 2700, 3200, 2700, 1800, 1350, 900, 650, 450]
  
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const time = params[0].axisValue + '时'
        let result = `${time}<br/>`
        params.forEach(param => {
          result += `${param.marker}${param.seriesName}: ${param.value}辆<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['北京方向', '上海方向'],
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        fontSize: 12,
        color: '#333333'
      }
    },
    grid: {
      left: 40,
      right: 10,
      top: 30,
      bottom: 20
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisLabel: { 
        color: '#666',
        fontSize: 10,
        interval: 3
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisLabel: { 
        color: '#666',
        fontSize: 10
      }
    },
    series: [
      {
        name: '北京方向',
        type: 'bar',
        data: beijingData,
        itemStyle: { color: '#2f74d6' },
        barWidth: 4,
        barGap: '30%'
      },
      {
        name: '上海方向',
        type: 'bar',
        data: shanghaiData,
        itemStyle: { color: '#5bc0de' },
        barWidth: 4
      }
    ]
  }
  
  bridgeChart.setOption(option)
}

// 初始化预测面积图
const initPredictionChart = () => {
  if (!predictionChartRef.value) return
  
  predictionChart = echarts.init(predictionChartRef.value)
  
  // 模拟预测数据：2小时前到2小时后
  const timeLabels = ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后']
  const actualData = [1200, 1500, 1800, null, null]
  const predictData = [null, null, 1800, 2100, 2400]
  
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const time = params[0].axisValue
        let result = `${time}<br/>`
        params.forEach(param => {
          if (param.value !== null && param.value !== undefined) {
            result += `${param.marker}${param.seriesName}: ${param.value}辆<br/>`
          }
        })
        return result
      }
    },
    legend: {
      data: ['实际流量', '预测流量'],
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 6,
      textStyle: {
        fontSize: 12,
        color: '#333333'
      }
    },
    grid: {
      left: 40,
      right: 10,
      top: 30,
      bottom: 20
    },
    xAxis: {
      type: 'category',
      data: timeLabels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisLabel: { 
        color: '#666',
        fontSize: 10
      },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      max: 4000,
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLine: { show: false },
      axisLabel: { 
        color: '#666',
        fontSize: 10
      }
    },
    series: [
      {
        name: '实际流量',
        type: 'line',
        data: actualData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { 
          color: '#3385ff',
          width: 2
        },
        itemStyle: { 
          color: '#ffffff',
          borderColor: '#3385ff',
          borderWidth: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(51, 133, 255, 0.3)' },
              { offset: 1, color: 'rgba(51, 133, 255, 0.05)' }
            ]
          }
        },
        connectNulls: false
      },
      {
        name: '预测流量',
        type: 'line',
        data: predictData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { 
          color: '#00cccc',
          width: 2
        },
        itemStyle: { 
          color: '#ffffff',
          borderColor: '#00cccc',
          borderWidth: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 204, 204, 0.3)' },
              { offset: 1, color: 'rgba(0, 204, 204, 0.05)' }
            ]
          }
        },
        connectNulls: false
      }
    ]
  }
  
  predictionChart.setOption(option)
}

// 刷新所有图表
const refreshCharts = () => {
  // 根据选择的时间范围刷新数据
  console.log('刷新图表，时间范围:', selectedTime.value)
}

// 刷新预测图表
const refreshPredictionChart = () => {
  if (!predictionChart) return
  
  // 根据选择的地点刷新预测数据
  const location = predictionTabs.value[activeTabIndex.value]
  console.log('刷新预测图表，地点:', location)
  
  // 这里可以根据实际API更新数据
  // 暂时保持原有数据
}

// 窗口resize处理
const handleResize = () => {
  tunnelChart?.resize()
  bridgeChart?.resize()
  predictionChart?.resize()
}

// 点击外部关闭下拉框
const handleClickOutside = (e) => {
  const dropdown = document.querySelector('.mv-1785646963826-ccd751a2-dropdown')
  if (dropdown && !dropdown.contains(e.target)) {
    isDropdownOpen.value = false
  }
}
// #endregion

// #region 6. 生命周期
onMounted(async () => {
  // 等待DOM更新后初始化图表
  await nextTick()
  initTunnelChart()
  initBridgeChart()
  initPredictionChart()
  
  // 监听窗口resize
  window.addEventListener('resize', handleResize)
  // 监听点击外部关闭下拉框
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  // 清理图表实例
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  predictionChart?.dispose()
  
  // 移除事件监听
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', handleClickOutside)
})
// #endregion

// 监听Tab切换，刷新预测图表
watch(activeTabIndex, () => {
  refreshPredictionChart()
})
</script>

<style lang="less" scoped>
@import './resources/styles/index.less';

// 头部装饰图标
.header-dot-icon {
  width: 8px;
  height: 8px;
  object-fit: contain;
}

// 子标题图标
.sub-title-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

// 下拉框定位
.mv-1785646963826-ccd751a2-dropdown {
  position: relative;
}

// 车型卡片标题背景
.mv-1785646963826-ccd751a2-vehicle-card-title {
  span {
    color: var(--color-text-base);
  }
}

// 图表容器确保最小高度
.mv-1785646963826-ccd751a2-chart-container,
.mv-1785646963826-ccd751a2-prediction-chart {
  min-height: 120px;
}

// 响应式调整
@media (max-width: 400px) {
  .mv-1785646963826-ccd751a2-vehicle-section {
    flex-direction: column;
  }
  
  .mv-1785646963826-ccd751a2-tab-group {
    flex-wrap: wrap;
  }
}</style>