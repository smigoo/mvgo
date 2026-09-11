<template>
  <div class="c-monitor-left-nav" :style="navBgStyle">
    <div
      v-for="(item, index) in navItems"
      :key="index"
      :class="['c-monitor-nav-item', { 'c-monitor-nav-item-active': index === activeIndex }]"
      @click="handleNavClick(index)"
    >
      <span class="c-monitor-nav-text">{{ item.text }}</span>
      <span v-if="item.badge" class="c-monitor-nav-badge">{{ item.badge }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

// 导航项数据（从设计稿提取）
const navItems = ref([
  { text: '挖掘机', badge: '3/740' },
  { text: '控制', badge: '3' },
  { text: '照明' },
  { text: '通风' },
  { text: '供配电' },
  { text: '消防' },
  { text: '交通设施' }
])

// 当前激活索引（默认第一项）
const activeIndex = ref(0)

// 背景图样式绑定
const navBgStyle = computed(() => ({
  backgroundImage: `url(${bg14})`,
  backgroundSize: '100% 100%',
  backgroundPosition: 'center center',
  backgroundRepeat: 'no-repeat'
}))

// 导航点击事件
const handleNavClick = (index) => {
  activeIndex.value = index
  console.log('[LeftNav] 切换导航:', navItems.value[index])
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-left-nav {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
  overflow: hidden;
}

.c-monitor-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  background: transparent;

  &:hover {
    background: rgba(24, 144, 255, 0.1);
  }

  &.c-monitor-nav-item-active {
    background: linear-gradient(135deg, rgba(24, 144, 255, 0.3) 0%, rgba(8, 163, 165, 0.3) 100%);
  }
}

.c-monitor-nav-text {
  font-size: 14px;
  color: rgba(51, 51, 51, 1);
  font-weight: 400;
  line-height: 1.4;

  .c-monitor-nav-item-active & {
    color: rgba(24, 144, 255, 1);
    font-weight: 600;
  }
}

.c-monitor-nav-badge {
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(24, 144, 255, 0.15);
  color: rgba(24, 144, 255, 1);
  font-size: 12px;
  font-weight: 500;

  .c-monitor-nav-item-active & {
    background: rgba(24, 144, 255, 0.3);
    color: rgba(24, 144, 255, 1);
  }
}
</style>
