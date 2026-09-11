<script setup>
import { ref, onMounted } from 'vue'
import PanelTitle from './components/PanelTitle.vue'
import SectionTabsAndIcons from './components/SectionTabsAndIcons.vue'
import SectionChart from './components/SectionChart.vue'

// 1. 一次调用 $mcComponentBuilder 并直接解构
const { runtimeBuilder } = $mcComponentBuilder()

// 2. 主组件状态：当前激活的 Tab（默认一氧化碳）
const activeTab = ref('一氧化碳')

// 3. 触发组件加载完成事件
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>