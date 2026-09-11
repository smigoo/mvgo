<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

let runtimeBuilder = null
let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentApi = builder?.componentApi
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const deviceStats = ref({
  total: 0,
  online: 0,
  offline: 0,
  fault: 0
})

const fetchDeviceStats = async () => {
  try {
    if (componentApi) {
      const res = await componentApi.getCommonApiFindOne({}, 'deviceStats')
      if (res) {
        deviceStats.value = {
          total: res.total ?? 0,
          online: res.online ?? 0,
          offline: res.offline ?? 0,
          fault: res.fault ?? 0
        }
        return
      }
    }
  } catch (e) {
    console.warn('[组件] 获取设备统计数据失败:', e)
  }
  
  // 降级模拟数据
  deviceStats.value = {
    total: 128,
    online: 115,
    offline: 8,
    fault: 5
  }
}

onMounted(() => {
  fetchDeviceStats()
  
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785977550903-5ec08759-onload', {
      componentId: 'mc-1785977550903-5ec08759',
      timestamp: Date.now()
    })
  }
})
</script>