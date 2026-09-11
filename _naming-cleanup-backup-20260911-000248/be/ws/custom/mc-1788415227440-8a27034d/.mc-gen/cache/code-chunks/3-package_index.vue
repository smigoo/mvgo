<script setup>
import { onMounted } from 'vue'
import HeaderStatsBanner from './components/HeaderStatsBanner.vue'
import DeviceCategoryTabs from './components/DeviceCategoryTabs.vue'
import MainContent from './components/MainContent.vue'

// $mcComponentBuilder 直接解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 在 onMounted 中触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>