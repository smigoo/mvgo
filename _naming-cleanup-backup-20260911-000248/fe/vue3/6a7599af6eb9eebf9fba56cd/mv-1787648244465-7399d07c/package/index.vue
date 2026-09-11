<template>
  <div class="monitor-root">
    <!-- 标题区 -->
    <div class="monitor-header">
      <div class="monitor-header-decoration">
        <div class="deco-circle-outer"></div>
        <div class="deco-circle-inner"></div>
        <div class="deco-path"></div>
      </div>
      <div class="monitor-header-line"></div>
      <div class="monitor-title">环境监测</div>
    </div>

    <!-- 内容区 -->
    <div class="monitor-content">
      <!-- 控制栏 -->
      <div class="monitor-control-bar">
        <!-- Tab 切换 -->
        <div
          class="monitor-tabs"
          :style="{ backgroundImage: `url(${bg2})` }"
        >
          <!-- 激活态背景 -->
          <div
            class="monitor-tab-active-bg"
            :style="{
              backgroundImage: `url(${bg3})`,
              left: activeTabLeft + 'px',
              width: activeTabWidth + 'px'
            }"
          ></div>
          <div
            v-for="(tab, index) in tabs"
            :key="tab.name"
            :ref="el => setTabRef(el, index)"
            :class="['monitor-tab-item', { 'is-active': activeTab === index }]"
            @click="handleTabClick(index)"
          >
            {{ tab.name }}
          </div>
        </div>

        <!-- 右侧功能图标 -->
        <div class="monitor-action-icons">
          <div class="monitor-icon-btn" @click="handleChartView">
            <img :src="icon4" alt="图表视图" />
          </div>
          <div class="monitor-icon-btn" @click="handleListView">
            <img :src="icon5" alt="列表视图" />
            <span class="monitor-badge">6</span>
          </div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="monitor-chart-area">
        <!-- 图例 -->
        <div class="monitor-chart-legend">
          <div class="monitor-chart-legend-line"></div>
          <span class="monitor-chart-legend-text">zk3+785CO浓度</span>
        </div>
        <!-- ECharts 容器 -->
        <div class="monitor-chart-container" ref="chartRef"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../resources/images/bg-7890.png'
import bg3 from '../resources/images/bg-tab-active-7891.png'
import icon4 from '../resources/images/icon-7941.png'
import icon5 from '../resources/images/icon-7945.png'
import bg1 from '../resources/images/bg-7880.png'
import icon1 from '../resources/images/circle-7884.png'

/**
 * 环境监测组件
 * 功能：展示隧道/道路环境监测数据（CO浓度、能见度、照明等）
 * 交互：Tab 切换监测指标、右侧图标切换视图模式
 * 图表：面积图展示 CO 浓度趋势，含红色预警线
 */
import { ref, onMounted, onUnmounted, nextTick, computed} from 'vue'
import * as echarts from 'echarts'

// 系统自动注入的图片资源变量
// bg1: 面板背景（由宿主处理，此处不使用）
// bg2: tabs-list 容器背景
// bg3: tab 激活态背景
// icon1~3: 标题装饰微元素（用 CSS 替代）
// icon4: 图表视图图标
// icon5: 列表视图图标

// #region 1. Props 定义
const props = defineProps({
  // 监测指标列表
  tabList: {
    type: Array,
    default: () => [
      { name: '一氧化碳' },
      { name: '能见度' },
      { name: '洞内照明' },
      { name: '洞外光强' }
    ]
  }
})
// #endregion

// #region 2. Emits 定义
const emit = defineEmits(['tab-change', 'view-change'])
// #endregion

// #region 3. 响应式状态
// Tab 数据（可被 API 绑定覆盖）
const tabs = ref([
  { name: '一氧化碳' },
  { name: '能见度' },
  { name: '洞内照明' },
  { name: '洞外光强' }
])

// 当前激活的 Tab 索引
const activeTab = ref(0)

// Tab 元素引用，用于计算激活态背景位置
const tabRefs = ref([])

// 图表数据（可被 API 绑定覆盖）
const chartLabels = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
const chartValues = ref([8, 10, 12, 11, 13, 14, 12, 10, 9, 11, 13, 12])

// 视图模式：chart / list
const viewMode = ref('chart')
// #endregion

// #region 4. 计算属性
// 计算激活 Tab 背景的 left 偏移
const activeTabLeft = computed(() => {
  if (tabRefs.value[activeTab.value]) {
    const el = tabRefs.value[activeTab.value]
    return el.offsetLeft
  }
  return 0
})

// 计算激活 Tab 背景的宽度
const activeTabWidth = computed(() => {
  if (tabRefs.value[activeTab.value]) {
    const el = tabRefs.value[activeTab.value]
    return el.offsetWidth
  }
  return 78
})
// #endregion

// #region 5. 方法
// 设置 tab 元素引用
const setTabRef = (el, index) => {
  if (el) {
    tabRefs.value[index] = el
  }
}

// Tab 点击切换
const handleTabClick = (index) => {
  activeTab.value = index
  emit('tab-change', tabs.value[index])
  // 切换后刷新图表数据（模拟不同指标数据）
  updateChartData()
}

// 图表视图切换
const handleChartView = () => {
  viewMode.value = 'chart'
  emit('view-change', 'chart')
}

// 列表视图切换
const handleListView = () => {
  viewMode.value = 'list'
  emit('view-change', 'list')
}

// 更新图表数据（根据当前 Tab 模拟不同数据）
const updateChartData = () => {
  // 实际项目中根据 activeTab 请求不同接口
  // 此处保持数据不变，仅作为 API 绑定的数据槽位
}
// #endregion

// #region 6. 图表相关
const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null

// 初始化 ECharts 面积图
const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)

  const option = {
    // 网格配置，留出坐标轴标签空间
    grid: {
      top: 10,
      right: 20,
      bottom: 30,
      left: 40
    },
    // X 轴：时间（时）
    xAxis: {
      type: 'category',
      data: chartLabels.value,
      boundaryGap: false,
      axisLine: {
        lineStyle: {
          color: '#d9d9d9'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Roboto'
      },
      name: '时',
      nameLocation: 'end',
      nameGap: 5,
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN'
      }
    },
    // Y 轴：数量（辆）
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 10,
        fontFamily: 'Roboto'
      },
      splitLine: {
        lineStyle: {
          color: '#e8e8e8',
          type: 'dashed'
        }
      },
      name: '辆',
      nameLocation: 'end',
      nameGap: 5,
      nameTextStyle: {
        color: '#666666',
        fontSize: 12,
        fontFamily: 'Source Han Sans CN',
        align: 'right'
      }
    },
    // 提示框
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e8e8e8',
      textStyle: {
        color: '#333',
        fontSize: 12
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.name}时<br/>${p.seriesName}: ${p.value}`
      }
    },
    // 标记线（预警线）
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartValues.value,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#0fcd7d',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15, 205, 125, 0.4)' },
            { offset: 1, color: 'rgba(15, 205, 125, 0.05)' }
          ])
        },
        // 预警线标记
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
            fontSize: 12,
            fontFamily: 'Source Han Sans CN'
          },
          data: [
            {
              yAxis: 30
            }
          ]
        }
      }
    ]
  }

  chartInstance.setOption(option)

  // 监听容器尺寸变化
  resizeObserver = new ResizeObserver(() => {
    chartInstance?.resize()
  })
  resizeObserver.observe(chartRef.value)
}
// #endregion

// #region 7. 生命周期
onMounted(async () => {
  // 等待 DOM 更新后再初始化图表，确保 flex 布局已 settle
  await nextTick()
  requestAnimationFrame(() => {
    initChart()
  })
})

onUnmounted(() => {
  // 清理资源
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';</style>