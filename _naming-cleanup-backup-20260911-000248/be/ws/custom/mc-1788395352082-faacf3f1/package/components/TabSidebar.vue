<template>
  <div class="c-monitor-tab-sidebar">
    <div 
      v-for="tab in tabs" 
      :key="tab.value"
      :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === tab.value }]"
      @click="handleTabChange(tab.value)"
    >
      <span class="c-monitor-tab-text" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ tab.label }}</span>
      <span v-if="tab.badge" class="c-monitor-tab-badge" :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ tab.badge }}</span>
    </div>
  </div>
</template>

<script setup>
import bg4 from '../../resources/images/bg-8439.png'
const bg5 = bg4


import { ref} from 'vue'

const tabs = ref([
  { label: '监控', value: 'monitor', badge: '3' },
  { label: '照明', value: 'lighting', badge: '3' },
  { label: '通风', value: 'ventilation' },
  { label: '供配电', value: 'power' },
  { label: '消防', value: 'fire' },
  { label: '交通诱导', value: 'traffic' }
])

const activeTab = ref('monitor')

const handleTabChange = (value) => {
  activeTab.value = value
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>