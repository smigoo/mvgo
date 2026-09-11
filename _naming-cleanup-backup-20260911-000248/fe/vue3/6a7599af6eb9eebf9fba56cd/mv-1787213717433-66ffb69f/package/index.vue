<template>
  <div class="traffic-monitor-root">
    <!-- 面板头部：真实标题栏 -->
    <header class="monitor-header">
      <div class="header-left">
        <span class="header-decor" :style="{ backgroundImage: `url(${icon1})` }"></span>
        <span class="header-title">流量监测</span>
        <span class="header-subtitle">*数据实时更新</span>
      </div>
      <div class="header-right">
        <!-- 预留：无额外控件 -->
      </div>
    </header>

    <!-- 当日总流量 -->
    <section class="section">
      <div class="section-header">
        <div class="section-title-group">
          <img :src="icon3" class="section-icon" alt="" />
          <span class="section-title">当日总流量</span>
        </div>
        <div class="time-selector">
          <span class="time-selector-text">{{ timeRange }}</span>
          <img :src="icon2" class="time-selector-arrow" alt="" />
        </div>
      </div>
      <div class="daily-total-cards" :style="{ backgroundImage: `url(${bg1})` }">
        <div class="stat-card" v-for="item in dailyTotalItems" :key="item.label">
          <div class="stat-label">{{ item.label }}</div>
          <div class="stat-value" :style="{ color: item.color }">{{ item.value }}</div>
        </div>
      </div>
    </section>

    <!-- 小时流量图表 -->
    <section class="section">
      <div class="chart-item">
        <div class="chart-header">
          <span class="chart-title">江阴靖江长江隧道</span>
          <span class="chart-legend">
            <span class="legend-item"><span class="legend-dot" style="background:#1890ff"></span>北京方向</span>
            <span class="legend-item"><span class="legend-dot" style="background:#69c0ff"></span>上海方向</span>
          </span>
        </div>
        <div ref="barChart1Ref" class="chart-container"></div>
      </div>
      <div class="chart-item">
        <div class="chart-header">
          <span class="chart-title">江阴大桥</span>
          <span class="chart-legend">
            <span class="legend-item"><span class="legend-dot" style="background:#1890ff"></span>北京方向</span>
            <span class="legend-item"><span class="legend-dot" style="background:#69c0ff"></span>上海方向</span>
          </span>
        </div>
        <div ref="barChart2Ref" class="chart-container"></div>
      </div>
    </section>

    <!-- 车型分布 -->
    <section class="section">
      <div class="section-header">
        <div class="section-title-group">
          <img :src="icon4" class="section-icon" alt="" />
          <span class="section-title">车型分布</span>
        </div>
      </div>
      <div class="vehicle-type-cards">
        <div class="vehicle-card" v-for="(item, idx) in vehicleTypeItems" :key="item.label" :style="item.bgStyle">
          <div class="vehicle-card-content">
            <div class="vehicle-name">{{ item.label }}</div>
            <div class="vehicle-stats">
              <div class="vehicle-stat" v-for="stat in item.stats" :key="stat.label">
                <span class="vehicle-stat-label">{{ stat.label }}</span>
                <span class="vehicle-stat-value" :style="{ color: stat.color }">{{ stat.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 流量预测 -->
    <section class="section">
      <div class="section-header forecast-header">
        <div class="section-title-group">
          <img :src="icon5" class="section-icon" alt="" />
          <span class="section-title">流量预测</span>
        </div>
        <div class="forecast-tabs">
          <div
            v-for="tab in forecastTabs"
            :key="tab"
            class="forecast-tab"
            :class="{ active: activeForecastTab === tab }"
            @click="handleForecastTabChange(tab)"
          >
            {{ tab }}
          </div>
        </div>
        <a class="holiday-link" @click.prevent="handleHolidayClick">节假日预测 &gt;</a>
      </div>
      <div class="forecast-chart-container">
        <div ref="areaChartRef" class="chart-container"></div>
        <div class="forecast-accuracy">
          <span>准确率98%</span>
          <span>准确率96%</span>
          <span>准确率92%</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
const icon1 = new URL('../resources/images/g-3552.png', import.meta.url).href
const icon3 = new URL('../resources/images/icon-3561.png', import.meta.url).href
const icon2 = new URL('../resources/images/Vector-3549.png', import.meta.url).href
const bg1 = new URL('../resources/images/bg-_m-34.png', import.meta.url).href
const icon4 = new URL('../resources/images/icon-3441.png', import.meta.url).href
const icon5 = new URL('../resources/images/icon-3573.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-_m-36.png', import.meta.url).href
const bg4 = new URL('../resources/images/bg-_m-35.png', import.meta.url).href
// 流量监测面板主组件
// 数据来源：接口或静态初始值；交互：时间选择、预测Tab切换、节假日链接
import { ref, computed, watch, onMounted, onUnmounted, nextTick} from 'vue'
import * as echarts from 'echarts'

// #region 1. 响应式状态（供 API 绑定）
const timeRange = ref('24小时')
const activeForecastTab = ref('江阴靖江长江隧道')
const forecastTabs = ref(['江阴靖江长江隧道', '江阴大桥'])

// 当日总流量数据
const dailyTotalItems = ref([
  { label: '江阴靖江长江隧道', value: '34,620', color: '#006fe3' },
  { label: '江阴大桥', value: '82,379', color: '#0c9dbe' }
])

// 车型分布数据
const vehicleTypeItems = ref([
  {
    label: '江阴靖江长江隧道',
    stats: [
      { label: '客车', value: '22350', color: '#1990ff' },
      { label: '货车', value: '16270', color: '#ff6a00' }
    ],
    bgStyle: { backgroundImage: `url(${bg2})` }
  },
  {
    label: '江阴大桥',
    stats: [
      { label: '客车', value: '66109', color: '#1990ff' },
      { label: '货车', value: '16270', color: '#ff6a00' }
    ],
    bgStyle: { backgroundImage: `url(${bg4})` }
  }
])

// 小时流量图表数据（柱状图）
const hours = ref(['2','4','6','8','10','12','14','16','18','20','22','24'])
const beijingDirection = ref([600,400,200,600,600,600,800,900,800,700,600,500])
const shanghaiDirection = ref([600,400,200,600,600,600,700,800,700,600,500,400])

// 流量预测图表数据（面积图）
const forecastLabels = ref(['2小时前','1小时前','当前时间','1小时后','2小时后'])
const actualFlow = ref([300,600,900,800,700])
const predictedFlow = ref([400,700,1000,900,800])

// 图表 refs 和实例
const barChart1Ref = ref(null)
const barChart2Ref = ref(null)
const areaChartRef = ref(null)
let barChart1 = null
let barChart2 = null
let areaChart = null
let resizeObserver = null
// #endregion

// #region 2. 图表配置生成
const createBarOption = (beijingData, shanghaiData) => ({
  tooltip: {
    trigger: 'axis',
    formatter: '{b}时<br/>{a0}: {c0} 辆<br/>{a1}: {c1} 辆'
  },
  legend: {
    data: ['北京方向', '上海方向'],
    orient: 'horizontal',
    right: 0,
    top: 0,
    itemWidth: 10,
    itemHeight: 10,
    textStyle: { fontSize: 12 }
  },
  grid: { left: 40, right: 10, top: 30, bottom: 25 },
  xAxis: {
    type: 'category',
    data: hours.value,
    boundaryGap: true,
    axisLabel: { fontSize: 10 }
  },
  yAxis: {
    type: 'value',
    max: 4000,
    interval: 1000,
    axisLabel: { fontSize: 10 }
  },
  series: [
    {
      name: '北京方向',
      type: 'bar',
      data: beijingData,
      barWidth: 6,
      itemStyle: { color: '#1890ff' },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#fa8c16', type: 'dashed' },
        label: { formatter: '建议分流', position: 'end', color: '#fa8c16', fontSize: 10 },
        data: [{ yAxis: 2000 }]
      }
    },
    {
      name: '上海方向',
      type: 'bar',
      data: shanghaiData,
      barWidth: 6,
      itemStyle: { color: '#69c0ff' }
    }
  ]
})

const createAreaOption = () => ({
  tooltip: {
    trigger: 'axis',
    formatter: '{b}<br/>{a0}: {c0} 辆<br/>{a1}: {c1} 辆'
  },
  legend: {
    data: ['实际流量', '预测流量'],
    orient: 'horizontal',
    right: 0,
    top: 0,
    itemWidth: 14,
    itemHeight: 6,
    textStyle: { fontSize: 12 }
  },
  grid: { left: 40, right: 10, top: 30, bottom: 25 },
  xAxis: {
    type: 'category',
    data: forecastLabels.value,
    boundaryGap: false
  },
  yAxis: {
    type: 'value',
    max: 4000,
    interval: 1000
  },
  series: [
    {
      name: '实际流量',
      type: 'line',
      data: actualFlow.value,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: '#1890ff', width: 2 },
      itemStyle: { color: '#1890ff' },
      areaStyle: { color: 'rgba(24,144,255,0.2)' }
    },
    {
      name: '预测流量',
      type: 'line',
      data: predictedFlow.value,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: '#52c41a', width: 2, type: 'dashed' },
      itemStyle: { color: '#52c41a' },
      areaStyle: { color: 'rgba(82,196,26,0.2)' }
    }
  ]
})
// #endregion

// #region 3. 初始化图表（遵循异步时序）
const initCharts = () => {
  if (barChart1Ref.value) {
    barChart1 = echarts.init(barChart1Ref.value)
    barChart1.setOption(createBarOption(beijingDirection.value, shanghaiDirection.value))
  }
  if (barChart2Ref.value) {
    barChart2 = echarts.init(barChart2Ref.value)
    barChart2.setOption(createBarOption(beijingDirection.value, shanghaiDirection.value))
  }
  if (areaChartRef.value) {
    areaChart = echarts.init(areaChartRef.value)
    areaChart.setOption(createAreaOption())
  }

  resizeObserver = new ResizeObserver(() => {
    barChart1?.resize()
    barChart2?.resize()
    areaChart?.resize()
  })
  if (barChart1Ref.value) resizeObserver.observe(barChart1Ref.value)
  if (barChart2Ref.value) resizeObserver.observe(barChart2Ref.value)
  if (areaChartRef.value) resizeObserver.observe(areaChartRef.value)
}

onMounted(async () => {
  await nextTick()
  requestAnimationFrame(() => {
    initCharts()
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  barChart1?.dispose()
  barChart2?.dispose()
  areaChart?.dispose()
})
// #endregion

// #region 4. 交互处理
const handleForecastTabChange = (tab) => {
  activeForecastTab.value = tab
  // 切换地点后，刷新预测图表数据（此处可按实际 API 联动，当前保持同一组数据演示）
  if (areaChart) {
    areaChart.setOption(createAreaOption())
  }
}

const handleHolidayClick = () => {
  // 节假日预测为链接，可触发事件或跳转
  console.log('跳转至节假日预测')
}
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* 面板头部专用样式 */
.monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-decor {
  width: 8px;
  height: 8px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.header-title {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.header-subtitle {
  font-size: 14px;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-left: auto;
}

/* 时间选择控件 */
.time-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.time-selector-text {
  font-size: 14px;
  color: #333333;
}
.time-selector-arrow {
  width: 8px;
  height: 4px;
  object-fit: contain;
}

/* 图表卡片容器 */
.chart-item {
  background: #ffffff;
  border: 1px solid #e3eef7;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.chart-container {
  height: 180px; /* 固定高度，父容器已设为 flex column */;
}

/* 车型分布卡片微调 */
.vehicle-card {
  min-height: 80px;
}
.vehicle-card:first-child {
  background-size: cover;
  background-position: center;
}
.vehicle-card:last-child {
  background-size: cover;
  background-position: center;
}

/* 预测区域 */
.forecast-header {
  flex-wrap: wrap;
  gap: 8px;
}
.forecast-chart-container {
  background: #ffffff;
  border: 1px solid #e3eef7;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.forecast-chart-container .chart-container {
  height: 140px;
}
.forecast-accuracy {
  padding-top: 8px;
  border-top: 1px dashed #e3eef7;
}</style>