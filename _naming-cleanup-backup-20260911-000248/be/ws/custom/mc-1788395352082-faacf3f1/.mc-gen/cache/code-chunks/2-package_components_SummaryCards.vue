<template>
  <div class="c-monitor-summary-cards">
    <div class="c-monitor-summary-card" :style="{ backgroundImage: `url(${bg1})` }">
      <div class="c-monitor-card-header">
        <img :src="icon1" class="c-monitor-card-icon" alt="隧道设备" />
        <span class="c-monitor-card-title">隧道设备</span>
      </div>
      <div class="c-monitor-card-row">
        <span class="c-monitor-card-label">总数:</span>
        <span class="c-monitor-card-number">56302</span>
      </div>
      <div class="c-monitor-card-row">
        <span class="c-monitor-card-label">异常数:</span>
        <span class="c-monitor-card-number c-monitor-card-number--danger">5</span>
      </div>
    </div>
    
    <div class="c-monitor-summary-card" :style="{ backgroundImage: `url(${bg2})` }">
      <div class="c-monitor-card-header">
        <img :src="icon2" class="c-monitor-card-icon" alt="南北接线设备" />
        <span class="c-monitor-card-title">南北接线设备</span>
      </div>
      <div class="c-monitor-card-row">
        <span class="c-monitor-card-label">总数:</span>
        <span class="c-monitor-card-number">1280</span>
      </div>
      <div class="c-monitor-card-row">
        <span class="c-monitor-card-label">异常数:</span>
        <span class="c-monitor-card-number c-monitor-card-number--danger">3</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-8788.png'
import bg2 from '../../resources/images/bg-8807.png'
import icon1 from '../../resources/images/icon-8798.png'
import icon2 from '../../resources/images/icon-8817.png'
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>