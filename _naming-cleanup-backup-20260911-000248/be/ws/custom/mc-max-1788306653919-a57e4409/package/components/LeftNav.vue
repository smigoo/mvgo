<template>
  <div class="c-monitor-left-nav">
    <div
      v-for="(item, index) in navItems"
      :key="item.id"
      :class="[
        'c-monitor-nav-item',
        {'c-monitor-nav-item-active': activeNavId === item.id }
      ]"
      :style="activeNavId === item.id ? { backgroundImage: `url(${bg8})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : {}"
      @click="handleNavClick(item)"
    >
      <span class="c-monitor-nav-item-text">{{ item.label }}</span>
      <span v-if="item.badge" class="c-monitor-nav-item-badge">{{ item.badge }}</span>
    </div>
  </div>
</template>

<script setup>
import bg8 from '../../resources/images/bg-8439.png'


// 导航数据（从 Figma 文本清单提取）
const navItems = ref([
  { id: 'excavator', label: '挖掘机', badge: '3/740' },
  { id: 'control', label: '控制', badge: '3' },
  { id: 'lighting', label: '照明', badge: null },
  { id: 'ventilation', label: '通风', badge: null },
  { id: 'power', label: '供配电', badge: null },
  { id: 'fire', label: '消防', badge: null },
  { id: 'traffic', label: '交通设施', badge: null }
])

// 当前激活的导航项（默认第一个）
const activeNavId = ref('excavator')

// 点击导航项
const handleNavClick = (item) => {
  activeNavId.value = item.id
  console.log('[LeftNav] 切换导航:', item.label)
  // 此处可触发父组件数据刷新或发布业务事件
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-left-nav {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;}

.c-monitor-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.05);

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}

.c-monitor-nav-item-active {
  /* 背景图通过 inline :style 绑定，此处只定义其他样式 */
  color: rgba(255, 255, 255, 1);
}

.c-monitor-nav-item-text {
  font-size: calc(var(--fontSize, 14px) * 0.875);
  color: rgba(255, 255, 255, 0.85);
  font-weight: 400;
  white-space: nowrap;
}

.c-monitor-nav-item-active .c-monitor-nav-item-text {
  color: rgba(255, 255, 255, 1);
  font-weight: 600;
}

.c-monitor-nav-item-badge {
  display: inline-block;
  padding: 2px 6px;
  font-size: calc(var(--fontSize, 14px) * 0.75);
  color: rgba(255, 255, 255, 0.9);
  background: rgba(24, 144, 255, 0.3);
  border-radius: 10px;
  white-space: nowrap;
}

.c-monitor-nav-item-active .c-monitor-nav-item-badge {
  background: rgba(24, 144, 255, 0.6);
}
</style>