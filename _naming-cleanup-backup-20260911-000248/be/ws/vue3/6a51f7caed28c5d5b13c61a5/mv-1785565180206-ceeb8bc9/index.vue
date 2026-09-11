<template>
  <div class="mv-1785565180206-ceeb8bc9">
    <div class="mv-1785565180206-ceeb8bc9-header">
      <div class="mv-1785565180206-ceeb8bc9-title">
        <img class="mv-1785565180206-ceeb8bc9-title-icon" src="./resources/images/g-7961.png" />
        <span>重点车辆监测</span>
      </div>
      <div class="mv-1785565180206-ceeb8bc9-tabs">
        <div
          v-for="(tab, index) in tabs"
          :key="index"
          :class="[
            'mv-1785565180206-ceeb8bc9-tab',
            { active: activeTab === index }
          ]"
          @click="handleTabClick(index)"
          @keydown="handleTabKeydown($event, index)"
          tabindex="0"
        >
          {{ tab.name }}
        </div>
      </div>
    </div>
    <div class="mv-1785565180206-ceeb8bc9-section">
      <div class="mv-1785565180206-ceeb8bc9-sub-header">
        <img class="mv-1785565180206-ceeb8bc9-sub-header-icon" src="./resources/images/icon-123.png" />
        <span class="mv-1785565180206-ceeb8bc9-sub-header-text">今日累计</span>
      </div>
      <div class="mv-1785565180206-ceeb8bc9-card-group">
        <div class="mv-1785565180206-ceeb8bc9-stat-card mv-1785565180206-ceeb8bc9-stat-card-1">
          <img class="mv-1785565180206-ceeb8bc9-stat-icon" src="./resources/images/icon-8049.png" />
          <div class="mv-1785565180206-ceeb8bc9-info-group">
            <span class="mv-1785565180206-ceeb8bc9-text-label">危化品车</span>
            <div class="mv-1785565180206-ceeb8bc9-value-row">
              <span class="mv-1785565180206-ceeb8bc9-value-num" style="color: #ff3333;">51</span>
              <span class="mv-1785565180206-ceeb8bc9-value-unit">次</span>
            </div>
          </div>
        </div>
        <div class="mv-1785565180206-ceeb8bc9-stat-card mv-1785565180206-ceeb8bc9-stat-card-2">
          <img class="mv-1785565180206-ceeb8bc9-stat-icon" src="./resources/images/icon-8036.png" />
          <div class="mv-1785565180206-ceeb8bc9-info-group">
            <span class="mv-1785565180206-ceeb8bc9-text-label">重型货车</span>
            <div class="mv-1785565180206-ceeb8bc9-value-row">
              <span class="mv-1785565180206-ceeb8bc9-value-num" style="color: #1990ff;">2</span>
              <span class="mv-1785565180206-ceeb8bc9-value-unit">次</span>
            </div>
          </div>
        </div>
        <div class="mv-1785565180206-ceeb8bc9-stat-card mv-1785565180206-ceeb8bc9-stat-card-3">
          <img class="mv-1785565180206-ceeb8bc9-stat-icon" src="./resources/images/icon-8070.png" />
          <div class="mv-1785565180206-ceeb8bc9-info-group">
            <span class="mv-1785565180206-ceeb8bc9-text-label">超高车辆</span>
            <div class="mv-1785565180206-ceeb8bc9-value-row">
              <span class="mv-1785565180206-ceeb8bc9-value-num" style="color: #ff9900;">19</span>
              <span class="mv-1785565180206-ceeb8bc9-value-unit">次</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const activeTab = ref(0);
const tabs = [
  { name: '江阴靖江长江隧道' },
  { name: '江阴大桥' }
];

const handleTabClick = (index) => {
  activeTab.value = index;
};

const handleTabKeydown = (e, index) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleTabClick(index);
  }
};
</script>

<style lang="less" scoped>
.mv-1785565180206-ceeb8bc9 {
  width: 100%;
  height: 100%;
  background-color: #8fa3b8;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #edf4fbb2;
    pointer-events: none;
    z-index: 0;
  }

  > * {
    position: relative;
    z-index: 1;
  }
}

.mv-1785565180206-ceeb8bc9-header {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.mv-1785565180206-ceeb8bc9-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #1990ff;
  font-size: 16px;
  font-weight: bold;
}

.mv-1785565180206-ceeb8bc9-title-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.mv-1785565180206-ceeb8bc9-tabs {
  display: flex;
  gap: 8px;
}

.mv-1785565180206-ceeb8bc9-tab {
  padding: 4px 12px;
  border-radius: 10px;
  font-size: 12px;
  cursor: pointer;
  color: #6680a0;
  transition: all 0.2s ease;
  outline: none;

  &.active {
    background-color: #1990ff;
    color: #ffffff;
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px rgba(25, 144, 255, 0.5);
  }
}

.mv-1785565180206-ceeb8bc9-section {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.mv-1785565180206-ceeb8bc9-sub-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.mv-1785565180206-ceeb8bc9-sub-header-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.mv-1785565180206-ceeb8bc9-sub-header-text {
  color: #ffffff;
  font-size: 14px;
}

.mv-1785565180206-ceeb8bc9-card-group {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-top: 12px;
  flex: 1;
  min-height: 0;
}

.mv-1785565180206-ceeb8bc9-stat-card {
  width: 120px;
  height: 74px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 10px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;

  &.mv-1785565180206-ceeb8bc9-stat-card-1 {
    background-image: url('../resources/images/bg-124.png');
  }

  &.mv-1785565180206-ceeb8bc9-stat-card-2 {
    background-image: url('../resources/images/bg-125.png');
  }

  &.mv-1785565180206-ceeb8bc9-stat-card-3 {
    background-image: url('../resources/images/bg-126.png');
  }
}

.mv-1785565180206-ceeb8bc9-stat-icon {
  width: auto;
  height: 40px;
  object-fit: contain;
  flex-shrink: 0;
}

.mv-1785565180206-ceeb8bc9-info-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.mv-1785565180206-ceeb8bc9-text-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
}

.mv-1785565180206-ceeb8bc9-text-label {
  color: #ffffff;
  font-size: 12px;
}

.mv-1785565180206-ceeb8bc9-value-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
}

.mv-1785565180206-ceeb8bc9-value-num {
  font-size: 20px;
  font-weight: bold;
}

.mv-1785565180206-ceeb8bc9-value-unit {
  color: #ffffff;
  font-size: 12px;
  margin-left: 2px;
}</style>