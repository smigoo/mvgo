<template>
  <div class="environment-monitor-root" :style="panelBackgroundStyle">
    <EnvironmentHeaderSection
      class="environment-monitor-section environment-monitor-section--header"
      :title="headerSlots[0].text"
      :decor-icon="titleDecorIcon"
    />
    <SlotControlSection
      class="environment-monitor-section environment-monitor-section--tabs"
      :title="headerSlots[1].text"
      :tabs="monitorTabs"
      :active-tab="activeTab"
      :tabs-bg="tabsBackground"
      :active-bg="activeTabBackground"
      :tabs-icon="tabsControlIcon"
      :badge-count="warningCount"
      @change="handleTabChange"
    />
    <EnvironmentLineChartSection
      class="environment-monitor-section environment-monitor-section--chart"
      :title="headerSlots[2].text"
      :active-tab="activeTab"
      :x-axis-data="xAxisData"
      :chart-data="chartData"
      :warning-line="warningLine"
      :legend-name="legendName"
    />
  </div>
</template>

<script setup>
const icon1 = new URL('../resources/images/g-7883.png', import.meta.url).href
const bg1 = new URL('../resources/images/bg-7880.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-7890.png', import.meta.url).href
const bgtabActive = new URL('../resources/images/bg-tab-active-7891.png', import.meta.url).href
const icontabsIcon = new URL('../resources/images/tabs-icon-43.png', import.meta.url).href
import { computed, ref} from 'vue'
import EnvironmentHeaderSection from './components/EnvironmentHeaderSection.vue'
import SlotControlSection from './components/SlotControlSection.vue'
import EnvironmentLineChartSection from './components/EnvironmentLineChartSection.vue'

// 本组件负责组织环境监测面板的三段式结构：标题栏、指标切换区、折线图区域。
// 图片变量由平台资源注入，业务数据全部使用 ref，便于后续 API 绑定系统覆盖。

// #region 1. Props定义
const props = defineProps({
  isVisible: { type: Boolean, default: true },
  panelData: { type: Object, default: () => ({}) },
  chartOptions: { type: Object, default: () => ({}) }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['change', 'update:activeTab'])
// #endregion

// #region 3. 响应式状态
const headerSlots = ref([
  { type: 'title', text: 'cp-环境监测', sectionId: 'figma-1' },
  { type: 'title', text: 'slot-con', sectionId: 'figma-2' },
  { type: 'title', text: '@echarts/line', sectionId: 'figma-3' }
])

const monitorTabs = ref(['一氧化碳', '洞内照明', '洞外光强', '能见度'])
const activeTab = ref('一氧化碳')
const warningCount = ref(6)
const legendName = ref('zk3+785CO浓度')
const warningLine = ref(40)
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
const chartData = ref([18, 22, 20, 26, 31, 28, 24, 29, 35, 32, 30, 34])

// 资源变量由平台按 SFC 深度自动注入，禁止在此处手写 import。
const titleDecorIcon = ref(icon1)
const tabsControlIcon = ref(icontabsIcon)
const panelBackground = ref(bg1)
const tabsBackground = ref(bg2)
const activeTabBackground = ref(bgtabActive)
// #endregion

// #region 4. 计算属性
const panelBackgroundStyle = computed(() => ({
  backgroundImage: `url(${panelBackground.value})`
}))
// #endregion

// #region 5. 方法
const handleTabChange = (tabName) => {
  // 切换监测指标时同步通知外部，并保留内部高亮状态，便于图表子组件刷新。
  activeTab.value = tabName
  emit('update:activeTab', tabName)
  emit('change', { activeTab: tabName })
}
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
  /* 根面板背景来自 Figma bg 节点，颜色和阴影直接落地，不通过主题变量兜底。 */
  background-color: #edf4fb;
  background-size: 100% 100%;
  background-position: 0 0;
  background-repeat: no-repeat;
  box-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  color: #333333;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', 'PingFang SC', Arial, sans-serif;
}

.environment-monitor-section {
  min-width: 0;
  box-sizing: border-box;
}

.environment-monitor-section--header {
  flex: 0 0 auto;
}

.environment-monitor-section--tabs {
  flex: 0 0 auto;
}

.environment-monitor-section--chart {
  flex: 1;
  min-height: 0;
}</style>