<template>
  <div class="c-env-monitor-header-tabs">
    <!-- Tab 列表容器 -->
    <div class="c-env-monitor-tabs-wrapper">
      <div 
        class="c-env-monitor-tabs-bg"
        :style="{ backgroundImage: tabBg ? `url(${tabBg})` : 'none' }"
      >
        <div 
          v-for="tab in tabs" 
          :key="tab.value"
          :class="['c-env-monitor-tab-item', { active: activeTab === tab.value }]"
          @click="handleTabClick(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>
    </div>

    <!-- 功能图标区 -->
    <div class="c-env-monitor-tabs-icons">
      <div class="c-env-monitor-icon-btn">
        <img :src="iconChart" class="c-env-monitor-icon-img" alt="图表视图" />
      </div>
      <div class="c-env-monitor-icon-btn">
        <img :src="iconList" class="c-env-monitor-icon-img" alt="列表视图" />
        <span v-if="badgeCount > 0" class="c-env-monitor-badge">{{ badgeCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  tabs: {
    type: Array,
    default: () => []
  },
  activeTab: {
    type: String,
    default: ''
  },
  tabBg: {
    type: String,
    default: ''
  },
  iconChart: {
    type: String,
    default: ''
  },
  iconList: {
    type: String,
    default: ''
  },
  badgeCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['tab-change'])

const handleTabClick = (value) => {
  emit('tab-change', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-header-tabs {
flex: none;

  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.c-env-monitor-tabs-wrapper {
  flex: 1;
  min-width: 0;
}

.c-env-monitor-tabs-bg {
  display: flex;
  align-items: center;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  padding: 3px;
  border-radius: 4px;
}

.c-env-monitor-tab-item {
  flex: 1;
  padding: 6px 12px;
  font-size: var(--fontSize, 14px);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;

  &.active {
    color: #1a2b4a;
    background: rgba(255, 255, 255, 0.95);
  }

  &:hover:not(.active) {
    color: #ffffff;
  }
}

.c-env-monitor-tabs-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  transition: all 0.3s ease;
  flex-shrink: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.28);
  }
}

.c-env-monitor-icon-img {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-env-monitor-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 500;
  color: #ffffff;
  background: #f53f3f;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
</style>
