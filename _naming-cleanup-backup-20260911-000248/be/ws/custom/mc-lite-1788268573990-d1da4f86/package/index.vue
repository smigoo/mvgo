<template>
  <base-panel panelKey="default-panel">
    <div class="c-equipment-monitor-content">
      <!-- 顶部统计栏 -->
      <div class="c-equipment-monitor-header">
        <div class="c-equipment-monitor-title">设备监测</div>
        <div class="c-equipment-monitor-stat">
          <span class="c-equipment-monitor-stat-label">设备类型</span>
          <span class="c-equipment-monitor-stat-value">28</span>
        </div>
        <div class="c-equipment-monitor-stat">
          <span class="c-equipment-monitor-stat-label">设备总数</span>
          <span class="c-equipment-monitor-stat-value">68562</span>
        </div>
        <div class="c-equipment-monitor-stat">
          <span class="c-equipment-monitor-stat-label">完好率</span>
          <span class="c-equipment-monitor-stat-value c-equipment-monitor-stat-success">98%</span>
        </div>
      </div>

      <!-- 箭头形统计卡片区 -->
      <div class="c-equipment-monitor-summary">
        <div class="c-equipment-monitor-arrow-card c-equipment-monitor-arrow-primary">
          <div class="c-equipment-monitor-arrow-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="24" r="18" fill="currentColor" opacity="0.2"/>
              <circle cx="24" cy="24" r="14" fill="currentColor" opacity="0.4"/>
              <path d="M24 14v10m0 0v10m0-10h10m-10 0H14" stroke="currentColor" stroke-width="2"/>
            </svg>
          </div>
          <div class="c-equipment-monitor-arrow-info">
            <div class="c-equipment-monitor-arrow-label">隧道设备</div>
            <div class="c-equipment-monitor-arrow-total">
              总 数:<span>56302</span>
            </div>
            <div class="c-equipment-monitor-arrow-error">
              异常数:<span>5</span>
            </div>
          </div>
        </div>
        <div class="c-equipment-monitor-arrow-card c-equipment-monitor-arrow-secondary">
          <div class="c-equipment-monitor-arrow-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="24" cy="24" rx="16" ry="10" fill="currentColor" opacity="0.3"/>
              <path d="M14 24h20M24 14v20" stroke="currentColor" stroke-width="2"/>
            </svg>
          </div>
          <div class="c-equipment-monitor-arrow-info">
            <div class="c-equipment-monitor-arrow-label">南北接线<br>设备</div>
            <div class="c-equipment-monitor-arrow-total">
              总 数:<span>1280</span>
            </div>
            <div class="c-equipment-monitor-arrow-error">
              异常数:<span>3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主体区域：左侧导航 + 右侧网格 -->
      <div class="c-equipment-monitor-main">
        <!-- 左侧竖向导航栏 -->
        <div class="c-equipment-monitor-sidebar">
          <div class="c-equipment-monitor-badge-area">
            <span class="c-equipment-monitor-counter">3/3740</span>
            <span class="c-equipment-monitor-badge">3</span>
          </div>
          <button
            v-for="(cat, idx) in categories"
            :key="idx"
            class="c-equipment-monitor-nav-btn"
            :class="{ 'c-equipment-monitor-nav-active': activeCategory === idx }"
            @click="activeCategory = idx"
          >
            {{ cat }}
          </button>
        </div>

        <!-- 右侧设备网格 -->
        <div class="c-equipment-monitor-grid">
          <div
            v-for="(device, idx) in devices"
            :key="idx"
            class="c-equipment-monitor-device-card"
          >
            <div class="c-equipment-monitor-device-icon">
              <div class="c-equipment-monitor-icon-base c-equipment-monitor-icon-base-outer"></div>
              <div class="c-equipment-monitor-icon-base c-equipment-monitor-icon-base-inner"></div>
              <component :is="device.icon" class="c-equipment-monitor-device-svg" />
            </div>
            <div class="c-equipment-monitor-device-name">{{ device.name }}</div>
            <div 
              class="c-equipment-monitor-device-status"
              :class="{
                'c-equipment-monitor-status-error': device.error > 0,
                'c-equipment-monitor-status-normal': device.error === 0
              }"
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
import { ref, h } from 'vue'

const activeCategory = ref(0)

const categories = ['监控', '照明', '通风', '供配电', '消防', '交通诱导']

// 设备图标SVG组件
const CameraIcon = () => h('svg', { viewBox: '0 0 32 32', fill: 'currentColor' }, [
  h('path', { d: 'M8 10h12v2H8zm0 4h12v2H8zm16-6l6-4v16l-6-4z' })
])

const WindIcon = () => h('svg', { viewBox: '0 0 32 32', fill: 'currentColor' }, [
  h('path', { d: 'M8 10h8c2 0 3 1 3 2s-1 2-3 2H8zm0 6h10c2 0 4 1 4 3s-2 3-4 3H8z' })
])

const DetectorIcon = () => h('svg', { viewBox: '0 0 32 32', fill: 'currentColor' }, [
  h('rect', { x: '10', y: '8', width: '12', height: '16', rx: '2' }),
  h('circle', { cx: '16', cy: '16', r: '3' })
])

const RobotIcon = () => h('svg', { viewBox: '0 0 32 32', fill: 'currentColor' }, [
  h('rect', { x: '10', y: '12', width: '12', height: '10', rx: '2' }),
  h('circle', { cx: '14', cy: '16', r: '1.5' }),
  h('circle', { cx: '18', cy: '16', r: '1.5' }),
  h('path', { d: 'M16 8v4M12 22v3M20 22v3' })
])

const RadarIcon = () => h('svg', { viewBox: '0 0 32 32', fill: 'currentColor' }, [
  h('circle', { cx: '16', cy: '16', r: '8', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }),
  h('circle', { cx: '16', cy: '16', r: '4', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }),
  h('line', { x1: '16', y1: '16', x2: '22', y2: '10', stroke: 'currentColor', 'stroke-width': '2' })
])

const SensorIcon = () => h('svg', { viewBox: '0 0 32 32', fill: 'currentColor' }, [
  h('circle', { cx: '16', cy: '16', r: '6' }),
  h('circle', { cx: '16', cy: '16', r: '3', fill: '#fff' })
])

const PhoneIcon = () => h('svg', { viewBox: '0 0 32 32', fill: 'currentColor' }, [
  h('rect', { x: '11', y: '6', width: '10', height: '20', rx: '2' }),
  h('circle', { cx: '16', cy: '23', r: '1' })
])

const MonitorIcon = () => h('svg', { viewBox: '0 0 32 32', fill: 'currentColor' }, [
  h('rect', { x: '6', y: '8', width: '20', height: '14', rx: '2' }),
  h('path', { d: 'M12 22h8l-1 3h-6z' })
])

const devices = ref([
  { name: '摄像机', error: 2, total: 484, icon: CameraIcon },
  { name: '风速风向仪', error: 1, total: 484, icon: WindIcon },
  { name: '超高检测器', error: 0, total: 484, icon: DetectorIcon },
  { name: '烟道机器人', error: 0, total: 484, icon: RobotIcon },
  { name: '激光雷达', error: 0, total: 484, icon: RadarIcon },
  { name: 'CO₂传感器', error: 0, total: 484, icon: SensorIcon },
  { name: 'CO/VI检测器', error: 0, total: 484, icon: SensorIcon },
  { name: '温湿度传感器', error: 0, total: 484, icon: SensorIcon },
  { name: '压力传感器', error: 0, total: 484, icon: SensorIcon },
  { name: '光照度变送器', error: 0, total: 484, icon: SensorIcon },
  { name: '紧急电话', error: 0, total: 484, icon: PhoneIcon },
  { name: '水质监测设备', error: 0, total: 484, icon: MonitorIcon }
])
</script>

<style scoped>
/* 
高度预算分解：
可用高度 H = 389px
根容器 padding: 14px，实际可用 = 389 - 28 = 361px
顶部统计栏：38px
箭头卡片：76px
间距：统计栏与卡片 8px，卡片与主体 10px
主体区域：361 - 38 - 8 - 76 - 10 = 229px
网格：3列 × 4行，行高 = (229 - 30) / 4 ≈ 49px
导航栏按钮：6个，徽标区20px，按钮区209px，单按钮 = (209 - 15) / 6 ≈ 32px
竖排文字：4字 × 8px字号 × 1.2 = 38.4px，需要字号7px，4×8.4=33.6px，padding 2px×2 = 37.6px > 32px
最终：字号6px，letter-spacing 1.5px，4×7.5=30px，padding 1px = 32px
*/

.c-equipment-monitor-content {
  width: 100%;
  height: 100%;
  background: #E4EEF9;
  padding: 14px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 顶部统计栏 */
.c-equipment-monitor-header {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 38px;
  flex-shrink: 0;
}

.c-equipment-monitor-title {
  font-size: 15px;
  font-weight: 500;
  color: #3B9EFF;
  margin-right: 8px;
}

.c-equipment-monitor-stat {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-equipment-monitor-stat-label {
  font-size: 12px;
  color: #1F2937;
}

.c-equipment-monitor-stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #3B9EFF;
}

.c-equipment-monitor-stat-success {
  color: #10B981;
}

/* 箭头形统计卡片区 */
.c-equipment-monitor-summary {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  height: 76px;
  flex-shrink: 0;
}

.c-equipment-monitor-arrow-card {
  flex: 1;
  min-width: 0;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  overflow: hidden;
}

.c-equipment-monitor-arrow-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: -20px;
  width: 40px;
  height: 100%;
  background: inherit;
  transform: skewX(-15deg);
  filter: brightness(1.1);
}

.c-equipment-monitor-arrow-primary {
  background: linear-gradient(90deg, #3B9EFF 0%, #60B0FF 100%);
  color: #fff;
}

.c-equipment-monitor-arrow-secondary {
  background: linear-gradient(90deg, #7BC5FF 0%, #A5D8FF 100%);
  color: #1F2937;
}

.c-equipment-monitor-arrow-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.c-equipment-monitor-arrow-icon svg {
  width: 100%;
  height: 100%;
}

.c-equipment-monitor-arrow-info {
  flex: 1;
  min-width: 0;
}

.c-equipment-monitor-arrow-label {
  font-size: 12px;
  margin-bottom: 4px;
  line-height: 1.2;
}

.c-equipment-monitor-arrow-total,
.c-equipment-monitor-arrow-error {
  font-size: 11px;
  margin-top: 2px;
}

.c-equipment-monitor-arrow-total span,
.c-equipment-monitor-arrow-error span {
  font-size: 16px;
  font-weight: 700;
  margin-left: 4px;
}

.c-equipment-monitor-arrow-error span {
  color: #EF4444;
}

/* 主体区域 */
.c-equipment-monitor-main {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex: 1;
  min-height: 0;
}

/* 左侧导航栏 */
.c-equipment-monitor-sidebar {
  width: 42px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  position: relative;
  padding-top: 22px;
}

.c-equipment-monitor-badge-area {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.c-equipment-monitor-counter {
  font-size: 9px;
  color: #1F2937;
  background: rgba(255, 255, 255, 0.8);
  padding: 2px 4px;
  border-radius: 3px;
}

.c-equipment-monitor-badge {
  background: #EF4444;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: -2px;
  right: -4px;
  z-index: 10;
}

.c-equipment-monitor-nav-btn {
  writing-mode: vertical-rl;
  white-space: nowrap;
  background: #3B9EFF;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 10px;
  letter-spacing: 1.5px;
  height: 32px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.c-equipment-monitor-nav-btn:hover {
  background: #2E8FE8;
  transform: translateX(-2px);
}

.c-equipment-monitor-nav-active {
  background: #1E7DD9;
}

/* 右侧设备网格 */
.c-equipment-monitor-grid {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
  align-content: start;
}

.c-equipment-monitor-device-card {
  background: rgba(173, 216, 255, 0.3);
  border: 1px solid #B0C4D0;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 0;
}

.c-equipment-monitor-device-card:hover {
  background: rgba(173, 216, 255, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 158, 255, 0.2);
}

.c-equipment-monitor-device-icon {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.c-equipment-monitor-icon-base {
  position: absolute;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.c-equipment-monitor-icon-base-outer {
  width: 40px;
  height: 40px;
  top: 0;
  left: 0;
  opacity: 0.6;
}

.c-equipment-monitor-icon-base-inner {
  width: 32px;
  height: 32px;
  top: 4px;
  left: 4px;
  opacity: 0.9;
}

.c-equipment-monitor-device-svg {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  color: #3B9EFF;
  z-index: 1;
}

.c-equipment-monitor-device-name {
  font-size: 11px;
  color: #1F2937;
  font-weight: 500;
  text-align: center;
  line-height: 1.2;
}

.c-equipment-monitor-device-status {
  font-size: 12px;
  font-weight: 700;
}

.c-equipment-monitor-status-normal {
  color: #22D3EE;
}

.c-equipment-monitor-status-error {
  color: #EF4444;
}
</style>