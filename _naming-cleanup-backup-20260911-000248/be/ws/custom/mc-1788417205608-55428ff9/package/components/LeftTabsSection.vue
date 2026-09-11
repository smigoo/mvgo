<template>
  <div class="c-monitor-left-tabs">
    <div class="c-monitor-tabs-list">
      <!-- 监控 Tab（激活态） -->
      <div
        class="c-monitor-tab-item c-monitor-tab-item--active"
        @click="handleTabClick('monitor')"
      >
        <div
          class="c-monitor-tab-bg"
          :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        >
          <div class="c-monitor-tab-badge" :style="{ backgroundImage: 'url(' + bg5 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">3/3740</div>
          <span class="c-monitor-tab-label c-monitor-tab-label--active" :style="{ backgroundImage: 'url(' + bg6 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">监控</span>
        </div>
      </div>

      <!-- 照明 Tab -->
      <div
        class="c-monitor-tab-item"
        :class="{ 'c-monitor-tab-item--active': activeTab === 'lighting' }"
        @click="handleTabClick('lighting')"
      >
        <div
          class="c-monitor-tab-bg"
        >
          <div class="c-monitor-tab-badge c-monitor-tab-badge--error" :style="{ backgroundImage: 'url(' + bg7 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">3</div>
          <span class="c-monitor-tab-label" :style="{ backgroundImage: 'url(' + bg8 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">照明</span>
        </div>
      </div>

      <!-- 通风 Tab -->
      <div
        class="c-monitor-tab-item"
        :class="{ 'c-monitor-tab-item--active': activeTab === 'ventilation' }"
        @click="handleTabClick('ventilation')"
      >
        <div class="c-monitor-tab-bg c-monitor-tab-bg--default" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <span class="c-monitor-tab-label">通风</span>
        </div>
      </div>

      <!-- 供配电 Tab -->
      <div
        class="c-monitor-tab-item"
        :class="{ 'c-monitor-tab-item--active': activeTab === 'power' }"
        @click="handleTabClick('power')"
      >
        <div class="c-monitor-tab-bg c-monitor-tab-bg--default" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
          <span class="c-monitor-tab-label">供配电</span>
        </div>
      </div>

      <!-- 消防 Tab -->
      <div
        class="c-monitor-tab-item"
        :class="{ 'c-monitor-tab-item--active': activeTab === 'fire' }"
        @click="handleTabClick('fire')"
      >
        <div class="c-monitor-tab-bg c-monitor-tab-bg--default">
          <span class="c-monitor-tab-label">消防</span>
        </div>
      </div>

      <!-- 交通诱导 Tab -->
      <div
        class="c-monitor-tab-item"
        :class="{ 'c-monitor-tab-item--active': activeTab === 'traffic' }"
        @click="handleTabClick('traffic')"
      >
        <div class="c-monitor-tab-bg c-monitor-tab-bg--default">
          <span class="c-monitor-tab-label">交通诱导</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-8788.png'
import bg5 from '../../resources/images/bg-8439.png'
import bg2 from '../../resources/images/bg-8807.png'
const bg6 = bg5
const bg7 = bg5
const bg8 = bg5
const bg4 = bg5


import { ref} from 'vue'

// 资源变量由系统自动注入，无需手写 import
// bg1 = bg-8788.png（监控激活态背景）
// bg2 = bg-8807.png（照明默认态背景）

const props = defineProps({
  modelValue: {
    type: String,
    default: 'monitor'
  }
})

const emit = defineEmits(['update:modelValue', 'tab-change'])

const activeTab = ref(props.modelValue || 'monitor')

const handleTabClick = (tabKey) => {
  if (activeTab.value === tabKey) return
  activeTab.value = tabKey
  emit('update:modelValue', tabKey)
  emit('tab-change', tabKey)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-left-tabs {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}

.c-monitor-tabs-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;}

.c-monitor-tab-item {
  width: 34px;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;

  &--active {
    width: 38px;
  }
}

.c-monitor-tab-bg {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 0;
  min-height: 44px;
  position: relative;
  box-sizing: border-box;

  &--default {
  }
}

.c-monitor-tab-item--active .c-monitor-tab-bg {
  width: 38px;
  min-height: 54px;
}

.c-monitor-tab-badge {
  position: absolute;
  top: -8px;
  right: -6px;
  background: rgba(255, 255, 255, 1);
  color: rgba(25, 144, 255, 1);
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 500;
  line-height: 18px;
  height: 18px;
  padding: 0 4px;
  white-space: nowrap;
  z-index: 1;

  &--error {
    background: rgba(255, 77, 79, 1);
    color: rgba(255, 255, 255, 1);
    width: 14px;
    height: 14px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: calc(var(--fontSize, 14px) * 0.857);
  }
}

.c-monitor-tab-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: calc(var(--fontSize, 14px) * 1);
  font-weight: 400;
  color: rgba(59, 128, 231, 1);
  line-height: 16px;
  text-align: center;
  white-space: nowrap;
  flex-shrink: 0;

  &--active {
    color: rgba(255, 255, 255, 1);
    font-weight: 700;
  }
}

.c-monitor-tab-item--active .c-monitor-tab-label {
  color: rgba(255, 255, 255, 1);
  font-weight: 700;
}
</style>