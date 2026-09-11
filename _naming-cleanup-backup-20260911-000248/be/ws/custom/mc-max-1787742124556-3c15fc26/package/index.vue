<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <div class="c-mc-max-1787742124556-3c15fc26-c-monitor-title-left">
        <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-title-dot">
          <img :src="icon1" alt="" class="c-mc-max-1787742124556-3c15fc26-c-monitor-title-dot-outer" />
          <img :src="icon2" alt="" class="c-mc-max-1787742124556-3c15fc26-c-monitor-title-dot-inner" />
          <img :src="icon3" alt="" class="c-mc-max-1787742124556-3c15fc26-c-monitor-title-dot-core" />
        </span>
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->
      </div>
    </template>

    

    <div class="c-mc-max-1787742124556-3c15fc26-c-monitor-root">
      <section class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-section">
        <div class="c-mc-max-1787742124556-3c15fc26-c-monitor-section-title">设备概览</div>
        <div class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-body">
          <button
            v-for="item in overviewCards"
            :key="item.key"
            type="button"
            :class="[
              'c-monitor-overview-card',
              { 'c-c-monitor-overview-card--active': activeOverviewKey === item.key }
            ]"
            @click="handleOverviewChange(item.key)"
          >
            <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-card-name">{{ item.label }}</span>
            <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-icon" aria-hidden="true">
              <img
                v-for="part in item.iconParts"
                :key="part.key"
                :src="part.src"
                alt=""
                :class="['c-monitor-overview-icon-part', part.className]"
              />
            </span>
            <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-line">
              <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-label">总数:</span>
              <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-value">{{ item.total }}</span>
            </span>
            <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-line">
              <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-label">异常数:</span>
              <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-overview-danger">{{ item.error }}</span>
            </span>
          </button>
        </div>
      </section>

      <section class="c-mc-max-1787742124556-3c15fc26-c-monitor-category-section">
        <div class="c-mc-max-1787742124556-3c15fc26-c-monitor-section-title">设备类型分类</div>
        <div class="c-mc-max-1787742124556-3c15fc26-c-monitor-category-body">
          <a-tabs
            v-model:activeKey="activeCategoryKey"
            tab-position="left"
            class="c-mc-max-1787742124556-3c15fc26-c-monitor-category-tabs"
            @change="handleCategoryChange"
          >
            <a-tab-pane
              v-for="tab in categoryTabs"
              :key="tab.key"
              :tab="tab.label"
            >
              <div class="c-mc-max-1787742124556-3c15fc26-c-monitor-device-grid">
                <div
                  v-for="device in currentDeviceCards"
                  :key="device.key"
                  class="c-mc-max-1787742124556-3c15fc26-c-monitor-device-card"
                >
                  <div class="c-mc-max-1787742124556-3c15fc26-c-monitor-device-text">
                    <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-device-name">{{ device.name }}</span>
                    <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-device-value">{{ device.value }}</span>
                  </div>
                  <span class="c-mc-max-1787742124556-3c15fc26-c-monitor-device-icon" aria-hidden="true">
                    <img
                      v-if="device.icon"
                      :src="device.icon"
                      alt=""
                      class="c-mc-max-1787742124556-3c15fc26-c-monitor-device-icon-img"
                    />
                    <span v-else class="c-mc-max-1787742124556-3c15fc26-c-monitor-device-icon-css"></span>
                  </span>
                </div>
              </div>
            </a-tab-pane>
          </a-tabs>
        </div>
      </section>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/circle-8422.png'
import icon2 from '../resources/images/circle-8423.png'
import icon3 from '../resources/images/path-8424.png'
import icon4 from '../resources/images/Frame-8856.png'
import icon5 from '../resources/images/椭圆_6_拷贝-8799.png'
import icon6 from '../resources/images/椭圆_8-8800.png'
import icon7 from '../resources/images/椭圆_6_拷贝_2-8801.png'
import icon8 from '../resources/images/椭圆_8-8800.png'
import icon9 from '../resources/images/椭圆_6-8803.png'
import icon10 from '../resources/images/隧道_1-8804.png'
import icon11 from '../resources/images/椭圆_6_拷贝-8818.png'
import icon12 from '../resources/images/椭圆_8-8819.png'
import icon13 from '../resources/images/椭圆_6_拷贝_2-8820.png'
import icon14 from '../resources/images/椭圆_8-8819.png'
import icon15 from '../resources/images/椭圆_6-8822.png'
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


import { computed, onMounted, onUnmounted, ref, watch} from 'vue'

let mcBuilderResult = {}
try {
  mcBuilderResult = $mcComponentBuilder()
} catch (error) {
  console.error('微码组件初始化失败:', error)
}

const { componentProps, businessProps, runtimeBuilder, componentApi } = mcBuilderResult

const activeOverviewKey = ref('tunnel')
const activeCategoryKey = ref('monitor')

const overviewCards = ref([
  {
    key: 'tunnel',
    label: '隧道设备',
    total: '56302',
    error: '5',
    iconParts: [
      { key: 'active-left-arc', src: icon5, className: 'c-c-monitor-overview-icon-part--left-arc' },
      { key: 'active-left-dot', src: icon6, className: 'c-c-monitor-overview-icon-part--left-dot' },
      { key: 'active-right-arc', src: icon7, className: 'c-c-monitor-overview-icon-part--right-arc' },
      { key: 'active-right-dot', src: icon8, className: 'c-c-monitor-overview-icon-part--right-dot' },
      { key: 'active-circle', src: icon9, className: 'c-c-monitor-overview-icon-part--circle' },
      { key: 'active-symbol', src: icon10, className: 'c-c-monitor-overview-icon-part--symbol' }
    ]
  },
  {
    key: 'connector',
    label: '南北接线\n设备',
    total: '1280',
    error: '3',
    iconParts: [
      { key: 'default-left-arc', src: icon11, className: 'c-c-monitor-overview-icon-part--left-arc' },
      { key: 'default-left-dot', src: icon12, className: 'c-c-monitor-overview-icon-part--left-dot' },
      { key: 'default-right-arc', src: icon13, className: 'c-c-monitor-overview-icon-part--right-arc' },
      { key: 'default-right-dot', src: icon14, className: 'c-c-monitor-overview-icon-part--right-dot' },
      { key: 'default-circle', src: icon15, className: 'c-c-monitor-overview-icon-part--circle' },
      { key: 'default-symbol', src: icon16, className: 'c-c-monitor-overview-icon-part--symbol' }
    ]
  }
])

const categoryTabs = ref([
  { key: 'monitor', label: '监控\n3/3740' },
  { key: 'lighting', label: '照明\n3' },
  { key: 'ventilation', label: '通风' },
  { key: 'fire', label: '消防' },
  { key: 'traffic-guide', label: '交通诱导' },
  { key: 'power', label: '供配电' }
])

const deviceDataMap = {
  monitor: [
    { key: 'camera', name: '摄像机', value: '(2/484)', icon: icon28 },
    { key: 'robot', name: '烟道机器人', value: '(0/484)', icon: icon29 },
    { key: 'co-vi', name: 'CO/VI检测器', value: '(0/484)', icon: icon41 },
    { key: 'light', name: '光照度变送器', value: '(0/484)', icon: icon53 },
    { key: 'laser', name: '激光雷达', value: '(0/484)', icon: icon65 },
    { key: 'wind', name: '风速风向仪', value: '(1/484)', icon: icon77 },
    { key: 'temperature', name: '温湿度传感器', value: '(0/484)', icon: icon89 },
    { key: 'phone', name: '紧急电话', value: '(0/484)', icon: icon101 },
    { key: 'height', name: '超高检测器', value: '(0/484)', icon: icon113 },
    { key: 'co2', name: 'CO2传感器', value: '(0/484)', icon: icon125 },
    { key: 'pressure', name: '压力传感器', value: '(0/484)', icon: icon137 },
    { key: 'water', name: '水质监测设备', value: '(0/484)', icon: icon149 }
  ],
  lighting: [
    { key: 'camera', name: '摄像机', value: '(2/484)', icon: icon28 },
    { key: 'light', name: '光照度变送器', value: '(0/484)', icon: icon53 },
    { key: 'power', name: '供配电', value: '(1/484)', icon: icon16 }
  ],
  ventilation: [
    { key: 'wind', name: '风速风向仪', value: '(1/484)', icon: icon77 },
    { key: 'co-vi', name: 'CO/VI检测器', value: '(0/484)', icon: icon41 },
    { key: 'co2', name: 'CO2传感器', value: '(0/484)', icon: icon125 }
  ],
  fire: [
    { key: 'phone', name: '紧急电话', value: '(0/484)', icon: icon101 },
    { key: 'pressure', name: '压力传感器', value: '(0/484)', icon: icon137 },
    { key: 'water', name: '水质监测设备', value: '(0/484)', icon: icon149 }
  ],
  'traffic-guide': [
    { key: 'camera', name: '摄像机', value: '(2/484)', icon: icon28 },
    { key: 'laser', name: '激光雷达', value: '(0/484)', icon: icon65 },
    { key: 'height', name: '超高检测器', value: '(0/484)', icon: icon113 }
  ],
  power: [
    { key: 'power', name: '供配电', value: '(0/484)', icon: icon16 },
    { key: 'temperature', name: '温湿度传感器', value: '(0/484)', icon: icon89 },
    { key: 'pressure', name: '压力传感器', value: '(0/484)', icon: icon137 }
  ]
}

const currentDeviceCards = computed(() => deviceDataMap[activeCategoryKey.value] || deviceDataMap.monitor)

const handleOverviewChange = (key) => {
  activeOverviewKey.value = key
}

const handleCategoryChange = (key) => {
  activeCategoryKey.value = key
}

const publishChangeEvent = (eventId, payload) => {
  if (!runtimeBuilder?.publishEvent) return
  runtimeBuilder.publishEvent(eventId, payload)
}

watch(activeOverviewKey, (key) => {
  publishChangeEvent('monitor-overview-change', {
    componentId: 'monitor',
    activeKey: key,
    timestamp: Date.now()
  })
})

watch(activeCategoryKey, (key) => {
  publishChangeEvent('monitor-category-change', {
    componentId: 'monitor',
    activeKey: key,
    timestamp: Date.now()
  })
})

let refreshTimer = null

onMounted(() => {
  if (runtimeBuilder?.publishEvent) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }

  refreshTimer = window.setInterval(() => {
    publishChangeEvent('monitor-refresh', {
      componentId: 'monitor',
      activeOverviewKey: activeOverviewKey.value,
      activeCategoryKey: activeCategoryKey.value,
      timestamp: Date.now()
    })
  }, 60000)
})

onUnmounted(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>