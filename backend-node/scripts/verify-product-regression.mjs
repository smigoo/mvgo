#!/usr/bin/env node
/**
 * @file verify-product-regression.mjs — 🛡️ #128 流程四件套 ①：产物级回归清单（固定任务）。
 *
 * 背景：#124–#128 多轮治理的教训是「管线全绿产物全崩」——spec/门禁全过，但真机产物
 *   布局崩/配色错/丢图。根因是验收锚点不在产物级。本脚本把本轮真机事故任务固化为
 *   **固定回归清单**，每轮治理后跑一遍：用真实 figma 缓存 + 真实产物快照重放各守卫，
 *   断言「检出 → 修复 → 复检零」全链路成立（含阳性对照）。
 *
 * 固定回归任务：
 *   A. mc-max-1792459707536-84af4f8f（设备详情，36:1693）
 *      —— 二维字段网格行主序（⑥）/ 头部横向并列（⑦）/ RES-UNREF 丢图（⑧）
 *   B. mc-max-1792459868164-47647fae（dpjh-bsjd，48:5796，非同源双稿）
 *      —— v-for 重复单元几何纠偏（⑤）/ FIRST-CHILD-TRANSPARENT 臆造审计（⑧）
 *   C. mc-max-1792470215845-ee06ee24（dpjh-bsjd，48:5796）
 *      —— 根因H写盘期回灌（v-for 豁免）/ 刀31 LESS 嵌套盲区（brace 配对重构）
 *   D. mc-max-1792471465235-5ef650ff（合作厂商弹窗，38:3134）
 *      —— ⑦-b 容器并列真值下发 / 孤儿文本全位化 / 面板底真值 / 主色低透明度过滤 /
 *         透明根不臆造背景（刀31豁免）
 *   E. mc-max-1792481134178-477e185d（合作厂商弹窗，38:3134 同源复现）
 *      —— 伪 icon 容器守卫：slot-icon 命名的 604×787 内容区容器（796:3）不得整体导出
 *         （曾吞整棵子树 ⇒ 面板内全部 vector icon 提取全灭）；5 枚真 icon 全量进提取。
 *         细粒度断言由 jest spec figma-connector.pseudo-icon.spec.ts（8 例）覆盖。
 *   ※ #131 晋升闸门（promotion-gate.ts，TS）由 jest spec 覆盖（promotion-gate.spec.ts 6 例），
 *     本脚本不重复（.mjs 无法 import TS 源）。
 *
 * 病灶锚定：快照含多轮重试产物，后期 revision 可能已被 heal（不带病）。
 *   逐 revision 扫描取**带病灶**的一份做全链路断言；全部不带病 ⇒ SKIP 留痕（不伪造失败）。
 *
 * 用法：node scripts/verify-product-regression.mjs
 * 退出码：任一断言失败 → 1；fixture 缺失/病灶绝迹 → SKIP 不失败（CI/他机容忍）。
 * 纪律：产物快照只读；自愈类重放在临时副本上跑（fail-open 台账写 meta 不污染快照）。
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(__dirname, '..');
const REPO = resolve(BACKEND, '..');

const CACHE = join(REPO, 'temp-components', '_shared-cache', 'GTcJm0DKQvcJvcOZTh5n1l');
const SNAPSHOTS = join(REPO, 'temp-components', '.task-code-snapshots');

const TASKS = [
  {
    name: '84af4f8f（设备详情 · 网格行主序/横向并列/丢图）',
    taskDir: 'mc-max-1792459707536-84af4f8f',
    figmaNode: '36:1693',
    kind: 'A',
  },
  {
    name: '47647fae（dpjh-bsjd 非同源双稿 · 重复单元/首卡透明）',
    taskDir: 'mc-max-1792459868164-47647fae',
    figmaNode: '48:5796',
    kind: 'B',
  },
  {
    name: 'ee06ee24（dpjh-bsjd · 根因H回灌 + 刀31嵌套盲区）',
    taskDir: 'mc-max-1792470215845-ee06ee24',
    figmaNode: '48:5796',
    kind: 'C',
  },
  {
    name: '5ef650ff（合作厂商弹窗 · 容器并列/孤儿文本/面板底/主色/透明根）',
    taskDir: 'mc-max-1792471465235-5ef650ff',
    figmaNode: '38:3134',
    kind: 'D',
  },
  {
    name: '477e185d（合作厂商弹窗 · 伪 icon 容器守卫）',
    taskDir: 'mc-max-1792481134178-477e185d',
    figmaNode: '38:3134',
    kind: 'E',
  },
];

let failures = 0;
let skips = 0;
const ok = (msg) => console.log(`  ✅ ${msg}`);
const fail = (msg) => { failures++; console.log(`  ❌ ${msg}`); };
const skip = (msg) => { skips++; console.log(`  ⏭️  SKIP ${msg}`); };
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));

const collectFiles = (dir, base, out) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const rel = base ? `${base}/${f}` : f;
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) collectFiles(p, rel, out);
    else if (/\.(vue|ts|js|less|css)$/i.test(f)) out[rel] = readFileSync(p, 'utf-8');
  }
  return out;
};

const listRevisions = (taskDir) => {
  const revDir = join(SNAPSHOTS, taskDir, 'revisions');
  if (!existsSync(revDir)) return [];
  return readdirSync(revDir)
    .filter((d) => d.startsWith('r-'))
    .sort()
    .map((d) => join(revDir, d));
};

// 病灶锚定：取第一份带病灶的 revision（快照只读，只加载文件内容判定）
const pickRevisionWith = (taskDir, hasLesion) => {
  for (const revDir of listRevisions(taskDir)) {
    const files = collectFiles(revDir, '', {});
    if (Object.keys(files).length === 0) continue;
    if (hasLesion(files)) return { revDir, files };
  }
  return null;
};

// 快照 → 临时副本（自愈链的 fail-open 台账会写 component-meta.json，快照本体必须只读）
const copyToTmp = (srcDir) => {
  const tmp = mkdtempSync(join(tmpdir(), 'mvgo-reg-'));
  const cp = (src, dst) => {
    for (const f of readdirSync(src)) {
      const s = join(src, f);
      const d = join(dst, f);
      const st = statSync(s);
      if (st.isDirectory()) { mkdirSync(d, { recursive: true }); cp(s, d); }
      else copyFileSync(s, d);
    }
  };
  cp(srcDir, tmp);
  return tmp;
};

const loadFigma = (nodeId) => {
  const p = join(CACHE, nodeId, 'figma.json');
  if (!existsSync(p)) return null;
  const raw = JSON.parse(readFileSync(p, 'utf-8'));
  return raw.document ? raw : { document: raw };
};

const walkSections = function* (secs) {
  for (const s of secs || []) {
    yield s;
    if (Array.isArray(s.children)) yield* walkSections(s.children);
  }
};

const {
  detectRepeatUnitIssues,
  healRepeatUnitIssues,
} = await import('../src/ai-engine/utils/vfor-repeat-unit-guard.js');
const {
  detectTextOrderDrift,
  fixTextOrderDrift,
} = await import('../src/ai-engine/utils/text-order-guard.js');
const { deriveSectionsFromFigmaTree } = await import('../src/ai-engine/utils/section-tree.js');
const { runPreWriteSelfHealing } = await import('../src/ai-engine/utils/pre-write-self-healing.js');
const { ensureBackgroundContainerDimensions } = await import('../src/ai-engine/utils/style-class-consolidator.js');
// 任务 D（5ef650ff）：主色过滤 / 透明根分类 / 刀31 真值豁免
const { extractFigmaColorPalette } = await import('../src/ai-engine/utils/style-tokens.js');
const {
  classifyTransparentContainers,
  ensureSlotConBackground,
} = await import('../src/ai-engine/utils/layout-truth-healer.js');
// 任务 E（477e185d）：伪 icon 容器守卫（资源提取真值）
const { FigmaConnector } = await import('../src/ai-engine/roles/figma-connector.js');

const NOOP_LOGGER = { info() {}, warn() {}, error() {}, debug() {} };

console.log('🛡️ #128 产物级回归清单（固定任务重放）\n');

for (const task of TASKS) {
  console.log(`■ ${task.name}`);
  const figma = loadFigma(task.figmaNode);
  if (!figma) { skip(`figma 缓存缺失（${task.figmaNode}）`); continue; }

  if (task.kind === 'A') {
    // ⑦ 横向并列兄弟检出（84af4f8f 头部左图右文）
    const derived = deriveSectionsFromFigmaTree(figma);
    const secs = [...walkSections(derived?.sections || [])];
    const peered = secs.filter((s) => Array.isArray(s.rowPeerIds) && s.rowPeerIds.length > 0);
    assert(
      peered.some((s) => String(s.id) === '36:1725' && s.rowPeerIds.includes('36:1722')) &&
        peered.some((s) => String(s.id) === '36:1722' && s.rowPeerIds.includes('36:1725')),
      `⑦ 头部横向并列互挂（36:1725 ↔ 36:1722）${peered.length ? '' : '——零检出'}`,
    );
    // ⑦ 验收锚升到 facts 文本层（2026-10-20 ⑦-b：树层互挂 ≠ prompt 真值下发，
    //   peered section 被分类为容器时 walkLeaves 穿透会把真值行吞掉——5ef650ff 实锤）
    const { buildSectionStyleFacts } = await import('../src/ai-engine/utils/section-tree.js');
    const factsText = String(buildSectionStyleFacts(derived?.sections || [], figma));
    assert(
      factsText.includes('横向并列兄弟(几何)'),
      '⑦ facts 文本层含「横向并列兄弟(几何)」真值行（下发链不断）',
    );

    // ⑥ 二维网格行主序：锚定「检出 → fix → 复检零」全链路成立的 revision。
    //   （实测该任务 10 份 revision 中 5 份带 drift，其中部分 revision 的数组形态超出
    //   fix 修复面（fix 是 best-effort，管线内真正兜底是 TEXT-001 BLOCK 触发重试）——
    //   修复面外的 revision 只做信息留痕，不判失败。）
    const allRevs = listRevisions(task.taskDir);
    let chainPick = null;
    let unfixable = 0;
    for (const revDir of allRevs) {
      const files = collectFiles(revDir, '', {});
      if (Object.keys(files).length === 0) continue;
      if (detectTextOrderDrift(files, figma).length === 0) continue;
      const fixed = fixTextOrderDrift(files, figma);
      const re = detectTextOrderDrift(fixed.files || fixed, figma);
      if (re.length === 0) { chainPick = { revDir, files }; break; }
      unfixable++;
    }
    if (!chainPick) {
      fail('⑥ 无任一 revision 满足「检出→fix→复检零」全链路（检出或修复能力回退）');
    } else {
      console.log(`  病灶 revision ${relative(REPO, chainPick.revDir)}${unfixable ? `（另 ${unfixable} 份 drift 超出 fix 修复面，管线内由 TEXT-001 BLOCK 兜底重试）` : ''}`);
      const drifts = detectTextOrderDrift(chainPick.files, figma);
      assert(drifts.length > 0, `⑥ 字段网格列主序残留检出（drift=${drifts.length}）`);
      const fixed = fixTextOrderDrift(chainPick.files, figma);
      const redetect = detectTextOrderDrift(fixed.files || fixed, figma);
      assert(redetect.length === 0, `⑥ 阳性对照：fix 后复检零 drift（actual=${redetect.length}）`);
    }

    // ⑧ RES-UNREF：header-1697.png 已下载零引用（任意带图 revision；临时副本上跑防台账写快照）
    const resRev = chainPick || (() => {
      for (const revDir of allRevs) {
        const files = collectFiles(revDir, '', {});
        if (Object.keys(files).length > 0) return { revDir, files };
      }
      return null;
    })();
    if (!resRev) {
      skip('⑧ 无可用 revision（快照缺失）');
    } else {
      const tmp = copyToTmp(resRev.revDir);
      try {
        const { summary } = runPreWriteSelfHealing(resRev.files, { outputPath: tmp }, { logger: NOOP_LOGGER });
        assert(
          (summary.unreferencedImages || []).includes('header-1697'),
          `⑧ RES-UNREF 命中 header-1697（actual=${JSON.stringify(summary.unreferencedImages || [])}）`,
        );
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }

  if (task.kind === 'B') {
    // ⑤ v-for 重复单元几何纠偏：锚定带病灶的 revision
    const pick = pickRevisionWith(task.taskDir, (files) => detectRepeatUnitIssues(files, { figmaRoot: figma }).issues.length > 0);
    if (!pick) {
      skip('⑤ 全部 revision 无重复单元病灶（病灶已绝迹或快照缺失）');
    } else {
      console.log(`  病灶 revision ${relative(REPO, pick.revDir)}`);
      const ru = detectRepeatUnitIssues(pick.files, { figmaRoot: figma });
      assert(ru.issues.length > 0, `⑤ 重复单元几何病灶检出（issues=${ru.issues.length}）`);
      const healed = healRepeatUnitIssues(pick.files, ru.issues);
      const redetect = detectRepeatUnitIssues(healed.files, { figmaRoot: figma });
      assert(redetect.issues.length === 0, `⑤ 阳性对照：heal 后复检零 issue（actual=${redetect.issues.length}）`);
    }

    // ⑧ FIRST-CHILD-TRANSPARENT：锚定含该形态的 revision（独立于 ⑤ 的锚）
    const pick8 = pickRevisionWith(task.taskDir, (files) =>
      Object.values(files).some((c) => /:first-child\s*\{[^{}]*background\s*:\s*transparent/.test(c)));
    if (!pick8) {
      skip('⑧ 全部 revision 无首卡透明形态（病灶已绝迹或快照缺失）');
    } else {
      const tmp = copyToTmp(pick8.revDir);
      try {
        const { summary } = runPreWriteSelfHealing(pick8.files, { outputPath: tmp }, { logger: NOOP_LOGGER });
        assert(
          (summary.firstChildTransparent || []).length > 0,
          `⑧ FIRST-CHILD-TRANSPARENT 检出（actual=${(summary.firstChildTransparent || []).length}）`,
        );
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }
  if (task.kind === 'C') {
    // ee06ee24 双缺陷：① 根因H（ensureBackgroundContainerDimensions）写盘期往 v-for item 注入
    //   width/height:100%（签名 `{width: 100%;\nheight: 100%`）；② 刀31 detect/heal 的
    //   LESS 嵌套盲区（`&:first-child/&:hover` 嵌套块使 `[^{}]*` 失配）。
    // 病灶锚定：revision 内含根因H签名且 detect 检出 item issue。
    const ROOT_H_SIG = /\{width:\s*100%;\s*\n\s*height:\s*100%/;
    const pick = pickRevisionWith(task.taskDir, (files) => {
      if (!Object.values(files).some((c) => ROOT_H_SIG.test(c))) return false;
      return detectRepeatUnitIssues(files, { figmaRoot: figma }).issues.length > 0;
    });
    if (!pick) {
      skip('C 全部 revision 无根因H签名病灶（病灶已绝迹或快照缺失）');
    } else {
      console.log(`  病灶 revision ${relative(REPO, pick.revDir)}`);
      const vueKey = Object.keys(pick.files).find((k) => ROOT_H_SIG.test(pick.files[k]));
      const det = detectRepeatUnitIssues(pick.files, { figmaRoot: figma });
      assert(
        det.issues.some((i) => i.role === 'item'),
        `C 嵌套规则 SFC-only 检出 item issue（issues=${det.issues.length}，盲区修复验证）`,
      );
      const healed = healRepeatUnitIssues(pick.files, det.issues);
      const after = healed.files[vueKey];
      assert(!ROOT_H_SIG.test(after), 'C heal 治到 SFC 源（根因H签名消除）');
      const redet = detectRepeatUnitIssues(healed.files, { figmaRoot: figma });
      assert(redet.issues.length === 0, `C 阳性对照：heal 后复检零 issue（actual=${redet.issues.length}）`);
      // 根因H重放：v-for 豁免 ⇒ 零回灌
      const h100Before = (after.match(/height:\s*100%/g) || []).length;
      const reinject = ensureBackgroundContainerDimensions({ ...healed.files });
      const h100After = ((reinject[vueKey] || after).match(/height:\s*100%/g) || []).length;
      assert(
        h100After === h100Before,
        `C 根因H重放零回灌（v-for 豁免；${h100Before} → ${h100After}）`,
      );
    }
  }
  if (task.kind === 'D') {
    // 5ef650ff 五缺口（2026-10-20 根治 #126-#130）产物级复验，全部以真实 figma 树为真值源。
    const derived = deriveSectionsFromFigmaTree(figma);
    const { buildSectionStyleFacts } = await import('../src/ai-engine/utils/section-tree.js');
    const factsText = String(buildSectionStyleFacts(derived?.sections || [], figma));

    // ⑦-b rowPeers 断链：peered 容器祖先的真值行必须下发到 facts 文本层（树层互挂 ≠ 下发）
    assert(
      factsText.includes('横向并列兄弟(几何)'),
      'D-⑦b peered 容器真值行下发到 facts 文本层（横向并列兄弟(几何)）',
    );

    // 孤儿文本全位化：容器直接子级裸 TEXT（E1 不提升）必须补回 section 树
    //   「合作厂商/在线设备」是 796:3 直接子级裸 TEXT（38:3262/3284 族）
    const treeJson = JSON.stringify(derived?.sections || []);
    assert(
      treeJson.includes('合作厂商') && treeJson.includes('在线设备'),
      'D-孤儿 容器裸 TEXT 补回 section 树（合作厂商/在线设备）',
    );

    // 面板底真值：半透明装饰矩形（38:3137 #e2d084@0.20 r=12）必须下发真值行
    assert(
      factsText.includes('面板底(几何)') && factsText.includes('rgba(226,208,132,0.2)'),
      'D-面板底 #e2d084@0.20 真值行下发（含 rgba(226,208,132,0.2)）',
    );

    // #133 INNER_SHADOW 发光真值：三面板内发光（金/绿/青，blur=16）必须全量进 facts。
    //   青面板（38:3206）排在 maxLeaves=12 窗口外 ⇒ 依赖全树兜底轨道补发。
    assert(
      factsText.includes('box-shadow: inset') && factsText.includes('#ffc800'),
      'D-发光 金面板 INNER_SHADOW box-shadow: inset ... #ffc800 下发',
    );
    assert(
      factsText.includes('rgba(53,190,82,0.82)') && factsText.includes('rgba(25,181,186,0.67)'),
      'D-发光 绿/青面板 INNER_SHADOW 真值全量下发（含 maxLeaves 窗口头兜底轨道）',
    );

    // #134 行式网格真值：三面板 chips（4 列网格，行 frame 堆叠形态）必须下发方向真值。
    //   误报闸门：chip 单元格内部 [label,value]（22% 父宽）不算行；行 frame ≥50% 父宽。
    assert(
      /行式网格\(几何\)「Group 2136638432」：本区块是 \*\*4 列 × 1 行\*\*/.test(factsText) &&
        /行式网格\(几何\)「Group 2136638434」：本区块是 \*\*4 列 × 4 行\*\*/.test(factsText),
      'D-行式网格 金(4×1)/青(4×4)面板方向真值下发（行宽≥50% 闸门防 chip 内部误报）',
    );

    // 主色低透明度过滤：#e2d084@0.20 tint 不得抢主色（真主色 #006efe 数字蓝）
    const palette = extractFigmaColorPalette(figma.document || figma);
    const tint = (palette.fillColors || []).find((f) => f.hex === '#e2d084');
    assert(
      !!tint && (tint.maxOpacity ?? 1) < 0.5 && palette.topPrimary !== '#e2d084',
      `D-主色 低透明度 tint 不抢主色（topPrimary=${palette.topPrimary}，#e2d084 maxOpacity=${tint?.maxOpacity}）`,
    );

    // 透明根：38:3134 fills=[] ⇒ rootTransparent；刀31 见此真值必须停手（阳性对照：无真值照注）
    const truth = classifyTransparentContainers(figma);
    assert(truth?.rootTransparent === true, 'D-透明根 classifyTransparentContainers rootTransparent=true');
    const slotFiles = {
      'package/resources/styles/themes/theme-vars.less': '@color-bg-container: #ffffff;',
      'package/common.less': '.demo-slot-con {\n  display: flex;\n}',
    };
    const exempt = ensureSlotConBackground(slotFiles, { transparentContainerTruth: truth });
    assert(
      exempt.changes.length === 0 &&
        exempt.skipped.some((s) => s.reason === 'root-transparent-by-figma-truth'),
      `D-刀31 透明根豁免（changes=${exempt.changes.length}，skipped=${JSON.stringify(exempt.skipped.map((s) => s.reason))}）`,
    );
    const inject = ensureSlotConBackground(slotFiles);
    assert(inject.changes.length === 1, `D-刀31 阳性对照：无真值照常注入（changes=${inject.changes.length}）`);
  }
  if (task.kind === 'E') {
    // 伪 icon 容器守卫（2026-10-20 477e185d 根治）：slot-icon 命名的 604×787 内容区容器
    //   （796:3）曾被 _isWholeResourceByName 的 icon 命中 ⇒ 整体导出一张大图、整棵子树
    //   不再递归 ⇒ 面板内 5 枚 vector icon 提取全灭。守卫后：796:3 不整体导出、
    //   5 枚真 icon（38:3160/3164/3208 + 187:262/263）全量进提取。
    const collected = new FigmaConnector({ figmaToken: 'offline-replay-dummy' }).extractResourceNodes(figma.document || figma);
    const ids = collected.map((n) => String(n.id));
    for (const iconId of ['38:3160', '38:3164', '38:3208', '187:262', '187:263']) {
      assert(
        ids.includes(iconId),
        `E-守卫 真 icon ${iconId} 全量进提取（collected=${ids.join('|').slice(0, 200)}）`,
      );
    }
    assert(
      !ids.includes('796:3'),
      'E-守卫 slot-icon 604×787 容器（796:3）不再整体导出',
    );
    // 阳性对照：守卫不得误伤真 icon 的整体导出（命名资源整体导出通道仍通）
    const namedWhole = collected.filter((n) => ['38:3160', '38:3164', '38:3208'].includes(String(n.id)));
    assert(
      namedWhole.length === 3,
      `E-阳性对照 3 枚命名小 icon 保持整体导出通道（actual=${namedWhole.length}）`,
    );
  }
  console.log('');
}

console.log(`═══ 结果：${failures === 0 ? '✅ 全绿' : `❌ ${failures} 项失败`}（SKIP ${skips}）`);
process.exit(failures > 0 ? 1 : 0);
