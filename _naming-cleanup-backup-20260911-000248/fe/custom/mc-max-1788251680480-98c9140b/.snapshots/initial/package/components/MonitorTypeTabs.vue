<template>
  <div class="c-env-monitor-tabs-wrapper" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <div 
      v-for="tab in tabs" 
      :key="tab.value"
      :class="['c-env-monitor-tab-item', { 'c-env-monitor-tab-item--active': activeTab === tab.value }]"
      :style="activeTab === tab.value ? { backgroundImage: `url(${bgtabActive})` } : {}"
      @click="handleTabClick(tab.value)"
    >
      {{ tab.label }}
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bgtabActive from '../../resources/images/bg-tab-active-7891.png'


// Tab 选项（从设计稿提取）
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' },
  { label: '能见度', value: 'visibility' }
])

// 当前激活的 tab（默认第一个）
const activeTab = ref('co')

// Tab 切换处理
const handleTabClick = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  // 父组件通过监听此事件更新数据
  // 这里仅切换视觉状态，数据更新由父组件处理
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>