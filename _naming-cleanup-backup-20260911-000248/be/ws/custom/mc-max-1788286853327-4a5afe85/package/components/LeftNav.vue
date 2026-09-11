<template>
  <div class="c-monitor-left-nav">
<div v-for="(item, index) in navItems" :key="index" class="c-monitor-nav-item" :class="{ active: activeIndex === index }" @click="handleNavClick(index)" >
      {{ item }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const navItems = ref(['控', '照明', '通', '供电', '消防', '交通'])
const activeIndex = ref(0)

const handleNavClick = (index) => { activeIndex.value = index
}
</script>

<style lang="less" scoped>
@color-nav-text: #333333;
@color-nav-text-hover: #333333;
@color-nav-text-active: #333333;
@fontWeightStrong: 400;

@import '../../resources/styles/index.less';

.c-monitor-left-nav {
  position: absolute;
  left: 0;
  top: 0;
  width: 40px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  padding: 12px 0;
  gap: 8px;
  background-image: url(../../resources/images/bg-8788.png);
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

.c-monitor-nav-item {
  width: 100%;
  padding: 8px 0;
  font-size: calc(var(--fontSize, 14px) * 1);
  color: @color-nav-text;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  writing-mode: vertical-rl;
  text-orientation: upright;

  &:hover {
    color: @color-nav-text-hover;
  }

  &.active {
    color: @color-nav-text-active;
    font-weight: @fontWeightStrong;
  }
}
</style>