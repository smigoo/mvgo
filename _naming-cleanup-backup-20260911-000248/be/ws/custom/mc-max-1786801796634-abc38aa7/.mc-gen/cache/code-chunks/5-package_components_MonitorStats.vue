<template>
  <div 
    class="c-monitor-stats-container" 
    :style="{ 
      backgroundImage: `url(${bgm_2})`, 
      backgroundSize: '100% 100%', 
      backgroundPosition: 'center center', 
      backgroundRepeat: 'no-repeat' 
    }"
  >
    <div class="c-monitor-stats-row">
      <div class="c-monitor-stats-item c-monitor-stats-item--left">
        <span class="c-monitor-stats-label">江阴靖江长江隧道</span>
        <span class="c-monitor-stats-value c-monitor-stats-value-tunnel">34,620</span>
      </div>

      <div class="c-monitor-stats-icon-wrapper">
        <img :src="icon4" alt="装饰图标" class="c-monitor-stats-icon" />
      </div>

      <div class="c-monitor-stats-item c-monitor-stats-item--right">
        <span class="c-monitor-stats-label">江阴大桥</span>
        <span class="c-monitor-stats-value c-monitor-stats-value-bridge">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 系统自动注入 bgm_2, icon4 等资源变量
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-stats-container {
  width: 100%;
  height: 91px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.c-monitor-stats-row {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-sizing: border-box;
}

.c-monitor-stats-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  &--left {
    align-items: flex-end;
    
    .c-monitor-stats-label {
      text-align: right;
    }
  }
  
  &--right {
    align-items: flex-start;
    
    .c-monitor-stats-label {
      text-align: left;
    }
  }
}

.c-monitor-stats-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  white-space: nowrap;
}

.c-monitor-stats-value {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  line-height: 28px;
  white-space: nowrap;
}

.c-monitor-stats-value-tunnel {
  color: #006fe3;
}

.c-monitor-stats-value-bridge {
  color: #0c9dbe;
}

.c-monitor-stats-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-monitor-stats-icon {
  width: 62px;
  height: 62px;
  object-fit: contain;
}
</style>