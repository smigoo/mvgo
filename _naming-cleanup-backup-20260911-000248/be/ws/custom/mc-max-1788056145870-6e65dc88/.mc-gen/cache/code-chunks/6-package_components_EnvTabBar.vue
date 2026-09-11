<template>
  <div class="c-env-monitor-tab-bar">
    <div
      v-for="tab in tabs"
      :key="tab.value"
      :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.value }]"
      :style="activeTab === tab.value ? { backgroundImage: `url(${bg3})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : {}"
      @click="handleTabChange(tab.value)"
    >
      <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor_light' },
  { label: '洞外光强', value: 'outdoor_light' }
]

const activeTab = ref('co')
const emit = defineEmits(['change'])

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  emit('change', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tab-bar {
  display: flex;
  align-items: center;
  height: 27px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  padding: 3px;
}

.c-env-monitor-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  cursor: pointer;
  position: relative;
  transition: all 0.3s;
}

.c-env-monitor-tab-text {
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  white-space: nowrap;
  position: relative;
  z-index: 1;
}

.c-env-monitor-tab-item.is-active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
}
</style>