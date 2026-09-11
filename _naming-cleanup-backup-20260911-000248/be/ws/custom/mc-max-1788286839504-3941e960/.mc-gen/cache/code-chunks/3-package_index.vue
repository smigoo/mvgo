<script setup>
import { onMounted } from 'vue'
import HeaderTabs from './components/HeaderTabs.vue'
import StatsRow from './components/StatsRow.vue'
import ChartContainer from './components/ChartContainer.vue'

// 直接解构 $mcComponentBuilder（声明+赋值一体，只调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>
