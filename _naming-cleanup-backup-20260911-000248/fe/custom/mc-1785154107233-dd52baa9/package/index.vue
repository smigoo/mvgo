<template>
  <base-panel panelKey="default-panel">
    <!-- 修复：删除默认插槽内独立 header / panel-header 结构，标题栏内容改由 base-panel 具名插槽承载 -->
    <template #title-left>
      <img :src="icon1" alt="标题装饰" class="c-mc-1785154107233-dd52baa9-title-left-icon" />
    </template>

    <template #title-right>
      <span class="c-mc-1785154107233-dd52baa9-update-text">*数据实时更新</span>
    </template>

    <template #header-right>
      <div class="c-mc-1785154107233-dd52baa9-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="[
            'c-mc-1785154107233-dd52baa9-tab-item',
            activeTab === tab.key ? 'c-mc-1785154107233-dd52baa9-tab-item-active' : 'c-mc-1785154107233-dd52baa9-tab-item-normal'
          ]"
          @click="handleTabChange(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </template>

    <VehicleMonitorContent
      :items="currentItems"
      :sub-icon="icon5"
    />
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
import VehicleMonitorContent from './components/VehicleMonitorContent.vue'

const componentId = 'mc-1785154107233-dd52baa9'
const componentName = 'mc-1785154107233-dd52baa9'

const fallbackComponentProps = {
  themeType: 'dark'
}

let runtimeBuilder = null
let componentProps = fallbackComponentProps

try {
  const builder = typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function'
    ? window.$mcComponentBuilder({
      componentId,
      componentProps: fallbackComponentProps,
      componentName
    })
    : null

  runtimeBuilder = builder?.runtimeBuilder || null
  componentProps = builder?.componentProps || fallbackComponentProps
} catch (error) {
  console.warn('[重点车辆监测] 微码组件初始化失败：', error)
}

const tabs = [
  { key: 'tunnel', label: '项目主体' },
  { key: 'bridge', label: '大桥' }
]

const activeTab = ref('tunnel')

const dataMap = {
  tunnel: [
    {
      key: 'over-height',
      label: '超高客车',
      value: '128',
      unit: '辆',
      icon: icon2,
      bg: bg1,
      bgSize: '100% 100%'
    },
    {
      key: 'dangerous',
      label: '危化品车',
      value: '86',
      unit: '辆',
      icon: icon3,
      bg: bg2,
      bgSize: '100% 100%'
    },
    {
      key: 'large',
      label: '大件运输',
      value: '215',
      unit: '辆',
      icon: icon4,
      bg: bg3,
      bgSize: '100% 100%'
    }
  ],
  bridge: [
    {
      key: 'over-height',
      label: '超高客车',
      value: '96',
      unit: '辆',
      icon: icon2,
      bg: bg1,
      bgSize: '100% 100%'
    },
    {
      key: 'dangerous',
      label: '危化品车',
      value: '64',
      unit: '辆',
      icon: icon3,
      bg: bg2,
      bgSize: '100% 100%'
    },
    {
      key: 'large',
      label: '大件运输',
      value: '173',
      unit: '辆',
      icon: icon4,
      bg: bg3,
      bgSize: '100% 100%'
    }
  ]
}

const currentItems = computed(() => dataMap[activeTab.value] || dataMap.tunnel)

const handleTabChange = (key) => {
  activeTab.value = key
}

watch(activeTab, (key) => {
  runtimeBuilder?.publishEvent?.(`${componentId}-tab-change`, {
    componentId,
    activeTab: key,
    timestamp: Date.now()
  })
})

onMounted(() => {
  runtimeBuilder?.publishEvent?.('mc-1785154107233-dd52baa9-onload', {
    componentId,
    timestamp: Date.now()
  })
})
</script>


<style>
:root {
  --em-primary: #1990ff;
  --em-secondary: #5a7eff;
  --em-accent: #559eff;
  --em-accent-light: #d6effc;
  --em-info: #57caff;
  --em-white: #ffffff;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-title-gradient: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  --em-panel-bg: #edf4fb;
  --em-text-primary: #333333;
  --em-text-secondary: #333333;
  --em-tab-active-bg: #1990ff;
  --em-tab-active-border: #c7e0ff;
  --em-tab-active-text: #ffffff;
  --em-tab-normal-bg: #6680a0;
  --em-tab-normal-border: #acc4e1;
  --em-tab-normal-text: #333333;
  --em-sub-title-shadow: 0 5.047923px 5.047923px rgba(255, 255, 255, 0.8);
}
.c-mc-1785154107233-dd52baa9-title-left-icon {
  width: 8px;
  height: 8px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}
.c-mc-1785154107233-dd52baa9-update-text {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  height: 21px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  white-space: nowrap;
  background: linear-gradient(90deg, var(--em-primary, #1990ff) 0%, var(--em-secondary, #5a7eff) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.c-mc-1785154107233-dd52baa9-tabs {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: auto;
  height: 19px;
}
.c-mc-1785154107233-dd52baa9-tab-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 19px;
  padding: 0 6px;
  border-style: solid;
  border-width: 0.730769px;
  border-radius: 0;
  box-sizing: border-box;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 14px;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;
  appearance: none;
}
.c-mc-1785154107233-dd52baa9-tab-item:hover {
  opacity: 0.9;
}
.c-mc-1785154107233-dd52baa9-tab-item:active {
  opacity: 0.78;
}
.c-mc-1785154107233-dd52baa9-tab-item-active {
  min-width: 128px;
  background-color: var(--em-tab-active-bg, #1990ff);
  border-color: var(--em-tab-active-border, #c7e0ff);
  color: var(--em-tab-active-text, #ffffff);
  font-weight: 500;
}
.c-mc-1785154107233-dd52baa9-tab-item-normal {
  min-width: 68px;
  background-color: var(--em-tab-normal-bg, #6680a0);
  border-color: var(--em-tab-normal-border, #acc4e1);
  color: var(--em-tab-normal-text, #333333);
  font-weight: 400;
}
.c-mc-1785154107233-dd52baa9-content {
  position: relative;
  width: 100%;
  height: 86px;
  box-sizing: border-box;
  padding-top: 0;
  overflow: hidden;
}
.c-mc-1785154107233-dd52baa9-sub-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 86px;
  height: 24.338px;
  margin-bottom: 0;
}
.c-mc-1785154107233-dd52baa9-sub-icon {
  width: 18px;
  height: 18.254px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}
.c-mc-1785154107233-dd52baa9-sub-title {
  display: inline-flex;
  align-items: center;
  width: 64px;
  height: 24.338px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: var(--em-text-primary, #333333);
  text-align: left;
  text-shadow: 0 5.047923px 5.047923px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}
.c-mc-1785154107233-dd52baa9-stat-list {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 378px;
  height: 74.195px;
  margin-top: -12px;
  box-sizing: border-box;
}
.c-mc-1785154107233-dd52baa9-stat-item {
  position: relative;
  height: 74.195px;
  flex: 0 0 auto;
  box-sizing: border-box;
  overflow: hidden;
}
.c-mc-1785154107233-dd52baa9-stat-item:nth-child(1) {
  width: 140.481px;
}
.c-mc-1785154107233-dd52baa9-stat-item:nth-child(2) {
  width: 120px;
}
.c-mc-1785154107233-dd52baa9-stat-item:nth-child(3) {
  width: 141px;
}
.c-mc-1785154107233-dd52baa9-stat-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
  background-position: center;
  pointer-events: none;
}
.c-mc-1785154107233-dd52baa9-stat-icon {
  position: absolute;
  left: 10px;
  top: 15px;
  width: 47.52px;
  height: 47.52px;
  display: block;
  object-fit: contain;
  pointer-events: none;
}
.c-mc-1785154107233-dd52baa9-stat-info {
  position: absolute;
  left: 58px;
  top: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  min-width: 50px;
  box-sizing: border-box;
}
.c-mc-1785154107233-dd52baa9-stat-label {
  height: 18px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--em-text-secondary, #333333);
  white-space: nowrap;
}
.c-mc-1785154107233-dd52baa9-stat-value-row {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-start;
  height: 23px;
  margin-top: 1px;
  white-space: nowrap;
}
.c-mc-1785154107233-dd52baa9-stat-value {
  font-family: "DIN Alternate", "DIN", "Source Han Sans CN", sans-serif;
  font-size: 24px;
  font-weight: 700;
  line-height: 23px;
  color: var(--em-primary, #1990ff);
}
.c-mc-1785154107233-dd52baa9-stat-unit {
  margin-left: 2px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--em-text-secondary, #333333);
}
.dark {
  --em-primary: #1990ff;
  --em-secondary: #5a7eff;
  --em-accent: #559eff;
  --em-accent-light: #d6effc;
  --em-info: #57caff;
  --em-white: #ffffff;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-title-gradient: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  --em-panel-bg: #edf4fb;
  --em-text-primary: #333333;
  --em-text-secondary: #333333;
  --em-tab-active-bg: #1990ff;
  --em-tab-active-border: #c7e0ff;
  --em-tab-active-text: #ffffff;
  --em-tab-normal-bg: #6680a0;
  --em-tab-normal-border: #acc4e1;
  --em-tab-normal-text: #333333;
  --em-sub-title-shadow: 0 5.047923px 5.047923px rgba(255, 255, 255, 0.8);
}
.dark .c-mc-1785154107233-dd52baa9-title-left-icon {
  width: 8px;
  height: 8px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}
.dark .c-mc-1785154107233-dd52baa9-update-text {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  height: 21px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  white-space: nowrap;
  background: linear-gradient(90deg, var(--em-primary, #1990ff) 0%, var(--em-secondary, #5a7eff) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.dark .c-mc-1785154107233-dd52baa9-tabs {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: auto;
  height: 19px;
}
.dark .c-mc-1785154107233-dd52baa9-tab-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 19px;
  padding: 0 6px;
  border-style: solid;
  border-width: 0.730769px;
  border-radius: 0;
  box-sizing: border-box;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 14px;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;
  appearance: none;
}
.dark .c-mc-1785154107233-dd52baa9-tab-item:hover {
  opacity: 0.9;
}
.dark .c-mc-1785154107233-dd52baa9-tab-item:active {
  opacity: 0.78;
}
.dark .c-mc-1785154107233-dd52baa9-tab-item-active {
  min-width: 128px;
  background-color: var(--em-tab-active-bg, #1990ff);
  border-color: var(--em-tab-active-border, #c7e0ff);
  color: var(--em-tab-active-text, #ffffff);
  font-weight: 500;
}
.dark .c-mc-1785154107233-dd52baa9-tab-item-normal {
  min-width: 68px;
  background-color: var(--em-tab-normal-bg, #6680a0);
  border-color: var(--em-tab-normal-border, #acc4e1);
  color: var(--em-tab-normal-text, #333333);
  font-weight: 400;
}
.dark .c-mc-1785154107233-dd52baa9-content {
  position: relative;
  width: 100%;
  height: 86px;
  box-sizing: border-box;
  padding-top: 0;
  overflow: hidden;
}
.dark .c-mc-1785154107233-dd52baa9-sub-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 86px;
  height: 24.338px;
  margin-bottom: 0;
}
.dark .c-mc-1785154107233-dd52baa9-sub-icon {
  width: 18px;
  height: 18.254px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}
.dark .c-mc-1785154107233-dd52baa9-sub-title {
  display: inline-flex;
  align-items: center;
  width: 64px;
  height: 24.338px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: var(--em-text-primary, #333333);
  text-align: left;
  text-shadow: 0 5.047923px 5.047923px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}
.dark .c-mc-1785154107233-dd52baa9-stat-list {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 378px;
  height: 74.195px;
  margin-top: -12px;
  box-sizing: border-box;
}
.dark .c-mc-1785154107233-dd52baa9-stat-item {
  position: relative;
  height: 74.195px;
  flex: 0 0 auto;
  box-sizing: border-box;
  overflow: hidden;
}
.dark .c-mc-1785154107233-dd52baa9-stat-item:nth-child(1) {
  width: 140.481px;
}
.dark .c-mc-1785154107233-dd52baa9-stat-item:nth-child(2) {
  width: 120px;
}
.dark .c-mc-1785154107233-dd52baa9-stat-item:nth-child(3) {
  width: 141px;
}
.dark .c-mc-1785154107233-dd52baa9-stat-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
  background-position: center;
  pointer-events: none;
}
.dark .c-mc-1785154107233-dd52baa9-stat-icon {
  position: absolute;
  left: 10px;
  top: 15px;
  width: 47.52px;
  height: 47.52px;
  display: block;
  object-fit: contain;
  pointer-events: none;
}
.dark .c-mc-1785154107233-dd52baa9-stat-info {
  position: absolute;
  left: 58px;
  top: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  min-width: 50px;
  box-sizing: border-box;
}
.dark .c-mc-1785154107233-dd52baa9-stat-label {
  height: 18px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--em-text-secondary, #333333);
  white-space: nowrap;
}
.dark .c-mc-1785154107233-dd52baa9-stat-value-row {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-start;
  height: 23px;
  margin-top: 1px;
  white-space: nowrap;
}
.dark .c-mc-1785154107233-dd52baa9-stat-value {
  font-family: "DIN Alternate", "DIN", "Source Han Sans CN", sans-serif;
  font-size: 24px;
  font-weight: 700;
  line-height: 23px;
  color: var(--em-primary, #1990ff);
}
.dark .c-mc-1785154107233-dd52baa9-stat-unit {
  margin-left: 2px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--em-text-secondary, #333333);
}
.light {
  --em-primary: #1990ff;
  --em-secondary: #5a7eff;
  --em-accent: #559eff;
  --em-accent-light: #d6effc;
  --em-info: #57caff;
  --em-white: #ffffff;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-title-gradient: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  --em-panel-bg: #edf4fb;
  --em-text-primary: #333333;
  --em-text-secondary: #333333;
  --em-tab-active-bg: #1990ff;
  --em-tab-active-border: #c7e0ff;
  --em-tab-active-text: #ffffff;
  --em-tab-normal-bg: #6680a0;
  --em-tab-normal-border: #acc4e1;
  --em-tab-normal-text: #333333;
  --em-sub-title-shadow: 0 5.047923px 5.047923px rgba(255, 255, 255, 0.8);
}
.light .c-mc-1785154107233-dd52baa9-title-left-icon {
  width: 8px;
  height: 8px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}
.light .c-mc-1785154107233-dd52baa9-update-text {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  height: 21px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  white-space: nowrap;
  background: linear-gradient(90deg, var(--em-primary, #1990ff) 0%, var(--em-secondary, #5a7eff) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.light .c-mc-1785154107233-dd52baa9-tabs {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: auto;
  height: 19px;
}
.light .c-mc-1785154107233-dd52baa9-tab-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 19px;
  padding: 0 6px;
  border-style: solid;
  border-width: 0.730769px;
  border-radius: 0;
  box-sizing: border-box;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 14px;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;
  appearance: none;
}
.light .c-mc-1785154107233-dd52baa9-tab-item:hover {
  opacity: 0.9;
}
.light .c-mc-1785154107233-dd52baa9-tab-item:active {
  opacity: 0.78;
}
.light .c-mc-1785154107233-dd52baa9-tab-item-active {
  min-width: 128px;
  background-color: var(--em-tab-active-bg, #1990ff);
  border-color: var(--em-tab-active-border, #c7e0ff);
  color: var(--em-tab-active-text, #ffffff);
  font-weight: 500;
}
.light .c-mc-1785154107233-dd52baa9-tab-item-normal {
  min-width: 68px;
  background-color: var(--em-tab-normal-bg, #6680a0);
  border-color: var(--em-tab-normal-border, #acc4e1);
  color: var(--em-tab-normal-text, #333333);
  font-weight: 400;
}
.light .c-mc-1785154107233-dd52baa9-content {
  position: relative;
  width: 100%;
  height: 86px;
  box-sizing: border-box;
  padding-top: 0;
  overflow: hidden;
}
.light .c-mc-1785154107233-dd52baa9-sub-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 86px;
  height: 24.338px;
  margin-bottom: 0;
}
.light .c-mc-1785154107233-dd52baa9-sub-icon {
  width: 18px;
  height: 18.254px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}
.light .c-mc-1785154107233-dd52baa9-sub-title {
  display: inline-flex;
  align-items: center;
  width: 64px;
  height: 24.338px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: var(--em-text-primary, #333333);
  text-align: left;
  text-shadow: 0 5.047923px 5.047923px rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}
.light .c-mc-1785154107233-dd52baa9-stat-list {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 378px;
  height: 74.195px;
  margin-top: -12px;
  box-sizing: border-box;
}
.light .c-mc-1785154107233-dd52baa9-stat-item {
  position: relative;
  height: 74.195px;
  flex: 0 0 auto;
  box-sizing: border-box;
  overflow: hidden;
}
.light .c-mc-1785154107233-dd52baa9-stat-item:nth-child(1) {
  width: 140.481px;
}
.light .c-mc-1785154107233-dd52baa9-stat-item:nth-child(2) {
  width: 120px;
}
.light .c-mc-1785154107233-dd52baa9-stat-item:nth-child(3) {
  width: 141px;
}
.light .c-mc-1785154107233-dd52baa9-stat-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
  background-position: center;
  pointer-events: none;
}
.light .c-mc-1785154107233-dd52baa9-stat-icon {
  position: absolute;
  left: 10px;
  top: 15px;
  width: 47.52px;
  height: 47.52px;
  display: block;
  object-fit: contain;
  pointer-events: none;
}
.light .c-mc-1785154107233-dd52baa9-stat-info {
  position: absolute;
  left: 58px;
  top: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  min-width: 50px;
  box-sizing: border-box;
}
.light .c-mc-1785154107233-dd52baa9-stat-label {
  height: 18px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--em-text-secondary, #333333);
  white-space: nowrap;
}
.light .c-mc-1785154107233-dd52baa9-stat-value-row {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-start;
  height: 23px;
  margin-top: 1px;
  white-space: nowrap;
}
.light .c-mc-1785154107233-dd52baa9-stat-value {
  font-family: "DIN Alternate", "DIN", "Source Han Sans CN", sans-serif;
  font-size: 24px;
  font-weight: 700;
  line-height: 23px;
  color: var(--em-primary, #1990ff);
}
.light .c-mc-1785154107233-dd52baa9-stat-unit {
  margin-left: 2px;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--em-text-secondary, #333333);
}

</style>
