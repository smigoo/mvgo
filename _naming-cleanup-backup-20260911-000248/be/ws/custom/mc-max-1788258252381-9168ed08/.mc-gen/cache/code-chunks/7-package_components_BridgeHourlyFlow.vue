<template>
  <div class="c-monitor-bridge-hourly">
    <!-- 标题行：竖条装饰 + 文字 -->
    <div class="c-monitor-bridge-header">
      <span class="c-monitor-bridge-title-bar"></span>
      <span class="c-monitor-bridge-title-text">江阴大桥</span>
    </div>

    <!-- 图例（自定义 DOM 图例，与图表联动） -->
    <div class="c-monitor-bridge-legend">
      <div
        class="c-monitor-bridge-legend-item"
        :class="{ 'is-disabled': !legendState.beijing }"
        @click="toggleLegend('北京方向')"
      >
        <span class="c-monitor-bridge-legend-dot c-monitor-bridge-legend-dot--beijing"></span>
        <span class="c-monitor-bridge-legend-text">北京方向</span>
      </div>
      <div
        class="c-monitor-bridge-legend-item"
        :class="{ 'is-disabled': !legendState.shanghai }"
        @click="toggleLegend('上海方向')"
      >
        <span class="c-monitor-bridge-legend-dot c-monitor-bridge-legend-dot--shanghai"></span>
        <span class="c-monitor-bridge-legend-text">上海方向</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="c-monitor-bridge-chart-wrap">
      <div ref="chartRef" class="c-monitor-bridge-chart"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)
const legendState = ref({ beijing: true, shanghai: true })

let chart = null
let chartObserver = null

/**
 * X 轴小时刻度，严格取自设计稿节点树文本：
 * 2 4 6 8 10 12 14 16 18 20 22 24
 */
const hours = ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

/**
 * Mock 数据（演示用），与设计稿 tooltip「16时 北京方向825车 上海方向831车」保持一致，
 * 其余时段按设计稿柱状图高低起伏模拟。
 */
const beijingData = [920, 680, 450, 380, 420, 760, 1380, 825, 1720, 2480, 1280, 850]
const shanghaiData = [880, 640, 430, 400, 460, 820, 1520, 831, 1980, 2960, 1420, 900]

/**
 * 图例切换联动：调用 ECharts dispatchAction 实现系列显隐
 */
const toggleLegend = (name) => {
  if (!chart) return
  chart.dispatchAction({ type: 'legendToggleSelect', name })
  if (name === '北京方向') {
    legendState.value.beijing = !legendState.value.beijing
  } else if (name === '上海方向') {
    legendState.value.shanghai = !legendState.value.shanghai
  }
}

/**
 * 构建完整 ECharts 配置
 */
const buildOption = () => ({
  // 自定义图例 DOM 联动所需的内置 legend 数据（隐藏展示）
  legend: {
    data: ['北京方向', '上海方向'],
    show: false,
    selected: {
      北京方向: true,
      上海方向: true
    }
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(0,0,0,0.08)',
    borderWidth: 1,
    padding: [8, 10],
    textStyle: {
      color: '#333333',
      fontSize: 12,
      fontFamily: 'Source Han Sans CN, Roboto, sans-serif'
    },
    /**
     * 还原设计稿悬浮提示框：
     * 首行「16时」+ 北京方向 825辆 + 上海方向 831辆
     */
    formatter: (params) => {
      const axisValue = params?.[0]?.axisValue || ''
      let html = `<div style="font-size:12px;font-weight:400;color:#333;margin-bottom:4px;">${axisValue}时</div>`
      params.forEach((p) => {
        const color = p.color
        const name = p.seriesName
        const value = p.value
        html += `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
            <span style="display:flex;align-items:center;">
              <span style="display:inline-block;width:6px;height:6px;border-radius:0;background:${color};margin-right:4px;"></span>
              <span style="font-size:9.6px;color:#333;">${name}</span>
            </span>
            <span style="display:flex;align-items:baseline;">
              <span style="font-size:14px;font-weight:500;color:#333;">${value}</span>
              <span style="font-size:9.6px;color:#333;margin-left:2px;">辆</span>
            </span>
          </div>`
      })
      return html
    }
  },
  grid: {
    left: 48,
    right: 70,
    top: 30,
    bottom: 28,
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: hours,
    name: '时',
    nameLocation: 'end',
    nameTextStyle: {
      color: '#333333',
      fontSize: 10,
      fontFamily: 'Source Han Sans CN, sans-serif',
      align: 'right'
    },
    axisLabel: {
      show: true,
      color: '#333333',
      fontSize: 10,
      fontFamily: 'Roboto, sans-serif',
      interval: 0
    },
    axisTick: { show: true },
    axisLine: {
      lineStyle: { color: 'rgba(0,0,0,0.16)' }
    }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 4000,
    interval: 1000,
    name: '辆',
    nameLocation: 'top',
    nameTextStyle: {
      color: '#333333',
      fontSize: 10,
      fontFamily: 'Source Han Sans CN, sans-serif',
      align: 'right',
      padding: [0, 0, 4, 0]
    },
    axisLabel: {
      show: true,
      color: '#333333',
      fontSize: 10,
      fontFamily: 'Roboto, sans-serif'
    },
    axisTick: { show: true },
    splitLine: {
      lineStyle: {
        color: 'rgba(0,0,0,0.08)',
        type: 'solid'
      }
    }
  },
  series: [
    {
      name: '北京方向',
      type: 'bar',
      data: beijingData,
      barWidth: 4,
      barGap: '50%',
      itemStyle: { color: '#1890ff' },
      markLine: {
        symbol: 'none',
        lineStyle: {
          type: 'dashed',
          color: '#ffa22f',
          width: 1
        },
        label: {
          show: true,
          position: 'end',
          color: '#ffa22f',
          fontSize: 10,
          fontFamily: 'Source Han Sans CN, sans-serif',
          formatter: '建议分流'
        },
        data: [{ yAxis: 3000 }]
      }
    },
    {
      name: '上海方向',
      type: 'bar',
      data: shanghaiData,
      barWidth: 4,
      barGap: '50%',
      itemStyle: { color: '#ff7766' }
    }
  ]
})

/**
 * 更新图表配置
 */
const updateChart = () => {
  if (!chart) return
  chart.setOption(buildOption(), true)
}

/**
 * 初始化图表（含 ResizeObserver 等待容器就绪）
 */
const initChart = () => {
  if (!chartRef.value) return
  const { clientWidth, clientHeight } = chartRef.value
  if (clientWidth > 0 && clientHeight > 0) {
    chart = echarts.init(chartRef.value)
    updateChart()
    return
  }
  chartObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0) {
      if (!chart) {
        chartObserver?.disconnect()
        chart = echarts.init(chartRef.value)
        updateChart()
      } else {
        chart.resize()
      }
    }
  })
  chartObserver.observe(chartRef.value)
}

/**
 * 监听 chartRef 变化（处理 base-panel 渲染过程中销毁并重建 slot DOM 的场景）
 */
watch(chartRef, (newRef) => {
  if (newRef && !chart) initChart()
})

const handleResize = () => {
  if (chart) chart.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
  chartObserver?.disconnect()
  chartObserver = null
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 根容器：垂直堆叠，参与父级 flex 比例分配 */
.c-monitor-bridge-hourly {
  width: 100%;
  flex: 180 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 标题行 */
.c-monitor-bridge-header {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

/* 标题左侧竖条（Figma: 3×12, cornerRadius 6, 渐变 #388dff） */
.c-monitor-bridge-title-bar {
  width: 3px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #388dff 0%, #388dff 100%);
  flex-shrink: 0;
}

/* 标题文字（Figma: 14px, Source Han Sans CN, #333333） */
.c-monitor-bridge-title-text {
  font-size: @fontSize;
  font-weight: 400;
  color: #333333;
  font-family: 'Source Han Sans CN', sans-serif;
  line-height: 21px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 图例行 */
.c-monitor-bridge-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 图例项 */
.c-monitor-bridge-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.25s;

  &.is-disabled {
    opacity: 0.4;
  }
}

/* 图例色块（Figma: 10×10 矩形） */
.c-monitor-bridge-legend-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;

  &--beijing {
    background: #1890ff;
  }

  &--shanghai {
    background: #ff7766;
  }
}

/* 图例文字（Figma: 12px, Source Han Sans CN） */
.c-monitor-bridge-legend-text {
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  color: #333333;
  font-family: 'Source Han Sans CN', sans-serif;
  line-height: 18px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 图表弹性容器 */
.c-monitor-bridge-chart-wrap {
  flex: 1;
  min-height: 160px; /* 柱状图兜底高度，防止被挤压变形 */
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

/* ECharts 挂载节点 */
.c-monitor-bridge-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>