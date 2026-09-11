<template>
  <div class="dashboard-container">
    <div class="header-section">
      <h1 class="main-title">江阴靖江长江隧道智慧监控中心</h1>
      <div class="status-row">
        <span class="status-dot"></span>
        <span class="status-text">系统运行正常 · 更新时间：2026-08-05 16:48:00</span>
      </div>
    </div>
    <div class="divider-line"></div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.dashboard-container {
  width: 100%;
  height: 100vh;
  background-color: #0b0f12;
  /* 模拟截图中的微弱径向光感 */
  background-image: radial-gradient(circle at 50% 20%, #131a1e 0%, #0b0f12 60%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8vh;
  box-sizing: border-box;
  overflow: hidden;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}

.header-section {
  width: 80%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}

.main-title {
  color: #00f0ff;
  font-size: 32px;
  font-weight: bold;
  margin: 0 0 15px 0;
  letter-spacing: 2px;
  /* 标题文字带有轻微的青色发光效果 */
  text-shadow: 0 0 12px rgba(0, 240, 255, 0.5);
  line-height: 1.5;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.status-dot {
  width: 6px;
  height: 6px;
  background-color: #00ff00; /* 绿色实心圆点 */
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(0, 255, 0, 0.6);
}

.status-text {
  color: #a3a6ad;
  font-size: 14px;
  line-height: 1.5;
  font-weight: normal;
}

.divider-line {
  width: 50%; /* 视觉上比标题稍宽，但远小于80%屏幕宽，这里取适中比例 */
  max-width: 800px;
  height: 1px;
  /* 分割线颜色较暗，带有渐变或半透明效果 */
  background: linear-gradient(90deg, transparent 0%, #1a3b42 20%, #1a3b42 80%, transparent 100%);
  opacity: 0.8;
}
</style>