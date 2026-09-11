<script setup>
import { ref, onMounted } from 'vue'
import SectionTitle from './components/SectionTitle.vue'
import SectionTabs from './components/SectionTabs.vue'
import SectionChart from './components/SectionChart.vue'

// 1. 一次调用 $mcComponentBuilder 并直接解构（声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 主组件状态管理
const activeTab = ref('一氧化碳')

// 3. 事件处理
const handleTabChange = (tab) => {
  activeTab.value = tab
}

// 4. 生命周期：触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>