<template>
  <div class="task-statistics">
    <div class="task-statistics-card task-statistics-card--total">
      <div class="task-statistics-bar" style="background-color: #475569;"></div>
      <div class="task-statistics-content">
        <div class="task-statistics-number" style="color: #334155;">27</div>
        <div class="task-statistics-label" style="color: #94A3B8;">总任务</div>
      </div>
    </div>
    
    <div class="task-statistics-card task-statistics-card--done">
      <div class="task-statistics-bar" style="background-color: #059669;"></div>
      <div class="task-statistics-content">
        <div class="task-statistics-number" style="color: #047857;">6</div>
        <div class="task-statistics-label" style="color: #6EE7B7;">已完成</div>
      </div>
    </div>

    <div class="task-statistics-card task-statistics-card--doing">
      <div class="task-statistics-bar" style="background-color: #2563EB;"></div>
      <div class="task-statistics-content">
        <div class="task-statistics-number" style="color: #1D4ED8;">0</div>
        <div class="task-statistics-label" style="color: #93C5FD;">进行中</div>
      </div>
    </div>

    <div class="task-statistics-card task-statistics-card--fail">
      <div class="task-statistics-bar" style="background-color: #DC2626;"></div>
      <div class="task-statistics-content">
        <div class="task-statistics-number" style="color: #B91C1C;">15</div>
        <div class="task-statistics-label" style="color: #FCA5A5;">失败</div>
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.task-statistics {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
  padding: 8px;
  background-color: #FFFFFF;
}

.task-statistics-card {
  position: relative;
  border-radius: 8px;
  padding: 10px 12px 10px 24px; /* 左侧留出竖条空间 */
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
}

.task-statistics-card--total {
  background-color: #F4F6F9;
}

.task-statistics-card--done {
  background-color: #ECFDF5;
}

.task-statistics-card--doing {
  background-color: #EFF6FF;
}

.task-statistics-card--fail {
  background-color: #FEF2F2;
}

.task-statistics-bar {
  position: absolute;
  left: 12px;
  top: 20%;
  bottom: 20%;
  width: 4px;
  border-radius: 2px;
}

.task-statistics-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-statistics-number {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.task-statistics-label {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}
</style>