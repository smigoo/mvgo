import Record from './components/Record.vue'
import RecordView from './components/RecordView.vue'
import CircleProgress from './components/CircleProgress.vue'

import init from './lib/init'

const components = {
  Record,
  RecordView,
  CircleProgress
}
export default {
  name: 'MvRecorder',
  /**
   * @description: 录音器插件注册
   * @param {*} Vue
   * @param {*} options
   * @param {*} options.wsUrl websocket地址
   * @param {*} options.recorderHook 录音器钩子函数
   * @return {*}
   */
  install(Vue, options) {
    window.$mvRecorderSdk = init(options)

    Vue.config.globalProperties.$mvRecorderSdk = window.$mvRecorderSdk

    Object.keys(components).forEach((key) => {
      Vue.component('Mv' + key, components[key])
    })
  }
}
