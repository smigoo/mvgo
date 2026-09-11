<script setup>
import { onMounted } from 'vue'
import { defineAsyncComponent } from 'vue'

const HeaderStats = defineAsyncComponent(() => import('./components/HeaderStats.vue'))
const SummaryCards = defineAsyncComponent(() => import('./components/SummaryCards.vue'))
const MainContent = defineAsyncComponent(() => import('./components/MainContent.vue'))
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
let runtimeBuilder = null
try {
  const builderResult = $mcComponentBuilder()
  runtimeBuilder = builderResult?.runtimeBuilder || null
} catch (e) {
  console.warn('[设备监测] $mcComponentBuilder 调用失败:', e)
}
// === 触发 onload 事件 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[设备监测] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  try {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  } catch (e) {
    console.error('[设备监测] 发布 monitor-onload 事件失败:', e)
  }
}

onMounted(() => {
  emitLoadEvent()
})
</script>
