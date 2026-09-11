<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1785972203029-cf5fa0f8-content">
      <!-- Header Section -->
      <div class="c-mc-max-1785972203029-cf5fa0f8-header">
        <div class="c-mc-max-1785972203029-cf5fa0f8-header-left">
          <span class="c-mc-max-1785972203029-cf5fa0f8-header-title">设备监测</span>
          <span class="c-mc-max-1785972203029-cf5fa0f8-header-tip">*数据实时更新</span>
        </div>
        <div class="c-mc-max-1785972203029-cf5fa0f8-header-stats">
          <div class="c-mc-max-1785972203029-cf5fa0f8-stat-item">
            <span class="c-mc-max-1785972203029-cf5fa0f8-stat-label">设备类型</span>
            <span class="c-mc-max-1785972203029-cf5fa0f8-stat-value primary">28</span>
          </div>
          <div class="c-mc-max-1785972203029-cf5fa0f8-stat-item">
            <span class="c-mc-max-1785972203029-cf5fa0f8-stat-label">设备总数</span>
            <span class="c-mc-max-1785972203029-cf5fa0f8-stat-value primary">68562</span>
          </div>
          <div class="c-mc-max-1785972203029-cf5fa0f8-stat-item">
            <span class="c-mc-max-1785972203029-cf5fa0f8-stat-label">完好率</span>
            <span class="c-mc-max-1785972203029-cf5fa0f8-stat-value success">98%</span>
          </div>
        </div>
      </div>

      <!-- Switch Section -->
      <div class="c-mc-max-1785972203029-cf5fa0f8-switch">
        <div class="c-mc-max-1785972203029-cf5fa0f8-switch-card active">
          <span class="c-mc-max-1785972203029-cf5fa0f8-switch-title">隧道设备</span>
          <div class="c-mc-max-1785972203029-cf5fa0f8-switch-info">
            <div class="c-mc-max-1785972203029-cf5fa0f8-switch-line">
              <span>总数:</span>
              <span class="c-mc-max-1785972203029-cf5fa0f8-switch-val">56302</span>
            </div>
            <div class="c-mc-max-1785972203029-cf5fa0f8-switch-line">
              <span>异常数:</span>
              <span class="c-mc-max-1785972203029-cf5fa0f8-switch-val error">5</span>
            </div>
          </div>
        </div>
        <div class="c-mc-max-1785972203029-cf5fa0f8-switch-card default">
          <span class="c-mc-max-1785972203029-cf5fa0f8-switch-title">南北接线设备</span>
          <div class="c-mc-max-1785972203029-cf5fa0f8-switch-info">
            <div class="c-mc-max-1785972203029-cf5fa0f8-switch-line">
              <span>总数:</span>
              <span class="c-mc-max-1785972203029-cf5fa0f8-switch-val">1280</span>
            </div>
            <div class="c-mc-max-1785972203029-cf5fa0f8-switch-line">
              <span>异常数:</span>
              <span class="c-mc-max-1785972203029-cf5fa0f8-switch-val error">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content Section -->
      <div class="c-mc-max-1785972203029-cf5fa0f8-main">
        <!-- Left Tabs -->
        <div class="c-mc-max-1785972203029-cf5fa0f8-tabs">
          <div class="c-mc-max-1785972203029-cf5fa0f8-tab-item active">
            监控
            <div class="c-mc-max-1785972203029-cf5fa0f8-tab-count">3/3740</div>
          </div>
          <div class="c-mc-max-1785972203029-cf5fa0f8-tab-item">
            照明
            <div class="c-mc-max-1785972203029-cf5fa0f8-tab-badge">3</div>
          </div>
          <div class="c-mc-max-1785972203029-cf5fa0f8-tab-item">通风</div>
          <div class="c-mc-max-1785972203029-cf5fa0f8-tab-item">供配电</div>
          <div class="c-mc-max-1785972203029-cf5fa0f8-tab-item">消防</div>
          <div class="c-mc-max-1785972203029-cf5fa0f8-tab-item">交通诱导</div>
        </div>

        <!-- Right Device Grid -->
        <div class="c-mc-max-1785972203029-cf5fa0f8-content-grid">
          <div 
            v-for="(device, index) in deviceList" 
            :key="index"
            class="c-mc-max-1785972203029-cf5fa0f8-device-card"
          >
            <img :src="device.icon" class="c-mc-max-1785972203029-cf5fa0f8-device-icon" />
            <div class="c-mc-max-1785972203029-cf5fa0f8-device-info">
              <span class="c-mc-max-1785972203029-cf5fa0f8-device-name">{{ device.name }}</span>
              <div class="c-mc-max-1785972203029-cf5fa0f8-device-stats">
                <span class="c-mc-max-1785972203029-cf5fa0f8-device-online">({{ device.online }}</span>
                <span class="c-mc-max-1785972203029-cf5fa0f8-device-total">/{{ device.total }})</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-8421.png'
import icon2 from '../resources/images/Frame-8856.png'
import icon3 from '../resources/images/icon-8798.png'

import { onMounted, ref } from 'vue'

// 1. 调用 $mcComponentBuilder 并解构 runtimeBuilder
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

// 2. 在 onMounted 中触发 onload 事件
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1785972203029-cf5fa0f8-onload', {
      componentId: 'mc-max-1785972203029-cf5fa0f8',
      timestamp: Date.now()
    })
  }
})

// 设备列表数据 (循环使用现有图标资源以还原12个设备网格)
const icons = [icon1, icon2, icon3]
const deviceList = ref([
  { name: '摄像机', online: 2, total: 484, icon: icons[0] },
  { name: '风速风向仪', online: 1, total: 484, icon: icons[1] },
  { name: '超高检测器', online: 0, total: 484, icon: icons[2] },
  { name: '烟道机器人', online: 0, total: 484, icon: icons[0] },
  { name: '激光雷达', online: 0, total: 484, icon: icons[1] },
  { name: 'CO2传感器', online: 0, total: 484, icon: icons[2] },
  { name: 'CO/VI检测器', online: 0, total: 484, icon: icons[0] },
  { name: '温湿度传感器', online: 0, total: 484, icon: icons[1] },
  { name: '压力传感器', online: 0, total: 484, icon: icons[2] },
  { name: '光照度变送器', online: 0, total: 484, icon: icons[0] },
  { name: '紧急电话', online: 0, total: 484, icon: icons[1] },
  { name: '水质监测设备', online: 0, total: 484, icon: icons[2] }
])
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>