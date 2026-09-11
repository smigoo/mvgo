<template>
  <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-section">
    <!-- 标题行：菱形图标 + 车型分布 -->
    <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-header">
      <img :src="diamondIcon" class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-header-icon" alt="车型分布" />
      <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-header-title">车型分布</span>
    </div>

    <!-- 双卡片：隧道 / 大桥 -->
    <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-cards">
      <!-- 江阴靖江长江隧道车型 -->
      <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-card">
        <div
          class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-card-body"
          :style="{ backgroundImage: `url(${tunnelBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-group">
            <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-value--passenger">22350</span>
          </div>

          <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-gauge" ref="tunnelGaugeRef"></div>

          <div class="c-monitor-vehicle-stat-group c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-group--align-end" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '426px 91px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
            <span class="c-monitor-vehicle-stat-label c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-label--right">货车</span>
            <span class="c-monitor-vehicle-stat-value c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-value--truck">16270</span>
          </div>
        </div>
        <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-card-title">江阴靖江长江隧道</div>
      </div>

      <!-- 江阴大桥车型 -->
      <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-card">
        <div
          class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-card-body"
          :style="{ backgroundImage: `url(${bridgeBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-group">
            <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-label">客车</span>
            <span class="c-monitor-vehicle-stat-value c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-value--passenger">66109</span>
          </div>

          <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-gauge" ref="bridgeGaugeRef"></div>

          <div class="c-monitor-vehicle-stat-group c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-group--align-end">
            <span class="c-monitor-vehicle-stat-label c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-label--right">货车</span>
            <span class="c-monitor-vehicle-stat-value c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-stat-value--truck">16270</span>
          </div>
        </div>
        <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-vehicle-card-title">江阴大桥</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'
import icon6 from '../../resources/images/icon-3441.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'
import * as echarts from 'echarts'

// ==================== Props ====================

const props = defineProps({
  /** 隧道卡片背景图（bg2，191×80 科技感卡片背景） */
  tunnelBg: { type: String, required: true },
  /** 大桥卡片背景图（bg4，191×81 科技感卡片背景） */
  bridgeBg: { type: String, required: true },
  /** 标题菱形图标（icon6，18×18） */
  diamondIcon: { type: String, required: true }
})

// ==================== 车型分布数据 ====================

/** 江阴靖江长江隧道：客车 22350 / 货车 16270 */
const TUNNEL_PASSENGER = 22350
const TUNNEL_TRUCK = 16270

/** 江阴大桥：客车 66109 / 货车 16270 */
const BRIDGE_PASSENGER = 66109
const BRIDGE_TRUCK = 16270

// ==================== 环形图初始化 ====================

const tunnelGaugeRef = ref(null)
const bridgeGaugeRef = ref(null)

let tunnelChart = null
let bridgeChart = null
let tunnelObserver = null
let bridgeObserver = null

/**
 * 生成环形图 ECharts 配置
 * 设计稿：客车扇区 #2ba0ff、货车扇区 #ffa22f，内环 55% / 外环 75%
 */
const getGaugeOption = (passenger, truck) => ({
  tooltip: {
    trigger: 'item',
    formatter: (params) => `${params.name}: ${params.value} 辆`
  },
  series: [
    {
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '50%'],
      label: { show: false },
      labelLine: { show: false },
      emphasis: { label: { show: false } },
      data: [
        { name: '客车', value: passenger, itemStyle: { color: '#2ba0ff' } },
        { name: '货车', value: truck, itemStyle: { color: '#ffa22f' } }
      ]
    }
  ]
})

/** 容器就绪时创建 ECharts 实例，否则返回 null（由 ResizeObserver 兜底等待） */
const initGaugeChart = (el, option) => {
  if (!el) return null
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    const chart = echarts.init(el)
    chart.setOption(option)
    return chart
  }
  return null
}

/** 隧道环形图 */
const initTunnelChart = () => {
  if (!tunnelGaugeRef.value || tunnelChart) return
  tunnelChart = initGaugeChart(tunnelGaugeRef.value, getGaugeOption(TUNNEL_PASSENGER, TUNNEL_TRUCK))
  if (!tunnelChart) {
    tunnelObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0 && !tunnelChart) {
        tunnelObserver?.disconnect()
        tunnelChart = initGaugeChart(tunnelGaugeRef.value, getGaugeOption(TUNNEL_PASSENGER, TUNNEL_TRUCK))
      }
    })
    tunnelObserver.observe(tunnelGaugeRef.value)
  }
}

/** 大桥环形图 */
const initBridgeChart = () => {
  if (!bridgeGaugeRef.value || bridgeChart) return
  bridgeChart = initGaugeChart(bridgeGaugeRef.value, getGaugeOption(BRIDGE_PASSENGER, BRIDGE_TRUCK))
  if (!bridgeChart) {
    bridgeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0 && !bridgeChart) {
        bridgeObserver?.disconnect()
        bridgeChart = initGaugeChart(bridgeGaugeRef.value, getGaugeOption(BRIDGE_PASSENGER, BRIDGE_TRUCK))
      }
    })
    bridgeObserver.observe(bridgeGaugeRef.value)
  }
}

/** base-panel 渲染过程中可能销毁并重建 slot DOM，通过 watch 等待 ref 就绪 */
watch(tunnelGaugeRef, (newRef) => {
  if (newRef && !tunnelChart) initTunnelChart()
})
watch(bridgeGaugeRef, (newRef) => {
  if (newRef && !bridgeChart) initBridgeChart()
})

/** 窗口尺寸变化时同步 resize */
const handleResize = () => {
  if (tunnelChart && !tunnelChart.isDisposed()) tunnelChart.resize()
  if (bridgeChart && !bridgeChart.isDisposed()) bridgeChart.resize()
}

onMounted(() => {
  initTunnelChart()
  initBridgeChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  tunnelChart?.dispose()
  bridgeChart?.dispose()
  tunnelObserver?.disconnect()
  bridgeObserver?.disconnect()
  tunnelChart = null
  bridgeChart = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// ==================== 车型分布区块 ====================

.c-monitor-vehicle-section {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

// 标题行

.c-monitor-vehicle-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding-left: 2px;
}

.c-monitor-vehicle-header-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-vehicle-header-title {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
}

// 双卡片容器

.c-monitor-vehicle-cards {
  display: flex;
  gap: 8px;
  flex: 1;
  min-height: 0;
  margin-top: 4px;
}

// 单卡片：纵向 = 主体（背景图 + 统计 + 环形图） + 底部标题

.c-monitor-vehicle-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

// 卡片主体：横向 = 客车组 + 环形图 + 货车组

.c-monitor-vehicle-card-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-height: 56px;
  padding: 6px 10px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

// 统计组（客车 / 货车）

.c-monitor-vehicle-stat-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.c-monitor-vehicle-stat-group--align-end {
  align-items: flex-end;
}

.c-monitor-vehicle-stat-label {
  font-size: 12px;
  line-height: 18px;
  color: #333333;
  white-space: nowrap;
}

.c-monitor-vehicle-stat-label--right {
  text-align: right;
}

.c-monitor-vehicle-stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 22px;
  white-space: nowrap;
}

.c-monitor-vehicle-stat-value--passenger {
  color: #1399ff;
}

.c-monitor-vehicle-stat-value--truck {
  color: #ff6a00;
}

// 环形图容器（Figma 尺寸 52×52）

.c-monitor-vehicle-gauge {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  min-width: 0;
  min-height: 0;
}

// 卡片底部标题

.c-monitor-vehicle-card-title {
  flex-shrink: 0;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  padding-top: 2px;
}
</style>