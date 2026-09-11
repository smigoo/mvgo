<template>
  <div class="c-env-monitor-tabs-wrapper">
    <div class="c-env-monitor-tabs-list">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        class="c-env-monitor-tab-item"
        :class="{ 'is-active': activeTab === tab.value }"
        @click="$emit('change', tab.value)"
      >
        <div
          v-if="activeTab === tab.value"
          class="c-env-monitor-tab-active-bg"
          :style="{ backgroundImage: 'url(' + bg2 + ')' }"
        ></div>
        <span class="c-env-monitor-tab-text">{{ tab.label }}</span>
      </div>
    </div>
    <div class="c-env-monitor-tabs-icons">
      <div class="c-env-monitor-icon-btn" title="柱状图视图">
        <div class="c-env-monitor-icon-bar">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div class="c-env-monitor-icon-btn" title="列表视图">
        <div class="c-env-monitor-icon-list">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div class="c-env-monitor-badge">6</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  tabs: {
    type: Array,
    default: () => []
  },
  activeTab: {
    type: String,
    default: ''
  }
})

defineEmits(['change'])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  width: 100%;
}

.c-env-monitor-tabs-list {
  display: flex;
  align-items: center;
  height: 27px;
  flex: 1;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border-radius: 4px;
  padding: 3px;
  box-sizing: border-box;
}

.c-env-monitor-tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  z-index: 1;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  z-index: -1;
}

.c-env-monitor-tab-text {
  font-size: @fontSize;
  font-weight: 500;
  color: #2c9bea;
  white-space: nowrap;
}

.is-active .c-env-monitor-tab-text {
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-tabs-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
  margin-left: 8px;
}

.c-env-monitor-icon-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(161, 206, 255, 1);
}

.c-env-monitor-icon-bar {
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  width: 12px;
  height: 12px;

  span {
    flex: 1;
    background: #4e9bff;
    border-radius: 1px;

    &:nth-child(1) {
      height: 60%;
    }
    &:nth-child(2) {
      height: 100%;
    }
    &:nth-child(3) {
      height: 40%;
    }
  }
}

.c-env-monitor-icon-list {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 12px;
  height: 12px;

  span {
    width: 100%;
    height: 2px;
    background: #4e9bff;
    border-radius: 1px;
  }
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f53f3f;
  color: #ffffff;
  font-size: calc(@fontSize * 0.85);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  z-index: 2;
}
</style>