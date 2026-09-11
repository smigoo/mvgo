<template>
  <div class="jiangbei-work-well">
    <!-- 标题栏 -->
    <header class="jiangbei-work-well-header">
      <div class="header-left">
        <div class="header-icon"></div>
        <h1 class="header-title">江北工作井</h1>
      </div>
      <button class="header-close" @click="handleClose">✕</button>
    </header>

    <!-- 内容区 -->
    <div class="jiangbei-work-well-content">
      
      <!-- 排风机房 -->
      <section class="jiangbei-work-well-section">
        <div class="section-header">
          <div class="section-icon"></div>
          <h2 class="section-title">排风机房</h2>
        </div>
        <div class="card-grid grid-4-col">
          <!-- 送风机 1 (离线) -->
          <div class="device-card">
            <div class="card-body">
              <div class="card-icon-wrapper">
                <svg class="device-icon fan-icon" viewBox="0 0 24 24"><path d="M12 2C12 2 14 6 12 8C10 10 6 8 6 8C6 8 10 10 12 12C14 14 12 18 12 18C12 18 10 14 12 12C14 10 18 12 18 12C18 12 14 10 12 8C10 6 12 2 12 2Z" fill="#00E5FF"/></svg>
              </div>
              <div class="card-info">
                <div class="info-top">
                  <span class="device-name">送风机</span>
                  <span class="status-tag tag-offline">离线</span>
                </div>
                <div class="info-status">
                  <span class="status-dot dot-green"></span><span class="status-text">正转</span>
                  <span class="status-dot dot-gray"></span><span class="status-text">停止</span>
                </div>
              </div>
            </div>
            <div class="card-footer">
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" name="fan1" class="radio-input" checked>
                  <span class="radio-custom"></span>
                  <span class="radio-text">启动</span>
                </label>
                <label class="radio-label">
                  <input type="radio" name="fan1" class="radio-input">
                  <span class="radio-custom"></span>
                  <span class="radio-text">停机</span>
                </label>
              </div>
              <button class="btn-execute">执行</button>
            </div>
          </div>

          <!-- 送风机 2 (在线) -->
          <div class="device-card">
            <div class="card-body">
              <div class="card-icon-wrapper">
                <svg class="device-icon fan-icon" viewBox="0 0 24 24"><path d="M12 2C12 2 14 6 12 8C10 10 6 8 6 8C6 8 10 10 12 12C14 14 12 18 12 18C12 18 10 14 12 12C14 10 18 12 18 12C18 12 14 10 12 8C10 6 12 2 12 2Z" fill="#00E5FF"/></svg>
              </div>
              <div class="card-info">
                <div class="info-top">
                  <span class="device-name">送风机</span>
                  <span class="status-tag tag-online">在线</span>
                </div>
                <div class="info-status">
                  <span class="status-dot dot-green"></span><span class="status-text">正转</span>
                  <span class="status-dot dot-gray"></span><span class="status-text">停止</span>
                </div>
              </div>
            </div>
            <div class="card-footer">
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" name="fan2" class="radio-input" checked>
                  <span class="radio-custom"></span>
                  <span class="radio-text">启动</span>
                </label>
                <label class="radio-label">
                  <input type="radio" name="fan2" class="radio-input">
                  <span class="radio-custom"></span>
                  <span class="radio-text">停机</span>
                </label>
              </div>
              <button class="btn-execute">执行</button>
            </div>
          </div>

          <!-- 送风机 3 (无状态) -->
          <div class="device-card">
            <div class="card-body">
              <div class="card-icon-wrapper">
                <svg class="device-icon fan-icon" viewBox="0 0 24 24"><path d="M12 2C12 2 14 6 12 8C10 10 6 8 6 8C6 8 10 10 12 12C14 14 12 18 12 18C12 18 10 14 12 12C14 10 18 12 18 12C18 12 14 10 12 8C10 6 12 2 12 2Z" fill="#00E5FF"/></svg>
              </div>
              <div class="card-info">
                <div class="info-top">
                  <span class="device-name">送风机</span>
                </div>
                <div class="info-status">
                  <span class="status-dot dot-green"></span><span class="status-text">正转</span>
                  <span class="status-dot dot-gray"></span><span class="status-text">停止</span>
                </div>
              </div>
            </div>
            <div class="card-footer">
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" name="fan3" class="radio-input" checked>
                  <span class="radio-custom"></span>
                  <span class="radio-text">启动</span>
                </label>
                <label class="radio-label">
                  <input type="radio" name="fan3" class="radio-input">
                  <span class="radio-custom"></span>
                  <span class="radio-text">停机</span>
                </label>
              </div>
              <button class="btn-execute">执行</button>
            </div>
          </div>

          <!-- 温控混流风机 -->
          <div class="device-card card-tooltip-wrapper">
            <div class="tooltip-box">
              <div class="tooltip-header">
                <span class="tooltip-title">温控混流风机</span>
                <span class="tooltip-icon">ⓘ</span>
              </div>
              <div class="tooltip-content">温控模式，温度>30°C自动启动</div>
            </div>
            <div class="card-body">
              <div class="card-icon-wrapper">
                <svg class="device-icon fan-icon-large" viewBox="0 0 24 24"><path d="M12 2C12 2 14 6 12 8C10 10 6 8 6 8C6 8 10 10 12 12C14 14 12 18 12 18C12 18 10 14 12 12C14 10 18 12 18 12C18 12 14 10 12 8C10 6 12 2 12 2Z" fill="#00E5FF"/></svg>
              </div>
              <div class="card-info">
                <div class="info-top">
                  <span class="device-name">温控混流风机</span>
                </div>
              </div>
            </div>
            <div class="card-footer">
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" name="fan4" class="radio-input" checked>
                  <span class="radio-custom"></span>
                  <span class="radio-text">启动</span>
                </label>
                <label class="radio-label">
                  <input type="radio" name="fan4" class="radio-input">
                  <span class="radio-custom"></span>
                  <span class="radio-text">停机</span>
                </label>
              </div>
              <button class="btn-execute">执行</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 弱电机房 -->
      <section class="jiangbei-work-well-section">
        <div class="section-header">
          <div class="section-icon"></div>
          <h2 class="section-title">弱电机房</h2>
        </div>
        <div class="card-grid grid-4-col">
          <!-- 轴流风机 1 (报警/选中) -->
          <div class="device-card card-alert">
            <div class="card-body">
              <div class="card-icon-wrapper">
                <svg class="device-icon fan-icon" viewBox="0 0 24 24"><path d="M12 2C12 2 14 6 12 8C10 10 6 8 6 8C6 8 10 10 12 12C14 14 12 18 12 18C12 18 10 14 12 12C14 10 18 12 18 12C18 12 14 10 12 8C10 6 12 2 12 2Z" fill="#00E5FF"/></svg>
              </div>
              <div class="card-info">
                <div class="info-top">
                  <span class="device-name">轴流风机</span>
                </div>
                <div class="info-status">
                  <span class="status-dot dot-green"></span><span class="status-text">正转</span>
                  <span class="status-dot dot-gray"></span><span class="status-text">停止</span>
                </div>
              </div>
            </div>
            <div class="card-footer">
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" name="weak1" class="radio-input" checked>
                  <span class="radio-custom"></span>
                  <span class="radio-text">启动</span>
                </label>
                <label class="radio-label">
                  <input type="radio" name="weak1" class="radio-input">
                  <span class="radio-custom"></span>
                  <span class="radio-text">停机</span>
                </label>
              </div>
              <button class="btn-execute">执行</button>
            </div>
          </div>

          <!-- 轴流风机 2, 3, 4 -->
          <div class="device-card" v-for="i in 3" :key="i">
            <div class="card-body">
              <div class="card-icon-wrapper">
                <svg class="device-icon fan-icon" viewBox="0 0 24 24"><path d="M12 2C12 2 14 6 12 8C10 10 6 8 6 8C6 8 10 10 12 12C14 14 12 18 12 18C12 18 10 14 12 12C14 10 18 12 18 12C18 12 14 10 12 8C10 6 12 2 12 2Z" fill="#00E5FF"/></svg>
              </div>
              <div class="card-info">
                <div class="info-top">
                  <span class="device-name">轴流风机</span>
                </div>
                <div class="info-status">
                  <span class="status-dot dot-green"></span><span class="status-text">正转</span>
                  <span class="status-dot dot-gray"></span><span class="status-text">停止</span>
                </div>
              </div>
            </div>
            <div class="card-footer">
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" :name="'weak'+(i+1)" class="radio-input" checked>
                  <span class="radio-custom"></span>
                  <span class="radio-text">启动</span>
                </label>
                <label class="radio-label">
                  <input type="radio" :name="'weak'+(i+1)" class="radio-input">
                  <span class="radio-custom"></span>
                  <span class="radio-text">停机</span>
                </label>
              </div>
              <button class="btn-execute">执行</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 轴流排风机房 -->
      <section class="jiangbei-work-well-section">
        <div class="section-header">
          <div class="section-icon"></div>
          <h2 class="section-title">轴流排风机房</h2>
        </div>
        <div class="card-grid grid-4-col grid-2-rows">
          <div class="device-card" v-for="i in 8" :key="'valve'+i">
            <div class="card-body">
              <div class="card-icon-wrapper">
                <svg class="device-icon valve-icon" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="12" height="16" rx="2" fill="#00E5FF" opacity="0.8"/>
                  <path d="M6 8h12M6 12h12M6 16h12" stroke="#05161A" stroke-width="2"/>
                  <rect x="8" y="2" width="8" height="4" fill="#00E5FF"/>
                </svg>
              </div>
              <div class="card-info">
                <div class="info-top">
                  <span class="device-name">电动风阀</span>
                </div>
                <div class="info-status">
                  <span class="status-dot dot-green"></span><span class="status-text">正转</span>
                  <span class="status-dot dot-gray"></span><span class="status-text">停止</span>
                </div>
              </div>
            </div>
            <div class="card-footer">
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" :name="'valve'+i" class="radio-input" checked>
                  <span class="radio-custom"></span>
                  <span class="radio-text">启动</span>
                </label>
                <label class="radio-label">
                  <input type="radio" :name="'valve'+i" class="radio-input">
                  <span class="radio-custom"></span>
                  <span class="radio-text">停机</span>
                </label>
              </div>
              <button class="btn-execute">执行</button>
            </div>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const handleClose = () => {
  console.log('Close clicked');
};
</script>

<style scoped>
/* 变量定义 */
:root {
  --bg-root: #05161A;
  --bg-surface: #0B2E33;
  --bg-card: rgba(11, 46, 51, 0.6);
  --bg-card-alert: rgba(60, 20, 20, 0.6);
  --primary: #00E5FF;
  --text-main: #E2E8F0;
  --text-sub: #94A3B8;
  --border-color: #1A4F56;
  --border-alert: #8B0000;
  --tag-online-bg: #2E7D32;
  --tag-offline-bg: #546E7A;
  --dot-green: #00E676;
  --dot-gray: #78909C;
}

.jiangbei-work-well {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #05161A;
  color: #E2E8F0;
  font-family: 'Microsoft YaHei', sans-serif;
  display: flex;
  flex-direction: column;
  padding: 10px;
  overflow: hidden;
}

/* 标题栏 */
.jiangbei-work-well-header {
  height: 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(90deg, rgba(11, 46, 51, 0.8) 0%, rgba(5, 22, 26, 0) 100%);
  border-bottom: 1px solid #1A4F56;
  margin-bottom: 10px;
  padding: 0 10px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  width: 20px;
  height: 20px;
  background-color: #00E5FF;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  opacity: 0.8;
}

.header-title {
  font-size: 18px;
  font-weight: bold;
  margin: 0;
  color: #E2E8F0;
  letter-spacing: 1px;
}

.header-close {
  background: none;
  border: none;
  color: #E2E8F0;
  font-size: 20px;
  cursor: pointer;
  padding: 0 5px;
}

.header-close:hover {
  color: #00E5FF;
}

/* 内容区 */
.jiangbei-work-well-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}

/* 板块 */
.jiangbei-work-well-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.section-icon {
  width: 16px;
  height: 16px;
  background-color: #00E5FF;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  opacity: 0.6;
}

.section-title {
  font-size: 14px;
  font-weight: bold;
  margin: 0;
  color: #E2E8F0;
}

/* 网格布局 */
.card-grid {
  display: grid;
  gap: 12px;
  width: 100%;
}

.grid-4-col {
  grid-template-columns: repeat(4, 1fr);
}

.grid-2-rows {
  grid-template-rows: repeat(2, min-content);
}

/* 卡片 */
.device-card {
  background-color: rgba(11, 46, 51, 0.5);
  border: 1px solid #1A4F56;
  border-radius: 4px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  min-height: 90px;
}

.card-alert {
  border-color: #8B0000;
  background-color: rgba(60, 20, 20, 0.4);
  box-shadow: inset 0 0 10px rgba(139, 0, 0, 0.2);
}

.card-body {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.card-icon-wrapper {
  width: 40px;
  height: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: radial-gradient(circle, rgba(0, 229, 255, 0.1) 0%, transparent 70%);
  border-radius: 50%;
}

.device-icon {
  width: 24px;
  height: 24px;
  filter: drop-shadow(0 0 2px #00E5FF);
}

.fan-icon-large {
  width: 32px;
  height: 32px;
}

.valve-icon {
  width: 24px;
  height: 24px;
}

.card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0; /* 防止文字溢出 */
}

.info-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.device-name {
  font-size: 13px;
  font-weight: bold;
  color: #E2E8F0;
  white-space: nowrap;
}

.status-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
  color: #fff;
}

.tag-online {
  background-color: #2E7D32;
}

.tag-offline {
  background-color: #546E7A;
}

.info-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94A3B8;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.dot-green {
  background-color: #00E676;
  box-shadow: 0 0 4px #00E676;
}

.dot-gray {
  background-color: #78909C;
}

.status-text {
  margin-right: 6px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid rgba(26, 79, 86, 0.5);
}

.radio-group {
  display: flex;
  gap: 12px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 11px;
  color: #94A3B8;
}

.radio-input {
  display: none;
}

.radio-custom {
  width: 10px;
  height: 10px;
  border: 1px solid #78909C;
  border-radius: 50%;
  display: inline-block;
  position: relative;
}

.radio-input:checked + .radio-custom {
  border-color: #00E5FF;
}

.radio-input:checked + .radio-custom::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 4px;
  height: 4px;
  background-color: #00E5FF;
  border-radius: 50%;
}

.btn-execute {
  background-color: #00838F;
  color: #fff;
  border: none;
  padding: 4px 12px;
  border-radius: 2px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-execute:hover {
  background-color: #00E5FF;
  color: #05161A;
}

/* Tooltip 特殊处理 */
.card-tooltip-wrapper {
  position: relative;
  overflow: visible; /* 允许 tooltip 溢出 */
}

.tooltip-box {
  position: absolute;
  top: -50px;
  left: 0;
  right: 0;
  background-color: rgba(11, 46, 51, 0.95);
  border: 1px solid #00E5FF;
  padding: 6px;
  border-radius: 4px;
  z-index: 10;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  pointer-events: none; /* 防止遮挡 */
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  color: #00E5FF;
  font-weight: bold;
}

.tooltip-icon {
  font-size: 12px;
  cursor: help;
}

.tooltip-content {
  color: #E2E8F0;
  font-size: 10px;
}

/* 响应式调整 (虽然题目要求固定逻辑尺寸，但防止极端情况) */
@media (max-width: 600px) {
  .grid-4-col {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>