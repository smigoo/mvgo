<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, computed } from 'vue'
import DeviceStatusChart from './components/DeviceStatusChart.vue'
import DeviceTrendChart from './components/DeviceTrendChart.vue'
import DeviceAlarmList from './components/DeviceAlarmList.vue'

// --- 框架初始化 ---
let runtimeBuilder = null
let componentProps = {}
let businessProps = {}
let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi
} catch (e) {
  console.warn('[DeviceMonitor] $mcComponentBuilder 初始化失败:', e)
}

// --- 响应式状态 ---
const stats = reactive({
  total: 0,
  online: 0,
  offline: 0,
  error: 0
})

// --- 数据获取 ---
const fetchDeviceStats = async () => {
  try {
    if (componentApi) {
      // 实际项目中调用 API
      // const res = await componentApi.getCommonApiFindOne({}, 'deviceStats')
      // Object.assign(stats, res)
    }
    
    // 预览阶段使用模拟数据
    stats.total = 1250
    stats.online = 1180
    stats.offline = 50
    stats.error = 20
  } catch (err) {
    console.error('[DeviceMonitor] 获取设备统计数据失败:', err)
  }
}

// --- 生命周期 ---
onMounted(() => {
  fetchDeviceStats()
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-device-monitor',
      timestamp: Date.now()
    })
  }
})
</script>