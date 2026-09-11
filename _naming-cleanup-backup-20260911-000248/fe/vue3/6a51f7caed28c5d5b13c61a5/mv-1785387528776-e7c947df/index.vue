<template>
  <div class="mv-1785387528776-e7c947df">
    <!-- 面板头部 -->
    <div class="panel-header">
      <div class="header-left">
        <div class="header-icon"></div>
        <span class="header-title">设备监测</span>
      </div>
      <div class="header-stats">
        <div class="stat-item">
          <span class="stat-label">设备类型</span>
          <span class="stat-value">6</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">设备总数</span>
          <span class="stat-value">1,240</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">完好率</span>
          <span class="stat-value">98.5%</span>
        </div>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="panel-content">
      <!-- Tab 切换 -->
      <div class="tab-switch" role="tablist">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab-item', { 'is-active': activeTab === tab.id }]"
          role="tab"
          :aria-selected="activeTab === tab.id"
          tabindex="0"
          @click="handleTabChange(tab.id)"
          @keydown.enter="handleTabChange(tab.id)"
          @keydown.space.prevent="handleTabChange(tab.id)"
        >
          {{ tab.label }}
        </div>
      </div>

      <!-- 设备卡片列表 -->
      <div class="card-list">
        <div
          v-for="card in filteredCards"
          :key="card.id"
          class="device-card"
          :style="{ backgroundImage: `url('../resources/images/${card.bg}')` }"
          role="article"
          :aria-label="`${card.name} 设备状态: ${card.status}`"
        >
          <div class="card-top">
            <div class="card-icon" :style="{ backgroundImage: `url('../resources/images/${card.icon}')` }"></div>
            <div class="card-status-badge" :class="{ 'is-error': card.status === '故障' }">
              {{ card.status }}
            </div>
          </div>
          <div class="card-bottom">
            <div class="card-name">{{ card.name }}</div>
            <div class="card-count">
              <span class="count-value">{{ card.count }}</span>
              <span class="count-unit">台</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// #region 1. Props定义
const props = defineProps({
  isVisible: { type: Boolean, default: true },
  initialTab: { type: String, default: 'all' }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['tab-change', 'card-click'])
// #endregion

// #region 3. 响应式状态
const activeTab = ref(props.initialTab)

const tabs = ref([
  { id: 'all', label: '全部' },
  { id: 'normal', label: '正常' },
  { id: 'error', label: '故障' }
])

const deviceCards = ref([
  { id: 1, name: '视频监控', status: '正常', count: 450, bg: 'bg-8439.png', icon: 'icon-8444.png' },
  { id: 2, name: '毫米波雷达', status: '正常', count: 120, bg: 'bg-8468.png', icon: 'icon-8473.png' },
  { id: 3, name: '气象检测器', status: '正常', count: 85, bg: 'bg-8498.png', icon: 'icon-8503.png' },
  { id: 4, name: '可变情报板', status: '故障', count: 32, bg: 'bg-8527.png', icon: 'icon-8532.png' },
  { id: 5, name: '车辆检测器', status: '正常', count: 210, bg: 'bg-8556.png', icon: 'icon-8590.png' },
  { id: 6, name: '光端机', status: '正常', count: 343, bg: 'bg-8614.png', icon: 'Frame-8856.png' }
])
// #endregion

// #region 4. 计算属性
const filteredCards = computed(() => {
  if (activeTab.value === 'all') return deviceCards.value
  return deviceCards.value.filter(card => {
    if (activeTab.value === 'normal') return card.status === '正常'
    if (activeTab.value === 'error') return card.status === '故障'
    return true
  })
})
// #endregion

// #region 5. 方法
const handleTabChange = (tabId) => {
  if (activeTab.value === tabId) return
  activeTab.value = tabId
  emit('tab-change', tabId)
}

const handleCardClick = (card) => {
  emit('card-click', card)
}
// #endregion

// #region 6. 生命周期
onMounted(() => {
  // 组件挂载逻辑
})

onUnmounted(() => {
  // 清理资源
})
// #endregion
</script>

<style scoped lang="less">
.mv-1785387528776-e7c947df {
  width: 100%;
  height: 100%;
  background: #141414;
  display: flex;
  flex-direction: column;
  color: #ffffff;
  font-size: 14px;
  overflow: hidden;
  border-radius: 4px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;

    .header-icon {
      width: 24px;
      height: 24px;
      background: url('../resources/images/g-8421.png') no-repeat center / contain;
    }

    .header-title {
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
    }
  }

  .header-stats {
    display: flex;
    gap: 32px;

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;

      .stat-label {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
      }

      .stat-value {
        font-size: 18px;
        font-weight: 600;
        background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
    }
  }
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  min-height: 0;
  overflow: hidden;
}

.tab-switch {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-shrink: 0;

  .tab-item {
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.3s ease;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);

    &:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    &.is-active {
      color: #ffffff;
      background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
      border-color: transparent;
      font-weight: 500;
    }
  }
}

.card-list {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }
}

.device-card {
  position: relative;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 140px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.6) 100%);
    z-index: 1;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .card-top {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;

    .card-icon {
      width: 36px;
      height: 36px;
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
    }

    .card-status-badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
      background: linear-gradient(270deg, #85baff 0%, #bfe2ff 100%);
      color: #141414;
      font-weight: 500;

      &.is-error {
        background: #f53f3f;
        color: #ffffff;
      }
    }
  }

  .card-bottom {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;

    .card-name {
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
    }

    .card-count {
      display: flex;
      align-items: baseline;
      gap: 2px;

      .count-value {
        font-size: 24px;
        font-weight: 700;
        color: #ffffff;
      }

      .count-unit {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
      }
    }
  }
}</style>