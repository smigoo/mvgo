<template>
  <div class="vehicle-type-section">
    <!-- 标题区 -->
    <div class="vehicle-type-header">
      <img :src="icon6" class="header-icon" alt="" />
      <span class="header-title">车型分布</span>
    </div>

    <!-- 内容区：两列卡片 -->
    <div class="vehicle-type-content">
      <!-- 江阴靖江长江隧道 车型分布卡片 -->
      <div class="vehicle-card" :style="cardBgStyleTunnel">
        <div class="card-header">
          <div class="card-title-bar" :style="titleBarStyleTunnel"></div>
          <span class="card-title">江阴靖江长江隧道</span>
        </div>
        <div class="card-body">
          <div class="card-pie" ref="tunnelPieRef"></div>
          <div class="stat-list">
            <div class="stat-item">
              <span class="stat-label">客车</span>
              <span class="stat-value stat-value--bus">{{ tunnelData.bus }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">货车</span>
              <span class="stat-value stat-value--truck">{{ tunnelData.truck }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 江阴大桥 车型分布卡片 -->
      <div class="vehicle-card" :style="cardBgStyleBridge">
        <div class="card-header">
          <div class="card-title-bar" :style="titleBarStyleBridge"></div>
          <span class="card-title">江阴大桥</span>
        </div>
        <div class="card-body">
          <div class="card-pie" ref="bridgePieRef"></div>
          <div class="stat-list">
            <div class="stat-item">
              <span class="stat-label">客车</span>
              <span class="stat-value stat-value--bus">{{ bridgeData.bus }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">货车</span>
              <span class="stat-value stat-value--truck">{{ bridgeData.truck }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon6 from '../../resources/images/icon-3441.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg3 from '../../resources/images/bg-3475.png'
import bg4 from '../../resources/images/bg-_m-35.png'
import bg5 from '../../resources/images/bg-3525.png'

/**
 * 车型分布子组件
 * 功能：展示江阴靖江长江隧道和江阴大桥的客车/货车流量分布
 * 数据来源：API 接口注入（通过 ref 变量绑定）
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import * as echarts from 'echarts'

// #region 图片资源变量（系统自动注入，禁止手写 import）
// icon6: 车型分布标题图标 (18×18px)
// bg2: 隧道卡片背景图 (191×80px)
// bg3: 隧道标题装饰条 (130×9px)
// bg4: 大桥卡片背景图 (191×81px)
// bg5: 大桥标题装饰条 (130×9px)
const props = defineProps({
  icon6: { type: String, default: '' },
  bg2: { type: String, default: '' },
  bg3: { type: String, default: '' },
  bg4: { type: String, default: '' },
  bg5: { type: String, default: '' }
})
// #endregion

// #region 响应式数据（API 绑定槽位）
// 隧道车型数据
const tunnelData = ref({
  bus: '22350',
  truck: '16270'
})

// 大桥车型数据
const bridgeData = ref({
  bus: '66109',
  truck: '16270'
})
// #endregion

// #region 背景图样式计算（使用 :style 绑定，禁止 CSS background 字面量）
// 隧道卡片背景（优先用宿主注入的 props.bg2，缺省回退到本地导入图，保证预览可见）
const cardBgStyleTunnel = computed(() => ({
  backgroundImage: `url(${props.bg2 || bg2})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
}))

// 大桥卡片背景
const cardBgStyleBridge = computed(() => ({
  backgroundImage: `url(${props.bg4 || bg4})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
}))

// 隧道标题装饰条
const titleBarStyleTunnel = computed(() => ({
  backgroundImage: `url(${props.bg3 || bg3})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
}))

// 大桥标题装饰条
const titleBarStyleBridge = computed(() => ({
  backgroundImage: `url(${props.bg5 || bg5})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
}))
// #endregion

// #region 环形图：车型分布客车/货车占比可视化
const tunnelPieRef = ref(null)
const bridgePieRef = ref(null)
let tunnelChart = null
let bridgeChart = null

function buildPieOption(data) {
  const bus = Number(data.bus) || 0
  const truck = Number(data.truck) || 0
  return {
    tooltip: { show: false },
    series: [{
      type: 'pie',
      radius: ['52%', '78%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderColor: 'transparent', borderWidth: 0 },
      data: [
        { value: bus, name: '客车', itemStyle: { color: '#1990ff' } },
        { value: truck, name: '货车', itemStyle: { color: '#fa8c16' } }
      ]
    }]
  }
}

function renderPie(refEl, chartRef, data) {
  if (!refEl) return chartRef
  if (!chartRef) chartRef = echarts.init(refEl)
  chartRef.setOption(buildPieOption(data))
  return chartRef
}

function resizeCharts() {
  tunnelChart && tunnelChart.resize()
  bridgeChart && bridgeChart.resize()
}

onMounted(() => {
  tunnelChart = renderPie(tunnelPieRef.value, tunnelChart, tunnelData.value)
  bridgeChart = renderPie(bridgePieRef.value, bridgeChart, bridgeData.value)
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  tunnelChart && tunnelChart.dispose()
  bridgeChart && bridgeChart.dispose()
})

watch([tunnelData, bridgeData], () => {
  tunnelChart = renderPie(tunnelPieRef.value, tunnelChart, tunnelData.value)
  bridgeChart = renderPie(bridgePieRef.value, bridgeChart, bridgeData.value)
}, { deep: true })
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 车型分布区块根容器 */
.vehicle-type-section {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-bottom: 12px;
}

/* 标题区 */
.vehicle-type-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding-left: 2px;
}

/* 标题图标 */
.header-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
}

/* 标题文字 */
.header-title {
  font-size: 14px;
  font-weight: 400;
  color: #333333;
  line-height: 21px;
}

/* 内容区：两列卡片布局 */
.vehicle-type-content {
  display: flex;
  flex-direction: row;
  gap: 12px;
  width: 100%;
}

/* 车型卡片 */
.vehicle-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 80px;
  padding: 10px 12px;
  position: relative;
  overflow: hidden;
  border-radius: 4px;
}

/* 卡片头部 */
.card-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

/* 标题装饰条 */
.card-title-bar {
  width: 3px;
  height: 12px;
  border-radius: 6px;
  flex-shrink: 0;
}

/* 卡片标题文字 */
.card-title {
  font-size: 12px;
  font-weight: 400;
  color: #333333;
  line-height: 18px;
}

/* 卡片内容区 */
.card-body {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex: 1;
}

/* 车型分布环形图 */
.card-pie {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}

/* 数值列表（环形图右侧） */
.stat-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 统计项 */
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* 统计标签 */
.stat-label {
  font-size: 12px;
  font-weight: 400;
  color: #666666;
  line-height: 18px;
}

/* 统计数值 - 客车（蓝色） */
.stat-value--bus {
  font-size: 20px;
  font-weight: 700;
  color: #1990ff;
  line-height: 28px;
  font-family: 'Roboto', sans-serif;
}

/* 统计数值 - 货车（橙色） */
.stat-value--truck {
  font-size: 20px;
  font-weight: 700;
  color: #fa8c16;
  line-height: 28px;
  font-family: 'Roboto', sans-serif;
}
</style>