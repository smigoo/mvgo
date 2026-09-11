<template>
  <div class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-tabs-section">
    <div class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-tabs-list" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <div
        v-for="(tab, index) in tabs"
        :key="index"
        class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-tab-item"
        :class="{ 'c-env-monitor-tab-item--active': activeTabIndex === index }"
        @click="handleTabClick(index)"
      >
        {{ tab }}
      </div>
    </div>
    <div class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-tabs-icon">
      <img :src="icon1" class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-icon" />
      <img :src="icon2" class="c-mc-max-1788079803376-fa9304eb-c-env-monitor-icon" />
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'
import bg3 from '../../resources/images/bg-tab-active-7891.png'

import { ref} from 'vue'

// 标签页数据
const tabs = ref(['一氧化碳', '洞内照明', '洞外光强', '能见度'])
const activeTabIndex = ref(0)

// 标签页点击事件
const handleTabClick = (index) => {
  activeTabIndex.value = index
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  flex-shrink: 0;
}

.c-env-monitor-tabs-list {
  display: flex;
  align-items: center;
  gap: 0;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 3px;
  overflow: hidden;
}

.c-env-monitor-tab-item {
  position: relative;
  padding: 5px 14px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-env-monitor-tab-item--active {
  background-image: url(bg3);
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  color: #ffffff;
  text-shadow: 0px 0.6px 0px rgba(0, 111, 227, 1);
}

.c-env-monitor-tabs-icon {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}
</style>