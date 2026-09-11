<template>
  <div class="vehicle-type-section">
    <!-- 区块标题：图标 + 车型分布 -->
    <div class="section-title">
      <img :src="icon4" class="title-icon" alt="icon" />
      <span class="title-text">车型分布</span>
    </div>

    <!-- 双卡片容器：隧道与大桥 -->
    <div class="cards-container">
      <!-- 江阴靖江长江隧道卡片 -->
      <div class="vehicle-card" :style="{ backgroundImage: `url(${bg2})` }">
        <div class="card-title-bg" :style="{ backgroundImage: `url(${bg3})` }">
          <span class="card-title">江阴靖江长江隧道</span>
        </div>
        <div class="card-content">
          <div class="chart-wrapper">
            <div ref="tunnelChartRef" class="chart-container"></div>
          </div>
          <div class="data-list">
            <div class="data-item">
              <span class="data-label">客车</span>
              <span class="data-value data-value--bus">{{ tunnelData.bus }}</span>
            </div>
            <div class="data-item">
              <span class="data-label">货车</span>
              <span class="data-value data-value--truck">{{ tunnelData.truck }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 江阴大桥卡片 -->
      <div class="vehicle-card" :style="{ backgroundImage: `url(${bg4})` }">
        <div class="card-title-bg" :style="{ backgroundImage: `url(${bg5})` }">
          <span class="card-title">江阴大桥</span>
        </div>
        <div class="card-content">
          <div class="chart-wrapper">
            <div ref="bridgeChartRef" class="chart-container"></div>
          </div>
          <div class="data-list">
            <div class="data-item">
              <span class="data-label">客车</span>
              <span class="data-value data-value--bus">{{ bridgeData.bus }}</span>
            </div>
            <div class="data-item">
              <span class="data-label">货车</span>
              <span class="data-value data-value--truck">{{ bridgeData.truck }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const icon4 = new URL('../../resources/images/icon-3441.png', import.meta.url).href
const bg2 = new URL('../../resources/images/bg-_m-36.png', import.meta.url).href
const bg3 = new URL('../../resources/images/bg-3475.png', import.meta.url).href
const bg4 = new URL('../../resources/images/bg-_m-35.png', import.meta.url).href
const bg5 = new URL('../../resources/images/bg-3525.png', import.meta.url).href
/**
 * 车型分布子组件
 * 职责：展示隧道与大桥的客车/货车数量统计及占比环形图。
 * 数据来源：API 注入的 ref 变量，支持后续动态更新。
 */
import { ref, onMounted, onUnmounted, nextTick} from 'vue'
import * as echarts from 'echarts'

// #region 1. 响应式数据（API 绑定槽位）
const tunnelData = ref({ bus: 22350, truck: 16270 })
const bridgeData = ref({ bus: 66109, truck: 16270 })
// #endregion

// #region 2. 图表 DOM 引用
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)
// #endregion

// #region 3. 图表实例与监听器
let tunnelChartInstance = null
let bridgeChartInstance = null
let resizeObserver = null

// 初始化环形图配置
const initCharts = () => {
  // 隧道环形图
  if (tunnelChartRef.value) {
    tunnelChartInstance = echarts.init(tunnelChartRef.value)
    tunnelChartInstance.setOption({
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c}辆 ({d}%)'
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '75%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          data: [
            { value: tunnelData.value.bus, name: '客车', itemStyle: { color: '#2ba0ff' } },
            { value: tunnelData.value.truck, name: '货车', itemStyle: { color: '#ffa22f' } }
          ]
        }
      ]
    })
  }

  // 大桥环形图
  if (bridgeChartRef.value) {
    bridgeChartInstance = echarts.init(bridgeChartRef.value)
    bridgeChartInstance.setOption({
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c}辆 ({d}%)'
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '75%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          data: [
            { value: bridgeData.value.bus, name: '客车', itemStyle: { color: '#2ba0ff' } },
            { value: bridgeData.value.truck, name: '货车', itemStyle: { color: '#ffa22f' } }
          ]
        }
      ]
    })
  }
}
// #endregion

// #region 4. 生命周期
onMounted(async () => {
  // 等待 DOM 布局 settle 后再初始化图表，防止 flex 百分比高度未计算导致 canvas 尺寸异常
  await nextTick()
  requestAnimationFrame(() => {
    initCharts()
    
    // 挂载 ResizeObserver 监听容器尺寸变化，确保图表自适应
    resizeObserver = new ResizeObserver(() => {
      tunnelChartInstance?.resize()
      bridgeChartInstance?.resize()
    })
    if (tunnelChartRef.value) resizeObserver.observe(tunnelChartRef.value)
    if (bridgeChartRef.value) resizeObserver.observe(bridgeChartRef.value)
  })
})

onUnmounted(() => {
  // 清理监听器与图表实例，防止内存泄漏
  resizeObserver?.disconnect()
  tunnelChartInstance?.dispose()
  bridgeChartInstance?.dispose()
})
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.vehicle-type-section {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 12px;
}

/* 区块标题样式 */
.section-title {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  
  .title-icon {
    width: 18px;
    height: 18px;
    object-fit: contain;
    flex-shrink: 0;
  }
  
  .title-text {
    font-size: 16px;
    font-weight: 500;
    color: #333333;
    text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
  }
}

/* 双卡片横向排列容器 */
.cards-container {
  display: flex;
  flex-direction: row;
  gap: 12px;
  width: 100%;
}

/* 单个车型卡片 */
.vehicle-card {
  flex: 1;
  position: relative;
  // 背景图精确还原，禁止无脑 cover
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  padding: 24px 12px 12px;
  display: flex;
  flex-direction: column;
  min-height: 114px;
  box-sizing: border-box;
  min-height: 0;}

/* 卡片顶部标题背景装饰 */
.card-title-bg {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 130px;
  height: 25px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  
  .card-title {
    font-size: 14px;
    font-weight: 500;
    color: #333333;
  }
}

/* 卡片内容区：图表与数据并排 */
.card-content {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  margin-top: 8px;
  min-height: 0;
}

/* 环形图容器 */
.chart-wrapper {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.chart-container {
  width: 100%;
  height: 100%;
}

/* 数据列表垂直排列 */
.data-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  
  .data-label {
    font-size: 12px;
    color: #333333;
    line-height: 18px;
  }
  
  .data-value {
    font-size: 18px;
    font-weight: 700;
    font-family: 'Roboto', sans-serif;
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    
    // 客车数值蓝色
    &--bus {
      color: #1399ff;
    }
    
    // 货车数值橙色
    &--truck {
      color: #ff6a00;
    }
  }
}</style>