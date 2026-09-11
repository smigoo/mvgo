<template>
  <div
    class="mv3-mv-max-1786205086404-36f0218a-root"
    :style="rootBgStyle"
  >
    <!-- 头部标题区 -->
    <div class="mv3-mv-max-1786205086404-36f0218a-header">
      <div class="mv3-mv-max-1786205086404-36f0218a-header-decoration">
        <!-- 标题装饰圆点图标 -->
        <img :src="icon1" class="header-dot-icon" />
        <span class="mv3-mv-max-1786205086404-36f0218a-header-title">环境监测</span>
      </div>
      <div class="mv3-mv-max-1786205086404-36f0218a-header-line"></div>
    </div>

    <!-- 内容区 -->
    <div class="mv3-mv-max-1786205086404-36f0218a-content">
      <!-- Tab 栏 + 视图切换 -->
      <div class="mv3-mv-max-1786205086404-36f0218a-tab-bar">
        <!-- Tab 组 -->
        <div
          class="mv3-mv-max-1786205086404-36f0218a-tabs-group"
          :style="tabsGroupBgStyle"
        >
          <!-- 激活态背景滑块 -->
          <div
            class="mv3-mv-max-1786205086404-36f0218a-tab-active-bg"
            :style="activeTabStyle"
          ></div>
          <!-- Tab 项 -->
          <div
            v-for="(tab, index) in tabs"
            :key="tab"
            :class="[
              'mv3-mv-max-1786205086404-36f0218a-tab-item',
              { active: activeIndex === index }
            ]"
            @click="handleTabClick(index)"
          >
            {{ tab }}
          </div>
        </div>

        <!-- 右侧视图切换图标 -->
        <div class="mv3-mv-max-1786205086404-36f0218a-view-controls">
          <!-- 图表视图图标 -->
          <div
            class="mv3-mv-max-1786205086404-36f0218a-view-icon"
            :class="{ 'is-active': viewMode === 'chart' }"
            @click="handleViewSwitch('chart')"
          >
            <img :src="icontabsIcon" class="view-icon-img" />
          </div>
          <!-- 列表视图图标 + Badge -->
          <div
            class="mv3-mv-max-1786205086404-36f0218a-view-icon"
            :class="{ 'is-active': viewMode === 'list' }"
            @click="handleViewSwitch('list')"
          >
            <img :src="icontabsIcon" class="view-icon-img" style="opacity: 0.7;" />
            <span class="mv3-mv-max-1786205086404-36f0218a-badge">{{ badgeCount }}</span>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="mv3-mv-max-1786205086404-36f0218a-chart-container" ref="chartRef"></div>
    </div>
  </div>
</template>

<script setup>
const icon1 = new URL('../resources/images/g-7883.png', import.meta.url).href
const bg1 = new URL('../resources/images/bg-7880.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-7890.png', import.meta.url).href
const bgtabActive = new URL('../resources/images/bg-tab-active-7891.png', import.meta.url).href
const icontabsIcon = new URL('../resources/images/tabs-icon-43.png', import.meta.url).href
/**
 * 环境监测面板组件
 * 功能：顶部Tab切换（一氧化碳/能见度/洞内照明/洞外光强）+ 右侧视图切换 + CO浓度面积图
 * 数据来源：API 绑定 chartData / tabs / activeIndex
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

// 资源变量（系统自动注入）
// import bg1 from '../resources/images/bg-7880.png'
// import bg2 from '../resources/images/bg-7890.png'
// import bgtabActive from '../resources/images/bg-tab-active-7891.png'
// import icon1 from '../resources/images/g-7883.png'
// import icontabsIcon from '../resources/images/tabs-icon-43.png'

// #region 1. Props定义
const props = defineProps({
  // Tab 选项列表
  tabs: { type: Array, default: () => ['一氧化碳', '能见度', '洞内照明', '洞外光强'] },
  // 当前激活 Tab 索引
  activeIndex: { type: Number, default: 0 },
  // 视图模式
  viewMode: { type: String, default: 'chart' },
  // Badge 数量
  badgeCount: { type: [Number, String], default: 6 },
  // 图表数据
  chartData: { type: Array, default: () => [] },
  // 图表 X 轴标签
  chartLabels: { type: Array, default: () => ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'] }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['update:activeIndex', 'update:viewMode', 'tab-change', 'view-change'])
// #endregion

// #region 3. 响应式状态
const currentActiveIndex = ref(props.activeIndex)
const currentViewMode = ref(props.viewMode)
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 图表数据（可被 API 绑定覆盖）
const chartSeriesData = ref([12, 18, 25, 32, 28, 22, 15, 20, 35, 30, 18, 10])
// #endregion

// #region 4. 计算属性
// 根容器背景样式 - 直接落地 Figma 背景图
const rootBgStyle = computed(() => ({
  backgroundImage: bg1 ? `url(${bg1})` : 'none',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundColor: '#edf4fb'
}))

// Tab 组背景样式
const tabsGroupBgStyle = computed(() => ({
  backgroundImage: bg2 ? `url(${bg2})` : 'linear-gradient(90deg, #b5deff 0%, #d1ecff 100%)',
  backgroundSize: '100% 100%',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
}))

// 激活 Tab 滑块位置与宽度
const activeTabStyle = computed(() => {
  // 每个 tab 大约 70px 宽，根据索引偏移
  const tabWidth = 70
  const offset = currentActiveIndex.value * tabWidth + 3
  return {
    left: `${offset}px`,
    width: `${tabWidth - 6}px`,
    backgroundImage: bgtabActive ? `url(${bgtabActive})` : 'linear-gradient(90deg, #1099b1 0%, #038fff 100%)',
    backgroundSize: '100% 100%'
  }
})
// #endregion

// #region 5. 方法
// Tab 切换处理
const handleTabClick = (index) => {
  currentActiveIndex.value = index
  emit('update:activeIndex', index)
  emit('tab-change', index)
  // 切换 Tab 后刷新图表数据
  updateChart()
}

// 视图切换处理
const handleViewSwitch = (mode) => {
  currentViewMode.value = mode
  emit('update:viewMode', mode)
  emit('view-change', mode)
}

// 初始化图表
const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  updateChart()
}

// 更新图表配置
const updateChart = () => {
  if (!chartInstance) return

  const option = {
    // 背景透明
    backgroundColor: 'transparent',
    // 图例配置
    legend: {
      show: true,
      top: 4,
      right: 10,
      orient: 'horizontal',
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: 'rgba(237, 244, 251, 0.85)',
        fontSize: 10
      },
      data: ['zk3+785CO浓度']
    },
    // 提示框
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(18, 26, 40, 0.9)',
      borderColor: 'rgba(85, 158, 255, 0.3)',
      textStyle: {
        color: '#edf4fb',
        fontSize: 12
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.axisValue}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    // 网格
    grid: {
      top: 30,
      right: 15,
      bottom: 25,
      left: 35
    },
    // X 轴
    xAxis: {
      type: 'category',
      data: props.chartLabels,
      axisLine: {
        lineStyle: { color: 'rgba(237, 244, 251, 0.15)' }
      },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(237, 244, 251, 0.6)',
        fontSize: 10
      },
      name: '时',
      nameTextStyle: {
        color: 'rgba(237, 244, 251, 0.6)',
        fontSize: 10,
        padding: [0, -10, 0, 0]
      }
    },
    // Y 轴
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(237, 244, 251, 0.6)',
        fontSize: 10
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(237, 244, 251, 0.08)',
          type: 'dashed'
        }
      },
      name: '辆',
      nameTextStyle: {
        color: 'rgba(237, 244, 251, 0.6)',
        fontSize: 10,
        padding: [0, 20, 0, 0]
      }
    },
    // 数据系列
    series: [
      // CO 浓度面积图
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartSeriesData.value,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.35)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.02)' }
          ])
        }
      },
      // 预警线（markLine）
      {
        name: '预警线',
        type: 'line',
        data: [],
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: '#d32f2f',
            type: 'dashed',
            width: 1.5
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '预警线',
            color: '#d32f2f',
            fontSize: 10
          },
          data: [
            { yAxis: 30 }
          ]
        }
      }
    ]
  }

  chartInstance.setOption(option, true)
}
// #endregion

// #region 6. 生命周期
onMounted(() => {
  nextTick(() => {
    initChart()
  })

  // 监听容器尺寸变化，自适应图表
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize()
    })
    resizeObserver.observe(chartRef.value)
  }
})

onUnmounted(() => {
  // 清理图表实例与监听器
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

// 监听 props 变化同步到内部状态
watch(() => props.activeIndex, (val) => {
  currentActiveIndex.value = val
})

watch(() => props.viewMode, (val) => {
  currentViewMode.value = val
})

// 监听图表数据变化，刷新图表
watch(chartSeriesData, () => {
  updateChart()
}, { deep: true })
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 头部装饰圆点图标
.header-dot-icon {
  width: 8px;
  height: 8px;
  object-fit: contain;
  flex-shrink: 0;
}

// 视图图标样式
.view-icon-img {
  filter: brightness(1.2);
}

// 激活态图标高亮
.is-active {
  .view-icon-img {
    filter: brightness(1.5) drop-shadow(0 0 3px rgba(85, 158, 255, 0.6));
  }
}</style>