<template>
  <div class="c-monitor-stats-banner">
    <!-- 全局统计 -->
    <div class="c-monitor-global-stats">
      <div class="c-monitor-stat-item">
        <span class="c-monitor-stat-label">设备类型</span>
        <span class="c-monitor-stat-value">28</span>
      </div>
      <div class="c-monitor-stat-item">
        <span class="c-monitor-stat-label">设备总数</span>
        <span class="c-monitor-stat-value c-monitor-stat-value-highlight">68562</span>
      </div>
      <div class="c-monitor-stat-item">
        <span class="c-monitor-stat-label">完好率</span>
        <span class="c-monitor-stat-value c-monitor-stat-value-success">98%</span>
      </div>
    </div>

    <!-- 隧道设备卡片 -->
    <div class="c-monitor-device-card c-monitor-device-card-tunnel">
      <div class="c-monitor-card-content">
        <div class="c-monitor-card-label">{{ tunnelStats.label }}</div>
        <div class="c-monitor-card-stats">
          <div class="c-monitor-card-stat-row">
            <span class="c-monitor-card-stat-label">总数:</span>
            <span class="c-monitor-card-stat-value">{{ tunnelStats.total }}</span>
          </div>
          <div class="c-monitor-card-stat-row">
            <span class="c-monitor-card-stat-label">异常数:</span>
            <span class="c-monitor-card-stat-value c-monitor-card-stat-value-error">{{ tunnelStats.abnormal }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 桥梁设备卡片 -->
    <div class="c-monitor-device-card c-monitor-device-card-bridge">
      <div class="c-monitor-card-content">
        <div class="c-monitor-card-label">{{ bridgeStats.label }}</div>
        <div class="c-monitor-card-stats">
          <div class="c-monitor-card-stat-row">
            <span class="c-monitor-card-stat-label">总数:</span>
            <span class="c-monitor-card-stat-value">{{ bridgeStats.total }}</span>
          </div>
          <div class="c-monitor-card-stat-row">
            <span class="c-monitor-card-stat-label">异常数:</span>
            <span class="c-monitor-card-stat-value c-monitor-card-stat-value-error">{{ bridgeStats.abnormal }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  tunnelStats: {
    type: Object,
    default: () => ({
      label: '隧道设备',
      total: '56302',
      abnormal: '5'
    })
  },
  bridgeStats: {
    type: Object,
    default: () => ({
      label: '南北接线 / 设备',
      total: '1280',
      abnormal: '3'
    })
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
