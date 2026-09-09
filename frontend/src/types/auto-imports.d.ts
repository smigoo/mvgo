/* eslint-disable @typescript-eslint/no-explicit-any */
export {}

// 微码框架类型定义
interface RuntimeBuilder {
  publishEvent: (eventName: string, data: any) => void
  listenEvent: (eventName: string, callback: Function) => void
  removeListener: (eventName: string, callback?: Function) => void
  mcFrameworkPublishEvent: (eventName: string, data: any) => void
  mcFrameworkListenEvent: (eventName: string, callback: Function) => void
  removemcFrameworkListener: (eventName: string, callback?: Function) => void
  mcFrameworkLayoutListenEvent: (eventName: string, callback: Function) => void
  hasMcFrameworkEmitter: () => boolean
  subscribeWebsocket: (eventName: string, callback: Function) => void
  openLoadingEffect: () => void
  closeLoadingEffect: () => void
}

interface ComponentProps {
  id: string
  hide?: boolean
  componentName?: string
  panelType?: string
  layoutType?: string
  themeType?: string
  cssVars?: Record<string, string>
  style?: Record<string, string>
  prompts?: any[]
  [key: string]: any
}

interface BusinessProps {
  componentId?: string
  [key: string]: any
}
interface ComponentApi {
  getCommonApiFindOne: () => Promise<any>
  getCommonApiFindList: () => Promise<any>
  getCommonApiPageList: () => Promise<any>
  submitCommonApiForm: () => Promise<any>
  delCommonApiDeleteOne: () => Promise<any>
  commonApiUploadFile: () => Promise<any>
  commonApiDownloadFile: () => Promise<any>
  getSbdsCommonDataList: () => Promise<any>
  getIconData: () => Promise<any>
}

interface McComponentBuilderResult {
  runtimeBuilder: RuntimeBuilder
  componentProps: ComponentProps
  businessProps: BusinessProps
  componentApi: ComponentApi
}

declare global {
  // Vue
  const ref: (typeof import('vue'))['ref']
  const reactive: (typeof import('vue'))['reactive']
  const computed: (typeof import('vue'))['computed']
  const watch: (typeof import('vue'))['watch']
  const watchEffect: (typeof import('vue'))['watchEffect']
  const watchDeep: (typeof import('vue'))['watchDeep']
  const watchPostEffect: (typeof import('vue'))['watchPostEffect']
  const onMounted: (typeof import('vue'))['onMounted']
  const onUnmounted: (typeof import('vue'))['onUnmounted']
  const onBeforeMount: (typeof import('vue'))['onBeforeMount']
  const onBeforeUnmount: (typeof import('vue'))['onBeforeUnmount']
  const onUpdated: (typeof import('vue'))['onUpdated']
  const onBeforeUpdate: (typeof import('vue'))['onBeforeUpdate']
  const nextTick: (typeof import('vue'))['nextTick']
  const toRef: (typeof import('vue'))['toRef']
  const toRefs: (typeof import('vue'))['toRefs']
  const toValue: (typeof import('vue'))['toValue']
  const unref: (typeof import('vue'))['unref']
  const isRef: (typeof import('vue'))['isRef']
  const isReactive: (typeof import('vue'))['isReactive']
  const isProxy: (typeof import('vue'))['isProxy']
  const isReadonly: (typeof import('vue'))['isReadonly']
  const shallowRef: (typeof import('vue'))['shallowRef']
  const shallowReactive: (typeof import('vue'))['shallowReactive']
  const triggerRef: (typeof import('vue'))['triggerRef']
  const customRef: (typeof import('vue'))['customRef']
  const provide: (typeof import('vue'))['provide']
  const inject: (typeof import('vue'))['inject']
  const defineComponent: (typeof import('vue'))['defineComponent']
  const defineAsyncComponent: (typeof import('vue'))['defineAsyncComponent']
  const getCurrentInstance: (typeof import('vue'))['getCurrentInstance']
  const useAttrs: (typeof import('vue'))['useAttrs']
  const useSlots: (typeof import('vue'))['useSlots']
  const useCssModule: (typeof import('vue'))['useCssModule']

  // Vue Router
  const useRoute: (typeof import('vue-router'))['useRoute']
  const useRouter: (typeof import('vue-router'))['useRouter']
  const onBeforeRouteLeave: (typeof import('vue-router'))['onBeforeRouteLeave']
  const onBeforeRouteUpdate: (typeof import('vue-router'))['onBeforeRouteUpdate']

  // Pinia
  const defineStore: (typeof import('pinia'))['defineStore']
  const storeToRefs: (typeof import('pinia'))['storeToRefs']
  const createPinia: (typeof import('pinia'))['createPinia']
  const getActivePinia: (typeof import('pinia'))['getActivePinia']
  const setActivePinia: (typeof import('pinia'))['setActivePinia']
  const mapActions: (typeof import('pinia'))['mapActions']
  const mapState: (typeof import('pinia'))['mapState']
  const mapStores: (typeof import('pinia'))['mapStores']
  const mapWritableState: (typeof import('pinia'))['mapWritableState']
  const setMapStoreSuffix: (typeof import('pinia'))['setMapStoreSuffix']
  const skipHydrate: (typeof import('pinia'))['skipHydrate']

  // 微码框架全局方法
  const $mcComponentBuilder: () => McComponentBuilderResult
  const $createMcDeclare: (config: any) => any
}
