<template>
  <div class="mc-container-page">
    <Suspense>
      <DynamicContainer v-if="loading" v-bind="{ ...container }"></DynamicContainer>
    </Suspense>
  </div>
</template>

<script>
export default { name: 'container-page' }
</script>
<script setup>
import api from '@/api/index'
import { openLoading, closeLoading } from '@microcode/microcode-framework'
import { useRoute } from 'vue-router'
import getPageStruct from '@/utils/load'

const props = defineProps({
  pageId: { type: String, default: '' },
  keepAlive: { type: Boolean, default: false }
})

const container = ref({})
const route = useRoute()
const loading = ref(false)

const pageId = ref(props.pageId || route?.params?.pageId)

const publishPage = () => {
  if (!pageId.value) return $message.error('未获取到页面')
  loading.value = false
  openLoading()
  api
    .getElementTree({
      pageId: pageId.value,
      pageName: ''
    })
    .then(async (res) => {
      if (res.data && res.data.pageElement) {
        const lineData = await getDataLineList()
        container.value = getPageStruct(res.data.pageElement, interactiveRouting(lineData))
        console.log(container.value, '页面加载信息数据 ')
      }
    })
  setTimeout(() => {
    closeLoading()
    loading.value = true
  }, 1000)
}

const getDataLineList = async () => {
  const res = await api.getRelationList({ pageId: pageId.value, pageName: '' })
  return res.data || []
}
const interactiveRouting = (lineData) => {
  const regex = /^\s*(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>\s*(?:\{.*\}|.+)$/
  return lineData.map((item) => {
    if (!regex.test(item.dataConfigFunc)) {
      $message.error('数据转换配置参数异常')
      throw new Error('数据转换配置参数异常')
    }
    return {
      routeName: 'route-' + item.id,
      occurrenceTime: item.dataCreateTime,

      sourceComponentId: item.callComponentId,
      sourceComponentSerialNumber: item.callComponentSerial,
      eventTypeId: item.callComponentEventId,

      targetComponentSerialNumber: item.calledComponentSerial,
      targetComponentId: item.calledComponentId,
      targetComponentStatus: item.calledComponentStateId,

      dataStructureConvert: {
        configId: 'function-' + item.id,
        configTyp: item.dataConfigType,
        functions: item.dataConfigFunc
      },

      instanceRouting: {
        //是否允许创建不存在的实例
        // 兼容旧版本数据
        // item.allowAutoCreate === undefined 如字段不存在的情况下 默认创建不存在实例
        // item.allowAutoCreate === null 兼容旧的交互数据 无配置时 值为 null 也是默认创建不存在实例
        // 当值存在内容时,则取其值 1 为创建不存在实例 0 不创建不存在实例
        allowAutoCreate: item.allowAutoCreate != 0 ? 1 : 0,
        routeringCode: item.routeringCode ? item.routeringCode : '',
        targetPageId: item.targetPageId ? item.targetPageId : ''
      }
    }
  })
}
onMounted(() => {
  if (props.pageId) {
    publishPage()
    return
  }
  pageId.value = route?.params?.pageId
  publishPage()
})
</script>
<style lang="less" scoped>
.mc-container-page {
  width: 100%;
  height: 100%;
}
</style>
