<template>
  <div class="c-monitor-left-category-nav">
    <div
      v-for="item in navItems"
      :key="item.key"
      :class="['c-monitor-nav-item', { active: activeNav === item.key }]"
      @click="handleNavClick(item.key)"
    >
      <span class="c-monitor-nav-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 导航项数据（来自设计稿文字清单）
const navItems = ref([
  { label: '监控', key: 'monitoring' },
  { label: '照明', key: 'lighting' },
  { label: '通风', key: 'ventilation' },
  { label: '供配电', key: 'power' },
  { label: '消防', key: 'firefighting' },
  { label: '排水', key: 'drainage' }
])

// 当前激活的导航项（默认无激活）
const activeNav = ref('')

// 导航点击处理
const handleNavClick = (key) => {
  activeNav.value = key
  // 实际项目中可能需要触发事件或调用父组件方法
  console.log('[LeftCategoryNav] 切换导航:', key)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-left-category-nav {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 0;
}

.c-monitor-nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 12px 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  background-image: url('${bg3}');
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  
  &:hover {
    opacity: 0.85;
  }
  
  &.active {
    .c-monitor-nav-label {
      font-weight: 700;
    }
  }
}

.c-monitor-nav-label {
  font-size: 14px;
  line-height: 16px;
  text-align: center;
  writing-mode: vertical-rl;
  color: @color-text-nav;
  transition: font-weight 0.3s ease;
}
</style>