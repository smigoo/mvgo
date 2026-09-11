<template>
  <nav class="c-mc-max-1787814814517-5a36c1ea-c-monitor-nav" aria-label="设备分类导航">
<div v-for="tab in deviceTabs" :key="tab.key" class="c-mc-max-1787814814517-5a36c1ea-c-monitor-nav__item" :class="{ 'c-monitor-nav__item--active': activeKey === tab.key }" :style="{ height: `${tab.height}px` }" @click="handleSelect(tab.key)" >
      <!-- 局部背景块：仅作为分类项衬底，不放到根容器 -->
<span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-nav__bg" :style="{ height: `${tab.bgHeight}px` }" ></span>

      <!-- 分类文字：竖排（监控/照明/通风/消防/交通诱导/供配电） -->
      <span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-nav__text">{{ tab.label }}</span>

      <!-- 监控当前分类统计：3/3740 -->
<span v-if="tab.count && activeKey === tab.key" class="c-mc-max-1787814814517-5a36c1ea-c-monitor-nav__count" >{{ tab.count }}</span>

      <!-- 照明分类红色角标：3 -->
      <span v-if="tab.badge" class="c-mc-max-1787814814517-5a36c1ea-c-monitor-nav__badge">{{ tab.badge }}</span>
    </div>
  </nav>
</template>

<script setup>
import { ref, watch } from 'vue'

const emit = defineEmits(['change'])

// 设备分类导航数据（文字/顺序取自设计稿文字清单）
const deviceTabs = [ { key: 'monitor', label: '监控', count: '3/3740', height: 54, bgHeight: 44 }, { key: 'lighting', label: '照明', badge: '3', height: 44, bgHeight: 40 }, { key: 'ventilation', label: '通风', height: 40, bgHeight: 40 }, { key: 'fire', label: '消防', height: 40, bgHeight: 40 }, { key: 'traffic', label: '交通诱导', height: 72, bgHeight: 72 }, { key: 'power', label: '供配电', height: 56, bgHeight: 56 }
]

const activeKey = ref('monitor')

const handleSelect = (key) => { if (activeKey.value === key) return
  activeKey.value = key
}

// 切换分类时必须联动更新业务状态，禁止只改激活样式
watch(activeKey, (newKey) => {
  emit('change', newKey)
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* 左侧竖向分类导航：宽度固定 46px，不参与压缩 */
.c-monitor-nav {
  width: 46px;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex-shrink: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.c-monitor-nav__item {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}

.c-monitor-nav__bg {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34px;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.8);
}

.c-monitor-nav__item--active .c-monitor-nav__bg {
  background: rgba(25, 144, 255, 1);
}

.c-monitor-nav__text {
  position: relative;
  z-index: 1;
  writing-mode: vertical-lr;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 16px;
  color: rgba(51, 51, 51, 1);
  text-align: center;
  white-space: nowrap;
}

.c-monitor-nav__item--active .c-monitor-nav__text {
  font-weight: 700;
  line-height: 18px;
  color: #ffffff;
}

.c-monitor-nav__count {
  position: relative;
  z-index: 1;
  writing-mode: horizontal-tb;
  font-family: 'Roboto', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  color: rgba(255, 255, 255, 0.92);
  text-align: center;
  white-space: nowrap;
}

.c-monitor-nav__badge {
  position: absolute;
  top: 4px;
  right: 9px;
  z-index: 2;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  color: #ffffff;
  font-family: 'Roboto', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  white-space: nowrap;
}
</style>