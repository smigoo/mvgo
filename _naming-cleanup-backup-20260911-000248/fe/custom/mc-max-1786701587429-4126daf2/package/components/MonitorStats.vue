<template>
  <div 
    class="c-monitor-stats-row" 
    :style="{ 
      backgroundImage: `url(${bgm_2})`,
      backgroundSize: '100% 100%'
    }"
  >
    <div class="c-monitor-stat-item c-monitor-stat-item-left">
      <span class="c-monitor-stat-label">江阴靖江长江隧道</span>
      <span class="c-monitor-stat-value c-monitor-stat-value-tunnel">34,620</span>
    </div>
    <div class="c-monitor-stat-item c-monitor-stat-item-right">
      <span class="c-monitor-stat-label">江阴大桥</span>
      <span class="c-monitor-stat-value c-monitor-stat-value-bridge">82,379</span>
    </div>
  </div>
</template>

<script setup>
import bgm_2 from '../../resources/images/bg-_m-34.png'

// 纯展示子组件，无需额外逻辑
</script>