<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import StatusBadges from './components/StatusBadges.vue'
import DeviceGrid from './components/DeviceGrid.vue'

// 微码组件构建器：只能调用一次，直接解构（声明+赋值一体，避免 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件加载完成事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>