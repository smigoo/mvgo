<template>
  <div class="c-monitor-left-nav">
    <div
      v-for="(item, index) in navItems"
      :key="index"
      :class="['c-monitor-nav-item', { 'c-monitor-nav-item--active': item.active }]"
      @click="handleNavClick(index)"
    >
      <div class="c-monitor-nav-text">{{ item.label }}</div>
      <div v-if="item.sub" class="c-monitor-nav-sub">{{ item.sub }}</div>
      <div v-if="item.badge" class="c-monitor-nav-badge">{{ item.badge }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const navItems = ref([
  { label: '监控', sub: '3/3740', active: true },
  { label: '照明', badge: '3' },
  { label: '通风' },
  { label: '消防' },
  { label: '交通诱导' },
  { label: '供配电' }
])

const handleNavClick = (index) => {
  navItems.value.forEach((item, i) => {
    item.active = i === index
  })
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-left-nav {
  position: absolute;
  left: 0;
  top: 0;
  width: 46px;
  height: 100%;
  background: rgba(89, 196, 255, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 16px;
  gap: 12px;
  z-index: 10;
  box-sizing: border-box;
}

.c-monitor-nav-item {
  width: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  border-radius: 4px;
  padding: 8px 0;
  transition: all 0.3s;

  &--active {
    background: rgba(25, 144, 255, 0.15);
    
    .c-monitor-nav-text {
      color: rgba(25, 144, 255, 1);
      font-weight: 700;
    }
  }
}

.c-monitor-nav-text {
  font-size: @fontSize;
  color: rgba(89, 196, 255, 1);
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 2px;
  line-height: 16px;
}

.c-monitor-nav-sub {
  font-size: calc(@fontSize * 0.857);
  color: rgba(25, 144, 255, 1);
  font-weight: 500;
  margin-top: 4px;
  white-space: nowrap;
}

.c-monitor-nav-badge {
  position: absolute;
  top: 4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: rgba(255, 59, 48, 1);
  border-radius: 50%;
  color: #ffffff;
  font-size: calc(@fontSize * 0.714);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
</style>