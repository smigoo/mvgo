<template>
  <div class="environment-monitoring-root">
      <div ref="chartRef" class="c-mc-chart-chart-canvas" style="width:100%;height:160px;flex:1;min-height:160px;"></div>
    <!-- 面板头部 -->
    <PanelHeader />
    
    <!-- 右上角操作区 -->
    <HeaderRightSlot />
    
    <!-- Tab切换栏 -->
<TabsSection :active-tab="activeTab" @tab-change="handleTabChange" />
    
    <!-- 图表区域 -->
<ChartSection :chart-data="chartData" :active-tab="activeTab" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import PanelHeader from './components/PanelHeader.vue'
import HeaderRightSlot from './components/HeaderRightSlot.vue'
import TabsSection from './components/TabsSection.vue'
import ChartSection from './components/ChartSection.vue'

// #region 响应式状态
// 当前激活的tab索引（0: 一氧化碳, 1: 能见度, 2: 洞内照明, 3: 洞外光强）
const activeTab = ref(0)

// 图表数据（24小时趋势数据）
const chartData = ref([ { hour: 2, value: 15 }, { hour: 4, value: 18 }, { hour: 6, value: 22 }, { hour: 8, value: 25 }, { hour: 10, value: 28 }, { hour: 12, value: 32 }, { hour: 14, value: 35 }, { hour: 16, value: 30 }, { hour: 18, value: 26 }, { hour: 20, value: 20 }, { hour: 22, value: 16 }, { hour: 24, value: 14 }
])
// #endregion

// #region 方法
// 处理Tab切换事件
const handleTabChange = (index) => { activeTab.value = index
  // TODO: 切换tab时，根据不同监测指标加载对应数据
  console.log(`切换到tab ${index}`)
}
// #endregion

// #region 监听
// 监听activeTab变化，刷新图表数据
watch(activeTab, (newTab) => {
  // 模拟切换不同监测指标时的数据变化
  // 实际使用时应该调用API获取对应指标的数据
  console.log(`Tab切换到: ${newTab}`)
})
// #endregionimport * as echarts from 'echarts'
import { onMounted, onUnmounted, nextTick } from 'vue'
const chartRef = ref(null); let chart = null
const getOption = () => ({
  grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },
  xAxis: { type: 'category', data: ['2','4','6','8','10','12','14','16','18','20','22','24'] },
  yAxis: { type: 'value' },
  series: [{ name: "氧化碳浓度", type: 'area', data: [] }]
})
onMounted(() => { nextTick(() => { if (chartRef.value) { chart = echarts.init(chartRef.value); chart.setOption(getOption()) } }) })
onUnmounted(() => { chart?.dispose() })

</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.environment-monitoring-root {
  /* 根容器填满父级 */
  width: 100%;
  height: 100%;
  
  /* Figma标注的背景色 - 浅蓝灰色 */
  background: #edf4fb;
  
  /* Figma标注的阴影效果 */
  box-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  
  /* 纵向弹性布局：头部固定 + 内容区自适应 */
  
  /* 内边距 */
  padding: 16px 20px;
  
  /* 字体 */
  font-family: 'Source Han Sans CN', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
</style>