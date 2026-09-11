<script setup>
import { onMounted } from 'vue'
import TabSwitch from './components/TabSwitch.vue'
import StatsIndicator from './components/StatsIndicator.vue'
import ChartArea from './components/ChartArea.vue'

// $mcComponentBuilder 只能调用一次，直接解构（声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>