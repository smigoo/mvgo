<template>
  <div class="c-monitor-section c-monitor-daily-total">
    <div class="c-monitor-section-header">
      <div class="c-monitor-section-title">
        <img :src="icon1" class="c-monitor-title-icon" alt="" />
        <span>当日总流量</span>
      </div>
      <div class="c-monitor-time-selector">
        <span>24小时</span>
        <span class="c-monitor-arrow">▼</span>
      </div>
    </div>
    <div class="c-monitor-section-body">
      <div class="c-monitor-stat-cards">
        <div class="c-monitor-stat-card" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
          <span class="c-monitor-stat-label">江阴靖江长江隧道</span>
          <span class="c-monitor-stat-value">34,620</span>
        </div>
        <div class="c-monitor-stat-card" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
          <span class="c-monitor-stat-label">江阴大桥</span>
          <span class="c-monitor-stat-value">82,379</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 资源变量声明
const icon1 = ref('')
const bg1 = ref('')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
