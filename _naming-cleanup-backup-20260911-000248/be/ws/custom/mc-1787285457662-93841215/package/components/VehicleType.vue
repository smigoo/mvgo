<template>
  <div class="vehicle-type-wrap">
    <div class="vt-header">
      <div class="vt-title">车辆类型统计</div>
      <div class="vt-subtitle">单位：辆</div>
    </div>
    <div class="vt-list">
      <div v-for="item in types" :key="item.label" class="vt-row">
        <div class="vt-label">
          <span class="vt-dot" :style="{ background: item.color }"></span>
          {{ item.label }}
        </div>
        <div class="vt-track">
          <div class="vt-track-inner" :style="{ width: item.percent + '%', background: item.color }"></div>
        </div>
        <div class="vt-value">{{ item.percent }}%</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject, onMounted } from 'vue'

let runtimeBuilder = null
let componentApi = null
let componentProps = {}
let businessProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
  componentApi = builder?.componentApi || null
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
} catch (e) {
  console.warn('[VehicleType] $mcComponentBuilder 初始化失败:', e)
}

const injectedApi = inject('componentApi', null)
const injectedProps = inject('componentProps', {})
const injectedBusiness = inject('businessProps', {})

if (!componentApi) componentApi = injectedApi
if (!Object.keys(componentProps).length) componentProps = injectedProps
if (!Object.keys(businessProps).length) businessProps = injectedBusiness

const config = computed(() => ({
  dataRefreshInterval: businessProps?.dataRefreshInterval ?? 60000,
  showTimeSelector: businessProps?.showTimeSelector ?? true
}))

const types = ref([
  { label: '小客车', percent: 42, color: '#4A9DF8' },
  { label: '大客车', percent: 16, color: '#37C978' },
  { label: '货车', percent: 25, color: '#F5A623' },
  { label: '其它', percent: 17, color: '#B8B8C8' }
])

onMounted(() => {
  if (runtimeBuilder && typeof runtimeBuilder.publishEvent === 'function') {
    runtimeBuilder.publishEvent('VehicleType-onload', {
      componentId: 'VehicleType',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
.vehicle-type-wrap {  width: 100%;

  padding: 12px;
  background: rgba(0, 22, 64, 0.55);
  border: 1px solid rgba(70, 130, 220, 0.35);
  border-radius: 8px;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(4px);
}
.vt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.vt-title {
  color: #cfe5ff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
}
.vt-subtitle {
  color: rgba(180, 210, 255, 0.7);
  font-size: 12px;
}
.vt-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vt-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.vt-label {
  width: 60px;
  display: flex;
  align-items: center;
  gap: 4px;
  color: #dcecff;
  font-size: 12px;
}
.vt-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.vt-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  overflow: hidden;
}
.vt-track-inner {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.vt-value {
  width: 40px;
  text-align: right;
  color: #dcecff;
  font-size: 12px;
}
</style>