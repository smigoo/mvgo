<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-device-monitor-slot-con c-mc-max-1790678096786-f5cac254">
      <div class="c-device-monitor-con-con" data-section-id="89:40" style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div class="c-device-monitor-switch-con" data-section-id="89:38" style="flex:0.170;min-height:0;display:flex;flex-direction:row;align-items:stretch;">
          <ContentActive style="flex:1;min-width:0;"  @click="switchSelected = 'active'" :class="switchSelected === 'active' ? 'c-device-monitor-state-switch c-device-monitor-state-switch--active' : 'c-device-monitor-state-switch'" />
          <ContentDefault style="flex:1;min-width:0;"  @click="switchSelected = 'default'" :class="switchSelected === 'default' ? 'c-device-monitor-state-switch c-device-monitor-state-switch--default' : 'c-device-monitor-state-switch'" / :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        </div>
        <div class="c-device-monitor-antd-tab-con" data-section-id="89:37" style="flex:0.830;min-height:0;display:flex;flex-direction:row;align-items:stretch;">
          <TabsSection style="flex:0.111;min-width:0;" />
          <ContentCons style="flex:0.889;min-width:0;" />
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref } from 'vue'

import bg2 from '../resources/images/bg-8807.png'

// 🛡️ P-09 状态切换交互（确定性装配）

const switchSelected = ref('active')

import { onMounted, onUnmounted} from 'vue'

// 子组件（按 Figma 嵌套树组装，容器不单独建文件）
import HeaderSection from './components/HeaderSection.vue'
import ContentActive from './components/ContentActive.vue'
import ContentDefault from './components/ContentDefault.vue'
import TabsSection from './components/TabsSection.vue'
import ContentCons from './components/ContentCons.vue'

// 一次调用 $mcComponentBuilder 并直接解构（声明+赋值一体，杜绝 TDZ）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 触发组件加载完成事件
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('device-monitor-onload', {
    componentId: 'device-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 本组件未注册 listenEvent，无需 removeListener
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
