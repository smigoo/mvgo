<template>
  <div class="c-env-monitor-tabs-root">
    <div class="c-env-monitor-tabs-list">
      <div class="c-env-monitor-tabs-bg"></div>
<div class="c-env-monitor-tabs-active-bg" :style="{ left: `calc(${activeIndex} * (100% / ${tabs.length}))`, width: `calc(100% / ${tabs.length})`, backgroundImage: `url(${activeBg})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }" ></div>
<div v-for="tab in tabs" :key="tab.key" :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]" @click="handleTabClick(tab.key)" >
        {{ tab.label }}
      </div>
    </div>

    <div class="c-env-monitor-tabs-icons">
      <div class="c-env-monitor-tabs-icon-wrapper">
        <img :src="tabIcon" class="c-env-monitor-tabs-icon-img" alt="视图切换" />
        <div class="c-env-monitor-tabs-badge">6</div>
      </div>
    </div>
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
  activeBg: {
    type: String,
    default: ''
  },
  tabIcon: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['tab-change'])

const activeIndex = computed(() => { return props.tabs.findIndex(t => t.key === props.activeTab) })

const handleTabClick = (key) => { if (props.activeTab !== key) { emit('tab-change', key) }
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-root {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
}

.c-env-monitor-tabs-list {
  position: relative;
  flex: 1;
  height: 27px;
  margin-right: 12px;
}

.c-env-monitor-tabs-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
}

.c-env-monitor-tabs-active-bg {
  position: absolute;
  top: 3px;
  height: 21px;
  transition: left 0.3s ease;
}

.c-env-monitor-tab-item {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  cursor: pointer;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  transition: color 0.3s;

  &.is-active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-tabs-icons {
  flex-shrink: 0;
}

.c-env-monitor-tabs-icon-wrapper {
  position: relative;
  width: 52px;
  height: 24px;
}

.c-env-monitor-tabs-icon-img {
  width: 52px;
  height: 24px;
  display: block;
}

.c-env-monitor-tabs-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  border-radius: 29px;
  background: #f53f3f;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
}
</style>