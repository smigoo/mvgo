<template>
  <div class="c-monitor-stats-header">
    <!-- 隧道设备 (Active) -->
    <div class="c-monitor-stats-card c-monitor-stats-card--active">
      <div class="c-monitor-stats-card-icon">
        <img :src="icon1" alt="隧道设备" />
      </div>
      <div class="c-monitor-stats-card-content">
        <div class="c-monitor-stats-card-title">隧道设备</div>
        <div class="c-monitor-stats-card-row">
          <span class="c-monitor-stats-card-label">总数:</span>
          <span class="c-monitor-stats-card-value c-monitor-stats-card-value--white">56302</span>
        </div>
        <div class="c-monitor-stats-card-row">
          <span class="c-monitor-stats-card-label">异常数:</span>
          <span class="c-monitor-stats-card-value c-monitor-stats-card-value--error">5</span>
        </div>
      </div>
    </div>

    <!-- 南北接线 / 设备 (Default) -->
    <div class="c-monitor-stats-card c-monitor-stats-card--default">
      <div class="c-monitor-stats-card-icon">
        <img :src="icon2" alt="南北接线设备" />
      </div>
      <div class="c-monitor-stats-card-content">
        <div class="c-monitor-stats-card-title c-monitor-stats-card-title--dark">南北接线 / 设备</div>
        <div class="c-monitor-stats-card-row">
          <span class="c-monitor-stats-card-label">总数:</span>
          <span class="c-monitor-stats-card-value c-monitor-stats-card-value--primary">1280</span>
        </div>
        <div class="c-monitor-stats-card-row">
          <span class="c-monitor-stats-card-label">异常数:</span>
          <span class="c-monitor-stats-card-value c-monitor-stats-card-value--error">3</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 资源变量 icon1, icon2 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-stats-header {
  display: flex;
  gap: 12px;
  width: 100%;
}

.c-monitor-stats-card {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 6px;
  gap: 12px;
  min-width: 0;
  box-sizing: border-box;
  
  &--active {
    background: linear-gradient(135deg, #1890FF, #096DD9);
    
    .c-monitor-stats-card-title {
      color: #FFFFFF;
    }
    .c-monitor-stats-card-label {
      color: rgba(255, 255, 255, 0.8);
    }
  }
  
  &--default {
    background: #F0F5FF;
    
    .c-monitor-stats-card-title {
      color: #333333;
    }
    .c-monitor-stats-card-label {
      color: #666666;
    }
  }
}

.c-monitor-stats-card-icon {
  flex-shrink: 0;
  width: 35px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.c-monitor-stats-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-monitor-stats-card-title {
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: calc(@fontSize * 1.14);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-monitor-stats-card-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-monitor-stats-card-label {
  font-size: @fontSize;
  font-weight: 400;
  line-height: calc(@fontSize * 1.5);
  white-space: nowrap;
}

.c-monitor-stats-card-value {
  font-size: calc(@fontSize * 1.428);
  font-weight: 700;
  line-height: calc(@fontSize * 1.64);
  white-space: nowrap;
  
  &--white {
    color: #FFFFFF;
  }
  
  &--primary {
    color: #1890FF;
  }
  
  &--error {
    color: #FF4D4F;
  }
}
</style>