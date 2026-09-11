<template>
  <div class="page-container">
    <div class="stat-card">
      <div class="card-header">
        <span class="title-text">告警类型统计</span>
      </div>
      <div class="chart-area">
        <span class="placeholder-text">[ECharts 柱状图]</span>
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.page-container {
  background-color: #0d1117;
  min-height: 100vh;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.stat-card {
  background-color: #162436;
  border: 1px solid #21364d;
  border-radius: 4px;
  width: 95%;
  max-width: 1200px;
  padding: 15px;
  box-sizing: border-box;
}

.card-header {
  border-bottom: 1px solid #21364d;
  padding-bottom: 10px;
  margin-bottom: 15px;
}

.title-text {
  color: #00d2ff;
  font-size: 14px;
  font-weight: normal;
  line-height: 1.5;
}

.chart-area {
  background-color: #112030; /* 比卡片背景稍深 */
  border: 1px solid #1c2e42;
  border-radius: 2px;
  height: 200px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.placeholder-text {
  color: #8b949e;
  font-size: 14px;
  font-weight: normal;
  line-height: 1.5;
}
</style>