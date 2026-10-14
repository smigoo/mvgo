<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-aiot-dpjh-bsjd-slot-con" style="display:flex;flex-direction:column;" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '459px 29px', backgroundPosition: '6px 0px', backgroundRepeat: 'no-repeat' }">
      <div class="c-aiot-dpjh-bsjd-con-con" data-section-id="565:3" style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div class="c-aiot-dpjh-bsjd-group-2136638415-con" data-section-id="48:5798-list" style="flex:1.000;min-height:0;display:flex;flex-direction:column;">
          <ContentSection style="flex:1.000;min-height:0;" />
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/image_313-5800.png'
import { onMounted } from 'vue'
import HeaderSection from './components/HeaderSection.vue'
import ContentSection from './components/ContentSection.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { runtimeBuilder } = $mcComponentBuilder()

onMounted(() => {
  runtimeBuilder.publishEvent('aiot-dpjh-bsjd-onload', {
    componentId: 'aiot-dpjh-bsjd',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
