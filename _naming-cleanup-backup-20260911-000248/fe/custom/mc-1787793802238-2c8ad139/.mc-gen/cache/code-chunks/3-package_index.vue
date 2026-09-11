<script setup>
import { onMounted } from 'vue'

// 一次性调用并解构 $mcComponentBuilder
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// bg1、bg2 背景图资源由微码加载器自动注入，无需手动 import

// 组件挂载后触发加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>