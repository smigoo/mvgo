<template>
  <div 
    class="c-monitor-sidebar"
    :style="{ 
      backgroundImage: `url(${bg3})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }"
  >
    <div class="c-monitor-nav-list">
      <div
        v-for="item in navItems"
        :key="item.id"
        :class="['c-monitor-nav-item', { active: item.active }]"
        @click="handleNavClick(item)"
      >
        <span class="c-monitor-nav-text">{{ item.label }}</span>
        <span v-if="item.badge" class="c-monitor-nav-badge">{{ item.badge }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 导航项数据（从设计稿文字清单提取）
const navItems = ref([
  { id: 1, label: '控', active: false },
  { id: 2, label: '照明', badge: '3', active: false },
  { id: 3, label: '通风', active: false },
  { id: 4, label: '供配电', active: false },
  { id: 5, label: '消防', active: false },
  { id: 6, label: '交通诱导', active: false }
])

// 资源变量（系统自动注入）
const bg3 = 'data:image/png;base64,iVBORw0KGgo...'

// 导航点击处理
const handleNavClick = (item) => {
  navItems.value.forEach(nav => {
    nav.active = nav.id === item.id
  })
  console.log('[LeftSidebar] 导航切换:', item.label)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-sidebar {
  width: 46px;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.c-monitor-nav-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
}

.c-monitor-nav-item {
  position: relative;
  width: 100%;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  &.active {
    background: rgba(25, 144, 255, 0.2);
    
    .c-monitor-nav-text {
      color: rgba(255, 255, 255, 1);
      font-weight: 700;
    }
  }
}

.c-monitor-nav-text {
  font-size: calc(@fontSize * 1);
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  transition: color 0.3s ease;
}

.c-monitor-nav-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 77, 79, 1);
  border-radius: 7px;
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 1);
  font-weight: 500;
  line-height: 1;
}
</style>
