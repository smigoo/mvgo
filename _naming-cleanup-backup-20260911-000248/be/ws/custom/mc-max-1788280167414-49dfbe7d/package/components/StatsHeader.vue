<template>
  <div class="c-monitor-stats-header">
    <!-- 隧道设备 (Active) -->
    <div class="c-monitor-stats-card c-monitor-stats-card--active" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-stats-card-icon">
        <img :src="icon1" alt="隧道设备" />
      </div>
      <div class="c-monitor-stats-card-content">
        <div class="c-monitor-stats-card-title">隧道设备</div>
        <div class="c-monitor-stats-card-row" :style="{ backgroundImage: 'url(' + bg9 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <span class="c-monitor-stats-card-label" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">总数:</span>
          <span class="c-monitor-stats-card-value c-monitor-stats-card-value--white" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">56302</span>
        </div>
        <div class="c-monitor-stats-card-row">
          <span class="c-monitor-stats-card-label">异常数:</span>
          <span class="c-monitor-stats-card-value c-monitor-stats-card-value--error" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">5</span>
        </div>
      </div>
    </div>

    <!-- 南北接线 / 设备 (Default) -->
    <div class="c-monitor-stats-card c-monitor-stats-card--default" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-stats-card-icon">
        <img :src="icon2" alt="南北接线设备" />
      </div>
      <div class="c-monitor-stats-card-content">
        <div class="c-monitor-stats-card-title c-monitor-stats-card-title--dark" :style="{ backgroundImage: 'url(' + bg10 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">南北接线 / 设备</div>
        <div class="c-monitor-stats-card-row">
          <span class="c-monitor-stats-card-label">总数:</span>
          <span class="c-monitor-stats-card-value c-monitor-stats-card-value--primary" :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">1280</span>
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
import bg10 from '../../resources/images/bg-8643.png'
import bg9 from '../../resources/images/bg-8614.png'
import bg8 from '../../resources/images/bg-8585.png'
import bg5 from '../../resources/images/bg-8498.png'
import bg4 from '../../resources/images/bg-8468.png'
import bg3 from '../../resources/images/bg-8439.png'
import bg2 from '../../resources/images/bg-8807.png'
import icon1 from '../../resources/images/icon-8798.png'
import icon2 from '../../resources/images/icon-8817.png'


// 资源变量 icon1, icon2 由系统自动注入
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-stats-header {
flex: 1 1 0;

  display: flex;
  gap: 12px;
  width: 100%;
}

.c-monitor-stats-card {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 12px;
  gap: 12px;
  min-width: 0;
  box-sizing: border-box;
  
  &--active {
    
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
  min-height: 0;}

.c-monitor-stats-card-title {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 400;
  line-height: calc(var(--fontSize, 14px) * 1.14);
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
  font-size: var(--fontSize, 14px);
  font-weight: 400;
  line-height: calc(var(--fontSize, 14px) * 1.5);
  white-space: nowrap;
}

.c-monitor-stats-card-value {
  font-size: calc(var(--fontSize, 14px) * 1.428);
  font-weight: 700;
  line-height: calc(var(--fontSize, 14px) * 1.64);
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