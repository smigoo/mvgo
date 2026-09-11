<template>
  <div
    class="environment-monitor-root"
    :style="{ backgroundImage: `url(${bg1})` }"
  >
    <EnvironmentHeader
      class="environment-monitor-section environment-monitor-section--header"
      title="cp-环境监测"
      display-title="环境监测"
      :decor-icon="icon1"
    />

    <MonitorTabs
      class="environment-monitor-section environment-monitor-section--tabs"
      title="slot-con"
      :tabs="monitorTabs"
      :active-index="activeTabIndex"
      :tab-background-image="bg2"
      :active-background-image="bgtabActive"
      :tabs-icon="icontabsIcon"
      :warning-count="warningCount"
      @change="handleTabChange"
    />

    <EnvironmentLineChart
      class="environment-monitor-section environment-monitor-section--chart"
      title="@echarts/line"
      :active-tab="activeTabName"
      :x-axis-data="chartXAxisData"
      :series-data="chartSeriesData"
      :warning-line="warningLine"
      unit="辆"
      legend-name="zk3+785CO浓度"
    />
  </div>
</template>

<script setup>
const bg1 = new URL('../resources/images/bg-7880.png', import.meta.url).href
const icon1 = new URL('../resources/images/g-7883.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-7890.png', import.meta.url).href
const bgtabActive = new URL('../resources/images/bg-tab-active-7891.png', import.meta.url).href
const icontabsIcon = new URL('../resources/images/tabs-icon-43.png', import.meta.url).href
import { computed, ref, watch} from 'vue'
import EnvironmentHeader from './components/EnvironmentHeader.vue'
import MonitorTabs from './components/MonitorTabs.vue'
import EnvironmentLineChart from './components/EnvironmentLineChart.vue'

// 本组件用于还原 Figma 中的“环境监测”面板：根背景、标题栏、Tab 控件与折线图分区均由真实 DOM/CSS 渲染。
// 图片变量由平台注入，因此这里只消费 bg1/bg2/bgtabActive/icon1/icontabsIcon，不手写本地资源 import。

// #region 1. Props定义
const props = defineProps({
  isVisible: { type: Boolean, default: true },
  panelData: { type: Object, default: () => ({}) },
  defaultActiveTab: { type: Number, default: 0 }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['change', 'update:activeTab'])
// #endregion

// #region 3. 响应式状态
// Tab、图表与告警数量未来都可能由接口替换，必须使用 ref 以兼容 API 绑定系统。
const monitorTabs = ref(['一氧化碳', '洞内照明', '洞外光强', '能见度'])
const activeTabIndex = ref(props.defaultActiveTab)
const warningCount = ref(6)
const warningLine = ref(30)
const chartXAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
const chartSeriesMap = ref({
  一氧化碳: [12, 16, 22, 18, 28, 35, 31, 24, 29, 27, 33, 30],
  洞内照明: [18, 20, 19, 24, 26, 22, 25, 28, 24, 21, 23, 25],
  洞外光强: [8, 12, 18, 25, 34, 38, 36, 30, 22, 16, 10, 7],
  能见度: [35, 34, 32, 33, 30, 28, 31, 29, 27, 30, 32, 34]
})
const chartSeriesData = ref(chartSeriesMap.value[monitorTabs.value[activeTabIndex.value]] || [])
// #endregion

// #region 4. 计算属性
const activeTabName = computed(() => monitorTabs.value[activeTabIndex.value] || monitorTabs.value[0])
// #endregion

// #region 5. 方法
const handleTabChange = (nextIndex) => {
  // Tab 切换后同步更新图表数据，避免图表与当前指标名称不一致。
  activeTabIndex.value = nextIndex
  chartSeriesData.value = chartSeriesMap.value[activeTabName.value] || []
  emit('update:activeTab', nextIndex)
  emit('change', { index: nextIndex, name: activeTabName.value })
}
// #endregion

// #region 6. 生命周期与监听
watch(
  () => props.defaultActiveTab,
  (nextIndex) => {
    // 外部重置默认 Tab 时联动刷新当前折线数据。
    if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < monitorTabs.value.length) {
      handleTabChange(nextIndex)
    }
  }
)
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.environment-monitor-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  /* 根面板可见背景来自 Figma bg 节点，必须直接写字面量并通过变量叠加原始背景图。 */
  background-color: #edf4fb;
  background-size: 100% 100%;
  background-position: 0 0;
  background-repeat: no-repeat;
  box-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  font-family: 'Source Han Sans CN', 'Noto Sans SC', Arial, sans-serif;
}

.environment-monitor-section {
  box-sizing: border-box;
  min-width: 0;
}

.environment-monitor-section--header {
  flex: 0 0 33px;
  margin: 0 20px 0 23px;
}

.environment-monitor-section--tabs {
  flex: 0 0 32px;
  margin: 0 20px;
}

.environment-monitor-section--chart {
  flex: 1;
  min-height: 0;
  margin: 0 20px 8px;
}</style>