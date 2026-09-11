<template>
  <base-panel panelKey="default-panel">
    <!-- [Layout Refine] 将 *数据实时更新 与 tabs 共同放入 header-right，符合 Figma 相对位置 -->
    <template #header-right>
      <div class="c-mc-1785600410600-f8e51929-header-right">
        <span class="c-mc-1785600410600-f8e51929-update-tip">*数据实时更新</span>
        <div class="c-mc-1785600410600-f8e51929-tabs">
          <button
            v-for="tab in tabList"
            :key="tab.key"
            role="tab"
            :aria-selected="activeTab === tab.key"
            :class="[
              'c-mc-1785600410600-f8e51929-tab-item',
              activeTab === tab.key 
                ? 'c-mc-1785600410600-f8e51929-tab-item--active' 
                : 'c-mc-1785600410600-f8e51929-tab-item--inactive'
            ]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
    </template>

    <!-- [Style Refine] 背景色与阴影从 root 移至 content 区域，遵守面板组件禁令 -->
    <div class="c-mc-1785600410600-f8e51929-content">
      <!-- 子标题区：今日累计 -->
      <div class="c-mc-1785600410600-f8e51929-sub-header">
        <img :src="icon5" alt="今日累计图标" class="c-mc-1785600410600-f8e51929-sub-icon" />
        <span class="c-mc-1785600410600-f8e51929-sub-title">今日累计</span>
      </div>

      <!-- 统计卡片区 -->
      <div class="c-mc-1785600410600-f8e51929-cards">
        <div
          v-for="item in cardData"
          :key="item.id"
          class="c-mc-1785600410600-f8e51929-card-item"
        >
          <!-- [CRITICAL] 背景图使用 100% 100% 精确还原 -->
          <div 
            class="c-mc-1785600410600-f8e51929-card-bg" 
            :style="{ backgroundImage: `url(${item.bg})` }"
          ></div>
          
          <img :src="item.icon" :alt="item.label + '图标'" class="c-mc-1785600410600-f8e51929-card-icon" />
          
          <div class="c-mc-1785600410600-f8e51929-card-text">
            <span class="c-mc-1785600410600-f8e51929-card-label">{{ item.label }}</span>
            <div class="c-mc-1785600410600-f8e51929-card-value-row">
              <!-- [Style Refine] 颜色从 Figma fills.solid.color 精确提取 -->
              <span class="c-mc-1785600410600-f8e51929-card-value" :style="{ color: item.color }">
                {{ item.value }}
              </span>
              <span class="c-mc-1785600410600-f8e51929-card-unit">{{ item.unit }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon5 from '../resources/images/icon-8070.png'
import icon1 from '../resources/images/g-7961.png'
import icon2 from '../resources/images/icon-123.png'
import icon4 from '../resources/images/icon-8036.png'
import bg3 from '../resources/images/bg-125.png'
import icon3 from '../resources/images/icon-8049.png'
import bg2 from '../resources/images/bg-124.png'
import bg1 from '../resources/images/bg-126.png'

import { ref, watch, onMounted} from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[重点车辆监测] $mcComponentBuilder 初始化失败:', e)
}

const activeTab = ref('tunnel')
const tabList = [
  { key: 'tunnel', label: '江阴靖江长江隧道' },
  { key: 'bridge', label: '江阴大桥' }
]

// [Style Refine] 颜色值从 Figma fills 精确提取：危化品车 #ff090d, 重型货车 #1990ff, 超高车辆 #ff7700
const dataMap = {
  tunnel: [
    { id: 'dangerous', label: '危化品车', value: 51, unit: '次', color: '#ff090d', icon: icon4, bg: bg3 },
    { id: 'heavy', label: '重型货车', value: 2, unit: '次', color: '#1990ff', icon: icon3, bg: bg2 },
    { id: 'oversize', label: '超高车辆', value: 19, unit: '次', color: '#ff7700', icon: icon2, bg: bg1 }
  ],
  bridge: [
    { id: 'dangerous', label: '危化品车', value: 32, unit: '次', color: '#ff090d', icon: icon4, bg: bg3 },
    { id: 'heavy', label: '重型货车', value: 15, unit: '次', color: '#1990ff', icon: icon3, bg: bg2 },
    { id: 'oversize', label: '超高车辆', value: 8, unit: '次', color: '#ff7700', icon: icon2, bg: bg1 }
  ]
}

const cardData = ref(dataMap[activeTab.value])

watch(activeTab, (newTab) => {
  cardData.value = dataMap[newTab] || []
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
</style>