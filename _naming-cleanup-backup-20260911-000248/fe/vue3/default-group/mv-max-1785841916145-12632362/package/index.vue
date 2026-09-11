<template>
  <div class="container">
    <!-- 顶部导航栏 -->
    <header class="header">
      <div class="title-area">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 12L12 22L22 12L12 2Z" fill="#00F0FF" fill-opacity="0.8"/>
            <path d="M12 6L6 12L12 18L18 12L12 6Z" fill="#0055FF" fill-opacity="0.9"/>
          </svg>
        </div>
        <h1 class="main-title">养护管理</h1>
      </div>
      <div class="tabs">
        <div class="tab active">今日</div>
        <div class="tab">本月</div>
        <div class="tab">本年</div>
      </div>
    </header>

    <!-- 巡检统计区 -->
    <section class="section inspection-section">
      <div class="section-header">
        <h2 class="section-title">巡检统计</h2>
        <div class="title-decoration"></div>
      </div>

      <div class="inspection-data-row">
        <div class="truck-icon">
          <svg viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 20H24V12H40L48 20H60V24H4V20Z" fill="#F5A623"/>
            <path d="M40 12L48 20H40V12Z" fill="#D48806"/>
            <circle cx="12" cy="24" r="4" fill="#333"/>
            <circle cx="52" cy="24" r="4" fill="#333"/>
            <path d="M2 22L0 22" stroke="#00F0FF" stroke-width="2"/>
            <path d="M2 20L0 20" stroke="#00F0FF" stroke-width="2"/>
          </svg>
        </div>
        
        <div class="stat-item">
          <div class="label">应巡</div>
          <div class="value">7940.84 <span class="unit">km</span></div>
        </div>
        <div class="stat-item highlight-green">
          <div class="label">已巡</div>
          <div class="value">7940.84 <span class="unit">km</span></div>
        </div>
        <div class="stat-item">
          <div class="label">完成率</div>
          <div class="value">90.3 <span class="unit">%</span></div>
        </div>
      </div>

      <div class="progress-container">
        <div class="progress-bar-bg"></div>
        <div class="progress-bar-fill" style="width: 90.3%;">
          <div class="progress-indicator"></div>
        </div>
      </div>

      <div class="disease-count">
        累计病害数 <span class="count-num red">6</span> 起
      </div>
    </section>

    <!-- 施工统计区 -->
    <section class="section construction-section">
      <div class="section-header">
        <h2 class="section-title">施工统计</h2>
        <div class="title-decoration"></div>
      </div>

      <div class="construction-content">
        <div class="left-cards">
          <div class="card plan-card">
            <div class="card-icon worker-icon">
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="12" r="6" fill="#F5A623"/>
                <path d="M10 35L15 20H25L30 35" stroke="#00F0FF" stroke-width="2"/>
                <path d="M15 20L10 30" stroke="#00F0FF" stroke-width="2"/>
                <path d="M25 20L30 30" stroke="#00F0FF" stroke-width="2"/>
                <rect x="14" y="6" width="12" height="4" rx="2" fill="#F5A623"/>
              </svg>
            </div>
            <div class="card-label">计划施工</div>
            <div class="card-value orange">5 <span class="unit">处</span></div>
          </div>
          
          <div class="card done-card">
            <div class="card-icon check-icon">
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="14" stroke="#00F0FF" stroke-width="2" fill="rgba(0, 240, 255, 0.1)"/>
                <circle cx="20" cy="20" r="10" stroke="#00F0FF" stroke-width="1" fill="rgba(0, 240, 255, 0.2)"/>
                <path d="M14 20L18 24L26 16" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="card-label">已完成</div>
            <div class="card-value green">5 <span class="unit">处</span></div>
          </div>
        </div>

        <div class="right-list">
          <div class="list-item">
            <span class="item-label">合计占道次数</span>
            <span class="item-value">8 <span class="unit">次</span></span>
          </div>
          <div class="list-item">
            <span class="item-label">合计占道时长</span>
            <span class="item-value">1.5 <span class="unit">h</span></span>
          </div>
          <div class="list-item">
            <span class="item-label">合计占道里程</span>
            <span class="item-value">0.8 <span class="unit">km</span></span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
// 组件逻辑主要依赖模板和样式，无需复杂JS逻辑
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap');

.container {
  background-color: #02050A;
  color: #FFFFFF;
  font-family: 'Roboto', sans-serif;
  min-height: 100vh;
  padding: 20px;
  box-sizing: border-box;
  background-image: 
    radial-gradient(circle at 50% 50%, rgba(0, 240, 255, 0.05) 0%, transparent 60%),
    linear-gradient(0deg, rgba(0, 240, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 240, 255, 0.02) 1px, transparent 1px);
  background-size: 100% 100%, 40px 40px, 40px 40px;
}

/* Header Styles */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  background: linear-gradient(90deg, rgba(0, 50, 50, 0.8) 0%, rgba(0, 20, 20, 0.4) 100%);
  padding: 10px 20px;
  border-bottom: 2px solid #00F0FF;
  box-shadow: 0 4px 15px rgba(0, 240, 255, 0.2);
}

.title-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  width: 32px;
  height: 32px;
}

.main-title {
  font-size: 24px;
  font-weight: 900;
  margin: 0;
  letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
}

.tabs {
  display: flex;
  gap: 2px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid #00F0FF;
  border-radius: 4px;
  overflow: hidden;
}

.tab {
  padding: 6px 20px;
  font-size: 14px;
  cursor: pointer;
  color: #00F0FF;
  transition: all 0.3s;
}

.tab.active {
  background: #00F0FF;
  color: #000;
  font-weight: bold;
  box-shadow: 0 0 10px #00F0FF;
}

/* Section Common Styles */
.section {
  margin-bottom: 30px;
}

.section-header {
  position: relative;
  margin-bottom: 20px;
}

.section-title {
  font-size: 22px;
  font-weight: bold;
  margin: 0 0 5px 0;
  color: #fff;
  position: relative;
  z-index: 2;
  padding-left: 10px;
}

.title-decoration {
  height: 4px;
  background: linear-gradient(90deg, #00F0FF 0%, #0055FF 50%, transparent 100%);
  width: 100%;
  position: relative;
  box-shadow: 0 0 10px #00F0FF;
  clip-path: polygon(0 0, 100% 0, 95% 100%, 0% 100%);
}

/* Inspection Section */
.inspection-data-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin-bottom: 20px;
  padding: 10px 0;
}

.truck-icon {
  width: 80px;
  margin-right: 20px;
}

.stat-item {
  text-align: center;
  flex: 1;
}

.stat-item .label {
  font-size: 16px;
  color: #ccc;
  margin-bottom: 5px;
}

.stat-item .value {
  font-size: 28px;
  font-weight: bold;
  font-family: 'Arial', sans-serif;
}

.stat-item .unit {
  font-size: 14px;
  font-weight: normal;
  margin-left: 2px;
}

.highlight-green .value {
  color: #00FF9D;
  text-shadow: 0 0 10px rgba(0, 255, 157, 0.5);
}

.progress-container {
  position: relative;
  height: 10px;
  background: rgba(0, 240, 255, 0.1);
  margin: 0 40px 20px 40px;
  border-radius: 5px;
  box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.8);
}

.progress-bar-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #003333, #005555);
  border-radius: 5px;
}

.progress-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #00F0FF, #00FF9D);
  border-radius: 5px;
  box-shadow: 0 0 10px #00F0FF;
  display: flex;
  justify-content: flex-end;
}

.progress-indicator {
  width: 4px;
  height: 20px;
  background: #00F0FF;
  position: absolute;
  right: 0;
  top: -5px;
  box-shadow: 0 0 5px #fff;
}

.disease-count {
  text-align: center;
  font-size: 18px;
  margin-top: 20px;
  color: #ccc;
}

.count-num {
  font-size: 32px;
  font-weight: bold;
  margin: 0 5px;
  font-family: 'Arial', sans-serif;
}

.count-num.red {
  color: #FF4D4F;
  text-shadow: 0 0 10px rgba(255, 77, 79, 0.6);
}

/* Construction Section */
.construction-content {
  display: flex;
  gap: 20px;
}

.left-cards {
  display: flex;
  gap: 15px;
  width: 35%;
}

.card {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(0, 240, 255, 0.2);
  border-radius: 8px;
  padding: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00F0FF, transparent);
}

.card-icon {
  width: 50px;
  height: 50px;
  margin-bottom: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.worker-icon svg {
  width: 30px;
  height: 30px;
}

.check-icon svg {
  width: 35px;
  height: 35px;
}

.card-label {
  font-size: 16px;
  color: #ccc;
  margin-bottom: 5px;
}

.card-value {
  font-size: 28px;
  font-weight: bold;
}

.card-value .unit {
  font-size: 14px;
  font-weight: normal;
}

.card-value.orange {
  color: #F5A623;
}

.card-value.green {
  color: #00FF9D;
}

.right-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 15px;
  justify-content: center;
}

.list-item {
  background: rgba(0, 20, 30, 0.6);
  border: 1px solid rgba(0, 240, 255, 0.3);
  border-radius: 4px;
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: inset 0 0 20px rgba(0, 240, 255, 0.05);
  position: relative;
}

.list-item::after {
  content: '';
  position