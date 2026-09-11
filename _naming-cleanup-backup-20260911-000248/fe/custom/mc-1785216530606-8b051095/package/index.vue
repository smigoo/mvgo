<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <!-- 修复：标题栏装饰内容改用 base-panel 的 title-left 插槽，避免在默认插槽生成独立 header -->
      <img :src="icon1" alt="" class="c-mc-1785216530606-8b051095-title-dot" />
    </template>

    <template #header-right>
      <!-- 修复：顶部 Tab 控件放入 base-panel 的 header-right 插槽，不在业务内容区生成 panel-header -->
      <div class="c-mc-1785216530606-8b051095-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="[
            'c-mc-1785216530606-8b051095-tab-button',
            activeTab === tab.key ? 'c-mc-1785216530606-8b051095-tab-button-active' : ''
          ]"
          @click="handleTabClick(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </template>

    <div :class="['c-mc-1785216530606-8b051095-root', themeClass]">
      <div class="c-mc-1785216530606-8b051095-section-title">
        <span class="c-mc-1785216530606-8b051095-section-title-text">重点车辆监测</span>
      </div>

      <div class="c-mc-1785216530606-8b051095-summary">
        <div class="c-mc-1785216530606-8b051095-summary-label">
          <img :src="icon5" alt="" class="c-mc-1785216530606-8b051095-summary-icon" />
          <span class="c-mc-1785216530606-8b051095-summary-text">今日累计</span>
        </div>

        <div class="c-mc-1785216530606-8b051095-card-list">
          <div
            v-for="item in stats"
            :key="item.key"
            class="c-mc-1785216530606-8b051095-stat-card"
            :style="{
              backgroundImage: `url(${item.bg})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          >
            <img :src="item.icon" alt="" class="c-mc-1785216530606-8b051095-stat-icon" />
            <div class="c-mc-1785216530606-8b051095-stat-info">
              <span class="c-mc-1785216530606-8b051095-stat-name">{{ item.label }}</span>
              <span class="c-mc-1785216530606-8b051095-stat-value">{{ item.value }}</span>
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
import bg2 from '../resources/images/bg-125.png'
import icon4 from '../resources/images/icon-8036.png'

import { computed, onMounted, ref, watch } from 'vue'

const componentId = 'mc-1785216530606-8b051095'
const componentProps = {
  themeType: 'dark'
}

let runtimeBuilder = null

try {
  const builder = typeof window !== 'undefined' && typeof window.$mcComponentBuilder === 'function'
    ? window.$mcComponentBuilder({
        componentId,
        componentProps,
        componentName: componentId
      })
    : null
  runtimeBuilder = builder?.runtimeBuilder || null
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
    { key: 'overheight-bus', label: '超高客车', value: '26', icon: icon2, bg: bg1 },
    { key: 'dangerous-goods', label: '危化品车', value: '18', icon: icon3, bg: bg2 },
    { key: 'large-truck', label: '大型货车', value: '31', icon: icon4, bg: bg1 }
  ],
  bridge: [
    { key: 'overheight-bus', label: '超高客车', value: '19', icon: icon2, bg: bg1 },
    { key: 'dangerous-goods', label: '危化品车', value: '12', icon: icon3, bg: bg2 },
    { key: 'large-truck', label: '大型货车', value: '24', icon: icon4, bg: bg1 }
  ]
}

const stats = ref(dataMap[activeTab.value])

const themeClass = computed(() => componentProps.themeType || 'dark')

const handleTabClick = (key) => {
  activeTab.value = key
}

watch(activeTab, (newTab) => {
  stats.value = dataMap[newTab] || dataMap.tunnel
})

onMounted(() => {
  runtimeBuilder?.publishEvent('mc-1785216530606-8b051095-onload', {
    componentId,
    timestamp: Date.now()
  })
})
</script>
<style>
:root {
  --em-font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  --em-title-gradient: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  --em-tab-active-bg: #1990ff;
  --em-tab-active-border: #c7e0ff;
  --em-tab-active-text: #ffffff;
  --em-tab-inactive-bg: #6680a0;
  --em-tab-inactive-border: #acc4e1;
  --em-tab-inactive-text: #333333;
  --em-panel-bg: #edf4fb;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-text-primary: #333333;
  --em-summary-text: #333333;
}
:root {
  --em-font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  --em-title-gradient: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  --em-tab-active-bg: #1990ff;
  --em-tab-active-border: #c7e0ff;
  --em-tab-active-text: #ffffff;
  --em-tab-inactive-bg: #6680a0;
  --em-tab-inactive-border: #acc4e1;
  --em-tab-inactive-text: #333333;
  --em-panel-bg: #edf4fb;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-text-primary: #333333;
  --em-summary-text: #333333;
}
.c-mc-1785216530606-8b051095-root {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 20px 14px;
  background: var(--em-panel-bg);
  box-shadow: var(--em-panel-shadow);
  overflow: hidden;
  font-family: var(--em-font-family);
  color: var(--em-text-primary);
}
.c-mc-1785216530606-8b051095-title-dot {
  display: block;
  width: 8px;
  height: 8px;
  object-fit: contain;
  flex: 0 0 auto;
}
.c-mc-1785216530606-8b051095-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.c-mc-1785216530606-8b051095-tab-button {
  box-sizing: border-box;
  height: 19px;
  min-width: 68px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0.75px solid var(--em-tab-inactive-border);
  background: var(--em-tab-inactive-bg);
  color: var(--em-tab-inactive-text);
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 19px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  appearance: none;
  border-radius: 0;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.c-mc-1785216530606-8b051095-tab-button-active {
  border-color: var(--em-tab-active-border);
  background: var(--em-tab-active-bg);
  color: var(--em-tab-active-text);
  font-weight: 500;
}
.c-mc-1785216530606-8b051095-section-title {
  display: flex;
  align-items: center;
  min-height: 28px;
}
.c-mc-1785216530606-8b051095-section-title-text {
  display: inline-block;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  color: transparent;
  background: var(--em-title-gradient);
  -webkit-background-clip: text;
  background-clip: text;
}
.c-mc-1785216530606-8b051095-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.c-mc-1785216530606-8b051095-summary-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.c-mc-1785216530606-8b051095-summary-icon {
  display: block;
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex: 0 0 auto;
}
.c-mc-1785216530606-8b051095-summary-text {
  display: inline-block;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  color: var(--em-summary-text);
  text-shadow: 0 5.0479px 5.0479px rgba(255, 255, 255, 0.8);
}
.c-mc-1785216530606-8b051095-card-list {
  display: flex;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.c-mc-1785216530606-8b051095-stat-card {
  box-sizing: border-box;
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  height: 74.2px;
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: transparent;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
.c-mc-1785216530606-8b051095-stat-icon {
  display: block;
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex: 0 0 auto;
}
.c-mc-1785216530606-8b051095-stat-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 100%;
  min-width: 0;
  margin-top: 2px;
  text-align: center;
}
.c-mc-1785216530606-8b051095-stat-name {
  display: block;
  width: 100%;
  min-width: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.c-mc-1785216530606-8b051095-stat-value {
  display: block;
  width: 100%;
  min-width: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 20px;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dark {
  --em-font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  --em-title-gradient: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  --em-tab-active-bg: #1990ff;
  --em-tab-active-border: #c7e0ff;
  --em-tab-active-text: #ffffff;
  --em-tab-inactive-bg: #6680a0;
  --em-tab-inactive-border: #acc4e1;
  --em-tab-inactive-text: #333333;
  --em-panel-bg: #edf4fb;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-text-primary: #333333;
  --em-summary-text: #333333;
}
.dark :root {
  --em-font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  --em-title-gradient: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  --em-tab-active-bg: #1990ff;
  --em-tab-active-border: #c7e0ff;
  --em-tab-active-text: #ffffff;
  --em-tab-inactive-bg: #6680a0;
  --em-tab-inactive-border: #acc4e1;
  --em-tab-inactive-text: #333333;
  --em-panel-bg: #edf4fb;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-text-primary: #333333;
  --em-summary-text: #333333;
}
.dark .c-mc-1785216530606-8b051095-root {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 20px 14px;
  background: var(--em-panel-bg);
  box-shadow: var(--em-panel-shadow);
  overflow: hidden;
  font-family: var(--em-font-family);
  color: var(--em-text-primary);
}
.dark .c-mc-1785216530606-8b051095-title-dot {
  display: block;
  width: 8px;
  height: 8px;
  object-fit: contain;
  flex: 0 0 auto;
}
.dark .c-mc-1785216530606-8b051095-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.dark .c-mc-1785216530606-8b051095-tab-button {
  box-sizing: border-box;
  height: 19px;
  min-width: 68px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0.75px solid var(--em-tab-inactive-border);
  background: var(--em-tab-inactive-bg);
  color: var(--em-tab-inactive-text);
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 19px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  appearance: none;
  border-radius: 0;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.dark .c-mc-1785216530606-8b051095-tab-button-active {
  border-color: var(--em-tab-active-border);
  background: var(--em-tab-active-bg);
  color: var(--em-tab-active-text);
  font-weight: 500;
}
.dark .c-mc-1785216530606-8b051095-section-title {
  display: flex;
  align-items: center;
  min-height: 28px;
}
.dark .c-mc-1785216530606-8b051095-section-title-text {
  display: inline-block;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  color: transparent;
  background: var(--em-title-gradient);
  -webkit-background-clip: text;
  background-clip: text;
}
.dark .c-mc-1785216530606-8b051095-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.dark .c-mc-1785216530606-8b051095-summary-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.dark .c-mc-1785216530606-8b051095-summary-icon {
  display: block;
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex: 0 0 auto;
}
.dark .c-mc-1785216530606-8b051095-summary-text {
  display: inline-block;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  color: var(--em-summary-text);
  text-shadow: 0 5.0479px 5.0479px rgba(255, 255, 255, 0.8);
}
.dark .c-mc-1785216530606-8b051095-card-list {
  display: flex;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.dark .c-mc-1785216530606-8b051095-stat-card {
  box-sizing: border-box;
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  height: 74.2px;
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: transparent;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
.dark .c-mc-1785216530606-8b051095-stat-icon {
  display: block;
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex: 0 0 auto;
}
.dark .c-mc-1785216530606-8b051095-stat-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 100%;
  min-width: 0;
  margin-top: 2px;
  text-align: center;
}
.dark .c-mc-1785216530606-8b051095-stat-name {
  display: block;
  width: 100%;
  min-width: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dark .c-mc-1785216530606-8b051095-stat-value {
  display: block;
  width: 100%;
  min-width: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 20px;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.light {
  --em-font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  --em-panel-bg: #edf4fb;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-text-primary: #333333;
  --em-title-gradient: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  --em-tab-inactive-bg: #6680a0;
  --em-tab-inactive-text: #333333;
  --em-summary-text: #333333;
  --em-panel-bg: #ffffff;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.16);
  --em-text-primary: #1f2d3d;
  --em-summary-text: #1f2d3d;
  --em-tab-active-bg: #1990ff;
  --em-tab-active-border: #c7e0ff;
  --em-tab-active-text: #ffffff;
  --em-tab-inactive-bg: #eef5fb;
  --em-tab-inactive-border: #acc4e1;
  --em-tab-inactive-text: #334155;
}
.light :root {
  --em-font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  --em-title-gradient: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
  --em-tab-active-bg: #1990ff;
  --em-tab-active-border: #c7e0ff;
  --em-tab-active-text: #ffffff;
  --em-tab-inactive-bg: #6680a0;
  --em-tab-inactive-border: #acc4e1;
  --em-tab-inactive-text: #333333;
  --em-panel-bg: #edf4fb;
  --em-panel-shadow: 0 4px 10px rgba(74, 117, 141, 0.25);
  --em-text-primary: #333333;
  --em-summary-text: #333333;
}
.light .c-mc-1785216530606-8b051095-root {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 20px 14px;
  background: var(--em-panel-bg);
  box-shadow: var(--em-panel-shadow);
  overflow: hidden;
  font-family: var(--em-font-family);
  color: var(--em-text-primary);
}
.light .c-mc-1785216530606-8b051095-title-dot {
  display: block;
  width: 8px;
  height: 8px;
  object-fit: contain;
  flex: 0 0 auto;
}
.light .c-mc-1785216530606-8b051095-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.light .c-mc-1785216530606-8b051095-tab-button {
  box-sizing: border-box;
  height: 19px;
  min-width: 68px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0.75px solid var(--em-tab-inactive-border);
  background: var(--em-tab-inactive-bg);
  color: var(--em-tab-inactive-text);
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 19px;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  appearance: none;
  border-radius: 0;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.light .c-mc-1785216530606-8b051095-tab-button-active {
  border-color: var(--em-tab-active-border);
  background: var(--em-tab-active-bg);
  color: var(--em-tab-active-text);
  font-weight: 500;
}
.light .c-mc-1785216530606-8b051095-section-title {
  display: flex;
  align-items: center;
  min-height: 28px;
}
.light .c-mc-1785216530606-8b051095-section-title-text {
  display: inline-block;
  font-family: 'Noto Sans SC', 'Source Han Sans CN', sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 19.2px;
  text-align: left;
  color: transparent;
  background: var(--em-title-gradient);
  -webkit-background-clip: text;
  background-clip: text;
}
.light .c-mc-1785216530606-8b051095-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.light .c-mc-1785216530606-8b051095-summary-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.light .c-mc-1785216530606-8b051095-summary-icon {
  display: block;
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex: 0 0 auto;
}
.light .c-mc-1785216530606-8b051095-summary-text {
  display: inline-block;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  text-align: left;
  color: var(--em-summary-text);
  text-shadow: 0 5.0479px 5.0479px rgba(255, 255, 255, 0.8);
}
.light .c-mc-1785216530606-8b051095-card-list {
  display: flex;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.light .c-mc-1785216530606-8b051095-stat-card {
  box-sizing: border-box;
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  height: 74.2px;
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: transparent;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
.light .c-mc-1785216530606-8b051095-stat-icon {
  display: block;
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex: 0 0 auto;
}
.light .c-mc-1785216530606-8b051095-stat-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 100%;
  min-width: 0;
  margin-top: 2px;
  text-align: center;
}
.light .c-mc-1785216530606-8b051095-stat-name {
  display: block;
  width: 100%;
  min-width: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.light .c-mc-1785216530606-8b051095-stat-value {
  display: block;
  width: 100%;
  min-width: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 20px;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

</style>
