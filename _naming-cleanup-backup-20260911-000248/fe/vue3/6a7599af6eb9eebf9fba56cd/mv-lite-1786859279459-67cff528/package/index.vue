<template>
  <div class="monitor-panel">
    <div class="panel-bg-lines"></div>

    <header class="header">
      <div class="title-wrap">
        <h1 class="title">环境监测</h1>
        <span class="place">土镇</span>
      </div>
      <div class="decor-line"></div>
    </header>

    <section class="toolbar">
      <nav class="tabs" aria-label="环境监测类型">
        <button
          v-for="tab in tabs"
          :key="tab"
          class="tab"
          :class="{ active: activeTab === tab }"
          type="button"
          @click="activeTab = tab"
        >
          {{ tab }}
        </button>
      </nav>

      <div class="action-buttons">
        <button class="icon-btn" type="button" aria-label="柱状图" @click="handleIconClick('bar')">
          <span class="bar-icon">
            <i></i><i></i><i></i>
          </span>
        </button>
        <button class="icon-btn list-btn" type="button" aria-label="列表" @click="handleIconClick('list')">
          <span class="list-icon">
            <i></i><i></i><i></i>
          </span>
          <em class="badge">6</em>
        </button>
      </div>
    </section>

    <main class="content">
      <div class="chart-shell">
        <span class="y-unit">辆</span>
        <div class="chart-holder">
          <div ref="chartRef" class="chart"></div>
        </div>
      </div>

      <aside class="legend-panel">
        <div class="legend-item">
          <span class="legend-line"></span>
          <span>zk3+785CO浓度</span>
        </div>
        <div class="warning-text">预警线</div>
      </aside>
    </main>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'

const tabs = ['一氧化碳', '能见度', '洞内照明', '洞外光强']
const activeTab = ref('一氧化碳')

const xAxisData = ref(['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'])
const chartData = ref([3.2, 5.5, 4.6, 2.4, 2.0, 4.2, 11.3, 13.2, 12.7, 10.3, 3.5, 0.7])

const chartRef = ref(null)
let chart = null
let resizeObserver = null

const handleIconClick = (type) => {
  console.log(type)
}

const initChart = () => {
  if (!chartRef.value) return

  chart = echarts.init(chartRef.value)
  chart.setOption({
    animation: false,
    grid: {
      left: 72,
      right: 52,
      top: 34,
      bottom: 50,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData.value,
      axisLine: {
        show: true,
        lineStyle: { color: '#9fc6d7', width: 1 }
      },
      axisTick: { show: false },
      axisLabel: {
        color: '#333333',
        fontSize: 30,
        margin: 14,
        interval: 0
      },
      name: '时',
      nameLocation: 'end',
      nameGap: -4,
      nameTextStyle: {
        color: '#333333',
        fontSize: 30,
        padding: [28, 0, 0, 0]
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 40,
      interval: 10,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#b7cbd8',
          type: 'dashed',
          width: 1,
          opacity: 0.8
        }
      },
      axisLabel: {
        fontSize: 30,
        margin: 16,
        formatter: (value) => `{${value === 30 ? 'warn' : 'normal'}|${value}}`,
        rich: {
          normal: { color: '#333333', fontSize: 30 },
          warn: { color: '#d93030', fontSize: 30 }
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
          color: '#14c982',
          width: 3
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(20, 201, 130, 0.26)' },
            { offset: 1, color: 'rgba(20, 201, 130, 0.04)' }
          ])
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: {
            color: '#d93030',
            type: 'dashed',
            width: 2
          },
          data: [{ yAxis: 30 }]
        }
      }
    ]
  })

  resizeObserver = new ResizeObserver(() => {
    chart?.resize()
  })
  resizeObserver.observe(chartRef.value)
}

onMounted(async () => {
  await nextTick()
  requestAnimationFrame(() => initChart())
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<style scoped>
.monitor-panel {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 31px 58px 20px 58px;
  background:
    linear-gradient(90deg, rgba(233, 247, 255, 0.91), rgba(232, 246, 255, 0.93)),
    #eaf6ff;
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
  color: #333333;
}

.panel-bg-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.32;
  background:
    linear-gradient(153deg, transparent 0 17%, rgba(239, 191, 136, 0.45) 17.5% 20%, transparent 20.5%),
    linear-gradient(160deg, transparent 0 14%, rgba(166, 217, 245, 0.55) 14.3% 14.9%, transparent 15.3%),
    linear-gradient(145deg, transparent 0 38%, rgba(173, 218, 238, 0.55) 38.3% 38.8%, transparent 39.2%),
    linear-gradient(25deg, transparent 0 53%, rgba(255, 255, 255, 0.55) 53.2% 54.1%, transparent 54.4%);
}

.header,
.toolbar,
.content {
  position: relative;
  z-index: 1;
}

.header {
  height: 72px;
}

.title-wrap {
  display: flex;
  align-items: baseline;
  height: 48px;
  white-space: nowrap;
}

.title {
  margin: 0;
  color: #1e9bea;
  font-size: 38px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: 1px;
}

.place {
  margin-left: 12px;
  color: rgba(170, 181, 186, 0.38);
  font-size: 34px;
  font-weight: 600;
  line-height: 1;
}

.decor-line {
  position: relative;
  width: 95%;
  height: 12px;
  margin-top: 1px;
  border-top: 3px solid rgba(75, 173, 240, 0.62);
}

.decor-line::before {
  content: "";
  position: absolute;
  left: 0;
  top: -8px;
  width: 18px;
  height: 14px;
  border-top: 3px solid rgba(75, 173, 240, 0.7);
  border-left: 3px solid rgba(75, 173, 240, 0.7);
  border-radius: 12px 0 0 0;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;
  gap: 44px;
}

.tabs {
  display: flex;
  align-items: center;
  flex: 0 1 780px;
  height: 66px;
  padding: 6px 32px 6px 7px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  background: rgba(188, 229, 250, 0.72);
  clip-path: polygon(0 50%, 40px 0, calc(100% - 34px) 0, 100% 50%, calc(100% - 34px) 100%, 40px 100%);
}

.tab {
  position: relative;
  flex: 1 1 auto;
  height: 54px;
  margin: 0;
  border: 0;
  background: transparent;
  color: #239ee8;
  font: inherit;
  font-size: 31px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 1px;
  cursor: pointer;
  white-space: nowrap;
}

.tab.active {
  max-width: 210px;
  color: #ffffff;
  text-shadow: 0 1px 1px rgba(0, 90, 140, 0.22);
  background: linear-gradient(90deg, #30aee8 0%, #55c0c4 100%);
  clip-path: polygon(0 50%, 28px 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 28px 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 18px;
}

.icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 62px;
  height: 62px;
  border: 3px solid rgba(93, 183, 239, 0.52);
  border-radius: 9px;
  background: rgba(231, 247, 255, 0.38);
  cursor: pointer;
}

.bar-icon {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 39px;
}

.bar-icon i {
  display: block;
  width: 11px;
  border-radius: 2px 2px 0 0;
  background: #2ea8e6;
}

.bar-icon i:nth-child(1) { height: 19px; }
.bar-icon i:nth-child(2) { height: 38px; }
.bar-icon i:nth-child(3) { height: 28px; }

.list-icon {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 34px;
}

.list-icon i {
  display: block;
  height: 7px;
  border-radius: 3px;
  background: #2ea8e6;
  box-shadow: -8px 0 0 -2px #2ea8e6;
}

.badge {
  position: absolute;
  top: -22px;
  right: -22px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #ef3340;
  color: #ffffff;
  font-style: normal;
  font-size: 27px;
  font-weight: 700;
  line-height: 1;
}

.content {
  display: flex;
  align-items: stretch;
  height: calc(100% - 144px);
  min-height: 0;
  padding-top: 4px;
}

.chart-shell {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.y-unit {
  position: absolute;
  left: 6px;
  top: 6px;
  color: #333333;
  font-size: 30px;
  line-height: 1;
}

.chart-holder {
  flex: 1;
  min-height: 0;
}

.chart {
  width: 100%;
  height: 100%;
}

.legend-panel {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 260px;
  color: #333333;
  pointer-events: none;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 25px;
  line-height: 1.2;
  white-space: nowrap;
}

.legend-line {
  width: 38px;
  height: 5px;
  border-radius: 4px;
  background: #14c982;
}

.warning-text {
  margin-top: 30px;
  margin-left: 124px;
  color: #d93030;
  font-size: 31px;
  line-height: 1.1;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .monitor-panel {
    padding-left: 36px;
    padding-right: 36px;
  }

  .tab {
    font-size: 26px;
  }

  .legend-panel {
    right: 0;
    transform: scale(0.88);
    transform-origin: top right;
  }
}
</style>