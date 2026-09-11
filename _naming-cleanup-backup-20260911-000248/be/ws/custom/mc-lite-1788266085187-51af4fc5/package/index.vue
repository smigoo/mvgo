<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitor-content">
      <!-- 顶部标题与统计汇总 -->
      <div class="c-equipment-monitor-header">
        <div class="c-equipment-monitor-title">
          <span class="c-equipment-monitor-title-icon">≡</span>
          <span class="c-equipment-monitor-title-text">设备监测</span>
        </div>
        <div class="c-equipment-monitor-stats">
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">设备类型</span>
            <span class="c-equipment-monitor-stat-value">28</span>
          </div>
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">设备总数</span>
            <span class="c-equipment-monitor-stat-value">68562</span>
          </div>
          <div class="c-equipment-monitor-stat-item">
            <span class="c-equipment-monitor-stat-label">完好率</span>
            <span class="c-equipment-monitor-stat-value">98%</span>
          </div>
        </div>
      </div>

      <!-- 统计卡片区 -->
      <div class="c-equipment-monitor-cards">
        <div class="c-equipment-monitor-card c-equipment-monitor-card-primary">
          <div class="c-equipment-monitor-card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
            </svg>
          </div>
          <div class="c-equipment-monitor-card-content">
            <div class="c-equipment-monitor-card-row">
              <span class="c-equipment-monitor-card-label">总</span>
              <span class="c-equipment-monitor-card-label">数:</span>
              <span class="c-equipment-monitor-card-number">56302</span>
            </div>
            <div class="c-equipment-monitor-card-row">
              <span class="c-equipment-monitor-card-subtitle">隧道设备</span>
              <span class="c-equipment-monitor-card-error">异常数:5</span>
            </div>
          </div>
          <div class="c-equipment-monitor-card-arrow"></div>
        </div>

        <div class="c-equipment-monitor-card c-equipment-monitor-card-secondary">
          <div class="c-equipment-monitor-card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
          </div>
          <div class="c-equipment-monitor-card-content">
            <div class="c-equipment-monitor-card-row">
              <span class="c-equipment-monitor-card-label">总</span>
              <span class="c-equipment-monitor-card-label">数:</span>
              <span class="c-equipment-monitor-card-number">1280</span>
            </div>
            <div class="c-equipment-monitor-card-row">
              <span class="c-equipment-monitor-card-subtitle">南北接线设备</span>
              <span class="c-equipment-monitor-card-error">异常数:3</span>
            </div>
          </div>
          <div class="c-equipment-monitor-card-arrow"></div>
        </div>
      </div>

      <!-- 主内容区：左侧导航 + 设备网格 -->
      <div class="c-equipment-monitor-main">
        <!-- 左侧分类导航 -->
        <div class="c-equipment-monitor-sidebar">
          <div 
            v-for="(category, index) in categories" 
            :key="index"
            class="c-equipment-monitor-category-btn"
            :class="{ 'c-equipment-monitor-category-active': activeCategory === index }"
            @click="activeCategory = index"
          >
            <span 
              v-if="category.badge" 
              class="c-equipment-monitor-badge"
            >
              {{ category.badge }}
            </span>
            <span class="c-equipment-monitor-category-text">{{ category.name }}</span>
          </div>
        </div>

        <!-- 设备网格 -->
        <div class="c-equipment-monitor-grid">
          <div 
            v-for="(device, index) in devices" 
            :key="index"
            class="c-equipment-monitor-device-card"
          >
            <div class="c-equipment-monitor-device-icon-wrapper">
              <div class="c-equipment-monitor-device-platform"></div>
              <div class="c-equipment-monitor-device-icon" v-html="device.icon"></div>
            </div>
            <div class="c-equipment-monitor-device-name">{{ device.name }}</div>
            <div 
              class="c-equipment-monitor-device-status"
              :class="{ 'c-equipment-monitor-device-error': device.error > 0 }"
            >
              ({{ device.error }}/{{ device.total }})
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

const activeCategory = ref(0)

const categories = ref([
  { name: '监控', badge: '3/3740' },
  { name: '照明', badge: '3' },
  { name: '通风', badge: null },
  { name: '供配电', badge: null },
  { name: '消防', badge: null },
  { name: '交通诱导', badge: null }
])

const devices = ref([
  { name: '摄像机', error: 2, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>' },
  { name: '风速风向仪', error: 1, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z"/></svg>' },
  { name: '超高检测器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z"/></svg>' },
  { name: '烟道机器人', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 16c-.83 0-1.5-.67-1.5-1.5S6.67 13 7.5 13s1.5.67 1.5 1.5S8.33 16 7.5 16zm3-7C9.67 9 9 8.33 9 7.5S9.67 6 10.5 6s1.5.67 1.5 1.5S11.33 9 10.5 9zm3 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm2.5-5.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5z"/></svg>' },
  { name: '激光雷达', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-12.5c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 5.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>' },
  { name: 'CO₂传感器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>' },
  { name: 'CO/VI检测器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 6.9c1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-.53.12-1.03.3-1.48.54l1.47 1.47c.41-.17.91-.27 1.51-.27zM5.33 4.06L4.06 5.33 7.5 8.77c0 2.08 1.56 3.21 3.91 3.91l3.51 3.51c-.34.48-1.05.91-2.42.91-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c.96-.18 1.82-.55 2.45-1.12l2.22 2.22 1.27-1.27L5.33 4.06z"/></svg>' },
  { name: '温湿度传感器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z"/></svg>' },
  { name: '压力传感器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"/></svg>' },
  { name: '光照度变送器', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"/></svg>' },
  { name: '紧急电话', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>' },
  { name: '水质监测设备', error: 0, total: 484, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.69l5.66 5.66c3.52 3.52 3.52 9.23 0 12.75-3.52 3.52-9.23 3.52-12.75 0-3.52-3.52-3.52-9.23 0-12.75L12 2.69m0 16.65c.94 0 1.71-.77 1.71-1.71s-.77-1.71-1.71-1.71-1.71.77-1.71 1.71.77 1.71 1.71 1.71z"/></svg>' }
])
</script>

<style scoped>
/*
 * 高度预算分解（P0-4）
 * 内容区可用高度 H = 389px
 * 根容器 padding: 10px → 剩余 H' = 389 - 20 = 369px
 * header: 24px
 * cards: 56px
 * gap: 8px × 2 = 16px
 * main 区域: 369 - 24 - 56 - 16 = 273px
 * grid 行高: (273 - 3×8) / 4 = (273 - 24) / 4 = 62.25px ≈ 62px
 * 图标: ≤ 62 × 0.45 = 28px
 * 文字: ≤ 62 × 0.25 = 15.5px
 */

.c-equipment-monitor-content {
  width: 100%;
  height: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: linear-gradient(135deg, #D5E3F0 0%, #E4EEF9 100%);
  color: #2C3E50;
  font-family: 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}

/* 顶部标题与统计 */
.c-equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 24px;
}

.c-equipment-monitor-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #3B9EFF;
}

.c-equipment-monitor-title-icon {
  font-size: 16px;
  font-weight: 700;
}

.c-equipment-monitor-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.c-equipment-monitor-stat-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.c-equipment-monitor-stat-label {
  font-size: 11px;
  color: #2C3E50;
}

.c-equipment-monitor-stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #3B9EFF;
}

/* 统计卡片区 */
.c-equipment-monitor-cards {
  display: flex;
  gap: 8px;
  height: 56px;
}

.c-equipment-monitor-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  position: relative;
  overflow: visible;
}

.c-equipment-monitor-card-primary {
  background: linear-gradient(90deg, #3B9EFF 0%, #5DADFF 100%);
}

.c-equipment-monitor-card-secondary {
  background: linear-gradient(90deg, #6BB8FF 0%, #A3D5FF 100%);
}

.c-equipment-monitor-card-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  flex-shrink: 0;
}

.c-equipment-monitor-card-icon svg {
  width: 20px;
  height: 20px;
  color: #FFF;
}

.c-equipment-monitor-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.c-equipment-monitor-card-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 11px;
  color: #FFF;
}

.c-equipment-monitor-card-label {
  font-size: 11px;
}

.c-equipment-monitor-card-number {
  font-size: 18px;
  font-weight: 700;
}

.c-equipment-monitor-card-subtitle {
  font-size: 11px;
}

.c-equipment-monitor-card-error {
  font-size: 11px;
  color: #FF3366;
  font-weight: 600;
}

.c-equipment-monitor-card-arrow {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-left: 8px solid currentColor;
  color: inherit;
  z-index: 1;
}

.c-equipment-monitor-card-primary .c-equipment-monitor-card-arrow {
  color: #5DADFF;
}

.c-equipment-monitor-card-secondary .c-equipment-monitor-card-arrow {
  color: #A3D5FF;
}

/* 主内容区 */
.c-equipment-monitor-main {
  display: flex;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 左侧导航 */
.c-equipment-monitor-sidebar {
  width: 42px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 12px;
  flex-shrink: 0;
}

.c-equipment-monitor-category-btn {
  width: 42px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3B9EFF 0%, #5DADFF 100%);
  border-radius: 4px;
  color: #FFF;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  writing-mode: vertical-rl;
  white-space: nowrap;
  letter-spacing: 2px;
  padding: 8px 0;
}

.c-equipment-monitor-category-btn:hover {
  background: linear-gradient(135deg, #2A8AEE 0%, #4C9CEE 100%);
  transform: translateX(2px);
}

.c-equipment-monitor-category-active {
  background: linear-gradient(135deg, #2A8AEE 0%, #4C9CEE 100%);
}

.c-equipment-monitor-badge {
  position: absolute;
  top: -6px;
  left: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FF3366;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 700;
  color: #FFF;
  writing-mode: horizontal-tb;
  white-space: nowrap;
  z-index: 10;
}

.c-equipment-monitor-category-text {
  display: block;
}

/* 设备网格 */
.c-equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
  align-content: start;
  min-height: 0;
}

.c-equipment-monitor-device-card {
  background: rgba(213, 227, 240, 0.6);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.2s;
  cursor: pointer;
  border: 1px solid rgba(143, 163, 184, 0.3);
}

.c-equipment-monitor-device-card:hover {
  background: rgba(213, 227, 240, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 158, 255, 0.2);
}

.c-equipment-monitor-device-icon-wrapper {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-equipment-monitor-device-platform {
  position: absolute;
  bottom: 0;
  width: 40px;
  height: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8) 0%, rgba(200, 215, 230, 0.8) 100%);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.c-equipment-monitor-device-icon {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3B9EFF;
  z-index: 1;
}

.c-equipment-monitor-device-icon svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 2px 4px rgba(59, 158, 255, 0.3));
}

.c-equipment-monitor-device-name {
  font-size: 12px;
  font-weight: 500;
  color: #2C3E50;
  text-align: center;
  line-height: 1.3;
  max-width: 100%;
}

.c-equipment-monitor-device-status {
  font-size: 13px;
  font-weight: 600;
  color: #00D4FF;
  text-align: center;
}

.c-equipment-monitor-device-error {
  color: #FF3366;
}

/* 滚动条样式 */
.c-equipment-monitor-grid::-webkit-scrollbar {
  width: 4px;
}

.c-equipment-monitor-grid::-webkit-scrollbar-track {
  background: rgba(143, 163, 184, 0.1);
  border-radius: 2px;
}

.c-equipment-monitor-grid::-webkit-scrollbar-thumb {
  background: rgba(59, 158, 255, 0.4);
  border-radius: 2px;
}

.c-equipment-monitor-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(59, 158, 255, 0.6);
}
</style>