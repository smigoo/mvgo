<template>
  <div class="c-monitor-main-content">
    <NavTabs 
      :items="navItems"
      :active-key="activeCategory"
      @change="$emit('category-change', $event)"
    />
    <DeviceGrid :devices="deviceList" />
  </div>
</template>

<script setup>
import NavTabs from './NavTabs.vue'
import DeviceGrid from './DeviceGrid.vue'

defineProps({
  navItems: {
    type: Array,
    default: () => []
  },
  deviceList: {
    type: Array,
    default: () => []
  },
  activeCategory: {
    type: String,
    default: ''
  }
})

defineEmits(['category-change'])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  overflow: hidden;
}
</style>
```

```vue