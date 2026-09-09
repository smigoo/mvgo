/*
 * @Description: ws和录音器结合使用，语音转文字sdk
 * @Author: zhuqiqd 1972662943@qq.com
 * @Date: 2025-03-19 10:09:56
 * @LastEditors: zhuqiqd 1972662943@qq.com
 * @LastEditTime: 2025-03-19 20:28:16
 * @FilePath: /src/components/mv-recorder/lib/core/main.js
 */

//简单控制台直接测试方法：在任意(无CSP限制)页面内加载需要的js，加载成功后再执行一次本代码立即会有效果
//①加载Recorder+mp3：import("https://unpkg.com/recorder-core/recorder.mp3.min.js").then(()=>console.log("import ok"))
//②可视化插件和显示：import("https://unpkg.com/recorder-core/src/extensions/waveview.js").then(()=>console.log("import ok")); div=document.createElement("div");div.innerHTML='<div style="height:100px;width:300px;" class="recwave"></div>';document.body.prepend(div);

import { handleWithTimestamp, isFunction } from '../../utils'
// ws
import { WebSocketConnectMethod } from './wsconnecter'
// 先加载录音器核心插件
import './recorder-core'

// 声波视图加载
import '../sonic-view'

const Recorder = window.Recorder

const viewConfig = {
  width: 300,
  height: 100,
  lineCount: 20,
  position: 0,
  minHeight: 1,
  fallDuration: 400,
  stripeEnable: false,
  mirrorEnable: true,
  linear: [0, '#0ac', 1, '#0ac']
}

import gConfig from '../config'
const { sonicViewConfig, defaultViewConfig } = gConfig

export default function MvRecorder(config, recorderHook) {
  const recorderConfig = { ...config }

  // 视图配置判断
  if (!recorderConfig.viewType || !sonicViewConfig.includes(recorderConfig.viewType)) {
    recorderConfig.viewType = defaultViewConfig
  }

  let rec, wave
  // 语音解析的文字
  let rec_text = ''
  // 回调函数
  let recCallback = {}

  let sampleBuf = new Int16Array()

  let wsconnecter = new WebSocketConnectMethod({
    url: recorderConfig.wsUrl,
    msgHandle: getJsonMessage,
    stateHandle: getConnState
  })

  /**
   * @description: 处理了回调事件
   * @param {*} type
   * @param {array} arg
   * @return {*}
   */
  function handleCallback(type, ...arg) {
    if (recCallback[type]) {
      recCallback[type](...arg)
    }
  }
  // 语音识别结果; 对jsonMsg数据解析,将识别结果附加到编辑框中
  function getJsonMessage(jsonMsg) {
    var rectxt = '' + JSON.parse(jsonMsg.data)['text']
    // var asrmodel = JSON.parse(jsonMsg.data)['mode']
    // var is_final = JSON.parse(jsonMsg.data)['is_final']
    var timestamp = JSON.parse(jsonMsg.data)['timestamp']
    // if (asrmodel == '2pass-offline' || asrmodel == 'offline') {
    rec_text = handleWithTimestamp(rectxt, timestamp)
      .replace('，', '')
      .replace('。', '')
      .replace(',', '')

    // 单次回调
    handleCallback('onRecord', rec_text)
    // 全局处理消息数据
    recorderHook?.handleRecorderText(rec_text)
  }

  /**
   * ws连接状态回调
   * @param {Number} connState 连接状态
   */
  function getConnState(connState) {
    if (connState === 0) {
      // 连接成功
      console.log('[mv-recorder] ws connecttion open')

      // 启动录音
      openRecorder()
      //on open
      // info_div.innerHTML = '连接成功!请点击开始'
    } else if (connState === 1) {
      // 连接关闭
      //stop();
      console.log('[mv-recorder] ws connecttion close')
    } else if (connState === 2) {
      // 连接错误
      this.stop()
      console.error('[mv-recorder] ws connecttion error')
    }
  }

  /**
   * @description: 发送语音信息到ws服务器
   * @param {*} buffers
   * @param {*} bufferSampleRate
   * @return {*}
   */
  function sendRecToWs(buffers, bufferSampleRate) {
    var data_48k = buffers[buffers.length - 1]

    var array_48k = new Array(data_48k)
    var data_16k = Recorder.SampleData(array_48k, bufferSampleRate, 16000).data

    sampleBuf = Int16Array.from([...sampleBuf, ...data_16k])
    var chunk_size = 960 // for asr chunk_size [5, 10, 5]
    // info_div.innerHTML = '' + bufferDuration / 1000 + 's'
    while (sampleBuf.length >= chunk_size) {
      let sendBuf = sampleBuf.slice(0, chunk_size)
      sampleBuf = sampleBuf.slice(chunk_size, sampleBuf.length)
      wsconnecter.wsSend(sendBuf)
    }
  }

  /**调用open打开录音请求好录音权限**/
  let recOpen = function (success) {
    //一般在显示出录音按钮或相关的录音界面时进行此方法调用，后面用户点击开始录音时就能畅通无阻了
    rec = Recorder({
      //本配置参数请参考下面的文档，有详细介绍
      type: 'pcm',
      sampleRate: 16000,
      bitRate: 16, //mp3格式，指定采样率hz、比特率kbps，其他参数使用默认配置；注意：是数字的参数必须提供数字，不要用字符串；需要使用的type类型，需提前把格式支持文件加载进来，比如使用wav格式需要提前加载wav.js编码引擎
      onProcess: function (
        buffers,
        powerLevel,
        bufferDuration,
        bufferSampleRate,
        newBufferIdx,
        asyncEnd
      ) {
        //录音实时回调，大约1秒调用12次本回调，buffers为开始到现在的所有录音pcm数据块(16位小端LE)
        //可利用extensions/sonic.js插件实时变速变调，此插件计算量巨大，onProcess需要返回true开启异步模式
        //可实时上传（发送）数据，配合Recorder.SampleData方法，将buffers中的新数据连续的转换成pcm上传，或使用mock方法将新数据连续的转码成其他格式上传，可以参考文档里面的：Demo片段列表 -> 实时转码并上传-通用版；基于本功能可以做到：实时转发数据、实时保存数据、实时语音识别（ASR）等

        // 发送文字
        sendRecToWs(buffers, bufferSampleRate)

        // recorderHook?.handleWave()

        //可实时绘制波形（extensions目录内的waveview.js、wavesurfer.view.js、frequency.histogram.view.js插件功能）
        wave && wave.input(buffers[buffers.length - 1], powerLevel, bufferSampleRate)
      }
    })

    rec.open(
      function () {
        //打开麦克风授权获得相关资源
        //rec.start() 此处可以立即开始录音，但不建议这样编写，因为open是一个延迟漫长的操作，通过两次用户操作来分别调用open和start是推荐的最佳流程

        //创建可视化，指定一个要显示的div
        // TODO：没处理完，暂不支持配置
        if (recorderConfig.openView && Recorder[recorderConfig.viewType])
          wave = Recorder[recorderConfig.viewType]({ elem: '.recwave', ...viewConfig })
        success && success()
      },
      function (msg, isUserNotAllow) {
        //用户拒绝未授权或不支持
        console.log((isUserNotAllow ? 'UserNotAllow，' : '') + '无法录音:' + msg)
      }
    )
  }

  /**开始录音**/
  function recStart() {
    //打开了录音后才能进行start、stop调用
    rec.start()
  }

  /**结束录音**/
  function recStop() {
    rec.stop(
      function (blob, duration) {
        //简单利用URL生成本地文件地址，注意不用了时需要revokeObjectURL，否则霸占内存
        //此地址只能本地使用，比如赋值给audio.src进行播放，赋值给a.href然后a.click()进行下载（a需提供download="xxx.mp3"属性）
        let localUrl = (window.URL || window.webkitURL).createObjectURL(blob)
        console.log(blob, localUrl, '时长:' + duration + 'ms')
        rec.close() //释放录音资源，当然可以不释放，后面可以连续调用start；但不释放时系统或浏览器会一直提示在录音，最佳操作是录完就close掉
        rec = null

        //已经拿到blob文件对象想干嘛就干嘛：立即播放、上传、下载保存

        /*** 【立即播放例子】 ***/
        let audio = document.createElement('audio')
        document.body.prepend(audio)
        audio.controls = true
        audio.src = localUrl
        audio.play()
      },
      function (msg) {
        console.log('录音失败:' + msg)
        rec.close() //可以通过stop方法的第3个参数来自动调用close
        rec = null
      }
    )
  }

  /**
   * @description: 重置
   * @return {*}
   */
  function reset() {
    rec = null
    wave = null
    // 语音解析的文字
    rec_text = ''
    // 回调函数
    recCallback = {}

    sampleBuf = new Int16Array()
  }

  /**
   * @description: 开始 录音
   * @return {*}
   */
  function startRecorder(callback = {}) {
    reset()
    //启动连接
    wsconnecter.wsStart()

    const { onRecord, onEnd, onError } = callback

    // 设置回调函数
    if (isFunction(onRecord)) recCallback.onRecord = onRecord
    if (isFunction(onEnd)) recCallback.onEnd = onEnd
    if (isFunction(onError)) recCallback.onError = onError
  }

  /**
   * @description: 启动 录音
   * @return {*}
   */
  function openRecorder() {
    // 启动录音器
    recOpen(function () {
      // 录音开始
      recStart()
    })
  }

  /**
   * @description: 停止 录音
   * @return {*}
   */
  function stopRecorder() {
    //停止录音
    recStop()
    //断开连接
    wsconnecter.wsStop()

    handleCallback('onEnd')
    // 重置
    reset()
  }

  return {
    start: startRecorder,
    stop: stopRecorder,
    // TODO： record 不需要 缺省下
    record: () => {}
  }
}

//这里假设立即运行，只录3秒，录完后立即播放，本段代码copy到控制台内可直接运行
// recOpen(function () {
//   recStart()
//   setTimeout(recStop, 3000)
// })
