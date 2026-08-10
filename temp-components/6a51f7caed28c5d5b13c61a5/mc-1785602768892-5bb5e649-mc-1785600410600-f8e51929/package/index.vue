<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <div class="c-mc-1785600410600-f8e51929-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.key"
          :class="['c-mc-1785600410600-f8e51929-tab-item', { 'is-active': activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </div>
      </div>
    </template>

    <div class="c-mc-1785600410600-f8e51929-content">
      <div class="c-mc-1785600410600-f8e51929-sub-header">
        <img :src="icon5" class="c-mc-1785600410600-f8e51929-sub-icon" />
        <span class="c-mc-1785600410600-f8e51929-sub-title">今日累计</span>
      </div>
      <div class="c-mc-1785600410600-f8e51929-cards">
        <div
          v-for="card in cards"
          :key="card.id"
          class="c-mc-1785600410600-f8e51929-card"
          :style="{ backgroundImage: `url(${card.bg})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="card.icon" class="c-mc-1785600410600-f8e51929-card-icon" />
          <div class="c-mc-1785600410600-f8e51929-card-text">
            <span class="c-mc-1785600410600-f8e51929-card-label">{{ card.label }}</span>
            <div class="c-mc-1785600410600-f8e51929-card-value-group">
              <span class="c-mc-1785600410600-f8e51929-card-value" :style="{ color: card.color }">{{ card.value }}</span>
              <span class="c-mc-1785600410600-f8e51929-card-unit">{{ card.unit }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon5 from '../resources/images/icon-8070.png'
import bg3 from '../resources/images/bg-125.png'
import icon4 from '../resources/images/icon-8036.png'
import bg2 from '../resources/images/bg-124.png'
import icon3 from '../resources/images/icon-8049.png'
import bg1 from '../resources/images/bg-126.png'
import icon2 from '../resources/images/icon-123.png'

import { ref, watch, onMounted} from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const tabs = [
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
]

const activeTab = ref('tunnel')

const dataMap = {
  tunnel: [
    { id: 'dangerous', label: '危化品车', value: '51', unit: '次', color: '#ff4d4f', bg: bg3, icon: icon4 },
    { id: 'heavy', label: '重型货车', value: '2', unit: '次', color: '#1890ff', bg: bg2, icon: icon3 },
    { id: 'overheight', label: '超高车辆', value: '19', unit: '次', color: '#fa8c16', bg: bg1, icon: icon2 }
  ],
  bridge: [
    { id: 'dangerous', label: '危化品车', value: '38', unit: '次', color: '#ff4d4f', bg: bg3, icon: icon4 },
    { id: 'heavy', label: '重型货车', value: '15', unit: '次', color: '#1890ff', bg: bg2, icon: icon3 },
    { id: 'overheight', label: '超高车辆', value: '7', unit: '次', color: '#fa8c16', bg: bg1, icon: icon2 }
  ]
}

const cards = ref(dataMap[activeTab.value])

watch(activeTab, (newTab) => {
  cards.value = dataMap[newTab]
})

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785600410600-f8e51929-onload', {
      componentId: 'mc-1785600410600-f8e51929',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.c-mc-1785600410600-f8e51929-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #edf4fbb2;
}

.c-mc-1785600410600-f8e51929-tabs {
  display: flex;
  gap: 8px;
}

.c-mc-1785600410600-f8e51929-tab-item {
  padding: 4px 12px;
  border-radius: 20.46px;
  font-size: 14px;
  line-height: 21px;
  cursor: pointer;
  transition: all 0.3s;
  background: #6680a0;
  color: #333333;
  border: 0.73px solid rgba(172, 196, 225, 1);
  font-weight: 400;

  &.is-active {
    background: #1990ff;
    color: #ffffff;
    border: 0.73px solid rgba(199, 224, 255, 1);
    font-weight: 500;
  }
}

.c-mc-1785600410600-f8e51929-sub-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.c-mc-1785600410600-f8e51929-sub-icon {
  width: 18px;
  height: 18px;
}

.c-mc-1785600410600-f8e51929-sub-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}

.c-mc-1785600410600-f8e51929-cards {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.c-mc-1785600410600-f8e51929-card {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 12px;
  position: relative;
  overflow: hidden;
}

.c-mc-1785600410600-f8e51929-card-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.c-mc-1785600410600-f8e51929-card-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-mc-1785600410600-f8e51929-card-label {
  font-size: 12.32px;
  font-weight: 400;
  color: #333333;
  line-height: 18.48px;
}

.c-mc-1785600410600-f8e51929-card-value-group {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.c-mc-1785600410600-f8e51929-card-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 23.44px;
}

.c-mc-1785600410600-f8e51929-card-unit {
  font-size: 12.32px;
  font-weight: 400;
  color: #333333;
  line-height: 18.48px;
}
</style>