<template>
  <div class="c-env-monitor-tabs-section">
    <div class="c-env-monitor-tabs-container" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <div 
        v-for="tab in tabs" 
        :key="tab.value"
        :class="['c-env-monitor-tab-item', { active: activeTab === tab.value }]"
        @click="$emit('tab-change', tab.value)"
      >
        <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'


import { ref} from 'vue'

defineProps({
  activeTab: {
    type: String,
    default: 'co'
  },
  bg2: {
    type: String,
    default: ''
  }
})

defineEmits(['tab-change'])

const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-section {
width: 100%;

  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0;
}

.c-env-monitor-tabs-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0;
  padding: 3px;
  height: 27px;
}

.c-env-monitor-tab-item {
  position: relative;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-env-monitor-tab-text {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  transition: all 0.3s;
}

.c-env-monitor-tab-item.active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-tab-item.active {
  background: linear-gradient(180deg, #1099b1 0%, #038fff 100%);
  border: 0.6px solid rgba(255, 255, 255, 1);
}
</style>