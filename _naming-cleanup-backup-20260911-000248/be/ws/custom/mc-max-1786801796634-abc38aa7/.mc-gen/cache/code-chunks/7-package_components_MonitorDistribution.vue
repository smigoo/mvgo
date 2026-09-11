<template>
  <div class="c-monitor-distribution-root">
    <div class="c-monitor-distribution-header">
      <img :src="icon3" alt="车型分布图标" class="c-monitor-distribution-header-icon" />
      <span class="c-monitor-distribution-header-title">车型分布</span>
    </div>
    <div class="c-monitor-distribution-body">
      <div 
        class="c-monitor-distribution-card" 
        :style="{ 
          backgroundImage: `url(${bgm_2})`, 
          backgroundSize: '100% 100%', 
          backgroundPosition: 'center center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div class="c-monitor-distribution-card-title">江阴靖江长江隧道</div>
        <div class="c-monitor-distribution-card-content">
          <div class="c-monitor-distribution-stat">
            <span class="c-monitor-distribution-stat-label">客车</span>
            <span class="c-monitor-distribution-stat-value c-monitor-distribution-stat-value--blue">22350</span>
          </div>
          <img :src="icon5" alt="车辆图标" class="c-monitor-distribution-card-icon" />
          <div class="c-monitor-distribution-stat">
            <span class="c-monitor-distribution-stat-label">货车</span>
            <span class="c-monitor-distribution-stat-value c-monitor-distribution-stat-value--orange">16270</span>
          </div>
        </div>
      </div>
      <div 
        class="c-monitor-distribution-card" 
        :style="{ 
          backgroundImage: `url(${bgm_4})`, 
          backgroundSize: '100% 100%', 
          backgroundPosition: 'center center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div class="c-monitor-distribution-card-title">江阴大桥</div>
        <div class="c-monitor-distribution-card-content">
          <div class="c-monitor-distribution-stat">
            <span class="c-monitor-distribution-stat-label">客车</span>
            <span class="c-monitor-distribution-stat-value c-monitor-distribution-stat-value--blue">66109</span>
          </div>
          <img :src="icon5" alt="车辆图标" class="c-monitor-distribution-card-icon" />
          <div class="c-monitor-distribution-stat">
            <span class="c-monitor-distribution-stat-label">货车</span>
            <span class="c-monitor-distribution-stat-value c-monitor-distribution-stat-value--orange">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[MonitorDistribution] $mcComponentBuilder 失败:', e)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>