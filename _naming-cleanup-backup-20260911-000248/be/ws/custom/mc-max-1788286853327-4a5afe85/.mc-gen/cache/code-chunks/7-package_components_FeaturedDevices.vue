<template>
  <div class="c-monitor-featured-devices">
    <!-- 左侧卡片 -->
    <div class="c-monitor-featured-card c-monitor-featured-card-left">
      <img :src="icon1" class="c-monitor-featured-icon" alt="icon" />
      <div class="c-monitor-featured-content">
        <div class="c-monitor-featured-label">随便说说</div>
        <div class="c-monitor-featured-value-row">
          <span class="c-monitor-featured-value-prefix">总数：</span>
          <span class="c-monitor-featured-value-number">56302</span>
        </div>
        <div class="c-monitor-featured-badge">异常数：3</div>
      </div>
    </div>

    <!-- 右侧卡片 -->
    <div class="c-monitor-featured-card c-monitor-featured-card-right">
      <img :src="icon2" class="c-monitor-featured-icon" alt="icon" />
      <div class="c-monitor-featured-content">
        <div class="c-monitor-featured-label">房屋理性说话</div>
        <div class="c-monitor-featured-value-row">
          <span class="c-monitor-featured-value-prefix">总数：</span>
          <span class="c-monitor-featured-value-number c-monitor-featured-value-number-alt">1280</span>
        </div>
        <div class="c-monitor-featured-badge">异常数：3</div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 资源变量由系统注入，无需 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-featured-devices {
  display: flex;
  gap: 12px;
  flex: 110 1 0;
  min-height: 0;
}

.c-monitor-featured-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  min-height: 0;
}

.c-monitor-featured-card-left {
  background-image: url(${bg1});
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

.c-monitor-featured-card-right {
  background-image: url(${bg2});
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
}

.c-monitor-featured-icon {
  width: 43px;
  height: 44px;
  flex-shrink: 0;
}

.c-monitor-featured-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.c-monitor-featured-label {
  font-size: calc(@fontSize * 1);
  color: rgba(255, 255, 255, 1);
  font-weight: normal;
  line-height: 1.2;
}

.c-monitor-featured-value-row {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.c-monitor-featured-value-prefix {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 255, 255, 0.8);
  font-weight: normal;
  line-height: 1.2;
}

.c-monitor-featured-value-number {
  font-size: calc(@fontSize * 1.429);
  color: rgba(255, 255, 255, 1);
  font-weight: bold;
  line-height: 1.2;
}

.c-monitor-featured-value-number-alt {
  color: rgba(89, 196, 255, 1);
}

.c-monitor-featured-badge {
  font-size: calc(@fontSize * 0.857);
  color: rgba(255, 59, 48, 1);
  font-weight: normal;
  line-height: 1.2;
}
</style>
