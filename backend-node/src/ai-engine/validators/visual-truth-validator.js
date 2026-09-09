/**
 * 🛡️ 视觉真值校验（P1-6，2026-08-28）
 *
 * 背景：LLM 生成样式时，间距 / 圆角 / 装饰全凭臆测，没有 Figma 真值约束。
 * 实锤（mv-max-1787908524561-75ed1f2d 环境监测）：
 *  - 根容器自加 `box-shadow: 0px 4px 10px rgba(74,117,141,.25)` + `border-radius: 4px`
 *    → 组件变成"浮起的卡片"，而 Figma 设计是扁平的（无阴影、无描边）
 *  - `.monitor-tabs { gap: 0 }` → tab 紧贴，而 Figma 中 tab 之间有明确间隔
 *  - `.tab-item { border-radius: 2px }` → 激活态胶囊几乎看不出圆角，Figma 是大圆角胶囊
 *
 * 方案：从 Figma 节点树提取「设计真值」，与产物 CSS 比对，偏差超阈值即告警。
 * 这是「效果不佳」的唯一根本解——没有真值，LLM 永远在猜。
 *
 * Figma 提供的真值字段（已实测存在于 figma-node-data.json）：
 *  - itemSpacing  → CSS gap（Auto Layout 子元素间距）
 *  - cornerRadius → CSS border-radius
 *  - effects      → DROP_SHADOW / INNER_SHADOW（对应 box-shadow）
 *  - strokes      → 描边（对应 border）
 *  - fills        → 填充（对应 background）
 *
 * 设计取舍：不做「Figma 节点 → CSS 选择器」的精确映射（节点名是中文、class 是语义英文，
 * 映射不可靠）。改为**分布级比对**——比对真值与产物的取值集合是否一致，
 * 既能发现系统性偏差（全 gap:0、多出阴影），又不依赖脆弱的名称匹配。
 */

/** 容差：允许 ±2px 的合理误差（设计稿取整、浏览器亚像素） */
const RADIUS_TOLERANCE = 2;

/** 遍历 Figma 节点树 */
function walkFigma(node, fn, depth = 0) {
  if (!node || typeof node !== 'object') return;
  fn(node, depth);
  const children = node.children || [];
  for (const child of children) walkFigma(child, fn, depth + 1);
}

/**
 * 从 Figma 节点数据提取设计真值
 * @param {Object} figmaNodeData 形如 { document: {...} } 或直接是节点
 * @returns {{
 *   spacings: number[], radii: number[], hasShadow: boolean, hasStroke: boolean,
 *   rootShadow: boolean, rootStroke: boolean, nodeCount: number
 * }}
 */
export function extractDesignTruth(figmaNodeData) {
  const truth = {
    spacings: [],
    radii: [],
    hasShadow: false,
    hasStroke: false,
    rootShadow: false,
    rootStroke: false,
    nodeCount: 0,
  };
  if (!figmaNodeData) return truth;

  const root = figmaNodeData.document || figmaNodeData;
  let isRoot = true;

  walkFigma(root, (node) => {
    truth.nodeCount += 1;

    // 间距（Auto Layout）
    if (typeof node.itemSpacing === 'number' && node.itemSpacing > 0) {
      truth.spacings.push(node.itemSpacing);
    }
    if (typeof node.counterAxisSpacing === 'number' && node.counterAxisSpacing > 0) {
      truth.spacings.push(node.counterAxisSpacing);
    }

    // 圆角
    if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
      truth.radii.push(node.cornerRadius);
    }

    // 阴影
    const effects = Array.isArray(node.effects) ? node.effects : [];
    const shadow = effects.some(
      (e) =>
        e &&
        e.visible !== false &&
        /SHADOW/i.test(e.type || '') &&
        /DROP_SHADOW|INNER_SHADOW/i.test(e.type || ''),
    );
    if (shadow) {
      truth.hasShadow = true;
      if (isRoot) truth.rootShadow = true;
    }

    // 描边
    const strokes = Array.isArray(node.strokes) ? node.strokes : [];
    const stroked = strokes.some((s) => s && s.visible !== false);
    if (stroked) {
      truth.hasStroke = true;
      if (isRoot) truth.rootStroke = true;
    }

    isRoot = false;
  });

  return truth;
}

/**
 * 从产物样式（.less / .vue 内联 style）提取实际视觉取值
 * @param {Object<string,string>} files 路径 → 内容
 * @returns {{ gaps: number[], radii: number[], shadows: number, rootShadows: number }}
 */
export function extractProductStyle(files) {
  const product = {
    gaps: [],
    radii: [],
    shadows: 0,
    rootShadows: 0,
    zeroGapDecls: 0,
  };
  if (!files || typeof files !== 'object') return product;

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (!/\.(vue|less|css)$/i.test(path)) continue;

    // gap: 收集声明值（含 gap / row-gap / column-gap）
    for (const m of content.matchAll(
      /(?:^|[;\s{])(?:row-|column-)?gap\s*:\s*([^;}]+)/gi,
    )) {
      const nums = String(m[1]).match(/-?\d+(?:\.\d+)?/g) || [];
      for (const n of nums) {
        const v = parseFloat(n);
        if (!Number.isNaN(v)) product.gaps.push(v);
      }
    }

    // border-radius
    // ⚠️ 只取 px 值：百分比（如徽章的 50%）与 px 不可比，会污染最大值比对
    for (const m of content.matchAll(
      /(?:^|[;\s{])border-radius\s*:\s*([^;}]+)/gi,
    )) {
      const raw = String(m[1]);
      if (/%/.test(raw)) continue;
      const nums = raw.match(/-?\d+(?:\.\d+)?/g) || [];
      for (const n of nums) {
        const v = parseFloat(n);
        if (!Number.isNaN(v)) product.radii.push(v);
      }
    }

    // 显式 gap: 0 —— 设计稿有间距时的强信号（设计有间距却显式写 0，几乎总是错的）
    for (const m of content.matchAll(
      /(?:^|[;\s{])(?:row-|column-)?gap\s*:\s*([^;}]+)/gi,
    )) {
      const raw = String(m[1]).trim().toLowerCase();
      if (/^0(?:px)?$/.test(raw)) product.zeroGapDecls += 1;
    }

    // box-shadow（排除 none / 0 0 0 这类空值）
    for (const m of content.matchAll(
      /(?:^|[;\s{])box-shadow\s*:\s*([^;}]+)/gi,
    )) {
      const val = String(m[1]).trim().toLowerCase();
      if (!val || val === 'none' || /^0(\s+0)*$/.test(val)) continue;
      product.shadows += 1;
      // 定位所属规则的选择器：往前找最近的 '{'，再取其前的文本作为选择器上下文。
      // （旧实现用固定 160 字符窗口，实测根容器规则内 box-shadow 距选择器 207 字符 → 漏判）
      const before = content.slice(0, m.index);
      const lastBrace = before.lastIndexOf('{');
      const selector =
        lastBrace >= 0
          ? before.slice(Math.max(0, lastBrace - 200), lastBrace)
          : before.slice(-200);
      if (/root|wrapper|container|panel|-shell/i.test(selector)) {
        product.rootShadows += 1;
      }
    }
  }

  return product;
}

/**
 * 比对设计真值与产物取值，产出问题清单
 * @param {Object} truth   extractDesignTruth 的返回
 * @param {Object} product extractProductStyle 的返回
 * @param {Object} [options]
 * @param {number} [options.radiusTolerance=RADIUS_TOLERANCE]
 * @returns {Array<{id:string, severity:'BLOCK'|'WARN', message:string}>}
 */
export function compareVisualTruth(truth, product, options = {}) {
  const issues = [];
  const tol = options.radiusTolerance ?? RADIUS_TOLERANCE;
  if (!truth || truth.nodeCount === 0) return issues;

  // ── 规则 A：根容器装饰（阴影）——对应今日 mv-max「私自加阴影」问题 ──
  if (!truth.rootShadow && product.rootShadows > 0) {
    issues.push({
      id: 'VIS-ROOT-SHADOW',
      severity: 'WARN',
      message:
        `Figma 根容器无阴影（effects 中无 DROP_SHADOW），但产物根容器出现 ${product.rootShadows} 处 box-shadow。` +
        `组件会被渲染成"浮起的卡片"，与设计稿扁平外观不符。` +
        `建议：移除根容器的 box-shadow，或确认该装饰确实来自设计稿（而非外壳 base-panel 提供）。`,
    });
  }

  // ── 规则 B：间距——对应今日 tabs gap:0 问题 ──
  const designSpacings = [...new Set(truth.spacings)].filter((s) => s > 0);
  const productGaps = [...new Set(product.gaps)];
  if (designSpacings.length > 0) {
    const minDesign = Math.min(...designSpacings);
    const designList = designSpacings
      .map((s) => s.toFixed(1).replace(/\.0$/, ''))
      .join(' / ');

    // 最强信号：设计稿有间距，产物却「显式」声明 gap: 0（不是漏写，是主动写死 0）
    if (product.zeroGapDecls > 0) {
      issues.push({
        id: 'VIS-GAP-EXPLICIT-ZERO',
        severity: 'WARN',
        message:
          `Figma 存在非零间距（itemSpacing = ${designList}px），` +
          `但产物有 ${product.zeroGapDecls} 处**显式**声明 \`gap: 0\`，子元素会紧贴。` +
          `建议改为约 ${minDesign.toFixed(1).replace(/\.0$/, '')}px，或直接删除该声明沿用默认间距。`,
      });
    } else if (productGaps.length > 0 && productGaps.every((g) => g === 0)) {
      issues.push({
        id: 'VIS-GAP-ZERO',
        severity: 'WARN',
        message:
          `Figma 中存在非零间距（itemSpacing = ${designList}px），` +
          `但产物所有 gap 取值均为 0，子元素会紧贴。建议将相关容器的 gap 设为约 ${minDesign.toFixed(1).replace(/\.0$/, '')}px。`,
      });
    } else if (productGaps.length === 0) {
      issues.push({
        id: 'VIS-GAP-MISSING',
        severity: 'WARN',
        message:
          `Figma 中存在非零间距（itemSpacing = ${designList}px），` +
          `但产物未声明任何 gap。建议为 Auto Layout 容器补上 gap（约 ${minDesign.toFixed(1).replace(/\.0$/, '')}px）。`,
      });
    }
  }

  // ── 规则 C：圆角——对应今日 tab-item border-radius:2px 问题 ──
  const designRadii = [...new Set(truth.radii)].filter((r) => r > 0);
  const productRadii = [...new Set(product.radii)];
  if (designRadii.length > 0 && productRadii.length > 0) {
    const maxDesign = Math.max(...designRadii);
    const maxProduct = Math.max(...productRadii);
    // 产物最大圆角显著小于设计最大圆角（超出容差）→ 圆角被"压平"
    if (maxProduct + tol < maxDesign) {
      issues.push({
        id: 'VIS-RADIUS-FLAT',
        severity: 'WARN',
        message:
          `Figma 最大圆角为 ${maxDesign}px，产物最大圆角仅 ${maxProduct}px（差 ${(maxDesign - maxProduct).toFixed(1)}px，容差 ${tol}px）。` +
          `激活态/胶囊等元素可能丢失圆润外观。建议核对设计稿各层 cornerRadius 并同步到 border-radius。`,
      });
    }
  }

  return issues;
}

/**
 * 一站式入口：给定 Figma 节点数据与产物文件，返回视觉真值校验问题
 * @param {Object} figmaNodeData
 * @param {Object<string,string>} files
 * @param {Object} [options]
 */
export function validateVisualTruth(figmaNodeData, files, options = {}) {
  const truth = extractDesignTruth(figmaNodeData);
  const product = extractProductStyle(files);
  const issues = compareVisualTruth(truth, product, options);
  return { truth, product, issues, warnCount: issues.length };
}

export default {
  extractDesignTruth,
  extractProductStyle,
  compareVisualTruth,
  validateVisualTruth,
};
