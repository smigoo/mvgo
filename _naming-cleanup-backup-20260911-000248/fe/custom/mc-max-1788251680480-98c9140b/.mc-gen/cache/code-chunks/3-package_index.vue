<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import MonitorTypeTabs from './components/MonitorTypeTabs.vue'
import HeaderControls from './components/HeaderControls.vue'
import ChartArea from './components/ChartArea.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === onload 事件触发 ===
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
  // 主组件清理逻辑（子组件各自处理自己的清理）
})
</script>
