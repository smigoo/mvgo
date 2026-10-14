<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-6dddd6-slot-con" style="display:flex;flex-direction:column;">
      <ContentSection style="flex:1;min-height:0;" />
    </div>
  </base-panel>
</template>

<script setup>
import HeaderSection from './components/HeaderSection.vue'

import ContentSection from './components/ContentSection.vue'

</script TOTAL_LINE_MARKER_PLACEHOLDER

import {ref, reactive, computed} from 'vue'

// === Figma 尺寸真值（来自 layoutStructure / elementStyleMap） ===

const FIGMA_ROOT_WIDTH = 486

const FIGMA_ROOT_HEIGHT = 1014

// === 表单模型（真值文案：产品图片/产品编码/产品名称/产品型号/产品厂家/产品影子时间/心跳周期时间/所属分类/所属组织/公司认证硬件产品/链接类型/产品描述） ===

const formState = reactive({
  // 产品图片（上传预览，Figma 中已含默认预览图，真值资源未导出 → 使用 CSS 占位）
  productImage: '',
  // 产品编码：占位「若不输入则系统自动生成」
  productCode: '',
  // 产品名称：占位「请输入产品名称」
  productName: '',
  // 产品型号：占位「请输入产品型号」
  productModel: '',
  // 产品厂家：占位「请选择厂商」
  manufacturer: undefined,
  // 产品影子时间：数值「5」 + 单位「min」
  shadowTime: '5',
  shadowTimeUnit: 'min',
  // 心跳周期时间：数值「1」 + 单位「min」
  heartbeatTime: '1',
  heartbeatUnit: 'min',
  // 所属分类：真值「通信类/情报板」
  category: '通信类/情报板',
  // 所属组织：占位「请输入所属组织」
  organization: '',
  // 公司认证硬件产品：默认选中「否」
  hardwareCertified: false,
  // 链接类型：默认选中「直连设备」
  linkType: '直连设备',
  // 产品描述：占位「请输入产品描述」
  description: ''
})

// === 上传文件列表（@ant-design-vue/upload） ===

const fileList = ref([])

// === 下拉/单选选项（严格取自文案白名单，禁止扩展臆造选项） ===

const manufacturerOptions = computed(() => [
  { label: '请选择厂商', value: '请选择厂商' }
])

const categoryOptions = computed(() => [
  { label: '通信类/情报板', value: '通信类/情报板' }
])

const timeUnitOptions = computed(() => [
  { label: 'min', value: 'min' }
])

// 链接类型（真值：直连设备 / 网关设备 / 网关子设备 / PLC柜）

const linkTypeOptions = ref([
  { label: '直连设备', value: '直连设备' },
  { label: '网关设备', value: '网关设备' },
  { label: '网关子设备', value: '网关子设备' },
  { label: 'PLC柜', value: 'PLC柜' }
])

// 公司认证硬件产品（真值：否 / 是）

const certifyOptions = ref([
  { label: '否', value: false },
  { label: '是', value: true }
])

// === 必填项标识（Figma 中 * 为红色必填星号） ===

const requiredFields = ['productImage', 'productCode', 'productName', 'productModel', 'manufacturer', 'shadowTime', 'heartbeatTime', 'category', 'organization', 'hardwareCertified', 'description']

const handleCancel = () => {
  formState.productImage = ''
  formState.productCode = ''
  formState.productName = ''
  formState.productModel = ''
  formState.manufacturer = undefined
  formState.shadowTime = '5'
  formState.shadowTimeUnit = 'min'
  formState.heartbeatTime = '1'
  formState.heartbeatUnit = 'min'
  formState.category = '通信类/情报板'
  formState.organization = ''
  formState.hardwareCertified = false
  formState.linkType = '直连设备'
  formState.description = ''
  fileList.value = []
}

const handleSave = () => {
  // 保存表单数据（不臆造校验规则，仅保留数据结构）
  return { ...formState }
}

// === 事件处理（handleCancel / handleSave 由父组件与子组件间传递） ===

import {onMounted, onUnmounted} from 'vue'

// === 生命周期 ===

onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('6dddd6-onload', {
    componentId: '6dddd6',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 本批无 listenEvent 监听，无需移除监听
})

// 图表/数据相关运行时逻辑（本组件为纯表单面板，无图表；以下为数据加载与占位逻辑，供第二部分钩子调用）

// 空保护：以下函数为表单面板的数据骨架，无接口时使用本地默认值

const noopCharts = () => {
  // 本组件不含 ECharts 图表，保留函数以满足骨架调用，避免未定义引用
}

// 供 onMounted 调用的初始化入口（不含生命周期钩子，仅函数定义）

const initCharts = () => {
  noopCharts()
}

// 数据刷新占位（表单面板无需轮询，保留空实现，便于后续接入 componentApi）

const refreshFormData = async () => {
  if (typeof componentApi === 'undefined' || !componentApi) {
    return
  }
  try {
    // 预留：如有表单回显数据源，可在此调用 componentApi.getCommonApiFindOne(...)
  } catch (err) {
    console.warn('[新增产品] 表单数据加载失败', err)
  }
}

// 暴露给第二部分 onMounted 使用

defineExpose({
  initCharts,
  refreshFormData
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
