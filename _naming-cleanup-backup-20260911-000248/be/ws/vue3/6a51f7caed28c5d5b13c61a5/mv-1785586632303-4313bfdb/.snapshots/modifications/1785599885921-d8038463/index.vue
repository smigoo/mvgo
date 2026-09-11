<template>
  <div class="key-vehicle-monitor">
    <!-- 头部区域 -->
    <div class="monitor-header">
      <div class="header-title">
        <img :src="headerIcon" alt="header-icon" class="header-title-icon" />
        <span class="title-text">1重点车辆监测</span>
      </div>
      <div class="header-tabs" role="tablist" aria-label="地点切换">
        <button
          v-for="(tab, index) in tabs"
          :key="tab"
          :class="['tab-item', { active: activeTab === tab }]"
          role="tab"
          :aria-selected="activeTab === tab"
          :aria-controls="`panel-${index}`"
          :id="`tab-${index}`"
          tabindex="0"
          @click="activeTab = tab"
          @keydown="handleTabKeydown($event, index)"
        >
          {{ tab }}
        </button>
      </div>
    </div>

    <!-- 小标题区域 -->
    <div class="sub-header">
      <img :src="icon1" alt="sub-header-icon" class="sub-header-icon" />
      <span class="sub-header-text">今日累计</span>
    </div>

    <!-- 卡片区域 -->
    <div class="cards-container">
      <div
        v-for="(card, index) in cards"
        :key="card.label"
        class="vehicle-card"
        :style="{ backgroundImage: `url(${card.bg})` }"
        :id="`panel-${index}`"
        role="tabpanel"
        :aria-labelledby="`tab-${activeTabIndex}`"
      >
        <div class="card-icon-wrapper">
          <img :src="card.icon" :alt="card.label" class="card-icon" />
        </div>
        <div class="card-content">
          <div class="card-label">{{ card.label }}</div>
          <div class="card-metric">
            <span class="metric-value">{{ card.value }}</span>
            <span class="metric-unit">{{ card.unit }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from './resources/images/g-7961.png'
import bg1 from './resources/images/bg-126.png'
import bg2 from './resources/images/bg-124.png'
import bg3 from './resources/images/bg-125.png'
import icon2 from './resources/images/icon-123.png'
import icon3 from './resources/images/icon-8049.png'
import icon4 from './resources/images/icon-8036.png'
import icon5 from './resources/images/icon-8070.png'


import { ref, computed } from 'vue'

// 引入背景图资源

// 引入图标资源

const tabs = ['江阴靖江长江隧道', '江阴大桥']
const activeTab = ref('江阴靖江长江隧道')

const activeTabIndex = computed(() => tabs.indexOf(activeTab.value))

// 使用 icon2 作为头部标题装饰图标
const headerIcon = icon2

const handleTabKeydown = (event, index) => {
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    const nextIndex = (index + 1) % tabs.length
    activeTab.value = tabs[nextIndex]
    document.getElementById(`tab-${nextIndex}`)?.focus()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    const prevIndex = (index - 1 + tabs.length) % tabs.length
    activeTab.value = tabs[prevIndex]
    document.getElementById(`tab-${prevIndex}`)?.focus()
  }
}

const cards = ref([
  {
    label: '危化品车',
    value: '51',
    unit: '次',
    bg: bg2,
    icon: icon4
  },
  {
    label: '重型货车',
    value: '2',
    unit: '次',
    bg: bg3,
    icon: icon3
  },
  {
    label: '超高车辆',
    value: '19',
    unit: '次',
    bg: bg1,
    icon: icon5
  }
])
</script>

<style scoped>
.key-vehicle-monitor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #edf4fb;
  padding: 20px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #333333;
  overflow: hidden;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-title-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.title-text {
  font-size: 18px;
  font-weight: 600;
  color: #333333;
}

.header-tabs {
  display: flex;
  gap: 12px;
}

.tab-item {
  background: none;
  border: none;
  font-size: 14px;
  color: #666666;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 4px;
  transition: all 0.3s ease;
  outline: none;
}

.tab-item:hover {
  color: #1990ff;
}

.tab-item.active {
  color: #1990ff;
  font-weight: 600;
  background: rgba(25, 144, 255, 0.1);
}

.tab-item:focus-visible {
  box-shadow: 0 0 0 2px rgba(25, 144, 255, 0.4);
}

.sub-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.sub-header-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.sub-header-text {
  font-size: 16px;
  font-weight: 600;
  color: #333333;
}

.cards-container {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

.vehicle-card {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 20px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  border-radius: 8px;
  box-sizing: border-box;
  min-width: 0;
  transition: transform 0.3s ease;
}

.vehicle-card:hover {
  transform: translateY(-2px);
}

.card-icon-wrapper {
  width: 35%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.card-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.card-content {
  width: 65%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.card-label {
  font-size: 14px;
  color: #666666;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-metric {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #1990ff;
  line-height: 1.2;
}

.metric-unit {
  font-size: 14px;
  color: #666666;
}</style>