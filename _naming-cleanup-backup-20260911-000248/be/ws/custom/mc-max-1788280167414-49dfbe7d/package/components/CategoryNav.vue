<template>
  <div class="c-monitor-category-nav">
    <div
      v-for="tab in tabs"
      :key="tab.label"
      :class="['c-monitor-nav-item', { 'c-monitor-nav-item--active': modelValue === tab.label }]"
      @click="handleClick(tab.label)"
    >
      <span class="c-monitor-nav-label">{{ tab.label }}</span>
      <span
        v-if="tab.badge"
        :class="['c-monitor-nav-badge', { 'c-monitor-nav-badge--red': tab.isRed }]"
      >
        {{ tab.badge }}
      </span>
    </div>
  </div>
</template>

<script setup>
import bg12 from '../../resources/images/bg-8701.png'
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '监控' }
})

const emit = defineEmits(['update:modelValue'])

const tabs = ref([
  { label: '监控', badge: '3/3740', isRed: false },
  { label: '照明', badge: '3', isRed: true },
  { label: '通风', badge: '', isRed: false },
  { label: '消防', badge: '', isRed: false },
  { label: '交通诱导', badge: '', isRed: false },
  { label: '供配电', badge: '', isRed: false }
])

const handleClick = (label) => {
  emit('update:modelValue', label)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-category-nav {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 46px;
  flex: 1 1 0;
  gap: 8px;
  padding-top: 8px;
  box-sizing: border-box;
  min-height: 0;}

.c-monitor-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 34px;
  padding: 8px 0;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.3s;

  &:hover {
    background: rgba(24, 144, 255, 0.05);
  }

  &--active {
    background: rgba(24, 144, 255, 0.1);
    
    .c-monitor-nav-label {
      color: #1890FF; /* Figma fills: GRADIENT_LINEAR #1990ff -> #5a7eff, 取主色 */;
      font-weight: 700;
    }
  }
}

.c-monitor-nav-label {
  writing-mode: vertical-rl;
  font-size: var(--fontSize, 14px);
  color: #333333; /* Figma fills: SOLID #333333 */;
  letter-spacing: 2px;
  line-height: 1;
}

.c-monitor-nav-badge {
  font-size: calc(var(--fontSize, 14px) * 0.85);
  color: #1890FF; /* Figma fills: SOLID #1990ff */;
  margin-top: 4px;
  writing-mode: horizontal-tb;
  
  &--red {
    background: #FF4D4F; /* Figma 红色徽章 */;
    color: #FFFFFF;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: calc(var(--fontSize, 14px) * 0.71);
    margin-top: 4px;
  }
}
</style>