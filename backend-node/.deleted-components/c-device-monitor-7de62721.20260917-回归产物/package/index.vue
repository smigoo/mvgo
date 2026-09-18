<template>
  
    <HeaderSection />
    <ContentDefault  @click="switchSelected = 'default'" :class="switchSelected === 'default' ? 'state-switch state-switch--default' : 'state-switch'" />
    <TabsSection />
</template>

<script setup>
import { ref } from 'vue'

// 🛡️ P-09 状态切换交互（确定性装配）

const switchSelected = ref('active')

import HeaderSection from './components/HeaderSection.vue'
import ContentDefault from './components/ContentDefault.vue'
import TabsSection from './components/TabsSection.vue'
import { onMounted} from 'vue'
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

onMounted(() => {
  runtimeBuilder.publishEvent('设备监控-onload', {
    componentProps: componentProps.value,
    businessProps: businessProps.value
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>