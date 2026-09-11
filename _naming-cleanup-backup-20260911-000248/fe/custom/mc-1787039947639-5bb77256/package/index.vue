<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <!-- 顶部区域：标题与指标 -->
      <div
        class="c-device-monitor-header"
        :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-device-monitor-header-title">设备监测</div>
        <div class="c-device-monitor-stats">
          <div class="c-device-monitor-stat-item">
            <img :src="icon1" class="c-device-monitor-stat-icon" alt="" />
            <div class="c-device-monitor-stat-text">
              <span class="c-device-monitor-stat-label">设备总数</span>
              <span class="c-device-monitor-stat-value">128</span>
            </div>
          </div>
          <div class="c-device-monitor-stat-item">
            <img :src="icon2" class="c-device-monitor-stat-icon" alt="" />
            <div class="c-device-monitor-stat-text">
              <span class="c-device-monitor-stat-label">在线设备</span>
              <span class="c-device-monitor-stat-value">125</span>
            </div>
          </div>
          <div class="c-device-monitor-stat-item">
            <img :src="icon3" class="c-device-monitor-stat-icon" alt="" />
            <div class="c-device-monitor-stat-text">
              <span class="c-device-monitor-stat-label">离线设备</span>
              <span class="c-device-monitor-stat-value">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 大类设备统计 -->
      <div class="c-device-monitor-categories">
        <div
          class="c-device-monitor-category-card"
          :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon4" class="c-device-monitor-category-icon" alt="" />
          <div class="c-device-monitor-category-content">
            <span class="c-device-monitor-category-title">隧道设备</span>
            <span class="c-device-monitor-category-value">64 <small>台</small></span>
          </div>
        </div>
        <div
          class="c-device-monitor-category-card"
          :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
        >
          <img :src="icon5" class="c-device-monitor-category-icon" alt="" />
          <div class="c-device-monitor-category-content">
            <span class="c-device-monitor-category-title">南北接线设备</span>
            <span class="c-device-monitor-category-value">64 <small>台</small></span>
          </div>
        </div>
      </div>

      <!-- 分类导航与设备列表 -->
      <div
        class="c-device-monitor-body"
        :style="{ backgroundImage: `url(${bg5})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"
      >
        <div class="c-device-monitor-nav">
          <div
            v-for="tab in navTabs"
            :key="tab.key"
            :class="['c-device-monitor-nav-tab', { active: activeNavTab === tab.key }]"
            @click="activeNavTab = tab.key"
          >
            {{ tab.label }}
          </div>
        </div>
        <div class="c-device-monitor-grid">
          <div
            v-for="device in filteredDeviceList"
            :key="device.id"
            class="c-device-monitor-grid-item"
          >
            <img :src="device.icon" class="c-device-monitor-grid-icon" alt="" />
            <div class="c-device-monitor-grid-info">
              <span class="c-device-monitor-grid-name">{{ device.name }}</span>
              <span
                class="c-device-monitor-grid-status"
                :class="{ offline: device.status === '离线' }"
              >
                {{ device.status }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg2 from '../resources/images/bg-8788.png'
import icon1 from '../resources/images/g-8421.png'
import icon2 from '../resources/images/Frame-8856.png'
import icon3 from '../resources/images/icon-8798.png'
import bg3 from '../resources/images/bg-8807.png'
import icon4 from '../resources/images/icon-8817.png'
import bg4 from '../resources/images/bg-8831.png'
import icon5 from '../resources/images/icon-8444.png'
import bg5 from '../resources/images/bg-8831.png'


// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[c-device-monitor] $mcComponentBuilder 失败:', e)
}

// --- 导航与设备数据 ---
const navTabs = ref([
  { key: 'all', label: '全部' },
  { key: 'tunnel', label: '隧道设备' },
  { key: 'nanbei', label: '南北接线设备' }
])

const activeNavTab = ref('all')

const deviceList = ref([
  { id: 1, name: '高清摄像机', status: '在线', icon: icon1, category: 'tunnel' },
  { id: 2, name: '射流风机', status: '在线', icon: icon2, category: 'tunnel' },
  { id: 3, name: 'CO检测器', status: '离线', icon: icon3, category: 'tunnel' },
  { id: 4, name: '紧急电话', status: '在线', icon: icon4, category: 'nanbei' },
  { id: 5, name: '光纤收发器', status: '在线', icon: icon5, category: 'nanbei' },
  { id: 6, name: 'PLC控制柜', status: '离线', icon: icon1, category: 'nanbei' }
])

const filteredDeviceList = computed(() => {
  if (activeNavTab.value === 'all') {
    return deviceList.value
  }
  return deviceList.value.filter(device => device.category === activeNavTab.value)
})

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('c-device-monitor-onload', {
      componentId: 'c-device-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理逻辑
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>