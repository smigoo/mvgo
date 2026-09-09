<template>
  <div class="trace-page">
    <!-- 顶部 ECharts 图表 -->
    <div class="chart-container">
      <div ref="chartRef" class="trace-chart"></div>
    </div>

    <!-- 统计与操作栏 -->
    <div class="trace-toolbar">
      <div class="trace-count">
        <h2>{{ traceList.length }} Traces</h2>
      </div>
    </div>

    <!-- 列表 -->
    <div class="trace-list">
      <div
        v-for="item in traceList"
        :key="item.traceID"
        class="trace-item"
        @click="handleClick(item)"
      >
        <div class="trace-main">
          <div class="trace-header">
            <span class="trace-name">
              {{ tagsName[item.serviceName] }}:
              {{ tagsName[item.operationName] || item.operationName }}
              <span class="trace-id">{{ item.traceID }}</span>
            </span>
            <span
              class="trace-duration"
              :style="item.duration > 2000 ? 'color: var(--error)' : 'color: var(--success)'"
            >
              {{ formatDuration(item.duration) }}
            </span>
          </div>
          <div class="trace-body">
            <div class="trace-span">
              <a-tag color="default">{{ item.spans.length }} Span</a-tag>
            </div>
            <div class="trace-service">
              <a-tag color="blue">{{ item.serviceName }}</a-tag>
              <a-tag color="red" style="margin-left: 8px" v-if="getErrorType(item)">
                {{ 'error ' + getErrorType(item) }}
              </a-tag>
              <a-tag color="green" style="margin-left: 8px" v-else>
                {{ 'success 200' }}
              </a-tag>

              <a-tag
                color="purple"
                style="margin-left: 8px"
                v-if="
                  item.operationName.includes('web') ||
                  item.operationName.includes('global.error') ||
                  item.operationName.includes('ui')
                "
              >
                前端
              </a-tag>
              <a-tag color="cyan" style="margin-left: 8px" v-else>后端</a-tag>
            </div>
            <div class="trace-time">
              {{ formatTime(item.startTime) }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <a-modal v-model:open="isShow" width="80%" :footer="null">
      <traceView :itemData="itemData" v-if="isShow"></traceView>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import * as echarts from 'echarts'
import traceView from '../trace-view/index.vue'

const props = defineProps({
  rawData: {
    type: Array,
    default: () => []
  },
  sortValue: {
    type: Number,
    default: 1
  }
})
const isShow = ref(false)

let tagsName = {
  'mc-framework': '感智｜晓界工坊(' + window.MCServeInfo?.MCVersion + ')',
  'web.publishEvent.start': '微码事件触发',
  'ui.click': '点击事件'
}

// ====================== 你的真实数据 ======================
const rawData = ref(props.rawData)

const itemData = ref({})
watch(
  () => props.rawData,
  (val) => {
    rawData.value = val
    parseData()
    initChart()
  }
)

// ====================== 数据格式化 ======================
const traceList = ref([])
const chartRef = ref(null)
let myChart = null
const sortBy = ref('recent')

// 解析数据
const parseData = () => {
  traceList.value = rawData.value.map((trace) => {
    trace?.spans?.sort((a, b) => a.startTime - b.startTime)
    const span = trace.spans[0]
    const serviceName = trace.processes.p1.serviceName
    const dbTag = span.tags.find((t) => t.key === 'db.system')
    return {
      ...trace,
      serviceName,
      operationName: span.operationName,
      startTime: span.startTime,
      duration: span.duration,
      dbSystem: dbTag?.value || '-',
      selected: false
    }
  })
  if (props.sortValue == 2) {
    traceList.value.sort((a, b) => b.duration - a.duration)
  }
}
watch(
  () => props.sortValue,
  () => {
    parseData()
  }
)

// 时间格式化
const formatTime = (us) => {
  const date = new Date(us / 1000)
  return date.toLocaleString()
}

// 图表数据
const chartData = computed(() =>
  rawData.value
    .map((trace) => {
      const span = trace.spans[0]
      const serviceName = trace.processes.p1.serviceName
      const dbTag = span.tags.find((t) => t.key === 'db.system')
      return {
        ...trace,
        serviceName,
        operationName: span.operationName,
        startTime: span.startTime,
        duration: span.duration,
        dbSystem: dbTag?.value || '-',
        selected: false
      }
    })
    .map((item) => ({
      startTime: item.startTime,
      itemData: item,
      name: formatTime(item.startTime),
      value: item.duration
    }))
    .sort((a, b) => a.startTime - b.startTime)
)
const formatDuration = (ms) => {
  if (typeof ms !== 'number' || isNaN(ms)) return '0ms'

  // 小于1秒，显示毫秒
  if (ms < 1000) {
    return `${ms}ms`
  }

  // 大于等于1秒，转换为秒，保留2位小数
  const seconds = (ms / 1000).toFixed(2)
  return `${seconds}s`
}
// 初始化图表
const initChart = () => {
  myChart = echarts.init(chartRef.value)
  const option = {
    // 背景色（可选）
    backgroundColor: '#fafbfc',

    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: 'var(--border-light)',
      borderWidth: 1,
      textStyle: { color: 'var(--text-primary)' },
      padding: [10, 12],
      formatter: (params) => {
        const ms = params.value
        const isOver = ms >= 1000
        const display = isOver ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
        const color = ms >= 2000 ? 'var(--error)' : 'var(--success)'
        return `${params.name}<br/>耗时：<span style="color:${color};font-weight:bold;">${display}</span>`
      },
      // 阴影 + 圆角
      extraCssText: 'box-shadow:0 2px 10px var(--shadow-dropdown); border-radius:var(--radius-xs);'
    },

    // 网格间距
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },

    xAxis: {
      type: 'category',
      data: chartData.value.map((i) => i.name),
      name: '时间',
      nameTextStyle: {
        color: 'var(--text-secondary)',
        fontSize: 12
      },
      axisLine: {
        lineStyle: { color: 'var(--border-default)' }
      },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 11
      },
      axisTick: { show: false }
    },

    yAxis: {
      type: 'value',
      name: '耗时(ms)',
      nameTextStyle: {
        color: 'var(--text-secondary)',
        fontSize: 12
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 11
      },
      splitLine: {
        lineStyle: {
          color: 'var(--border-light)'
        }
      }
    },

    series: [
      {
        name: '耗时',
        type: 'line',
        smooth: 0.4, // 更自然的平滑
        symbol: 'circle', // 圆点
        symbolSize: 6,
        // 线条样式
        lineStyle: {
          color: 'var(--brand)',
          width: 3,
          shadowBlur: 10,
          shadowColor: 'rgba(24, 144, 255, 0.3)'
        },
        // 圆点样式
        itemStyle: {
          color: 'var(--brand)',
          borderColor: '#fff',
          borderWidth: 2
        },
        // 悬浮圆点放大
        emphasis: {
          symbolSize: 8
        },
        data: chartData.value,

        // 区域渐变（高级感）
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'var(--brand-border)' },
              { offset: 1, color: 'rgba(24,144,255,0.02)' }
            ]
          }
        }
      }
    ]
  }
  myChart.setOption(option)
  // 假设你的 echarts 实例叫 myChart（改成你自己的）
  myChart.off('click') // 防止重复绑定
  myChart.on('click', function (params) {
    // params 里包含所有点击信息
    console.log('点击了图表数据：', params)
    // 示例：弹出提示
    handleClick(params.data.itemData)
  })
}

const handleClick = (item) => {
  itemData.value = { data: [item] }
  isShow.value = true
}
/**
 * 从 trace 数据中查找 error.type 的值
 * @param {Object} trace - 完整的 trace 数据
 * @returns {string|null} error.type 的值，没有则返回 null
 */
function getErrorType(trace) {
  console.log(trace)

  // 先判断数据是否合法
  if (!trace || !Array.isArray(trace.spans)) return null

  // 遍历所有 span
  for (const span of trace.spans) {
    if (!Array.isArray(span.tags)) continue

    // 在当前 span 的 tags 里找 key = error.type
    const tag = span.tags.find((item) => item.key === 'error.type' || item.key === 'error')

    // 找到了就直接返回 value
    if (tag) return tag.value
  }

  // 所有 span 都没找到
  return null
}

// 生命周期
onMounted(() => {
  parseData()
  initChart()
  window.addEventListener('resize', () => myChart?.resize())
})
</script>

<style scoped>
.trace-page {
  padding: 10px 20px 20px 20px;
  background: var(--bg-hover);
  height: calc(100% - 80px);
}

.chart-container {
  height: 260px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px var(--shadow-sm);
}

.trace-chart {
  width: 100%;
  height: 100%;
}

.trace-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
  box-shadow: 0 2px 0.5rem var(--shadow-sm);
}

.trace-count h2 {
  margin: 0;
  font-size: 20px;
}

.trace-list {
  background: var(--bg-card);
  overflow: auto;
  height: calc(100% - 260px - 50px - 30px);
}

.trace-item {
  display: flex;
  padding: 16px;
  border-radius: var(--radius-sm);
  border-bottom: 1px solid var(--border-light);
  box-shadow: 0 2px 0.5rem var(--shadow-sm);
}

.trace-checkbox {
  margin-right: 12px;
  padding-top: 4px;
}

.trace-main {
  flex: 1;
}

.trace-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 15px;
}

.trace-id {
  color: var(--text-tertiary);
  margin-left: 10px;
  font-size: 13px;
}

.trace-duration {
  font-weight: bold;
  color: var(--brand);
}

.trace-body {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.trace-time {
  margin-left: auto;
  color: var(--text-tertiary);
}
</style>
