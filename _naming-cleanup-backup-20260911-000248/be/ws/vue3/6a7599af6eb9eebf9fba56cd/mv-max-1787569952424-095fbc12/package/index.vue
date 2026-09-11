<template>
  <div class="traffic-monitor-root">
    <!-- 顶部标题栏：流量监测标题 + 装饰图标 + 实时更新状态 -->
    <SectionHeader />

    <!-- 当日总流量统计：隧道/大桥双卡 -->
    <SectionDailyTotal />

    <!-- 小时流量柱状图：隧道/大桥双图 -->
    <SectionHourlyCharts />

    <!-- 车型分布：隧道/大桥双卡片 -->
    <SectionVehicleType />

    <!-- 流量预测：位置切换 Tab + 节假日预测链接 + 面积折线图 -->
    <SectionForecast />
  </div>
</template>

<script setup>
/**
 * 流量监测主组件
 * 职责：作为面板根容器，整合头部、当日总流量、小时流量图表、车型分布、流量预测五大业务区块。
 * 状态管理：集中管理跨区块的交互状态（如时间筛选、预测地点Tab切换），并向下分发或响应事件。
 */
import { ref, onMounted, onUnmounted } from 'vue'

// 导入五大业务子组件
import SectionHeader from './components/SectionHeader.vue'
import SectionDailyTotal from './components/SectionDailyTotal.vue'
import SectionHourlyCharts from './components/SectionHourlyCharts.vue'
import SectionVehicleType from './components/SectionVehicleType.vue'
import SectionForecast from './components/SectionForecast.vue'

// #region 1. 响应式状态（交互数据槽位）
// 当日总流量 - 时间范围筛选（默认24小时，遵循规范不臆造其他不可见选项）
const timeRange = ref('24小时')
const timeOptions = ref(['24小时'])

// 流量预测 - 地点切换Tab（默认选中索引0：江阴靖江长江隧道）
const forecastTabs = ref(['江阴靖江长江隧道', '江阴大桥'])
const activeForecastIndex = ref(0)
// #endregion

// #region 2. 交互事件处理
// 处理时间范围下拉选择变更
const handleTimeRangeChange = (value) => {
  timeRange.value = value
  // 联动刷新当日总流量及小时图表数据
}

// 处理流量预测地点Tab切换
const handleForecastTabChange = (index) => {
  activeForecastIndex.value = index
  // 联动刷新流量预测图表数据
}

// 处理节假日预测链接点击
const handleHolidayClick = () => {
  console.log('[TrafficMonitor] 点击节假日预测，跳转至详情页')
  // 实际业务中执行路由跳转或 emit 事件
}
// #endregion

// #region 3. 生命周期
onMounted(() => {
  console.log('[TrafficMonitor] 流量监测面板已挂载')
})

onUnmounted(() => {
  console.log('[TrafficMonitor] 流量监测面板已卸载，清理全局资源')
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

/* 面板根容器：精确还原 Figma 背景色、阴影及 flex 纵向布局 */
.traffic-monitor-root {
  width: 100%;
  height: 100%;
  background: #edf4fbb2;
  box-shadow: 0 4px 10px 0 rgba(74, 117, 141, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}</style>