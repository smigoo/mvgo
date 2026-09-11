<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-max-1787741281917-fb126318-c-monitor-root">
      <!-- 设备概览切换区：隧道设备 / 南北接线设备 -->
      <div class="c-mc-max-1787741281917-fb126318-c-monitor-overview-switch">
        <div
          v-for="item in overviewCards"
          :key="item.key"
          class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card"
          :class="{ 'is-active': activeOverview === item.key }"
          @click="handleOverviewChange(item.key)"
        >
          <div class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-icon">
            <img v-if="item.icon" :src="item.icon" alt="" class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-icon-img" />
          </div>
          <div class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-content">
            <div class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-title">{{ item.title }}</div>
            <div class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-lines">
              <div class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-line">
                <span class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-label">总数:</span>
                <span class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-value">{{ item.total }}</span>
              </div>
              <div class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-line">
                <span class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-label">异常数:</span>
                <span class="c-mc-max-1787741281917-fb126318-c-monitor-overview-card-value c-mc-max-1787741281917-fb126318-c-monitor-is-error">{{ item.abnormal }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 主体：左侧分类导航 + 右侧设备分类内容 -->
      <div class="c-mc-max-1787741281917-fb126318-c-monitor-body">
        <!-- 左侧竖向分类导航 -->
        <div class="c-mc-max-1787741281917-fb126318-c-monitor-sidebar" role="tablist" aria-label="设备类型分类">
          <div
            v-for="tab in categoryTabs"
            :key="tab.key"
            class="c-mc-max-1787741281917-fb126318-c-monitor-sidebar-item"
            :class="{ 'is-active': activeCategory === tab.key }"
            role="tab"
            :aria-selected="activeCategory === tab.key"
            @click="handleCategoryChange(tab.key)"
          >
            <span class="c-mc-max-1787741281917-fb126318-c-monitor-sidebar-item-label">{{ tab.label }}</span>
            <span class="c-mc-max-1787741281917-fb126318-c-monitor-sidebar-item-count">{{ tab.count }}</span>
          </div>
        </div>

        <!-- 右侧设备网格 -->
        <div class="c-mc-max-1787741281917-fb126318-c-monitor-content">
          <div class="c-mc-max-1787741281917-fb126318-c-monitor-grid">
            <div
              v-for="device in currentDeviceList"
              :key="device.name"
              class="c-mc-max-1787741281917-fb126318-c-monitor-device-card"
            >
              <div class="c-mc-max-1787741281917-fb126318-c-monitor-device-card-icon">
                <img v-if="device.iconVisible" :src="device.icon" alt="" class="c-mc-max-1787741281917-fb126318-c-monitor-device-card-icon-img" />
              </div>
              <div class="c-mc-max-1787741281917-fb126318-c-monitor-device-card-text">
                <span class="c-mc-max-1787741281917-fb126318-c-monitor-device-card-name">{{ device.name }}</span>
                <span class="c-mc-max-1787741281917-fb126318-c-monitor-device-card-value">{{ device.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon10 from '../resources/images/隧道_1-8804.png'
import icon16 from '../resources/images/extension-cord_1-8823.png'
import icon28 from '../resources/images/Frame-8465.png'
import icon29 from '../resources/images/icon-8473.png'
import icon41 from '../resources/images/Frame-8524.png'
import icon53 from '../resources/images/Frame-8553.png'
import icon65 from '../resources/images/Frame-8582.png'
import icon77 from '../resources/images/Frame-8611.png'
import icon89 from '../resources/images/Frame-8640.png'
import icon101 from '../resources/images/Frame-8669.png'
import icon113 from '../resources/images/Frame-8698.png'
import icon125 from '../resources/images/Frame-8727.png'
import icon137 from '../resources/images/Frame-8756.png'
import icon149 from '../resources/images/Frame-8785.png'


import { ref, computed, watch, onMounted, onUnmounted} from 'vue'

let mcContext = {}
try {
  mcContext = $mcComponentBuilder()
} catch (error) {
  console.error('微码组件初始化失败:', error)
}

const {
  componentProps = {},
  businessProps = {},
  runtimeBuilder = null,
  componentApi = null
} = mcContext

const activeOverview = ref('tunnel')
const activeCategory = ref('monitor')

const overviewCards = ref([
  {
    key: 'tunnel',
    title: '隧道设备',
    total: '56302',
    abnormal: '5',
    icon: icon10
  },
  {
    key: 'connection',
    title: '南北接线\n设备',
    total: '1280',
    abnormal: '3',
    icon: icon16
  }
])

const categoryTabs = ref([
  { key: 'monitor', label: '监控', count: '3/3740' },
  { key: 'lighting', label: '照明', count: '3' },
  { key: 'ventilation', label: '通风', count: '' },
  { key: 'fire', label: '消防', count: '' },
  { key: 'traffic', label: '交通诱导', count: '' },
  { key: 'power', label: '供配电', count: '' }
])

const deviceDataMap = {
  monitor: [
    { name: '摄像机', value: '(2/484)', icon: icon28, iconVisible: true },
    { name: '烟道机器人', value: '(0/484)', icon: icon29, iconVisible: true },
    { name: 'CO/VI检测器', value: '(0/484)', icon: icon41, iconVisible: true },
    { name: '光照度变送器', value: '(0/484)', icon: icon53, iconVisible: true },
    { name: '激光雷达', value: '(0/484)', icon: icon65, iconVisible: true },
    { name: '风速风向仪', value: '(1/484)', icon: icon77, iconVisible: true },
    { name: '温湿度传感器', value: '(0/484)', icon: icon89, iconVisible: true },
    { name: '紧急电话', value: '(0/484)', icon: icon101, iconVisible: true },
    { name: '超高检测器', value: '(0/484)', icon: icon113, iconVisible: true },
    { name: 'CO2传感器', value: '(0/484)', icon: icon125, iconVisible: true },
    { name: '压力传感器', value: '(0/484)', icon: icon137, iconVisible: true },
    { name: '水质监测设备', value: '(0/484)', icon: icon149, iconVisible: true }
  ],
  lighting: [
    { name: '摄像机', value: '(2/484)', icon: icon28, iconVisible: true },
    { name: '烟道机器人', value: '(0/484)', icon: icon29, iconVisible: true },
    { name: '光照度变送器', value: '(0/484)', icon: icon53, iconVisible: true }
  ],
  ventilation: [],
  fire: [],
  traffic: [],
  power: []
}

const currentDeviceList = computed(() => deviceDataMap[activeCategory.value] || [])

const handleOverviewChange = (key) => {
  if (activeOverview.value === key) return
  activeOverview.value = key
}

const handleCategoryChange = (key) => {
  if (activeCategory.value === key) return
  activeCategory.value = key
}

watch(activeOverview, (key) => {
  runtimeBuilder?.publishEvent?.('monitor-overview-change', {
    overviewKey: key,
    timestamp: Date.now()
  })
})

watch(activeCategory, (key) => {
  runtimeBuilder?.publishEvent?.('monitor-category-change', {
    categoryKey: key,
    timestamp: Date.now()
  })
})

onMounted(() => {
  runtimeBuilder?.publishEvent?.('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>