<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import StatsHeader from './components/StatsHeader.vue'
import CategoryNav from './components/CategoryNav.vue'
import DeviceGrid from './components/DeviceGrid.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 组件加载事件触发 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[cp-设备监测] runtimeBuilder.publishEvent 不可用')
    return
  }
  
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}
// === 生命周期钩子 ===
onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 预留清理逻辑位置
})
</script>
