<template>
  <div class="c-monitor-category-tabs">
    <div
      v-for="tab in tabs"
      :key="tab.key"
      class="c-monitor-tab-item"
      :class="tab.active ? 'c-monitor-tab-item-active' : 'c-monitor-tab-item-default'"
      :style="{ flex: `${tab.weight} 1 0` }"
      role="tab"
      tabindex="0"
      :aria-selected="tab.active"
      @click="handleTabClick(tab)"
      @keydown.enter="handleTabClick(tab)"
      @keydown.space.prevent="handleTabClick(tab)"
    >
      <span class="c-monitor-tab-text">{{ tab.label }}</span>

      <!-- 激活态：矩形徽章（如 3/3740） -->
      <span v-if="tab.active && tab.badge" class="c-monitor-tab-badge-active">{{ tab.badge }}</span>

      <!-- 非激活态：圆形计数徽章（如 3） -->
      <span v-else-if="tab.badge" class="c-monitor-tab-badge-default">{{ tab.badge }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['category-change'])

// 分类标签数据（文字与徽章逐字取自设计稿文字清单：监控/3/3740、照明/3、通风、消防、交通诱导、供配电）
// weight 取自 Figma 中各 tab 的真实高度，用于 flex 比例分配
const tabs = ref([
  { key: 'monitor', label: '监控', badge: '3/3740', active: true, weight: 54 },
  { key: 'light', label: '照明', badge: '3', active: false, weight: 40 },
  { key: 'ventilation', label: '通风', badge: '', active: false, weight: 40 },
  { key: 'fire', label: '消防', badge: '', active: false, weight: 40 },
  { key: 'traffic', label: '交通诱导', badge: '', active: false, weight: 72 },
  { key: 'power', label: '供配电', badge: '', active: false, weight: 56 }
])

// 点击切换激活分类，并对外发出事件供上层联动设备网格
const handleTabClick = (tab) => {
  if (tab.active) return
  tabs.value.forEach((item) => {
    item.active = item.key === tab.key
  })
  emit('category-change', { key: tab.key, label: tab.label })
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-category-tabs {
  width: 46px;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-monitor-tab-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  cursor: pointer;
  box-sizing: border-box;
  outline: none;
}

// 激活态：渐变蓝底，右侧圆角（对应 Figma rectangleCornerRadii [0,6,6,0]）
.c-monitor-tab-item-active {
  background: linear-gradient(90deg, #318aff 0%, #70bfff 100%);
  border: 1px solid rgba(240, 245, 255, 1);
  border-radius: 0 6px 6px 0;
}

// 非激活态：浅蓝渐变底，顶部圆角（对应 Figma rectangleCornerRadii [6,6,0,0]）
.c-monitor-tab-item-default {
  background: linear-gradient(180deg, #85baff 0%, #bfe2ff 100%);
  border: 1px solid rgba(240, 245, 255, 1);
  border-radius: 6px 6px 0 0;

  &:hover {
    filter: brightness(1.05);
  }
}

.c-monitor-tab-text {
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 2px;
  white-space: nowrap;
  font-family: 'Source Han Sans CN', 'PingFang SC', sans-serif;
}

.c-monitor-tab-item-active .c-monitor-tab-text {
  font-size: 14px;
  font-weight: 700;
  line-height: 18px;
  color: #ffffff;
}

.c-monitor-tab-item-default .c-monitor-tab-text {
  font-size: 14px;
  font-weight: 400;
  line-height: 16px;
  color: #3b80e7;
}

// 激活态矩形徽章（对应 Figma Frame 2136638920，圆角 [4,4,4,0]）
.c-monitor-tab-badge-active {
  position: absolute;
  top: 4px;
  right: -6px;
  min-width: 34px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  background: #ffffff;
  border: 1px solid rgba(37, 141, 200, 1);
  border-radius: 4px 4px 4px 0;
  box-shadow: 0 1px 2px 0 rgba(51, 101, 144, 0.4);
  font-family: 'Source Han Sans CN', 'PingFang SC', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  color: #258dc8;
  white-space: nowrap;
}

// 非激活态圆形计数徽章（对应 Figma Group 1321315882，圆角 29px）
.c-monitor-tab-badge-default {
  position: absolute;
  top: 2px;
  right: -4px;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 29px;
  background: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  color: #3b80e7;
}
</style>
