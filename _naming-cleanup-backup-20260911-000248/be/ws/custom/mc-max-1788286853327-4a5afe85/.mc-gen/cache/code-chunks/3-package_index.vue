<script setup>
import { onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import LeftNav from './components/LeftNav.vue'
import FeaturedDevices from './components/FeaturedDevices.vue'
import DeviceGrid from './components/DeviceGrid.vue'

// $mcComponentBuilder 调用（仅此一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// onMounted 触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>
