<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-aiot-dpjh-bsjd-slot-con c-mc-max-1791967522207-a715fafc" style="display:flex;flex-direction:column;">
      <div class="c-aiot-dpjh-bsjd-con-con" data-section-id="565:3" style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div class="c-aiot-dpjh-bsjd-list-con" data-section-id="48:5798" style="flex:1 1 0;min-height:0;display:flex;flex-direction:column;" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '459px 29px', backgroundPosition: '6px 0px', backgroundRepeat: 'no-repeat' }">
          <ContentSection style="flex:1.000;min-height:0;" />
        </div>
        <div class="c-aiot-dpjh-bsjd-group-2136638416-con" data-section-id="48:5813-list" style="flex:0 0 auto; height:72px;min-height:0;display:flex;flex-direction:column;">
          <ContentSection3 style="flex:1.000;min-height:0;" />
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/image_313-5800.png'


import { onMounted, onUnmounted} from 'vue'
import HeaderSection from './components/HeaderSection.vue'
import ContentSection from './components/ContentSection.vue'
import ContentSection3 from './components/ContentSection3.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 组件加载完成事件 ===
onMounted(() => {
  runtimeBuilder.publishEvent('aiot-dpjh-bsjd-onload', {
    componentId: 'aiot-dpjh-bsjd',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 本组件无监听事件，无需清理
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
