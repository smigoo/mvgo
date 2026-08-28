<template>
  <div class="env-monitor-root" :style="{ backgroundImage: `url(${bg1})` }">
    <!-- 面板头部：包含装饰图标、渐变线与标题 -->
    <div class="env-monitor-header">
      <div class="header-left">
        <img :src="icon1" class="header-icon" alt="" />
        <div class="header-gradient-line"></div>
      </div>
      <div class="header-title">环境监测</div>
    </div>

    <!-- 内容区域：图表与底部切换 -->
    <div class="env-monitor-content">
      <!-- 图表容器 -->
      <div class="chart-wrapper">
        <div ref="chartRef" class="chart-canvas"></div>
      </div>

      <!-- 底部标签与操作区 -->
      <div class="sub-tabs">
        <!-- 标签列表 -->
        <div class="tabs-list" :style="{ backgroundImage: `url(${bg2})` }">
          <div 
            v-for="(tab, index) in tabs" 
            :key="tab" 
            class="tab-item"
            :class="{ 'is-active': activeTab === index }"
            @click="activeTab = index"
          >
            <!-- 激活态背景 -->
            <div v-if="activeTab === index" class="tab-active-bg" :style="{ backgroundImage: `url(${bgtabActive})` }"></div>
            <span class="tab-text">{{ tab }}</span>
          </div>
        </div>
        
        <!-- 右侧图标与预警数字 -->
        <div class="tabs-actions">
          <div class="tabs-icons">
            <img :src="icontabsIcon" class="icon-img" alt="" />
          </div>
          <div class="alert-badge">
            <div class="badge-bg"></div>
            <span class="badge-text">6</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const bg1 = new URL('../resources/images/bg-7880.png', import.meta.url).href
const icon1 = new URL('../resources/images/g-7883.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-7890.png', import.meta.url).href
const bgtabActive = new URL('../resources/images/bg-tab-active-7891.png', import.meta.url).href
const icontabsIcon = new URL('../resources/images/tabs-icon-43.png', import.meta.url).href
/**
 * 环境监测面板主组件
 * 包含顶部标题栏、ECharts 折线趋势图、底部 Tab 切换及预警徽标
 * 数据通过 ref 暴露，支持 API 绑定与动态刷新
 */
import { ref, onMounted, onUnmounted, nextTick, watch} from 'vue'
import * as echarts from 'echarts'
// === API 对接导入 (自动生成) ===
import flowApi from './api/flow.mjs'  // slot-2: 环境监测趋势图
// === END API 导入 ===


// #region 1. Props定义
// 本组件为独立面板，暂无外部 Props 传入
// #endregion

// #region 2. Emits定义
// 本组件暂无向外触发的事件
// #endregion

// #region 3. 响应式状态
// 底部 Tab 标签列表（支持 API 绑定覆盖）
const tabs = ref(['一氧化碳', '洞内照明', '洞外光强', '能见度'])
// 当前激活的 Tab 索引
const activeTab = ref(0)

// 图表 DOM 引用与实例
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 图表核心数据（API 绑定槽位，严禁使用裸 const/let）
const chartData = ref([120, 250, 450, 320, 520, 480, 380, 220, 180, 350, 420, 280])
// 预警线阈值（API 绑定槽位）
const warningValue = ref(400)
// #endregion

// #region 4. 计算属性
// 暂无派生计算属性
// #endregion

// #region 5. 方法
/**
 * 初始化 ECharts 折线图
 * 包含渐变面积、预警线标记、坐标轴单位等精确还原
 */
const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    // 图表网格布局，预留坐标轴标签与单位空间
    grid: {
      left: 45,
      right: 20,
      top: 30,
      bottom: 40
    },
    // 悬停提示框
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'transparent',
      textStyle: { color: '#fff', fontSize: 12 }
    },
    // 图例配置（精确还原 Figma 位置与样式）
    legend: {
      show: true,
      data: ['zk3+785CO浓度'],
      right: 10,
      top: 0,
      textStyle: { color: '#333', fontSize: 10 },
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 2
    },
    // X 轴：时间刻度
    xAxis: {
      type: 'category',
      data: ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e0e0e0' } },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12 },
      name: '时',
      nameTextStyle: { color: '#666', fontSize: 12, align: 'right' },
      nameGap: 5
    },
    // Y 轴：数值刻度与单位
    yAxis: {
      type: 'value',
      min: 0,
      max: 600,
      interval: 200,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLabel: { color: '#333', fontSize: 12 },
      name: '辆',
      nameTextStyle: { color: '#666', fontSize: 12 }
    },
    // 数据系列：平滑折线 + 渐变面积 + 预警线
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartData.value,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { color: '#0fcd7d', width: 2 },
        itemStyle: { color: '#0fcd7d' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ])
        },
        // 预警线标记（红色虚线）
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 },
          data: [
            {
              yAxis: warningValue.value,
              label: {
                formatter: '预警线',
                color: '#d32f2f',
                fontSize: 12,
                position: 'insideEndTop'
              }
            }
          ]
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
  
  // 挂载 ResizeObserver 监听容器尺寸变化，确保图表自适应
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}

/**
 * 模拟不同 Tab 下的数据切换
 * 实际业务中此处应替换为 API 请求逻辑
 */
const mockTabData = [
  [120, 250, 450, 320, 520, 480, 380, 220, 180, 350, 420, 280],
  [80, 150, 200, 180, 250, 300, 280, 150, 100, 200, 250, 180],
  [300, 400, 500, 450, 550, 600, 500, 400, 350, 450, 500, 400],
  [50, 100, 150, 120, 200, 180, 150, 100, 80, 150, 180, 120]
]
// #endregion

// #region 6. 生命周期与交互监听
// 监听 Tab 切换，联动刷新图表数据
watch(activeTab, (newIndex) => {
  chartData.value = mockTabData[newIndex] || mockTabData[0]
  if (chartInstance) {
    chartInstance.setOption({
      series: [{ data: chartData.value }]
    })
  }
})

onMounted(async () => {
  // 必须等待 DOM 渲染完毕且 flex 布局 settle 后再初始化图表
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理 ResizeObserver 与 ECharts 实例，防止内存泄漏
  resizeObserver?.disconnect()
  chartInstance?.dispose()
})
// #endregion

// === API 对接注入 (自动生成，请勿手动修改) ===
const chartRefData = ref({})  // slot-2: 环境监测趋势图
function applyChartRefData(data) {
  const payload = data?.data || data || {}
  const times = payload.times || payload.xAxis || payload.categories || []
  const series = Array.isArray(payload.series) ? payload.series : []
  const threshold = payload.threshold || payload.markLine || []
  if (!chartInstance || typeof chartInstance.setOption !== 'function') return
  chartInstance.setOption({
    xAxis: times.length ? { data: times } : undefined,
    series: series.map((item) => ({
      ...item,
      markLine: threshold.length ? { data: threshold } : item.markLine,
    })),
  })
}
// === API 对接调用 ===
onMounted(async () => {
  // slot-2: 环境监测趋势图 → flow.getTodayFlow
  try {
    const __res_slot_2 = await flowApi.getTodayFlow({"sectionNum":"G21","type":1})
    if (__res_slot_2?.code === 200 || __res_slot_2?.data) {
      chartRefData.value = __res_slot_2.data || __res_slot_2
      applyChartRefData(chartRefData.value)
    }
  } catch (e) { console.error('slot-2 flowApi.getTodayFlow({"sectionNum":"G21","type":1}):', e) }

})
// === END API 对接注入 ===
</script>
<style lang="less" scoped>
@import '../resources/styles/index.less';

/* 根容器：承载背景图与整体布局 */
.env-monitor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 背景图由 template 注入，此处设置尺寸与重复规则 */
  background-color: rgba(237, 244, 251, 0.76); /* #edf4fbb2 */;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  box-shadow: 0px 4px 10px rgba(74, 117, 141, 0.25);
  padding: 8px 20px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 面板头部：包含装饰图标、渐变线与标题 */
.env-monitor-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 28px;
  gap: 8px;
  flex-shrink: 0;

  .header-left {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;

    .header-icon {
      width: 8px;
      height: 8px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .header-gradient-line {
      flex: 1;
      height: 6px;
      background: #559eff;
      border-radius: 3px;
    }
  }

  .header-title {
    flex-shrink: 0;
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 16px;
    font-weight: 700;
    line-height: 19.2px;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    white-space: nowrap;
  }
}

/* 内容区域：图表与底部切换 */
.env-monitor-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* 图表容器 */
.chart-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  .chart-canvas {
    width: 100%;
    height: 100%;
    flex: 1;
    min-height: 0;
  }
}

/* 底部标签与操作区 */
.sub-tabs {
  height: 32px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;

  /* 标签列表 */
  .tabs-list {
    width: 295px;
    height: 27px;
    display: flex;
    flex-direction: row;
    align-items: center;
    /* 背景图由 template 注入 */
    background-size: 100% 100%;
    background-repeat: no-repeat;
    border: 0.72px solid rgba(255, 255, 255, 1);
    border-radius: 4px;
    padding: 3px;
    box-sizing: border-box;
    position: relative;

    .tab-item {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      height: 100%;
      cursor: pointer;
      z-index: 1;

      /* 激活态背景 */
      .tab-active-bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 21px;
        /* 背景图由 template 注入 */
        background-size: 100% 100%;
        background-repeat: no-repeat;
        border: 0.6px solid rgba(255, 255, 255, 1);
        border-radius: 1.6px;
        z-index: -1;
      }

      .tab-text {
        font-family: 'Source Han Sans CN', sans-serif;
        font-size: 14px;
        font-weight: 500;
        line-height: 12px;
        color: #2c9bea;
        white-space: nowrap;
        transition: color 0.2s ease;

        /* 激活态文字样式 */
        .is-active & {
          color: #ffffff;
          text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
        }
      }
    }
  }

  /* 右侧图标与预警数字 */
  .tabs-actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;

    .tabs-icons {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;

      .icon-img {
        width: 18px;
        height: 18px;
        object-fit: contain;
      }
    }

    .alert-badge {
      width: 14px;
      height: 14px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;

      .badge-bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #f53f3f;
        border-radius: 29px;
      }

      .badge-text {
        position: relative;
        z-index: 1;
        font-family: 'PingFang SC', sans-serif;
        font-size: 12px;
        font-weight: 500;
        line-height: 14px;
        color: #ffffff;
      }
    }
  }
}</style>