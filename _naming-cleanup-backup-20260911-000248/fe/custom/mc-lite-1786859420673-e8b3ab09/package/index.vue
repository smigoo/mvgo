<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1786859420673-e8b3ab09-content">
      <div class="c-mc-lite-1786859420673-e8b3ab09-bg-map"></div>

      <div class="c-mc-lite-1786859420673-e8b3ab09-top">
        <div class="c-mc-lite-1786859420673-e8b3ab09-title-wrap">
          <div class="c-mc-lite-1786859420673-e8b3ab09-title-line">
            <span class="c-mc-lite-1786859420673-e8b3ab09-title-main">环境监测</span>
            <span class="c-mc-lite-1786859420673-e8b3ab09-title-sub">土镇</span>
          </div>
          <div class="c-mc-lite-1786859420673-e8b3ab09-title-deco"></div>
        </div>

        <div class="c-mc-lite-1786859420673-e8b3ab09-tools">
          <button
            class="c-mc-lite-1786859420673-e8b3ab09-tool-btn"
            type="button"
            @click="handleToolClick('bar')"
          >
            <span class="c-mc-lite-1786859420673-e8b3ab09-bar-icon">
              <i class="c-mc-lite-1786859420673-e8b3ab09-bar-one"></i>
              <i class="c-mc-lite-1786859420673-e8b3ab09-bar-two"></i>
              <i class="c-mc-lite-1786859420673-e8b3ab09-bar-three"></i>
            </span>
          </button>
          <button
            class="c-mc-lite-1786859420673-e8b3ab09-tool-btn c-mc-lite-1786859420673-e8b3ab09-tool-btn-list"
            type="button"
            @click="handleToolClick('list')"
          >
            <span class="c-mc-lite-1786859420673-e8b3ab09-list-icon">
              <i class="c-mc-lite-1786859420673-e8b3ab09-list-row"></i>
              <i class="c-mc-lite-1786859420673-e8b3ab09-list-row"></i>
              <i class="c-mc-lite-1786859420673-e8b3ab09-list-row"></i>
            </span>
            <span class="c-mc-lite-1786859420673-e8b3ab09-badge">6</span>
          </button>
        </div>
      </div>

      <div class="c-mc-lite-1786859420673-e8b3ab09-tabs-row">
        <div class="c-mc-lite-1786859420673-e8b3ab09-tabs">
          <button
            v-for="item in tabs"
            :key="item"
            type="button"
            :class="[
              'c-mc-lite-1786859420673-e8b3ab09-tab',
              activeTab === item ? 'c-mc-lite-1786859420673-e8b3ab09-tab-active' : ''
            ]"
            @click="activeTab = item"
          >
            {{ item }}
          </button>
        </div>
      </div>

      <div class="c-mc-lite-1786859420673-e8b3ab09-chart-wrap">
        <div ref="chartRef" class="c-mc-lite-1786859420673-e8b3ab09-chart"></div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
const activeTab = ref('一氧化碳')
const tabs = ref(['一氧化碳', '能见度', '洞内照明', '洞外光强'])
const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
const chartData = ref([3.8, 5.5, 4.2, 2.5, 2.4, 4.3, 11.5, 13.2, 12.8, 10.5, 4.4, 0.6])

let chart = null
let resizeObserver = null
let initTimer = null

const handleToolClick = (type) => {
  console.log('tool click:', type)
}

const initChart = () => {
  if (!chartRef.value || chart) return
  // 确保容器有实际尺寸后再初始化
  const rect = chartRef.value.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  chart = echarts.init(chartRef.value)
  chart.setOption({
    animation: false,
    color: ['#18C989'],
    grid: {
      top: '18%',
      right: '7%',
      bottom: '18%',
      left: '7%',
      containLabel: false
    },
    legend: {
      top: '0%',
      right: '3%',
      icon: 'roundRect',
      itemWidth: 26,
      itemHeight: 4,
      textStyle: {
        color: '#333333',
        fontSize: 26,
        fontWeight: 400
      },
      data: ['zk3+785CO浓度']
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData.value,
      name: '时',
      nameLocation: 'end',
      nameGap: 2,
      nameTextStyle: {
        color: '#333333',
        fontSize: 34,
        padding: [18, 0, 0, 2]
      },
      axisLine: {
        lineStyle: {
          color: '#A9C7D8',
          width: 2
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 31,
        margin: 14
      },
      splitLine: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      name: '辆',
      nameLocation: 'end',
      nameGap: 8,
      nameTextStyle: {
        color: '#333333',
        fontSize: 30,
        align: 'left',
        padding: [0, 0, 0, -20]
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#333333',
        fontSize: 31,
        margin: 14
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#B7C8D5',
          type: 'dashed',
          width: 2,
          opacity: 0.7
        }
      }
    },
    series: [
      {
        name: 'zk3+785CO浓度',
        type: 'line',
        data: chartData.value,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#16C987',
          width: 3
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(22, 201, 135, 0.32)' },
            { offset: 1, color: 'rgba(22, 201, 135, 0.04)' }
          ])
        },
        markLine: {
          symbol: 'none',
          silent: true,
          label: {
            show: true,
            formatter: '预警线',
            position: 'insideEndTop',
            color: '#E73346',
            fontSize: 31,
            padding: [0, 24, 5, 0]
          },
          lineStyle: {
            color: '#E73346',
            type: 'dashed',
            width: 2
          },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  })

  resizeObserver = new ResizeObserver(() => {
    if (chart) chart.resize()
  })
  resizeObserver.observe(chartRef.value)
}

onMounted(async () => {
  await nextTick()

  // 观察图表容器本身（而非外层容器），尺寸为 0 时继续等待、不 disconnect，
  // 避免「外层有尺寸但图表容器 flex 尚未 settle → 永久放弃初始化」导致图表空白。
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry || !chartRef.value) return
    const { width, height } = entry.contentRect
    if (!width || !height) return

    // 图表容器已有尺寸，取消观察并初始化
    resizeObserver.disconnect()
    resizeObserver = null
    initChart()
  })

  resizeObserver.observe(chartRef.value)

  // 兜底：容器在 observe 首帧已有尺寸时 ResizeObserver 立即触发；极端情况再补一次 rAF
  requestAnimationFrame(() => {
    if (!chart) initChart()
  })
})

onUnmounted(() => {
  if (initTimer) {
    clearTimeout(initTimer)
    initTimer = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<style scoped>
.c-mc-lite-1786859420673-e8b3ab09-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 3.2% 5.2% 2.2% 5.2%;
  box-sizing: border-box;
  background: linear-gradient(90deg, rgba(234, 244, 252, 0.94), rgba(234, 244, 252, 0.86)), radial-gradient(circle at 9% 12%, rgba(255, 255, 255, 0.72) 0, rgba(255, 255, 255, 0.12) 30%, transparent 55%), #eaf4fc;
  color: #333333;
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

.c-mc-lite-1786859420673-e8b3ab09-bg-map {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.34;
  background: linear-gradient(116deg, transparent 0 15%, rgba(215, 172, 126, 0.5) 15% 18%, transparent 18% 100%), linear-gradient(142deg, transparent 0 24%, rgba(185, 213, 228, 0.72) 24% 24.4%, transparent 24.4% 100%), linear-gradient(74deg, transparent 0 10%, rgba(185, 213, 228, 0.64) 10% 10.3%, transparent 10.3% 100%), linear-gradient(154deg, transparent 0 39%, rgba(185, 213, 228, 0.55) 39% 39.4%, transparent 39.4% 100%);
}

.c-mc-lite-1786859420673-e8b3ab09-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex: 0 0 15%;
  min-height: 0;
}

.c-mc-lite-1786859420673-e8b3ab09-title-wrap {
  width: 75%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.c-mc-lite-1786859420673-e8b3ab09-title-line {
  display: flex;
  align-items: baseline;
  line-height: 1.08;
  white-space: nowrap;
}

.c-mc-lite-1786859420673-e8b3ab09-title-main {
  font-size: clamp(1.5rem, 3.2vw, 2.7rem);
  font-weight: 800;
  color: #229be5;
  letter-spacing: 0.04em;
}

.c-mc-lite-1786859420673-e8b3ab09-title-sub {
  margin-left: 1.1%;
  font-size: clamp(1.2rem, 2.6vw, 2.25rem);
  font-weight: 500;
  color: rgba(160, 178, 190, 0.42);
  letter-spacing: 0.08em;
}

.c-mc-lite-1786859420673-e8b3ab09-title-deco {
  position: relative;
  width: 100%;
  height: 0.18rem;
  margin-top: 1.5%;
  background: linear-gradient(90deg, #89cdf4 0%, #7bc8f5 65%, rgba(137, 205, 244, 0.18) 100%);
}

.c-mc-lite-1786859420673-e8b3ab09-title-deco::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 2.2%;
  aspect-ratio: 1 / 1;
  border-left: 0.12rem solid #8bc9f0;
  border-top: 0.12rem solid #8bc9f0;
  border-radius: 50%;
  transform: translateY(-50%) rotate(-35deg);
}

.c-mc-lite-1786859420673-e8b3ab09-tools {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 0.7rem;
  width: 14%;
  padding-top: 7.4%;
}

.c-mc-lite-1786859420673-e8b3ab09-tool-btn {
  position: relative;
  width: 43%;
  aspect-ratio: 1 / 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0.16rem solid rgba(139, 201, 240, 0.84);
  border-radius: 16%;
  background: rgba(225, 243, 253, 0.58);
  padding: 0;
  cursor: pointer;
}

.c-mc-lite-1786859420673-e8b3ab09-bar-icon {
  width: 64%;
  height: 64%;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  border-bottom: 0.16rem solid #229be5;
}

.c-mc-lite-1786859420673-e8b3ab09-bar-icon i {
  display: block;
  width: 23%;
  border-radius: 0.15rem 0.15rem 0 0;
  background: #229be5;
}

.c-mc-lite-1786859420673-e8b3ab09-bar-one {
  height: 42%;
}

.c-mc-lite-1786859420673-e8b3ab09-bar-two {
  height: 80%;
}

.c-mc-lite-1786859420673-e8b3ab09-bar-three {
  height: 58%;
}

.c-mc-lite-1786859420673-e8b3ab09-list-icon {
  width: 58%;
  height: 52%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.c-mc-lite-1786859420673-e8b3ab09-list-row {
  display: block;
  width: 100%;
  height: 18%;
  border-radius: 999rem;
  background: linear-gradient(90deg, #229be5 0 18%, transparent 18% 30%, #229be5 30% 100%);
}

.c-mc-lite-1786859420673-e8b3ab09-badge {
  position: absolute;
  top: -34%;
  right: -31%;
  width: 58%;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f33445;
  color: #ffffff;
  font-size: clamp(1rem, 2vw, 1.95rem);
  font-weight: 800;
  line-height: 1;
}

.c-mc-lite-1786859420673-e8b3ab09-tabs-row {
  position: relative;
  z-index: 1;
  flex: 0 0 16%;
  min-height: 0;
  display: flex;
  align-items: flex-start;
}

.c-mc-lite-1786859420673-e8b3ab09-tabs {
  width: 76%;
  height: 70%;
  display: flex;
  align-items: center;
  padding: 0 3.2% 0 1%;
  box-sizing: border-box;
  background: rgba(207, 233, 250, 0.88);
  clip-path: polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%);
  border-radius: 0.35rem;
  box-shadow: inset 0 0 0 0.12rem rgba(255, 255, 255, 0.72);
}

.c-mc-lite-1786859420673-e8b3ab09-tab {
  position: relative;
  flex: 1;
  height: 86%;
  border: none;
  background: transparent;
  color: #229be5;
  font-size: clamp(1.18rem, 2.75vw, 2.22rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
  cursor: pointer;
  padding: 0 1%;
}

.c-mc-lite-1786859420673-e8b3ab09-tab-active {
  flex: 0 0 29%;
  color: #ffffff;
  text-shadow: 0 0.08rem 0.12rem rgba(0, 95, 155, 0.22);
  background: linear-gradient(90deg, #38aee9 0%, #36b9d6 45%, #5eb8c4 100%);
  clip-path: polygon(8% 0, 90% 0, 100% 50%, 90% 100%, 8% 100%, 0 50%);
  border-radius: 0.35rem;
  box-shadow: inset 0 0 0 0.12rem rgba(255, 255, 255, 0.78);
}

.c-mc-lite-1786859420673-e8b3ab09-chart-wrap {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.c-mc-lite-1786859420673-e8b3ab09-chart {
  width: 100%;
  height: 100%;
}
</style>