/*
 * @Description: 声波视图注册
 * @Author: zhuqiqd 1972662943@qq.com
 * @Date: 2025-03-19 14:54:22
 * @LastEditors: zhuqiqd 1972662943@qq.com
 * @LastEditTime: 2025-03-19 15:00:08
 * @FilePath: /src/components/mv-recorder/lib/sonic-view/index.js
 */
import './lib.fft'
import WaveViewInstall from './waveview'
import FrequencyHistogramViewInstall from './frequency.histogram.view'

// 波形视图安装
WaveViewInstall(window.Recorder)
// 频率直方图视图安装
FrequencyHistogramViewInstall(window.Recorder)
