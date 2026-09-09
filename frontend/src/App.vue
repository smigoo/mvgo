<template>
  <!-- 预览页：完全独立，不使用任何公共布局 -->
  <router-view v-if="isPreviewPage" />

  <!-- 其他页面：使用公共布局 -->
  <div v-else class="app-layout">
    <StyleProvider :transformers="[px2rem]" v-if="$config.pxtorem.open">
      <a-config-provider :locale="locale" :theme="antThemeConfig">
        <div class="app-layout__inner">
          <AppHeader v-if="!isDemoPage" @open-config="openGlobalConfig" />
          <main :class="['app-content', { 'app-content--with-header': !isDemoPage }]">
            <router-view />
          </main>
          <AppFooter v-if="!hideFooter" />
          <ConfigPanel v-if="showConfig" v-model:visible="showConfig" />
        </div>
      </a-config-provider>
    </StyleProvider>
    <a-config-provider :locale="locale" :theme="antThemeConfig" v-else>
      <div class="app-layout__inner">
        <AppHeader v-if="!isDemoPage" @open-config="openGlobalConfig" />
        <main :class="['app-content', { 'app-content--with-header': !isDemoPage }]">
          <router-view />
        </main>
        <AppFooter v-if="!hideFooter" />
        <ConfigPanel v-if="showConfig" v-model:visible="showConfig" />
      </div>
    </a-config-provider>
    <!-- 全局工作流监控边栏（登录/预览页不显示） -->
    <WorkflowMonitor v-if="!isDemoPage" />

    <!-- 全局接口对接向导：预览页（iframe 内）点击「对接接口」时由 postMessage 触发，右侧抽屉打开，
         保留预览上下文。挂在独立的 config-provider 下以保证主题上下文。 -->
    <a-config-provider :locale="locale" :theme="antThemeConfig" v-if="!isPreviewPage">
      <ApiBindingWizard
        v-model:open="bindingWizardOpen"
        :componentId="bindingComponentId"
        :groupId="bindingGroupId"
        :componentName="bindingComponentName"
        surface="drawer"
        @refresh-preview="emitRefresh"
      />
    </a-config-provider>
  </div>
</template>

<script setup>
import { ref, computed, provide } from 'vue'
import { useRoute } from 'vue-router'
import { px2remTransformer, StyleProvider } from 'ant-design-vue'
import AppHeader from '@/components/generator/AppHeader.vue'
import AppFooter from '@/components/generator/AppFooter.vue'
import ConfigPanel from '@/components/generator/ConfigPanel.vue'
import WorkflowMonitor from '@/components/generator/WorkflowMonitor.vue'
import ApiBindingWizard from '@/views/workspace/ApiBindingWizard.vue'
import { useApiBindingBridge } from '@/composables/useApiBindingBridge'
import { useTheme } from '@/composables/useTheme'

const { antThemeConfig } = useTheme()

const px2rem = px2remTransformer({
  rootValue: $config.pxtorem.baseSize
})
import zhCN from 'ant-design-vue/es/locale/zh_CN'
const locale = zhCN
const showConfig = ref(false)
function openGlobalConfig() {
  window.dispatchEvent(new CustomEvent('mvgo:before-open-config'))
  showConfig.value = true
}
provide('openConfig', openGlobalConfig)
const route = useRoute()
// 登录页/预览页隐藏全局头部和底部；demo(playground)页使用公共头部但隐藏底部
const isDemoPage = computed(
  () =>
    route.path.startsWith('/preview') ||
    route.path.startsWith('/mc-component')
)
// 预览页完全独立，不使用任何公共布局
const isPreviewPage = computed(
  () => route.path.startsWith('/preview') || route.path.startsWith('/mc-component')
)
const hideFooter = computed(() => isDemoPage.value || route.path.startsWith('/demo'))
// 全局接口对接向导（跨 iframe 消息桥）
const { bindingWizardOpen, bindingComponentId, bindingGroupId, bindingComponentName, emitRefresh } =
  useApiBindingBridge()
const runtimeBuilder = $runtimeBuilder()
onMounted(() => {
  runtimeBuilder?.listenEvent('Aio2McPublishEvent', (data) => {
    runtimeBuilder?.publishEvent(data.fun, data.data)
  })
})
</script>

<style lang="less" scoped>
//
</style>

<style>
/* 修复页面滚动问题 - 覆盖 #app 的 overflow: hidden */
#app {
  height: 100%;
  overflow: auto !important;
}

html,
body {
  height: 100%;
  overflow: auto;
}

/*
 * 粘性 footer 布局（绕过 StyleProvider / a-config-provider 组件不传递 flex 的限制）
 *
 * DOM 结构：
 *   .app-layout (min-height: 100vh)
 *     ├── StyleProvider / a-config-provider  ← 组件节点，flex 链路在此断裂
 *     │   ── .app-layout__inner (flex column, 自己计算高度撑满)
 *     │       ├── AppHeader        (position: fixed, 不在 flex 流中)
 *     │       ├── .app-content     (flex: 1, 自动拉伸)
 *     │       ├── AppFooter        (flex-shrink: 0)
 *     │       └── ConfigPanel
 *     ├── WorkflowMonitor           (position: fixed, 不在文档流)
 *     └── a-config-provider (ApiBindingWizard drawer)
 *
 * 关键：AppHeader 是 fixed，不占 flex 空间；footer ~40px
 * .app-layout__inner 用 min-height: calc(100vh - 40px) 自己撑满，不依赖外层 flex
 */
.app-layout {
  min-height: 100vh;
}

.app-layout__inner {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 41px);
  overflow: hidden;
}

.app-content {
  flex: 1 0 auto;
  box-sizing: border-box;
}

.app-content--with-header {
  padding-top: 64px;
  /* min-height: calc(100vh - 108px);
  overflow: hidden; */
}
</style>
