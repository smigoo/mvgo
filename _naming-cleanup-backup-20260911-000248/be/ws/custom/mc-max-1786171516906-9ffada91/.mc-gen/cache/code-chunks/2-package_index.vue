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
import { ref, onMounted, onUnmounted } from 'vue'

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

const tabsData = [
  { name: '监控', bg: bg3 },
  { name: '照明', bg: bg4 },
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