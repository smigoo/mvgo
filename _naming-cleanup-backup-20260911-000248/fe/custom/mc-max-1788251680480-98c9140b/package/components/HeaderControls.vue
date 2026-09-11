<template>
  <div class="c-env-monitor-controls">
    <!-- 图表/表格切换图标 -->
    <div class="c-env-monitor-controls-icons">
      <img :src="icon1" alt="图表" class="c-env-monitor-control-icon" />
      <img :src="icon2" alt="表格" class="c-env-monitor-control-icon" />
    </div>

    <!-- 预警角标 -->
    <div class="c-env-monitor-controls-badge">
      8
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'


import { ref} from 'vue'

// 图标资源由系统自动注入
// icon1: 图表图标
// icon2: 表格图标
</script>

<style lang="less" scoped>
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-env-monitor-controls {
flex: 1 1 0;
  width: 100%;

  display: flex;
  align-items: center;
  gap: 8px;
}

.c-env-monitor-controls-icons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-env-monitor-control-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.8;
  }
}

.c-env-monitor-controls-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  background: #f53f3f;
  border-radius: 29px;
  color: #ffffff;
  font-size: calc(@fontSize * 0.8571);
  font-weight: 500;
  line-height: 14px;
}
</style>