<template>
  <div class="dashboard-container">
    <div class="data-card">
      <div class="card-title">今日访问量</div>
      <div class="card-value">12,847</div>
      <div class="card-trend">
        <span class="trend-icon">↑</span> 16.3% 较昨日
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.dashboard-container {
  background-color: #0f1115;
  min-height: 100vh;
  padding: 12px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.data-card {
  background-color: #1a1d24;
  border: 1px solid #2d333b;
  border-radius: 8px;
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
}

.card-title {
  color: #8b949e;
  font-size: 13px;
  font-weight: 400;
  margin-bottom: 12px;
}

.card-value {
  color: #00d2ff;
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 12px;
}

.card-trend {
  color: #00e676;
  font-size: 12px;
  font-weight: 400;
  display: flex;
  align-items: center;
}

.trend-icon {
  margin-right: 4px;
  font-size: 12px;
}
</style>