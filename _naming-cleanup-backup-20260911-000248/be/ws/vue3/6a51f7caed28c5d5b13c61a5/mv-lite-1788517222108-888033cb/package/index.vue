<template>
  <div class="equipment-monitor">
    <!-- 标题栏 -->
    <div class="equipment-monitor-header">
      <div class="equipment-monitor-header-left">
        <svg class="equipment-monitor-header-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2l6 4v8H2V6l6-4zm0 1.5L3.5 7v6h9V7L8 3.5z"/>
        </svg>
        <span class="equipment-monitor-header-title">辽北工作柱</span>
      </div>
      <button class="equipment-monitor-header-close">×</button>
    </div>

    <!-- 楼层切换 Tab 栏 -->
    <div class="equipment-monitor-tabs">
      <button
        v-for="floor in floors"
        :key="floor"
        :class="['equipment-monitor-tab', { active: activeFloor === floor }]"
        @click="activeFloor = floor"
      >
        {{ floor }}
      </button>
    </div>

    <!-- 设备类型筛选栏 -->
    <div class="equipment-monitor-filter">
      <div class="equipment-monitor-filter-scroll">
        <button
          v-for="type in deviceTypes"
          :key="type.name"
          :class="['equipment-monitor-filter-item', { active: activeType === type.name }]"
          @click="activeType = type.name"
        >
          <svg v-if="type.icon" class="equipment-monitor-filter-icon" viewBox="0 0 16 16" fill="currentColor">
            <rect x="4" y="4" width="8" height="8" rx="1"/>
          </svg>
          <span>{{ type.name }}</span>
          <span v-if="type.badge" class="equipment-monitor-filter-badge">{{ type.badge }}</span>
        </button>
      </div>
      <button class="equipment-monitor-filter-arrow">›</button>
    </div>

    <!-- 设备分组区域 -->
    <div class="equipment-monitor-content">
      <!-- 排风机房 -->
      <div class="equipment-monitor-group">
        <div class="equipment-monitor-group-label">排风机房</div>
        <div class="equipment-monitor-grid">
          <div v-for="(device, idx) in group1Devices" :key="idx" class="equipment-monitor-card">
            <div class="equipment-monitor-card-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8"/>
                <path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </div>
            <div class="equipment-monitor-card-header">
              <div class="equipment-monitor-card-name">{{ device.name }}</div>
              <div :class="['equipment-monitor-card-status', device.statusClass]">
                <span class="equipment-monitor-card-status-dot"></span>
                {{ device.status }}
              </div>
            </div>
            <div class="equipment-monitor-card-info">
              <span class="equipment-monitor-card-mode">{{ device.mode }}</span>
              <span class="equipment-monitor-card-state">{{ device.state }}</span>
            </div>
            <div class="equipment-monitor-card-actions">
              <button class="equipment-monitor-card-btn outline">启动</button>
              <button class="equipment-monitor-card-btn outline">停机</button>
              <button class="equipment-monitor-card-btn primary">执行</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 弱电机房 -->
      <div class="equipment-monitor-group">
        <div class="equipment-monitor-group-label">弱电机房</div>
        <div class="equipment-monitor-grid">
          <div v-for="(device, idx) in group2Devices" :key="idx" class="equipment-monitor-card">
            <div class="equipment-monitor-card-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8"/>
                <path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </div>
            <div class="equipment-monitor-card-header">
              <div class="equipment-monitor-card-name">{{ device.name }}</div>
              <div :class="['equipment-monitor-card-status', device.statusClass]">
                <span class="equipment-monitor-card-status-dot"></span>
                {{ device.status }}
              </div>
            </div>
            <div class="equipment-monitor-card-info">
              <span class="equipment-monitor-card-mode">{{ device.mode }}</span>
              <span class="equipment-monitor-card-state">{{ device.state }}</span>
            </div>
            <div class="equipment-monitor-card-actions">
              <button class="equipment-monitor-card-btn outline">启动</button>
              <button class="equipment-monitor-card-btn outline">停机</button>
              <button class="equipment-monitor-card-btn primary">执行</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 轴流排风机房 -->
      <div class="equipment-monitor-group">
        <div class="equipment-monitor-group-label">轴流排风机房</div>
        <div class="equipment-monitor-grid">
          <div v-for="(device, idx) in group3Devices" :key="idx" class="equipment-monitor-card">
            <div class="equipment-monitor-card-icon chart">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="14" width="3" height="6"/>
                <rect x="10" y="10" width="3" height="10"/>
                <rect x="15" y="6" width="3" height="14"/>
              </svg>
            </div>
            <div class="equipment-monitor-card-header">
              <div class="equipment-monitor-card-name">{{ device.name }}</div>
              <div :class="['equipment-monitor-card-status', device.statusClass]">
                <span class="equipment-monitor-card-status-dot"></span>
                {{ device.status }}
              </div>
            </div>
            <div class="equipment-monitor-card-info">
              <span class="equipment-monitor-card-mode">{{ device.mode }}</span>
              <span class="equipment-monitor-card-state">{{ device.state }}</span>
            </div>
            <div class="equipment-monitor-card-actions">
              <button class="equipment-monitor-card-btn outline">启动</button>
              <button class="equipment-monitor-card-btn outline">停机</button>
              <button class="equipment-monitor-card-btn primary">执行</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeFloor = ref('地下一层')
const floors = ['地下一层', '风道夹层', '地下二层', '地下三层', '地下四层']

const activeType = ref('全部')
const deviceTypes = [
  { name: '全部', icon: true },
  { name: '排风机', icon: true, badge: 2 },
  { name: '送风机', icon: true, badge: 1 },
  { name: '变频轴流风机', icon: true },
  { name: '电动风阀', icon: true },
  { name: '电动组合风阀', icon: true },
  { name: '潜污泵', icon: true },
  { name: '液位计', icon: true }
]

const group1Devices = [
  { name: '送风机', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '送风机', status: '运转', statusClass: 'running', mode: '正转', state: '停止' },
  { name: '送风机', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '暖通渗漏风机', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' }
]

const group2Devices = [
  { name: '轴流风机', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '轴流风机', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '轴流风机', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '轴流风机', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' }
]

const group3Devices = [
  { name: '电动风阀', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '电动风阀', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '电动风阀', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '电动风阀', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '电动风阀', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '电动风阀', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '电动风阀', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' },
  { name: '电动风阀', status: '停止', statusClass: 'stopped', mode: '正转', state: '停止' }
]
</script>

<style scoped>
.equipment-monitor {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #0A2E2A;
  color: #FFFFFF;
  padding: 8px;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* 标题栏 */
.equipment-monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 20px;
  margin-bottom: 8px;
}

.equipment-monitor-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.equipment-monitor-header-icon {
  width: 14px;
  height: 14px;
  color: #FFFFFF;
}

.equipment-monitor-header-title {
  font-size: 10px;
  font-weight: 500;
  color: #FFFFFF;
}

.equipment-monitor-header-close {
  width: 18px;
  height: 18px;
  background: transparent;
  border: none;
  color: #FFFFFF;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

/* 楼层 Tab 栏 */
.equipment-monitor-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  height: 22px;
}

.equipment-monitor-tab {
  flex: 1;
  background: transparent;
  border: 1px solid #1A4D47;
  border-radius: 3px;
  color: #FFFFFF;
  font-size: 9px;
  font-weight: 400;
  cursor: pointer;
  padding: 4px 6px;
  transition: all 0.2s;
}

.equipment-monitor-tab.active {
  background: rgba(0, 191, 165, 0.15);
  border-color: #00BFA5;
  color: #00BFA5;
}

/* 设备类型筛选栏 */
.equipment-monitor-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  height: 20px;
}

.equipment-monitor-filter-scroll {
  flex: 1;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.equipment-monitor-filter-scroll::-webkit-scrollbar {
  display: none;
}

.equipment-monitor-filter-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid #1A4D47;
  border-radius: 10px;
  color: #999999;
  font-size: 8px;
  font-weight: 400;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s;
}

.equipment-monitor-filter-item.active {
  background: #00BFA5;
  border-color: #00BFA5;
  color: #FFFFFF;
}

.equipment-monitor-filter-icon {
  width: 10px;
  height: 10px;
}

.equipment-monitor-filter-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  background: #F44336;
  border-radius: 7px;
  color: #FFFFFF;
  font-size: 8px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.equipment-monitor-filter-arrow {
  width: 20px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #1A4D47;
  border-radius: 3px;
  color: #FFFFFF;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
}

/* 内容区域 */
.equipment-monitor-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 设备分组 */
.equipment-monitor-group {
  display: flex;
  gap: 8px;
}

.equipment-monitor-group-label {
  writing-mode: vertical-rl;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #1A4D47;
  border-radius: 3px;
  padding: 8px 4px;
  font-size: 9px;
  font-weight: 400;
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 2px;
  flex-shrink: 0;
}

/* 设备网格 */
.equipment-monitor-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: min-content;
  gap: 8px;
  min-height: 0;
}

/* 设备卡片 */
.equipment-monitor-card {
  background: #0F3D38;
  border: 1px solid #1A4D47;
  border-radius: 4px;
  padding: 10px 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.equipment-monitor-card-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00BFA5 0%, #008C7A 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 4px;
  flex-shrink: 0;
}

.equipment-monitor-card-icon svg {
  width: 18px;
  height: 18px;
  color: #FFFFFF;
}

.equipment-monitor-card-icon.chart svg {
  width: 16px;
  height: 16px;
}

.equipment-monitor-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.equipment-monitor-card-name {
  font-size: 9px;
  font-weight: 400;
  color: #FFFFFF;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.equipment-monitor-card-status {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 7px;
  font-weight: 400;
  white-space: nowrap;
  flex-shrink: 0;
}

.equipment-monitor-card-status.running {
  background: #00C853;
  color: #FFFFFF;
}

.equipment-monitor-card-status.stopped {
  background: rgba(255, 255, 255, 0.1);
  color: #999999;
}

.equipment-monitor-card-status-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}

.equipment-monitor-card-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 7px;
  color: #999999;
}

.equipment-monitor-card-mode::after {
  content: '/';
  margin-left: 4px;
}

.equipment-monitor-card-actions {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

.equipment-monitor-card-btn {
  flex: 1;
  height: 18px;
  border-radius: 3px;
  font-size: 7px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
  white-space: nowrap;
}

.equipment-monitor-card-btn.outline {
  background: transparent;
  border: 1px solid #00BFA5;
  color: #00BFA5;
}

.equipment-monitor-card-btn.outline:hover {
  background: rgba(0, 191, 165, 0.1);
}

.equipment-monitor-card-btn.primary {
  background: #00BFA5;
  border: 1px solid #00BFA5;
  color: #FFFFFF;
}

.equipment-monitor-card-btn.primary:hover {
  background: #00A893;
  border-color: #00A893;
}
</style>