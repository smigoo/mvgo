<template>
  <div class="modal-container">
    <!-- 外层容器 -->
    <div class="modal-wrapper">
      <!-- 标题栏 -->
      <header class="modal-header">
        <h2 class="title">结构预警事件</h2>
        <div class="badge">待处理 3</div>
        <button class="close-btn" @click="handleClose">×</button>
      </header>

      <!-- 左侧导航 -->
      <button class="nav-btn nav-left" @click="handlePrev">
        <span class="arrow">‹</span>
      </button>

      <!-- 右侧导航 -->
      <button class="nav-btn nav-right" @click="handleNext">
        <span class="arrow">›</span>
      </button>

      <!-- 预警信息卡片区 -->
      <main class="content-card">
        <div class="alert-header">
          <h3 class="alert-title">{{ currentAlert.title }}</h3>
          <div class="countdown-badge">{{ currentAlert.countdown }}</div>
        </div>
        
        <div class="info-list">
          <div class="info-item">
            <span class="info-label">预警时间：</span>
            <span class="info-value">{{ currentAlert.time }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">报警阈值：</span>
            <span class="info-value">{{ currentAlert.threshold }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">实时监测值：</span>
            <span class="info-value">{{ currentAlert.value }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">异常原因：</span>
            <span class="info-value">{{ currentAlert.reason }}</span>
          </div>
        </div>
      </main>

      <!-- 底部操作区 -->
      <footer class="footer">
        <div class="pagination-dots">
          <span 
            v-for="(dot, index) in totalDots" 
            :key="index"
            :class="['dot', { active: index === currentIndex }]"
            @click="handleDotClick(index)"
          ></span>
        </div>
        <button class="action-btn" @click="handleVerify">查看核实</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const currentIndex = ref(0)
const totalDots = ref(3)

const alertsData = ref([
  {
    title: 'k24+422 (ZYN6-2)沉降预警',
    countdown: '03:24:54',
    time: '2025-08-01 18:20',
    threshold: '-5~5 cm',
    value: '3 cm',
    reason: '数值偏小异常'
  },
  {
    title: 'k25+100 (ZYN6-3)倾斜预警',
    countdown: '02:15:30',
    time: '2025-08-01 17:45',
    threshold: '-3~3 mm',
    value: '4.2 mm',
    reason: '数值偏大异常'
  },
  {
    title: 'k26+500 (ZYN6-5)裂缝预警',
    countdown: '05:42:18',
    time: '2025-08-01 16:30',
    threshold: '0~2 mm',
    value: '2.8 mm',
    reason: '超过阈值上限'
  }
])

const currentAlert = ref(alertsData.value[0])

const handleClose = () => {
  console.log('关闭弹窗')
}

const handlePrev = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--
    currentAlert.value = alertsData.value[currentIndex.value]
  }
}

const handleNext = () => {
  if (currentIndex.value < alertsData.value.length - 1) {
    currentIndex.value++
    currentAlert.value = alertsData.value[currentIndex.value]
  }
}

const handleDotClick = (index) => {
  currentIndex.value = index
  currentAlert.value = alertsData.value[index]
}

const handleVerify = () => {
  console.log('查看核实', currentAlert.value)
}
</script>

<style scoped>
.modal-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.modal-wrapper {
  width: 405px;
  height: 338px;
  background: linear-gradient(180deg, #2D0A0A 0%, #1A0404 100%);
  border-radius: 12px;
  box-shadow: 0 0 20px rgba(220, 38, 38, 0.6), inset 0 0 30px rgba(153, 27, 27, 0.3);
  border: 2px solid #991B1B;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 标题栏 */
.modal-header {
  height: 12%;
  min-height: 40px;
  background: linear-gradient(90deg, #DC2626 0%, #991B1B 100%);
  display: flex;
  align-items: center;
  padding: 0 20px;
  position: relative;
  flex-shrink: 0;
}

.title {
  font-size: 22px;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
  letter-spacing: 1px;
}

.badge {
  margin-left: auto;
  background: #FACC15;
  color: #000000;
  padding: 4px 14px;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  margin-right: 15px;
}

.close-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: #FFFFFF;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  line-height: 1;
}

.close-btn:hover {
  color: #FCA5A5;
  transform: scale(1.1);
}

/* 导航按钮 */
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 80px;
  background: linear-gradient(180deg, #7F1D1D 0%, #450a0a 100%);
  border: 1px solid #991B1B;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.nav-btn:hover {
  background: linear-gradient(180deg, #991B1B 0%, #7F1D1D 100%);
  box-shadow: 0 0 12px rgba(220, 38, 38, 0.5);
}

.nav-left {
  left: -10px;
}

.nav-right {
  right: -10px;
}

.arrow {
  color: #FFFFFF;
  font-size: 32px;
  font-weight: 300;
  line-height: 1;
}

/* 内容卡片 */
.content-card {
  flex: 1;
  margin: 16px 20px 0;
  background: linear-gradient(180deg, rgba(26, 4, 4, 0.9) 0%, rgba(13, 2, 2, 0.95) 100%);
  border: 1px solid #450a0a;
  border-radius: 8px;
  padding: 24px;
  box-shadow: inset 0 0 20px rgba(69, 10, 10, 0.5), 0 0 15px rgba(153, 27, 27, 0.2);
  min-height: 0;
  overflow-y: auto;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.alert-title {
  font-size: 20px;
  font-weight: 600;
  color: #FFFFFF;
  margin: 0;
  letter-spacing: 0.5px;
}

.countdown-badge {
  background: rgba(234, 179, 8, 0.15);
  border: 1px solid #EAB308;
  color: #FACC15;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 18px;
  font-weight: 600;
  font-family: "Courier New", monospace;
  letter-spacing: 1px;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.info-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.info-label {
  font-size: 17px;
  color: #E5E7EB;
  font-weight: 400;
  white-space: nowrap;
}

.info-value {
  font-size: 17px;
  color: #FFFFFF;
  font-weight: 500;
}

/* 底部操作区 */
.footer {
  height: 18%;
  min-height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-bottom: 8px;
  flex-shrink: 0;
}

.pagination-dots {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.3s;
}

.dot.active {
  background: #FFFFFF;
  width: 20px;
  border-radius: 4px;
}

.dot:hover:not(.active) {
  background: rgba(255, 255, 255, 0.5);
}

.action-btn {
  background: linear-gradient(180deg, #991B1B 0%, #7F1D1D 100%);
  border: 1px solid #DC2626;
  color: #FFFFFF;
  padding: 8px 36px;
  border-radius: 6px;
  font-size: 17px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(127, 29, 29, 0.4);
}

.action-btn:hover {
  background: linear-gradient(180deg, #DC2626 0%, #991B1B 100%);
  box-shadow: 0 0 15px rgba(220, 38, 38, 0.6);
  transform: translateY(-1px);
}

.action-btn:active {
  transform: translateY(0);
}
</style>