<script setup>
// 设备汇总卡片纯展示组件，无状态
</script>

<template>
  <div class="c-monitor-summary-cards">
    <!-- 隧道设备卡片 -->
    <div class="c-monitor-card" :style="{ backgroundImage: `url(${bg1})` }">
      <div class="c-monitor-card-header">
        <img :src="icon1" class="c-monitor-card-icon" alt="" />
        <span class="c-monitor-card-title">隧道设备</span>
      </div>
      <div class="c-monitor-card-row">
        <span class="c-monitor-card-label">总数:</span>
        <span class="c-monitor-card-value">56302</span>
      </div>
      <div class="c-monitor-card-row">
        <span class="c-monitor-card-label">异常数:</span>
        <span class="c-monitor-card-value c-monitor-card-value--danger">5</span>
      </div>
    </div>

    <!-- 南北接线设备卡片（修正：不是"南北桥线设备"） -->
    <div class="c-monitor-card" :style="{ backgroundImage: `url(${bg2})` }">
      <div class="c-monitor-card-header">
        <img :src="icon2" class="c-monitor-card-icon" alt="" />
        <div class="c-monitor-card-title-multi">
          <span>南北接线</span>
          <span>设备</span>
        </div>
      </div>
      <div class="c-monitor-card-row">
        <span class="c-monitor-card-label">总数:</span>
        <span class="c-monitor-card-value">1280</span>
      </div>
      <div class="c-monitor-card-row">
        <span class="c-monitor-card-label">异常数:</span>
        <span class="c-monitor-card-value c-monitor-card-value--danger">3</span>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
