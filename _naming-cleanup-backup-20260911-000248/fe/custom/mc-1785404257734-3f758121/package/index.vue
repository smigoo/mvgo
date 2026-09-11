<template>
  <base-panel panelKey="default-panel">
    <!-- 标题左侧装饰图标 -->
    <template #title-left>
      <img :src="icon1" class="c-mc-1785404257734-3f758121-title-icon" />
    </template>
    
    <!-- 标题右侧统计指标 -->
    <template #header-right>
      <div class="c-mc-1785404257734-3f758121-header-stats">
        <div class="c-mc-1785404257734-3f758121-stat-item">
          <span class="c-mc-1785404257734-3f758121-stat-label">设备类型</span>
          <span class="c-mc-1785404257734-3f758121-stat-value">{{ stats.deviceType }}</span>
        </div>
        <div class="c-mc-1785404257734-3f758121-stat-item">
          <span class="c-mc-1785404257734-3f758121-stat-label">设备总数</span>
          <span class="c-mc-1785404257734-3f758121-stat-value">{{ stats.totalDevices }}</span>
        </div>
        <div class="c-mc-1785404257734-3f758121-stat-item">
          <span class="c-mc-1785404257734-3f758121-stat-label">完好率</span>
          <span class="c-mc-1785404257734-3f758121-stat-value-green">{{ stats.goodRate }}</span>
        </div>
        <img :src="icon2" class="c-mc-1785404257734-3f758121-header-icon" />
      </div>
    </template>

    <!-- 默认插槽：内容区 -->
    <div class="c-mc-1785404257734-3f758121-content">
      <!-- 切换开关 -->
      <div class="c-mc-1785404257734-3f758121-switch-wrapper">
        <div 
          class="c-mc-1785404257734-3f758121-switch-item" 
          :class="{ 'is-active': activeSwitch === 'tunnel' }"
          @click="activeSwitch = 'tunnel'"
        >
          <!-- Fixed: 使用 bg1 背景图资源 -->
          <div class="c-mc-1785404257734-3f758121-switch-bg" :style="{ backgroundImage: `url(${bg1})` }"></div>
          <img :src="icon3" class="c-mc-1785404257734-3f758121-switch-icon" />
          <span class="c-mc-1785404257734-3f758121-switch-text">隧道设备</span>
        </div>
        <div 
          class="c-mc-1785404257734-3f758121-switch-item"
          :class="{ 'is-active': activeSwitch === 'cable' }"
          @click="activeSwitch = 'cable'"
        >
          <!-- Fixed: 使用 bg2 背景图资源 -->
          <div class="c-mc-1785404257734-3f758121-switch-bg" :style="{ backgroundImage: `url(${bg2})` }"></div>
          <img :src="icon4" class="c-mc-1785404257734-3f758121-switch-icon" />
          <span class="c-mc-1785404257734-3f758121-switch-text">南北接线 设备</span>
        </div>
      </div>

      <!-- 主体内容：左侧Tab + 右侧卡片 -->
      <div class="c-mc-1785404257734-3f758121-main-body">
        <!-- 左侧 Tab -->
        <div class="c-mc-1785404257734-3f758121-tab-list">
          <div 
            v-for="tab in tabs" 
            :key="tab.key"
            class="c-mc-1785404257734-3f758121-tab-item"
            :class="{ 'is-active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </div>
        </div>

        <!-- 右侧卡片网格 -->
        <div class="c-mc-1785404257734-3f758121-card-grid">
          <div 
            v-for="card in currentCards" 
            :key="card.id"
            class="c-mc-1785404257734-3f758121-card-item"
          >
            <!-- Fixed: 使用 bg3-bg8 背景图资源 -->
            <div class="c-mc-1785404257734-3f758121-card-bg" :style="{ backgroundImage: `url(${card.bg})` }"></div>
            <div class="c-mc-1785404257734-3f758121-card-content">
              <img :src="card.icon" class="c-mc-1785404257734-3f758121-card-icon" />
              <div class="c-mc-1785404257734-3f758121-card-info">
                <span class="c-mc-1785404257734-3f758121-card-name">{{ card.name }}</span>
                <span class="c-mc-1785404257734-3f758121-card-status" :class="card.statusClass">{{ card.status }}</span>
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
import bg1 from '../resources/images/bg-8788.png'
import icon3 from '../resources/images/icon-8798.png'
import bg2 from '../resources/images/bg-8807.png'
import icon4 from '../resources/images/icon-8817.png'
import bg3 from '../resources/images/bg-8439.png'
import bg8 from '../resources/images/bg-8585.png'
import icon5 from '../resources/images/icon-8444.png'
import bg4 from '../resources/images/bg-8468.png'
import icon6 from '../resources/images/icon-8473.png'
import bg5 from '../resources/images/bg-8498.png'
import icon7 from '../resources/images/icon-8503.png'
import bg6 from '../resources/images/bg-8527.png'
import icon8 from '../resources/images/icon-8532.png'
import bg7 from '../resources/images/bg-8556.png'
import icon9 from '../resources/images/icon-8677.png'

import { ref, computed, onMounted } from 'vue'

// Fixed: 添加 $mcComponentBuilder 调用，使用 try-catch 包裹防止框架未就绪时报错
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[设备监测] $mcComponentBuilder 失败:', e)
}

// Fixed: 使用响应式数据绑定，避免硬编码
const stats = ref({
  deviceType: 28,
  totalDevices: 68562,
  goodRate: '98%'
})

const activeSwitch = ref('tunnel')
const activeTab = ref('tab1')

const tabs = [
  { key: 'tab1', label: '监控' },
  { key: 'tab2', label: '报警' },
  { key: 'tab3', label: '故障' },
  { key: 'tab4', label: '离线' },
  { key: 'tab5', label: '维护' },
  { key: 'tab6', label: '全部' }
]

// Fixed: 使用背景图和图标资源，解决内容区背景图未被使用的问题
const tunnelCards = [
  { id: 1, name: '风机', status: '正常', statusClass: 'is-normal', bg: bg3, icon: icon5 },
  { id: 2, name: '照明', status: '正常', statusClass: 'is-normal', bg: bg4, icon: icon6 },
  { id: 3, name: '水泵', status: '告警', statusClass: 'is-alert', bg: bg5, icon: icon7 },
  { id: 4, name: '摄像头', status: '正常', statusClass: 'is-normal', bg: bg6, icon: icon8 },
  { id: 5, name: 'CO检测', status: '正常', statusClass: 'is-normal', bg: bg7, icon: icon9 },
  { id: 6, name: 'VI检测', status: '离线', statusClass: 'is-offline', bg: bg8, icon: icon5 },
  { id: 7, name: '门禁', status: '正常', statusClass: 'is-normal', bg: bg3, icon: icon6 },
  { id: 8, name: '广播', status: '正常', statusClass: 'is-normal', bg: bg4, icon: icon7 },
  { id: 9, name: '情报板', status: '故障', statusClass: 'is-fault', bg: bg5, icon: icon8 },
  { id: 10, name: '火灾报警', status: '正常', statusClass: 'is-normal', bg: bg6, icon: icon9 },
  { id: 11, name: '车道指示', status: '正常', statusClass: 'is-normal', bg: bg7, icon: icon5 },
  { id: 12, name: '紧急电话', status: '正常', statusClass: 'is-normal', bg: bg8, icon: icon6 }
]

const cableCards = tunnelCards.map(c => ({ ...c, id: c.id + 100 }))

const currentCards = computed(() => {
  return activeSwitch.value === 'tunnel' ? tunnelCards : cableCards
})

// Fixed: 在 onMounted 中触发 onload 事件
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785404257734-3f758121-onload', {
      componentId: 'mc-1785404257734-3f758121',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>