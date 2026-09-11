<template>
  <div class="c-monitor-sidebar">
    <div 
      v-for="item in navItems" 
      :key="item.key"
      :class="['c-monitor-sidebar-item', { active: activeKey === item.key }]"
      @click="handleNavClick(item.key)"
    >
      <span class="c-monitor-sidebar-label">{{ item.label }}</span>
      <span v-if="item.badge" class="c-monitor-sidebar-badge">{{ item.badge }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 导航项列表（从设计稿提取）
const navItems = ref([
  { key: 'mix', label: '拌和', badge: null },
  { key: 'lighting', label: '照明', badge: 3 },
  { key: 'pour', label: '浇筑', badge: null },
  { key: 'power', label: '供电施工', badge: null },
  { key: 'fire', label: '消防', badge: null },
  { key: 'traffic', label: '交通诱导', badge: null }
])

// 当前激活项（默认无激活）
const activeKey = ref('')

// 点击导航项
const handleNavClick = (key) => {
  activeKey.value = key
  // 可在此处触发 businessEvent 或其他联动逻辑
  console.log('[SidebarNav] 点击导航项:', key)
}
</script>

<style scoped lang="less">
@import '../../resources/styles/index.less';

.c-monitor-sidebar {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background-image: url('../../resources/images/bg-8788.png');
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 6px;
}

.c-monitor-sidebar-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 6px;
  cursor: pointer;
  transition: all 0.3s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  &.active {
    background: linear-gradient(180deg, rgba(25, 144, 255, 0.2) 0%, rgba(25, 144, 255, 0.05) 100%);
    
    .c-monitor-sidebar-label {
      color: #ffffff;
      font-weight: 700;
    }
  }
}

.c-monitor-sidebar-label {
  font-size: 14px;
  line-height: 16px;
  color: #333333;
  text-align: center;
  white-space: nowrap;
  writing-mode: vertical-rl;
  letter-spacing: 0.05em;
  transition: all 0.3s;
}

.c-monitor-sidebar-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(245, 34, 45, 1);
  border-radius: 50%;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}
</style>
