<template>
  <div class="dashboard-container">
    <div class="top-card">
      <div class="card-header">
        <span class="header-title">车流量趋势 (24小时)</span>
      </div>
      <div class="chart-placeholder">
        <span class="placeholder-text">[ECharts 折线图]</span>
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.dashboard-container {
  width: 100%;
  min-height: 100vh;
  background-color: #0f1115;
  padding: 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.top-card {
  width: 99%;
  height: 32vh; /* 约占屏幕1/3 */
  min-height: 200px;
  background-color: #111b26;
  border: 1px solid #1c2e40;
  border-radius: 4px;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.card-header {
  width: 100%;
  padding-bottom: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid #1c2e40;
}

.header-title {
  color: #00d2ff;
  font-size: 14px;
  font-weight: normal;
  line-height: 1.5;
}

.chart-placeholder {
  flex: 1;
  background-color: #111b26;
  border: 1px solid #1c2e40;
  border-radius: 2px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.placeholder-text {
  color: #8b9bb4;
  font-size: 14px;
  font-weight: normal;
  line-height: 1.5;
}
</style>