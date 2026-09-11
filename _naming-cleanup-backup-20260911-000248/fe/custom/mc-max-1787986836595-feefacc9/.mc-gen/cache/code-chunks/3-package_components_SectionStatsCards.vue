<template>
  <div class="c-monitor-stats-cards">
    <!-- 隧道设备统计卡片 -->
    <div
      class="c-monitor-stat-card c-monitor-stat-card-tunnel"
      :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-monitor-stat-card-icon">
        <img :src="icon1" alt="隧道设备" class="c-monitor-stat-card-icon-img" />
      </div>
      <div class="c-monitor-stat-card-body">
        <div class="c-monitor-stat-card-title c-monitor-stat-card-title-light">隧道设备</div>
        <div class="c-monitor-stat-line">
          <span class="c-monitor-stat-label">总数:</span>
          <span class="c-monitor-stat-value c-monitor-stat-value-total">56302</span>
        </div>
        <div class="c-monitor-stat-line">
          <span class="c-monitor-stat-label">异常数:</span>
          <span class="c-monitor-stat-value c-monitor-stat-value-abnormal">5</span>
        </div>
      </div>
    </div>

    <!-- 南北接线设备统计卡片 -->
    <div
      class="c-monitor-stat-card c-monitor-stat-card-north-south"
      :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-monitor-stat-card-icon">
        <img :src="icon2" alt="南北接线" class="c-monitor-stat-card-icon-img" />
      </div>
      <div class="c-monitor-stat-card-body">
        <div class="c-monitor-stat-card-title c-monitor-stat-card-title-dark">南北接线</div>
        <div class="c-monitor-stat-line">
          <span class="c-monitor-stat-label">总数:</span>
          <span class="c-monitor-stat-value c-monitor-stat-value-total">1280</span>
        </div>
        <div class="c-monitor-stat-line">
          <span class="c-monitor-stat-label">异常数:</span>
          <span class="c-monitor-stat-value c-monitor-stat-value-abnormal">3</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// icon1 / icon2 / bg3 由系统自动注入，禁止手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
