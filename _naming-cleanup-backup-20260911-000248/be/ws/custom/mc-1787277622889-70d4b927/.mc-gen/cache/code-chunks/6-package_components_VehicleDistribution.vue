<template>
  <div class="vehicle-distribution">
    <div class="vd-title">车辆分布</div>
    <div class="vd-content">
      <div v-for="item in items" :key="item.label" class="vd-item">
        <span class="vd-label">{{ item.label }}</span>
        <span class="vd-value">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'

let runtimeBuilder = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[VehicleDistribution] $mcComponentBuilder 初始化失败:', e)
}

const items = [
  { label: '轿车', value: '45%' },
  { label: '货车', value: '30%' },
  { label: '客车', value: '25%' }
]

onMounted(() => {
  runtimeBuilder?.publishEvent('VehicleDistribution-onload', {
    componentId: 'VehicleDistribution',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
.vehicle-distribution {
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}
.vd-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}
.vd-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vd-item {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}
.vd-value {
  font-weight: 500;
}
</style>