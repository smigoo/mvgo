<template>
  <div class="dashboard-container">
    <div class="data-card">
      <div class="card-title">今日访问量</div>
      <div class="card-value">12,847</div>
      <div class="card-trend">↑ 16.3% 较昨日</div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.dashboard-container {
  background-color: #0f1115;
  min-height: 100vh;
  padding: 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.data-card {
  background-color: #1a1d21;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 20px 24px;
  width: calc(100% - 20px);
  max-width: 1200px; /* 限制一下最大宽度，虽然截图看起来很长 */
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-title {
  color: #8b949e;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}

.card-value {
  color: #00d2ff;
  font-size: 32px;
  font-weight: bold;
  line-height: 1.2;
}

.card-trend {
  color: #00e676;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}
</style>