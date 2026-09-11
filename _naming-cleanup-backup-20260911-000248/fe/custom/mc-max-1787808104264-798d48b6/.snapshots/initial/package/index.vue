<template>
  <base-panel class="c-mc-max-1787808104264-798d48b6" panelKey="default-panel">
    <template #header_right>
      <div class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stats">
        <div class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stat">
          <span class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stat-label">设备类型</span>
          <span class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stat-value">28</span>
        </div>
        <div class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stat">
          <span class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stat-label">设备总数</span>
          <span class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stat-value">68562</span>
        </div>
        <div class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stat">
          <span class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stat-label">完好率</span>
          <span class="c-mc-max-1787808104264-798d48b6-c-monitor-header-stat-value">98%</span>
        </div>
      </div>
    </template>

    <div class="c-mc-max-1787808104264-798d48b6-c-monitor-body">
      <!-- 左侧分类切换区 -->
      <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch">
        <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-item c-mc-max-1787808104264-798d48b6-c-monitor-switch-item--active" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '193px 65px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-icon">
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-icon-shape"></div>
          </div>
          <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-info">
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-title">隧道设备</div>
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-row">
              <span class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-label">总数:</span>
              <span class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-value">56302</span>
            </div>
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-row">
              <span class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-label">异常数:</span>
              <span class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-value c-mc-max-1787808104264-798d48b6-c-monitor-switch-value--error">5</span>
            </div>
          </div>
        </div>
        <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-item">
          <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-icon">
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-icon-shape"></div>
          </div>
          <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-info">
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-title">南北接线 设备</div>
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-row">
              <span class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-label">总数:</span>
              <span class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-value">1280</span>
            </div>
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-row">
              <span class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-label">异常数:</span>
              <span class="c-mc-max-1787808104264-798d48b6-c-monitor-switch-value c-mc-max-1787808104264-798d48b6-c-monitor-switch-value--error">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧主内容区 -->
      <div class="c-mc-max-1787808104264-798d48b6-c-monitor-main">
        <!-- Tab 标签组 -->
        <div class="c-mc-max-1787808104264-798d48b6-c-monitor-tabs">
          <div 
            v-for="(tab, index) in tabs" 
            :key="tab.label" 
            :class="['c-monitor-tab-item', { 'c-monitor-tab-item--active': index === activeTabIndex }]"
            @click="activeTabIndex = index"
          >
            <span class="c-mc-max-1787808104264-798d48b6-c-monitor-tab-label" :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '34px 40px', backgroundPosition: '0px 4px', backgroundRepeat: 'no-repeat' }">{{ tab.label }}</span>
            <span v-if="tab.count" class="c-mc-max-1787808104264-798d48b6-c-monitor-tab-count" :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '34px 40px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ tab.count }}</span>
          </div>
        </div>

        <!-- 设备网格 -->
        <div class="c-mc-max-1787808104264-798d48b6-c-monitor-grid">
          <div v-for="device in devices" :key="device.name" class="c-mc-max-1787808104264-798d48b6-c-monitor-device-card">
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-device-icon">
              <div class="c-mc-max-1787808104264-798d48b6-c-monitor-device-icon-shape"></div>
            </div>
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-device-name">{{ device.name }}</div>
            <div class="c-mc-max-1787808104264-798d48b6-c-monitor-device-value">{{ device.value }}</div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const tabs = ref([
  { label: '监控', count: '3/3740' },
  { label: '照明', count: '3' },
  { label: '通风' },
  { label: '消防' },
  { label: '交通诱导' },
  { label: '供配电' }
])
const activeTabIndex = ref(0)

const devices = ref([
  { name: '摄像机', value: '(2/484)' },
  { name: '烟道机器人', value: '(0/484)' },
  { name: 'CO/VI检测器', value: '(0/484)' },
  { name: '光照度变送器', value: '(0/484)' },
  { name: '激光雷达', value: '(0/484)' },
  { name: '风速风向仪', value: '(1/484)' },
  { name: '温湿度传感器', value: '(0/484)' },
  { name: '紧急电话', value: '(0/484)' },
  { name: '超高检测器', value: '(0/484)' },
  { name: 'CO2传感器', value: '(0/484)' },
  { name: '压力传感器', value: '(0/484)' },
  { name: '水质监测设备', value: '(0/484)' }
])

onMounted(() => {
  runtimeBuilder.publishEvent('device-monitor-onload', {
    componentId: 'device-monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>