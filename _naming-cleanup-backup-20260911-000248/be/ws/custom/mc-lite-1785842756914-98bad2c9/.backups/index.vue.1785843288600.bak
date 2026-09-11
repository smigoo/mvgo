<template>
  <div class="mc-robot-modal" :style="cssVars">
    <!-- 标题栏 -->
    <div class="mc-header">
      <div class="mc-title-wrapper">
        <!-- 模拟截图中的层叠图标 -->
        <svg class="mc-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00ffff" fill-opacity="0.8"/>
          <path d="M2 12L12 17L22 12" stroke="#00ffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="#00ffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="mc-title">{{ title }}</span>
      </div>
      <button class="mc-close-btn" @click="handleClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- 信息展示区 -->
    <div class="mc-body">
      <div class="mc-grid">
        <div v-for="(item, index) in items" :key="index" class="mc-info-row">
          <span class="mc-label">{{ item.label }}</span>
          <span class="mc-value" :class="`text-${item.colorType}`">{{ item.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: {
    type: String,
    default: '巡检机器人(机器人名称)'
  },
  // 数据项配置，支持颜色语义化
  // colorType: 'success' (绿), 'danger' (红), 'default' (白)
  items: {
    type: Array,
    default: () => [
      { label: '定位状态', value: '定位正常', colorType: 'success' },
      { label: '雷达状态', value: '雷达正常', colorType: 'success' },
      { label: '避障策略', value: '重新规划路径绕过障碍', colorType: 'default' },
      { label: '运行状态', value: '正在运行', colorType: 'default' },
      { label: '任务类型', value: '移动到充电桩', colorType: 'default' },
      { label: '移动状态', value: '任务正在执行', colorType: 'default' },
      { label: '速度', value: '40km/h', colorType: 'default' },
      { label: '控制模式', value: '手动控制', colorType: 'default' },
      { label: '剩余电量', value: '30%', colorType: 'danger' }
    ]
  },
  // 主题颜色配置，支持外部覆盖
  theme: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['close']);

const handleClose = () => {
  emit('close');
};

// CSS 变量计算，支持主题切换
const cssVars = computed(() => {
  return {
    '--mc-bg-color': props.theme.backgroundColor || '#00222b',
    '--mc-text-color': props.theme.textColor || '#ffffff',
    '--mc-primary-color': props.theme.primaryColor || '#00ffff',
    '--mc-success-color': props.theme.successColor || '#00ff00', // 截图中的亮绿色
    '--mc-danger-color': props.theme.dangerColor || '#ff0000',   // 截图中的亮红色
    '--mc-label-color': props.theme.labelColor || '#e0e0e0',
  };
});
</script>

<style scoped>
/* 定义 CSS 变量默认值，防止未传入 theme 时样式丢失 */
.mc-robot-modal {
  --mc-bg-color: #00222b;
  --mc-text-color: #ffffff;
  --mc-primary-color: #00ffff;
  --mc-success-color: #00ff00;
  --mc-danger-color: #ff0000;
  --mc-label-color: #ffffff;
  
  background-color: var(--mc-bg-color);
  color: var(--mc-text-color);
  font-family: 'Microsoft YaHei', sans-serif;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  /* 模拟截图中的整体容器大小，实际使用时可由父级控制 */
  width: 100%; 
  min-width: 600px;
}

/* 标题栏样式 */
.mc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  position: relative;
  background: linear-gradient(to bottom, rgba(0, 255, 255, 0.1), transparent);
}

/* 标题栏底部的青色高亮分割线 */
.mc-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--mc-primary-color);
  box-shadow: 0 0 8px var(--mc-primary-color);
}

.mc-title-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mc-icon {
  width: 24px;
  height: 24px;
}

.mc-title {
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 1px;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
}

.mc-close-btn {
  background: transparent;
  border: none;
  color: var(--mc-text-color);
  cursor: pointer;
  padding: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.3s;
}

.mc-close-btn:hover {
  color: var(--mc-primary-color);
}

.mc-close-btn svg {
  width: 24px;
  height: 24px;
}

/* 信息展示区样式 */
.mc-body {
  padding: 30px 40px;
}

.mc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  row-gap: 25px;
  column-gap: 40px;
}

.mc-info-row {
  display: flex;
  align-items: center;
  font-size: 20px; /* 中等偏大字号 */
  font-weight: bold; /* 整体字重较粗 */
}

.mc-label {
  color: var(--mc-label-color);
  margin-right: 10px;
  white-space: nowrap;
}

.mc-value {
  font-weight: bold;
}

/* 颜色语义化类 */
.text-success {
  color: var(--mc-success-color);
  text-shadow: 0 0 5px rgba(0, 255, 0, 0.4);
}

.text-danger {
  color: var(--mc-danger-color);
  text-shadow: 0 0 5px rgba(255, 0, 0, 0.4);
}

.text-default {
  color: var(--mc-text-color);
}
</style>