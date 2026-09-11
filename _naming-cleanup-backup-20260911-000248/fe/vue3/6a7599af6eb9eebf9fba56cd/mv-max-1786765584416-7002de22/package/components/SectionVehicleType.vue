<template>
  <!-- 车型分布区块 -->
  <div class="vehicle-type-section">
    <!-- 区块头部：标题 + 图标 -->
    <div class="section-header">
      <div class="header-title-wrap">
        <!-- 菱形装饰图标 -->
        <div class="header-icon">
          <div class="icon-outer"></div>
          <div class="icon-middle"></div>
          <div class="icon-inner"></div>
        </div>
        <span class="header-title-text">车型分布</span>
      </div>
    </div>

    <!-- 内容区域：左右两列 -->
    <div class="vehicle-type-content">
      <!-- 左列：江阴靖江长江隧道 -->
      <div class="vehicle-column">
        <!-- 背景装饰容器 -->
        <div class="column-bg-wrap" :style="{ backgroundImage: `url(${bgm_3})` }">
          <!-- 标题背景装饰 -->
          <div class="title-bg-decor" :style="{ backgroundImage: `url(${bg3})` }"></div>
          <!-- 标题文字 -->
          <div class="column-title">
            <span class="title-text">江阴靖江长江隧道</span>
          </div>
          <!-- 环形图容器 -->
          <div class="chart-container" ref="tunnelChartRef"></div>
          <!-- 数据统计项 -->
          <div class="stat-items">
            <div class="stat-item stat-item--bus">
              <span class="stat-label">客车</span>
              <span class="stat-value">{{ tunnelData.busCount }}</span>
            </div>
            <div class="stat-item stat-item--truck">
              <span class="stat-label">货车</span>
              <span class="stat-value">{{ tunnelData.truckCount }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右列：江阴大桥 -->
      <div class="vehicle-column">
        <!-- 背景装饰容器 -->
        <div class="column-bg-wrap" :style="{ backgroundImage: `url(${bgm_4})` }">
          <!-- 标题背景装饰 -->
          <div class="title-bg-decor" :style="{ backgroundImage: `url(${bg5})` }"></div>
          <!-- 标题文字 -->
          <div class="column-title">
            <span class="title-text">江阴大桥</span>
          </div>
          <!-- 环形图容器 -->
          <div class="chart-container" ref="bridgeChartRef"></div>
          <!-- 数据统计项 -->
          <div class="stat-items">
            <div class="stat-item stat-item--bus">
              <span class="stat-label">客车</span>
              <span class="stat-value">{{ bridgeData.busCount }}</span>
            </div>
            <div class="stat-item stat-item--truck">
              <span class="stat-label">货车</span>
              <span class="stat-value">{{ bridgeData.truckCount }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const bg3 = new URL('../../resources/images/bg-3475.png', import.meta.url).href
const bg5 = new URL('../../resources/images/bg-3525.png', import.meta.url).href
const bgm_3 = new URL('../../resources/images/bg-_m-36.png', import.meta.url).href
const bgm_4 = new URL('../../resources/images/bg-_m-35.png', import.meta.url).href
/**
 * 车型分布子组件
 * 功能：展示江阴靖江长江隧道和江阴大桥的客车/货车分布比例
 * 包含两个环形图（ECharts）和对应的数值统计
 * 数据来源：API 绑定，默认使用 Figma 设计稿数值
 */
import { ref, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

// 引入背景图资源（系统自动注入）

// #region 1. Props定义
// 子组件无外部 props，数据由内部 ref 管理，供 API 绑定
// #endregion

// #region 2. Emits定义
// 无需向父组件 emit 事件
// #endregion

// #region 3. 响应式状态
// 隧道车型数据（客车/货车数量）
const tunnelData = ref({
  busCount: '22350',
  truckCount: '16270'
})

// 大桥车型数据（客车/货车数量）
const bridgeData = ref({
  busCount: '66109',
  truckCount: '16270'
})

// 图表 DOM 引用
const tunnelChartRef = ref(null)
const bridgeChartRef = ref(null)

// ECharts 实例引用
let tunnelChartInstance = null
let bridgeChartInstance = null

// ResizeObserver 用于监听容器尺寸变化
let resizeObserver = null
// #endregion

// #region 4. 计算属性
// 计算隧道车型占比
const tunnelBusRatio = ref(57.9)
const tunnelTruckRatio = ref(42.1)

// 计算大桥车型占比
const bridgeBusRatio = ref(80.2)
const bridgeTruckRatio = ref(19.8)
// #endregion

// #region 5. 方法
/**
 * 初始化隧道环形图
 * 使用 ECharts pie 类型，radius 数组控制环厚
 */
const initTunnelChart = () => {
  if (!tunnelChartRef.value) return
  tunnelChartInstance = echarts.init(tunnelChartRef.value)
  
  const option = {
    // 不显示 tooltip（设计稿未标注）
    tooltip: {
      show: false
    },
    // 不显示图例（数值直接显示在下方）
    legend: {
      show: false
    },
      /* [Style Refine] Figma 外圈 49.6, 内圈 34 → radius: ['68%', '95%'] */
      series: [
      {
        type: 'pie',
        radius: ['68%', '95%'], // 环厚控制
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        labelLine: {
          show: false
        },
        data: [
          {
            value: tunnelBusRatio.value,
            name: '客车',
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
                { offset: 0, color: '#18acff' },
                { offset: 1, color: '#3c50ff' }
              ])
            }
          },
          /* [Style Refine] Figma Ellipse 93 fills → color: #2b9fff */
          {
            value: tunnelTruckRatio.value,
            name: '货车',
            itemStyle: {
              color: '#2b9fff'
            }
          }
        ],
        emphasis: {
          scale: false
        }
      },
      // 内圈装饰环
      {
        type: 'pie',
        radius: ['48%', '55%'],
        center: ['50%', '50%'],
        silent: true,
        label: { show: false },
        labelLine: { show: false },
        data: [
          {
            value: 1,
            itemStyle: {
              color: 'rgba(25, 144, 255, 0.15)'
            }
          }
        ]
      },
      // 外圈装饰环
      {
        type: 'pie',
        radius: ['82%', '86%'],
        center: ['50%', '50%'],
        silent: true,
        label: { show: false },
        labelLine: { show: false },
        data: [
          {
            value: 1,
            itemStyle: {
              color: 'rgba(25, 144, 255, 0.1)'
            }
          }
        ]
      }
    ]
  }
  
  tunnelChartInstance.setOption(option)
}

/**
 * 初始化大桥环形图
 */
const initBridgeChart = () => {
  if (!bridgeChartRef.value) return
  bridgeChartInstance = echarts.init(bridgeChartRef.value)
  
  const option = {
    tooltip: {
      show: false
    },
    legend: {
      show: false
    },
      /* [Style Refine] Figma 外圈 49.6, 内圈 34 → radius: ['68%', '95%'] */
      series: [
      {
        type: 'pie',
        radius: ['68%', '95%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        labelLine: {
          show: false
        },
        data: [
          {
            value: bridgeBusRatio.value,
            name: '客车',
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
                { offset: 0, color: '#18acff' },
                { offset: 1, color: '#3c50ff' }
              ])
            }
          },
          /* [Style Refine] Figma Ellipse 93 fills → color: #2b9fff */
          {
            value: bridgeTruckRatio.value,
            name: '货车',
            itemStyle: {
              color: '#2b9fff'
            }
          }
        ],
        emphasis: {
          scale: false
        }
      },
      // 内圈装饰环
      {
        type: 'pie',
        radius: ['48%', '55%'],
        center: ['50%', '50%'],
        silent: true,
        label: { show: false },
        labelLine: { show: false },
        data: [
          {
            value: 1,
            itemStyle: {
              color: 'rgba(25, 144, 255, 0.15)'
            }
          }
        ]
      },
      // 外圈装饰环
      {
        type: 'pie',
        radius: ['82%', '86%'],
        center: ['50%', '50%'],
        silent: true,
        label: { show: false },
        labelLine: { show: false },
        data: [
          {
            value: 1,
            itemStyle: {
              color: 'rgba(25, 144, 255, 0.1)'
            }
          }
        ]
      }
    ]
  }
  
  bridgeChartInstance.setOption(option)
}

/**
 * 监听数据变化，更新图表
 */
watch([tunnelData, bridgeData], () => {
  // 重新计算占比
  const tunnelTotal = parseFloat(tunnelData.value.busCount.replace(/,/g, '')) + 
                      parseFloat(tunnelData.value.truckCount.replace(/,/g, ''))
  tunnelBusRatio.value = (parseFloat(tunnelData.value.busCount.replace(/,/g, '')) / tunnelTotal * 100).toFixed(1)
  tunnelTruckRatio.value = (parseFloat(tunnelData.value.truckCount.replace(/,/g, '')) / tunnelTotal * 100).toFixed(1)
  
  const bridgeTotal = parseFloat(bridgeData.value.busCount.replace(/,/g, '')) + 
                      parseFloat(bridgeData.value.truckCount.replace(/,/g, ''))
  bridgeBusRatio.value = (parseFloat(bridgeData.value.busCount.replace(/,/g, '')) / bridgeTotal * 100).toFixed(1)
  bridgeTruckRatio.value = (parseFloat(bridgeData.value.truckCount.replace(/,/g, '')) / bridgeTotal * 100).toFixed(1)
  
  // 更新图表
  initTunnelChart()
  initBridgeChart()
}, { deep: true })
// #endregion

// #region 6. 生命周期
onMounted(async () => {
  await nextTick()
  // 初始化两个环形图
  initTunnelChart()
  initBridgeChart()
  
  // 监听容器尺寸变化，自动 resize 图表
  resizeObserver = new ResizeObserver(() => {
    tunnelChartInstance?.resize()
    bridgeChartInstance?.resize()
  })
  
  if (tunnelChartRef.value) {
    resizeObserver.observe(tunnelChartRef.value)
  }
  if (bridgeChartRef.value) {
    resizeObserver.observe(bridgeChartRef.value)
  }
})

onUnmounted(() => {
  // 清理图表实例
  tunnelChartInstance?.dispose()
  bridgeChartInstance?.dispose()
  // 清理 ResizeObserver
  resizeObserver?.disconnect()
})
// #endregion
</script>

<style lang="less" scoped>
/* 引入共享样式 */
@import '../../resources/styles/index.less';

/* [Layout Refine] Figma slot x=32.8, root x=10 → padding: 0 25px */
/* 车型分布区块根容器 */
.vehicle-type-section {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex-shrink: 0;
  padding: 0 25px;
}

/* 区块头部 */
.section-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  min-height: 24px;

  .header-title-wrap {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }

  /* 菱形装饰图标：三层嵌套实现 */
  .header-icon {
    width: 18px;
    height: 18px;
    position: relative;
    flex-shrink: 0;

    .icon-outer {
      position: absolute;
      top: 0;
      left: 0;
      width: 18px;
      height: 18px;
      background: #1990ff;
      transform: rotate(45deg);
      border-radius: 2px;
    }

    .icon-middle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(45deg);
      width: 13px;
      height: 13px;
      background: #ffffff;
      border-radius: 1px;
    }

    .icon-inner {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(45deg);
      width: 8px;
      height: 8px;
      background: linear-gradient(135deg, #1990ff 0%, #5a7eff 100%);
      border-radius: 1px;
    }
  }

  /* 标题文字 */
  .header-title-text {
    font-size: 16px;
    font-weight: 500;
    color: #333333;
    line-height: 24px;
    text-shadow: 0 5px 5px rgba(255, 255, 255, 0.8);
  }
}

/* [Layout Refine] Figma 右列 x=227.8, 左列 x=32.8, w=192 → gap: 3px */
/* 内容区域：左右两列布局 */
.vehicle-type-content {
  display: flex;
  flex-direction: row;
  gap: 3px;
  width: 100%;
  flex: 1;
  min-height: 0;
}

/* 每一列容器 */
.vehicle-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 列背景包装器 */
.column-bg-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 114px;
  background-size: 100% 100%display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  box-sizing: border-box;
}

/* 标题背景装饰条 */
.title-bg-decor {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 130px;
  height: 9px;
  background-size: 100% 100%z-index: 1;
}

/* 列标题 */
.column-title {
  position: relative;
  z-index: 2;
  margin-top: 2px;
  margin-bottom: 4px;

  .title-text {
    font-size: 14px;
    font-weight: 500;
    color: #333333;
    line-height: 18px;
    text-align: center;
    white-space: nowrap;
  }
}

/* 环形图容器 */
.chart-container {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  margin: 4px 0;
}

/* 数据统计项容器 */
.stat-items {
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  width: 100%;
  margin-top: auto;
  padding: 0 8px 4px;
}

/* 单个统计项 */
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;

  .stat-label {
    font-size: 12px;
    font-weight: 400;
    color: #333333;
    line-height: 18px;
    text-align: center;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    font-family: 'Roboto', sans-serif;
  }

  /* 客车数值：蓝色 */
  &--bus {
    .stat-value {
      color: #1399ff;
    }
  }

  /* 货车数值：橙色 */
  &--truck {
    .stat-value {
      color: #ff6a00;
    }
  }
}</style>