<!--
 * @Description: 语音转文字组件 可以看文字输出和声波
 * @Author: zhuqiqd 1972662943@qq.com
 * @Date: 2025-03-19 10:29:35
 * @LastEditors: zhuqiqd 1972662943@qq.com
 * @LastEditTime: 2025-03-20 16:17:41
 * @FilePath: /src/components/mv-recorder/components/RecordView.vue
-->
<template>
  <div
    class="mv-record-box"
    :class="[{ disabled }, theme]"
    :style="styles?.boxStyle"
    @click="handleRecord"
  >
    <img
      :src="microphoneImage || currentThemeConfig?.microphoneImage"
      alt=""
      v-if="!isRecording"
      class="record-icon opacity"
      title="开启录音"
    />
  </div>
</template>
<script setup>
import CircleProgress from './CircleProgress.vue'
import microphoneDark from '../images/dark/microphone.svg?url'
import microphoneLight from '../images/light/microphone.svg?url'
const { start, stop } = window.$mvRecorderSdk

const themeConfig = {
  dark: {
    progressProps: {
      color: { start: '#12A9F9', end: '#4CE1D1' },
    },
    microphoneImage: microphoneDark,
  },
  light: {
    progressProps: {
      color: { start: '#0DA3FC', end: 'rgba(255,255,255,0.5)' },
    },
    microphoneImage: microphoneLight,
  },
}

const props = defineProps({
  // 是否禁用
  disabled: {
    type: Boolean,
    default: false,
  },
  // 麦克风图片
  microphoneImage: {
    type: String,
    default: () => '',
  },
  // 尺寸
  size: {
    type: Number,
    default: 80,
  },
  // 进度条宽度
  thickness: {
    type: Number,
    default: 2,
    validator: (v) => v > 0,
  },
  // 主题
  theme: {
    type: String,
    default: 'light',
  },
})
const emit = defineEmits(['onRecord', 'onEnd'])
const isRecording = ref(false)
const isRunning = ref(false) // 是否正在计时
const elapsedTime = ref(0) // 已耗时（以毫秒为单位）
let intervalId = null // setInterval的ID

const currentThemeConfig = computed(() => {
  return themeConfig[props.theme] || themeConfig.dark
})

// 按钮尺寸
const buttonSize = computed(() => {
  return props.size - 8
})

// 样式
const styles = computed(() => {
  return {
    boxStyle: {
      width: `${props.size}px`,
      height: `${props.size}px`,
    },
    buttonStyle: {
      width: `${buttonSize.value}px`,
      height: `${buttonSize.value}px`,
    },
  }
})

/**
 * @description: 点击录音按钮
 * @return {*}
 */
const handleRecord = async () => {
  if (props.disabled) return

  isRecording.value = !isRecording.value
  if (isRecording.value) {
    startrecord()
  } else {
    stoprecord()
  }
}

/**
 * @description: 开始录音
 * @return {*}
 */
const startrecord = () => {
  startTimer()
  start({
    onRecord: (text) => {
      console.log('[mv-recorder] 语音转文字：', text)
      emit('onRecord', text)
    },
    onEnd: () => {
      console.log('[mv-recorder] 录音结束')
      emit('onEnd')
    },
    // onError: (error) => {
    //   console.log('录音错误', error)
    // }
  })
}
/**
 * @description: 停止录音
 * @return {*}
 */
const stoprecord = () => {
  stop()
  resetTimer()
}
// 格式化时间
const formatTime = (milliseconds) => {
  const seconds = Math.floor((milliseconds / 1000) % 60)
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60)
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24)
  if (hours) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
// 启动计时器
const startTimer = () => {
  if (isRunning.value) return // 如果已经在计时，直接返回
  isRunning.value = true // 更新状态为“正在计时”
  intervalId = setInterval(() => {
    elapsedTime.value += 1000 // 每秒累加1000毫秒
  }, 1000)
}

// 暂停计时器
// const pauseTimer = () => {
//   isRunning.value = false // 更新状态为“暂停”
//   clearInterval(intervalId) // 清除计时器
// }

// 重置计时器
const resetTimer = () => {
  isRunning.value = false // 更新状态为“已重置”
  clearInterval(intervalId) // 清除计时器
  elapsedTime.value = 0 // 将已耗时设置为0
}
</script>
<style lang="less" scoped>
// 弹性布局居中
.flex(@jc:center, @ai:center, @fd:row) {
  display: flex;
  justify-content: @jc;
  align-items: @ai;
  flex-direction: @fd;
}

.ellipsis() {
  white-space: nowrap; /* 防止文本换行 */
  overflow: hidden; /* 隐藏溢出的内容 */
  text-overflow: ellipsis; /* 显示省略号来代表被修剪的文本 */
}
.mv-record-box {
  @borderWidth: var(--borderWidth, 4px);
  width: 50px;
  height: 50px;
  border-radius: var(--radius-full);
  cursor: pointer;
  font-size: 12px;
  padding: @borderWidth;
  &.disabled {
    cursor: not-allowed;
  }
  .record-button {
    position: relative;
    border-radius: var(--radius-full);
    .flex();

    .record-progress {
      position: absolute;
    }
    .record-icon {
      width: 30%;
    }

    .suspended-box {
      width: 100%;
      height: 100%;
      .flex(center, center, column);
      .suspended-icon {
        width: 30%;
        height: 30%;
        margin-bottom: 6%;
        border-radius: var(--radius-xs);
        background: #f35555;
      }
    }
  }

  // 主题dark
  &.dark {
    background: #3c3c3c;
    color: #44e4ff;
    .record-button {
      background: #393939;
    }
  }

  &.light {
    background: #d5e4f2;
    color: #308dfa;
    .record-button {
      background: #eff4fa;
    }
  }
}
</style>
