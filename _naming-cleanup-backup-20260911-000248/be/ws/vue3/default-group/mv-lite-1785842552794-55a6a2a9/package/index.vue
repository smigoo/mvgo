<template>
  <div class="robot-panel">
    <!-- 标题栏 -->
    <div class="panel-header">
      <div class="header-left">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00ffff" fill-opacity="0.8"/>
            <path d="M2 17L12 22L22 17" stroke="#00ffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="#00ffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2 class="panel-title">巡检机器人(机器人名称)</h2>
      </div>
      <div class="header-right">
        <button class="close-btn" @click="handleClose">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="header-decoration"></div>
    </div>

    <!-- 状态信息区 -->
    <div class="panel-content">
      <div class="status-grid">
        <div v-for="(item, index) in statusList" :key="index" class="status-item">
          <span class="status-label">{{ item.label }}</span>
          <span class="status-value" :class="getValueClass(item.type)">{{ item.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const statusList = ref([
  { label: '定位状态', value: '定位正常', type: 'success' },
  { label: '雷达状态', value: '雷达正常', type: 'success' },
  { label: '避障策略', value: '重新规划路径绕过障碍', type: 'normal' },
  { label: '运行状态', value: '正在运行', type: 'normal' },
  { label: '任务类型', value: '移动到充电桩', type: 'normal' },
  { label: '移动状态', value: '任务正在执行', type: 'normal' },
  { label: '速度', value: '40km/h', type: 'normal' },
  { label: '控制模式', value: '手动控制', type: 'normal' },
  { label: '剩余电量', value: '30%', type: 'danger' },
]);

const getValueClass = (type) => {
  if (type === 'success') return 'text-success';
  if (type === 'danger') return 'text-danger';
  return 'text-normal';
};

const handleClose = () => {
  console.log('Close panel');
};
</script>

<style scoped>
.robot-panel {
  background-color: #00222b;
  color: #ffffff;
  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  border: 1px solid #004455;
  box-shadow: 0 0 20px rgba(0, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: linear-gradient(90deg, #003340 0%, #00222b 100%);
  border-bottom: 2px solid #004455;
  position: relative;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 2;
}

.logo-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-icon svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 5px rgba(0, 255, 255, 0.5));
}

.panel-title {
  margin: 0;
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 1px;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
  font-family: 'Arial Black', sans-serif; /* 模拟截图中的粗体字 */
}

.header-right {
  z-index: 2;
}

.close-btn {
  background: transparent;
  border: none;
  color: #ffffff;
  cursor: pointer;
  padding: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.3s;
}

.close-btn:hover {
  color: #00ffff;
}

/* 标题栏下方的装饰线 */
.header-decoration {
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 2px;
  background: transparent;
  overflow: hidden;
}

.header-decoration::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 40%;
  width: 20%;
  height: 2px;
  background: #00ffff;
  box-shadow: 0 0 10px #00ffff;
}

/* 右侧装饰线 */
.header-decoration::before {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10%;
  height: 2px;
  background: #00ffff;
  opacity: 0.5;
}

.panel-content {
  padding: 30px 40px 40px;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px 40px;
}

.status-item {
  display: flex;
  align-items: center;
  font-size: 20px;
}

.status-label {
  color: #ffffff;
  font-weight: normal;
  margin-right: 10px;
  opacity: 0.9;
  white-space: nowrap;
}

.status-value {
  font-weight: bold;
  white-space: nowrap;
}

.text-success {
  color: #00ff00; /* 亮绿色 */
  text-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
}

.text-danger {
  color: #ff3333; /* 亮红色 */
  text-shadow: 0 0 5px rgba(255, 51, 51, 0.3);
}

.text-normal {
  color: #ffffff;
}

/* 响应式调整 */
@media (max-width: 600px) {
  .status-grid {
    grid-template-columns: 1fr;
  }
  .panel-title {
    font-size: 18px;
  }
}
</style>