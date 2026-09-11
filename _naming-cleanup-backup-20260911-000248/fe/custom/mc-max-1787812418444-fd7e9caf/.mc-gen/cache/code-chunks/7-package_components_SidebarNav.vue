<template>
  <div class="c-monitor-sidebar-nav">
    <div
      v-for="tab in tabs"
      :key="tab.key"
      :class="['c-monitor-nav-item', { 'is-active': activeTab === tab.key }]"
      @click="handleTabClick(tab.key)"
    >
      <span class="c-monitor-nav-label">{{ tab.label }}</span>
      <div v-if="tab.stat" class="c-monitor-nav-stat">
        <span>{{ tab.stat }}</span>
      </div>
      <div v-if="tab.badge" class="c-monitor-nav-badge">
        <span>{{ tab.badge }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const tabs = ref([
  { key: 'monitor', label: '监控', stat: '3/3740' },
  { key: 'lighting', label: '照明', badge: '3' },
  { key: 'ventilation', label: '通风' },
  { key: 'fire', label: '消防' },
  { key: 'traffic', label: '交通诱导' },
  { key: 'power', label: '供配电' }
])

const activeTab = ref('monitor')

const handleTabClick = (key) => {
  activeTab.value = key
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-sidebar-nav {
  display: flex;
  flex-direction: column;
  width: 46px;
  flex-shrink: 0;
  gap: 4px;
}

.c-monitor-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  cursor: pointer;
  position: relative;
  background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
  border: 1px solid rgba(240, 245, 255, 1);
  border-radius: 6px 6px 0 0;
  min-height: 40px;
  transition: all 0.3s;

  &.is-active {
    background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
    border-radius: 0 6px 6px 0;
    
    .c-monitor-nav-label {
      color: #ffffff;
      font-weight: 700;
    }
  }
}

.c-monitor-nav-label {
  font-size: 14px;
  color: #3b80e7;
  font-weight: 400;
  text-align: center;
  line-height: 16px;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 2px;
}

.c-monitor-nav-stat {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid rgba(37, 141, 200, 1);
  border-radius: 4px 4px 4px 0;
  box-shadow: 0 1px 2px 0 rgba(51, 101, 144, 0.4);
  padding: 0 4px;
  margin-top: 4px;
  
  span {
    font-size: 12px;
    font-weight: 500;
    color: #333333;
    white-space: nowrap;
  }
}

.c-monitor-nav-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  span {
    font-size: 10px;
    font-weight: 500;
    color: #ffffff;
    line-height: 1;
  }
}
</style>