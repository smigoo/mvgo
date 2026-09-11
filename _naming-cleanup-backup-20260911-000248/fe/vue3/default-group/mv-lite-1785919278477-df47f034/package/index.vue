<template>
  <div class="dashboard-container">
    <div class="data-card">
      <div class="card-header">
        <span class="title">今日车流量</span>
      </div>
      <div class="card-body">
        <div class="value">12,847</div>
        <div class="unit">辆次</div>
        <div class="trend">
          <span class="trend-icon">↑</span> 16.3% 较昨日
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 无脚本逻辑需求
</script>

<style scoped>
.dashboard-container {
  background-color: #0D1117;
  min-height: 100vh;
  padding: 10px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.data-card {
  background-color: #161B22;
  border: 1px solid #30363D;
  border-radius: 6px;
  padding: 16px 24px;
  width: 100%;
  max-width: 1200px; /* 限制最大宽度，模拟截图中的长条状 */
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card-header {
  width: 100%;
  text-align: center;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid #21262d; /* 稍微深一点的分割线 */
}

.title {
  color: #58a6ff; /* 浅蓝色，接近截图 */
  font-size: 14px;
  font-weight: normal;
}

.card-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.value {
  color: #00E676;
  font-size: 32px;
  font-weight: bold;
  line-height: 1.2;
  margin-bottom: 8px;
}

.unit {
  color: #8B949E;
  font-size: 12px;
  margin-bottom: 8px;
}

.trend {
  color: #f85149; /* 红色 */
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.trend-icon {
  font-size: 12px;
}
</style>