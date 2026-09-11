<template>
  <div class="c-monitor-stats">
    <div class="c-monitor-stats-header">
      <div class="c-monitor-stats-title-group">
        <img :src="icon2" class="c-monitor-stats-title-icon" />
        <span class="c-monitor-stats-title-text">当日总流量</span>
      </div>
      <div class="c-monitor-stats-select-wrapper">
        <a-select v-model:value="timeRange" style="width: 100px" :bordered="false">
          <a-select-option value="24h">24小时</a-select-option>
        </a-select>
      </div>
    </div>
    <div class="c-monitor-stats-body" :style="{ backgroundImage: `url(${bgm_2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }">
      <div class="c-monitor-stats-item c-monitor-stats-item--tunnel">
        <span class="c-monitor-stats-item-label c-monitor-stats-item-label--right">江阴靖江长江隧道</span>
        <span class="c-monitor-stats-item-value c-monitor-stats-item-value--tunnel">34,620</span>
      </div>
      <div class="c-monitor-stats-item c-monitor-stats-item--bridge">
        <span class="c-monitor-stats-item-label">江阴大桥</span>
        <span class="c-monitor-stats-item-value c-monitor-stats-item-value--bridge">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const timeRange = ref('24h')
</script>