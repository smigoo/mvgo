<template>
  <base-panel class="c-mc-max-1788176720155-9560d082" panelKey="default-panel">
    <div class="c-env-monitor-root" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <!-- 环境类型切换区 -->
      <HeaderTabs
        :tabs="tabs"
        :active-tab="activeTab"
        :icon-chart="icon1"
        :icon-list="icon2"
        :badge-count="8"
        @tab-change="handleTabChange"
      />
      <!-- 趋势图表区 -->
      <ChartArea />
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-7890.png'
import icon1 from '../resources/images/icon-7941.png'
import icon2 from '../resources/images/icon-7945.png'
import { ref, onMounted, onUnmounted } from 'vue'

import HeaderTabs from './components/HeaderTabs.vue'
import ChartArea from './components/ChartArea.vue'

// 环境类型 tabs（vision 真值：大气/水质/土壤，默认激活「大气」）
const tabs = ref([
  { label: '大气', value: 'air' },
  { label: '水质', value: 'water' },
  { label: '土壤', value: 'soil' },
])
const activeTab = ref('air')
const handleTabChange = (value) => {
  activeTab.value = value
}

// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === onload 事件触发 ===
const emitLoadEvent = () => {
  if (!runtimeBuilder?.publishEvent) {
    console.warn('[env-monitor] runtimeBuilder.publishEvent 不可用')
    return
  }

  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'c-env-monitor',
    timestamp: Date.now()
  })
}
// === 生命周期 ===
onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 清理逻辑（如有需要）
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
