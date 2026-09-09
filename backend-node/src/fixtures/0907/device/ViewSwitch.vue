<template>
  <div class="c-device-monitor-malvtjd5-c-device-monitor-switch-container">
<div v-for="tab in tabs" :key="tab.id" :class="['c-device-monitor-switch-tab', {'is-active': activeTab === tab.id }]" :style="getTabBgStyle(tab)" @click="handleTabClick(tab.id)" >
      <!-- 图标 -->
      <img :src="tab.icon" class="c-device-monitor-malvtjd5-c-device-monitor-switch-icon" />

      <!-- 标题 -->
      <div class="c-device-monitor-malvtjd5-c-device-monitor-switch-title">{{ tab.title }}</div>

      <!-- 异常数标签 -->
      <div class="c-device-monitor-malvtjd5-c-device-monitor-switch-label">异常数</div>

      <!-- 异常数值 -->
      <div class="c-device-monitor-malvtjd5-c-device-monitor-switch-abnormal">{{ tab.abnormalCount }}</div>

      <!-- 总数信息 -->
      <div class="c-device-monitor-malvtjd5-c-device-monitor-switch-stats">
        <span class="c-device-monitor-malvtjd5-c-device-monitor-switch-stats-label">总数:</span>
        <span class="c-device-monitor-malvtjd5-c-device-monitor-switch-stats-value">{{ tab.totalCount }}</span>
      </div>

      <!-- 进度信息（仅第一个Tab显示） -->
      <div v-if="tab.progress" class="c-device-monitor-malvtjd5-c-device-monitor-switch-progress">
        {{ tab.progress }}
      </div>
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/icon-8798.png'
import bg1 from '../../resources/images/bg-8788.png'
import icon2 from '../../resources/images/icon-8817.png'
import bg2 from '../../resources/images/bg-8807.png'


import { ref} from 'vue'

// Tab 数据
const tabs = ref([ { id: 'tunnel', title: '隧道设备', icon: icon1, abnormalCount: 5, totalCount: 56302, progress: '3/3740', bgImage: bg1
  },
  {
    id: 'building',
    title: '房屋建筑\n设备',
    icon: icon2,
    abnormalCount: 3,
    totalCount: 1280,
    progress: null,
    bgImage: bg2
  }
])

// 当前激活的Tab
const activeTab = ref('tunnel')

// 获取Tab背景样式
const getTabBgStyle = (tab) => { return { backgroundImage: `url(${tab.bgImage})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat'
  }
}

// Tab点击处理
const handleTabClick = (tabId) => { if (activeTab.value === tabId) return
  activeTab.value = tabId
  // 这里可以触发数据刷新或其他业务逻辑
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-switch-container {
width: 100%;

  display: flex;
  gap: 12px;
  flex: 65 1 0;
  min-height: 0;
}

.c-device-monitor-switch-tab {
  flex: 1;
  min-height: 0;
  padding: 8px 12px;
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: opacity 0.3s;

  &:hover {
    opacity: 0.9;
  }

  &.is-active {
    // 激活态样式已在背景图中体现
  }
}

.c-device-monitor-switch-icon {
  width: 35px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-device-monitor-switch-title {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 400;
  line-height: 1.3;
  text-align: center;
  white-space: pre-line;
}

.c-device-monitor-switch-label {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
  line-height: 1.5;
}

.c-device-monitor-switch-abnormal {
  font-size: calc(var(--fontSize, 14px) * 1.714);
  font-weight: 700;
  line-height: 1.17;
  color: rgba(255, 87, 87, 1);
}

.c-device-monitor-switch-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  line-height: 1.5;
}

.c-device-monitor-switch-stats-label {
  opacity: 0.8;
}

.c-device-monitor-switch-stats-value {
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
}

.c-device-monitor-switch-progress {
  font-size: calc(var(--fontSize, 14px) * 0.714);
  line-height: 1.8;
  opacity: 0.8;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  margin-top: 4px;
}

// 深色主题Tab默认态文字色
.c-device-monitor-switch-tab:not(.is-active) {
  .c-device-monitor-switch-title,
  .c-device-monitor-switch-label,
  .c-device-monitor-switch-stats {
    color: rgba(51, 51, 51, 1);
  }
}

// 深色主题Tab激活态文字色
.c-device-monitor-switch-tab.is-active {
  .c-device-monitor-switch-title,
  .c-device-monitor-switch-label,
  .c-device-monitor-switch-stats {
    color: rgba(255, 255, 255, 1);
  }
}
</style>