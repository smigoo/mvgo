<template>
  <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-header-right">
    <!-- 统计指标文本 -->
    <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-stat-text">
      2k3+785CO浓度
    </div>

    <!-- 视图切换按钮组 -->
    <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-view-toggle">
      <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-icon-btn" @click="handleViewChange('list')">
        <img :src="icon1" class="c-mc-max-1787845880584-5585e53c-c-env-monitor-icon" alt="列表视图" />
      </div>
      <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-icon-btn" @click="handleViewChange('chart')">
        <img :src="icon2" class="c-mc-max-1787845880584-5585e53c-c-env-monitor-icon" alt="图表视图" />
      </div>
    </div>

    <!-- 通知徽章 -->
    <div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-badge-wrapper">
<div class="c-mc-max-1787845880584-5585e53c-c-env-monitor-badge" :style="{ backgroundImage: 'url(' + bgtabActive + ')' }" >
        8
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'
import bgtabActive from '../../resources/images/bg-tab-active-7891.png'

import { inject} from 'vue'

// 注入资源变量

// 视图切换处理
const handleViewChange = (viewType) => { console.log('切换视图:', viewType)
  // 实际项目中可通过 emit 或 provide/inject 通知父组件
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-right {  width: 100%;

  display: flex;
  align-items: center;
  gap: 8px;
}

.c-env-monitor-stat-text {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
  line-height: 22px;
  white-space: nowrap;
}

.c-env-monitor-view-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-env-monitor-icon-btn {
  width: 20px;
  height: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.7;
  }
}

.c-env-monitor-icon {
  width: 100%;
  height: 100%;
  display: block;
}

.c-env-monitor-badge-wrapper {
  position: relative;
  display: inline-flex;
}

.c-env-monitor-badge {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  color: rgba(255, 255, 255, 1);
  line-height: 1;
}
</style>