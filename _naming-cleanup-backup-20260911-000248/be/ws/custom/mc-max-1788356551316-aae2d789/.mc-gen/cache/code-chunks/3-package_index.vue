<script setup>
import { ref, onMounted } from 'vue'
import TabSwitcher from './components/TabSwitcher.vue'
import StatsControls from './components/StatsControls.vue'
import ChartArea from './components/ChartArea.vue'

// $mcComponentBuilder 解构（只调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 视图模式：图表/列表
const viewMode = ref('chart')

// 当前激活的 Tab
const activeTab = ref('一氧化碳')

// 统计数值区状态
const currentValue = ref('40')
const locationText = ref('zk3+785CO浓度')
const thresholdText = ref('预警线')

// Tab 切换处理
const handleTabChange = (tab) => {
  activeTab.value = tab
}

onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
})
</script>