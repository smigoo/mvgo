<template>
  <base-panel panelKey="default-panel">
    <!-- Fixed: 标题栏不再在默认插槽中重复生成，统一通过 base-panel 具名插槽渲染 -->
    <template #title-left>
      <div class="c-mc-1785229659947-db5a1e80-title-left" aria-hidden="true">
        <img :src="icon1" class="c-mc-1785229659947-db5a1e80-title-dot" alt="" />
      </div>
    </template>

    <!-- Fixed: 将副标题信息放入标题右侧插槽，避免在内容区重复生成 header 结构 -->
    <template #title-right>
      <div class="c-mc-1785229659947-db5a1e80-title-right">
        <img :src="icon5" class="c-mc-1785229659947-db5a1e80-title-right-icon" alt="" />
        <span class="c-mc-1785229659947-db5a1e80-title-right-text">今日累计</span>
      </div>
    </template>

    <!-- Fixed: Tab 通过 header-right 插槽承载，避免在默认插槽中生成独立 header/panel-header -->
    <template #header-right>
      <div class="c-mc-1785229659947-db5a1e80-tabs" role="tablist" aria-label="线路切换">
        <div
          v-for="tab in tabList"
          :key="tab.key"
          class="c-mc-1785229659947-db5a1e80-tab-item"
          :class="{ 'is-active': activeTab === tab.key }"
          role="tab"
          :aria-selected="activeTab === tab.key"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </div>
      </div>
    </template>

    <div class="c-mc-1785229659947-db5a1e80-body">
      <div class="c-mc-1785229659947-db5a1e80-card-list">
        <div
          v-for="item in currentCards"
          :key="item.label"
          class="c-mc-1785229659947-db5a1e80-card-item"
          :style="item.style"
        >
          <img :src="item.icon" class="c-mc-1785229659947-db5a1e80-card-icon" alt="" />
          <div class="c-mc-1785229659947-db5a1e80-card-text">
            <span class="c-mc-1785229659947-db5a1e80-card-label">{{ item.label }}</span>
            <span class="c-mc-1785229659947-db5a1e80-card-value">
              {{ item.value }}<small class="c-mc-1785229659947-db5a1e80-card-unit">{{ item.unit }}</small>
            </span>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-7961.png'
import icon5 from '../resources/images/icon-8070.png'
import icon2 from '../resources/images/icon-123.png'
import bg1 from '../resources/images/bg-126.png'
import icon3 from '../resources/images/icon-8049.png'
import bg2 from '../resources/images/bg-124.png'
import icon4 from '../resources/images/icon-8036.png'
import bg3 from '../resources/images/bg-125.png'

import { computed, onMounted, ref, watch } from 'vue'

const componentId = 'mc-1785229659947-db5a1e80'
const componentName = 'Frame 2136637714'

let runtimeBuilder = null
let componentProps = {}

try {
  const builder =
    typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function'
      ? window.$mcComponentBuilder({
          componentId,
          componentProps,
          componentName
        })
      : null

  runtimeBuilder = builder?.runtimeBuilder || null
  componentProps = builder?.componentProps || {}
} catch (error) {
  console.warn('[组件] $mcComponentBuilder 初始化失败：', error)
}

// Fixed: 使用 Tab 驱动数据切换，避免只改样式不更新内容
const activeTab = ref('tunnel')

const tabList = [
  { key: 'tunnel', label: '项目主体' },
  { key: 'bridge', label: '大桥' }
]

const cardDataMap = {
  tunnel: [
    {
      label: '超高客车',
      value: 12,
      unit: '辆',
      icon: icon2,
      style: {
        backgroundImage: `url(${bg1})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }
    },
    {
      label: '危化品车',
      value: 8,
      unit: '辆',
      icon: icon3,
      style: {
        backgroundImage: `url(${bg2})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }
    },
    {
      label: '重点车辆',
      value: 36,
      unit: '辆',
      icon: icon4,
      style: {
        backgroundImage: `url(${bg3})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }
    }
  ],
  bridge: [
    {
      label: '超高客车',
      value: 5,
      unit: '辆',
      icon: icon2,
      style: {
        backgroundImage: `url(${bg1})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }
    },
    {
      label: '危化品车',
      value: 3,
      unit: '辆',
      icon: icon3,
      style: {
        backgroundImage: `url(${bg2})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }
    },
    {
      label: '重点车辆',
      value: 18,
      unit: '辆',
      icon: icon4,
      style: {
        backgroundImage: `url(${bg3})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }
    }
  ]
}

const currentCards = ref(cardDataMap[activeTab.value])

watch(activeTab, (newTab) => {
  currentCards.value = cardDataMap[newTab] || cardDataMap.tunnel
})

onMounted(() => {
  currentCards.value = cardDataMap[activeTab.value] || cardDataMap.tunnel

  if (runtimeBuilder) {
    runtimeBuilder.publishEvent(`${componentId}-onload`, {
      componentId,
      timestamp: Date.now()
    })
  }
})
</script>


<style>
.c-mc-1785229659947-db5a1e80-title-left {
  position: relative;
  display: flex;
  align-items: center;
  width: 380px;
  height: 28.09px;
  overflow: hidden;
}
.c-mc-1785229659947-db5a1e80-title-left::before {
  content: '';
  position: absolute;
  left: 4px;
  right: 0;
  bottom: 2px;
  height: 6px;
  background: linear-gradient(90deg, #559eff 0%, rgba(85, 158, 255, 0) 100%);
  opacity: 0.88;
  pointer-events: none;
}
.c-mc-1785229659947-db5a1e80-title-left::after {
  content: '重点车辆监测';
  position: absolute;
  left: 14px;
  top: 0;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.c-mc-1785229659947-db5a1e80-title-dot {
  position: absolute;
  left: 0;
  top: 10px;
  display: block;
  width: 8px;
  height: 8px;
  object-fit: contain;
  flex: 0 0 auto;
}
.c-mc-1785229659947-db5a1e80-title-right {
  display: flex;
  align-items: center;
  width: 86px;
  height: 24.34px;
  gap: 4px;
  overflow: hidden;
}
.c-mc-1785229659947-db5a1e80-title-right-icon {
  display: block;
  width: 18px;
  height: 18.25px;
  object-fit: contain;
  flex: 0 0 auto;
}
.c-mc-1785229659947-db5a1e80-title-right-text {
  display: block;
  width: 64px;
  height: 24.34px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-align: left;
  white-space: nowrap;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}
.c-mc-1785229659947-db5a1e80-tabs {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 204.04px;
  height: 19px;
  gap: 8px;
  overflow: visible;
}
.c-mc-1785229659947-db5a1e80-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 19px;
  padding: 0 6px;
  box-sizing: border-box;
  border: 0.73px solid #acc4e1;
  background: #6680a0;
  color: #333333;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.c-mc-1785229659947-db5a1e80-tab-item[aria-selected='true'] {
  width: 128px;
  border-color: #c7e0ff;
  background: #1990ff;
  color: #ffffff;
  font-weight: 500;
}
.c-mc-1785229659947-db5a1e80-tab-item[aria-selected='false'] {
  width: 68px;
}
.c-mc-1785229659947-db5a1e80-body {
  width: 100%;
  height: 86px;
  box-sizing: border-box;
  padding-top: 11.8px;
  overflow: hidden;
}
.c-mc-1785229659947-db5a1e80-card-list {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 377.48px;
  height: 74.2px;
  margin: 0 auto;
  overflow: visible;
}
.c-mc-1785229659947-db5a1e80-card-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 74.2px;
  box-sizing: border-box;
  overflow: hidden;
  flex: 0 0 auto;
}
.c-mc-1785229659947-db5a1e80-card-item:nth-child(1) {
  width: 140.48px;
  padding-left: 12px;
}
.c-mc-1785229659947-db5a1e80-card-item:nth-child(2) {
  width: 120px;
  padding-left: 4px;
}
.c-mc-1785229659947-db5a1e80-card-item:nth-child(3) {
  width: 141px;
  padding-left: 8px;
}
.c-mc-1785229659947-db5a1e80-card-icon {
  display: block;
  width: 47.52px;
  height: 47.52px;
  object-fit: contain;
  flex: 0 0 auto;
}
.c-mc-1785229659947-db5a1e80-card-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  margin-left: 6px;
  height: 44px;
  overflow: visible;
}
.c-mc-1785229659947-db5a1e80-card-label {
  display: block;
  height: 18px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
  white-space: nowrap;
}
.c-mc-1785229659947-db5a1e80-card-value {
  display: block;
  height: 23px;
  margin-top: 1px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 22px;
  font-weight: 700;
  line-height: 23px;
  color: #1990ff;
  white-space: nowrap;
}
.c-mc-1785229659947-db5a1e80-card-unit {
  display: inline-block;
  margin-left: 2px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  color: #333333;
  vertical-align: baseline;
}
.dark .c-mc-1785229659947-db5a1e80-title-left {
  position: relative;
  display: flex;
  align-items: center;
  width: 380px;
  height: 28.09px;
  overflow: hidden;
}
.dark .c-mc-1785229659947-db5a1e80-title-left::before {
  content: '';
  position: absolute;
  left: 4px;
  right: 0;
  bottom: 2px;
  height: 6px;
  background: linear-gradient(90deg, #559eff 0%, rgba(85, 158, 255, 0) 100%);
  opacity: 0.88;
  pointer-events: none;
}
.dark .c-mc-1785229659947-db5a1e80-title-left::after {
  content: '重点车辆监测';
  position: absolute;
  left: 14px;
  top: 0;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.dark .c-mc-1785229659947-db5a1e80-title-dot {
  position: absolute;
  left: 0;
  top: 10px;
  display: block;
  width: 8px;
  height: 8px;
  object-fit: contain;
  flex: 0 0 auto;
}
.dark .c-mc-1785229659947-db5a1e80-title-right {
  display: flex;
  align-items: center;
  width: 86px;
  height: 24.34px;
  gap: 4px;
  overflow: hidden;
}
.dark .c-mc-1785229659947-db5a1e80-title-right-icon {
  display: block;
  width: 18px;
  height: 18.25px;
  object-fit: contain;
  flex: 0 0 auto;
}
.dark .c-mc-1785229659947-db5a1e80-title-right-text {
  display: block;
  width: 64px;
  height: 24.34px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-align: left;
  white-space: nowrap;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}
.dark .c-mc-1785229659947-db5a1e80-tabs {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 204.04px;
  height: 19px;
  gap: 8px;
  overflow: visible;
}
.dark .c-mc-1785229659947-db5a1e80-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 19px;
  padding: 0 6px;
  box-sizing: border-box;
  border: 0.73px solid #acc4e1;
  background: #6680a0;
  color: #333333;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.dark .c-mc-1785229659947-db5a1e80-tab-item[aria-selected='true'] {
  width: 128px;
  border-color: #c7e0ff;
  background: #1990ff;
  color: #ffffff;
  font-weight: 500;
}
.dark .c-mc-1785229659947-db5a1e80-tab-item[aria-selected='false'] {
  width: 68px;
}
.dark .c-mc-1785229659947-db5a1e80-body {
  width: 100%;
  height: 86px;
  box-sizing: border-box;
  padding-top: 11.8px;
  overflow: hidden;
}
.dark .c-mc-1785229659947-db5a1e80-card-list {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 377.48px;
  height: 74.2px;
  margin: 0 auto;
  overflow: visible;
}
.dark .c-mc-1785229659947-db5a1e80-card-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 74.2px;
  box-sizing: border-box;
  overflow: hidden;
  flex: 0 0 auto;
}
.dark .c-mc-1785229659947-db5a1e80-card-item:nth-child(1) {
  width: 140.48px;
  padding-left: 12px;
}
.dark .c-mc-1785229659947-db5a1e80-card-item:nth-child(2) {
  width: 120px;
  padding-left: 4px;
}
.dark .c-mc-1785229659947-db5a1e80-card-item:nth-child(3) {
  width: 141px;
  padding-left: 8px;
}
.dark .c-mc-1785229659947-db5a1e80-card-icon {
  display: block;
  width: 47.52px;
  height: 47.52px;
  object-fit: contain;
  flex: 0 0 auto;
}
.dark .c-mc-1785229659947-db5a1e80-card-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  margin-left: 6px;
  height: 44px;
  overflow: visible;
}
.dark .c-mc-1785229659947-db5a1e80-card-label {
  display: block;
  height: 18px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
  white-space: nowrap;
}
.dark .c-mc-1785229659947-db5a1e80-card-value {
  display: block;
  height: 23px;
  margin-top: 1px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 22px;
  font-weight: 700;
  line-height: 23px;
  color: #1990ff;
  white-space: nowrap;
}
.dark .c-mc-1785229659947-db5a1e80-card-unit {
  display: inline-block;
  margin-left: 2px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  color: #333333;
  vertical-align: baseline;
}
.light .c-mc-1785229659947-db5a1e80-title-left {
  position: relative;
  display: flex;
  align-items: center;
  width: 380px;
  height: 28.09px;
  overflow: hidden;
}
.light .c-mc-1785229659947-db5a1e80-title-left::before {
  content: '';
  position: absolute;
  left: 4px;
  right: 0;
  bottom: 2px;
  height: 6px;
  background: linear-gradient(90deg, #559eff 0%, rgba(85, 158, 255, 0) 100%);
  opacity: 0.88;
  pointer-events: none;
}
.light .c-mc-1785229659947-db5a1e80-title-left::after {
  content: '重点车辆监测';
  position: absolute;
  left: 14px;
  top: 0;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.light .c-mc-1785229659947-db5a1e80-title-dot {
  position: absolute;
  left: 0;
  top: 10px;
  display: block;
  width: 8px;
  height: 8px;
  object-fit: contain;
  flex: 0 0 auto;
}
.light .c-mc-1785229659947-db5a1e80-title-right {
  display: flex;
  align-items: center;
  width: 86px;
  height: 24.34px;
  gap: 4px;
  overflow: hidden;
}
.light .c-mc-1785229659947-db5a1e80-title-right-icon {
  display: block;
  width: 18px;
  height: 18.25px;
  object-fit: contain;
  flex: 0 0 auto;
}
.light .c-mc-1785229659947-db5a1e80-title-right-text {
  display: block;
  width: 64px;
  height: 24.34px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: #333333;
  text-align: left;
  white-space: nowrap;
  text-shadow: 0 5.05px 5.05px rgba(255, 255, 255, 0.8);
}
.light .c-mc-1785229659947-db5a1e80-tabs {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 204.04px;
  height: 19px;
  gap: 8px;
  overflow: visible;
}
.light .c-mc-1785229659947-db5a1e80-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 19px;
  padding: 0 6px;
  box-sizing: border-box;
  border: 0.73px solid #acc4e1;
  background: #6680a0;
  color: #333333;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.light .c-mc-1785229659947-db5a1e80-tab-item[aria-selected='true'] {
  width: 128px;
  border-color: #c7e0ff;
  background: #1990ff;
  color: #ffffff;
  font-weight: 500;
}
.light .c-mc-1785229659947-db5a1e80-tab-item[aria-selected='false'] {
  width: 68px;
}
.light .c-mc-1785229659947-db5a1e80-body {
  width: 100%;
  height: 86px;
  box-sizing: border-box;
  padding-top: 11.8px;
  overflow: hidden;
}
.light .c-mc-1785229659947-db5a1e80-card-list {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 377.48px;
  height: 74.2px;
  margin: 0 auto;
  overflow: visible;
}
.light .c-mc-1785229659947-db5a1e80-card-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 74.2px;
  box-sizing: border-box;
  overflow: hidden;
  flex: 0 0 auto;
}
.light .c-mc-1785229659947-db5a1e80-card-item:nth-child(1) {
  width: 140.48px;
  padding-left: 12px;
}
.light .c-mc-1785229659947-db5a1e80-card-item:nth-child(2) {
  width: 120px;
  padding-left: 4px;
}
.light .c-mc-1785229659947-db5a1e80-card-item:nth-child(3) {
  width: 141px;
  padding-left: 8px;
}
.light .c-mc-1785229659947-db5a1e80-card-icon {
  display: block;
  width: 47.52px;
  height: 47.52px;
  object-fit: contain;
  flex: 0 0 auto;
}
.light .c-mc-1785229659947-db5a1e80-card-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  margin-left: 6px;
  height: 44px;
  overflow: visible;
}
.light .c-mc-1785229659947-db5a1e80-card-label {
  display: block;
  height: 18px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 18px;
  color: #333333;
  white-space: nowrap;
}
.light .c-mc-1785229659947-db5a1e80-card-value {
  display: block;
  height: 23px;
  margin-top: 1px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 22px;
  font-weight: 700;
  line-height: 23px;
  color: #1990ff;
  white-space: nowrap;
}
.light .c-mc-1785229659947-db5a1e80-card-unit {
  display: inline-block;
  margin-left: 2px;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  color: #333333;
  vertical-align: baseline;
}

</style>
