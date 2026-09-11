<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import DailyTotalSection from './components/DailyTotalSection.vue'
import TunnelChartSection from './components/TunnelChartSection.vue'
import BridgeChartSection from './components/BridgeChartSection.vue'
import VehicleDistributionSection from './components/VehicleDistributionSection.vue'
import FlowPredictionSection from './components/FlowPredictionSection.vue'
// === $mcComponentBuilder 调用（只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 地点切换状态 ===
const locations = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])
const activeLocation = ref('tunnel')
// === 当日总流量数据 ===
const tunnelTotalData = ref({
  label: '江阴靖江长江隧道',
  value: 34620
})

const bridgeTotalData = ref({
  label: '江阴大桥',
  value: 82379
})
// === 小时流量图表数据 ===
const tunnelChartData = ref({
  xAxisData: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  series: [
    {
      name: '北京方向',
      data: [200, 300, 400, 500, 800, 1200, 1800, 2200, 2500, 2800, 2400, 1800, 1200]
    },
    {
      name: '上海方向',
      data: [180, 280, 380, 480, 780, 1180, 1780, 2180, 2480, 2780, 2380, 1780, 1180]
    }
  ]
})

const bridgeChartData = ref({
  xAxisData: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
  series: [
    {
      name: '北京方向',
      data: [300, 400, 500, 600, 900, 1300, 1900, 2300, 2600, 2900, 2500, 1900, 1300]
    },
    {
      name: '上海方向',
      data: [280, 380, 480, 580, 880, 1280, 1880, 2280, 2580, 2880, 2480, 1880, 1280]
    }
  ]
})
// === 车型分布数据 ===
const tunnelVehicleData = ref({
  label: '江阴靖江长江隧道',
  pieData: [
    { name: '客车', value: 22350, color: '#1890ff' },
    { name: '货车', value: 16270, color: '#ff7a45' }
  ]
})

const bridgeVehicleData = ref({
  label: '江阴大桥',
  pieData: [
    { name: '客车', value: 66109, color: '#1890ff' },
    { name: '货车', value: 16270, color: '#ff7a45' }
  ]
})
// === 流量预测数据 ===
const predictionData = ref({
  xAxisData: ['2小时前', '1小时前', '当前时间', '1小时后', '2小时后'],
  accuracyLabels: ['准确率98%', '准确率96%', '准确率92%', '', ''],
  series: [
    {
      name: '实际流量',
      data: [2800, 3200, 3500, null, null]
    },
    {
      name: '预测流量',
      data: [null, null, 3500, 3800, 4200]
    }
  ]
})
// === 监听地点切换 ===
watch(activeLocation, (newLocation) => {
  console.log('[Monitor] 地点切换:', newLocation)
  // 地点切换时各子组件会根据 activeLocation prop 自动更新显示内容
})
// === 组件加载事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理资源（如有）
})
</script>
