/*
 * @Description:mv-recorder 初始化
 * @Author: zhuqiqd 1972662943@qq.com
 * @Date: 2025-03-18 19:46:54
 * @LastEditors: zhuqiqd 1972662943@qq.com
 * @LastEditTime: 2025-03-19 20:50:10
 * @FilePath: /src/components/mv-recorder/lib/init.js
 */

import MvRecorder from './core/main.js'

export default function init(options) {
  const hook = options?.recorderHook()
  const mvRecorder = MvRecorder(options, hook)
  return mvRecorder
}
