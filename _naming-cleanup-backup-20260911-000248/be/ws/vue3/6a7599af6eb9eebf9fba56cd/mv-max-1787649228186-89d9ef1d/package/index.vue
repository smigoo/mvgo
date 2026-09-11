<template>
  <div class="traffic-monitor-root">
    <!-- 顶部标题区 -->
    <SectionHeader />
    
    <!-- 内容区域：纵向堆叠各模块 -->
    <div class="traffic-monitor-content">
      <!-- 当日总流量 -->
      <SectionDailyTotal />
      
      <!-- 江阴靖江长江隧道小时流量 -->
      <SectionHourlyTunnel />
      
      <!-- 江阴大桥小时流量 -->
      <SectionHourlyBridge />
      
      <!-- 车型分布 -->
      <SectionVehicleType />
      
      <!-- 流量预测 -->
      <SectionForecast />
    </div>
  </div>
</template>

<script setup>
/**
 * 流量监测面板 - 主组件
 * 功能：展示交通流量监测数据，包含当日总流量、小时流量趋势、车型分布、流量预测
 * 数据来源：API 接口注入（通过 ref 变量绑定）
 * 交互：Tab 切换、下拉选择、链接跳转
 */
import { ref, onMounted, onUnmounted } from 'vue'
import SectionHeader from './components/SectionHeader.vue'
import SectionDailyTotal from './components/SectionDailyTotal.vue'
import SectionHourlyTunnel from './components/SectionHourlyTunnel.vue'
import SectionHourlyBridge from './components/SectionHourlyBridge.vue'
import SectionVehicleType from './components/SectionVehicleType.vue'
import SectionForecast from './components/SectionForecast.vue'

// #region 响应式状态 - 数据槽位（供 API 绑定）
// 当日总流量数据
const tunnelTotal = ref('34,620')
const bridgeTotal = ref('82,379')

// 时间选择器
const selectedTimeRange = ref('24小时')
const timeRangeOptions = ref(['24小时'])

// 流量预测 Tab 切换
const forecastActiveTab = ref('江阴靖江长江隧道')
const forecastTabs = ref(['江阴靖江长江隧道', '江阴大桥'])

// 隧道小时流量图表数据
const tunnelHourlyData = ref({
  xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [600, 400, 200, 600, 800, 1200, 1800, 2400, 3200, 2800, 1600, 800],
  shanghai: [400, 300, 150, 500, 700, 1000, 1500, 2000, 2800, 2400, 1400, 600]
})

// 大桥小时流量图表数据
const bridgeHourlyData = ref({
  xAxis: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  beijing: [800, 600, 300, 900, 1200, 1800, 2400, 3000, 3600, 3200, 2000, 1000],
  shanghai: [600, 450, 200, 700, 1000, 1500, 2000, 2600, 3200, 2800, 1800, 800]
})

// 车型分布数据
const vehicleTypeData = ref({
  tunnel: { car: 22350, truck: 16270 },
  bridge: { car: 66109, truck: 16270 }
})

// 流量预测图表数据
const forecastChartData = ref({
  xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
  actual: [1200, 1800, 2400, null, null],
  predicted: [null, null, 2400, 2800, 3200],
  accuracy: ['98%', '96%', '92%']
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器：浅灰蓝背景 + 阴影，完全盛满预览区
.traffic-monitor-root {
  width: 426px;
  height: 807px;
  background: #edf4fbb2;
  box-shadow: 0 4px 10px 0 rgba(74, 117, 141, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
  max-width: 100%;
  max-height: 100vh;
}

// 内容区域：纵向堆叠，自适应填充
.traffic-monitor-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 20px 16px 20px;
  overflow-y: auto;
}</style>