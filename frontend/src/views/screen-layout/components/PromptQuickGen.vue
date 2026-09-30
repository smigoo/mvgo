<!--
  大屏布局 · 一句话生成 + 继续说
  ------------------------------------------------------------
  两段式：
    ① 生成（create）：一句话 → 立刻出「结构摘要 + 线框预览」（纯前端、毫秒级、不调模型）
    ② 修改（refine）：应用之后还能继续说「顶栏改 100px」「左边窄一点」，
       同样是确定性解析，改完仍可 Ctrl+Z 回退（复用编辑器自己的撤销栈）。

  刻意不做的事：
    · 不追问：解析不到的维度一律给默认值 + 提示，让用户改而不是答。
    · 不弹窗：有歧义时并排给出「主解读 / 备选解读」，一键切换，可逆。
    · 不直接落库：refine 先出「变更清单 + 线框」让用户核对，再点应用。
-->
<template>
  <div class="qg" :class="{ 'qg-collapsed': !expanded }">
    <!-- ── 已应用状态（进入「继续说」模式） ── -->
    <div v-if="applied" class="qg-applied">
      <span class="qg-applied-check">✓</span>
      <span class="qg-applied-text">已应用到编辑器</span>
      <span class="qg-applied-sum">{{ appliedSummary }}</span>
      <button class="qg-btn qg-btn-ghost qg-btn-mini" @click="reset">重新开始</button>
    </div>

    <!-- ── 输入行 ── -->
    <div class="qg-bar">
      <span class="qg-icon" aria-hidden="true">✨</span>
      <input
        ref="inputRef"
        :value="applied ? refineCmd : prompt"
        class="qg-input"
        type="text"
        :placeholder="
          applied
            ? '继续说，例如：顶栏改 100px / 改成三栏 / 左边窄一点 / 每列 3 块'
            : '用一句话描述你想要的布局，例如：1920×1080 铺满不变形，左边上下两块右边上下两块，有顶栏'
        "
        @input="onInput"
        @keydown.enter="onEnter"
      />
      <button
        class="qg-btn qg-btn-primary"
        :disabled="!canSubmit"
        @click="onEnter"
      >
        {{ applied ? '预览修改' : '生成布局' }}
      </button>
      <button v-if="!applied && result" class="qg-btn qg-btn-ghost" @click="clear">清空</button>
      <button
        v-if="result || refineResult"
        class="qg-btn qg-btn-icon"
        :title="expanded ? '收起结果' : '展开结果'"
        @click="expanded = !expanded"
      >
        {{ expanded ? '⌃' : '⌄' }}
      </button>
    </div>

    <!-- ── 示例引导 ── -->
    <div v-if="!applied && !result" class="qg-examples">
      <span class="qg-examples-label">试试：</span>
      <button v-for="ex in examples" :key="ex" class="qg-chip" :title="ex" @click="useExample(ex)">
        {{ ex }}
      </button>
    </div>

    <!-- ── 常用修改指令（已应用后） ── -->
    <div v-if="applied && !refineResult" class="qg-examples">
      <span class="qg-examples-label">常用：</span>
      <button v-for="ex in refineExamples" :key="ex" class="qg-chip" @click="useRefineExample(ex)">
        {{ ex }}
      </button>
    </div>

    <!-- ── 生成结果（create） ── -->
    <div v-if="result && expanded && !applied" class="qg-result">
      <div class="qg-clues">
        <span v-for="c in result.clues" :key="c.label" class="qg-clue">
          <em>{{ c.label }}</em>{{ c.value }}
        </span>
      </div>

      <div class="qg-main">
        <ul class="qg-structure">
          <li v-for="(line, i) in active.structure" :key="i">{{ line }}</li>
        </ul>
        <div class="qg-wire-frame">
          <div class="qg-wire-box" :style="wireStyle">
            <LayoutWireframe :layout="active.layout" :dense="dense" />
          </div>
          <div class="qg-wire-cap">线框预览 · 结构对了再生成产物</div>
        </div>
      </div>

      <div v-if="result.candidates.length > 1" class="qg-alts">
        <span class="qg-alts-label">换一种理解：</span>
        <button
          v-for="(c, i) in result.candidates"
          :key="c.key"
          class="qg-alt-btn"
          :class="{ active: i === activeIdx }"
          :title="c.hint"
          @click="activeIdx = i"
        >
          {{ c.label }}
        </button>
      </div>

      <ul v-if="result.warnings.length" class="qg-warnings">
        <li v-for="(w, i) in result.warnings" :key="i">⚠️ {{ w }}</li>
      </ul>

      <div class="qg-actions">
        <button class="qg-btn qg-btn-primary" @click="apply">应用到编辑器 →</button>
        <button class="qg-btn" @click="emit('preview', active.layout)">预览自适应效果</button>
      </div>
    </div>

    <!-- ── 修改预览（refine） ── -->
    <div v-if="refineResult && expanded && applied" class="qg-result">
      <div class="qg-diff">
        <span class="qg-diff-title">这次会改这些：</span>
        <ul class="qg-diff-list">
          <li v-for="(c, i) in refineResult.changes" :key="i">{{ c }}</li>
        </ul>
      </div>

      <div class="qg-main">
        <ul class="qg-structure">
          <li v-for="(line, i) in refineStructure" :key="i">{{ line }}</li>
        </ul>
        <div class="qg-wire-frame">
          <div class="qg-wire-box" :style="refineWireStyle">
            <LayoutWireframe
              :layout="refineResult.layout!"
              :dense="(refineResult.layout!.body.zones.length ?? 0) > 6"
            />
          </div>
          <div class="qg-wire-cap">改完后长这样</div>
        </div>
      </div>

      <div class="qg-actions">
        <button class="qg-btn qg-btn-primary" @click="applyRefine">应用修改 →</button>
        <button class="qg-btn" @click="emit('preview', refineResult.layout!)">预览自适应效果</button>
        <button class="qg-btn" @click="discardRefine">放弃</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ScreenLayout } from '@/types/screen-layout'
import LayoutWireframe from './LayoutWireframe.vue'
import { parseLayoutPrompt, PROMPT_EXAMPLES, FIT_LABELS, type NlParseResult } from '../utils/nl-layout-parser'
import { parseRefine, REFINE_EXAMPLES, type RefineResult } from '../utils/nl-layout-refine'

const props = defineProps<{
  /** 编辑器当前布局 —— 增量修改的基准 */
  current?: ScreenLayout | null
}>()

const emit = defineEmits<{
  (e: 'apply', layout: ScreenLayout, kind: 'create' | 'refine'): void
  (e: 'preview', layout: ScreenLayout): void
}>()

const examples = PROMPT_EXAMPLES
const refineExamples = REFINE_EXAMPLES

// ── 生成态 ──
const prompt = ref('')
const result = ref<NlParseResult | null>(null)
const activeIdx = ref(0)
const expanded = ref(true)
const inputRef = ref<HTMLInputElement | null>(null)

// ── 已应用态 ──
const applied = ref<ScreenLayout | null>(null)

// ── 修改态 ──
const refineCmd = ref('')
const refineResult = ref<RefineResult | null>(null)

const canSubmit = computed(() => (applied.value ? refineCmd.value.trim() : prompt.value.trim()).length > 0)

const dense = computed(() => (result.value?.candidates[activeIdx.value]?.layout.body.zones.length ?? 0) > 6)

const active = computed(() => {
  const r = result.value!
  return r.candidates[Math.min(activeIdx.value, r.candidates.length - 1)]
})

const wireStyle = computed(() => {
  const l = active.value.layout
  return { aspectRatio: `${l.canvas.width} / ${l.canvas.height}` }
})

const refineWireStyle = computed(() => {
  const l = refineResult.value!.layout!
  return { aspectRatio: `${l.canvas.width} / ${l.canvas.height}` }
})

/** 已应用布局的一句话摘要，让用户不回头也能确认「现在是什么」 */
const appliedSummary = computed(() => {
  const L = applied.value
  if (!L) return ''
  return [
    `${L.canvas.width}×${L.canvas.height}`,
    `${L.body.columns.length} 列 / ${L.body.zones.length} 区`,
    L.header ? `顶栏 ${L.header.height}` : '无顶栏',
    L.footer ? `底栏 ${L.footer.height}` : '无底栏',
    `自适应 ${FIT_LABELS[L.canvas.outputScaleMode] || L.canvas.outputScaleMode}`,
  ].join(' · ')
})

/** 修改后的结构摘要（复用与生成态同款的描述口径） */
const refineStructure = computed(() => {
  const L = refineResult.value?.layout
  if (!L) return []
  const n = L.body.columns.length
  const perCol = L.body.zones.length / Math.max(1, n)
  const equal = L.body.columns.every(c => c.width === L.body.columns[0].width)
  const lines = [
    `画布 ${L.canvas.width}×${L.canvas.height}`,
    L.header ? `顶栏 ${L.header.height}` : '无顶栏',
    perCol <= 1
      ? `主体 ${n} 列并排${equal ? '（等宽）' : `（宽度 ${L.body.columns.map(c => c.width.replace('fr', '')).join(' : ')}）`}`
      : `主体 ${n} 列 × 每列 ${perCol} 块`,
    L.footer ? `底栏 ${L.footer.height}` : '无底栏',
    `自适应：${FIT_LABELS[L.canvas.outputScaleMode] || L.canvas.outputScaleMode}`,
  ]
  return lines
})

// ── 事件 ──

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (applied.value) refineCmd.value = v
  else prompt.value = v
}

function onEnter() {
  if (!canSubmit.value) return
  if (applied.value) doRefine()
  else generate()
}

function useExample(ex: string) {
  prompt.value = ex
  generate()
}

function useRefineExample(ex: string) {
  refineCmd.value = ex
  doRefine()
}

function generate() {
  const text = prompt.value.trim()
  if (!text) return
  result.value = parseLayoutPrompt(text)
  activeIdx.value = 0
  expanded.value = true
}

function clear() {
  result.value = null
  prompt.value = ''
  activeIdx.value = 0
  inputRef.value?.focus()
}

/** 生成态：应用到编辑器，随即进入「继续说」模式 */
function apply() {
  const layout = active.value.layout
  emit('apply', layout, 'create')
  applied.value = layout
  result.value = null
  expanded.value = true
}

/** 修改态：先出变更清单，不直接落盘 —— 解析可能误判，给用户一次核对机会 */
function doRefine() {
  const cmd = refineCmd.value.trim()
  if (!cmd) return
  const base = props.current || applied.value
  if (!base) return

  const r = parseRefine(base, cmd)
  if (!r.ok) {
    refineResult.value = null
    ;(window as any).$message?.info(r.hint || '没听懂这句，换个说法试试')
    return
  }
  refineResult.value = r
  expanded.value = true
}

function applyRefine() {
  const r = refineResult.value
  if (!r?.ok || !r.layout) return
  emit('apply', r.layout, 'refine')
  applied.value = r.layout
  refineCmd.value = ''
  refineResult.value = null
}

function discardRefine() {
  refineResult.value = null
}

function reset() {
  applied.value = null
  refineResult.value = null
  refineCmd.value = ''
  result.value = null
  prompt.value = ''
  inputRef.value?.focus()
}
</script>

<style scoped lang="less">
.qg {
  flex-shrink: 0;
  background: #121924;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── 已应用状态条 ── */
.qg-applied {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 16px 0;
  flex-shrink: 0;
}

.qg-applied-check {
  color: #4ec98a;
  font-size: 12px;
  font-weight: 700;
}

.qg-applied-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
  flex-shrink: 0;
}

.qg-applied-sum {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.36);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.qg-btn-mini {
  margin-left: auto;
  height: 24px;
  padding: 0 10px;
  font-size: 12px;
}

/* ── 输入行 ── */
.qg-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  flex-shrink: 0;
}

.qg-icon {
  font-size: 15px;
  flex-shrink: 0;
}

.qg-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s, background 0.15s;

  &::placeholder {
    color: rgba(255, 255, 255, 0.28);
  }
  &:focus {
    border-color: #3884ff;
    background: rgba(56, 132, 255, 0.08);
  }
}

.qg-btn {
  flex-shrink: 0;
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover:not(:disabled) {
    border-color: rgba(56, 132, 255, 0.6);
    background: rgba(56, 132, 255, 0.12);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.qg-btn-primary {
  background: #2f6fe4;
  border-color: #2f6fe4;
  color: #fff;
  font-weight: 500;

  &:hover:not(:disabled) {
    background: #3d7ff0;
    border-color: #3d7ff0;
  }
}

.qg-btn-ghost {
  background: transparent;
}

.qg-btn-icon {
  padding: 0 10px;
  font-size: 14px;
  line-height: 1;
}

/* ── 示例 / 常用指令 ── */
.qg-examples {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.qg-examples-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}

.qg-chip {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  height: 24px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: #8fb8ff;
    border-color: rgba(56, 132, 255, 0.5);
    border-style: solid;
  }
}

/* ── 结果 ── */
.qg-result {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 12px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  min-height: 0;
}

.qg-clues {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.qg-clue {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);

  em {
    font-style: normal;
    color: rgba(255, 255, 255, 0.34);
    margin-right: 6px;
  }
}

/* ── 变更清单 ── */
.qg-diff {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.qg-diff-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.34);
  flex-shrink: 0;
}

.qg-diff-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;

  li {
    font-size: 12.5px;
    color: #8fd6a8;
    padding-left: 13px;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: rgba(78, 201, 138, 0.85);
    }
  }
}

.qg-main {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.qg-structure {
  margin: 0;
  padding: 0;
  list-style: none;
  flex: 1;
  min-width: 200px;

  li {
    font-size: 12.5px;
    line-height: 1.9;
    color: rgba(255, 255, 255, 0.75);
    padding-left: 14px;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      left: 2px;
      top: 9px;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: rgba(56, 132, 255, 0.7);
    }
  }
}

.qg-wire-frame {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.qg-wire-box {
  height: 132px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  background: #0b1219;
}

.qg-wire-cap {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.28);
}

/* ── 歧义切换 ── */
.qg-alts {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.qg-alts-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.34);
}

.qg-alt-btn {
  height: 26px;
  padding: 0 12px;
  border-radius: 13px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: #b9d3ff;
    border-color: rgba(56, 132, 255, 0.45);
  }
  &.active {
    background: rgba(56, 132, 255, 0.16);
    border-color: rgba(56, 132, 255, 0.65);
    color: #a8c8ff;
  }
}

/* ── 提示 ── */
.qg-warnings {
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    font-size: 12px;
    line-height: 1.7;
    color: rgba(255, 190, 90, 0.85);
  }
}

/* ── 动作 ── */
.qg-actions {
  display: flex;
  gap: 10px;
}
</style>
