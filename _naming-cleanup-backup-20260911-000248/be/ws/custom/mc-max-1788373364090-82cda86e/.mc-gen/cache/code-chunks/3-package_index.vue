<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import SummaryCards from './components/SummaryCards.vue'
import TabAndContent from './components/TabAndContent.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
let runtimeBuilder = null
try {
  const builderResult = $mcComponentBuilder()
  if (builderResult && typeof builderResult === 'object') {
    runtimeBuilder = builderResult.runtimeBuilder || null
  }
} catch (e) {
  console.warn('[设备监测] $mcComponentBuilder 调用失败:', e)
}
// === 组件加载事件 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder || typeof runtimeBuilder.publishEvent !== 'function') {
    console.warn('[设备监测] runtimeBuilder 不可用，跳过 onload 事件')
    return
  }

  try {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-monitor',
      timestamp: Date.now()
    })
    console.log('[设备监测] 已发布 monitor-onload 事件')
  } catch (e) {
    console.error('[设备监测] 发布 onload 事件失败:', e)
  }
}

onMounted(() => {
  emitLoadEvent()
})
</script>
