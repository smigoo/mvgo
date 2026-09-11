<script setup>
import { onMounted } from 'vue'

// 1. 一次调用 $mcComponentBuilder 并直接解构（const 解构=声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 在 onMounted 中触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>