<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-content">
      <!-- 顶部标题与统计区 -->
      <div class="dm-header">
        <span class="dm-title">设备监测</span>
        <div class="dm-stats">
          <div class="dm-stat-item">
            <span class="dm-stat-label">设备类型</span>
            <span class="dm-stat-value">28</span>
          </div>
          <div class="dm-stat-item">
            <span class="dm-stat-label">设备总数</span>
            <span class="dm-stat-value">68562</span>
          </div>
          <div class="dm-stat-item">
            <span class="dm-stat-label">完好率</span>
            <span class="dm-stat-value success">98%</span>
          </div>
        </div>
      </div>

      <!-- 中部汇总卡片区 -->
      <div class="dm-switch">
        <div class="dm-switch-card active">
          <div class="dm-switch-top">
            <img :src="iconTunnel" class="dm-switch-icon" />
            <span class="dm-switch-title">隧道设备</span>
          </div>
          <div class="dm-switch-data">
            <div class="dm-switch-row">
              <span>总数:</span>
              <span class="dm-switch-val">56302</span>
            </div>
            <div class="dm-switch-row">
              <span>异常数:</span>
              <span class="dm-switch-val danger">5</span>
            </div>
          </div>
        </div>
        <div class="dm-switch-card default">
          <div class="dm-switch-top">
            <img :src="iconNS" class="dm-switch-icon" />
            <span class="dm-switch-title">南北接线设备</span>
          </div>
          <div class="dm-switch-data">
            <div class="dm-switch-row">
              <span>总数:</span>
              <span class="dm-switch-val">1280</span>
            </div>
            <div class="dm-switch-row">
              <span>异常数:</span>
              <span class="dm-switch-val danger">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部 Tab 与设备网格区 -->
      <div class="dm-main">
        <div class="dm-tabs">
          <div 
            v-for="(tab, index) in tabs" 
            :key="tab.name" 
            :class="['dm-tab-item', { active: index === activeTab }]"
            @click="activeTab = index"
          >
            {{ tab.name }}
            <span v-if="tab.badge" class="dm-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>
        <div class="dm-grid">
          <div v-for="device in devices" :key="device.name" class="dm-grid-item">
            <img :src="device.icon" class="dm-grid-icon" />
            <div class="dm-grid-info">
              <span class="dm-grid-name">{{ device.name }}</span>
              <span :class="['dm-grid-val', device.abnormal > 0 ? 'danger' : 'success']">
                ({{ device.abnormal }}/{{ device.total }})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

// 导入汇总卡片图标
import iconTunnel from '../resources/images/icon-8798.png'
import iconNS from '../resources/images/icon-8817.png'

// 导入设备网格图标
import icon1 from '../resources/images/icon-8444.png'
import icon2 from '../resources/images/icon-8473.png'
import icon3 from '../resources/images/icon-8503.png'
import icon4 from '../resources/images/icon-8532.png'
import icon5 from '../resources/images/icon-8561.png'
import icon6 from '../resources/images/icon-8590.png'
import icon7 from '../resources/images/icon-8619.png'
import icon8 from '../resources/images/icon-8648.png'
import icon9 from '../resources/images/icon-8677.png'
import icon10 from '../resources/images/icon-8706.png'
import icon11 from '../resources/images/icon-8735.png'
import icon12 from '../resources/images/icon-8764.png'

const activeTab = ref(0)

const tabs = [
  { name: '监控', badge: '3' },
  { name: '照明', badge: '3' },
  { name: '通风' },
  { name: '供配电' },
  { name: '消防' },
  { name: '交通诱导' }
]

const devices = [
  { name: '摄像机', abnormal: 2, total: 484, icon: icon1 },
  { name: '风速风向仪', abnormal: 1, total: 484, icon: icon2 },
  { name: '超高检测器', abnormal: 0, total: 484, icon: icon3 },
  { name: '烟道机器人', abnormal: 0, total: 484, icon: icon4 },
  { name: '激光雷达', abnormal: 0, total: 484, icon: icon5 },
  { name: 'CO2传感器', abnormal: 0, total: 484, icon: icon6 },
  { name: 'CO/VI检测器', abnormal: 0, total: 484, icon: icon7 },
  { name: '温湿度传感器', abnormal: 0, total: 484, icon: icon8 },
  { name: '压力传感器', abnormal: 0, total: 484, icon: icon9 },
  { name: '光照度变送器', abnormal: 0, total: 484, icon: icon10 },
  { name: '紧急电话', abnormal: 0, total: 484, icon: icon11 },
  { name: '水质监测设备', abnormal: 0, total: 484, icon: icon12 }
]
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>