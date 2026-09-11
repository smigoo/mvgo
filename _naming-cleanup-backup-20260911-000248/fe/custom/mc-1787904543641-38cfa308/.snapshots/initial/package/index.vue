<template>
  <base-panel class="c-mc-max-1787901303757-200c2f4f" panelKey="default-panel">
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
          <span class="c-monitor-header-stat-value">98%</span>
        </div>
      </div>
    </template>

    <div class="c-monitor-root">
      <!-- 设备汇总卡片 -->
      <div class="c-monitor-overview-cards">
        <div class="c-monitor-summary-card" :style="backgroundImage: 'url(bg2)', backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat'">
          <img class="c-monitor-card-icon" :src="icon1" alt="设备图标" />
          <div class="c-monitor-card-content">
            <div class="c-monitor-card-label-row">
              <span class="c-monitor-card-label">总 数:</span>
              <span class="c-monitor-card-value">56302</span>
            </div>
            <div class="c-monitor-card-label-row">
              <span class="c-monitor-card-label">异常数:</span>
              <span class="c-monitor-card-abnormal">5</span>
            </div>
          </div>
        </div>

        <div class="c-monitor-summary-card">
          <img class="c-monitor-card-icon" :src="icon1" alt="设备图标" />
          <div class="c-monitor-card-content">
            <div class="c-monitor-card-label-row">
              <span class="c-monitor-card-label">总 数:</span>
              <span class="c-monitor-card-value">1280</span>
            </div>
            <div class="c-monitor-card-label-row">
              <span class="c-monitor-card-label">异常数:</span>
              <span class="c-monitor-card-abnormal">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 设备列表与分类 -->
      <div class="c-monitor-device-section" :style="backgroundImage: 'url(bg3)', backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat'">
        <!-- 左侧分类Tab -->
        <div class="c-monitor-sidebar-tabs">
          <div
            v-for="tab in tabs"
            :key="tab.label"
            :class="['c-monitor-tab-item', { active: activeTab === tab.label }]"
            @click="activeTab = tab.label"
          >
            <span class="c-monitor-tab-label">{{ tab.label }}</span>
            <span v-if="tab.badge" class="c-monitor-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备网格 -->
        <div class="c-monitor-device-grid">
          <div
            v-for="device in deviceList"
            :key="device.name"
            class="c-monitor-device-item"
          >
            <div class="c-monitor-device-icon-wrapper">
              <img class="c-monitor-device-icon" :src="icon1" alt="设备图标" />
            </div>
            <div class="c-monitor-device-info">
              <span class="c-monitor-device-name">{{ device.name }}</span>
              <span class="c-monitor-device-count">{{ device.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>
<script setup>
import bg2 from '../resources/images/bg-8788.png'
import bg3 from '../resources/images/bg-8807.png'
import icon1 from '../resources/images/icon-8798.png'
import icon2 from '../resources/images/icon-8817.png'


import { ref, onMounted} from 'vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 左侧分类 Tab 列表（监控/照明/通风/供配电/消防/交通诱导） ===
const tabs = ref([
  { label: '监控', badge: '3/3740' },
  { label: '照明', badge: '3' },
  { label: '通风' },
  { label: '供配电' },
  { label: '消防' },
  { label: '交通诱导' }
])
// === 当前激活的分类 ===
const activeTab = ref('监控')
// === 设备网格列表（异常数/总数，数据来自设计稿文字清单） ===
const deviceList = ref([
  { name: '摄像机', count: '(2/484)' },
  { name: '风速风向仪', count: '(1/484)' },
  { name: '超高检测器', count: '(0/484)' },
  { name: '烟道机器人', count: '(0/484)' },
  { name: '激光雷达', count: '(0/484)' },
  { name: 'CO2传感器', count: '(0/484)' },
  { name: 'CO/VI检测器', count: '(0/484)' },
  { name: '温湿度传感器', count: '(0/484)' },
  { name: '压力传感器', count: '(0/484)' },
  { name: '光照度变送器', count: '(0/484)' },
  { name: '紧急电话', count: '(0/484)' },
  { name: '水质监测设备', count: '(0/484)' }
])
// === 组件加载完成事件 ===
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>