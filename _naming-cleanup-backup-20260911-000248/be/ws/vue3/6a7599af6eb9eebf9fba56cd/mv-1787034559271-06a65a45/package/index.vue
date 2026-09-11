<template>
  <div 
    class="mv3-device-monitor-root" 
    :style="{ backgroundImage: `url(${bg1})` }"
  >
    <!-- 顶部标题与统计区 -->
    <div class="mv3-header" :style="{ backgroundImage: `url(${bg2})` }">
      <div class="mv3-header-left">
        <img :src="icon1" class="mv3-header-dot" alt="dot" />
        <span class="mv3-header-title">设备监测</span>
        <img :src="icon2" class="mv3-header-icon" alt="icon" />
      </div>
      <div class="mv3-header-stats">
        <div class="mv3-stat-item">
          <span class="mv3-stat-label">设备类型</span>
          <span class="mv3-stat-value mv3-stat-value--primary">{{ stats.deviceType }}</span>
        </div>
        <div class="mv3-stat-item">
          <span class="mv3-stat-label">设备总数</span>
          <span class="mv3-stat-value mv3-stat-value--primary">{{ stats.deviceTotal }}</span>
        </div>
        <div class="mv3-stat-item">
          <span class="mv3-stat-label">完好率</span>
          <span class="mv3-stat-value mv3-stat-value--teal">{{ stats.goodRate }}</span>
        </div>
      </div>
    </div>

    <!-- 大类设备统计区 -->
    <div class="mv3-top-cards">
      <div 
        v-for="(card, index) in topCards" 
        :key="card.id"
        class="mv3-top-card"
        :class="{ 'mv3-top-card--active': activeCard === index }"
        :style="{ backgroundImage: `url(${card.bg})` }"
        @click="activeCard = index"
      >
        <img :src="card.icon" class="mv3-top-card-icon" :alt="card.name" />
        <div class="mv3-top-card-info">
          <div class="mv3-top-card-title" :class="{ 'mv3-top-card-title--dark': index !== 0 }">
            {{ card.name }}
          </div>
          <div class="mv3-top-card-row">
            <span class="mv3-top-card-label" :class="{ 'mv3-top-card-label--dark': index !== 0 }">总数:</span>
            <span class="mv3-top-card-value" :class="{ 'mv3-top-card-value--primary': index !== 0 }">{{ card.total }}</span>
          </div>
          <div class="mv3-top-card-row">
            <span class="mv3-top-card-label" :class="{ 'mv3-top-card-label--dark': index !== 0 }">异常数:</span>
            <span class="mv3-top-card-value mv3-top-card-value--danger">{{ card.abnormal }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 设备列表区 -->
    <div class="mv3-main-content">
      <!-- 左侧分类导航 -->
      <div class="mv3-sidebar" :style="{ backgroundImage: `url(${bg2})` }">
        <div class="mv3-sidebar-count">{{ sidebarCount }}</div>
        <div 
          v-for="(tab, index) in categories" 
          :key="tab.name"
          class="mv3-sidebar-tab"
          :class="{ 'mv3-sidebar-tab--active': activeCategory === index }"
          :style="activeCategory === index ? { backgroundImage: `url(${tab.activeBg})` } : {}"
          @click="activeCategory = index"
        >
          <span>{{ tab.name }}</span>
          <div v-if="tab.badge" class="mv3-sidebar-badge">{{ tab.badge }}</div>
        </div>
      </div>

      <!-- 右侧设备网格 -->
      <div class="mv3-device-grid" :style="{ backgroundImage: `url(${bg2})` }">
        <div 
          v-for="(device, index) in devices" 
          :key="device.name"
          class="mv3-device-item"
          :style="{ backgroundImage: `url(${device.bg})` }"
        >
          <img :src="device.icon" class="mv3-device-icon" :alt="device.name" />
          <span class="mv3-device-name">{{ device.name }}</span>
          <span 
            class="mv3-device-value" 
            :class="device.abnormal > 0 ? 'mv3-device-value--danger' : 'mv3-device-value--teal'"
          >
            ({{ device.abnormal }}/{{ device.total }})
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const bg1 = new URL('../resources/images/bg-8418.png', import.meta.url).href
const bg2 = new URL('../resources/images/bg-8788.png', import.meta.url).href
const icon1 = new URL('../resources/images/g-8421.png', import.meta.url).href
const icon2 = new URL('../resources/images/Frame-8856.png', import.meta.url).href
const icon3 = new URL('../resources/images/icon-8798.png', import.meta.url).href
const bg3 = new URL('../resources/images/bg-8807.png', import.meta.url).href
const icon4 = new URL('../resources/images/icon-8817.png', import.meta.url).href
const bg9 = new URL('../resources/images/bg-8439.png', import.meta.url).href
const bg4 = new URL('../resources/images/bg-8831.png', import.meta.url).href
const bg5 = new URL('../resources/images/bg-8831.png', import.meta.url).href
const bg6 = new URL('../resources/images/bg-8831.png', import.meta.url).href
const bg8 = new URL('../resources/images/bg-8852.png', import.meta.url).href
const bg7 = new URL('../resources/images/bg-8847.png', import.meta.url).href
const icon5 = new URL('../resources/images/icon-8444.png', import.meta.url).href
const icon6 = new URL('../resources/images/icon-8473.png', import.meta.url).href
const bg10 = new URL('../resources/images/bg-8468.png', import.meta.url).href
const icon7 = new URL('../resources/images/icon-8503.png', import.meta.url).href
const bg11 = new URL('../resources/images/bg-8498.png', import.meta.url).href
const icon8 = new URL('../resources/images/icon-8532.png', import.meta.url).href
const bg12 = new URL('../resources/images/bg-8527.png', import.meta.url).href
const icon9 = new URL('../resources/images/icon-8561.png', import.meta.url).href
const bg13 = new URL('../resources/images/bg-8556.png', import.meta.url).href
const icon10 = new URL('../resources/images/icon-8590.png', import.meta.url).href
const bg14 = new URL('../resources/images/bg-8585.png', import.meta.url).href
const icon11 = new URL('../resources/images/icon-8619.png', import.meta.url).href
const bg15 = new URL('../resources/images/bg-8614.png', import.meta.url).href
const icon12 = new URL('../resources/images/icon-8648.png', import.meta.url).href
const bg16 = new URL('../resources/images/bg-8643.png', import.meta.url).href
const icon13 = new URL('../resources/images/icon-8677.png', import.meta.url).href
const bg17 = new URL('../resources/images/bg-8672.png', import.meta.url).href
const icon14 = new URL('../resources/images/icon-8706.png', import.meta.url).href
const bg18 = new URL('../resources/images/bg-8701.png', import.meta.url).href
const icon15 = new URL('../resources/images/icon-8735.png', import.meta.url).href
const bg19 = new URL('../resources/images/bg-8730.png', import.meta.url).href
const icon16 = new URL('../resources/images/icon-8764.png', import.meta.url).href
const bg20 = new URL('../resources/images/bg-8759.png', import.meta.url).href
/**
 * 设备监测面板组件
 * 数据来源：Figma 设计稿还原
 * 关键交互：左侧分类导航切换、顶部大类卡片切换
 */
import { ref, reactive, onMounted, onUnmounted} from 'vue'

// #region 1. Props定义
// 本组件为独立面板，暂无外部 props
// #endregion

// #region 2. Emits定义
// 本组件暂无外部事件
// #endregion

// #region 3. 响应式状态
// 顶部统计数据
const stats = reactive({
  deviceType: 28,
  deviceTotal: 68562,
  goodRate: '98%'
})

// 侧边栏统计总数
const sidebarCount = ref('3/3740')

// 当前激活的大类卡片索引
const activeCard = ref(0)

// 当前激活的分类索引
const activeCategory = ref(0)

// 顶部大类卡片数据
const topCards = ref([
  {
    id: 'tunnel',
    name: '隧道设备',
    total: 56302,
    abnormal: 5,
    icon: icon3,
    bg: bg3
  },
  {
    id: 'north-south',
    name: '南北接线设备',
    total: 1280,
    abnormal: 3,
    icon: icon4,
    bg: bg9
  }
])

// 左侧分类导航数据
const categories = ref([
  { name: '监控', activeBg: bg4, badge: null },
  { name: '照明', activeBg: bg5, badge: '3' },
  { name: '通风', activeBg: bg6, badge: null },
  { name: '供配电', activeBg: bg8, badge: null },
  { name: '消防', activeBg: bg5, badge: null },
  { name: '交通诱导', activeBg: bg7, badge: null }
])

// 设备网格数据（监控分类下的设备）
const devices = ref([
  { name: '摄像机', abnormal: 2, total: 484, icon: icon5, bg: bg9 },
  { name: '风速风向仪', abnormal: 1, total: 484, icon: icon6, bg: bg10 },
  { name: '超高检测器', abnormal: 0, total: 484, icon: icon7, bg: bg11 },
  { name: '烟道机器人', abnormal: 0, total: 484, icon: icon8, bg: bg12 },
  { name: '激光雷达', abnormal: 0, total: 484, icon: icon9, bg: bg13 },
  { name: 'CO₂传感器', abnormal: 0, total: 484, icon: icon10, bg: bg14 },
  { name: 'CO/VI检测器', abnormal: 0, total: 484, icon: icon11, bg: bg15 },
  { name: '温湿度传感器', abnormal: 0, total: 484, icon: icon12, bg: bg16 },
  { name: '压力传感器', abnormal: 0, total: 484, icon: icon13, bg: bg17 },
  { name: '光照度变送器', abnormal: 0, total: 484, icon: icon14, bg: bg18 },
  { name: '紧急电话', abnormal: 0, total: 484, icon: icon15, bg: bg19 },
  { name: '水质监测设备', abnormal: 0, total: 484, icon: icon16, bg: bg20 }
])
// #endregion

// #region 4. 计算属性
// 暂无复杂计算属性
// #endregion

// #region 5. 方法
// 切换分类时，可在此处加载对应分类的设备数据
const handleCategoryChange = (index) => {
  activeCategory.value = index
  // TODO: 根据 index 请求对应分类的设备列表
}

// 切换大类卡片时，可在此处联动更新数据
const handleCardChange = (index) => {
  activeCard.value = index
  // TODO: 根据 index 联动更新下方设备列表或统计数据
}
// #endregion

// #region 6. 生命周期
onMounted(() => {
  // 组件挂载完成
})

onUnmounted(() => {
  // 清理资源
})
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 标题栏装饰小圆点
.mv3-header-dot {
  width: 8px;
  height: 8px;
  object-fit: contain;
}

// 标题栏右侧图标
.mv3-header-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

// 滚动条美化
.mv3-device-grid::-webkit-scrollbar {
  width: 4px;
}

.mv3-device-grid::-webkit-scrollbar-track {
  background: transparent;
}

.mv3-device-grid::-webkit-scrollbar-thumb {
  background: rgba(25, 144, 255, 0.3);
  border-radius: 2px;
}</style>