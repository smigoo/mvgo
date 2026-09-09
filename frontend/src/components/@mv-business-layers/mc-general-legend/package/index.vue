<template>
  <div
    class="layout-map-legend-item-icon"
    v-if="currentMapConfigure.mapLoadFinish && hasPermission(iconConfig.qsCode)"
  >
    <mv-map-icon
      ref="mvMapIconRef"
      class="mv-map-icon"
      :iconConfig="iconConfig"
      @pointClick="pointClick"
      @layer-click="itemLayerClick"
      @loadLayer="loadLayer"
    ></mv-map-icon>
    <div class="mv-map-text">{{ iconConfig.name }}</div>
  </div>
</template>
<script setup>
// import mcApi from '@/api/mc-api'
import { hasPermission } from '@/core/permission'
import api from '../resources/js/api'
import { mcMapLegend } from '@/hooks/mc-map-legend'
import Icon from '../resources/images/camera.png'
import IconActive from '../resources/images/camera-active.png'
import layerConfig from '@/layer-config'
const { proxy } = getCurrentInstance()

// 微码组件实例
// componentProps 微码组件传参
// businessProps  组件业务传参
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder({
  // 提供业务组件事件
  mcEvent: {
    // 设置组件是否激活
    setComponentActive
  }
})

// 图例hooks
const { currentMapConfigure, pointClick, layerClick } = mcMapLegend({
  componentProps,
  runtimeBuilder,
  businessProps,
  setComponentActive
})
const legendConfig = layerConfig.find((item) => item.type === businessProps.type) || {}

const queryData = (queryParam) => {
  return new Promise((resolve) => {
    let option = []
    const param = {
      ...queryParam,
      apiType: queryParam?.apiType || businessProps?.apiType || null, // camera gantry
      param: {
        ...queryParam?.param,
        areaCode: queryParam?.areaCode || businessProps?.areaCode || null
      }
    }
    componentApi
      .getSbdsCommonDataList(param)
      .then((res) => {
        option = res.data
      })
      .finally(() => {
        resolve({ status: 0, data: option })
      })
  })
}

const formatterIconConfig = (key, defaultValue) => {
  return (
    (legendConfig && legendConfig[key]) || (businessProps && businessProps[key]) || defaultValue
  )
}
// 图例配置
const iconConfig = ref({
  cache: businessProps?.cache || true,
  ...legendConfig,
  ...businessProps,
  img: formatterIconConfig('img', ['', '']),
  model: formatterIconConfig('model', 'point'),
  type: formatterIconConfig('type', 'camera'),
  iconFilter: formatterIconConfig('iconFilter', null),
  queryData: formatterIconConfig('queryData', queryData)
})

/**
 * @description: 设置组件激活状态
 * @param {*} active 是否激活
 * @return {*}
 */
function setComponentActive({ active } = {}) {
  const mvMapIconRef = proxy.$refs.mvMapIconRef

  if (active === !!mvMapIconRef?.isChecked) return
  mvMapIconRef.onIconClick()
}
/**
 * 图例 图层接口调用状态回调
 * @param {String} status
 * @param {Object} config
 */
function loadLayer(status, config) {
  console.log('[loadLayer] ' + config.name + '图层加载数据' + status)
  if (status === 'start') {
    // 图层加载开始
    window.$wujie &&
      runtimeBuilder?.publishEvent('mc-framework-loading', {
        loading: true,
        text: `正在加载${config.name || ''}图层`
      })
  } else if (status === 'end') {
    // 图层加载结束
    window.$wujie && runtimeBuilder?.publishEvent('mc-framework-loading', { loading: false })
  }
}
function itemLayerClick(config, checked) {
  if (window.$wujie) return
  if (checked) {
    businessProps?.legendLayoutList?.forEach((item) => {
      document.getElementById(item).style.display = 'none'
      if (iconConfig.value.name === '收起') iconConfig.value.name = '展开'
    })
  } else {
    if (businessProps?.legendLayoutList && businessProps?.legendLayoutList.length) {
      businessProps?.legendLayoutList?.forEach((item) => {
        document.getElementById(item).style.display = 'inline-flex'
        if (iconConfig.value.name === '展开') iconConfig.value.name = '收起'
      })
    }
  }
  layerClick(config, checked)
}

onMounted(() => {})
</script>
<style lang="less" scoped>
.layout-map-legend-item-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.mv-map-icon {
  display: flex;
  position: relative;
}
.mv-map-text {
  font-size: 14px;
  text-align: center;
  color: var(--text-primary);
  white-space: nowrap;
}
.layout-map-legend-item-icon:hover {
  z-index: 999;
}
</style>
