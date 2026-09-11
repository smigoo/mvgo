<script setup>
import { ref, onMounted } from 'vue'
import TabSwitch from './components/TabSwitch.vue'
import ChartArea from './components/ChartArea.vue'

// $mcComponentBuilder 调用（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 当前激活的 tab
const activeTab = ref('co')

// Tab 切换处理
const handleTabChange = (tabValue) => {
  activeTab.value = tabValue
}

// onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
})
</script>
