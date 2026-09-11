<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import TabSwitch from './components/TabSwitch.vue'
import StatsIndicator from './components/StatsIndicator.vue'
import ChartArea from './components/ChartArea.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 在 onMounted 中触发 onload 事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理资源（子组件各自处理自己的清理逻辑）
})
</script>
