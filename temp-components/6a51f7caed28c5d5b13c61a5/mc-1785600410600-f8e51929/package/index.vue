<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <div class="c-mc-1785600410600-f8e51929-tabs">
        <div
          v-for="tab in tabs"
          :key="tab.value"
          :class="['c-mc-1785600410600-f8e51929-tab-item', { 'is-active': activeTab === tab.value }]"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </div>
      </div>
    </template>

    <div class="c-mc-1785600410600-f8e51929-content">
      <!-- 子标题区域 -->
      <div class="c-mc-1785600410600-f8e51929-sub-header">
        <img :src="icon5" class="c-mc-1785600410600-f8e51929-sub-icon" />
        <span class="c-mc-1785600410600-f8e51929-sub-title">今日累计</span>
      </div>

      <!-- 统计卡片区域 -->
      <div class="c-mc-1785600410600-f8e51929-cards">
        <div
          v-for="card in cardData"
          :key="card.id"
          class="c-mc-1785600410600-f8e51929-card-item"
        >
          <!-- 卡片背景图 -->
          <div
            class="c-mc-1785600410600-f8e51929-card-bg"
            :style="{
              backgroundImage: `url(${card.bg})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          ></div>
          
          <!-- 卡片内容 -->
          <div class="c-mc-1785600410600-f8e51929-card-content">
            <img :src="card.icon" class="c-mc-1785600410600-f8e51929-card-icon" />
            <div class="c-mc-1785600410600-f8e51929-card-text">
              <span class="c-mc-1785600410600-f8e51929-card-label">{{ card.label }}</span>
              <div class="c-mc-1785600410600-f8e51929-card-value-group">
                <span class="c-mc-1785600410600-f8e51929-card-value" :style="{ color: card.color }">{{ card.value }}</span>
                <span class="c-mc-1785600410600-f8e51929-card-unit">次</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon5 from '../resources/images/icon-8070.png'
import icon4 from '../resources/images/icon-8036.png'
import bg3 from '../resources/images/bg-125.png'
import icon3 from '../resources/images/icon-8049.png'
import bg2 from '../resources/images/bg-124.png'
import icon2 from '../resources/images/icon-123.png'
import bg1 from '../resources/images/bg-126.png'

import { ref, watch, onMounted, onUnmounted} from 'vue'

// 初始化 $mcComponentBuilder
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

// Tab 切换数据
const tabs = ref([
  { label: '江阴靖江长江隧道', value: 'tunnel' },
  { label: '江阴大桥', value: 'bridge' }
])
const activeTab = ref('tunnel')

// 卡片数据映射（Mock 数据，用于演示切换效果）
const dataMap = {
  tunnel: [
    { id: 'dangerous', label: '危化品车', value: 51, color: 'rgba(255,77,79,1)', icon: icon4, bg: bg3 },
    { id: 'heavy', label: '重型货车', value: 2, color: 'rgba(25,144,255,1)', icon: icon3, bg: bg2 },
    { id: 'oversize', label: '超高车辆', value: 19, color: 'rgba(250,140,22,1)', icon: icon2, bg: bg1 }
  ],
  bridge: [
    { id: 'dangerous', label: '危化品车', value: 38, color: 'rgba(255,77,79,1)', icon: icon4, bg: bg3 },
    { id: 'heavy', label: '重型货车', value: 15, color: 'rgba(25,144,255,1)', icon: icon3, bg: bg2 },
    { id: 'oversize', label: '超高车辆', value: 7, color: 'rgba(250,140,22,1)', icon: icon2, bg: bg1 }
  ]
}

const cardData = ref(dataMap.tunnel)

// 监听 Tab 切换，更新数据
watch(activeTab, (newVal) => {
  cardData.value = dataMap[newVal] || dataMap.tunnel
})

// 组件加载事件
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

.c-mc-1785600410600-f8e51929-tabs {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: center;
}

.c-mc-1785600410600-f8e51929-tab-item {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  background: rgba(102, 128, 160, 0.2);
  color: #333333;
  border: 0.73px solid rgba(172, 196, 225, 1);

  &.is-active {
    background: rgba(25, 144, 255, 1);
    color: #ffffff;
    font-weight: 500;
    border: 0.73px solid rgba(199, 224, 255, 1);
  }
}

.c-mc-1785600410600-f8e51929-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c-mc-1785600410600-f8e51929-sub-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.c-mc-1785600410600-f8e51929-sub-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-mc-1785600410600-f8e51929-sub-title {
  font-size: 16px;
  font-weight: 500;
  color: #333333;
  line-height: 24px;
  text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
}

.c-mc-1785600410600-f8e51929-cards {
  display: flex;
  flex-direction: row;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.c-mc-1785600410600-f8e51929-card-item {
  flex: 1;
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  min-width: 0;
}

.c-mc-1785600410600-f8e51929-card-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.c-mc-1785600410600-f8e51929-card-content {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 12px;
  box-sizing: border-box;
}

.c-mc-1785600410600-f8e51929-card-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-mc-1785600410600-f8e51929-card-text {
  display: flex;
  flex-direction: column;
  margin-left: 12px;
  gap: 4px;
}

.c-mc-1785600410600-f8e51929-card-label {
  font-size: 12px;
  color: #333333;
  font-weight: 400;
  line-height: 18px;
}

.c-mc-1785600410600-f8e51929-card-value-group {
  display: flex;
  flex-direction: row;
  align-items: baseline;
}

.c-mc-1785600410600-f8e51929-card-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 23px;
  font-family: Roboto, sans-serif;
}

.c-mc-1785600410600-f8e51929-card-unit {
  font-size: 12px;
  color: rgba(102, 128, 160, 1);
  font-weight: 400;
  line-height: 18px;
  margin-left: 2px;
}
</style>