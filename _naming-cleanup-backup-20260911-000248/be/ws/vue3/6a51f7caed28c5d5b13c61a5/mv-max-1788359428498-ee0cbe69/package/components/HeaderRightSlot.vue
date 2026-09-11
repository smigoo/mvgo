<template>
  <div class="header-right-slot">
    <!-- 图表工具按钮 -->
    <div class="icon-button chart-button">
      <img :src="icon1" class="button-icon" alt="图表工具" />
    </div>
    
    <!-- 通知按钮（带角标） -->
    <div class="icon-button notification-button">
      <img :src="icon2" class="button-icon" alt="通知" />
      <span class="notification-badge">8</span>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'


import { ref} from 'vue'

// 图标资源（系统自动注入，此处占位）

// #region 事件处理
// 图表按钮点击
const handleChartClick = () => {
  console.log('[HeaderRightSlot] 图表工具按钮点击')
}

// 通知按钮点击
const handleNotificationClick = () => {
  console.log('[HeaderRightSlot] 通知按钮点击')
}
// #endregion
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 右上角操作区容器（横向布局，图表按钮+通知按钮）
.header-right-slot {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  
  // 图标按钮通用样式（与 Figma 节点 Rectangle 34624274 一致）
  .icon-button {
    position: relative;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
    border: 1px solid rgba(161, 206, 255, 1);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
    
    // 按钮图标（PNG 已自带样式，禁止额外装饰）
    .button-icon {
      width: 18px;
      height: 18px;
      object-fit: contain;
    }
    
    // 鼠标悬停效果
    &:hover {
      background: linear-gradient(180deg, #ffffff 0%, #d9ebff 50%, #c7e4ff 100%);
      border-color: rgba(85, 158, 255, 1);
    }
    
    // 点击效果
    &:active {
      transform: scale(0.96);
    }
  }
  
  // 通知角标（红色圆形，右上角定位）
  .notification-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f53f3f;
    color: #ffffff;
    font-size: 12px;
    font-weight: 500;
    line-height: 14px;
    border-radius: 29px;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(245, 63, 63, 0.3);
  }
}
</style>