/**
 * 🛡️ 文本特征检测器（2026-08-28）
 *
 * 需求来源：Figma 里的竖向排版文字（如左侧导航的「监控」「交通诱导」）在转代码时
 * 会被平铺成横排，因为 **Figma 数据里没有「竖排」这个显式标记** —— characters 是
 * 连续字符串（"监控"），竖排是靠「文本框宽度受限 + 自动换行」实现的。
 *
 * 设计原则：**不硬编码阈值，一切都从 Figma 原生语义与字体度量推导**。
 *
 * 判定依据（按优先级）：
 *  1. `style.textAutoResize === 'HEIGHT'` —— Figma 原生语义：宽度固定、高度自适应，
 *     意味着文字会被迫换行。这是「可能竖排」的必要前提。
 *     （`WIDTH_AND_HEIGHT` 表示宽高都自适应 = 单行横向延伸，必然横排。）
 *  2. 用 fontSize 推算单字宽（全角≈1em，半角≈0.55em），判断实测宽度是否只够放一个字。
 *     宽到能放多个字 → 只是普通的横排换行（段落），不是竖排。
 *  3. 字数 ≥ 2 —— 单字谈不上排版方向。
 *
 * 以上全部基于节点自身数据（fontSize / textAutoResize / absoluteBoundingBox），
 * 自适应任意字号与语言，不含针对某个设计稿的固定数字。
 */

/** 全角字符范围：CJK 汉字、中文标点、全角符号、日文假名 —— 字宽约等于 1em */
const FULLWIDTH_RE =
  /[　-〿㐀-䶿一-鿿＀-￯぀-ヿ]/;

/**
 * 默认配置：所有可调参数集中于此，支持调用方注入覆盖，避免在逻辑里散落魔数。
 */
export const DEFAULT_TRAIT_CONFIG = {
  /** 判定「宽度只够放一个字」的容差倍数：实测宽 <= 单字宽 × 该系数 */
  singleColumnFactor: 1.5,
  /** 全角字宽 / 字号 */
  fullWidthEm: 1.0,
  /** 半角字宽 / 字号 */
  halfWidthEm: 0.55,
  /** 节点缺 style 时的兜底字号 */
  fallbackFontSize: 14,
  /** 节点缺行高时的兜底倍数 */
  fallbackLineHeightEm: 1.2,
};

/** 字符数（按 Unicode 码点，避免代理对问题） */
function charLength(text) {
  return text ? Array.from(String(text)).length : 0;
}

/** 是否以全角字符为主（决定单字宽用 1em 还是 0.55em） */
function isFullWidthDominant(text) {
  if (!text) return false;
  const chars = Array.from(String(text));
  const full = chars.filter((c) => FULLWIDTH_RE.test(c)).length;
  return full * 2 >= chars.length; // 全角占比过半即按全角处理
}

/**
 * 推算单字宽度（基于字号，非硬编码）
 * @param {number} fontSize
 * @param {boolean} fullWidth
 * @param {Object} cfg
 */
export function estimateUnitWidth(fontSize, fullWidth, cfg = DEFAULT_TRAIT_CONFIG) {
  const c = { ...DEFAULT_TRAIT_CONFIG, ...(cfg || {}) };
  const size = Number(fontSize) > 0 ? Number(fontSize) : c.fallbackFontSize;
  return size * (fullWidth ? c.fullWidthEm : c.halfWidthEm);
}

/**
 * 检测单个文本节点是否为竖向排版
 *
 * @param {Object} node Figma TEXT 节点
 * @param {Object} [cfg] 覆盖默认配置
 * @returns {{vertical:boolean, reason:string, metrics:Object}}
 */
export function detectVerticalText(node, cfg) {
  const c = { ...DEFAULT_TRAIT_CONFIG, ...(cfg || {}) };
  const chars = node?.characters;
  const bb = node?.absoluteBoundingBox;
  const style = node?.style || {};

  const metrics = {
    charCount: charLength(chars),
    fontSize: Number(style.fontSize) || c.fallbackFontSize,
    resize: style.textAutoResize || null,
    width: bb?.width ?? null,
    height: bb?.height ?? null,
  };

  if (!chars || metrics.charCount < 2) {
    return { vertical: false, reason: '单字或空文本，无排版方向可言', metrics };
  }
  if (!bb?.width || !bb?.height) {
    return { vertical: false, reason: '缺少包围盒，无法判定', metrics };
  }

  // ① Figma 原生语义：宽高都自适应 = 单行横向延伸，必然横排
  if (style.textAutoResize === 'WIDTH_AND_HEIGHT') {
    return { vertical: false, reason: 'textAutoResize=WIDTH_AND_HEIGHT（单行横排）', metrics };
  }
  // 宽度受限才会换行，是竖排的必要前提
  if (style.textAutoResize !== 'HEIGHT') {
    return { vertical: false, reason: `textAutoResize=${style.textAutoResize || '未知'}，非宽度受限`, metrics };
  }

  // ② 用字体度量推算单字宽，看实测宽度是否只够一列
  const fullWidth = isFullWidthDominant(chars);
  const unitW = estimateUnitWidth(metrics.fontSize, fullWidth, c);
  metrics.unitWidth = Math.round(unitW * 100) / 100;
  metrics.fullWidth = fullWidth;

  const columnsFit = bb.width / unitW;
  metrics.columnsFit = Math.round(columnsFit * 100) / 100;

  if (columnsFit > c.singleColumnFactor) {
    return {
      vertical: false,
      reason: `宽度可容纳约 ${metrics.columnsFit} 字（> ${c.singleColumnFactor}），属横排换行`,
      metrics,
    };
  }

  return {
    vertical: true,
    reason: `宽度受限（仅约 ${metrics.columnsFit} 字宽）且高度随字数增长 → 竖向排版`,
    metrics,
  };
}

/**
 * 文本特征检测器注册表 —— 可扩展。
 * 新增一种文本特征（如旋转文字、截断省略、字间距异常）只需往这里加一项，
 * 无需改动调用方。
 *
 * @type {Array<{id:string, name:string, detect:(node:Object, cfg:Object)=>Object}>}
 */
export const TEXT_TRAIT_DETECTORS = [
  {
    id: 'vertical-text',
    name: '竖向排版',
    detect: (node, cfg) => detectVerticalText(node, cfg),
  },
];

/**
 * 对节点跑全部检测器，汇总特征
 * @param {Object} node
 * @param {Object} [cfg]
 * @returns {Object} 形如 { 'vertical-text': {vertical:true, reason, metrics} }
 */
export function detectTextTraits(node, cfg) {
  const c = { ...DEFAULT_TRAIT_CONFIG, ...(cfg || {}) };
  const traits = {};
  for (const detector of TEXT_TRAIT_DETECTORS) {
    try {
      traits[detector.id] = detector.detect(node, c);
    } catch (err) {
      traits[detector.id] = { error: err?.message || String(err) };
    }
  }
  return traits;
}

/**
 * 便捷判定：是否竖向排版
 * @param {Object} node
 * @param {Object} [cfg]
 */
export function isVerticalText(node, cfg) {
  return detectVerticalText(node, cfg).vertical;
}

export default {
  DEFAULT_TRAIT_CONFIG,
  TEXT_TRAIT_DETECTORS,
  estimateUnitWidth,
  detectVerticalText,
  detectTextTraits,
  isVerticalText,
};
