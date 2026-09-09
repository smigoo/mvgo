<template>
  <div class="mc-base-panel-wrapper">
    <slot v-if="isWujie"></slot>
    <component
      v-else
      :is="panelComponent"
      :key="currentPanel.value"
      v-bind="{ ...$attrs, ...businessProps, ...componentProps, componentName: currentName }"
    >
      <template v-for="item in panelSlots" #[item]="slotData">
        <slot :name="item" v-bind="slotData || {}" />
      </template>
      <slot />
    </component>
  </div>
</template>
<script setup>
import { wujieComponent } from '@/hooks/wujie-component'
import { Container, DynamicMaskLodingRefKey } from '@microcode/microcode-framework'
import { inject, computed, watch, shallowRef, ref } from 'vue'
const slot = defineSlots()
const panelSlots = ref(
  ['title-left', 'title-right', 'header-right', 'close'].filter((key) => slot[key])
)
const props = defineProps({
  panelKey: {
    type: String,
    default: 'empty'
  },
  componentName: {
    type: String
  },
  isDynaimcName: {
    type: Boolean,
    default: false
  }
})

const { runtimeBuilder, businessProps, componentProps, componentDeclareInfo } = $mcComponentBuilder(
  { id: 'base-panel' }
)

// 🎨 支持全局面板类型覆盖（用于Playground实时切换预览）
const globalPanelType = inject('globalPanelType', null)

// 当前面板（优先级：全局覆盖 > 组件配置 > props）
const currentPanel = computed(() => {
  const result = globalPanelType?.value || componentProps.panelType || props.panelKey
  console.log('🔍 [base-panel] currentPanel计算:', {
    globalPanelType: globalPanelType?.value,
    componentPropsType: componentProps.panelType,
    propsKey: props.panelKey,
    result
  })
  return result
})

// const currentName = componentProps.componentName || props.componentName

const LayoutContainers = inject(Container,Symbol())

const DynamicMaskContainers = inject(DynamicMaskLodingRefKey,Symbol())

const isWujie = ref($isWujie)

const currentName = computed(() => {
  if (props.isDynaimcName) {
    return (
      props.componentName ||
      componentProps.componentProps?.componentName ||
      componentProps.componentName
    )
  } else {
    return (
      componentProps.componentProps?.componentName ||
      props.componentName ||
      componentProps.componentName
    )
  }
})

// 获取面板组件 — 用 shallowRef + watch 替代 computed(defineAsyncComponent)，
// 避免每次切换面板类型时创建新的异步组件实例导致子树（图表等）被销毁。
const panelComponent = shallowRef(null)

async function loadPanelComponent(panelType) {
  console.log('🔄 [base-panel] 开始加载面板组件:', panelType)
  try {
    const module = await import(`@/components/@mv-business-panels/${panelType}/index.vue`)
    console.log('✅ [base-panel] 加载成功 (business-panels):', panelType)
    panelComponent.value = module.default || module
  } catch (error) {
    try {
      const module = await import(`@/workspace/custom-panels/${panelType}/index.vue`)
      console.log('✅ [base-panel] 加载成功 (custom-panels):', panelType)
      panelComponent.value = module.default || module
    } catch (error) {
      console.log('⚠️ [base-panel] 加载失败，使用empty面板:', panelType)
      const defaultModule = await import('@/components/@mv-business-panels/empty/index.vue')
      panelComponent.value = defaultModule.default || defaultModule
    }
  }
}

// 初始加载 + 响应面板类型变化
watch(currentPanel, (newVal) => { loadPanelComponent(newVal) }, { immediate: true })
/**
 * 关闭弹框操作
 */
const close = () => {
  // 关闭图标选中
  runtimeBuilder.mcFrameworkPublishEvent('clear-layer-active')
  if (componentProps.isMapWindowInfo == 1) {
    // 关闭弹框
    runtimeBuilder.mcFrameworkPublishEvent('close-infor-window')
    return
  } else if (componentProps.isMapWindowInfo == 2) {
    DynamicMaskContainers?.closeModal(componentProps.id)
  } else {
    LayoutContainers?.destroyComponent(
      componentProps.componentId,
      componentProps.componentSerialNumber
    )
  }

  // 关闭当前组件
  window.$wujie && runtimeBuilder.publishEvent('mc-framework-close-component')
}
const closeLayout = () => {
  LayoutContainers?.closeAnimatedLayout()
}
/**
 * 初始化函数，根据传入的数据初始化组件
 * @param {Object} data - 初始化数据
 */
function init(data) {
  if (isWujie.value) {
    // 注册wujie hook
    wujieComponent().init(data)
  }
}
// 基础面板方法
const basePanel = {
  init,
  close,
  closeLayout
}
provide('basePanelProp', basePanel)
defineExpose(basePanel)
</script>
<style scoped>
.mc-base-panel-wrapper {
  width: 100%;
  height: 100%;
}
</style>
