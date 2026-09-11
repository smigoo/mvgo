<template>
  <base-panel panelKey="default-panel">
    <div class="c-9ffada-content">
      <!-- 顶部 Switch 切换区 -->
      <div class="c-9ffada-switch">
        <div
          v-for="(item, index) in switchData"
          :key="index"
          :class="['c-9ffada-switch-item', { 'c-9ffada-switch-item--active': activeSwitch === index }]"
          @click="activeSwitch = index"
        >
          <div
            class="c-9ffada-switch-bg"
            :style="{ backgroundImage: `url(${item.bg})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="item.icon" class="c-9ffada-switch-icon" />
            <div class="c-9ffada-switch-text">
              <div class="c-9ffada-switch-title">{{ item.title }}</div>
              <div class="c-9ffada-switch-line">
                <span class="c-9ffada-switch-label">总数:</span>
                <span class="c-9ffada-switch-value">{{ item.total }}</span>
              </div>
              <div class="c-9ffada-switch-line">
                <span class="c-9ffada-switch-label">异常数:</span>
                <span class="c-9ffada-switch-value c-9ffada-switch-value--error">{{ item.error }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部内容区 -->
      <div class="c-9ffada-bottom">
        <!-- 左侧 Tabs -->
        <div class="c-9ffada-tabs">
          <div
            v-for="(tab, index) in tabsData"
            :key="index"
            :class="['c-9ffada-tab-item', { 'c-9ffada-tab-item--active': activeTab === index }]"
            @click="activeTab = index"
          >
            <div
              class="c-9ffada-tab-bg"
              :style="{ backgroundImage: `url(${tab.bg})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
            >
              <span class="c-9ffada-tab-text">{{ tab.name }}</span>
              <!-- [Layout Refine] Render tab badge if exists -->
              <span v-if="tab.badge" :class="['c-9ffada-tab-badge', { 'c-9ffada-tab-badge--error': tab.badgeType === 'error' }]">{{ tab.badge }}</span>
            </div>
          </div>
        </div>

        <!-- 右侧设备卡片网格 -->
        <div class="c-9ffada-cards">
          <div
            v-for="(card, index) in cardsData"
            :key="index"
            class="c-9ffada-card-item"
          >
            <div
              class="c-9ffada-card-bg"
              :style="{ backgroundImage: `url(${card.bg})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
            >
              <img :src="card.icon" class="c-9ffada-card-icon" />
              <div class="c-9ffada-card-text">
                <div class="c-9ffada-card-name">{{ card.name }}</div>
                <div class="c-9ffada-card-status">{{ card.status }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-8418.png'
import icon3 from '../resources/images/icon-8798.png'
import bg2 from '../resources/images/bg-8788.png'
import icon4 from '../resources/images/icon-8817.png'
import bg3 from '../resources/images/bg-8807.png'
import bg4 from '../resources/images/bg-8831.png'
import bg5 from '../resources/images/bg-8831.png'
import bg6 from '../resources/images/bg-8831.png'
import bg7 from '../resources/images/bg-8847.png'
import bg8 from '../resources/images/bg-8852.png'
import icon5 from '../resources/images/icon-8444.png'
import bg9 from '../resources/images/bg-8468.png'
import icon6 from '../resources/images/icon-8473.png'
import bg10 from '../resources/images/bg-8498.png'
import icon7 from '../resources/images/icon-8503.png'
import bg11 from '../resources/images/bg-8527.png'
import icon8 from '../resources/images/icon-8532.png'
import bg12 from '../resources/images/bg-8556.png'
import icon9 from '../resources/images/icon-8561.png'
import bg13 from '../resources/images/bg-8585.png'
import icon10 from '../resources/images/icon-8590.png'
import bg14 from '../resources/images/bg-8614.png'
import icon11 from '../resources/images/icon-8619.png'
import bg15 from '../resources/images/bg-8643.png'
import icon12 from '../resources/images/icon-8648.png'
import bg16 from '../resources/images/bg-8672.png'
import icon13 from '../resources/images/icon-8677.png'
import bg17 from '../resources/images/bg-8701.png'
import icon14 from '../resources/images/icon-8706.png'
import bg18 from '../resources/images/bg-8730.png'
import icon15 from '../resources/images/icon-8735.png'
import icon16 from '../resources/images/icon-8764.png'


import { ref, onMounted, onUnmounted} from 'vue'

// --- $mcComponentBuilder 初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

// --- 响应式状态 ---
const activeSwitch = ref(0)
const activeTab = ref(0)

// --- 数据定义 ---
const switchData = [
  { title: '隧道设备', total: 56302, error: 5, bg: bg1, icon: icon3 },
  { title: '南北接线 设备', total: 1280, error: 3, bg: bg2, icon: icon4 }
]

/* [Layout Refine] Add badge data to match Figma tab badges */
const tabsData = [
  { name: '监控', bg: bg3, badge: '3/3740', badgeType: 'default' },
  { name: '照明', bg: bg4, badge: '3', badgeType: 'error' },
  { name: '通风', bg: bg5 },
  { name: '消防', bg: bg5 },
  { name: '交通诱导', bg: bg6 },
  { name: '供配电', bg: bg7 }
]

const cardsData = [
  { name: '摄像机', status: '(2/484)', bg: bg8, icon: icon5 },
  { name: '烟道机器人', status: '(0/484)', bg: bg9, icon: icon6 },
  { name: 'CO/VI检测器', status: '(0/484)', bg: bg10, icon: icon7 },
  { name: '光照度变送器', status: '(0/484)', bg: bg11, icon: icon8 },
  { name: '激光雷达', status: '(0/484)', bg: bg12, icon: icon9 },
  { name: '风速风向仪', status: '(1/484)', bg: bg13, icon: icon10 },
  { name: '温湿度传感器', status: '(0/484)', bg: bg14, icon: icon11 },
  { name: '紧急电话', status: '(0/484)', bg: bg15, icon: icon12 },
  { name: '超高检测器', status: '(0/484)', bg: bg16, icon: icon13 },
  { name: 'CO2传感器', status: '(0/484)', bg: bg17, icon: icon14 },
  { name: '压力传感器', status: '(0/484)', bg: bg18, icon: icon15 },
  { name: '水质监测设备', status: '(0/484)', bg: bg18, icon: icon16 }
]

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('9ffada-onload', {
      componentId: '9ffada',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>