<template>
  <base-panel panelKey="default-panel">
    <div 
      class="c-mc-1785754491984-fcb7c5cd-container"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-mc-1785754491984-fcb7c5cd-stats-wrapper">
        <div v-for="(item, index) in statsData" :key="item.label" class="c-mc-1785754491984-fcb7c5cd-stat-item">
          <img :src="item.icon" class="c-mc-1785754491984-fcb7c5cd-stat-icon" />
          <div class="c-mc-1785754491984-fcb7c5cd-text-group">
            <span class="c-mc-1785754491984-fcb7c5cd-stat-label">{{ item.label }}</span>
            <span class="c-mc-1785754491984-fcb7c5cd-stat-value">{{ item.value }}</span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-6177.png'
import icon1 from '../resources/images/分割线-6094.png'
import icon2 from '../resources/images/矩形-6096.png'

import { ref, onMounted} from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const statsData = ref([
  { label: '总车流量', value: '12,580', icon: icon1 },
  { label: '客车流量', value: '8,920', icon: icon2 },
  { label: '货车流量', value: '3,660', icon: icon1 }
])

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785754491984-fcb7c5cd-onload', {
      componentId: 'mc-1785754491984-fcb7c5cd',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>