<template>
  <div class="mv-1785821931108-ebc0a6bd">
    <!-- 顶部标题栏 -->
    <div class="panel-header">
      <div class="header-left">
        <img :src="icongroup4114" class="header-icon" />
        <span class="header-title">事件统计</span>
      </div>
      <div class="header-right">
        <div
          v-for="(tab, idx) in timeTabs"
          :key="idx"
          :class="['time-tab', { active: activeTimeTab === idx }]"
          @click="activeTimeTab = idx"
        >
          {{ tab }}
        </div>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="panel-body">
      <!-- 地点切换 + 核心统计 -->
      <div class="location-section">
        <div class="location-tabs">
          <div
            v-for="(loc, idx) in locationTabs"
            :key="idx"
            :class="['location-tab', { active: activeLocation === idx }]"
            @click="activeLocation = idx"
          >
            {{ loc }}
          </div>
        </div>
        <div class="stats-row">
          <div class="stat-item" v-for="(stat, idx) in statsData" :key="idx">
            <span class="stat-label">{{ stat.label }}</span>
            <span :class="['stat-value', stat.colorClass]">{{ stat.value }}</span>
          </div>
        </div>
      </div>

      <!-- 下部左右分栏 -->
      <div class="bottom-section">
        <!-- 左侧：事件分类 -->
        <div class="category-section">
          <div class="section-title-bar">
            <span class="section-title-text">事件分类</span>
          </div>
          <div class="category-content">
            <div ref="donutChartRef" class="donut-chart-container"></div>
            <div class="legend-grid">
              <div class="legend-col">
                <div
                  v-for="(item, idx) in legendLeft"
                  :key="idx"
                  class="legend-item"
                >
                  <span class="legend-dot" :style="{ background: item.color }"></span>
                  <span class="legend-label">{{ item.name }}</span>
                  <span class="legend-value">{{ item.value }}</span>
                </div>
              </div>
              <div class="legend-col">
                <div
                  v-for="(item, idx) in legendRight"
                  :key="idx"
                  class="legend-item"
                >
                  <span class="legend-dot" :style="{ background: item.color }"></span>
                  <span class="legend-label">{{ item.name }}</span>
                  <span class="legend-value">{{ item.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：救援信息 -->
        <div class="rescue-section">
          <div class="section-title-bar">
            <span class="section-title-text">救援信息</span>
          </div>
          <div class="rescue-content">
            <div class="rescue-summary">
              <img :src="icon8" class="rescue-icon" />
              <span class="rescue-label">清障救援数</span>
              <span class="rescue-value">{{ rescueTotal }}</span>
            </div>
            <div class="rescue-list">
              <div
                v-for="(item, idx) in rescueList"
                :key="idx"
                class="rescue-list-item"
              >
                <div class="rescue-item-left">
                  <div class="rescue-item-bg" :style="{ backgroundImage: `url(${item.bg})` }"></div>
                  <span class="rescue-item-name">{{ item.name }}</span>
                </div>
                <span :class="['rescue-item-value', item.colorClass]">{{ item.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon8 from '../resources/images/icon-6180.png'
import bg1 from '../resources/images/bg-6177.png'
import bg5 from '../resources/images/bg-85.png'
import bg6 from '../resources/images/bg-86.png'
import bg7 from '../resources/images/bg-87.png'
import icongroup4114 from '../resources/images/Group_4114-6098.png'

/**
 * 事件统计面板组件
 * 包含时间/地点切换、核心统计、事件分类环形图、救援信息列表
 */
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick} from 'vue'
import * as echarts from 'echarts'

// 图片资源引用（系统自动注入）

  title: { type: String, default: '事件统计' }
})

// #region 2. Emits
const emit = defineEmits(['tabChange', 'locationChange'])

// #region 3. 响应式状态
// 时间 Tab 切换
const timeTabs = ref(['今日', '本月', '本年'])
const activeTimeTab = ref(0)

// 地点 Tab 切换
const locationTabs = ref(['江阴靖江长江隧道', '江阴大桥'])
const activeLocation = ref(0)

// 核心统计数据（API 可绑定）
const statsData = ref([
  { label: '事件总数', value: '6', colorClass: '' },
  { label: '已结案', value: '1', colorClass: 'text-green' },
  { label: '已作废', value: '1', colorClass: '' },
  { label: '误报', value: '2', colorClass: '' }
])

// 事件分类图例数据
const categoryData = ref([
  { name: '交通事故', value: 0, color: '#ff4d4f' },
  { name: '车辆故障', value: 3, color: '#faad14' },
  { name: '施工养护', value: 1, color: '#52c41a' },
  { name: '恶劣天气', value: 1, color: '#1890ff' },
  { name: '障碍物', value: 0, color: '#faad14' },
  { name: '大流量', value: 0, color: '#1890ff' },
  { name: '自然灾害', value: 0, color: '#13c2c2' },
  { name: '其它', value: 0, color: '#722ed1' }
])

// 图例分左右两列
const legendLeft = computed(() => categoryData.value.slice(0, 4))
const legendRight = computed(() => categoryData.value.slice(4, 8))

// 事件总数（环形图中心文字）
const totalEvents = computed(() => categoryData.value.reduce((s, i) => s + i.value, 0))

// 救援总数
const rescueTotal = ref('3')

// 救援列表数据
const rescueList = ref([
  { name: '交通事故', value: '1', colorClass: 'text-red', bg: bg5 },
  { name: '车辆故障', value: '1', colorClass: 'text-blue', bg: bg6 }
])

// #region 4. 图表相关
const donutChartRef = ref(null)
let chartInstance = null

// 初始化环形图
const initChart = () => {
  if (!donutChartRef.value) return
  chartInstance = echarts.init(donutChartRef.value)
  updateChart()
}

// 更新图表配置
const updateChart = () => {
  if (!chartInstance) return
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(13,17,23,0.9)',
      borderColor: 'rgba(0,255,204,0.3)',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: '{b}: {c}起'
    },
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '42%',
        style: {
          text: `${totalEvents.value}(起)`,
          fill: '#00ffcc',
          fontSize: 16,
          fontWeight: 'bold',
          textAlign: 'center'
        }
      },
      {
        type: 'text',
        left: 'center',
        top: '55%',
        style: {
          text: '事件总数',
          fill: 'rgba(255,255,255,0.6)',
          fontSize: 11,
          textAlign: 'center'
        }
      }
    ],
    series: [
      {
        type: 'pie',
        radius: ['55%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderColor: '#0b0c15',
          borderWidth: 2
        },
        data: categoryData.value
          .filter(i => i.value > 0)
          .map(i => ({
            value: i.value,
            name: i.name,
            itemStyle: { color: i.color }
          }))
      }
    ]
  }
  chartInstance.setOption(option)
}

// 监听数据变化刷新图表
watch([categoryData, totalEvents], () => {
  updateChart()
}, { deep: true })

// 监听 Tab 切换，模拟数据刷新
watch([activeTimeTab, activeLocation], () => {
  emit('tabChange', { time: activeTimeTab.value, location: activeLocation.value })
})

// ResizeObserver 自适应
let resizeObserver = null

// #region 6. 生命周期
onMounted(() => {
  nextTick(() => {
    initChart()
    if (donutChartRef.value) {
      resizeObserver = new ResizeObserver(() => {
        chartInstance?.resize()
      })
      resizeObserver.observe(donutChartRef.value)
    }
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器：深色科技风面板
.mv-1785821931108-ebc0a6bd {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0b0c15;
  border: 1px solid rgba(0, 255, 204, 0.2);
  border-radius: 4px;
  box-shadow: 0 0 12px rgba(0, 255, 204, 0.08), inset 0 0 12px rgba(0, 255, 204, 0.03);
  overflow: hidden;
  .common();
}

// 顶部标题栏
.panel-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 12px;
  background-image: url('../resources/images/bg-6177.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.header-icon {
  width: 17px;
  height: 18px;
  object-fit: contain;
}

.header-title {
  font-size: 16px;
  font-weight: bold;
  color: #ffffff;
  letter-spacing: 1px;
}

.header-right {
  display: flex;
  flex-direction: row;
  gap: 4px;
}

// 时间 Tab 按钮
.time-tab {
  padding: 2px 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(0, 255, 204, 0.2);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
  background: transparent;

  &.active {
    color: #ffffff;
    background: linear-gradient(135deg, #10c4a7, #004741);
    border-color: rgba(32, 255, 183, 0.8);
    text-shadow: 0 0 4px rgba(0, 255, 204, 0.5);
  }

  &:hover:not(.active) {
    border-color: rgba(0, 255, 204, 0.5);
    color: #ffffff;
  }
}

// 内容区
.panel-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  gap: 8px;
}

// 地点切换 + 统计区
.location-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.location-tabs {
  display: flex;
  flex-direction: row;
  gap: 8px;
}

.location-tab {
  flex: 1;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(0, 255, 204, 0.1);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.25s;

  &.active {
    color: #ffffff;
    background: linear-gradient(135deg, rgba(0, 68, 51, 0.8), rgba(0, 34, 17, 0.9));
    border-color: rgba(0, 255, 204, 0.5);
    box-shadow: 0 0 8px rgba(0, 255, 204, 0.15);
  }

  &:hover:not(.active) {
    border-color: rgba(0, 255, 204, 0.3);
    color: rgba(255, 255, 255, 0.85);
  }
}

// 统计数据行
.stats-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  padding: 8px 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #ffffff;
  font-family: 'Roboto', sans-serif;

  &.text-green {
    color: #00ffcc;
    text-shadow: 0 0 6px rgba(0, 255, 204, 0.5);
  }
}

// 下部分栏
.bottom-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 12px;
}

// 小标题栏
.section-title-bar {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0 8px;
  position: relative;
  background: linear-gradient(90deg, rgba(0, 255, 204, 0.08), transparent);
  border-left: 2px solid #00ffcc;
  margin-bottom: 6px;
}

.section-title-text {
  font-size: 14px;
  font-weight: bold;
  color: #ffffff;
}

// 左侧事件分类
.category-section {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.category-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.donut-chart-container {
  width: 100%;
  height: 120px;
  min-height: 100px;
}

// 图例网格
.legend-grid {
  display: flex;
  flex-direction: row;
  gap: 8px;
  padding: 4px 0;
}

.legend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.legend-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  color: rgba(255, 255, 255, 0.7);
  flex: 1;
}

.legend-value {
  color: #ffffff;
  font-weight: 500;
  font-family: 'Roboto', sans-serif;
  font-size: 13px;
}

// 右侧救援信息
.rescue-section {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.rescue-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.rescue-summary {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 4px 0 8px;
}

.rescue-icon {
  width: 36px;
  height: 32px;
  object-fit: contain;
}

.rescue-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.rescue-value {
  font-size: 22px;
  font-weight: bold;
  color: #00ffcc;
  font-family: 'Roboto', sans-serif;
  text-shadow: 0 0 6px rgba(0, 255, 204, 0.5);
}

// 救援列表
.rescue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.rescue-list-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(0, 255, 204, 0.08);
  border-radius: 3px;
  position: relative;
  overflow: hidden;
}

.rescue-item-left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.rescue-item-bg {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.15;
}

.rescue-item-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  position: relative;
  z-index: 1;
}

.rescue-item-value {
  font-size: 18px;
  font-weight: 600;
  font-family: 'Roboto', sans-serif;
  position: relative;
  z-index: 1;

  &.text-red {
    color: #ff4d4f;
    text-shadow: 0 0 5px rgba(255, 77, 79, 0.4);
  }

  &.text-blue {
    color: #1890ff;
    text-shadow: 0 0 5px rgba(24, 144, 255, 0.4);
  }
}</style>