<template>
  <div
    class="map-icon-group"
    :class="businessProps?.childrenPosition"
    v-if="currentMapConfigure.mapLoadFinish && hasPermission(iconConfig.qsCode)"
    @mouseenter="layerMousemove"
    @mouseleave="layerMouseout"
  >
    <mv-map-icon
      ref="mvMapIconRef"
      :iconConfig="iconConfig"
      :parent="iconConfig.isParent || iconConfig.isParent === undefined"
      @pointClick="pointClick"
      @layer-click="itemLayerClick"
    >
      <div class="mv-map-text">{{ iconConfig.name }}</div>
    </mv-map-icon>

    <Transition :duration="550" name="nested">
      <div class="group-icon" v-show="showChildren">
        <template v-for="item in childConfig" :key="item.type">
          <mv-map-icon
            :ref="item.type"
            :iconConfig="item"
            @pointClick="pointClick"
            @layer-click="itemLayerClick"
            @loadLayer="loadLayer"
            v-if="hasPermission(item.qsCode)"
          >
            <div class="mv-map-text">{{ item.name }}</div>
          </mv-map-icon>
        </template>
      </div>
    </Transition>
  </div>
</template>
<script setup>
import { mcMapLegend } from '@/hooks/mc-map-legend'
import Icon from '../resources/images/camera.png'
import IconActive from '../resources/images/camera-active.png'
import layerConfig from '@/layer-config'
import { hasPermission } from '@/core/permission'
const { proxy } = getCurrentInstance()
// 微码组件实例
// componentProps 微码组件传参
// businessProps  组件业务传参
const { componentProps, businessProps, runtimeBuilder } = $mcComponentBuilder({
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
const layerMousemove = () => {
  showChildren.value = true
}
const layerMouseout = () => {
  showChildren.value = false
}
const showChildren = ref(false)

const childConfig = ref([])
const legendConfig = layerConfig.find((item) => item.type === businessProps.type) || {}
const formatterIconConfig = (key, defaultValue) => {
  return (
    (legendConfig && legendConfig[key]) || (businessProps && businessProps[key]) || defaultValue
  )
}
// 图例配置
const iconConfig = {
  ...legendConfig,
  ...businessProps,
  img: formatterIconConfig('img', ['', ''])
}

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
 * 初始化地图图例配置
 */
function initComplete(config) {
  if (config.children || config.children === undefined) {
    config.children = config.children || config.childrenConfig

    childConfig.value = config.children.map((i) => {
      const currentConfig = {
        ...config,
        ...i, // 子级默认config
        parent: config
      }

      delete currentConfig.children
      delete currentConfig.childrenConfig
      return currentConfig
    })
    // .filter((i) => i.visibility)
  }
}
/**
 * 处理图层点击事件
 * 当图层被点击时，根据图层的选中状态（checked）执行相应的操作
 *
 * @param {Object} config - 图层的配置信息
 * @param {boolean} checked - 图层的选中状态，true表示选中，false表示未选中
 */
function itemLayerClick(config, checked) {
  // 当图层被选中时
  if (checked) {
    // 如果当前图层的类型与图标配置的类型相匹配
    if (config.type === iconConfig?.type) {
      // 设置显示子元素的状态为true
      // showChildren.value = true
      childConfig.value.forEach((item) => {
        // 如果找到匹配的图标并且该图标被选中，则触发图标的点击事件
        if (!proxy.$refs[item.type][0].isChecked) {
          proxy.$refs[item.type][0].onIconClick()
        }
      })
    } else {
      const item = childConfig.value.find((item) => proxy.$refs[item.type][0].isChecked)
      if (item) proxy.$refs.mvMapIconRef.isChecked = true
    }
  } else {
    // 当图层被取消选中时，如果图层类型与图标配置类型相匹配
    if (config.type === iconConfig?.type) {
      // 遍历子配置，寻找匹配的图标元素
      childConfig.value.forEach((item) => {
        // 如果找到匹配的图标并且该图标被选中，则触发图标的点击事件
        if (proxy.$refs[item.type][0].isChecked) {
          proxy.$refs[item.type][0].onIconClick()
        }
      })
    } else {
      const item = childConfig.value.find((item) => proxy.$refs[item.type][0].isChecked)
      if (!item) proxy.$refs.mvMapIconRef.isChecked = false
    }
  }
  layerClick(config, checked)
}
function loadLayer(status, config) {
  console.log('[loadLayer] ' + config.name + '图层加载数据' + status)
  if (status === 'start') {
    // 图层加载开始
    window.$wujie && runtimeBuilder?.publishEvent('mc-framework-loading', { loading: true })
  } else if (status === 'end') {
    // 图层加载结束
    window.$wujie && runtimeBuilder?.publishEvent('mc-framework-loading', { loading: false })
  }
}
onMounted(() => {
  initComplete(iconConfig)
})
</script>
<style lang="less" scoped>
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
.map-icon-group {
  position: relative;

  .mv-map-icon-container {
    position: relative;
  }
  .group-icon {
    position: absolute;
    width: 100%;
    display: flex;
    gap: 10px;
    flex-direction: column;
    align-items: center;
    :deep(.mv-map-icon-img-box) {
      position: relative;
    }
  }

  .nested-enter-active,
  .nested-leave-active {
    transition: all 0.15s ease-in-out;
  }
  .nested-leave-active {
    transition-delay: 0.15s;
  }
  .nested-enter-from,
  .nested-leave-to {
    transform: translateY(-30px);
    opacity: 0;
  }
}
.bottom {
  .nested-enter-from,
  .nested-leave-to {
    transform: translateY(-30px);
    opacity: 0;
  }
}
.top {
  .group-icon {
    bottom: 80px;
  }
  .nested-enter-from,
  .nested-leave-to {
    transform: translateY(30px);
    opacity: 0;
  }
}
.right {
  .group-icon {
    flex-direction: row;
    left: 70px;
    top: 0;
  }
  .nested-enter-from,
  .nested-leave-to {
    transform: translateX(-30px);
    opacity: 0;
  }
}
.left {
  .group-icon {
    flex-direction: row-reverse;
    right: 70px;
    top: 0;
  }
  .nested-enter-from,
  .nested-leave-to {
    transform: translateX(30px);
    opacity: 0;
  }
}
.layout-map-legend-item-icon:hover {
  z-index: 999;
}
</style>
