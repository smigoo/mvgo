<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import DeviceGrid from './components/DeviceGrid.vue'
import LeftNav from './components/LeftNav.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === onMounted 生命周期 ===
onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'c-monitor',
    timestamp: Date.now()
  })
})
</script>
