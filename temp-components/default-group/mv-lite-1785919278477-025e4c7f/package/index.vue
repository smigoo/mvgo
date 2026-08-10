<template>
  <div class="dashboard-container">
    <div class="alarm-card">
      <div class="card-header">
        <span class="header-title">今日告警</span>
      </div>
      <div class="card-body">
        <div class="stat-number">23</div>
        <div class="stat-unit">条</div>
        <div class="stat-trend">↑ 8 条 较昨日</div>
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
}

.alarm-card {
  background-color: #141e30;
  border: 1px solid #1f3a5f;
  border-radius: 4px;
  width: 100%;
  /* 截图看起来卡片比较宽，可能是全屏或者大部分宽度 */
  max-width: 100%; 
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.card-header {
  text-align: center;
  padding: 12px 0;
  border-bottom: 1px solid #1f3a5f;
}

.header-title {
  color: #00d2ff; /* 截图中的青色 */
  font-size: 14px;
  font-weight: normal;
}

.card-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 0;
  gap: 8px;
}

.stat-number {
  color: #ff4d4f;
  font-size: 36px;
  font-weight: bold;
  line-height: 1.2;
}

.stat-unit {
  color: #ffffff;
  font-size: 12px;
  opacity: 0.8;
}

.stat-trend {
  color: #ff4d4f;
  font-size: 12px;
}
</style>