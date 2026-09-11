<template>
  <!-- 操作按钮组：右侧图表按钮 + 消息按钮（带红色角标） -->
  <div class="header-actions">
    <!-- 图表按钮 -->
    <div class="action-btn" @click="handleChartClick">
      <img :src="icon1" class="action-icon" alt="图表" />
    </div>
    <!-- 消息按钮（带角标） -->
    <div class="action-btn badge-wrapper" @click="handleMessageClick">
      <img :src="icon2" class="action-icon" alt="消息" />
      <span v-if="badgeCount > 0" class="badge">{{ badgeCount }}</span>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

// 操作按钮组子组件
// 职责：渲染右上角两个图标按钮（图表切换、消息通知），消息按钮带红色角标
// 交互：点击时向父组件发送事件（chart-click / message-click）

import { defineProps, defineEmits} from 'vue'

// #region Props定义
const props = defineProps({ // 图表按钮图标（icon1） icon1: { type: String, required: true }, // 消息按钮图标（icon2） icon2: { type: String, required: true }, // 消息角标数量（>0 显示，<=0 隐藏） badgeCount: { type: Number, default: 0 }
})
// #endregion

// #region Emits定义
const emit = defineEmits(['chart-click', 'message-click'])
// #endregion

// #region 方法

// 图表按钮点击：通知父组件
const handleChartClick = () => { emit('chart-click')
}

// 消息按钮点击：通知父组件
const handleMessageClick = () => { emit('message-click')
}

// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 操作按钮组容器：横向排列，右侧对齐
.header-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto; // 推到最右侧;
}

// 单个操作按钮：图标容器，hover 放大
.action-btn {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s ease;
  flex-shrink: 0;

  &:hover {
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
}

// 图标图片：撑满容器，object-fit contain 保持比例
.action-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

// 消息角标：红色圆形，右上角绝对定位
.badge-wrapper {
  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 14px;
    height: 14px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f53f3f; // Figma num - bg 节点的纯色值（CSS 替代，无需图片）;
    color: #ffffff;
    font-size: 10px;
    font-weight: 500;
    line-height: 1;
    border-radius: 29px; // Figma cornerRadius: 29px;
    font-family: PingFang SC, sans-serif;
    white-space: nowrap;
  }
}
</style>