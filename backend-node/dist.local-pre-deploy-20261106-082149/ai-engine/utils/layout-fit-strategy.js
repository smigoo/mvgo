/**
 * 大屏布局 — 「自适应策略」(outputScaleMode) 单一事实源
 * ------------------------------------------------------------
 * 为什么单独成模块：
 *   同一个策略语义要同时被三处消费 ——
 *     ① agent  → 注入 LLM 强约束（决定生成什么代码）
 *     ② graph  → 生成多断点预览 HTML（决定预览怎么缩放）
 *     ③ graph  → 代码后处理一致性校验（判断产物是否真的听话）
 *   三处各写一份 = 常量副本温床（本项目已发生过同类事故，见 MEMORY 记录）。
 *
 * 全部为零依赖纯函数，可直接被 node 探针 import 做离线断言。
 * ------------------------------------------------------------
 * 策略语义（与前端 types/screen-layout.ts 的 OutputScaleMode 一一对应）：
 *   fluid      — 骨架弹性伸缩铺满，盒子=视口，元素与文字比例不变形（推荐默认）
 *   hybrid     — 整体等比缩放到接近目标，差额由骨架弹性吸收
 *   contain    — 整体等比缩放，比例不一致时留边，内容绝不裁切
 *   fillWidth  — 宽度铺满，高度按比例溢出
 *   fillHeight — 高度铺满，宽度按比例溢出
 *   none       — 1:1 不缩放
 *   ⚠️ 刻意不提供「非等比拉伸(stretch)」：scaleX ≠ scaleY ⇒ 圆变椭圆、文字压扁。
 */

export const FIT_MODES = Object.freeze([
  'fluid',
  'hybrid',
  'contain',
  'fillWidth',
  'fillHeight',
  'none',
])

/** 与前端解析器默认值保持一致 */
export const DEFAULT_FIT_MODE = 'fluid'

/**
 * 归一化：非法 / 缺失 / 历史值一律回落到 fluid。
 * 兼容旧枚举：旧版只有 contain|fillWidth|fillHeight|none，取值本身仍在 FIT_MODES 内，直接透传。
 */
export function normalizeFitMode(value) {
  return FIT_MODES.includes(value) ? value : DEFAULT_FIT_MODE
}

/** 从 ScreenLayout 里读策略 */
export function readFitMode(layoutData) {
  return normalizeFitMode(layoutData?.canvas?.outputScaleMode)
}

const FIT_SPEC = {
  fluid: {
    name: '铺满不变形（流式骨架）',
    scaleKind: 'none',
    rule:
      '根容器宽高都交给视口（`width: 100%` / `height: 100%`），**不做任何整体 transform 缩放**；' +
      '骨架（列宽 / 行高 / 间距）用 `fr`、`minmax(0, 1fr)`、`clamp()` 弹性伸缩；' +
      '元素自身尺寸与字体比例必须保持不变（禁止非等比变形）。',
  },
  hybrid: {
    name: '等比 + 弹性混合',
    scaleKind: 'contain',
    rule:
      '外层允许整体等比缩放（`transform: scale(min(100vw/W, 100vh/H))`）以贴合目标尺寸，' +
      '剩余差额由内层 `fr` 骨架吸收；**scaleX 与 scaleY 必须相等**，禁止非等比变形。',
  },
  contain: {
    name: '整体等比缩放（留边）',
    scaleKind: 'contain',
    rule:
      '整体等比缩放，宽高比不一致时允许留边，内容绝不裁切；' +
      '列宽仍建议用 `fr`，但不必追求内部骨架弹性。',
  },
  fillWidth: {
    name: '宽度填满（高度按比例）',
    scaleKind: 'fillWidth',
    rule: '宽度铺满容器，高度按设计稿比例推出（可能纵向滚动）；列宽用 `fr` / `%`。',
  },
  fillHeight: {
    name: '高度填满（宽度按比例）',
    scaleKind: 'fillHeight',
    rule: '高度铺满容器，宽度按设计稿比例推出（可能横向滚动）；行高用 `minmax(0, 1fr)`。',
  },
  none: {
    name: '不缩放（1:1）',
    scaleKind: 'none',
    rule: '按设计稿 1:1 渲染，容器尺寸不一致时出现滚动条；尺寸一律使用固定 `px` / `rem`。',
  },
}

/** 取策略规格（未知值走 fluid） */
export function getFitSpec(mode) {
  return FIT_SPEC[normalizeFitMode(mode)]
}

/** 人类可读名称，用于进度消息 / summary */
export function describeFitMode(layoutData) {
  const mode = readFitMode(layoutData)
  return `${getFitSpec(mode).name} (${mode})`
}

function designSize(layoutData) {
  const w = Number(layoutData?.canvas?.width) || 1920
  const h = Number(layoutData?.canvas?.height) || 1080
  return { w, h }
}

/**
 * 构建注入 LLM 的「自适应策略」强约束段落。
 * 注意：措辞必须明确「这是用户在界面上选的」，否则模型会按自己的偏好写死另一套。
 */
export function buildFitConstraint(layoutData) {
  const mode = readFitMode(layoutData)
  const spec = getFitSpec(mode)
  const { w, h } = designSize(layoutData)

  return [
    '## 自适应策略（前端指定 · 强约束）',
    '',
    '| 项 | 值 |',
    '| --- | --- |',
    `| 策略标识 | \`${mode}\` |`,
    `| 策略名称 | ${spec.name} |`,
    `| 设计稿基准 | ${w} × ${h} |`,
    '',
    '**实现要求（必须逐条满足）**',
    '',
    spec.rule,
    '',
    '**纪律**',
    '',
    '- 这是用户在界面上明确选择的策略，**不得**按你自己的偏好替换成另一种做法。',
    '- 若你认为该策略在当前布局下会带来问题，**仍照做**，并把原因写进块一的 `layoutStrategy.fitModeNote`，不要自行改变策略。',
    '- `layoutStrategy.fitMode` 字段必须逐字回填为 `' + mode + '`。',
  ].join('\n')
}

/**
 * 构建多断点预览页里 `#app` 的样式块（按策略决定缩放方式）。
 *
 * - fluid      → 盒子 = 断点视口，不缩放（内部 fr 骨架自然伸缩）
 * - none       → 盒子 = 设计稿尺寸，不缩放
 * - 其余       → 盒子 = 设计稿尺寸，按比例 scale 到断点视口
 *
 * @param {Object} layoutData  ScreenLayout
 * @param {{width:number,height:number}} breakpoint
 */
export function buildPreviewAppCss(layoutData, breakpoint) {
  const mode = readFitMode(layoutData)
  const spec = getFitSpec(mode)
  const { w, h } = designSize(layoutData)
  const bw = Number(breakpoint?.width) || w
  const bh = Number(breakpoint?.height) || h

  if (spec.scaleKind === 'none') {
    if (mode === 'fluid') {
      return [
        `#app {`,
        `      width: ${bw}px;`,
        `      height: ${bh}px;`,
        `      position: relative;`,
        `    }`,
      ].join('\n')
    }
    return [
      `#app {`,
      `      width: ${w}px;`,
      `      height: ${h}px;`,
      `      position: relative;`,
      `    }`,
    ].join('\n')
  }

  let scale
  if (spec.scaleKind === 'fillWidth') {
    scale = bw / w
  } else if (spec.scaleKind === 'fillHeight') {
    scale = bh / h
  } else {
    // contain —— fluid/hybrid 的既定贴合方式
    scale = Math.min(bw / w, bh / h)
  }

  return [
    `#app {`,
    `      width: ${w}px;`,
    `      height: ${h}px;`,
    `      transform-origin: top left;`,
    `      transform: scale(${Number(scale.toFixed(6))});`,
    `      position: relative;`,
    `    }`,
  ].join('\n')
}

/**
 * 产物一致性校验：生成的代码是否真的遵守了所选策略。
 * 只做「能用文本判定的硬事实」，不做主观评分。
 *
 * - fluid：出现整体 `transform: scale(...)` 即为违背（应交给骨架伸缩）
 * - hybrid：允许 scale，但 scaleX/scaleY 不等即为违背（会变形）
 * - contain / fillWidth / fillHeight / none：整体缩放任一形式都合法
 *
 * @param {string} mode
 * @param {string} code Vue SFC 源码
 * @returns {boolean}
 */
export function checkFitHonored(mode, code) {
  const m = normalizeFitMode(mode)
  const src = typeof code === 'string' ? code : ''

  if (m === 'fluid') {
    const mScale = src.match(/transform\s*:\s*scale\(([^)]*)\)/)
    if (!mScale) return true
    // 允许 scale(1) 这类无操作写法，其余视为违背
    return /^\s*1(\.0+)?\s*$/.test(mScale[1])
  }

  if (m === 'hybrid') {
    const mXY = src.match(/scaleX\s*\(\s*(-?[\d.]+)/)
    const mY = src.match(/scaleY\s*\(\s*(-?[\d.]+)/)
    if (mXY && mY) return Number(mXY[1]) === Number(mY[1])
    return true
  }

  return true
}
