<template>
  <div class="c-monitor-category-tabs" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
    <div
      v-for="tab in tabs"
      :key="tab.key"
      :class="['c-monitor-tab-item', { 'is-active': activeTab === tab.key, 'has-badge': tab.badge }]"
      @click="handleTabClick(tab.key)"
    >
      <span class="c-monitor-tab-text">{{ tab.label }}</span>
      <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const bg3 = 'data:image/png;base64,...' // 系统注入

const tabs = ref([
  { key: 'jk', label: '监控', badge: '3' },
  { key: 'zm', label: '照明', badge: '' },
  { key: 'tf', label: '通风', badge: '' },
  { key: 'gpd', label: '供配电', badge: '' },
  { key: 'xf', label: '消防', badge: '' },
  { key: 'jtyd', label: '交通诱导', badge: '' }
])

const activeTab = ref('jk')

const handleTabClick = (key) => {
  activeTab.value = key
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-category-tabs {
  display: flex;
  flex-direction: column;
  width: 46px;
  height: 100%;
  gap: 0;
}

.c-monitor-tab-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  cursor: pointer;
  border-top-left-radius: 6px;
  border-bottom-left-radius: 6px;
  background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
  border: 1px solid rgba(240, 245, 255, 1);
  border-right: none;
  transition: all 0.3s;

  &.is-active {
    background: linear-gradient(180deg, #318aff 0%, #70bfff 100%);
    border-color: rgba(240, 245, 255, 1);

    .c-monitor-tab-text {
      color: #ffffff;
      font-weight: 700;
    }
  }

  &:not(.is-active) {
    .c-monitor-tab-text {
      color: #3b80e7;
      font-weight: 400;
    }
  }
}

.c-monitor-tab-text {
  font-family: Source Han Sans CN;
  font-size: 14px;
  line-height: 18px;
  text-align: center;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}

.c-monitor-tab-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ff4d4f;
  border-radius: 14px;
  color: #ffffff;
  font-family: Roboto;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
}
</style>
```