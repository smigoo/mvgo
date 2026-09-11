<script setup>
import { onMounted } from 'vue'
import HeaderControls from './components/HeaderControls.vue'
import EnvTabBar from './components/EnvTabBar.vue'
import ChartSection from './components/ChartSection.vue'

// ✅ $mcComponentBuilder 直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// ✅ onMounted 中触发 onload 事件
onMounted(() => {
  if (runtimeBuilder?.publishEvent) {
    runtimeBuilder.publishEvent('env-monitor-onload', {
      componentId: 'c-env-monitor',
      timestamp: Date.now()
    })
  }
})
</script>
