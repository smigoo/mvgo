<template>
  <div class="c-env-monitor-tabs">
    <div
      v-for="tab in tabs"
      :key="tab.key"
      :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.key }]"
      @click="handleTabClick(tab.key)"
    >
      <div
        v-if="activeTab === tab.key"
        class="c-env-monitor-tab-active-bg"
        :style="{ backgroundImage: 'url(' + bg3 + ')' }"
      ></div>
      <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  activeTab: {
    type: String,
    default: '一氧化碳'
  }
})

const emit = defineEmits(['update:activeTab'])

const tabs = [
  { key: '一氧化碳', label: '一氧化碳' },
  { key: '能见度', label: '能见度' },
  { key: '洞内照明', label: '洞内照明' },
  { key: '洞外光强', label: '洞外光强' }
]

const handleTabClick = (key) => {
  if (props.activeTab !== key) {
    emit('update:activeTab', key)
  }
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs {
  display: flex;
  align-items: center;
  height: 27px;
  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
  padding: 3px;
  box-sizing: border-box;
}

.c-env-monitor-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  position: relative;
  cursor: pointer;
  z-index: 1;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 78px;
  height: 21px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  z-index: -1;
}

.c-env-monitor-tab-text {
  font-size: 14px;
  font-weight: 500;
  color: #2c9bea;
  white-space: nowrap;
  position: relative;
  z-index: 2;
}

.c-env-monitor-tab-item.is-active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}
</style>