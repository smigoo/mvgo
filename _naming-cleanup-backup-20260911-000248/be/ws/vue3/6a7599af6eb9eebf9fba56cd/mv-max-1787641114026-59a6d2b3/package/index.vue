<template>
  <div class="env-monitor-root">
    <!-- 头部标题区 -->
    <div class="env-monitor-header">
      <div class="header-left">
        <img :src="icon1" class="header-icon" alt="icon" />
<!-- 🎯 面板标题由宿主外壳渲染，标题元素已程序化移除 -->
      </div>
      <div class="header-line"></div>
    </div>

    <!-- 内容区 -->
    <div class="env-monitor-content">
      <!-- Tab 切换与工具栏 -->
      <div class="tab-bar">
        <div class="tabs-list" :style="{ backgroundImage: `url(${bg2})` }">
          <div
            v-for="(tab, index) in tabs"
            :key="tab.name"
            :class="['tab-item', { active: activeTab === index }]"
            @click="handleTabClick(index)"
          >
            <div v-if="activeTab === index" class="tab-active-bg" :style="{ backgroundImage: `url(${bg3})` }"></div>
            <span class="tab-text">{{ tab.name }}</span>
          </div>
        </div>
        <div class="icon-group">
          <div class="icon-btn" @click="handleViewSwitch('chart')">
            <!-- 柱状图图标 CSS 绘制 -->
            <div class="icon-bar-chart">
              <span></span><span></span><span></span>
            </div>
          </div>
          <div class="icon-btn badge-btn" @click="handleViewSwitch('list')">
            <!-- 列表图标 CSS 绘制 -->
            <div class="icon-list" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
              <span></span><span></span><span></span>
            </div>
            <div class="badge">6</div>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="chart-container">
        <div class="y-axis-label">辆</div>
        <div class="x-axis-label">时</div>
        <div class="legend-box">
          <span class="legend-line"></span>
          <span class="legend-text">zk3+785CO浓度</span>
        </div>
        <div ref="chartRef" class="chart-canvas"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../resources/images/g-7883.png'
import bg2 from '../resources/images/bg-7890.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'
import bg1 from '../resources/images/bg-7880.png'
import icon2 from '../resources/images/tabs-icon-43.png'

/**
 * 环境监测组件
 * 包含标题栏、监测指标 Tab 切换、视图切换图标，以及 CO 浓度折线面积图（含预警线）。
 * 数据来源：API 注入 chartData，交互包含 Tab 切换和视图切换。
 */
import { ref, onMounted, onUnmounted, nextTick, watch} from 'vue'
import * as echarts from 'echarts'

// 引入系统自动注入的图片资源变量
// import bg1 from '../resources/images/bg-7880.png' // 整体背景，按规则不在此处使用
// import bg2 from '../resources/images/bg-7890.png' // Tab 栏背景
// import bg3 from '../resources/images/bg-tab-active-7891.png' // 选中 Tab 背景
// import icon1 from '../resources/images/g-7883.png' // 头部装饰图标
// import icon2 from '../resources/images/tabs-icon-43.png' // 右侧视图图标

// #region 1. Props定义
// 本组件为独立面板，暂无外部 Props
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'view-switch'])
// #endregion

// #region 3. 响应式状态
// Tab 数据与当前选中项
const tabs = ref([
  { name: '一氧化碳' },
  { name: '能见度' },
  { name: '洞内照明' },
  { name: '洞外光强' }
])
const activeTab = ref(0)

// 图表数据（API 绑定槽位）
const chartData = ref([0 /* 🎯 待接入(5) */, 8, 12, 0 /* 🎯 待接入(15) */, 18, 22, 0 /* 🎯 待接入(25) */, 0 /* 🎯 待接入(28) */, 0 /* 🎯 待接入(35) */, 0 /* 🎯 待接入(32) */, 20, 10])

// 图表实例与 DOM 引用
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
// #endregion

// #region 4. 计算属性
// 图表配置项（基于响应式数据动态生成）
const chartOption = ref({
  grid: { top: 0 /* 🎯 待接入(35) */, right: 20, bottom: 30, left: 40 },
  xAxis: {
    type: 'category',
    data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
    boundaryGap: false,
    axisLabel: { color: '#999999', fontSize: 10 },
    axisLine: { lineStyle: { color: '#e0e0e0' } },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 40,
    interval: 10,
    axisLabel: { color: '#999999', fontSize: 10 },
    splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false }
  },
  series: [{
    name: 'zk3+785CO浓度',
    type: 'line',
    smooth: true,
    symbol: 'none',
    lineStyle: { color: '#52c41a', width: 2 },
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(0 /* 🎯 待接入(82) */, 0 /* 🎯 待接入(196) */, 0 /* 🎯 待接入(26) */, 0.3)' },
          { offset: 1, color: 'rgba(0 /* 🎯 待接入(82) */, 0 /* 🎯 待接入(196) */, 0 /* 🎯 待接入(26) */, 0.02)' }
        ]
      }
    },
    data: chartData.value,
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: '#F53F3F', type: 'dashed', width: 1 },
      label: { 
        formatter: '预警线', 
        color: '#F53F3F', 
        fontSize: 12, 
        position: 'insideEndTop' 
      },
      data: [{ yAxis: 30 }]
    }
  }],
  legend: { show: false }, // 图例用 DOM 渲染以精确还原 Figma
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#eee',
    borderWidth: 1,
    textStyle: { color: '#333', fontSize: 12 },
    formatter: (params) => {
      const p = params[0]
      return `${p.axisValue}时<br/>${p.seriesName}: ${p.value}`
    }
  }
})

// 监听图表数据变化，更新图表
watch(chartData, (newVal) => {
  if (chartInstance) {
    chartInstance.setOption({ series: [{ data: newVal }] })
  }
})
// #endregion

// #region 5. 方法
// 切换 Tab
const handleTabClick = (index) => {
  activeTab.value = index
  emit('tab-change', tabs.value[index].name)
  // 实际业务中可在此处根据 tab 重新请求数据并更新 chartData
}

// 切换视图
const handleViewSwitch = (type) => {
  emit('view-switch', type)
}
// #endregion

// #region 6. 生命周期
onMounted(async () => {
  // 等待 DOM 更新，确保 flex 布局高度计算完成
  await nextTick()
  requestAnimationFrame(() => {
    if (chartRef.value) {
      chartInstance = echarts.init(chartRef.value)
      chartInstance.setOption(chartOption.value)
      
      // 监听容器尺寸变化，自适应调整图表
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  })
})

onUnmounted(() => {
  // 清理资源，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.env-monitor-root {
  width: 420px;
  height: 186px;
  background: #EDF4FB;
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  display: flex;
  flex-direction: column;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  box-sizing: border-box;
  overflow: hidden;
  max-width: 100%;
  max-height: 100vh;
}

.env-monitor-header {
  display: flex;
  flex-direction: column;
  padding: 12px 16px 0;
  
  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-icon {
    width: 8px;
    height: 8px;
    object-fit: contain;
  }

  .header-title {
    font-size: 16px;
    font-weight: 700;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    color: transparent;
    line-height: 1.2;
  }

  .header-line {
    width: 100%;
    height: 3px;
    background: linear-gradient(90deg, #559eff 0%, #559eff 100%);
    margin-top: 8px;
    border-radius: 2px;
  }
}

.env-monitor-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 16px;
  gap: 12px;
}

.tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 27px;

  .tabs-list {
    display: flex;
    align-items: center;
    height: 27px;
    padding: 3px;
    box-sizing: border-box;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    border: 0.72px solid rgba(255, 255, 255, 1);
    border-radius: 4px;
    gap: 4px;

    .tab-item {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 21px;
      padding: 0 12px;
      cursor: pointer;
      z-index: 1;

      .tab-active-bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-size: 100% 100%;
        background-repeat: no-repeat;
        border: 0.6px solid rgba(255, 255, 255, 1);
        border-radius: 3px;
        z-index: -1;
      }

      .tab-text {
        font-size: 14px;
        font-weight: 500;
        color: #2c9bea;
        white-space: nowrap;
        text-shadow: none;
      }

      &.active .tab-text {
        color: #ffffff;
        text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
      }
    }
  }

  .icon-group {
    display: flex;
    align-items: center;
    gap: 8px;

    .icon-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border-radius: 4px;
      cursor: pointer;
      position: relative;

      .icon-bar-chart {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        width: 14px;
        height: 14px;

        span {
          flex: 1;
          background: #2c9bea;
          border-radius: 1px;
          &:nth-child(1) { height: 60%; }
          &:nth-child(2) { height: 100%; }
          &:nth-child(3) { height: 40%; }
        }
      }

      .icon-list {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        width: 14px;
        height: 12px;

        span {
          width: 100%;
          height: 2px;
          background: #2c9bea;
          border-radius: 1px;
        }
      }

      .badge {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 14px;
        height: 14px;
        background: #f53f3f;
        border-radius: 50%;
        color: #ffffff;
        font-size: 10px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
    }
  }
}

.chart-container {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;

  .y-axis-label {
    position: absolute;
    top: 0;
    left: 0;
    font-size: 12px;
    color: #666666;
    z-index: 2;
  }

  .x-axis-label {
    position: absolute;
    bottom: 0;
    right: 0;
    font-size: 12px;
    color: #666666;
    z-index: 2;
  }

  .legend-box {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    z-index: 2;

    .legend-line {
      width: 14px;
      height: 2px;
      background: #52c41a;
      border-radius: 1px;
    }

    .legend-text {
      font-size: 10px;
      color: #666666;
    }
  }

  .chart-canvas {
    flex: 1;
    min-height: 80px; /* 🎯 升级：原值 0px 不足以容纳 echarts */;
    width: 100%;
  }
}</style>