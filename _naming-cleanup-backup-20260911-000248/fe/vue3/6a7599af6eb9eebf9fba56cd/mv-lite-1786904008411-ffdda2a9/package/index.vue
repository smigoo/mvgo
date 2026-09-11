<template>
  <div class="dashboard-container">
    <!-- Header 区域 -->
    <header class="dashboard-header">
      <div class="header-title">设备监测</div>
      <div class="header-stats">
        <span class="stat-item">
          <span class="icon-equal">≡</span>
          设备类型<span class="highlight-num">28</span>
        </span>
        <span class="stat-item">
          设备总数<span class="highlight-num">68562</span>
        </span>
        <span class="stat-item">
          完好率<span class="rate-num">98%</span>
        </span>
      </div>
    </header>

    <!-- 统计卡片区域 -->
    <section class="stats-cards">
      <div class="stat-card stat-card-primary">
        <div class="card-icon-wrapper">
          <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-label">隧道设备</div>
          <div class="card-main-stat">
            总 数:<span class="big-num">56302</span>
          </div>
          <div class="card-sub-stat">
            异常数:<span class="error-num">5</span>
          </div>
        </div>
      </div>

      <div class="stat-card stat-card-secondary">
        <div class="card-icon-wrapper icon-secondary">
          <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-label">南北接线<br>设备</div>
          <div class="card-main-stat">
            总 数:<span class="big-num">1280</span>
          </div>
          <div class="card-sub-stat">
            异常数:<span class="error-num">3</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 主内容区域：左侧导航 + 右侧网格 -->
    <main class="main-content">
      <!-- 左侧垂直导航 -->
      <nav class="sidebar-nav">
        <div 
          v-for="(item, index) in navItems" 
          :key="item.id"
          :class="['nav-item', { active: activeNav === item.id }]"
          @click="activeNav = item.id"
        >
          <span class="nav-text">{{ item.label }}</span>
          <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          <span v-if="item.floatingTag" class="floating-tag">{{ item.floatingTag }}</span>
        </div>
      </nav>

      <!-- 右侧设备网格 -->
      <div class="device-grid">
        <div 
          v-for="device in deviceList" 
          :key="device.name"
          class="device-card"
        >
          <div class="device-icon-wrapper">
            <component :is="getIconComponent(device.icon)" />
          </div>
          <div class="device-name">{{ device.name }}</div>
          <div :class="['device-stat', getStatClass(device.abnormal)]">
            ({{ device.abnormal }}/{{ device.total }})
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, h } from 'vue'

// 当前激活的导航项
const activeNav = ref('monitor')

// 导航项数据
const navItems = [
  { id: 'monitor', label: '监控', badge: null, floatingTag: '3/3740' },
  { id: 'lighting', label: '照明', badge: '3', floatingTag: null },
  { id: 'ventilation', label: '通风', badge: null, floatingTag: null },
  { id: 'power', label: '供配电', badge: null, floatingTag: null },
  { id: 'fire', label: '消防', badge: null, floatingTag: null },
  { id: 'traffic', label: '交通诱导', badge: null, floatingTag: null }
]

// 设备列表数据
const deviceList = [
  { name: '摄像机', abnormal: 2, total: 484, icon: 'camera' },
  { name: '风速风向仪', abnormal: 1, total: 484, icon: 'wind' },
  { name: '超高检测器', abnormal: 0, total: 484, icon: 'height' },
  { name: '烟道机器人', abnormal: 0, total: 484, icon: 'robot' },
  { name: '激光雷达', abnormal: 0, total: 484, icon: 'radar' },
  { name: 'CO₂传感器', abnormal: 0, total: 484, icon: 'co2' },
  { name: 'CO/VI检测器', abnormal: 0, total: 484, icon: 'covi' },
  { name: '温湿度传感器', abnormal: 0, total: 484, icon: 'temp' },
  { name: '压力传感器', abnormal: 0, total: 484, icon: 'pressure' },
  { name: '光照度变送器', abnormal: 0, total: 484, icon: 'light' },
  { name: '紧急电话', abnormal: 0, total: 484, icon: 'phone' },
  { name: '水质监测设备', abnormal: 0, total: 484, icon: 'water' }
]

// 获取图标组件（使用渲染函数返回SVG）
const getIconComponent = (iconType) => {
  const icons = {
    camera: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('path', { d: 'M23 7l-7 5 7 5V7z' }),
      h('rect', { x: '1', y: '5', width: '15', height: '14', rx: '2', ry: '2' })
    ]),
    wind: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('path', { d: 'M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2' })
    ]),
    height: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('path', { d: 'M18 20V10m-6 10V4M6 20v-6' }),
      h('line', { x1: '6', y1: '20', x2: '18', y2: '20' }),
      h('polyline', { points: '3 17 9 11 13 15 21 7' })
    ]),
    robot: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('rect', { x: '3', y: '11', width: '18', height: '10', rx: '2' }),
      h('circle', { cx: '12', cy: '5', r: '2' }),
      h('path', { d: 'M12 7v4' }),
      h('line', { x1: '8', y1: '16', x2: '8', y2: '16' }),
      h('line', { x1: '16', y1: '16', x2: '16', y2: '16' })
    ]),
    radar: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('circle', { cx: '12', cy: '12', r: '10' }),
      h('path', { d: 'M12 2a10 10 0 0 1 10 10' }),
      h('path', { d: 'M12 12L12 6' })
    ]),
    co2: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('path', { d: 'M12 2v20M2 12h20' }),
      h('text', { x: '12', y: '16', 'text-anchor': 'middle', 'font-size': '8', fill: '#1976D2', stroke: 'none' }, 'CO₂')
    ]),
    covi: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('path', { d: 'M12 2L2 7l10 5 10-5-10-5z' }),
      h('path', { d: 'M2 17l10 5 10-5M2 12l10 5 10-5' })
    ]),
    temp: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('path', { d: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z' })
    ]),
    pressure: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('path', { d: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z' }),
      h('path', { d: 'M12 6v6l4 2' })
    ]),
    light: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('circle', { cx: '12', cy: '12', r: '5' }),
      h('line', { x1: '12', y1: '1', x2: '12', y2: '3' }),
      h('line', { x1: '12', y1: '21', x2: '12', y2: '23' }),
      h('line', { x1: '4.22', y1: '4.22', x2: '5.64', y2: '5.64' }),
      h('line', { x1: '18.36', y1: '18.36', x2: '19.78', y2: '19.78' }),
      h('line', { x1: '1', y1: '12', x2: '3', y2: '12' }),
      h('line', { x1: '21', y1: '12', x2: '23', y2: '12' }),
      h('line', { x1: '4.22', y1: '19.78', x2: '5.64', y2: '18.36' }),
      h('line', { x1: '18.36', y1: '5.64', x2: '19.78', y2: '4.22' })
    ]),
    phone: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('path', { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' })
    ]),
    water: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: '#1976D2', 'stroke-width': '2' }, [
      h('path', { d: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z' })
    ])
  }
  
  return icons[iconType] || icons.camera
}

// 根据异常数获取样式类名
const getStatClass = (abnormal) => {
  if (abnormal > 0) return 'stat-error'
  return 'stat-normal'
}
</script>

<style scoped>
.dashboard-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: #9E9E9E;
  padding: 20px;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  overflow: hidden;
}

/* Header 区域 */
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
  min-height: 34px;
}

.header-title {
  font-size: 26px;
  font-weight: 700;
  color: #42A5F5;
  letter-spacing: 2px;
}

.header-stats {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 18px;
  color: #FFFFFF;
  font-weight: 500;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-equal {
  color: #1976D2;
  font-weight: bold;
  font-size: 20px;
}

.highlight-num {
  color: #42A5F5;
  font-weight: 700;
  font-size: 22px;
  margin-left: 2px;
}

.rate-num {
  color: #4CAF50;
  font-weight: 700;
  font-size: 22px;
  margin-left: 2px;
}

/* 统计卡片区域 */
.stats-cards {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
  min-height: 65px;
}

.stat-card {
  flex: 1;
  border-radius: 12px;
  padding: 15px 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.stat-card-primary {
  background: linear-gradient(135deg, #42A5F5 0%, #1E88E5 100%);
}

.stat-card-secondary {
  background: linear-gradient(135deg, #90CAF9 0%, #64B5F6 100%);
}

.card-icon-wrapper {
  width: 52px;
  height: 52px;
  background: rgba(255,255,255,0.25);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-secondary {
  background: rgba(255,255,255,0.35);
}

.card-icon {
  width: 28px;
  height: 28px;
  color: white;
}

.card-content {
  flex: 1;
  color: white;
}

.card-label {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
  line-height: 1.2;
}

.card-main-stat {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.3;
}

.big-num {
  font-size: 28px;
  font-weight: 700;
  margin-left: 4px;
}

.card-sub-stat {
  font-size: 16px;
  font-weight: 500;
  line-height: 1.3;
}

.error-num {
  color: #FF5252;
  font-size: 22px;
  font-weight: 700;
  margin-left: 4px;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

/* 左侧导航 */
.sidebar-nav {
  width: 45px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.nav-item {
  position: relative;
  padding: 10px 8px;
  text-align: center;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  background: rgba(255,255,255,0.15);
  color: #1565C0;
  font-size: 15px;
  font-weight: 600;
  writing-mode: vertical-lr;
  letter-spacing: 4px;
  border: 1px solid rgba(255,255,255,0.2);
}

.nav-item:hover {
  background: rgba(33,150,243,0.25);
}

.nav-item.active {
  background: #2196F3;
  color: white;
  box-shadow: 0 2px 8px rgba(33,150,243,0.4);
}

.nav-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #FF5252;
  color: white;
  font-size: 10px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  z-index: 2;
}

.floating-tag {
  position: absolute;
  top: -8px;
  left: -8px;
  background: white;
  color: #333;
  font-size: 11px;
  padding: 2px 5px;
  border-radius: 4px;
  border: 1px solid #ccc;
  font-weight: 600;
  z-index: 2;
  white-space: nowrap;
  writing-mode: horizontal-tb;
}

/* 右侧设备网格 */
.device-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}

.device-card {
  background: rgba(227,242,253,0.85);
  border-radius: 10px;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(187,222,251,0.6);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.device-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.device-icon-wrapper {
  width: 44px;
  height: 44px;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), rgba(227,242,253,0.6));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}

.device-name {
  font-size: 15px;
  color: #37474F;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}

.device-stat {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-error {
  color: #FF5252;
}

.stat-normal {
  color: #4CAF50;
}
</style>