<template>
  <div class="section-tabs-container">
    <div class="tabs-wrapper">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        :class="['tab-button', { active: activeTab === tab.value }]"
        @click="handleTabClick(tab.value)"
      >
        <img :src="tab.icon" :alt="tab.label" class="tab-icon" />
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const props = defineProps({
  activeTab: {
    type: String,
    default: 'overview'
  }
})

const emit = defineEmits(['update:activeTab'])

const tabs = computed(() => [
  { value: 'overview', label: '概览', icon: businessProps.value.icon1 },
  { value: 'trend', label: '趋势', icon: businessProps.value.icon2 },
  { value: 'distribution', label: '分布', icon: businessProps.value.icon3 },
  { value: 'detail', label: '明细', icon: businessProps.value.icon4 }
])

const handleTabClick = (value) => {
  emit('update:activeTab', value)
  runtimeBuilder.publishEvent('SectionTabsAndIcons-tabChange', { tab: value })
}

onMounted(() => {
  runtimeBuilder.publishEvent('SectionTabsAndIcons-onload', {
    component: 'SectionTabsAndIcons',
    timestamp: Date.now()
  })
})
</script>

<style scoped>
.section-tabs-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.tabs-wrapper {
  display: flex;
  gap: 8px;
  background: #F7F4EF;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid #E7E1D7;
}

.tab-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  background: transparent;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  color: #5C635D;
  font-weight: 400;
}

.tab-button:hover {
  background: #FBF9F5;
  transform: translateY(-1px);
}

.tab-button.active {
  background: #FFFFFF;
  color: #1F2421;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.tab-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.tab-label {
  white-space: nowrap;
}
</style>
