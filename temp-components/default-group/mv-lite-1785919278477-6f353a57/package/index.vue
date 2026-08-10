<template>
  <div class="dashboard-container">
    <div class="status-card">
      <div class="card-header">
        <span class="card-title">设备在线率</span>
      </div>
      <div class="divider"></div>
      <div class="card-body">
        <div class="main-value">98.7%</div>
        <div class="sub-text">在线设备 1,247 / 总设备 1,263</div>
        <div class="trend-text">
          <span class="arrow">↓</span> 0.2% 较昨日
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
  background-color: #0f1216; /* 深色背景 */
  min-height: 100vh;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.status-card {
  background-color: #131c27; /* 卡片背景 */
  border: 1px solid #1e2d3d; /* 卡片边框 */
  border-radius: 8px;
  width: 100%;
  max-width: 1200px; /* 限制最大宽度，模拟截图比例 */
  padding: 20px 40px 30px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card-header {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 15px;
}

.card-title {
  color: #4dd0e1; /* 浅蓝色标题 */
  font-size: 14px;
  font-weight: normal;
  letter-spacing: 1px;
}

.divider {
  width: 100%;
  height: 1px;
  background-color: #1e2d3d; /* 分割线颜色 */
  margin-bottom: 25px;
}

.card-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.main-value {
  color: #00e676; /* 亮绿色数值 */
  font-size: 36px;
  font-weight: bold;
  line-height: 1.2;
}

.sub-text {
  color: #8b949e; /* 灰白色说明文字 */
  font-size: 13px;
}

.trend-text {
  color: #00e676; /* 绿色趋势文字 */
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.arrow {
  font-size: 12px;
}
</style>