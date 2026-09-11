```vue
<script setup>
import { ref, computed, watch } from 'vue'
import DailyTotalFlow from './components/DailyTotalFlow.vue'
import TunnelHourlyChart from './components/TunnelHourlyChart.vue'
import BridgeHourlyChart from './components/BridgeHourlyChart.vue'
import VehicleTypeDistribution from './components/VehicleTypeDistribution.vue'
import FlowPrediction from './components/FlowPrediction.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// ============================================================
// 当日总流量（传给 DailyTotalFlow）
// 数值来自设计稿文字清单：隧道 34,620 / 大桥 82,379
// ============================================================
const tunnelTraffic = ref({
  label: '江阴靖江长江隧道',
  value: '34,620'
})

const bridgeTraffic = ref({
  label: '江阴大桥',
  value: '82,379'
})

// ============================================================
// 江阴靖江长江隧道 24 小时流量（柱状图，双系列：北京方向 / 上海方向）
// x 轴：0,2,4,...,24（设计稿真实刻度）
// ============================================================
const tunnelHourlyData = ref({
  xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  series: [
    {
      name: '北京方向',
      color: 'rgba(24, 144, 255, 1)',
      data: [120, 180, 260, 420, 680, 760, 820, 790, 825, 740, 560, 380, 220]
    },
    {
      name: '上海方向',
      color: 'rgba(82, 196, 26, 1)',
      data: [110, 160, 240, 400, 660, 750, 810, 800, 831, 720, 540, 360, 200]
    }
  ]
})

// ============================================================
// 江阴大桥 24 小时流量（柱状图，双系列）
// ============================================================
const bridgeHourlyData = ref({
  xAxis: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  series: [
    {
      name: '北京方向',
      color: 'rgba(24, 144, 255, 1)',
      data: [200, 320, 480, 720, 980, 1120, 1280, 1200, 1180, 1040, 820, 560, 340]
    },
    {
      name: '上海方向',
      color: 'rgba(82, 196, 26, 1)',
      data: [190, 300, 460, 700, 960, 1100, 1260, 1180, 1160, 1020, 800, 540, 320]
    }
  ]
})

// ============================================================
// 车型分布（饼图，客车 / 货车）
// 隧道：客车 22350 / 货车 16270
// 大桥：客车 66109 / 货车 16270
// ============================================================
const tunnelVehicleData = ref({
  label: '江阴靖江长江隧道',
  items: [
    { name: '客车', value: 22350, color: 'rgba(24, 144, 255, 1)' },
    { name: '货车', value: 16270, color: 'rgba(250, 140, 22, 1)' }
  ]
})

const bridgeVehicleData = ref({
  label: '江阴大桥',
  items: [
    { name: '客车', value: 66109, color: 'rgba(24, 144, 255, 1)' },
    { name: '货车', value: 16270, color: 'rgba(250, 140, 22, 1)' }
  ]
})

// ============================================================
// 流量预测（面积图，实际流量 / 预测流量 + 准确率标注）
// x 轴：2小时前 - 2小时后
// ============================================================
const activeLocation = ref('江阴靖江长江隧道')

const predictionDataMap = {
  江阴靖江长江隧道: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    series: [
      { name: '实际流量', color: 'rgba(24, 144, 255, 1)', data: [1800, 2400, 3100, null, null] },
      { name: '预测流量', color: 'rgba(82, 196, 26, 1)', data: [null, null, 3100, 2800, 2200] }
    ],
    accuracy: [
      { text: '准确率98%', color: 'rgba(82, 196, 26, 1)' },
      { text: '准确率96%', color: 'rgba(82, 196, 26, 1)' },
      { text: '准确率92%', color: 'rgba(82, 196, 26, 1)' }
    ]
  },
  江阴大桥: {
    xAxis: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
    series: [
      { name: '实际流量', color: 'rgba(24, 144, 255, 1)', data: [2600, 3200, 3800, null, null] },
      { name: '预测流量', color: 'rgba(82, 196, 26, 1)', data: [null, null, 3800, 3400, 2900] }
    ],
    accuracy: [
      { text: '准确率98%', color: 'rgba(82, 196, 26, 1)' },
      { text: '准确率96%', color: 'rgba(82, 196, 26, 1)' },
      { text: '准确率92%', color: 'rgba(82, 196, 26, 1)' }
    ]
  }
}

// 根据当前选中地点计算预测数据
const predictionData = computed(() => predictionDataMap[activeLocation.value] || predictionDataMap['江阴靖江长江隧道'])

// ============================================================
// 地点切换（供 FlowPrediction 的 @location-change 使用）
// ============================================================
const handleLocationChange = (location) => {
  if (activeLocation.value === location) return
  activeLocation.value = location
}

// 监听地点切换，可在此扩展数据刷新逻辑（数据已由 computed 响应式驱动）
watch(activeLocation, (newLocation) => {
  console.log('[流量监测] 预测地点切换:', newLocation)
})
</script>
