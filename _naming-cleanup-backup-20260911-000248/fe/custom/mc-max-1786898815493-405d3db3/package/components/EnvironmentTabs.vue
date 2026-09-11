<template>
  <div class="c-env-monitor-tabs">
    <div class="c-env-monitor-tabs-list">
<div v-for="tab in tabs" :key="tab.key" class="c-env-monitor-tab-item" :class="{ 'c-env-monitor-tab-item--active': activeTab === tab.key }" :style="activeTab === tab.key ? activeTabStyle : undefined" @click="handleTabClick(tab.key)" >
        <span class="c-env-monitor-tab-item__label">{{ tab.label }}</span>
      </div>
    </div>
<img v-if="tabIcon" :src="tabIcon" class="c-env-monitor-tabs-icon" alt="" />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ tabs: { type: Array, default: () => []
  },
  activeTab: {
    type: String,
    default: ''
  },
  activeBackground: {
    type: String,
    default: ''
  },
  tabIcon: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['tab-change'])

const activeTabStyle = computed(() => { if (!props.activeBackground) return {}
  return {
    backgroundImage: `url(${props.activeBackground})`,
    backgroundSize: '100% 100%',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat'
  }
})

const handleTabClick = (key) => { if (props.activeTab === key) return emit('tab-change', key) }
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 8px;
}

.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  height: 27px;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.c-env-monitor-tab-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 21px;
  padding: 0 12px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.c-env-monitor-tab-item__label {
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  text-align: left;
  color: #2c9bea;
  white-space: nowrap;
}

.c-env-monitor-tab-item--active {
  .c-env-monitor-tab-item__label {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-tabs-icon {
  width: 52px;
  height: 24px;
  flex-shrink: 0;
  object-fit: contain;
  display: block;
}
</style>