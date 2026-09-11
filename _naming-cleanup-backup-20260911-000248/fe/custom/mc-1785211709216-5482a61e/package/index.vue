<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <img :src="icon1" alt="装饰点" class="c-mc-1785211709216-5482a61e-title-dot" />
    </template>

    <template #title-right>
      <span class="c-mc-1785211709216-5482a61e-title-text">重点车辆监测</span>
      <span class="c-mc-1785211709216-5482a61e-update-text">*数据实时更新</span>
    </template>

    <template #header-right>
      <div class="c-mc-1785211709216-5482a61e-tabs">
        <button
          v-for="tab in tabList"
          :key="tab.key"
          type="button"
          :class="[
            'c-mc-1785211709216-5482a61e-tab-button',
            activeTab === tab.key
              ? 'c-mc-1785211709216-5482a61e-tab-button-active'
              : 'c-mc-1785211709216-5482a61e-tab-button-default'
          ]"
          @click="handleTabChange(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </template>

    <div :class="['c-mc-1785211709216-5482a61e-root', themeClass]">
      <div class="c-mc-1785211709216-5482a61e-content-panel">
        <div class="c-mc-1785211709216-5482a61e-sub-header">
          <img :src="icon5" alt="今日累计" class="c-mc-1785211709216-5482a61e-sub-header-icon" />
          <span class="c-mc-1785211709216-5482a61e-sub-header-text">今日累计</span>
        </div>

        <div class="c-mc-1785211709216-5482a61e-stat-list">
          <div
            v-for="item in currentStats"
            :key="item.key"
            class="c-mc-1785211709216-5482a61e-stat-item"
            :style="{
              backgroundImage: `url(${item.bg})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <img :src="item.icon" :alt="item.label" class="c-mc-1785211709216-5482a61e-stat-icon" />
            <div class="c-mc-1785211709216-5482a61e-stat-text-group">
              <span class="c-mc-1785211709216-5482a61e-stat-label">{{ item.label }}</span>
              <span class="c-mc-1785211709216-5482a61e-stat-value">{{ item.value }}</span>
            </div>
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

const componentId = 'mc-1785211709216-5482a61e'
const defaultComponentProps = {
  themeType: 'dark'
}

let runtimeBuilder = null
let mcComponentProps = defaultComponentProps

try {
  const builder =
    typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function'
      ? window.$mcComponentBuilder({
          componentId,
          componentProps: defaultComponentProps,
          componentName: componentId
        })
      : typeof $mcComponentBuilder === 'function'
        ? $mcComponentBuilder({
            componentId,
            componentProps: defaultComponentProps,
            componentName: componentId
          })
        : null

  runtimeBuilder = builder?.runtimeBuilder || null
  mcComponentProps = {
    ...defaultComponentProps,
    ...(builder?.componentProps || {})
  }
} catch (error) {
  console.warn('[重点车辆监测] 微码组件构建器初始化失败：', error)
  runtimeBuilder = null
  mcComponentProps = defaultComponentProps
}

const themeClass = computed(() => mcComponentProps?.themeType || 'dark')

const tabList = [
  { key: 'tunnel', label: '项目主体' },
  { key: 'bridge', label: '大桥' }
]

const activeTab = ref('tunnel')

const statsMap = {
  tunnel: [
    {
      key: 'oversize-bus',
      label: '超高客车',
      value: '126',
      icon: icon2,
      bg: bg1
    },
    {
      key: 'dangerous-goods',
      label: '危化品车',
      value: '58',
      icon: icon3,
      bg: bg2
    },
    {
      key: 'other-focus',
      label: '重点车辆',
      value: '94',
      icon: icon4,
      bg: bg3
    }
  ],
  bridge: [
    {
      key: 'oversize-bus',
      label: '超高客车',
      value: '89',
      icon: icon2,
      bg: bg1
    },
    {
      key: 'dangerous-goods',
      label: '危化品车',
      value: '41',
      icon: icon3,
      bg: bg2
    },
    {
      key: 'other-focus',
      label: '重点车辆',
      value: '72',
      icon: icon4,
      bg: bg3
    }
  ]
}

const currentStats = computed(() => statsMap[activeTab.value] || statsMap.tunnel)

const handleTabChange = (key) => {
  activeTab.value = key
}

watch(activeTab, (key) => {
  runtimeBuilder?.publishEvent?.('mc-1785211709216-5482a61e-tab-change', {
    componentId,
    activeTab: key,
    timestamp: Date.now()
  })
})

onMounted(() => {
  runtimeBuilder?.publishEvent?.('mc-1785211709216-5482a61e-onload', {
    componentId,
    timestamp: Date.now()
  })
})
</script>


<style>
:root {
  --em-primary: #1990ff;
  --em-primary-end: #5a7eff;
  --em-accent: #559eff;
  --em-cyan: #57caff;
  --em-panel-bg: #edf4fb;
  --em-text-primary: #333333;
  --em-text-inverse: #ffffff;
  --em-tab-default-bg: #6680a0;
  --em-tab-active-border: #c7e0ff;
  --em-tab-default-border: #acc4e1;
  --em-panel-shadow: rgba(74, 117, 141, 0.25);
  --em-highlight-shadow: rgba(255, 255, 255, 0.8);
  --em-theme-bg: #edf4fb;
  --em-theme-primary: #1990ff;
  --em-theme-primary-gradient-start: #1990ff;
  --em-theme-primary-gradient-end: #5a7eff;
  --em-theme-title-line: #559eff;
  --em-theme-text: #333333;
  --em-theme-text-inverse: #ffffff;
}
.c-mc-1785211709216-5482a61e-title-dot {
  width: 8px;
  height: 8px;
  display: block;
  object-fit: contain;
  flex: 0 0 8px;
}
.c-mc-1785211709216-5482a61e-title-text {
  display: inline-block;
  margin-left: 8px;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.c-mc-1785211709216-5482a61e-update-text {
  display: inline-block;
  margin-left: 190px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: right;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.c-mc-1785211709216-5482a61e-tabs {
  width: 204.03846741px;
  height: 19px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  box-sizing: border-box;
}
.c-mc-1785211709216-5482a61e-tab-button {
  height: 19px;
  margin: 0;
  padding: 0 6px;
  border-style: solid;
  border-width: 0.73076922px;
  border-radius: 0;
  box-sizing: border-box;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  appearance: none;
  transition: opacity 0.16s ease;
}
.c-mc-1785211709216-5482a61e-tab-button:hover {
  opacity: 0.88;
}
.c-mc-1785211709216-5482a61e-tab-button:active {
  opacity: 0.76;
}
.c-mc-1785211709216-5482a61e-tab-button-active {
  width: 128px;
  background-color: #1990ff;
  border-color: #c7e0ff;
  color: #ffffff;
  font-weight: 500;
}
.c-mc-1785211709216-5482a61e-tab-button-default {
  width: 68px;
  background-color: #6680a0;
  border-color: #acc4e1;
  color: #333333;
  font-weight: 400;
}
.c-mc-1785211709216-5482a61e-root {
  width: 100%;
  height: 86px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
  overflow: visible;
}
.c-mc-1785211709216-5482a61e-content-panel {
  width: 377.48144531px;
  height: 85.99943542px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  box-sizing: border-box;
  overflow: visible;
}
.c-mc-1785211709216-5482a61e-sub-header {
  width: 86px;
  height: 24.33802795px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  box-sizing: border-box;
  flex: 0 0 auto;
}
.c-mc-1785211709216-5482a61e-sub-header-icon {
  width: 18px;
  height: 18.25352097px;
  display: block;
  object-fit: contain;
  flex: 0 0 18px;
}
.c-mc-1785211709216-5482a61e-sub-header-text {
  width: 64px;
  height: 24.33802795px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  color: #333333;
  text-shadow: 0 5.04792309px 5.04792309px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}
.c-mc-1785211709216-5482a61e-stat-list {
  width: 378px;
  height: 74.1953125px;
  margin-top: -12.53390503px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 0;
  box-sizing: border-box;
  overflow: visible;
}
.c-mc-1785211709216-5482a61e-stat-item {
  height: 74.1953125px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  overflow: visible;
  flex: 0 0 auto;
}
.c-mc-1785211709216-5482a61e-stat-item:nth-child(1) {
  width: 140.48147583px;
  padding-left: 10px;
}
.c-mc-1785211709216-5482a61e-stat-item:nth-child(2) {
  width: 120px;
  padding-left: 7px;
}
.c-mc-1785211709216-5482a61e-stat-item:nth-child(3) {
  width: 141.00003052px;
  padding-left: 8px;
}
.c-mc-1785211709216-5482a61e-stat-icon {
  width: 47.52000046px;
  height: 47.52000046px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}
.c-mc-1785211709216-5482a61e-stat-text-group {
  margin-left: -1px;
  min-width: 50px;
  height: 43px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  box-sizing: border-box;
  flex: 0 0 auto;
}
.c-mc-1785211709216-5482a61e-stat-label {
  height: 18px;
  display: inline-block;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  text-align: left;
  color: #333333;
  white-space: nowrap;
}
.c-mc-1785211709216-5482a61e-stat-value {
  height: 23px;
  margin-top: 2px;
  display: inline-block;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 22px;
  font-weight: 700;
  line-height: 23px;
  text-align: left;
  color: #1990ff;
  white-space: nowrap;
}
.dark {
  --em-primary: #1990ff;
  --em-primary-end: #5a7eff;
  --em-accent: #559eff;
  --em-cyan: #57caff;
  --em-panel-bg: #edf4fb;
  --em-text-primary: #333333;
  --em-text-inverse: #ffffff;
  --em-tab-default-bg: #6680a0;
  --em-tab-active-border: #c7e0ff;
  --em-tab-default-border: #acc4e1;
  --em-panel-shadow: rgba(74, 117, 141, 0.25);
  --em-highlight-shadow: rgba(255, 255, 255, 0.8);
  --em-theme-bg: #edf4fb;
  --em-theme-primary: #1990ff;
  --em-theme-primary-gradient-start: #1990ff;
  --em-theme-primary-gradient-end: #5a7eff;
  --em-theme-title-line: #559eff;
  --em-theme-text: #333333;
  --em-theme-text-inverse: #ffffff;
}
.dark .c-mc-1785211709216-5482a61e-title-dot {
  width: 8px;
  height: 8px;
  display: block;
  object-fit: contain;
  flex: 0 0 8px;
}
.dark .c-mc-1785211709216-5482a61e-title-text {
  display: inline-block;
  margin-left: 8px;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.dark .c-mc-1785211709216-5482a61e-update-text {
  display: inline-block;
  margin-left: 190px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: right;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.dark .c-mc-1785211709216-5482a61e-tabs {
  width: 204.03846741px;
  height: 19px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  box-sizing: border-box;
}
.dark .c-mc-1785211709216-5482a61e-tab-button {
  height: 19px;
  margin: 0;
  padding: 0 6px;
  border-style: solid;
  border-width: 0.73076922px;
  border-radius: 0;
  box-sizing: border-box;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  appearance: none;
  transition: opacity 0.16s ease;
}
.dark .c-mc-1785211709216-5482a61e-tab-button:hover {
  opacity: 0.88;
}
.dark .c-mc-1785211709216-5482a61e-tab-button:active {
  opacity: 0.76;
}
.dark .c-mc-1785211709216-5482a61e-tab-button-active {
  width: 128px;
  background-color: #1990ff;
  border-color: #c7e0ff;
  color: #ffffff;
  font-weight: 500;
}
.dark .c-mc-1785211709216-5482a61e-tab-button-default {
  width: 68px;
  background-color: #6680a0;
  border-color: #acc4e1;
  color: #333333;
  font-weight: 400;
}
.dark .c-mc-1785211709216-5482a61e-root {
  width: 100%;
  height: 86px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
  overflow: visible;
}
.dark .c-mc-1785211709216-5482a61e-content-panel {
  width: 377.48144531px;
  height: 85.99943542px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  box-sizing: border-box;
  overflow: visible;
}
.dark .c-mc-1785211709216-5482a61e-sub-header {
  width: 86px;
  height: 24.33802795px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  box-sizing: border-box;
  flex: 0 0 auto;
}
.dark .c-mc-1785211709216-5482a61e-sub-header-icon {
  width: 18px;
  height: 18.25352097px;
  display: block;
  object-fit: contain;
  flex: 0 0 18px;
}
.dark .c-mc-1785211709216-5482a61e-sub-header-text {
  width: 64px;
  height: 24.33802795px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  color: #333333;
  text-shadow: 0 5.04792309px 5.04792309px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}
.dark .c-mc-1785211709216-5482a61e-stat-list {
  width: 378px;
  height: 74.1953125px;
  margin-top: -12.53390503px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 0;
  box-sizing: border-box;
  overflow: visible;
}
.dark .c-mc-1785211709216-5482a61e-stat-item {
  height: 74.1953125px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  overflow: visible;
  flex: 0 0 auto;
}
.dark .c-mc-1785211709216-5482a61e-stat-item:nth-child(1) {
  width: 140.48147583px;
  padding-left: 10px;
}
.dark .c-mc-1785211709216-5482a61e-stat-item:nth-child(2) {
  width: 120px;
  padding-left: 7px;
}
.dark .c-mc-1785211709216-5482a61e-stat-item:nth-child(3) {
  width: 141.00003052px;
  padding-left: 8px;
}
.dark .c-mc-1785211709216-5482a61e-stat-icon {
  width: 47.52000046px;
  height: 47.52000046px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}
.dark .c-mc-1785211709216-5482a61e-stat-text-group {
  margin-left: -1px;
  min-width: 50px;
  height: 43px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  box-sizing: border-box;
  flex: 0 0 auto;
}
.dark .c-mc-1785211709216-5482a61e-stat-label {
  height: 18px;
  display: inline-block;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  text-align: left;
  color: #333333;
  white-space: nowrap;
}
.dark .c-mc-1785211709216-5482a61e-stat-value {
  height: 23px;
  margin-top: 2px;
  display: inline-block;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 22px;
  font-weight: 700;
  line-height: 23px;
  text-align: left;
  color: #1990ff;
  white-space: nowrap;
}
.light {
  --em-primary: #1990ff;
  --em-primary-end: #5a7eff;
  --em-accent: #559eff;
  --em-cyan: #57caff;
  --em-panel-bg: #edf4fb;
  --em-text-primary: #333333;
  --em-text-inverse: #ffffff;
  --em-tab-default-bg: #6680a0;
  --em-tab-active-border: #c7e0ff;
  --em-tab-default-border: #acc4e1;
  --em-panel-shadow: rgba(74, 117, 141, 0.25);
  --em-highlight-shadow: rgba(255, 255, 255, 0.8);
  --em-theme-bg: #edf4fb;
  --em-theme-primary: #1990ff;
  --em-theme-primary-gradient-start: #1990ff;
  --em-theme-primary-gradient-end: #5a7eff;
  --em-theme-title-line: #559eff;
  --em-theme-text: #333333;
  --em-theme-text-inverse: #ffffff;
}
.light .c-mc-1785211709216-5482a61e-title-dot {
  width: 8px;
  height: 8px;
  display: block;
  object-fit: contain;
  flex: 0 0 8px;
}
.light .c-mc-1785211709216-5482a61e-title-text {
  display: inline-block;
  margin-left: 8px;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.light .c-mc-1785211709216-5482a61e-update-text {
  display: inline-block;
  margin-left: 190px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: right;
  color: #1990ff;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.light .c-mc-1785211709216-5482a61e-tabs {
  width: 204.03846741px;
  height: 19px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  box-sizing: border-box;
}
.light .c-mc-1785211709216-5482a61e-tab-button {
  height: 19px;
  margin: 0;
  padding: 0 6px;
  border-style: solid;
  border-width: 0.73076922px;
  border-radius: 0;
  box-sizing: border-box;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  appearance: none;
  transition: opacity 0.16s ease;
}
.light .c-mc-1785211709216-5482a61e-tab-button:hover {
  opacity: 0.88;
}
.light .c-mc-1785211709216-5482a61e-tab-button:active {
  opacity: 0.76;
}
.light .c-mc-1785211709216-5482a61e-tab-button-active {
  width: 128px;
  background-color: #1990ff;
  border-color: #c7e0ff;
  color: #ffffff;
  font-weight: 500;
}
.light .c-mc-1785211709216-5482a61e-tab-button-default {
  width: 68px;
  background-color: #6680a0;
  border-color: #acc4e1;
  color: #333333;
  font-weight: 400;
}
.light .c-mc-1785211709216-5482a61e-root {
  width: 100%;
  height: 86px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
  overflow: visible;
}
.light .c-mc-1785211709216-5482a61e-content-panel {
  width: 377.48144531px;
  height: 85.99943542px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  box-sizing: border-box;
  overflow: visible;
}
.light .c-mc-1785211709216-5482a61e-sub-header {
  width: 86px;
  height: 24.33802795px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  box-sizing: border-box;
  flex: 0 0 auto;
}
.light .c-mc-1785211709216-5482a61e-sub-header-icon {
  width: 18px;
  height: 18.25352097px;
  display: block;
  object-fit: contain;
  flex: 0 0 18px;
}
.light .c-mc-1785211709216-5482a61e-sub-header-text {
  width: 64px;
  height: 24.33802795px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  color: #333333;
  text-shadow: 0 5.04792309px 5.04792309px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}
.light .c-mc-1785211709216-5482a61e-stat-list {
  width: 378px;
  height: 74.1953125px;
  margin-top: -12.53390503px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 0;
  box-sizing: border-box;
  overflow: visible;
}
.light .c-mc-1785211709216-5482a61e-stat-item {
  height: 74.1953125px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  overflow: visible;
  flex: 0 0 auto;
}
.light .c-mc-1785211709216-5482a61e-stat-item:nth-child(1) {
  width: 140.48147583px;
  padding-left: 10px;
}
.light .c-mc-1785211709216-5482a61e-stat-item:nth-child(2) {
  width: 120px;
  padding-left: 7px;
}
.light .c-mc-1785211709216-5482a61e-stat-item:nth-child(3) {
  width: 141.00003052px;
  padding-left: 8px;
}
.light .c-mc-1785211709216-5482a61e-stat-icon {
  width: 47.52000046px;
  height: 47.52000046px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}
.light .c-mc-1785211709216-5482a61e-stat-text-group {
  margin-left: -1px;
  min-width: 50px;
  height: 43px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  box-sizing: border-box;
  flex: 0 0 auto;
}
.light .c-mc-1785211709216-5482a61e-stat-label {
  height: 18px;
  display: inline-block;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  text-align: left;
  color: #333333;
  white-space: nowrap;
}
.light .c-mc-1785211709216-5482a61e-stat-value {
  height: 23px;
  margin-top: 2px;
  display: inline-block;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 22px;
  font-weight: 700;
  line-height: 23px;
  text-align: left;
  color: #1990ff;
  white-space: nowrap;
}

</style>
