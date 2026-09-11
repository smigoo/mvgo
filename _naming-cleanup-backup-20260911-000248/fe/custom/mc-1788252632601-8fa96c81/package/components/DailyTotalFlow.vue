<template>
  <div class="c-monitor-daily-total-flow">
    <div class="c-monitor-sub-header"><img :src="icon2" class="auto-mounted-icon" alt="icon" />
      <div class="c-monitor-title">
        <span class="c-monitor-title-icon"></span>
        <span class="c-monitor-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-time-select">
        <span class="c-monitor-time-select-text">24小时</span>
        <span class="c-monitor-time-select-arrow"></span>
      </div>
    </div>

    <div class="c-monitor-stat-group" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <div
        class="c-monitor-stat-card"
        :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-stat-info">
          <span class="c-monitor-stat-label">江阴靖江长江隧道</span>
          <span class="c-monitor-stat-value c-monitor-stat-value-tunnel">34,620</span>
        </div>
      </div>

      <div
        class="c-monitor-stat-card"
        :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-monitor-stat-info">
          <span class="c-monitor-stat-label">江阴大桥</span>
          <span class="c-monitor-stat-value c-monitor-stat-value-bridge">82,379</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3441.png'
import bg1 from '../../resources/images/bg-_m-34.png'


</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>