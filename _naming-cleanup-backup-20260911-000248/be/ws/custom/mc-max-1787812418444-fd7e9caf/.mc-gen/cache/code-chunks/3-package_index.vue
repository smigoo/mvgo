<script setup>
import { onMounted } from 'vue'
// 子组件引入（与 template 中引用保持一致）
import HeaderStats from './components/HeaderStats.vue'
import SummaryCards from './components/SummaryCards.vue'
import SidebarNav from './components/SidebarNav.vue'
import DeviceListArea from './components/DeviceListArea.vue'

// 微码组件构建器：一次调用并直接解构（声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
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