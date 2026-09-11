<template>
  <div class="c-monitor-vehicle-distribution">
    <!-- Section Header -->
    <div class="c-monitor-section-header">
      <img :src="icon2" class="c-monitor-section-icon" alt="车型分布图标" />
      <span class="c-monitor-section-title">车型分布</span>
    </div>

    <!-- Body: horizontal 2 columns -->
    <div class="c-monitor-vehicle-body">
      <!-- 江阴靖江长江隧道车型卡片 -->
      <div 
        class="c-monitor-vehicle-card" 
        :style="{ 
          backgroundImage: `url(${bg2})`, 
          backgroundSize: '100% auto', 
          backgroundPosition: 'center top', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div class="c-monitor-vehicle-label">江阴靖江长江隧道</div>
        <div ref="tunnelChartRef" class="c-monitor-vehicle-chart"></div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-stat-dot-car"></span>
            <span class="c-monitor-stat-name">客车</span>
            <span class="c-monitor-stat-value c-monitor-stat-value-car">22350</span>
          </div>
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-stat-dot-truck"></span>
            <span class="c-monitor-stat-name">货车</span>
            <span class="c-monitor-stat-value c-monitor-stat-value-truck">16270</span>
          </div>
        </div>
      </div>

      <!-- 江阴大桥车型卡片 -->
      <div 
        class="c-monitor-vehicle-card" 
        :style="{ 
          backgroundImage: `url(${bg4})`, 
          backgroundSize: '100% auto', 
          backgroundPosition: 'center top', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div class="c-monitor-vehicle-label">江阴大桥</div>
        <div ref="bridgeChartRef" class="c-monitor-vehicle-chart"></div>
        <div class="c-monitor-vehicle-stats">
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-stat-dot-car"></span>
            <span class="c-monitor-stat-name">客车</span>
            <span class="c-monitor-stat-value c-monitor-stat-value-car">66109</span>
          </div>
          <div class="c-monitor-stat-item">
            <span class="c-monitor-stat-dot c-monitor-stat-dot-truck"></span>
            <span class="c-monitor-stat-name">货车</span>
            <span class="c-monitor-stat-value c-monitor-stat-value-truck">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// 图表容器引用
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)

// 图表实例
let tunnelChart = null
let bridgeChart = null
let chartObserver = null

// 隧道车型数据（来自 Figma 设计稿精确值）
const tunnelVehicleData = [
  { name: '客车', value: 22350, itemStyle: { color: 'rgba(25,144,255,1)' } },
  { name: '货车', value: 16270, itemStyle: { color: 'rgba(255,127,80,1)' } }
]

// 大桥车型数据（来自 Figma 设计稿精确值）
const bridgeVehicleData = [
  { name: '客车', value: 66109, itemStyle: { color: 'rgba(25,144,255,1)' } },
  { name: '货车', value: 16270, itemStyle: { color: 'rgba(255,127,80,1)' } }
]

/**
 * 创建圆环图配置
 * @param {Array} data - 饼图数据
 * @returns {Object} ECharts option
 */
const createPieOption = (data) => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(161,206,255,1)',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#333333', fontSize: 12 },
    formatter: (params) => `${params.name}：${params.value}辆（${params.percent}%）`
  },
  series: [
    {
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      emphasis: { scale: false },
      data
    }
  ]
})

/**
 * 初始化图表（使用 ResizeObserver 等待容器就绪）
 */
const initCharts = () => {
  // 初始化隧道图表
  if (!tunnelChart && tunnelChartRef.value) {
    const width = tunnelChartRef.value.clientWidth
    const height = tunnelChartRef.value.clientHeight
    if (width > 0 && height > 0) {
      tunnelChart = echarts.init(tunnelChartRef.value)
      tunnelChart.setOption(createPieOption(tunnelVehicleData), true)
    }
  }

  // 初始化大桥图表
  if (!bridgeChart && bridgeChartRef.value) {
    const width = bridgeChartRef.value.clientWidth
    const height = bridgeChartRef.value.clientHeight
    if (width > 0 && height > 0) {
      bridgeChart = echarts.init(bridgeChartRef.value)
      bridgeChart.setOption(createPieOption(bridgeVehicleData), true)
    }
  }

  // 若任意图表未初始化，设置 observer 等待容器尺寸变化
  if (!tunnelChart || !bridgeChart) {
    if (!chartObserver) {
      chartObserver = new ResizeObserver(() => {
        initCharts()
      })
      if (tunnelChartRef.value) chartObserver.observe(tunnelChartRef.value)
      if (bridgeChartRef.value) chartObserver.observe(bridgeChartRef.value)
    }
  } else if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }
}

// 监听 ref 变化（处理 base-panel 销毁重建 slot DOM 的场景）
watch([tunnelChartRef, bridgeChartRef], () => {
  if (tunnelChartRef.value && bridgeChartRef.value) {
    initCharts()
  }
})

// 窗口尺寸变化时调整图表
const handleResize = () => {
  if (tunnelChart) tunnelChart.resize()
  if (bridgeChart) bridgeChart.resize()
}

onMounted(() => {
  initCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (tunnelChart) {
    tunnelChart.dispose()
    tunnelChart = null
  }
  if (bridgeChart) {
    bridgeChart.dispose()
    bridgeChart = null
  }
  if (chartObserver) {
    chartObserver.disconnect()
    chartObserver = null
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-distribution {
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* === Section Header === */
.c-monitor-section-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 21px;
  margin-bottom: 8px;
}

.c-monitor-section-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-right: 4px;
}

.c-monitor-section-title {
  font-size: @fontSize; /* Figma: 14px */
  font-weight: 400;
  color: #333333;
  line-height: 21px;
  white-space: nowrap;
}

/* === Body: 两个卡片并排 === */
.c-monitor-vehicle-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 12px;
}

/* === 车型卡片 === */
.c-monitor-vehicle-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 12px;
  /* 背景图通过内联样式绑定：backgroundSize 100% auto / center top / no-repeat */
}

/* === 卡片标签 === */
.c-monitor-vehicle-label {
  flex-shrink: 0;
  font-size: @fontSize; /* Figma: 14px */
  font-weight: 400;
  color: #333333;
  line-height: 21px;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* === 图表容器 === */
.c-monitor-vehicle-chart {
  flex: 1;
  min-height: 80px;
  min-width: 0;
  width: 100%;
}

/* === 统计行 === */
.c-monitor-vehicle-stats {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 8px;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

/* === 统计圆点 === */
.c-monitor-stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.c-monitor-stat-dot-car {
  background: rgba(25, 144, 255, 1); /* Figma：客车蓝色 */
}

.c-monitor-stat-dot-truck {
  background: rgba(255, 127, 80, 1); /* Figma：货车橙色 */
}

/* === 统计名称 === */
.c-monitor-stat-name {
  font-size: calc(@fontSize * 12 / 14); /* Figma: 12px */
  font-weight: 400;
  color: #333333;
}

/* === 统计数值（区分颜色） === */
.c-monitor-stat-value {
  font-size: calc(@fontSize * 12 / 14); /* Figma: 12px */
  font-weight: 500;
}

.c-monitor-stat-value-car {
  color: rgba(25, 144, 255, 1); /* Figma：客车数值蓝色 */
}

.c-monitor-stat-value-truck {
  color: rgba(255, 127, 80, 1); /* Figma：货车数值橙色 */
}
</style>