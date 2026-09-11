<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备类型</span>
          <span class="c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">设备总数</span>
          <span class="c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-monitor-header-stat">
          <span class="c-monitor-header-stat-label">完好率</span>
          <span class="c-monitor-header-stat-value c-monitor-text-cyan">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-content">
      <!-- 顶部 Switch 卡片 -->
      <div class="c-monitor-switch">
        <div class="c-monitor-switch-card c-monitor-switch-card--active">
          <div class="c-monitor-switch-icon">
            <img :src="icon1" alt="隧道设备" />
          </div>
          <div class="c-monitor-switch-info">
            <div class="c-monitor-switch-title">隧道设备</div>
            <div class="c-monitor-switch-row">
              <span class="c-monitor-switch-label">总数:</span>
              <span class="c-monitor-switch-val">56302</span>
            </div>
            <div class="c-monitor-switch-row">
              <span class="c-monitor-switch-label">异常数:</span>
              <span class="c-monitor-switch-val c-monitor-text-danger">5</span>
            </div>
          </div>
        </div>
        <div class="c-monitor-switch-card">
          <div class="c-monitor-switch-icon">
            <img :src="icon2" alt="南北接线" />
          </div>
          <div class="c-monitor-switch-info">
            <div class="c-monitor-switch-title">南北接线</div>
            <div class="c-monitor-switch-row">
              <span class="c-monitor-switch-label">总数:</span>
              <span class="c-monitor-switch-val">1280</span>
            </div>
            <div class="c-monitor-switch-row">
              <span class="c-monitor-switch-label">异常数:</span>
              <span class="c-monitor-switch-val c-monitor-text-danger">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="c-monitor-main">
        <!-- 左侧 Tab -->
        <div class="c-monitor-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.value"
            :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': activeTab === tab.value }]"
            @click="activeTab = tab.value"
          >
            <span class="c-monitor-tab-text">{{ tab.label }}</span>
            <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备网格 -->
        <div class="c-monitor-grid">
          <div
            v-for="device in devices"
            :key="device.name"
            class="c-monitor-device-card"
          >
            <div class="c-monitor-device-icon">
              <img v-if="device.icon" :src="device.icon" :alt="device.name" />
              <div v-else class="c-monitor-device-icon-placeholder"></div>
            </div>
            <div class="c-monitor-device-info">
              <div class="c-monitor-device-name">{{ device.name }}</div>
              <div class="c-monitor-device-status">
                <span :class="device.online > 0 ? 'c-monitor-text-primary' : 'c-monitor-text-danger'">
                  ({{ device.online }}/{{ device.total }})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// 1. 一次调用 $mcComponentBuilder 并直接解构
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 2. 触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

// Tab 数据
const tabs = ref([
  { label: '监控', value: 'monitor', badge: '3/3740' },
  { label: '照明', value: 'lighting', badge: '' },
  { label: '通风', value: 'ventilation', badge: '' },
  { label: '消防', value: 'fire', badge: '' },
  { label: '交通诱导', value: 'traffic', badge: '' },
  { label: '供配电', value: 'power', badge: '' }
])
const activeTab = ref('monitor')

// 设备数据
const devices = ref([
  { name: '摄像机', online: 2, total: 484, icon: null },
  { name: '烟道机器人', online: 0, total: 484, icon: null },
  { name: 'CO/VI检测器', online: 0, total: 484, icon: null },
  { name: '光照度变送器', online: 0, total: 484, icon: null },
  { name: '激光雷达', online: 0, total: 484, icon: null },
  { name: '风速风向仪', online: 1, total: 484, icon: null },
  { name: '温湿度传感器', online: 0, total: 484, icon: null },
  { name: '紧急电话', online: 0, total: 484, icon: null },
  { name: '超高检测器', online: 0, total: 484, icon: null },
  { name: 'CO2传感器', online: 0, total: 484, icon: null },
  { name: '压力传感器', online: 0, total: 484, icon: null },
  { name: '水质监测设备', online: 0, total: 484, icon: null }
])
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>