<template>
  <div 
    class="c-monitor-left-nav"
    :style="{ 
      backgroundImage: `url(${bg14})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }"
  >
    <div
      v-for="item in navItems"
      :key="item.key"
      :class="['c-monitor-nav-item', { 'c-monitor-nav-item--active': item.active }]"
      @click="handleNavClick(item.key)"
    >
      <span class="c-monitor-nav-text">{{ item.label }}</span>
      <span v-if="item.badge" class="c-monitor-nav-badge">{{ item.badge }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 背景图资源（系统注入）
const bg14 = 'data:image/png;base64,...'  // 系统自动注入

// 导航项数据（根据设计稿文字清单）
const navItems = ref([
  { key: 'excavator', label: '挖掘机', badge: '3/740', active: true },
  { key: 'control', label: '控制', badge: '3', active: false },
  { key: 'lighting', label: '照明', badge: '', active: false },
  { key: 'ventilation', label: '通风', badge: '', active: false },
  { key: 'power', label: '供配电', badge: '', active: false },
  { key: 'fire', label: '消防', badge: '', active: false },
  { key: 'traffic', label: '交通设施', badge: '', active: false }
])

// 点击导航项
const handleNavClick = (key) => {
  navItems.value.forEach(item => {
    item.active = item.key === key
  })
  console.log('[LeftNav] 导航切换:', key)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-left-nav {
  display: flex;
  flex-direction: column;
  width: 46px;
  height: 100%;
  padding: 8px 0;
  box-sizing: border-box;
}

.c-monitor-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  margin-bottom: 4px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.3s ease;
  background: transparent;

  &:hover {
    background: rgba(24, 144, 255, 0.1);
  }

  &--active {
    background: linear-gradient(135deg, rgba(24, 144, 255, 0.9) 0%, rgba(8, 163, 165, 0.8) 100%);

    .c-monitor-nav-text {
      color: rgba(255, 255, 255, 1);
      font-weight: 700;
    }

    .c-monitor-nav-badge {
      background: rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 1);
    }
  }
}

.c-monitor-nav-text {
  font-size: calc(@fontSize * 1);
  color: rgba(51, 51, 51, 1);
  text-align: center;
  line-height: 1.2;
  word-break: break-all;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  transition: color 0.3s ease;
}

.c-monitor-nav-badge {
  margin-top: 4px;
  padding: 2px 6px;
  font-size: calc(@fontSize * 0.857);
  color: rgba(24, 144, 255, 1);
  background: rgba(24, 144, 255, 0.1);
  border-radius: 10px;
  white-space: nowrap;
  transition: all 0.3s ease;
}
</style>
