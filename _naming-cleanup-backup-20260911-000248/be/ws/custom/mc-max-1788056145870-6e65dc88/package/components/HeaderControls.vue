<template>
  <div class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-header-controls">
    <!-- 图表类型切换 -->
    <div class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-chart-toggle">
      <div 
        class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-toggle-btn" 
        :class="{ active: c-mc-max-1788056145870-6e65dc88-c-env-monitor-chartType === 'bar' }" 
        @click="chartType = 'bar'"
      >
        <img :src="icon1" alt="柱状图" class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-toggle-icon" />
      </div>
      <div 
        class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-toggle-btn" 
        :class="{ active: c-mc-max-1788056145870-6e65dc88-c-env-monitor-chartType === 'list' }" 
        @click="chartType = 'list'"
      >
        <img :src="icon2" alt="列表" class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-toggle-icon" />
      </div>
    </div>
    
    <!-- 通知图标 -->
    <div class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-notification">
      <div class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-notification-icon"></div>
      <div class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-notification-badge">8</div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

import { ref} from 'vue'

// 图表类型状态
const chartType = ref('bar')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-controls {
flex: 1 1 0;
  min-height: 0;
  width: 100%;

  display: flex;
  align-items: center;
  gap: 12px;
}

.c-env-monitor-chart-toggle {
display: flex;
  gap: 4px;
  min-height: 0;
}

.c-env-monitor-toggle-btn {
  width: 24px;
  height: 24px;
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;

  &.active {
    border-color: #1890ff;
    background: rgba(24, 144, 255, 0.1);
  }
}

.c-env-monitor-toggle-icon {
  width: 18px;
  height: 18px;
}

.c-env-monitor-notification {
  position: relative;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.c-env-monitor-notification-icon {
  width: 100%;
  height: 100%;
  position: relative;
  
  // CSS 绘制铃铛图标（因原图资源缺失）
  &::before {
    content: '';
    position: absolute;
    top: 1px;
    left: 2px;
    width: 12px;
    height: 10px;
    border: 2px solid #333333;
    border-radius: 6px 6px 0 0;
    border-bottom: none;
  }
  &::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 0;
    width: 16px;
    height: 2px;
    background: #333333;
    border-radius: 2px;
  }
}

.c-env-monitor-notification-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  color: #ffffff;
  font-size: 10px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
</style>