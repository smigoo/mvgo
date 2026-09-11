<template>
  <div class="c-env-monitor-tabs">
    <div
      v-for="tab in tabs"
      :key="tab.value"
      :class="[
        'c-env-monitor-tab-item',
        activeTab === tab.value ? 'c-env-monitor-tab-item-active' : 'c-env-monitor-tab-item-normal'
      ]"
      :style="activeTab === tab.value ? { backgroundImage: `url(${bg3})` } : {}"
      @click="handleClick(tab.value)"
    >
      {{ tab.label }}
    </div>
  </div>
</template>

<script setup>
// Tab 选项（文案严格取自设计稿文字清单：一氧化碳/洞内照明/洞外光强/能见度）
const tabs = [
  { label: '一氧化碳', value: 'co' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' },
  { label: '能见度', value: 'visibility' }
]

const props = defineProps({
  activeTab: {
    type: String,
    default: 'co'
  }
})

const emit = defineEmits(['tab-change'])

const handleClick = (value) => {
  if (props.activeTab === value) return
  emit('tab-change', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
// === 指标切换 tabs ===
// 容器背景为 Figma GRADIENT_LINEAR(#b5deff → #d1ecff)，按零臆造规则用 CSS 渐变还原
.c-env-monitor-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  height: 27px;
  flex-shrink: 0;
  padding: 3px;
  box-sizing: border-box;
  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
  border-radius: 13px;
}

.c-env-monitor-tab-item {
  flex: 1;
  min-width: 0;
  height: 21px;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 0 8px;
  font-size: @fontSize;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.3s;
}

// 未激活态：Figma fills SOLID #2c9bea
.c-env-monitor-tab-item-normal {
  color: #2c9bea;
}

// 激活态：使用下载的状态背景图 bg3（78×21），禁止用 CSS 渐变替代
// 使用背景图元素禁止再叠加 background/border/border-radius，仅保留定位与文字样式
.c-env-monitor-tab-item-active {
  color: #ffffff; // Figma fills SOLID #ffffff
  background-size: cover; // 来自 elementStyleMap tab-1
  background-position: center;
  background-repeat: no-repeat;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1); // Figma DROP_SHADOW
}
</style>
