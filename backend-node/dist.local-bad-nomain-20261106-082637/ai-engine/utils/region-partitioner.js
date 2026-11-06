/**
 * 🔀 段内分区器（2026-11-03 立项：弹窗家族「严格按视觉布局、禁 LLM 发挥」治本）
 *
 * ## 背景（真机三任务实锤，见 memory 2026-11-03）
 *   同一套 Figma 模板生成的弹窗家族共享结构模式：
 *   `<anchor> = bg RECTANGLE + header VECTOR + slot-icon GROUP（全部内容）`
 *   （36:1693 设备详情 / 38:3134 合作厂商 / 跨 32 目录 slot-icon 家族）。
 *   现有刀53 接管器是「整段二选一」粒度：复合段（kv 网格+描述+标题混居）
 *   整段接管会丢内容 ⇒ fail-closed 挡住 ⇒ 全交 LLM ⇒ 布局发挥
 *   （4ee12198 列对齐参差、b59e9d88 优质厂商臆造深蓝块）。
 *
 * ## 本模块职责（纯函数、无 logger、LLM 零参与）
 *   把复合 leaf 的内容子树按几何分成**互斥子区**（region），每个子区绑定
 *   既有 detect* 同构判据可消化的契约形态（第一版：kvgrid / text 两类）。
 *   装配层（下一刀接线）据 regions 逐区渲染：全部子区可渲染才接管，
 *   任一子区无法判定 ⇒ 整段 fail-open 交 LLM（与现有 fail-closed 精神一致）。
 *
 * ## 判据纪律
 *   - 几何工具单一来源：复用 folded-grid-section-takeover 的 bboxOf/textRun/
 *     clusterByTolerance/KV_TOL（本刀仅加 export，不改实现）；
 *   - 装饰层剥除用**类型 + 命名**双保守判据（RECTANGLE/VECTOR 一律装饰，
 *     GROUP/FRAME 才是内容候选）——错剥内容 ⇒ ok:false 交 LLM，宁漏勿错；
 *   - 穿透只认「唯一内容容器」：直接子 GROUP/FRAME ≥2 ⇒ 不猜，fail-open；
 *   - 剩余未归区文本 > 0 ⇒ ok:false（分区不完整 = 接管会丢内容）。
 */
import { bboxOf, textRun, clusterByTolerance, KV_TOL } from './folded-grid-section-takeover.js';
import { sectionAnchorKey } from './section-anchor-truth.js';

/** 横带聚类容差（px）：kv 行高 14-16、行距 ~20，8px 足以分带不裂行 */
const BAND_TOL = 8;
/** 内容子树穿透深度上限（slot-icon → 81:7 → TEXT = 2 层，3 留裕量） */
const MAX_PIERCE_DEPTH = 3;
/** kv 区最少对数（与 detectKvGridLeaf need>=4 同口径） */
const KV_MIN_PAIRS = 4;

/**
 * 收集内容文本：优先直接子 TEXT；为 0 时穿透唯一内容容器（深度受限）。
 * @returns {{texts:Array<{node:object,box:{x,y,w,h},run:object}>, decor:Array, pierced:string|null}}
 */
function collectContentTexts(anchor) {
  const kids = (anchor?.children || []).filter(Boolean);
  const direct = kids.filter((n) => typeof n?.characters === 'string' && n.characters.trim());
  const decor = [];
  const texts = [];
  const pushText = (n) => {
    const box = bboxOf(n);
    const run = textRun(n);
    if (box && run) texts.push({ node: n, box, run });
  };
  if (direct.length > 0) {
    for (const n of direct) pushText(n);
    for (const n of kids) if (!n.characters) decor.push(n);
    return { texts, decor, pierced: null };
  }
  // —— 穿透：直接子中恰有一个内容容器（GROUP/FRAME）才继续 ——
  const containers = kids.filter((n) => n.type === 'GROUP' || n.type === 'FRAME');
  for (const n of kids) if (n.type === 'RECTANGLE' || n.type === 'VECTOR') decor.push(n);
  if (containers.length !== 1) return { texts: [], decor, pierced: null };
  // 深度受限收集容器子树 TEXT
  const stack = [{ n: containers[0], d: 0 }];
  while (stack.length) {
    const { n, d } = stack.pop();
    for (const c of n.children || []) {
      if (typeof c?.characters === 'string' && c.characters.trim()) pushText(c);
      else if (d + 1 < MAX_PIERCE_DEPTH && (c.type === 'GROUP' || c.type === 'FRAME')) stack.push({ n: c, d: d + 1 });
    }
  }
  return { texts, decor, pierced: String(containers[0]?.id ?? '') };
}

/**
 * 对复合 leaf 做段内分区。
 * @param {object} sec section 树节点（需 sec.id）
 * @param {Map} figmaIndex indexFigmaNodes 产物（entry.rawNode 形状，同 detect* 家族）
 * @returns {{ok:true, kind:'regions', regions:Array<{kind:'kvgrid'|'text', box:{x,y,w,h}, members:Array}>, pierced:string|null}
 *          | {ok:false, reason:string}}
 */
export function partitionLeafRegions(sec, figmaIndex) {
  const entry = figmaIndex && typeof figmaIndex.get === 'function'
    ? figmaIndex.get(sectionAnchorKey(sec))
    : null;
  const anchor = entry?.rawNode;
  if (!anchor) return { ok: false, reason: 'partition:anchorMissing' };
  const anchorBox = bboxOf(anchor);
  if (!anchorBox) return { ok: false, reason: 'partition:anchorBoxMissing' };
  const { texts: rawTexts, pierced } = collectContentTexts(anchor);
  // 🔍 box 相对 anchor 归一（渲染层装配需要段内坐标；绝对画布坐标无装配意义）
  const texts = rawTexts.map((t) => ({
    ...t,
    box: { ...t.box, x: t.box.x - anchorBox.x, y: t.box.y - anchorBox.y },
  }));
  if (texts.length < KV_MIN_PAIRS * 2) return { ok: false, reason: `partition:texts=${texts.length}` };

  // —— 横带聚类（y 锚）——
  const bands = clusterByTolerance(texts.map((t) => Math.round(t.box.y)), BAND_TOL);

  // —— 带分类：kv 带判定（偶数成员、两两 label 左/value 右）——
  const classify = (band) => {
    const members = band.members.map((i) => texts[i]).sort((a, b) => a.box.x - b.box.x);
    const isKvRow =
      members.length >= 2 &&
      members.length % 2 === 0 &&
      members.every((m, k) => k % 2 === 0 || members[k - 1].box.x + members[k - 1].box.w <= m.box.x + KV_TOL);
    return { members, isKvRow };
  };
  const classified = bands.map(classify);

  // —— kv 列锚一致性：所有 kv 带的 label/value x 聚类必须各自成列（≥2 列）——
  const kvRows = classified.filter((c) => c.isKvRow);
  const kvPairCount = kvRows.reduce((s, r) => s + r.members.length / 2, 0);
  const hasKvRegion = kvRows.length >= 2 && kvPairCount >= KV_MIN_PAIRS;

  const regions = [];
  if (hasKvRegion) {
    const members = kvRows.flatMap((r) => r.members);
    const box = unionBox(members);
    regions.push({ kind: 'kvgrid', box, members });
  }
  const rest = classified.filter((c) => !c.isKvRow).flatMap((c) => c.members);
  if (hasKvRegion && rest.length > 0) {
    // kv 区之外的文本按 y 序合并为连续 text 区（渲染层按各自 fs/box 表达，不猜语义）
    const sorted = [...rest].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    regions.push({ kind: 'text', box: unionBox(sorted), members: sorted });
  } else if (!hasKvRegion) {
    // 无 kv 区 ⇒ 整段退化为单 text 区（调用方应优先走既有 text 探测，这里 fail-open）
    return { ok: false, reason: 'partition:noKvRegion' };
  }

  // —— 完整性守卫：每个文本必须恰好归属一个区 ——
  const assigned = regions.reduce((s, r) => s + r.members.length, 0);
  if (assigned !== texts.length) return { ok: false, reason: `partition:unaccounted(${assigned}/${texts.length})` };

  regions.sort((a, b) => a.box.y - b.box.y);
  return { ok: true, kind: 'regions', regions, pierced };
}

function unionBox(members) {
  const x = Math.min(...members.map((m) => m.box.x));
  const y = Math.min(...members.map((m) => m.box.y));
  const right = Math.max(...members.map((m) => m.box.x + m.box.w));
  const bottom = Math.max(...members.map((m) => m.box.y + m.box.h));
  return { x, y, w: right - x, h: bottom - y };
}
