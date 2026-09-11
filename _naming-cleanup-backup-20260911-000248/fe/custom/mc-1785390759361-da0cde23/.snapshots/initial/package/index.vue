<template>
  <base-panel panelKey="default-panel">
    <!-- Fixed: 问题17 - 使用 base-panel 插槽替代独立 header div -->
    <template #title-left>
      <img :src="icon1" class="c-mc-1785390759361-da0cde23-title-icon" alt="装饰图标" />
    </template>
    <template #header-right>
      <img :src="icon2" class="c-mc-1785390759361-da0cde23-header-action" alt="操作图标" />
    </template>

    <div class="c-mc-1785390759361-da0cde23-content">
      <!-- 顶部统计栏 -->
      <!-- Fixed: 问题9 - 使用 bg1 作为背景图 -->
      <div 
        class="c-mc-1785390759361-da0cde23-header-stats" 
        :style="{ 
          backgroundImage: `url(${bg1})`, 
          backgroundSize: 'cover', 
          backgroundPosition: 'center', 
          backgroundRepeat: 'no-repeat' 
        }"
      >
        <div 
          v-for="stat in stats" 
          :key="stat.label" 
          class="c-mc-1785390759361-da0cde23-stat-item"
        >
          <!-- Fixed: 问题7, 8 - 添加 stat-row 容器包裹 label，实现 row 布局 -->
          <div class="c-mc-1785390759361-da0cde23-stat-row">
            <span class="c-mc-1785390759361-da0cde23-stat-label">{{ stat.label }}</span>
          </div>
          <span :class="['c-mc-1785390759361-da0cde23-stat-value', stat.colorClass]">
            {{ stat.value }}
          </span>
        </div>
      </div>

      <!-- 设备大类切换 -->
      <!-- Fixed: 问题6 - 添加 ARIA 属性提升可访问性 -->
      <div class="c-mc-1785390759361-da0cde23-category-switch" role="tablist">
        <div 
          v-for="card in categoryCards" 
          :key="card.id"
          :class="['c-mc-1785390759361-da0cde23-category-card', { 'is-active': activeCategory === card.id }]"
          :style="{ 
            backgroundImage: `url(${card.bg})`, 
            backgroundSize: '100% 100%', 
            backgroundPosition: 'center', 
            backgroundRepeat: 'no-repeat' 
          }"
          role="tab"
          :aria-selected="activeCategory === card.id"
          @click="activeCategory = card.id"
        >
          <img :src="card.icon" class="c-mc-1785390759361-da0cde23-card-icon" />
          <div class="c-mc-1785390759361-da0cde23-card-content">
            <div class="c-mc-1785390759361-da0cde23-card-row">
              <span class="c-mc-1785390759361-da0cde23-card-label">总 数:</span>
              <span class="c-mc-1785390759361-da0cde23-card-value">{{ card.total }}</span>
            </div>
            <div class="c-mc-1785390759361-da0cde23-card-row">
              <span :class="['c-mc-1785390759361-da0cde23-card-name', { 'is-active': activeCategory === card.id }]">
                {{ card.name }}
              </span>
              <span class="c-mc-1785390759361-da0cde23-card-label">异常数:</span>
              <span class="c-mc-1785390759361-da0cde23-card-abnormal">{{ card.abnormal }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 分类导航与设备列表 -->
      <div class="c-mc-1785390759361-da0cde23-nav-and-grid">
        <!-- 左侧导航 -->
        <!-- Fixed: 问题6 - 添加 ARIA 属性 -->
        <div class="c-mc-1785390759361-da0cde23-sidebar-tabs" role="tablist">
          <div 
            v-for="tab in sidebarTabs" 
            :key="tab.name"
            :class="['c-mc-1785390759361-da0cde23-tab-item', { 'is-active': activeTab === tab.name }]"
            role="tab"
            :aria-selected="activeTab === tab.name"
            @click="activeTab = tab.name"
          >
            <span class="c-mc-1785390759361-da0cde23-tab-name">{{ tab.name }}</span>
            <span v-if="tab.badge" class="c-mc-1785390759361-da0cde23-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备网格 -->
        <div class="c-mc-1785390759361-da0cde23-device-grid">
          <div 
            v-for="device in deviceList" 
            :key="device.name"
            class="c-mc-1785390759361-da0cde23-device-item"
            :style="{ 
              backgroundImage: `url(${device.bg})`, 
              backgroundSize: '100% 100%', 
              backgroundPosition: 'center', 
              backgroundRepeat: 'no-repeat' 
            }"
          >
            <img :src="device.icon" class="c-mc-1785390759361-da0cde23-device-icon" />
            <div class="c-mc-1785390759361-da0cde23-device-info">
              <span class="c-mc-1785390759361-da0cde23-device-name">{{ device.name }}</span>
              <div class="c-mc-1785390759361-da0cde23-device-stats">
                <span :class="['c-mc-1785390759361-da0cde23-device-abnormal', { 'is-zero': device.abnormal === 0 }]">
                  {{ device.abnormal }}
                </span>
                <span class="c-mc-1785390759361-da0cde23-device-total">/ {{ device.total }}</span>
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
import bg2 from '../resources/images/bg-8807.png'
import icon5 from '../resources/images/icon-8444.png'
import icon6 from '../resources/images/icon-8473.png'
import bg3 from '../resources/images/bg-8439.png'
import bg8 from '../resources/images/bg-8614.png'
import icon7 from '../resources/images/icon-8503.png'
import icon8 from '../resources/images/icon-8532.png'
import bg4 from '../resources/images/bg-8468.png'
import icon9 from '../resources/images/icon-8561.png'
import bg5 from '../resources/images/bg-8498.png'
import icon10 from '../resources/images/icon-8764.png'
import bg6 from '../resources/images/bg-8527.png'
import icon3 from '../resources/images/icon-8798.png'
import bg7 from '../resources/images/bg-8556.png'
import icon4 from '../resources/images/icon-8817.png'

import { ref, onMounted, onUnmounted, computed } from 'vue'

// Fixed: 问题2 - 补充 $mcComponentBuilder 调用和 onload 事件
let runtimeBuilder = null
let businessProps = null
let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi
} catch (e) {
  console.warn('[设备监测] $mcComponentBuilder 失败:', e)
}

// 配置读取
const getConfig = (key, defaultValue) => {
  const value = businessProps?.[key]
  if (value !== undefined && value !== null) return value
  return defaultValue
}

const sectionNum = computed(() => getConfig('sectionNum', 'S23-JY'))
const pollInterval = computed(() => getConfig('pollInterval', 60000))

// 状态
const activeCategory = ref('tunnel')
const activeTab = ref('监控')

// 顶部统计数据
const stats = ref([
  { label: '设备类型', value: '28', colorClass: 'is-primary' },
  { label: '设备总数', value: '68562', colorClass: 'is-primary' },
  { label: '完好率', value: '98%', colorClass: 'is-secondary' }
])

// 设备大类卡片
// Fixed: 问题9, 10 - 使用 bg1, bg2 作为卡片背景图
const categoryCards = ref([
  { 
    id: 'tunnel', 
    name: '隧道设备', 
    total: '56302', 
    abnormal: 5, 
    icon: icon5, 
    bg: bg1 
  },
  { 
    id: 'north-south', 
    name: '南北接线设备', 
    total: '1280', 
    abnormal: 3, 
    icon: icon6, 
    bg: bg2 
  }
])

// 左侧导航
const sidebarTabs = ref([
  { name: '监控', badge: '3/3740' },
  { name: '照明', badge: '3' },
  { name: '通风' },
  { name: '供配电' },
  { name: '消防' },
  { name: '交通诱导' }
])

// 设备网格数据
// Fixed: 问题11-16 - 使用 bg3~bg8 作为设备项背景图
const deviceList = ref([
  { name: '摄像机', icon: icon7, abnormal: 2, total: 484, bg: bg3 },
  { name: '风速风向仪', icon: icon8, abnormal: 1, total: 484, bg: bg4 },
  { name: '超高检测器', icon: icon9, abnormal: 0, total: 484, bg: bg5 },
  { name: '烟道机器人', icon: icon10, abnormal: 0, total: 484, bg: bg6 },
  { name: '激光雷达', icon: icon3, abnormal: 0, total: 484, bg: bg7 },
  { name: 'CO₂传感器', icon: icon4, abnormal: 0, total: 484, bg: bg8 },
  { name: 'CO/VI检测器', icon: icon5, abnormal: 0, total: 484, bg: bg3 },
  { name: '温湿度传感器', icon: icon6, abnormal: 0, total: 484, bg: bg4 },
  { name: '压力传感器', icon: icon7, abnormal: 0, total: 484, bg: bg5 },
  { name: '光照度变送器', icon: icon8, abnormal: 0, total: 484, bg: bg6 },
  { name: '紧急电话', icon: icon9, abnormal: 0, total: 484, bg: bg7 },
  { name: '水质监测设备', icon: icon10, abnormal: 0, total: 484, bg: bg8 }
])

// 数据加载
const fetchData = async () => {
  if (!componentApi) return
  try {
    const res = await componentApi.getCommonApiFindOne({ sectionNum: sectionNum.value }, 'deviceOverview')
    if (res) {
      runtimeBuilder?.publishEvent('data-loaded', {
        sectionNum: sectionNum.value,
        total: res.total,
        online: res.online,
        abnormal: res.abnormal,
        onlineRate: res.onlineRate
      })
    }
  } catch (e) {
    console.error('获取设备数据失败:', e)
  }
}

// 轮询
let refreshTimer = null

onMounted(() => {
  // Fixed: 问题2 - 触发 onload 事件
  runtimeBuilder?.publishEvent('mc-1785390759361-da0cde23-onload', {
    componentId: 'mc-1785390759361-da0cde23',
    timestamp: Date.now(),
    sectionNum: sectionNum.value
  })

  fetchData()
  refreshTimer = setInterval(fetchData, pollInterval.value)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>