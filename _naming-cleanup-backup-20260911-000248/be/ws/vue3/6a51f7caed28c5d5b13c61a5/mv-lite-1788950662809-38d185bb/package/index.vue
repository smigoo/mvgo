<template>
  <div class="equipment-monitoring">
    <div class="equipment-monitoring-header">
      <div class="equipment-monitoring-title">设备监测</div>
      <div class="equipment-monitoring-stats">
        <div class="equipment-monitoring-stat-item">
          <span class="equipment-monitoring-stat-label">设备类型</span>
          <span class="equipment-monitoring-stat-value">28</span>
        </div>
        <div class="equipment-monitoring-stat-item">
          <span class="equipment-monitoring-stat-label">设备总数</span>
          <span class="equipment-monitoring-stat-value">56302</span>
        </div>
        <div class="equipment-monitoring-stat-item">
          <span class="equipment-monitoring-stat-label">在线数</span>
          <span class="equipment-monitoring-stat-value">56298</span>
        </div>
        <div class="equipment-monitoring-stat-item">
          <span class="equipment-monitoring-stat-label">完好率</span>
          <span class="equipment-monitoring-stat-value">98%</span>
        </div>
      </div>
    </div>

    <div class="equipment-monitoring-tabs">
      <div
        v-for="tab in tabs"
        :key="tab"
        class="equipment-monitoring-tab"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >
        {{ tab }}
      </div>
    </div>

    <div class="equipment-monitoring-content">
      <div class="equipment-monitoring-left">
        <div class="equipment-monitoring-card equipment-monitoring-card-abnormal">
          <div class="equipment-monitoring-card-label">异常设备数</div>
          <div class="equipment-monitoring-card-value">3</div>
        </div>
        <div class="equipment-monitoring-card equipment-monitoring-card-total">
          <div class="equipment-monitoring-card-label">设备总数</div>
          <div class="equipment-monitoring-card-value">3740</div>
        </div>
        <div class="equipment-monitoring-chart-wrapper">
          <div ref="chartRef" class="equipment-monitoring-chart"></div>
          <div class="equipment-monitoring-chart-center">
            <div class="equipment-monitoring-chart-label">设备完好率</div>
            <div class="equipment-monitoring-chart-value">99%</div>
          </div>
        </div>
      </div>

      <div class="equipment-monitoring-grid">
        <div
          v-for="device in devices"
          :key="device.name"
          class="equipment-monitoring-device"
        >
          <div class="equipment-monitoring-device-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path :d="device.iconPath" />
            </svg>
          </div>
          <div class="equipment-monitoring-device-content">
            <div class="equipment-monitoring-device-name">{{ device.name }}</div>
            <div class="equipment-monitoring-device-status">
              <span v-if="device.alert" class="equipment-monitoring-device-alert">{{ device.alert }}</span>
              <span class="equipment-monitoring-device-count" :class="{ error: device.error }">
                ({{ device.online }}/{{ device.total }})
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="equipment-monitoring-pagination">
        <button class="equipment-monitoring-pagination-btn" @click="console.log('next page')">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 2l4 4-4 4" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'

const activeTab = ref('监控系统')
const tabs = ['监控系统', '照明系统', '通风系统', '供配电系统', '消防系统', '交通诱导系统']

const devices = [
  {
    name: '摄像机',
    online: 2,
    total: 484,
    error: true,
    alert: '报修1',
    iconPath: 'M12 8a4 4 0 100-8 4 4 0 000 8zM2 20v-2a6 6 0 0112 0v2'
  },
  {
    name: '超高检测器',
    online: 0,
    total: 484,
    error: false,
    iconPath: 'M12 2v20M2 12h20'
  },
  {
    name: '激光雷达',
    online: 0,
    total: 484,
    error: false,
    iconPath: 'M12 2l9 20H3l9-20z'
  },
  {
    name: 'CO/VI检测器',
    online: 0,
    total: 484,
    error: false,
    iconPath: 'M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z'
  },
  {
    name: '风速风向仪',
    online: 1,
    total: 484,
    error: true,
    iconPath: 'M12 2v8m0 0l4-4m-4 4L8 6m4 16v-8m0 0l4 4m-4-4l-4 4'
  },
  {
    name: '烟道机器人',
    online: 0,
    total: 484,
    error: false,
    iconPath: 'M8 6h8M8 10h8M8 14h8M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z'
  },
  {
    name: 'CO₂传感器',
    online: 0,
    total: 484,
    error: false,
    iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'
  },
  {
    name: '洞外亮度检测',
    online: 0,
    total: 484,
    error: false,
    iconPath: 'M12 2v4m0 12v4m8-10h-4M8 12H4m13.66-5.66l-2.83 2.83M9.17 14.83l-2.83 2.83m0-11.32l2.83 2.83m5.66 5.66l2.83 2.83'
  }
]

const chartRef = ref(null)
let chart = null
let resizeObserver = null

const initChartWhenReady = () => {
  if (!chartRef.value || chart) return

  resizeObserver = new ResizeObserver((entries) => {
    const { clientWidth, clientHeight } = entries[0].target
    if (clientWidth > 0 && clientHeight > 0) {
      if (!chart) {
        chart = echarts.init(chartRef.value)
        const option = {
          series: [
            {
              type: 'pie',
              radius: ['70%', '90%'],
              center: ['50%', '50%'],
              startAngle: 90,
              avoidLabelOverlap: false,
              label: { show: false },
              labelLine: { show: false },
              data: [
                {
                  value: 99,
                  itemStyle: {
                    color: {
                      type: 'linear',
                      x: 0,
                      y: 0,
                      x2: 1,
                      y2: 1,
                      colorStops: [
                        { offset: 0, color: '#00D9D9' },
                        { offset: 1, color: '#00A3A3' }
                      ]
                    }
                  }
                },
                {
                  value: 1,
                  itemStyle: {
                    color: 'rgba(255, 255, 255, 0.1)'
                  }
                }
              ]
            }
          ]
        }
        chart.setOption(option)
      }
      if (chart) {
        chart.resize()
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
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (chart) {
    chart.dispose()
  }
})
</script>

<style scoped>
.equipment-monitoring {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: linear-gradient(135deg, #0A1F1F 0%, #0D2828 100%);
  padding: 10px 12px;
  color: #FFFFFF;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.equipment-monitoring-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 22px;
  margin-bottom: 4px;
}

.equipment-monitoring-title {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.equipment-monitoring-title::before {
  content: '';
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, #00D9D9 0%, #00A3A3 100%);
  border-radius: 3px;
}

.equipment-monitoring-stats {
  display: flex;
  gap: 16px;
  align-items: center;
}

.equipment-monitoring-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
}

.equipment-monitoring-stat-label {
  color: rgba(255, 255, 255, 0.6);
}

.equipment-monitoring-stat-value {
  color: #00D9D9;
  font-weight: 600;
  font-size: 11px;
}

.equipment-monitoring-tabs {
  display: flex;
  gap: 8px;
  height: 22px;
  margin-bottom: 8px;
}

.equipment-monitoring-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 40, 40, 0.6);
  border: 1px solid rgba(26, 64, 64, 0.8);
  border-radius: 4px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.equipment-monitoring-tab:hover {
  border-color: #00D9D9;
  background: rgba(0, 217, 217, 0.1);
}

.equipment-monitoring-tab.active {
  background: rgba(0, 217, 217, 0.2);
  border-color: #00D9D9;
}

.equipment-monitoring-content {
  display: flex;
  gap: 16px;
  height: calc(100% - 60px);
}

.equipment-monitoring-left {
  width: 140px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.equipment-monitoring-card {
  background: rgba(13, 40, 40, 0.6);
  border: 1px solid rgba(26, 64, 64, 0.8);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.equipment-monitoring-card-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.6);
}

.equipment-monitoring-card-value {
  font-size: 20px;
  font-weight: 700;
  color: #00D9D9;
}

.equipment-monitoring-card-total .equipment-monitoring-card-value {
  font-size: 26px;
}

.equipment-monitoring-chart-wrapper {
  flex: 1;
  position: relative;
  min-height: 0;
}

.equipment-monitoring-chart {
  width: 100%;
  height: 100%;
}

.equipment-monitoring-chart-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
}

.equipment-monitoring-chart-label {
  font-size: 8px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 2px;
}

.equipment-monitoring-chart-value {
  font-size: 16px;
  font-weight: 700;
  color: #00D9D9;
}

.equipment-monitoring-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
  min-height: 0;
  min-width: 0;
}

.equipment-monitoring-device {
  background: rgba(13, 40, 40, 0.6);
  border: 1px solid rgba(26, 64, 64, 0.8);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  min-height: 0;
}

.equipment-monitoring-device-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  background: rgba(0, 217, 217, 0.1);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #00D9D9;
}

.equipment-monitoring-device-icon svg {
  width: 18px;
  height: 18px;
}

.equipment-monitoring-device-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.equipment-monitoring-device-name {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.equipment-monitoring-device-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
}

.equipment-monitoring-device-alert {
  background: #FF4D4F;
  color: #FFFFFF;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 8px;
}

.equipment-monitoring-device-count {
  color: #00D9D9;
}

.equipment-monitoring-device-count.error {
  color: #FF4D4F;
}

.equipment-monitoring-pagination {
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.equipment-monitoring-pagination-btn {
  width: 20px;
  height: 20px;
  background: rgba(13, 40, 40, 0.6);
  border: 1px solid rgba(26, 64, 64, 0.8);
  border-radius: 4px;
  color: #00D9D9;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.equipment-monitoring-pagination-btn:hover {
  background: rgba(0, 217, 217, 0.2);
  border-color: #00D9D9;
}

.equipment-monitoring-pagination-btn svg {
  width: 10px;
  height: 10px;
}
</style>