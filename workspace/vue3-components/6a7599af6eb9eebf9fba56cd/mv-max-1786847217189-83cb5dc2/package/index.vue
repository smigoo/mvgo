<template>
  <div class="traffic-monitor-root">
    <header class="traffic-monitor-topbar">
      <div class="topbar-title-wrap">
        <img :src="icon1" alt="" class="topbar-dot" />
        <h1 class="topbar-title">流量监测</h1>
        <img :src="icon2" alt="" class="topbar-line" />
      </div>
      <div class="topbar-status">*数据实时更新</div>
    </header>

    <main class="traffic-monitor-content">
      <DailyTotalSection
        class="traffic-section traffic-section--daily"
        :time-options="timeOptions"
        :active-time="activeTime"
        :stat-list="dailyStats"
        :bar-chart-list="barChartList"
        :section-bg="bgm_2"
        :title-icon="icon3"
        @update:active-time="handleTimeChange"
      />

      <VehicleTypeSection
        class="traffic-section traffic-section--vehicle"
        :vehicle-list="vehicleTypeList"
        :tunnel-bg="bgm_3"
        :bridge-bg="bgm_4"
        :tunnel-title-bg="bg3"
        :bridge-title-bg="bg5"
        :title-icon="icon4"
      />

      <ForecastSection
        class="traffic-section traffic-section--forecast"
        :tabs="forecastTabs"
        :active-index="activeForecastIndex"
        :forecast-data="forecastData"
        :accuracy-list="accuracyList"
        :title-icon="icon5"
        @tab-change="handleForecastTabChange"
        @holiday-click="handleHolidayClick"
      />
    </main>
  </div>
</template>

<script setup>
const icon1 = new URL('../resources/images/g-3552.png', import.meta.url).href
const icon2 = new URL('../resources/images/Vector-3549.png', import.meta.url).href
const icon3 = new URL('../resources/images/icon-3561.png', import.meta.url).href
const bg3 = new URL('../resources/images/bg-3475.png', import.meta.url).href
const bg5 = new URL('../resources/images/bg-3525.png', import.meta.url).href
const icon4 = new URL('../resources/images/icon-3441.png', import.meta.url).href
const icon5 = new URL('../resources/images/icon-3573.png', import.meta.url).href
const bgm_2 = new URL('../resources/images/bg-_m-34.png', import.meta.url).href
const bgm_3 = new URL('../resources/images/bg-_m-36.png', import.meta.url).href
const bgm_4 = new URL('../resources/images/bg-_m-35.png', import.meta.url).href
import { ref} from 'vue'
import DailyTotalSection from './components/DailyTotalSection.vue'
import VehicleTypeSection from './components/VehicleTypeSection.vue'
import ForecastSection from './components/ForecastSection.vue'

// 流量监测主面板：负责还原 Figma 根背景、顶部标题栏和三个业务 section 的编排；图表与列表数据均使用 ref，便于后续 API 绑定系统注入真实数据。
const props = defineProps({
  isVisible: { type: Boolean, default: true },
  hasError: { type: Boolean, default: false },
  panelData: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['time-change', 'forecast-tab-change', 'holiday-click'])

// 下拉框当前仅从设计稿识别到“24小时”，不臆造其他选项。
const timeOptions = ref([
  { label: '24小时', value: '24小时' }
])
const activeTime = ref('24小时')

// 当日总流量数值严格按 Figma 文本逐字符还原，保留千分位逗号。
const dailyStats = ref([
  { id: 'tunnel', name: '江阴靖江长江隧道', value: '34,620', valueClass: 'metric-value-primary' },
  { id: 'bridge', name: '江阴大桥', value: '82,379', valueClass: 'metric-value-cyan' }
])

// 柱状图默认数据来自设计稿可见柱形比例与 tooltip 示例，后续可由 API 覆盖。
const barChartList = ref([
  {
    id: 'chart-tunnel-bar',
    title: '江阴靖江长江隧道',
    xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    beijingData: [420, 420, 420, 420, 760, 760, 760, 825, 760, 980, 560, 831],
    shanghaiData: [600, 600, 600, 600, 1100, 1100, 1100, 831, 1100, 1440, 840, 1260],
    threshold: 3000
  },
  {
    id: 'chart-bridge-bar',
    title: '江阴大桥',
    xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    beijingData: [420, 420, 420, 420, 760, 760, 760, 825, 760, 980, 560, 831],
    shanghaiData: [600, 600, 600, 600, 1100, 1100, 1100, 831, 1100, 1440, 840, 1260],
    threshold: 3000
  }
])

// 车型分布保持卡片横向结构：左侧客车、中心环形图、右侧货车。
const vehicleTypeList = ref([
  {
    id: 'vehicle-tunnel',
    title: '江阴靖江长江隧道',
    passengerLabel: '客车',
    passengerValue: '22350',
    truckLabel: '货车',
    truckValue: '16270',
    passengerData: 22350,
    truckData: 16270
  },
  {
    id: 'vehicle-bridge',
    title: '江阴大桥',
    passengerLabel: '客车',
    passengerValue: '66109',
    truckLabel: '货车',
    truckValue: '16270',
    passengerData: 66109,
    truckData: 16270
  }
])

const forecastTabs = ref(['江阴靖江长江隧道', '江阴大桥'])
const activeForecastIndex = ref(0)

// 折线图数据按 Figma 可见时间点设置，并保留“准确率98%/96%/92%”文本。
const forecastData = ref({
  xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
  actual: [2600, 2300, 2800, null, null],
  predict: [null, null, 2800, 3100, 2600]
})
const accuracyList = ref(['准确率98%', '准确率96%', '准确率92%'])

const handleTimeChange = value => {
  // 透传下拉选择结果，后续宿主可在该事件中触发数据刷新。
  activeTime.value = value
  emit('time-change', value)
}

const handleForecastTabChange = index => {
  // Tab 切换只改变当前地点，不臆造额外刷新机制；由外层事件对接真实接口。
  activeForecastIndex.value = index
  emit('forecast-tab-change', { index, name: forecastTabs.value[index] })
}

const handleHolidayClick = () => {
  // Figma 仅展示“节假日预测>”入口，点击时对外抛出事件，不内置未知页面跳转。
  emit('holiday-click')
}
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* 根容器直接落地 Figma 浅灰蓝背景、阴影与圆角，不通过主题变量兜底，确保可见面板真实还原。 */
.traffic-monitor-root {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 20px 16px;
  box-sizing: border-box;
  overflow: hidden;
  background: #edf4fb;
  border-radius: 0;
  box-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  color: #333333;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', Arial, sans-serif;
}

.traffic-monitor-topbar {
  flex: 0 0 auto;
  height: 33px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 0 2px;
  min-width: 0;
}

.topbar-title-wrap {
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 7px;
}

.topbar-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  object-fit: contain;
}

.topbar-title {
  margin: 0;
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  letter-spacing: 0;
  color: #1990ff;
  background-image: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.topbar-line {
  width: 8px;
  height: 4px;
  flex-shrink: 0;
  object-fit: contain;
}

.topbar-status {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: right;
  white-space: nowrap;
  color: #1990ff;
  background-image: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.traffic-monitor-content {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.traffic-section {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.traffic-section--daily {
  flex: 1 1 556px;
  min-height: 0;
}

.traffic-section--vehicle {
  flex: 0 0 142px;
}

.traffic-section--forecast {
  flex: 0 0 174px;
  min-height: 0;
}</style>