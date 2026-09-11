<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import SummaryCards from './components/SummaryCards.vue'
import DeviceGrid from './components/DeviceGrid.vue'
import SidebarNav from './components/SidebarNav.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 触发 onload 事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>