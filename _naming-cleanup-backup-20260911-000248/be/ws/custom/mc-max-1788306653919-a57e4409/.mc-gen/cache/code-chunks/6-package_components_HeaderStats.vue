<template>
  <div class="c-monitor-header-stats">
    <!-- 设备监测统计 -->
    <div class="c-monitor-stat-card c-monitor-stat-card-monitor">
      <div class="c-monitor-stat-label">设备监测</div>
      <div class="c-monitor-stat-group">
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-item-label">设备类型</span>
          <span class="c-monitor-stat-item-value">28</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-item-label">设备总数</span>
          <span class="c-monitor-stat-item-value">68562</span>
        </div>
        <div class="c-monitor-stat-item">
          <span class="c-monitor-stat-item-label">完好率</span>
          <span class="c-monitor-stat-item-value c-monitor-stat-item-value-success">98%</span>
        </div>
      </div>
    </div>

    <!-- 总数统计 -->
    <div class="c-monitor-stat-card c-monitor-stat-card-total">
      <img :src="icon1" class="c-monitor-stat-icon" alt="总数图标" />
      <div class="c-monitor-stat-content">
        <div class="c-monitor-stat-title">总</div>
        <div class="c-monitor-stat-row">
          <span class="c-monitor-stat-prefix">数：</span>
          <span class="c-monitor-stat-number">56302</span>
        </div>
        <div class="c-monitor-stat-status">
          <span class="c-monitor-stat-status-label">异常设备</span>
          <span class="c-monitor-stat-status-value">异常数:5</span>
        </div>
      </div>
    </div>

    <!-- 应急统计 -->
    <div class="c-monitor-stat-card c-monitor-stat-card-emergency">
      <img :src="icon2" class="c-monitor-stat-icon" alt="应急图标" />
      <div class="c-monitor-stat-content">
        <div class="c-monitor-stat-title">应</div>
        <div class="c-monitor-stat-row">
          <span class="c-monitor-stat-prefix">急 数：</span>
          <span class="c-monitor-stat-number c-monitor-stat-number-primary">1280</span>
        </div>
        <div class="c-monitor-stat-status">
          <span class="c-monitor-stat-status-label">应急理检</span>
          <span class="c-monitor-stat-status-value">异常数:3</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 图标资源由系统自动注入，这里直接使用
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
