<template>
  <div class="robot-modal">
    <!-- 标题栏 -->
    <div class="modal-header">
      <div class="header-left">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#4facfe"/>
            <path d="M2 17L12 22L22 17" stroke="#4facfe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="#4facfe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2 class="modal-title">巡检机器人(机器人名称)</h2>
      </div>
      <button class="close-btn" @click="$emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    
    <!-- 装饰分割线 -->
    <div class="header-divider"></div>

    <!-- 信息展示区 -->
    <div class="modal-content">
      <div class="info-grid">
        <div v-for="(item, index) in statusList" :key="index" class="info-item">
          <span class="info-label">{{ item.label }}</span>
          <span class="info-value" :style="{ color: item.valueColor }">{{ item.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

// 模拟数据，按照截图的视觉顺序排列（先左后右，行优先）
// 实际上截图是两列布局，Grid布局会自动处理 flow
const statusList = ref([
  { label: '定位状态', value: '定位正常', valueColor: '#00ff00' },
  { label: '雷达状态', value: '雷达正常', valueColor: '#00ff00' },
  { label: '避障策略', value: '重新规划路径绕过障碍', valueColor: '#ffffff' },
  { label: '运行状态', value: '正在运行', valueColor: '#ffffff' },
  { label: '任务类型', value: '移动到充电桩', valueColor: '#ffffff' },
  { label: '移动状态', value: '任务正在执行', valueColor: '#ffffff' },
  { label: '速度', value: '40km/h', valueColor: '#ffffff' },
  { label: '控制模式', value: '手动控制', valueColor: '#ffffff' },
  { label: '剩余电量', value: '30%', valueColor: '#ff0000' },
]);

defineEmits(['close']);
</script>

<style scoped>
/* 变量定义 */
:root {
  --bg-color: #002b36;
  --primary-color: #00ffff;
  --text-color: #ffffff;
  --success-color: #00ff00;
  --danger-color: #ff0000;
}

.robot-modal {
  background-color: #05181c; /* 比 #002b36 更深，贴近截图背景 */
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  border: 1px solid #004d5c;
  border-radius: 4px;
  width: 100%;
  max-width: 800px;
  box-shadow: 0 0 20px rgba(0, 255, 255, 0.1);
  overflow: hidden;
  position: relative;
}

/* 标题栏 */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: linear-gradient(to bottom, #003642, #002b36);
  border-bottom: 1px solid rgba(0, 255, 255, 0.3);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-icon svg {
  width: 100%;
  height: 100%;
}

.modal-title {
  margin: 0;
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 1px;
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.5);
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

.close-btn svg {
  width: 24px;
  height: 24px;
}

/* 分割线 */
.header-divider {
  height: 2px;
  background: linear-gradient(90deg, transparent, #00ffff, transparent);
  width: 100%;
  opacity: 0.8;
  box-shadow: 0 0 8px #00ffff;
}

/* 内容区 */
.modal-content {
  padding: 30px 40px;
  background-color: #00222b; /* 内容区域背景 */
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px 40px; /* 行间距 列间距 */
}

.info-item {
  display: flex;
  align-items: center;
  font-size: 18px;
}

.info-label {
  color: #e0e0e0;
  font-weight: normal;
  margin-right: 10px;
  white-space: nowrap;
}

.info-value {
  font-weight: bold;
  font-size: 20px;
}

/* 响应式调整 */
@media (max-width: 600px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
  .modal-content {
    padding: 20px;
  }
}
</style>