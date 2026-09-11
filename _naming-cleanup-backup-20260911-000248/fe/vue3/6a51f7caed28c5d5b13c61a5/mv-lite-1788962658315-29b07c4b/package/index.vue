<template>
  <div class="energy-overview">
    <!-- 顶部标题栏 -->
    <div class="energy-overview-header">
      <div class="energy-overview-header-left">
        <div class="energy-overview-icon"></div>
        <span class="energy-overview-title">能耗概况</span>
        <span class="energy-overview-label">场区</span>
      </div>
      <div class="energy-overview-header-right">
        <button class="energy-overview-btn" :class="{ active: activeTab === 'lastMonth' }" @click="activeTab = 'lastMonth'">上月</button>
        <button class="energy-overview-btn" :class="{ active: activeTab === 'thisYear' }" @click="activeTab = 'thisYear'">本年</button>
      </div>
    </div>

    <!-- 能耗统计卡片 -->
    <div class="energy-overview-card energy-overview-stats">
      <div class="energy-overview-stats-left">
        <div class="energy-overview-battery"></div>
        <span class="energy-overview-stats-label">能耗总量</span>
      </div>
      <div class="energy-overview-stats-right">
        <div class="energy-overview-total">
          <span class="energy-overview-total-value">76.32</span>
          <span class="energy-overview-total-unit">吨标煤</span>
          <span class="energy-overview-total-change">同比 <span class="energy-overview-positive">0.22%</span></span>
        </div>
        <div class="energy-overview-progress-list">
          <div class="energy-overview-progress-item">
            <div class="energy-overview-progress-header">
              <span class="energy-overview-progress-name">其他</span>
              <div class="energy-overview-progress-values">
                <span class="energy-overview-progress-value">31.62</span>
                <span class="energy-overview-progress-unit">吨标煤</span>
                <span class="energy-overview-progress-percent">占比<span class="energy-overview-primary">41.43</span>%</span>
                <span class="energy-overview-progress-change">周比 <span class="energy-overview-positive">0.22%</span></span>
              </div>
            </div>
            <div class="energy-overview-progress-bar">
              <div class="energy-overview-progress-fill" :style="{ width: '41.43%' }"></div>
            </div>
          </div>
          <div class="energy-overview-progress-item">
            <div class="energy-overview-progress-header">
              <span class="energy-overview-progress-name">油</span>
              <div class="energy-overview-progress-values">
                <span class="energy-overview-progress-value">18</span>
                <span class="energy-overview-progress-unit">吨标煤</span>
                <span class="energy-overview-progress-percent">占比<span class="energy-overview-primary">23.59</span>%</span>
              </div>
            </div>
            <div class="energy-overview-progress-bar">
              <div class="energy-overview-progress-fill" :style="{ width: '23.59%' }"></div>
            </div>
          </div>
          <div class="energy-overview-progress-item">
            <div class="energy-overview-progress-header">
              <span class="energy-overview-progress-name">气</span>
              <div class="energy-overview-progress-values">
                <span class="energy-overview-progress-value">15.01</span>
                <span class="energy-overview-progress-unit">吨标煤</span>
                <span class="energy-overview-progress-percent">占比<span class="energy-overview-primary">19.67</span>%</span>
              </div>
            </div>
            <div class="energy-overview-progress-bar">
              <div class="energy-overview-progress-fill" :style="{ width: '19.67%' }"></div>
            </div>
          </div>
          <div class="energy-overview-progress-item">
            <div class="energy-overview-progress-header">
              <span class="energy-overview-progress-name">油</span>
              <div class="energy-overview-progress-values">
                <span class="energy-overview-progress-value">11.76</span>
                <span class="energy-overview-progress-unit">吨标煤</span>
                <span class="energy-overview-progress-percent">占比<span class="energy-overview-primary">15.41</span>%</span>
              </div>
            </div>
            <div class="energy-overview-progress-bar">
              <div class="energy-overview-progress-fill" :style="{ width: '15.41%' }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 能耗占比卡片 -->
    <div class="energy-overview-card energy-overview-ratio">
      <div class="energy-overview-ratio-left">
        <div class="energy-overview-ratio-tags">
          <div class="energy-overview-ratio-tag">
            <span class="energy-overview-ratio-tag-label">能耗最大</span>
            <span class="energy-overview-ratio-tag-text">服务区占比<span class="energy-overview-primary">42</span>%</span>
          </div>
          <div class="energy-overview-ratio-tag">
            <span class="energy-overview-ratio-tag-label">能耗最小</span>
            <span class="energy-overview-ratio-tag-text">排障大队占比<span class="energy-overview-primary">8</span>%</span>
          </div>
        </div>
        <div class="energy-overview-ring-chart">
          <svg viewBox="0 0 120 120" class="energy-overview-ring-svg">
            <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(26, 77, 77, 0.3)" stroke-width="10"></circle>
            <circle cx="60" cy="60" r="48" fill="none" stroke="url(#ringGradient)" stroke-width="10" stroke-dasharray="301.6" stroke-dashoffset="75.4" transform="rotate(-90 60 60)" stroke-linecap="round"></circle>
            <defs>
              <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#00D9FF;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#00FFB3;stop-opacity:1" />
              </linearGradient>
            </defs>
          </svg>
          <div class="energy-overview-ring-center">
            <div class="energy-overview-ring-value">76.32</div>
            <div class="energy-overview-ring-label">能耗总量</div>
            <div class="energy-overview-ring-unit">(吨标煤)</div>
          </div>
        </div>
      </div>
      <div class="energy-overview-ratio-right">
        <div class="energy-overview-ratio-item" v-for="item in ratioList" :key="item.name">
          <div class="energy-overview-ratio-color" :style="{ backgroundColor: item.color }"></div>
          <span class="energy-overview-ratio-name">{{ item.name }}</span>
          <span class="energy-overview-ratio-value">{{ item.value }}</span>
          <span class="energy-overview-ratio-unit">吨标/煤</span>
          <span class="energy-overview-ratio-percent">占比<span class="energy-overview-primary">{{ item.percent }}</span>%</span>
        </div>
      </div>
    </div>

    <!-- 碳排放排名卡片 -->
    <div class="energy-overview-card energy-overview-carbon">
      <div class="energy-overview-carbon-scroll">
        <button class="energy-overview-scroll-btn energy-overview-scroll-left" @click="scrollCarbon(-1)">‹</button>
        <div class="energy-overview-carbon-cards" ref="carbonScrollRef">
          <div class="energy-overview-carbon-card">
            <div class="energy-overview-carbon-card-icon"></div>
            <div class="energy-overview-carbon-card-content">
              <div class="energy-overview-carbon-card-label">碳排放总量同比 <span class="energy-overview-positive">0.18%</span></div>
              <div class="energy-overview-carbon-card-value">
                <span class="energy-overview-carbon-card-number">102.58</span>
                <span class="energy-overview-carbon-card-unit">吨CO₂</span>
              </div>
            </div>
          </div>
          <div class="energy-overview-carbon-card">
            <div class="energy-overview-carbon-card-icon energy-overview-carbon-card-icon-green"></div>
            <div class="energy-overview-carbon-card-content">
              <div class="energy-overview-carbon-card-label">绿化碳汇量同比 <span class="energy-overview-positive">74%</span></div>
              <div class="energy-overview-carbon-card-value">
                <span class="energy-overview-carbon-card-number">96.32</span>
                <span class="energy-overview-carbon-card-unit">吨CO₂</span>
              </div>
            </div>
          </div>
        </div>
        <button class="energy-overview-scroll-btn energy-overview-scroll-right" @click="scrollCarbon(1)">›</button>
      </div>
      <div class="energy-overview-carbon-grid">
        <div class="energy-overview-carbon-grid-item" v-for="item in carbonRankings" :key="item.rank">
          <div class="energy-overview-carbon-badge" :class="`energy-overview-carbon-badge-${item.rank}`">{{ item.rank }}</div>
          <div class="energy-overview-carbon-grid-name">{{ item.name }}</div>
          <div class="energy-overview-carbon-grid-value">{{ item.value }}</div>
          <div class="energy-overview-carbon-grid-unit">(吨CO₂)</div>
          <div class="energy-overview-carbon-grid-label">同比去年</div>
          <div class="energy-overview-carbon-grid-change" :class="{ 'energy-overview-negative': item.change < 0 }">{{ item.change }}%</div>
        </div>
      </div>
    </div>

    <!-- 环保减污卡片 -->
    <div class="energy-overview-card energy-overview-pollution">
      <div class="energy-overview-pollution-header">
        <div class="energy-overview-pollution-title">
          <div class="energy-overview-pollution-icon"></div>
          <div class="energy-overview-pollution-text">
            <span class="energy-overview-pollution-main">环保减污</span>
            <span class="energy-overview-pollution-sub">场区污水</span>
          </div>
        </div>
        <div class="energy-overview-pollution-tabs">
          <button class="energy-overview-btn" :class="{ active: pollutionTab === 'lastMonth' }" @click="pollutionTab = 'lastMonth'">上月</button>
          <button class="energy-overview-btn" :class="{ active: pollutionTab === 'thisYear' }" @click="pollutionTab = 'thisYear'">本年</button>
        </div>
      </div>
      <div class="energy-overview-pollution-chart" ref="chartRef"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

const activeTab = ref('thisYear')
const pollutionTab = ref('thisYear')

const ratioList = ref([
  { name: '服务区', value: '31.62', percent: '42', color: '#00D9FF' },
  { name: '收费站', value: '30.77', percent: '30', color: '#00B8D4' },
  { name: '办公区', value: '11.28', percent: '11', color: '#0097A7' },
  { name: '养护工区', value: '6.35', percent: '6', color: '#00838F' },
  { name: '排障大队', value: '2.05', percent: '2', color: '#006064' }
])

const carbonRankings = ref([
  { rank: 1, name: '养护工区', value: '5.03', change: -13.2 },
  { rank: 2, name: '排障大队', value: '10.2', change: -9.94 },
  { rank: 3, name: '办公区', value: '21.5', change: -15.59 },
  { rank: 4, name: '收费站', value: '27.5', change: -30.59 },
  { rank: 5, name: '服务区', value: '38.08', change: -10.59 }
])

const carbonScrollRef = ref(null)
const scrollCarbon = (direction) => {
  if (carbonScrollRef.value) {
    carbonScrollRef.value.scrollBy({ left: direction * 200, behavior: 'smooth' })
  }
}

const chartRef = ref(null)
let chart = null
let resizeObserver = null

const chartData = ref({
  categories: ['服务区', '收费站', '办公楼', '养护工区', '排障大队'],
  lastYear: [350, 468, 280, 220, 180],
  thisMonth: [320, 436, 260, 200, 170],
  treatmentRate: [85, 10, 75, 80, 70],
  reuseRate: [45, 5, 40, 35, 30]
})

const initChartWhenReady = () => {
  if (!chartRef.value || chart) return

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0 && !chart) {
        chart = echarts.init(chartRef.value)
        chart.setOption({
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: 'rgba(10, 30, 30, 0.95)',
            borderColor: '#00D9FF',
            borderWidth: 1,
            textStyle: { color: '#E0F0F0', fontSize: 10 },
            formatter: (params) => {
              const category = params[0].axisValue
              let result = `<div style="padding: 4px 8px;">`
              result += `<div style="margin-bottom: 6px; font-weight: 600;">${category}</div>`
              params.forEach(param => {
                result += `<div style="display: flex; align-items: center; margin-bottom: 3px;">`
                result += `<span style="display: inline-block; width: 8px; height: 8px; background: ${param.color}; border-radius: 50%; margin-right: 6px;"></span>`
                result += `<span>${param.seriesName}：${param.value}${param.seriesName.includes('率') ? '%' : '吨'}</span>`
                result += `</div>`
              })
              result += `</div>`
              return result
            }
          },
          legend: {
            data: ['去年10月', '10月', '治理率', '回用率'],
            top: 0,
            right: 0,
            textStyle: { color: '#E0F0F0', fontSize: 9 },
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 8
          },
          grid: { left: 32, right: 45, top: 30, bottom: 20, containLabel: true },
          xAxis: {
            type: 'category',
            data: chartData.value.categories,
            axisLine: { lineStyle: { color: '#1A4D4D' } },
            axisLabel: { color: '#E0F0F0', fontSize: 9 },
            axisTick: { show: false }
          },
          yAxis: [
            {
              type: 'value',
              name: '吨',
              nameTextStyle: { color: '#E0F0F0', fontSize: 9 },
              max: 750,
              interval: 150,
              axisLine: { show: false },
              axisTick: { show: false },
              axisLabel: { color: '#E0F0F0', fontSize: 9 },
              splitLine: { lineStyle: { color: 'rgba(26, 77, 77, 0.3)', type: 'dashed' } }
            },
            {
              type: 'value',
              name: '%',
              nameTextStyle: { color: '#E0F0F0', fontSize: 9 },
              max: 100,
              interval: 20,
              axisLine: { show: false },
              axisTick: { show: false },
              axisLabel: { color: '#E0F0F0', fontSize: 9 },
              splitLine: { show: false }
            }
          ],
          series: [
            {
              name: '去年10月',
              type: 'bar',
              data: chartData.value.lastYear,
              barWidth: 8,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#00D9FF' },
                  { offset: 1, color: 'rgba(0, 217, 255, 0.2)' }
                ]),
                borderRadius: [2, 2, 0, 0]
              }
            },
            {
              name: '10月',
              type: 'bar',
              data: chartData.value.thisMonth,
              barWidth: 8,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#00FFB3' },
                  { offset: 1, color: 'rgba(0, 255, 179, 0.2)' }
                ]),
                borderRadius: [2, 2, 0, 0]
              }
            },
            {
              name: '治理率',
              type: 'line',
              yAxisIndex: 1,
              data: chartData.value.treatmentRate,
              smooth: true,
              symbol: 'circle',
              symbolSize: 6,
              lineStyle: { color: '#FFD700', width: 2 },
              itemStyle: { color: '#FFD700' }
            },
            {
              name: '回用率',
              type: 'line',
              yAxisIndex: 1,
              data: chartData.value.reuseRate,
              smooth: true,
              symbol: 'circle',
              symbolSize: 6,
              lineStyle: { color: '#FF6B6B', width: 2 },
              itemStyle: { color: '#FF6B6B' }
            }
          ]
        })

        const chartResizeObserver = new ResizeObserver(() => {
          chart?.resize()
        })
        chartResizeObserver.observe(chartRef.value)

        resizeObserver.disconnect()
        resizeObserver = chartResizeObserver
      }
    }
  })

  resizeObserver.observe(chartRef.value)
}

watch(chartRef, (el) => {
  if (el && !chart) {
    nextTick(() => initChartWhenReady())
  }
}, { immediate: true })

onMounted(() => {
  nextTick(() => initChartWhenReady())
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<style scoped>
.energy-overview {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #0A1E1E;
  padding: 10px;
  overflow-y: auto;
  color: #E0F0F0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.energy-overview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 32px;
  margin-bottom: 8px;
}

.energy-overview-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.energy-overview-icon {
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, #00D9FF, #00FFB3);
  border-radius: 3px;
}

.energy-overview-title {
  font-size: 15px;
  font-weight: 600;
  color: #E0F0F0;
}

.energy-overview-label {
  padding: 2px 8px;
  background: rgba(0, 217, 255, 0.15);
  border: 1px solid #00D9FF;
  border-radius: 3px;
  font-size: 10px;
  color: #00D9FF;
}

.energy-overview-header-right {
  display: flex;
  gap: 6px;
}

.energy-overview-btn {
  padding: 4px 12px;
  background: rgba(16, 50, 50, 0.6);
  border: 1px solid #1A4D4D;
  border-radius: 3px;
  color: #E0F0F0;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.3s;
}

.energy-overview-btn:hover {
  background: rgba(0, 217, 255, 0.1);
  border-color: #00D9FF;
}

.energy-overview-btn.active {
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.3), rgba(0, 255, 179, 0.3));
  border-color: #00D9FF;
  color: #00D9FF;
}

.energy-overview-card {
  background: rgba(16, 50, 50, 0.8);
  border: 1px solid #1A4D4D;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.energy-overview-stats {
  display: flex;
  gap: 12px;
  min-height: 160px;
}

.energy-overview-stats-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 85px;
}

.energy-overview-battery {
  width: 50px;
  height: 60px;
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.3), rgba(0, 255, 179, 0.3));
  border: 2px solid #00D9FF;
  border-radius: 6px;
  position: relative;
  box-shadow: 0 0 15px rgba(0, 217, 255, 0.4);
}

.energy-overview-battery::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 4px;
  background: #00D9FF;
  border-radius: 2px 2px 0 0;
}

.energy-overview-battery::after {
  content: '⚡';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 24px;
  color: #00FFB3;
}

.energy-overview-stats-label {
  font-size: 11px;
  color: #E0F0F0;
  text-align: center;
}

.energy-overview-stats-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.energy-overview-total {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.energy-overview-total-value {
  font-size: 26px;
  font-weight: 700;
  color: #00D9FF;
  line-height: 1;
}

.energy-overview-total-unit {
  font-size: 11px;
  color: #E0F0F0;
}

.energy-overview-total-change {
  font-size: 9px;
  color: #E0F0F0;
  margin-left: auto;
}

.energy-overview-positive {
  color: #00FFB3;
}

.energy-overview-primary {
  color: #00D9FF;
}

.energy-overview-negative {
  color: #FF6B6B;
}

.energy-overview-progress-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.energy-overview-progress-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.energy-overview-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.energy-overview-progress-name {
  font-size: 10px;
  color: #E0F0F0;
  min-width: 28px;
}

.energy-overview-progress-values {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 9px;
}

.energy-overview-progress-value {
  font-size: 13px;
  font-weight: 600;
  color: #E0F0F0;
}

.energy-overview-progress-unit {
  color: rgba(224, 240, 240, 0.7);
}

.energy-overview-progress-percent {
  color: rgba(224, 240, 240, 0.7);
}

.energy-overview-progress-change {
  color: rgba(224, 240, 240, 0.7);
}

.energy-overview-progress-bar {
  height: 6px;
  background: rgba(26, 77, 77, 0.5);
  border-radius: 3px;
  overflow: hidden;
}

.energy-overview-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00D9FF, #00FFB3);
  border-radius: 3px;
  transition: width 0.3s;
}

.energy-overview-ratio {
  display: flex;
  gap: 12px;
  min-height: 180px;
}

.energy-overview-ratio-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 130px;
}

.energy-overview-ratio-tags {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.energy-overview-ratio-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
}

.energy-overview-ratio-tag-label {
  padding: 2px 6px;
  background: rgba(0, 217, 255, 0.15);
  border: 1px solid #00D9FF;
  border-radius: 2px;
  color: #00D9FF;
  white-space: nowrap;
}

.energy-overview-ratio-tag-text {
  color: #E0F0F0;
}

.energy-overview-ring-chart {
  position: relative;
  width: 110px;
  height: 110px;
  margin: 0 auto;
}

.energy-overview-ring-svg {
  width: 100%;
  height: 100%;
}

.energy-overview-ring-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.energy-overview-ring-value {
  font-size: 24px;
  font-weight: 700;
  color: #00D9FF;
  line-height: 1;
}

.energy-overview-ring-label {
  font-size: 10px;
  color: #E0F0F0;
  margin-top: 2px;
}

.energy-overview-ring-unit {
  font-size: 8px;
  color: rgba(224, 240, 240, 0.6);
}

.energy-overview-ratio-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.energy-overview-ratio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  padding: 4px 0;
}

.energy-overview-ratio-color {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.energy-overview-ratio-name {
  color: #E0F0F0;
  min-width: 50px;
}

.energy-overview-ratio-value {
  font-size: 13px;
  font-weight: 600;
  color: #E0F0F0;
}

.energy-overview-ratio-unit {
  color: rgba(224, 240, 240, 0.6);
  font-size: 9px;
}

.energy-overview-ratio-percent {
  color: rgba(224, 240, 240, 0.7);
  font-size: 9px;
  margin-left: auto;
}

.energy-overview-carbon {
  min-height: 220px;
}

.energy-overview-carbon-scroll {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.energy-overview-scroll-btn {
  width: 24px;
  height: 24px;
  background: rgba(0, 217, 255, 0.15);
  border: 1px solid #00D9FF;
  border-radius: 50%;
  color: #00D9FF;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.3s;
}

.energy-overview-scroll-btn:hover {
  background: rgba(0, 217, 255, 0.3);
}

.energy-overview-carbon-cards {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.energy-overview-carbon-cards::-webkit-scrollbar {
  display: none;
}

.energy-overview-carbon-card {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: rgba(26, 77, 77, 0.5);
  border: 1px solid #1A4D4D;
  border-radius: 6px;
  min-width: 200px;
  flex-shrink: 0;
}

.energy-overview-carbon-card-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, rgba(255, 200, 100, 0.3), rgba(255, 150, 50, 0.3));
  border-radius: 6px;
  flex-shrink: 0;
  position: relative;
}

.energy-overview-carbon-card-icon::after {
  content: 'CO₂';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 700;
  color: #FFA500;
}

.energy-overview-carbon-card-icon-green {
  background: linear-gradient(135deg, rgba(0, 255, 179, 0.3), rgba(0, 217, 255, 0.3));
}

.energy-overview-carbon-card-icon-green::after {
  content: '🌿';
  font-size: 20px;
}

.energy-overview-carbon-card-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.energy-overview-carbon-card-label {
  font-size: 9px;
  color: #E0F0F0;
}

.energy-overview-carbon-card-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.energy-overview-carbon-card-number {
  font-size: 20px;
  font-weight: 700;
  color: #00FFB3;
  line-height: 1;
}

.energy-overview-carbon-card-unit {
  font-size: 9px;
  color: rgba(224, 240, 240, 0.7);
}

.energy-overview-carbon-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.energy-overview-carbon-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 6px;
  background: rgba(26, 77, 77, 0.4);
  border: 1px solid #1A4D4D;
  border-radius: 6px;
  position: relative;
  min-height: 110px;
}

.energy-overview-carbon-badge {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  border: 2px solid #0A1E1E;
}

.energy-overview-carbon-badge-1 {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  color: #000;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
}

.energy-overview-carbon-badge-2 {
  background: linear-gradient(135deg, #C0C0C0, #808080);
  color: #000;
  box-shadow: 0 0 10px rgba(192, 192, 192, 0.6);
}

.energy-overview-carbon-badge-3 {
  background: linear-gradient(135deg, #CD7F32, #8B4513);
  color: #FFF;
  box-shadow: 0 0 10px rgba(205, 127, 50, 0.6);
}

.energy-overview-carbon-badge-4,
.energy-overview-carbon-badge-5 {
  background: linear-gradient(135deg, #555555, #333333);
  color: #FFF;
}

.energy-overview-carbon-grid-name {
  font-size: 10px;
  color: #E0F0F0;
  margin-top: 8px;
  text-align: center;
}

.energy-overview-carbon-grid-value {
  font-size: 18px;
  font-weight: 700;
  color: #00D9FF;
  line-height: 1;
  margin-top: 4px;
}

.energy-overview-carbon-grid-unit {
  font-size: 8px;
  color: rgba(224, 240, 240, 0.6);
  margin-top: 2px;
}

.energy-overview-carbon-grid-label {
  font-size: 8px;
  color: rgba(224, 240, 240, 0.7);
  margin-top: 4px;
}

.energy-overview-carbon-grid-change {
  font-size: 10px;
  font-weight: 600;
  color: #00FFB3;
  margin-top: 2px;
}

.energy-overview-pollution {
  min-height: 220px;
  display: flex;
  flex-direction: column;
}

.energy-overview-pollution-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.energy-overview-pollution-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.energy-overview-pollution-icon {
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, #00FFB3, #00D9FF);
  border-radius: 3px;
}

.energy-overview-pollution-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.energy-overview-pollution-main {
  font-size: 12px;
  font-weight: 600;
  color: #E0F0F0;
}

.energy-overview-pollution-sub {
  font-size: 9px;
  color: rgba(224, 240, 240, 0.7);
}

.energy-overview-pollution-tabs {
  display: flex;
  gap: 6px;
}

.energy-overview-pollution-chart {
  width: 100%;
  flex: 1;
  min-height: 0;
}
</style>