<!--
  大屏布局 · 自适应效果预览
  ------------------------------------------------------------
  把「自适应」从抽象参数变成能拖到手的东西：
    拖动视口右下角手柄改比例 → 立刻看到同一份布局在 6 种策略下的不同表现。

  关键设计：
    视口框的显示尺寸 = 逻辑视口尺寸，全部按比例驱动；
    内容盒按 fitMode 算出 → 留边 / 冲出裁切 / 骨架伸缩 的差别一眼可见。
    另附「非等比拉伸」反面教材开关，用来演示为什么不该选它。
-->
<template>
  <Teleport to="body">
    <div v-if="visible" class="ap-mask" @click.self="close">
      <div class="ap-modal">
        <!-- 头部 -->
        <div class="ap-head">
          <div class="ap-title">
            自适应效果预览
            <span class="ap-sub">拖动右下角手柄改视口比例</span>
          </div>
          <button class="ap-close" title="关闭" @click="close">✕</button>
        </div>

        <!-- 控制条 -->
        <div class="ap-controls">
          <div class="ap-group">
            <span class="ap-label">适配策略</span>
            <button
              v-for="o in FIT_OPTIONS"
              :key="o.value"
              class="ap-chip"
              :class="{ active: fit === o.value && !stretchDemo }"
              :title="`${o.desc}（${o.effect}）`"
              @click="pickFit(o.value)"
            >
              {{ o.label }}
            </button>
            <span v-if="!fitWritable" class="ap-hint">候选布局 · 应用后才可写回</span>
          </div>

          <div class="ap-group">
            <span class="ap-label">视口比例</span>
            <button
              v-for="p in VIEW_PRESETS"
              :key="p.label"
              class="ap-chip"
              :class="{ active: isPresetActive(p) }"
              @click="applyPreset(p)"
            >
              {{ p.label }}<em>{{ p.desc }}</em>
            </button>
          </div>

          <div class="ap-group">
            <button
              class="ap-chip ap-chip-warn"
              :class="{ active: stretchDemo }"
              title="演示非等比拉伸：圆会变椭圆、文字会压扁"
              @click="stretchDemo = !stretchDemo"
            >
              非等比拉伸<em>反面教材</em>
            </button>
          </div>
        </div>

        <!-- 舞台 -->
        <div class="ap-stage">
          <div
            class="ap-frame"
            :style="{ width: vw + 'px', height: vh + 'px' }"
          >
            <div class="ap-content" :style="contentStyle">
              <LayoutWireframe :layout="layout" />
              <!-- 比例探针：验证「有没有被拉变形」 -->
              <div class="ap-probe">
                <span class="ap-probe-circle"></span>
                <span class="ap-probe-square"></span>
                <span class="ap-probe-text">Aa12</span>
              </div>
            </div>

            <!-- 尺寸角标 -->
            <div class="ap-badge">{{ vw }} × {{ vh }}</div>
            <div v-if="overflowText" class="ap-overflow">{{ overflowText }}</div>

            <!-- 拖拽手柄 -->
            <div class="ap-handle" title="拖动改视口大小" @mousedown="startDrag">
              <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                <path d="M9 1v8H1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>
            </div>
          </div>
        </div>

        <!-- 读数 -->
        <div class="ap-readout">
          <span>视口 <b>{{ vw }}×{{ vh }}</b></span>
          <span>设计稿 <b>{{ designW }}×{{ designH }}</b></span>
          <span>缩放 <b>{{ scaleText }}</b></span>
          <span class="ap-note">{{ note }}</span>
          <span class="ap-reset" @click="resetViewport">重置视口</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ScreenLayout, OutputScaleMode } from '@/types/screen-layout'
import LayoutWireframe from './LayoutWireframe.vue'
import { FIT_OPTIONS } from '../utils/nl-layout-parser'

const props = defineProps<{
  visible: boolean
  layout: ScreenLayout
  /** 当前展示的是否就是编辑器里的布局（否则是尚未应用的候选布局） */
  fitWritable?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  /**
   * 用户在这里切了适配策略。
   * 🔑 必须往外抛：否则浮层里选的策略只影响本浮层的演示，
   *    编辑器里的 outputScaleMode 不动 ⇒ 最终产物跟用户看到的不一样（死选项）。
   */
  (e: 'update:fit', v: OutputScaleMode): void
}>()

// ── 适配策略 ──
const fit = ref<OutputScaleMode>(props.layout.canvas.outputScaleMode || 'fluid')
const stretchDemo = ref(false)

watch(
  () => props.layout,
  (l) => {
    fit.value = l.canvas.outputScaleMode || 'fluid'
  },
)

function pickFit(v: OutputScaleMode) {
  if (v === fit.value) return
  fit.value = v
  // 手工切策略时关掉反面教材，避免读数误导
  stretchDemo.value = false
  emit('update:fit', v)
}

// ── 视口 ──
interface ViewPreset {
  label: string
  desc: string
  w: number
  h: number
  ratio: number
}

const VIEW_PRESETS: ViewPreset[] = [
  { label: '1920×1080', desc: '16:9', w: 640, h: 360, ratio: 16 / 9 },
  { label: '2560×1080', desc: '21:9', w: 700, h: 295, ratio: 64 / 27 },
  { label: '3840×1080', desc: '32:9', w: 740, h: 208, ratio: 32 / 9 },
  { label: '1024×768', desc: '4:3', w: 560, h: 420, ratio: 4 / 3 },
  { label: '390×844', desc: '9:16', w: 300, h: 649, ratio: 390 / 844 },
]

const vw = ref(640)
const vh = ref(360)

const MIN_W = 220
const MIN_H = 150
const MAX_W = 1500
const MAX_H = 900

function isPresetActive(p: ViewPreset): boolean {
  return Math.abs(vw.value / vh.value - p.ratio) < 0.012
}

function applyPreset(p: ViewPreset) {
  vw.value = p.w
  vh.value = p.h
}

function resetViewport() {
  vw.value = 640
  vh.value = 360
}

function startDrag(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const startW = vw.value
  const startH = vh.value

  const onMove = (ev: MouseEvent) => {
    vw.value = Math.max(MIN_W, Math.min(MAX_W, Math.round(startW + (ev.clientX - startX))))
    vh.value = Math.max(MIN_H, Math.min(MAX_H, Math.round(startH + (ev.clientY - startY))))
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'nwse-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ── 尺寸计算 ──
const designW = computed(() => props.layout.canvas.width || 1920)
const designH = computed(() => props.layout.canvas.height || 1080)

interface Box {
  w: number
  h: number
  left: number
  top: number
  scale: number
  note: string
  overflowX: boolean
  overflowY: boolean
  transform?: string
  originX?: string
  originY?: string
}

const box = computed<Box>(() => {
  const dw = designW.value
  const dh = designH.value
  const w = vw.value
  const h = vh.value

  const kContain = Math.min(w / dw, h / dh)
  const kWidth = w / dw
  const kHeight = h / dh

  const mk = (
    bw: number,
    bh: number,
    scale: number,
    note: string,
    extra?: Partial<Box>,
  ): Box => {
    const left = (w - bw) / 2
    const top = (h - bh) / 2
    return {
      w: bw,
      h: bh,
      left,
      top,
      scale,
      note,
      overflowX: bw > w + 0.5,
      overflowY: bh > h + 0.5,
      ...extra,
    }
  }

  // 反面教材：把等比内接框非等比拉满视口 → 圆变椭圆
  if (stretchDemo.value) {
    const bw = dw * kContain
    const bh = dh * kContain
    return {
      w: bw,
      h: bh,
      left: 0,
      top: 0,
      scale: kContain,
      note: '非等比拉伸：横向 ×' + (w / bw).toFixed(2) + '，纵向 ×' + (h / bh).toFixed(2) + ' —— 圆已被拉成椭圆',
      overflowX: false,
      overflowY: false,
      transform: `scale(${(w / bw).toFixed(5)}, ${(h / bh).toFixed(5)})`,
      originX: '0',
      originY: '0',
    }
  }

  switch (fit.value) {
    case 'contain':
      return mk(dw * kContain, dh * kContain, kContain, '整体等比缩放，四周留边，内容不裁切')

    case 'fillWidth':
      return mk(w, dh * kWidth, kWidth, '宽度贴满，高度按比例冲出视口')

    case 'fillHeight':
      return mk(dw * kHeight, h, kHeight, '高度贴满，宽度按比例冲出视口')

    case 'none':
      return mk(dw, dh, 1, '按设计稿 1:1 渲染，超出视口部分被裁切')

    case 'hybrid': {
      // 先等比内接，再把差额小于 12% 的方向贴边（留边被吸收，但不产生变形）
      let bw = dw * kContain
      let bh = dh * kContain
      if ((w - bw) / w < 0.12) bw = w
      if ((h - bh) / h < 0.12) bh = h
      return mk(bw, bh, kContain, '等比缩放为主，剩余差额由骨架弹性吸收（留边被吃掉）')
    }

    case 'fluid':
    default:
      return mk(w, h, NaN, '骨架（列宽/间距）弹性伸缩铺满，元素比例不变形')
  }
})

const contentStyle = computed(() => {
  const b = box.value
  const s: Record<string, string> = {
    width: `${Math.round(b.w)}px`,
    height: `${Math.round(b.h)}px`,
    left: `${Math.round(b.left)}px`,
    top: `${Math.round(b.top)}px`,
  }
  if (b.transform) {
    s.transform = b.transform
    s.transformOrigin = `${b.originX} 0`
  }
  return s
})

const scaleText = computed(() => {
  const s = box.value.scale
  if (!isFinite(s)) return '骨架伸缩'
  return `×${(s * 100).toFixed(1)}%`
})

const note = computed(() => box.value.note)

const overflowText = computed(() => {
  const b = box.value
  if (!b.overflowX && !b.overflowY) return ''
  if (b.overflowX && b.overflowY) return '内容两轴均被裁切'
  return b.overflowX ? '内容横向被裁切' : '内容纵向被裁切'
})

function close() {
  emit('update:visible', false)
}
</script>

<style scoped lang="less">
.ap-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.ap-modal {
  width: min(1180px, 100%);
  max-height: 100%;
  background: #0f1722;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── 头部 ── */
.ap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ap-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.ap-sub {
  font-size: 12px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.32);
}

.ap-close {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s;

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
}

/* ── 控制条 ── */
.ap-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.ap-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ap-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.34);
  min-width: 56px;
  flex-shrink: 0;
}

.ap-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.34);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  white-space: nowrap;
}

.ap-chip {
  height: 26px;
  padding: 0 11px;
  border-radius: 13px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 5px;

  em {
    font-style: normal;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.28);
  }

  &:hover {
    color: #b9d3ff;
    border-color: rgba(56, 132, 255, 0.45);
  }

  &.active {
    background: rgba(56, 132, 255, 0.18);
    border-color: rgba(56, 132, 255, 0.7);
    color: #a8c8ff;
  }
}

.ap-chip-warn.active {
  background: rgba(255, 122, 69, 0.18);
  border-color: rgba(255, 122, 69, 0.7);
  color: #ffb08f;
}

/* ── 舞台 ── */
.ap-stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1219;
}

.ap-frame {
  position: relative;
  flex-shrink: 0;
  border: 1px solid rgba(120, 170, 255, 0.4);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 12px 40px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  transition: width 0.12s linear, height 0.12s linear;
}

.ap-content {
  position: absolute;
  overflow: hidden;
  transition: none;
}

/* 比例探针 */
.ap-probe {
  position: absolute;
  left: 7px;
  bottom: 7px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.ap-probe-circle {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 200, 90, 0.85);
  flex-shrink: 0;
}

.ap-probe-square {
  width: 18px;
  height: 18px;
  background: rgba(120, 220, 170, 0.8);
  flex-shrink: 0;
}

.ap-probe-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
}

/* 角标 */
.ap-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgba(160, 200, 255, 0.8);
  background: rgba(11, 18, 25, 0.7);
  padding: 2px 7px;
  border-radius: 4px;
  pointer-events: none;
}

.ap-overflow {
  position: absolute;
  top: 6px;
  left: 8px;
  font-size: 11px;
  color: #ffb08f;
  background: rgba(60, 22, 10, 0.85);
  padding: 2px 7px;
  border-radius: 4px;
  pointer-events: none;
}

/* 拖拽手柄 */
.ap-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  color: rgba(160, 200, 255, 0.85);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  background: linear-gradient(135deg, transparent 45%, rgba(56, 132, 255, 0.35) 45%);
  border-bottom-right-radius: 2px;

  &:hover {
    color: #fff;
    background: linear-gradient(135deg, transparent 40%, rgba(56, 132, 255, 0.7) 40%);
  }
}

/* ── 读数 ── */
.ap-readout {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 11px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  flex-shrink: 0;
  flex-wrap: wrap;

  b {
    color: rgba(255, 255, 255, 0.85);
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
}

.ap-note {
  color: rgba(160, 200, 255, 0.7);
}

.ap-reset {
  margin-left: auto;
  color: rgba(56, 132, 255, 0.9);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}
</style>
