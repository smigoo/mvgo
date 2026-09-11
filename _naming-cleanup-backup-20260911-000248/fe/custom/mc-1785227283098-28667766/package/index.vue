<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <div class="c-mc-1785227283098-28667766-title-brand">
        <img :src="icon1" class="c-mc-1785227283098-28667766-title-brand-icon" alt="" />
        <span class="c-mc-1785227283098-28667766-title-brand-text">重点车辆监测</span>
      </div>
    </template>

    <template #title-right>
      <span class="c-mc-1785227283098-28667766-title-right-placeholder"></span>
    </template>

    <template #header-right>
      <div class="c-mc-1785227283098-28667766-tabs">
        <div
          class="c-mc-1785227283098-28667766-tab-item"
          :class="activeTab === 'tunnel' ? 'c-mc-1785227283098-28667766-tab-item--active' : ''"
          @click="activeTab = 'tunnel'"
        >
          项目主体
        </div>
        <div
          class="c-mc-1785227283098-28667766-tab-item"
          :class="activeTab === 'bridge' ? 'c-mc-1785227283098-28667766-tab-item--active' : ''"
          @click="activeTab = 'bridge'"
        >
          大桥
        </div>
      </div>
    </template>

    <div class="c-mc-1785227283098-28667766-body">
      <div class="c-mc-1785227283098-28667766-sub-header">
        <img :src="icon5" class="c-mc-1785227283098-28667766-sub-header-icon" alt="" />
        <span class="c-mc-1785227283098-28667766-sub-header-text">今日累计</span>
      </div>

      <div class="c-mc-1785227283098-28667766-card-group">
        <div
          class="c-mc-1785227283098-28667766-card-item c-mc-1785227283098-28667766-card-item--large"
          :style="{
            backgroundImage: `url(${bg3})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat'
          }"
        >
          <img :src="icon2" class="c-mc-1785227283098-28667766-card-icon" alt="" />
          <div class="c-mc-1785227283098-28667766-card-text">
            <span class="c-mc-1785227283098-28667766-card-label">
              {{ summaryCards?.[0]?.label }}
            </span>
            <span class="c-mc-1785227283098-28667766-card-value">
              {{ summaryCards?.[0]?.value }}
              <small v-if="summaryCards?.[0]?.unit">{{ summaryCards?.[0]?.unit }}</small>
            </span>
          </div>
        </div>

        <div
          class="c-mc-1785227283098-28667766-card-item c-mc-1785227283098-28667766-card-item--middle"
          :style="{
            backgroundImage: `url(${bg2})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat'
          }"
        >
          <img :src="icon3" class="c-mc-1785227283098-28667766-card-icon" alt="" />
          <div class="c-mc-1785227283098-28667766-card-text">
            <span class="c-mc-1785227283098-28667766-card-label">
              {{ summaryCards?.[1]?.label }}
            </span>
            <span class="c-mc-1785227283098-28667766-card-value">
              {{ summaryCards?.[1]?.value }}
              <small v-if="summaryCards?.[1]?.unit">{{ summaryCards?.[1]?.unit }}</small>
            </span>
          </div>
        </div>

        <div
          class="c-mc-1785227283098-28667766-card-item c-mc-1785227283098-28667766-card-item--large-alt"
          :style="{
            backgroundImage: `url(${bg1})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat'
          }"
        >
          <img :src="icon4" class="c-mc-1785227283098-28667766-card-icon" alt="" />
          <div class="c-mc-1785227283098-28667766-card-text">
            <span class="c-mc-1785227283098-28667766-card-label">
              {{ summaryCards?.[2]?.label }}
            </span>
            <span class="c-mc-1785227283098-28667766-card-value">
              {{ summaryCards?.[2]?.value }}
              <small v-if="summaryCards?.[2]?.unit">{{ summaryCards?.[2]?.unit }}</small>
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
import bg3 from '../resources/images/bg-125.png'
import icon2 from '../resources/images/icon-123.png'
import bg2 from '../resources/images/bg-124.png'
import icon3 from '../resources/images/icon-8049.png'
import bg1 from '../resources/images/bg-126.png'
import icon4 from '../resources/images/icon-8036.png'

import { ref, onMounted, onUnmounted, watch } from 'vue'

let runtimeBuilder = null
let componentProps = {}
let businessProps = {}
let componentApi = null

try {
  const builder = typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function'
    ? window.$mcComponentBuilder({
        componentId: 'mc-1785227283098-28667766',
        componentProps: {},
        componentName: 'mc-1785227283098-28667766'
      })
    : null

  runtimeBuilder = builder?.runtimeBuilder || null
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi || null
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 失败:', e)
}

const activeTab = ref('tunnel')

const summaryDataMap = {
  tunnel: [
    { label: '车辆总数', value: '12,480', unit: '辆' },
    { label: '重点车辆', value: '286', unit: '辆' },
    { label: '超限车辆', value: '18', unit: '辆' }
  ],
  bridge: [
    { label: '车辆总数', value: '9,860', unit: '辆' },
    { label: '重点车辆', value: '214', unit: '辆' },
    { label: '超限车辆', value: '11', unit: '辆' }
  ]
}

const summaryCards = ref(summaryDataMap[activeTab.value])

const syncSummaryCards = (tabKey) => {
  summaryCards.value = summaryDataMap[tabKey] || summaryDataMap.tunnel
}

watch(activeTab, (newTab) => {
  syncSummaryCards(newTab)
}, { immediate: true })

const handleLoad = () => {
  runtimeBuilder?.publishEvent('mc-1785227283098-28667766-onload', {
    componentId: 'mc-1785227283098-28667766',
    timestamp: Date.now()
  })
}

onMounted(() => {
  handleLoad()
})

onUnmounted(() => {})
</script>


<style>
:root {
  --em-primary: #1990ff;
  --em-primary-weak: #5a7eff;
  --em-primary-soft: #d6effc;
  --em-primary-border: #c7e0ff;
  --em-secondary-border: #acc4e1;
  --em-text-primary: #333333;
  --em-text-inverse: #ffffff;
  --em-panel-bg-dark: #edf4fb;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-shadow-light: 0 5.04792309px 5.04792309px rgba(255, 255, 255, 0.8);
  --em-font-family-sc: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  --em-panel-bg: #edf4fb;
  --em-title-text: #1990ff;
  --em-subtitle-text: #333333;
  --em-tab-bg: #6680a0;
  --em-tab-active-bg: #1990ff;
  --em-tab-text: #333333;
  --em-tab-active-text: #ffffff;
}
.activeTab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 19px;
  padding: 0 8px;
  border: 0.73076922px solid #c7e0ff;
  background: #1990ff;
  color: #ffffff;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
}
.\=\=\= {
  display: block;
}
.c-mc-1785227283098-28667766-body {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 20px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.c-mc-1785227283098-28667766-card-group {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 0;
}
.c-mc-1785227283098-28667766-card-icon {
  display: block;
  flex: none;
  width: 48px;
  height: 48px;
  object-fit: contain;
}
.c-mc-1785227283098-28667766-card-item {
  box-sizing: border-box;
  min-width: 0;
  height: 74.2px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
.c-mc-1785227283098-28667766-card-item--large {
  flex: 1 1 0;
  max-width: 141px;
}
.c-mc-1785227283098-28667766-card-item--large-alt {
  flex: 1 1 0;
  max-width: 140.48px;
}
.c-mc-1785227283098-28667766-card-item--middle {
  flex: 0 0 120px;
  width: 120px;
}
.c-mc-1785227283098-28667766-card-label {
  display: block;
  color: #ffffff;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
}
.c-mc-1785227283098-28667766-card-text {
  box-sizing: border-box;
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
}
.c-mc-1785227283098-28667766-card-value {
  display: block;
  color: #ffffff;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 22px;
  text-align: left;
  white-space: nowrap;
}
.c-mc-1785227283098-28667766-card-value small {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  opacity: 0.92;
}
.c-mc-1785227283098-28667766-sub-header {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}
.c-mc-1785227283098-28667766-sub-header-icon {
  display: block;
  flex: none;
  width: 18px;
  height: 18.25px;
  object-fit: contain;
}
.c-mc-1785227283098-28667766-sub-header-text {
  color: #333333;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  text-shadow: 0 5.04792309px 5.04792309px rgba(255, 255, 255, 0.8);
}
.c-mc-1785227283098-28667766-tab-item {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 19px;
  padding: 0 8px;
  border: 0.73076922px solid #acc4e1;
  background: #6680a0;
  color: #333333;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.c-mc-1785227283098-28667766-tab-item--active {
  border-color: #c7e0ff;
  background: #1990ff;
  color: #ffffff;
  font-weight: 500;
}
.c-mc-1785227283098-28667766-tabs {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0;
  white-space: nowrap;
}
.c-mc-1785227283098-28667766-title-brand {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.c-mc-1785227283098-28667766-title-brand-icon {
  display: block;
  flex: none;
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.c-mc-1785227283098-28667766-title-brand-text {
  display: inline-block;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  font-family: "Noto Sans SC", "Source Han Sans CN", sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  white-space: nowrap;
}
.c-mc-1785227283098-28667766-title-right-placeholder {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
}
.dark {
  --em-primary: #1990ff;
  --em-primary-weak: #5a7eff;
  --em-primary-soft: #d6effc;
  --em-primary-border: #c7e0ff;
  --em-secondary-border: #acc4e1;
  --em-text-primary: #333333;
  --em-text-inverse: #ffffff;
  --em-panel-bg-dark: #edf4fb;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-shadow-light: 0 5.04792309px 5.04792309px rgba(255, 255, 255, 0.8);
  --em-font-family-sc: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  --em-panel-bg: #edf4fb;
  --em-title-text: #1990ff;
  --em-subtitle-text: #333333;
  --em-tab-bg: #6680a0;
  --em-tab-active-bg: #1990ff;
  --em-tab-text: #333333;
  --em-tab-active-text: #ffffff;
}
.dark .activeTab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 19px;
  padding: 0 8px;
  border: 0.73076922px solid #c7e0ff;
  background: #1990ff;
  color: #ffffff;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
}
.dark .\=\=\= {
  display: block;
}
.dark .c-mc-1785227283098-28667766-body {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 20px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dark .c-mc-1785227283098-28667766-card-group {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 0;
}
.dark .c-mc-1785227283098-28667766-card-icon {
  display: block;
  flex: none;
  width: 48px;
  height: 48px;
  object-fit: contain;
}
.dark .c-mc-1785227283098-28667766-card-item {
  box-sizing: border-box;
  min-width: 0;
  height: 74.2px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
.dark .c-mc-1785227283098-28667766-card-item--large {
  flex: 1 1 0;
  max-width: 141px;
}
.dark .c-mc-1785227283098-28667766-card-item--large-alt {
  flex: 1 1 0;
  max-width: 140.48px;
}
.dark .c-mc-1785227283098-28667766-card-item--middle {
  flex: 0 0 120px;
  width: 120px;
}
.dark .c-mc-1785227283098-28667766-card-label {
  display: block;
  color: #ffffff;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
}
.dark .c-mc-1785227283098-28667766-card-text {
  box-sizing: border-box;
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
}
.dark .c-mc-1785227283098-28667766-card-value {
  display: block;
  color: #ffffff;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 22px;
  text-align: left;
  white-space: nowrap;
}
.dark .c-mc-1785227283098-28667766-card-value small {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  opacity: 0.92;
}
.dark .c-mc-1785227283098-28667766-sub-header {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dark .c-mc-1785227283098-28667766-sub-header-icon {
  display: block;
  flex: none;
  width: 18px;
  height: 18.25px;
  object-fit: contain;
}
.dark .c-mc-1785227283098-28667766-sub-header-text {
  color: #333333;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  text-shadow: 0 5.04792309px 5.04792309px rgba(255, 255, 255, 0.8);
}
.dark .c-mc-1785227283098-28667766-tab-item {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 19px;
  padding: 0 8px;
  border: 0.73076922px solid #acc4e1;
  background: #6680a0;
  color: #333333;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.dark .c-mc-1785227283098-28667766-tab-item--active {
  border-color: #c7e0ff;
  background: #1990ff;
  color: #ffffff;
  font-weight: 500;
}
.dark .c-mc-1785227283098-28667766-tabs {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0;
  white-space: nowrap;
}
.dark .c-mc-1785227283098-28667766-title-brand {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dark .c-mc-1785227283098-28667766-title-brand-icon {
  display: block;
  flex: none;
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.dark .c-mc-1785227283098-28667766-title-brand-text {
  display: inline-block;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  font-family: "Noto Sans SC", "Source Han Sans CN", sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  white-space: nowrap;
}
.dark .c-mc-1785227283098-28667766-title-right-placeholder {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
}
.light {
  --em-primary: #1990ff;
  --em-primary-weak: #5a7eff;
  --em-primary-soft: #d6effc;
  --em-primary-border: #c7e0ff;
  --em-secondary-border: #acc4e1;
  --em-text-primary: #333333;
  --em-text-inverse: #ffffff;
  --em-panel-bg-dark: #edf4fb;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-shadow-light: 0 5.04792309px 5.04792309px rgba(255, 255, 255, 0.8);
  --em-font-family-sc: "Source Han Sans CN", "Noto Sans SC", sans-serif;
  --em-panel-bg: #ffffff;
  --em-title-text: #1990ff;
  --em-subtitle-text: #333333;
  --em-tab-bg: #dbe8f6;
  --em-tab-active-bg: #1990ff;
  --em-tab-text: #334155;
  --em-tab-active-text: #ffffff;
}
.light .activeTab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 19px;
  padding: 0 8px;
  border: 0.73076922px solid #c7e0ff;
  background: #1990ff;
  color: #ffffff;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
}
.light .\=\=\= {
  display: block;
}
.light .c-mc-1785227283098-28667766-body {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 20px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.light .c-mc-1785227283098-28667766-card-group {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 0;
}
.light .c-mc-1785227283098-28667766-card-icon {
  display: block;
  flex: none;
  width: 48px;
  height: 48px;
  object-fit: contain;
}
.light .c-mc-1785227283098-28667766-card-item {
  box-sizing: border-box;
  min-width: 0;
  height: 74.2px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
.light .c-mc-1785227283098-28667766-card-item--large {
  flex: 1 1 0;
  max-width: 141px;
}
.light .c-mc-1785227283098-28667766-card-item--large-alt {
  flex: 1 1 0;
  max-width: 140.48px;
}
.light .c-mc-1785227283098-28667766-card-item--middle {
  flex: 0 0 120px;
  width: 120px;
}
.light .c-mc-1785227283098-28667766-card-label {
  display: block;
  color: #ffffff;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
}
.light .c-mc-1785227283098-28667766-card-text {
  box-sizing: border-box;
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
}
.light .c-mc-1785227283098-28667766-card-value {
  display: block;
  color: #ffffff;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 22px;
  text-align: left;
  white-space: nowrap;
}
.light .c-mc-1785227283098-28667766-card-value small {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  opacity: 0.92;
}
.light .c-mc-1785227283098-28667766-sub-header {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}
.light .c-mc-1785227283098-28667766-sub-header-icon {
  display: block;
  flex: none;
  width: 18px;
  height: 18.25px;
  object-fit: contain;
}
.light .c-mc-1785227283098-28667766-sub-header-text {
  color: #333333;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  text-shadow: 0 5.04792309px 5.04792309px rgba(255, 255, 255, 0.8);
}
.light .c-mc-1785227283098-28667766-tab-item {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 19px;
  padding: 0 8px;
  border: 0.73076922px solid #acc4e1;
  background: #6680a0;
  color: #333333;
  font-family: "Source Han Sans CN", sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.light .c-mc-1785227283098-28667766-tab-item--active {
  border-color: #c7e0ff;
  background: #1990ff;
  color: #ffffff;
  font-weight: 500;
}
.light .c-mc-1785227283098-28667766-tabs {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0;
  white-space: nowrap;
}
.light .c-mc-1785227283098-28667766-title-brand {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.light .c-mc-1785227283098-28667766-title-brand-icon {
  display: block;
  flex: none;
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.light .c-mc-1785227283098-28667766-title-brand-text {
  display: inline-block;
  background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  font-family: "Noto Sans SC", "Source Han Sans CN", sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  white-space: nowrap;
}
.light .c-mc-1785227283098-28667766-title-right-placeholder {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
}

</style>
