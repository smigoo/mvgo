<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <span class="c-mc-max-1787741623771-d254971f-c-monitor-title-dot">
        <img :src="icon1" alt="" class="c-mc-max-1787741623771-d254971f-c-monitor-title-dot-outer" />
        <img :src="icon2" alt="" class="c-mc-max-1787741623771-d254971f-c-monitor-title-dot-inner" />
        <img :src="icon3" alt="" class="c-mc-max-1787741623771-d254971f-c-monitor-title-dot-core" />
      </span>
    </template>

    

    <div class="c-mc-max-1787741623771-d254971f-c-monitor-root">
      <section class="c-mc-max-1787741623771-d254971f-c-monitor-overview-section">
        <div class="c-mc-max-1787741623771-d254971f-c-monitor-overview-list">
          <button
            v-for="card in overviewCards"
            :key="card.key"
            type="button"
            :class="[
              'c-monitor-overview-card',
              { 'c-c-monitor-overview-card--active': activeOverview === card.key }
            ]"
            @click="handleOverviewChange(card.key)"
          >
            <span
              class="c-mc-max-1787741623771-d254971f-c-monitor-overview-bg"
              :style="{ backgroundImage: `url(${card.bg})` }"
              aria-hidden="true"
            ></span>
            <span class="c-mc-max-1787741623771-d254971f-c-monitor-overview-icon">
              <img
                v-for="part in card.decorations"
                :key="part.className"
                :src="part.src"
                alt=""
                :class="['c-monitor-overview-icon-part', part.className]"
              />
              <img :src="card.icon" alt="" class="c-mc-max-1787741623771-d254971f-c-monitor-overview-icon-main" />
            </span>
            <span class="c-mc-max-1787741623771-d254971f-c-monitor-overview-text">
              <span class="c-mc-max-1787741623771-d254971f-c-monitor-overview-name">{{ card.name }}</span>
              <span class="c-mc-max-1787741623771-d254971f-c-monitor-overview-line">
                <span class="c-mc-max-1787741623771-d254971f-c-monitor-overview-label">总数:</span>
                <span class="c-mc-max-1787741623771-d254971f-c-monitor-overview-number">{{ card.total }}</span>
              </span>
              <span class="c-mc-max-1787741623771-d254971f-c-monitor-overview-line">
                <span class="c-mc-max-1787741623771-d254971f-c-monitor-overview-label">异常数:</span>
                <span class="c-mc-max-1787741623771-d254971f-c-monitor-overview-number c-c-monitor-overview-number--danger">
                  {{ card.abnormal }}
                </span>
              </span>
            </span>
          </button>
        </div>
      </section>

      <section class="c-mc-max-1787741623771-d254971f-c-monitor-category-section">
        <a-tabs
          v-model:activeKey="activeCategory"
          tab-position="left"
          class="c-mc-max-1787741623771-d254971f-c-monitor-category-tabs"
          @change="handleCategoryChange"
        >
          <a-tab-pane v-for="tab in categoryTabs" :key="tab.key">
            

            <div class="c-mc-max-1787741623771-d254971f-c-monitor-device-grid">
              <article
                v-for="device in visibleDevices"
                :key="device.key"
                class="c-mc-max-1787741623771-d254971f-c-monitor-device-card"
              >
                <span
                  class="c-mc-max-1787741623771-d254971f-c-monitor-device-bg"
                  :style="{ backgroundImage: `url(${device.bg})` }"
                  aria-hidden="true"
                ></span>
                <div class="c-mc-max-1787741623771-d254971f-c-monitor-device-text">
                  <span class="c-mc-max-1787741623771-d254971f-c-monitor-device-name">{{ device.name }}</span>
                  <span class="c-mc-max-1787741623771-d254971f-c-monitor-device-value">{{ device.value }}</span>
                </div>
                <span class="c-mc-max-1787741623771-d254971f-c-monitor-device-icon">
                  <img
                    v-for="part in device.decorations"
                    :key="part.className"
                    :src="part.src"
                    alt=""
                    :class="['c-monitor-device-icon-part', part.className]"
                  />
                  <img :src="device.icon" alt="" class="c-mc-max-1787741623771-d254971f-c-monitor-device-icon-main" />
                </span>
              </article>
            </div>
          </a-tab-pane>
        </a-tabs>
      </section>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/circle-8422.png'
import icon2 from '../resources/images/circle-8423.png'
import icon3 from '../resources/images/path-8424.png'
import icon4 from '../resources/images/Frame-8856.png'


import { ref, onMounted, computed} from 'vue'

// 1. 调用 $mcComponentBuilder 并解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 概览卡片数据 ===
const overviewCards = ref([
  {
    key: 'tunnel',
    name: '隧道设备',
    total: '56302',
    abnormal: '5',
    bg: '',
    icon: '',
    decorations: []
  },
  {
    key: 'cable',
    name: '南北接线 / 设备',
    total: '1280',
    abnormal: '3',
    bg: '',
    icon: '',
    decorations: []
  }
])

const activeOverview = ref('tunnel')

const handleOverviewChange = (key) => {
  activeOverview.value = key
}
// === 分类 Tabs 数据 ===
const categoryTabs = ref([
  { key: 'monitor', label: '监控', count: '3/3740' },
  { key: 'lighting', label: '照明', count: '' },
  { key: 'ventilation', label: '通风', count: '' },
  { key: 'fire', label: '消防', count: '' },
  { key: 'traffic', label: '交通诱导', count: '' },
  { key: 'power', label: '供配电', count: '' }
])

const activeCategory = ref('monitor')
// === 设备列表数据 ===
const allDevices = {
  monitor: [
    { key: 'camera', name: '摄像机', value: '(2/484)', bg: '', icon: '', decorations: [] },
    { key: 'robot', name: '烟道机器人', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'co_vi', name: 'CO/VI检测器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'light', name: '光照度变送器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'radar', name: '激光雷达', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'wind', name: '风速风向仪', value: '(1/484)', bg: '', icon: '', decorations: [] },
    { key: 'temp', name: '温湿度传感器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'phone', name: '紧急电话', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'height', name: '超高检测器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'co2', name: 'CO2传感器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'pressure', name: '压力传感器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'water', name: '水质监测设备', value: '(0/484)', bg: '', icon: '', decorations: [] }
  ],
  lighting: [],
  ventilation: [],
  fire: [],
  traffic: [],
  power: []
}

const visibleDevices = computed(() => {
  return allDevices[activeCategory.value] || []
})

const handleCategoryChange = (key) => {
  activeCategory.value = key
}
// === 生命周期 ===
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>