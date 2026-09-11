<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import MainStats from './components/MainStats.vue'
import DeviceGrid from './components/DeviceGrid.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
let componentProps = {}
let businessProps = {}
let runtimeBuilder = null
let componentApi = null

try {
  const builderResult = $mcComponentBuilder()
  componentProps = builderResult.componentProps || {}
  businessProps = builderResult.businessProps || {}
  runtimeBuilder = builderResult.runtimeBuilder || null
  componentApi = builderResult.componentApi || null
} catch (err) {
  console.warn('[设备监测] $mcComponentBuilder 调用失败:', err)
}
// === 触发 onload 事件 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[设备监测] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  try {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-device-monitor',
      timestamp: Date.now()
    })
    console.log('[设备监测] 已触发 monitor-onload 事件')
  } catch (err) {
    console.error('[设备监测] 触发 onload 事件失败:', err)
  }
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理逻辑（如有需要）
})
</script>
