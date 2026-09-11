<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import EnvStatsOverview from './components/EnvStatsOverview.vue'
import EnvMonitorTabs from './components/EnvMonitorTabs.vue'
import EnvMonitorChart from './components/EnvMonitorChart.vue'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[c-env-monitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---
const pointCount = ref(128)
const alarmCount = ref(3)

const monitorTabs = ref([
  { key: 'temperature', label: '温度' },
  { key: 'humidity', label: '湿度' },
  { key: 'co2', label: 'CO2浓度' },
  { key: 'visibility', label: '能见度' }
])

const activeTab = ref('temperature')

// --- 事件处理 ---
const handleTabChange = (tabKey) => {
  activeTab.value = tabKey
}

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'c-env-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理监听或定时器
})
</script>