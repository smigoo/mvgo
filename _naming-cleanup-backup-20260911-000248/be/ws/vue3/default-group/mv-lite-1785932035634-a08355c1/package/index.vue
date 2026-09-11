<template>
  <div class="dashboard-container">
    <div class="header-section">
      <h1 class="main-title">智慧监控中心</h1>
      <p class="sub-title">更新时间：2026-08-05 16:45:00</p>
    </div>
    <div class="divider"></div>
    <div class="main-content">
      <!-- 主体内容区，目前为空白 -->
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.dashboard-container {
  background-color: #111111;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
}

.header-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 40px;
  padding-bottom: 20px;
  width: 100%;
}

.main-title {
  color: #00d2ff;
  font-size: 24px;
  font-weight: bold;
  margin: 0 0 12px 0;
  letter-spacing: 1px;
}

.sub-title {
  color: #aaaaaa;
  font-size: 12px;
  margin: 0;
  font-weight: normal;
}

.divider {
  width: 100%;
  height: 2px;
  background-color: #00d2ff;
  /* 模拟截图中线条几乎贯穿全屏的效果 */
  margin: 0 5px; 
  box-sizing: border-box;
}

.main-content {
  flex: 1;
  width: 100%;
  padding: 0 5px;
}
</style>