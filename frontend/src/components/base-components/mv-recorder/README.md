# MvRecorder 语音转文字插件

> 感动科技-基础研发部-前端部

> 引用了实验室的 websocket 服务来语音编码转文字

> 引用了插件[Recorder](https://gitee.com/dzyong/Recorder) 是一个纯 JavaScript 的网页录音插件，支持 MP3、WAV、PCM 格式，支持浏览器内核：chrome、firefox、opera、safari、IE9+、360、QQ 浏览器等。


## 安装注册

### 安装

> 暂只源码拷贝，后期发布npm包

### 注册

```js
import mvRecorder from '@/components/mv-recorder'
// import RcorderHook from '@/hooks/recorder'


// 注册 语音转文字插件
app.use(mvRecorder, {
  // wsUrl: 'ws://localhost:3000', // websocket地址，可不配
  // recorderHook: RcorderHook // 语音转文字全局钩子回调
})

```

## 使用

### SDK使用

```js
// 引用
const { start, stop } = window.$mvRecorderSdk

// 开始录音
start({
  onRecord: (text) => {
    console.log('[mv-recorder] 语音转文字：', text)
    emit('onRecord', text)
  },
  onEnd: () => {
    console.log('[mv-recorder] 录音结束')
    emit('onEnd')
  }
  // onError: (error) => {
  //   console.log('录音错误', error)
  // }
})


// 停止录音
stop()

```

### 组件使用

#### MvRecord.vue

```html
<template>
  <MvRecord @onRecord="onRecord" @onEnd="onEnd" />
</template>

<script setup>

const onRecord = (text) => {
  console.log('[mv-recorder-use] 语音转文字：', text)
}

const onEnd = () => {
  console.log('[mv-recorder-use] 录音结束')
}
</script>
```

#### 属性说明

| 属性            | 类型    | 默认值 | 说明            |
| --------------- | ------- | ------ | --------------- |
| disabled        | Boolean | false  | 是否禁用        |
| theme           | String  | dark   | 主题 light/dark |
| size            | Number  | 80     | 尺寸            |
| thickness       | Number  | 2      | 进度条宽度      |
| microphoneImage | String  | -      | 麦克风图片      |


#### 事件说明
| 事件          | 参数   | 说明         |
| ------------- | ------ | ------------ |
| emit:onRecord | String | 录音回调     |
| emit:onEnd    | -      | 录音结束回调 |