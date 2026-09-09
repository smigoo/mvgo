import { onMounted, onUnmounted } from 'vue'
import pinia, { useConfigStore } from '@/store'
// 注意：不能在此处顶层调用 useConfigStore(pinia)。
// @/store 经 export * from './modules' 再导出 useConfigStore，而定义它的 store 模块
// 在自身求值时可能经循环依赖把本文件拉回，导致 useConfigStore 仍处于 TDZ（暂时性死区），
// 触发 "Cannot access 'useConfigStore' before initialization"。改为函数内惰性获取即可规避。
/**
 * 在非MvMap中使用图例组件（MvMapIcon）时
 * @param {*} $vm
 */
export function mcMapLegend(
  { runtimeBuilder, componentProps, setComponentActive, businessProps },
  initFun
) {
  const store = useConfigStore(pinia)
  const { proxy } = getCurrentInstance()
  // 地图配置信息
  const mapConfigure = reactive({
    mapLoadFinish: false
  })
  provide('mapConfigure', mapConfigure)

  const mapConfigureStore = computed(() => componentProps.mapConfigure || store.mapConfigure)
  // 监听地图配置信息
  watch(
    () => mapConfigureStore.value,
    (_config) => {
      // console.log('mapConfigureStore', _config)
      if (_config && _config.mapLoadFinish) {
        mapConfigure.theme = _config.theme
        mapConfigure.mapId = _config.mapId
        mapConfigure.version = _config.version

        // 最后赋值mapLoadFinish
        setTimeout(() => {
          // 标明地图初始化完成
          mapConfigure.mapLoadFinish = _config.mapLoadFinish

          // 调用初始化方法
          if (typeof initFun === 'function') {
            initFun()
          }
          setLegendRef()
        }, 0)

        // 设置全局地图SDK
        if (componentProps.$mapSdk) {
          proxy.$setGlobalProperties('$mapSdk', componentProps.$mapSdk)
        }
      }
    },
    {
      immediate: true
    }
  )

  const currentMapConfigure = computed(() => mapConfigure)

  onMounted(() => { })
  const setLegendRef = () => {
    nextTick(() => {
      proxy.$mapSdk().mvMapLegendRef[businessProps?.type] = proxy.$refs.mvMapIconRef

      // 图例组件初始化完成
      if ($isWujie) {
        runtimeBuilder?.publishEvent('mc-framework-init')
      }
    })
  }
  onUnmounted(() => {
    setComponentActive && setComponentActive({ active: false })
  })
  /**
   * @description: 兼容微码和一体化的点击事件
   * @param {*} e
   * @param {*} data
   * @param {*} config
   * @return {*}
   */
  const pointClick = (e, data, config) => {
    if (componentProps.$pointClick) {
      componentProps.$pointClick(e, data, config)
    } else {
      proxy.$pointClick(e, data, config)
    }
  }

  /**
   * @description: 兼容微码和一体化的点击事件
   * @param {*} e
   * @param {*} data
   * @param {*} config
   * @return {*}
   */
  const layerClick = (e, data, config) => {
    if (componentProps.$layerClick) {
      componentProps.$layerClick(e, data, config)
    } else {
      proxy.$layerClick(e, data, config)
    }
  }

  return {
    // store,
    currentMapConfigure,
    pointClick,
    layerClick
  }
}
