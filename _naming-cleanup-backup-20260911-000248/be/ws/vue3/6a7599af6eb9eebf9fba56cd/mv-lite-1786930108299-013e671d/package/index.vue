<template>
  <div class="dashboard-container">
    <!-- 顶部导航栏 -->
    <header class="header">
      <div class="title">
        <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="#00E5C7" stroke-width="2">
          <path d="M12 4L4 8v8l8 4 8-4V8l-8-4z"/>
        </svg>
        <h1>日常养护</h1>
      </div>
      <div class="tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.value"
          :class="['tab-btn', { active: activeTab === tab.value }]"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 巡查检查模块 -->
      <section class="section patrol-section">
        <h2 class="section-title">巡查检查</h2>
        
        <!-- 统计卡片行 -->
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="#00E5C7" stroke-width="2">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                <line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-label">实巡/应巡里程</div>
              <div class="stat-value highlight-cyan">112.6/114.6 km</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="#00E5C7" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-label">完成率</div>
              <div class="stat-value highlight-cyan">96.2%</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="#00E5C7" stroke-width="2">
                <rect x="1" y="3" width="15" height="13" rx="2"/>
                <path d="M16 8h4l3 3v5a2 2 0 01-2 2h-1"/>
                <circle cx="5.5" cy="18.5" r="2.5"/>
                <circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-label">巡查车</div>
              <div class="stat-value highlight-cyan">1 辆</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="#00E5C7" stroke-width="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                <path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <div class="stat-content">
              <div class="stat-label">巡查员</div>
              <div class="stat-value highlight-cyan">2 人</div>
            </div>
          </div>
        </div>

        <!-- 图表区域 -->
        <div class="chart-wrapper">
          <div ref="patrolChartRef" class="chart-box"></div>
        </div>
      </section>

      <!-- 病害分布模块 -->
      <section class="section disease-section">
        <h2 class="section-title">病害分布</h2>
        <div class="disease-radial">
          <div class="disease-center">
            <div class="warning-icon">⚠️</div>
            <div class="center-label">病害数</div>
            <div class="center-value">6 起</div>
          </div>
          
          <div class="disease-item item-top-left">
            <div class="item-label">养护维修</div>
            <div class="item-value">3</div>
            <div class="item-bowl"></div>
          </div>
          
          <div class="disease-item item-top-right">
            <div class="item-label">继续观察</div>
            <div class="item-value">0</div>
            <div class="item-bowl"></div>
          </div>
          
          <div class="disease-item item-bottom-left">
            <div class="item-label">纳入工程养护</div>
            <div class="item-value">2</div>
            <div class="item-bowl"></div>
          </div>
          
          <div class="disease-item item-bottom-right">
            <div class="item-label">现场处理</div>
            <div class="item-value">1</div>
            <div class="item-bowl"></div>
          </div>

          <div class="truck-icon">🚛</div>
        </div>
      </section>

      <!-- 高发病害Top5 -->
      <section class="section top5-section">
        <h2 class="section-title">高发病害top5</h2>
        <div class="rank-list">
          <div class="rank-card rank-4">
            <div class="rank-badge">4</div>
            <div class="rank-count">1 起</div>
            <div class="rank-name">衬砌<br>渗漏水</div>
          </div>
          
          <div class="rank-card rank-2">
            <div class="rank-badge silver">🥈</div>
            <div class="rank-count highlight-red">2 起</div>
            <div class="rank-name">淤塞</div>
          </div>
          
          <div class="rank-card rank-1">
            <div class="rank-badge gold">🥇</div>
            <div class="rank-count highlight-red">2 起</div>
            <div class="rank-name">洞口边<br>(仰)坡危石<br>洞口边沟</div>
          </div>
          
          <div class="rank-card rank-3">
            <div class="rank-badge bronze">🥉</div>
            <div class="rank-count highlight-red">2 起</div>
            <div class="rank-name">洞门起层<br>剥落</div>
          </div>
          
          <div class="rank-card rank-5">
            <div class="rank-badge">5</div>
            <div class="rank-count">1 起</div>
            <div class="rank-name">检修道<br>盖板缺损</div>
          </div>
        </div>
      </section>

      <!-- 施工占道模块 -->
      <section class="section construction-section">
        <h2 class="section-title">施工占道</h2>
        
        <!-- 状态统计行 -->
        <div class="status-row">
          <div class="status-item">
            <div class="status-icon">🏗️</div>
            <div class="status-text">
              <div class="status-label">待施工</div>
              <div class="status-value">1 处</div>
            </div>
          </div>
          
          <div class="divider"></div>
          
          <div class="status-item">
            <div class="status-text">
              <div class="status-label">施工中</div>
              <div class="status-value highlight-yellow">3 处</div>
            </div>
            <div class="status-extra">
              <div class="extra-label">占道里程</div>
              <div class="extra-value highlight-yellow">28.26 km</div>
            </div>
          </div>
          
          <div class="divider"></div>
          
          <div class="status-item">
            <div class="status-text">
              <div class="status-label">已完成</div>
              <div class="status-value">1 处</div>
            </div>
          </div>
        </div>

        <!-- 计划施工横幅 -->
        <div class="plan-banner">
          <button class="nav-btn left" @click="handlePrev">‹</button>
          <div class="plan-content">
            <span class="plan-icon">⚒️</span>
            <span class="plan-label">计划施工</span>
            <span class="plan-value">5 处</span>
          </div>
          <button class="nav-btn right" @click="handleNext">›</button>
        </div>

        <!-- 作业占比 -->
        <div class="distribution-area">
          <div class="dist-item dist-left">
            <div class="dist-value">2 处</div>
            <div class="dist-label">集约化作业 <span class="percent">40%</span></div>
          </div>
          <div class="dist-item dist-center">
            <div class="dist-value">1 处</div>
            <div class="dist-label">重复作业 <span class="percent">20%</span></div>
          </div>
          <div class="dist-item dist-right">
            <div class="dist-value">2 处</div>
            <div class="dist-label">其他 <span class="percent">40%</span></div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

// Tab 状态
const tabs = [
  { label: '今日', value: 'today' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' }
]
const activeTab = ref('today')

// 图表相关
const patrolChartRef = ref(null)
let chart = null
let resizeObserver = null

// 图表数据（响应式）
const chartData = {
  categories: ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22'],
  actual: [75, 48, 55, 42, 60, 18, 22, 16, 48, 65, 10, 12],
  planned: [35, 25, 45, 18, 42, 8, 10, 12, 28, 32, 8, 6],
  completionRate: [38, 52, 58, 62, 56, 68, 72, 75, 82, 88, 92, 95]
}

// 初始化图表
const initChart = () => {
  if (!patrolChartRef.value || chart) return
  
  const container = patrolChartRef.value
  if (container.clientWidth === 0 || container.clientHeight === 0) return
  
  chart = echarts.init(container)
  
  const option = {
    backgroundColor: 'transparent',
    legend: {
      data: ['实际巡查', '计划巡查', '完成率(%)'],
      textStyle: { color: '#fff', fontSize: 11 },
      top: 5,
      right: 10,
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 15
    },
    grid: {
      top: 35,
      left: 40,
      right: 45,
      bottom: 25
    },
    xAxis: {
      type: 'category',
      data: chartData.categories,
      axisLine: { lineStyle: { color: '#1A4A5E' } },
      axisLabel: { color: '#8BA5B5', fontSize: 11 },
      splitLine: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: '里程(km)',
        nameTextStyle: { color: '#8BA5B5', fontSize: 10 },
        max: 150,
        interval: 30,
        axisLine: { lineStyle: { color: '#1A4A5E' } },
        axisLabel: { color: '#8BA5B5', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A4A5E', type: 'dashed' } }
      },
      {
        type: 'value',
        name: '完成率(%)',
        nameTextStyle: { color: '#8BA5B5', fontSize: 10 },
        min: 0,
        max: 100,
        axisLine: { lineStyle: { color: '#1A4A5E' } },
        axisLabel: { color: '#8BA5B5', fontSize: 10 },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '实际巡查',
        type: 'bar',
        data: chartData.actual,
        barWidth: 8,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#00E5C7' },
            { offset: 1, color: '#007A6A' }
          ]),
          borderRadius: [4, 4, 0, 0]
        }
      },
      {
        name: '计划巡查',
        type: 'bar',
        data: chartData.planned,
        barWidth: 8,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#FFB800' },
            { offset: 1, color: '#CC9200' }
          ]),
          borderRadius: [4, 4, 0, 0]
        }
      },
      {
        name: '完成率(%)',
        type: 'line',
        yAxisIndex: 1,
        data: chartData.completionRate,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          color: '#FFD700',
          width: 2,
          shadowColor: 'rgba(255, 215, 0, 0.5)',
          shadowBlur: 10
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 215, 0, 0.2)' },
            { offset: 1, color: 'rgba(255, 215, 0, 0)' }
          ])
        }
      }
    ]
  }
  
  chart.setOption(option)
}

// ResizeObserver 监听
onMounted(() => {
  if (patrolChartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      initChart()
      if (chart && patrolChartRef.value) {
        chart.resize()
      }
    })
    resizeObserver.observe(patrolChartRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (chart) {
    chart.dispose()
    chart = null
  }
})

// 轮播控制
const handlePrev = () => console.log('上一页')
const handleNext = () => console.log('下一页')
</script>

<style scoped>
.dashboard-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: linear-gradient(180deg, #061520 0%, #04101a 100%);
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部导航栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 44px;
  padding: 0 16px;
  background: linear-gradient(90deg, rgba(0, 229, 199, 0.15) 0%, rgba(0, 229, 199, 0.05) 100%);
  border: 1px solid rgba(0, 229, 199, 0.3);
  border-radius: 8px;
  box-shadow: 0 0 20px rgba(0, 229, 199, 0.1), inset 0 0 20px rgba(0, 229, 199, 0.05);
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  width: 20px;
  height: 20px;
}

.title h1 {
  font-size: 18px;
  font-weight: 700;
  color: #00E5C7;
  margin: 0;
  letter-spacing: 2px;
}

.tabs {
  display: flex;
  gap: 4px;
  background: rgba(0, 0, 0, 0.3);
  padding: 3px;
  border-radius: 6px;
}

.tab-btn {
  padding: 4px 16px;
  border: none;
  background: transparent;
  color: #8BA5B5;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.3s;
  font-weight: 500;
}

.tab-btn.active {
  background: linear-gradient(180deg, #00E5C7 0%, #00B89F 100%);
  color: #061520;
  box-shadow: 0 2px 8px rgba(0, 229, 199, 0.4);
}

/* 主内容区 */
.main-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

/* 通用区块样式 */
.section {
  background: linear-gradient(135deg, rgba(10, 35, 50, 0.8) 0%, rgba(6, 21, 32, 0.9) 100%);
  border: 1px solid rgba(26, 74, 94, 0.6);
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(0, 229, 199, 0.1);
  position: relative;
  overflow: hidden;
}

.section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, #00E5C7 0%, transparent 100%);
  opacity: 0.6;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  letter-spacing: 1px;
}

.section-title::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 16px;
  background: #00E5C7;
  margin-right: 8px;
  border-radius: 2px;
}

/* 巡查检查模块 */
.patrol-section {
  flex-shrink: 0;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 229, 199, 0.05);
  border: 1px solid rgba(0, 229, 199, 0.2);
  border-radius: 8px;
  padding: 10px 12px;
  transition: all 0.3s;
}

.stat-card:hover {
  border-color: rgba(0, 229, 199, 0.5);
  box-shadow: 0 0 15px rgba(0, 229, 199, 0.15);
}

.stat-icon-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(0, 229, 199, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid rgba(0, 229, 199, 0.3);
}

.stat-icon-circle svg {
  width: 20px;
  height: 20px;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 12px;
  color: #8BA5B5;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-value {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
  font-family: 'Courier New', monospace;
}

.highlight-cyan {
  color: #00E5C7;
  text-shadow: 0 0 10px rgba(0, 229, 199, 0.5);
}

.chart-wrapper {
  height: 160px;
  width: 100%;
  position: relative;
}

.chart-box {
  width: 100%;
  height: 100%;
}

/* 病害分布模块 */
.disease-section {
  flex-shrink: 0;
  min-height: 180px;
}

.disease-radial {
  position: relative;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.disease-center {
  position: absolute;
  z-index: 10;
  text-align: center;
  background: radial-gradient(circle, rgba(0, 229, 199, 0.2) 0%, transparent 70%);
  padding: 20px;
  border-radius: 50%;
  width: 90px;
  height: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.warning-icon {
  font-size: 20px;
  margin-bottom: 4px;
}

.center-label {
  font-size: 12px;
  color: #FFD700;
  font-weight: 600;
}

.center-value {
  font-size: 24px;
  font-weight: 900;
  color: #FF6B6B;
  text-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
}

.disease-item {
  position: absolute;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.item-top-left {
  top: 10px;
  left: 10px;
}

.item-top-right {
  top: 10px;
  right: 80px;
}

.item-bottom-left {
  bottom: 10px;
  left: 60px;
}

.item-bottom-right {
  bottom: 10px;
  right: 10px;
}

.item-label {
  font-size: 12px;
  color: #fff;
  font-weight: 500;
  white-space: nowrap;
}

.item-value {
  font-size: 20px;
  font-weight: 900;
  color: #FFD700;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
}

.item-bowl {
  width: 40px;
  height: 20px;
  background: linear-gradient(180deg, rgba(0, 229, 199, 0.4) 0%, rgba(0, 229, 199, 0.1) 100%);
  border-radius: 0 0 50% 50%;
  border: 1px solid rgba(0, 229, 199, 0.3);
  border-top: none;
}

.truck-icon {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 32px;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
  animation: truckMove 3s ease-in-out infinite;
}

@keyframes truckMove {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(-5px); }
}

/* 高发病害Top5 */
.top5-section {
  flex-shrink: 0;
}

.rank-list {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8px;
  height: 120px;
  padding: 0 4px;
}

.rank-card {
  flex: 1;
  background: linear-gradient(180deg, rgba(0, 229, 199, 0.15) 0%, rgba(0, 229, 199, 0.05) 100%);
  border: 1px solid rgba(0, 229, 199, 0.3);
  border-radius: 8px;
  padding: 8px 4px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  transition: transform 0.3s;
  position: relative;
}

.rank-card:hover {
  transform: translateY(-4px);
  border-color: #00E5C7;
}

.rank-1 { height: 110px; order: 3; }
.rank-2 { height: 95px; order: 2; }
.rank-3 { height: 85px; order: 4; }
.rank-4 { height: 75px; order: 1; }
.rank-5 { height: 75px; order: 5; }

.rank-badge {
  position: absolute;
  top: -10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #1A4A5E;
  border: 2px solid #00E5C7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: #00E5C7;
}

.rank-badge.gold {
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  border-color: #FFD700;
  color: #fff;
  font-size: 14px;
}

.rank-badge.silver {
  background: linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%);
  border-color: #C0C0C0;
  color: #fff;
  font-size: 14px;
}

.rank-badge.bronze {
  background: linear-gradient(135deg, #CD7F32 0%, #A0522D 100%);
  border-color: #CD7F32;
  color: #fff;
  font-size: 14px;
}

.rank-count {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
  margin: 4px 0;
}

.highlight-red {
  color: #FF6B6B;
  text-shadow: 0 0 8px rgba(255, 107, 107, 0.5);
}

.rank-name {
  font-size: 11px;
  color: #B8D4E3;
  line-height: 1.3;
  font-weight: 500;
}

/* 施工占道模块 */
.construction-section {
  flex-shrink: 0;
}

.status-row {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
  border: 1px solid rgba(26, 74, 94, 0.4);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.status-icon {
  font-size: 28px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.status-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-label {
  font-size: 12px;
  color: #8BA5B5;
}

.status-value {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  font-family: 'Courier New', monospace;
}

.highlight-yellow {
  color: #FFD700;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
}

.status-extra {
  margin-left: auto;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.extra-label {
  font-size: 11px;
  color: #8BA5B5;
}

.extra-value {
  font-size: 16px;
  font-weight: 800;
  color: #FFD700;
  font-family: 'Courier New', monospace;
}

.divider {
  width: 1px;
  background: linear-gradient(180deg, transparent 0%, #1A4A5E 50%, transparent 100%);
  margin: 0 16px;
}

.plan-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(90deg, rgba(0, 229, 199, 0.1) 0%, rgba(0, 229, 199, 0.05) 50%, rgba(0, 229, 199, 0.1) 100%);
  border: 1px solid rgba(0, 229, 199, 0.3);
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 12px;
  position: relative;
  overflow: hidden;
}

.plan-banner::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00E5C7, transparent);
  opacity: 0.5;
}

.nav-btn {
  background: rgba(0, 229, 199, 0.1);
  border: 1px solid rgba(0, 229, 199, 0.3);
  color: #00E5C7;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  flex-shrink: 0;
}

.nav-btn:hover {
  background: rgba(0, 229, 199, 0.2);
  box-shadow: 0 0 10px rgba(0, 229, 199, 0.3);
}

.plan-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex: 1;
}

.plan-icon {
  font-size: 20px;
}

.plan-label {
  font-size: 14px;
  color: #B8D4E3;
  font-weight: 500;
}

.plan-value {
  font-size: 18px;
  font-weight: 800;
  color: #00E5C7;
  font-family: 'Courier New', monospace;
}

.distribution-area {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  padding: 0 10px;
  position: relative;
  background: radial-gradient(ellipse at center bottom, rgba(0, 229, 199, 0.08) 0%, transparent 70%);
  border-radius: 8px;
  padding-top: 20px;
  padding-bottom: 10px;
}

.dist-item {
  text-align: center;
  flex: 1;
  position: relative;
}

.dist-value {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 4px;
  font-family: 'Courier New', monospace;
}

.dist-label {
  font-size: 13px;
  color: #B8D4E3;
  font-weight: 500;
}

.percent {
  color: #00E5C7;
  font-weight: 700;
  margin-left: 2px;
}

.dist-center::after {
  content: '';
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 30px;
  background: radial-gradient(ellipse at center, rgba(0, 229, 199, 0.3) 0%, transparent 70%);
  border-radius: 50%;
  filter: blur(4px);
}
</style>