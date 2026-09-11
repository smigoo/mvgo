<script setup>
import { onMounted } from 'vue'
import HeaderTabs from './components/HeaderTabs.vue'
import HeaderRightControls from './components/HeaderRightControls.vue'
import ChartArea from './components/ChartArea.vue'

// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发 onload 事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>