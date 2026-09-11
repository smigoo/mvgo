<template>
  <div class="c-env-monitor-tabs-section">
    <div class="c-env-monitor-tabs-list" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        class="c-env-monitor-tab-item"
        :class="{ 'c-env-monitor-tab-item--active': activeTab === tab.value }"
        :style="activeTab === tab.value ? { backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : {}"
        @click="handleTabClick(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>
    <div class="c-env-monitor-tabs-icons">
      <img :src="icon1" class="c-env-monitor-tab-icon" alt="柱状图视图" title="柱状图视图" />
      <div class="c-env-monitor-tab-icon-wrapper">
        <img :src="icon2" class="c-env-monitor-tab-icon" alt="列表视图" title="列表视图" />
        <div class="c-env-monitor-tab-badge">6</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'


import { ref} from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'co'
  }
})

const emit = defineEmits(['update:modelValue', 'tab-change'])

const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'indoor-light' },
  { label: '洞外光强', value: 'outdoor-light' }
]

const activeTab = ref(props.modelValue || 'co')

const handleTabClick = (value) => {
  activeTab.value = value
  emit('update:modelValue', value)
  emit('tab-change', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-section {
width: 100%;

  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  flex-shrink: 0;
  padding: 0 4px;
}

.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  overflow: hidden;
}

.c-env-monitor-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  height: 21px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 500;
  color: #2c9bea;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.2s;

  &--active {
    color: #ffffff;
    text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
    background-size: 100% 100%;
    background-position: center center;
    background-repeat: no-repeat;
  }
}

.c-env-monitor-tabs-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-tab-icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.c-env-monitor-tab-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: block;
}

.c-env-monitor-tab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'PingFang SC', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 500;
  color: #ffffff;
  line-height: 14px;
}
</style>