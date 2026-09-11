<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <!-- [Style Refine] bg VECTOR fills mapped to wrapper -->
      <div 
        class="c-device-monitor-wrapper" 
        :style="{ backgroundImage: `url(${bg1})` }"
      ></div>
      
      <div class="c-device-monitor-inner">
        <!-- Header -->
        <div class="c-device-monitor-header">
          <div class="c-device-monitor-header-left">
            <img :src="iconHeader" class="c-device-monitor-header-icon" />
            <span class="c-device-monitor-title">设备监测</span>
          </div>
          <div class="c-device-monitor-header-stats">
            <div class="c-device-monitor-stat-item">
              <span class="c-device-monitor-stat-label">设备类型</span>
              <span class="c-device-monitor-stat-value">{{ overviewData.types || 28 }}</span>
            </div>
            <div class="c-device-monitor-stat-item">
              <span class="c-device-monitor-stat-label">设备总数</span>
              <span class="c-device-monitor-stat-value">{{ overviewData.total || 68562 }}</span>
            </div>
            <div class="c-device-monitor-stat-item">
              <span class="c-device-monitor-stat-label">完好率</span>
              <span class="c-device-monitor-stat-value">{{ overviewData.rate || '98%' }}</span>
            </div>
          </div>
          <span class="c-device-monitor-header-tip">*数据实时更新</span>
        </div>

        <!-- Slot Con -->
        <div class="c-device-monitor-content">
          <!-- Switch -->
          <div class="c-device-monitor-switch">
            <div class="c-device-monitor-switch-card is-active">
              <img :src="iconSwitch1" class="c-device-monitor-switch-icon" />
              <div class="c-device-monitor-switch-info">
                <span class="c-device-monitor-switch-title">隧道设备</span>
                <div class="c-device-monitor-switch-data">
                  <span class="c-device-monitor-switch-label">总数:</span>
                  <span class="c-device-monitor-switch-num">56302</span>
                </div>
                <div class="c-device-monitor-switch-data">
                  <span class="c-device-monitor-switch-label">异常数:</span>
                  <span class="c-device-monitor-switch-num is-warn">5</span>
                </div>
              </div>
            </div>
            <div class="c-device-monitor-switch-card">
              <img :src="iconSwitch2" class="c-device-monitor-switch-icon" />
              <div class="c-device-monitor-switch-info">
                <span class="c-device-monitor-switch-title">南北接线设备</span>
                <div class="c-device-monitor-switch-data">
                  <span class="c-device-monitor-switch-label">总数:</span>
                  <span class="c-device-monitor-switch-num">1280</span>
                </div>
                <div class="c-device-monitor-switch-data">
                  <span class="c-device-monitor-switch-label">异常数:</span>
                  <span class="c-device-monitor-switch-num is-warn">3</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab & Cons -->
          <div class="c-device-monitor-tab-con">
            <div class="c-device-monitor-tabs">
              <div class="c-device-monitor-tab is-active">
                <span class="c-device-monitor-tab-text">监控</span>
                <span class="c-device-monitor-tab-badge">3/3740</span>
              </div>
              <div class="c-device-monitor-tab">
                <span class="c-device-monitor-tab-text">照明</span>
                <span class="c-device-monitor-tab-badge is-red">3</span>
              </div>
              <div class="c-device-monitor-tab">
                <span class="c-device-monitor-tab-text">通风</span>
              </div>
              <div class="c-device-monitor-tab">
                <span class="c-device-monitor-tab-text">供配电</span>
              </div>
              <div class="c-device-monitor-tab">
                <span class="c-device-monitor-tab-text">消防</span>
              </div>
              <div class="c-device-monitor-tab">
                <span class="c-device-monitor-tab-text">交通诱导</span>
              </div>
            </div>
            <div class="c-device-monitor-cons">
              <div v-for="device in deviceList" :key="device.name" class="c-device-monitor-card">
                <div class="c-device-monitor-card-icon">
                  <img :src="device.icon" />
                </div>
                <div class="c-device-monitor-card-info">
                  <span class="c-device-monitor-card-name">{{ device.name }}</span>
                  <span class="c-device-monitor-card-count">({{ device.online }}/{{ device.total }})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-8788.png'
import iconHeader from '../resources/images/Frame-8856.png'
import iconSwitch1 from '../resources/images/icon-8798.png'
import iconSwitch2 from '../resources/images/icon-8817.png'

import { ref, computed, onMounted, onUnmounted } from 'vue'
import declareJson from '../declare.json'

// Mock data for layout demonstration
const overviewData = ref({
  types: 28,
  total: 68562,
  rate: '98%'
})

const deviceList = ref([
  { name: '摄像机', online: 2, total: 484, icon: iconSwitch1 },
  { name: '风速风向仪', online: 1, total: 484, icon: iconSwitch1 },
  { name: '激光雷达', online: 0, total: 484, icon: iconSwitch1 },
  { name: '超高检测器', online: 0, total: 484, icon: iconSwitch1 },
  { name: '烟道机器人', online: 0, total: 484, icon: iconSwitch1 },
  { name: 'CO2传感器', online: 0, total: 484, icon: iconSwitch1 },
  { name: 'CO/VI检测器', online: 0, total: 484, icon: iconSwitch1 },
  { name: '温湿度传感器', online: 0, total: 484, icon: iconSwitch1 },
  { name: '压力传感器', online: 0, total: 484, icon: iconSwitch1 },
  { name: '光照度变送器', online: 0, total: 484, icon: iconSwitch1 },
  { name: '紧急电话', online: 0, total: 484, icon: iconSwitch1 },
  { name: '水质监测设备', online: 0, total: 484, icon: iconSwitch1 }
])
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>