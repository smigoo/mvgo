/**
 * 🛡️ component-acceptance — 组件验收判据单一事实源（2026-11-10 立项）
 *
 * docs/2026-11-10-判分驱动定向重试闭环立项.md D1：管线与 skill 脚本
 * （~/.workbuddy/skills/mvgo-component-acceptance/）共同 import 本模块，禁两侧口径漂移
 * （collectMissingVueImports 同款纪律）。
 *
 * v1 维度（全部阴阳验证过，见 spec）：
 *   A1-v2 段缺失   真值段（name∈{sub-header,tabs}）TEXT 命中率 <50% ⇒ FAIL（header 豁免=宿主渲染）
 *   E3-v2 双 bg    同一元素 :style 动态 + style 静态双 background-image ⇒ FAIL（卡1↔卡3 互换实锤）
 *   E3-v3 卡级 bg  真值同父≥2 子各带 IMAGE fill ⇒ 产物各卡级元素必须各自有 backgroundImage（祖先挂载不算）
 *   E3-v4 bg 归属  mapping 中 role=bg 且 success 且已 import 的资源，必须消费在 targetDomSelector
 *                  指定的 data-section-id 段（= 直接父级/真值视觉宿主）上；挂到祖先/其它段
 *                  （含归属段缺失）⇒ FAIL
 *                  （2026-11-11 流量 88:34→2:3660 实锤；v5 · 55a17681 裁决：只允许挂父级，
 *                  祖先段挂载 WARN 放行口子删除——v3 放宽理由「修复轮修不过」已被
 *                  hardConstraints 配方推翻，55a17681 修复轮 effective=true 实证）
 *   E2-v3 未消费    mapping 中 success 的资源文件名未出现在任何 .vue ⇒ FAIL（落盘但零 import）
 *   G1-v2 交互     真值 name=/tab/i 段承载文件无 @click+切换绑定 ⇒ FAIL（2:7954 实锤）
 *   G2 props 断链  父传动态绑定键与子 defineProps 声明零交集 ⇒ FAIL（c97b7008 实锤：
 *                  接线断链 ⇒ 运行时 props 恒空 ⇒ 字段表/图片整块不渲染，静态文本判据全盲）
 *   Dangling 悬空  index import 的本地 .vue 缺失（复用 collectMissingVueImports 单一来源）
 *   D2 文本重叠    消费方传入 runtime 采集的 overlaps（RUNTIME-016 同源），本模块不重复渲染
 */
import { collectMissingVueImports } from '../vue-import-closure.js';
import { SIBLING_ROW_TOLERANCE } from '../row-metrics.js';
// 🛡️ D-GRID 元素级列数判定（2026-11-12 · cc6334 P0-2 放水评审）：
//   列数「声明了几列」的唯一实现在 grid-list-layout-contract（与 GRID-CONTRACT-001、
//   自愈幂等同源），元素定位/样式层叠复用既有 findVForPairs + resolveElementDecls。
//   禁在验收侧再写一份 `repeat(K` 正则 —— 那是文件级匹配，同文件别的网格写对就放行。
import {
  declaredColumns,
  resolveElementDecls,
  classAttrOf,
  inlineStyleOf,
  sectionIdOf,
  matchAllTags,
} from '../grid-list-layout-contract.js';
import { collectStyleSources } from '../flex-sibling-guard.js';
import { findVForPairs } from '../vfor-list-direction-guard.js';
// 🛡️ A7：S2 自愈兜底类名单一事实源（validators/code-fix-rules.js 既有导出，禁复制第二份口径）
import { DEGENERATE_FALLBACK_CLASS } from '../../validators/code-fix-rules.js';
// 🛡️ C1-DUP（2026-11-12 · mc-max-1794415139727-828c281a 实锤）：识别刀53/54 确定性
//   接管组件（类名单一来源，禁副本正则）——重复渲染判定时接管文件是 keeper。
import { FG_TAKEOVER_CLASS_RX } from '../folded-grid-section-takeover.js';

/**
 * 🛡️ 节点角色判定（对齐版，2026-11-10 naming 向下兼容方案 P1）：
 * 判定序列与 figma-connector.js#_identifyNodeType（:2495 起）一致——
 *   第零优先级 chrome 例外（title-bg-、header-deco- 前缀等）→ bg → icon → img → 业务容器。
 * 口径漂移由 spec 一致性夹具锁定（bg-tab-active→'bg'/tabs-icon→'icon'/tab-*→'business'/
 * title-bg-*→'chrome'），任一侧改口径夹具即红。
 * 视觉属性回落（IMAGE fill）此处不支持（验收判据静态无 fills 依赖，命名缺失回落'business'
 * 由调用方按段文本语义兜底——与既有「命名优先→视觉回落」分层一致）。
 */
export function identifyNodeRole(name) {
  const nameLower = String(name || '').toLowerCase();
  // 第零优先级：面板 chrome（对齐 :2495 例外表）
  if (
    nameLower.startsWith('点背景') ||
    nameLower.includes('title-logo') ||
    nameLower.includes('title-icon') ||
    nameLower.includes('logo-title') ||
    nameLower.startsWith('bg-header') ||
    nameLower.startsWith('header-bg') ||
    nameLower.startsWith('bg-title') ||
    nameLower.startsWith('title-bg') ||
    nameLower.startsWith('header-deco') ||
    nameLower.startsWith('deco-header')
  ) {
    return 'chrome';
  }
  if (
    nameLower === 'bg' ||
    nameLower.startsWith('bg-') ||
    nameLower.startsWith('bg ') ||
    nameLower.includes('背景') ||
    nameLower.includes('background')
  ) {
    return 'bg';
  }
  if (
    nameLower.includes('icon') ||
    nameLower.includes('图标') ||
    nameLower.includes('arrow') ||
    nameLower.includes('箭头')
  ) {
    return 'icon';
  }
  if (
    nameLower === 'img' ||
    nameLower === 'image' ||
    nameLower.startsWith('img-') ||
    nameLower.startsWith('image-') ||
    nameLower.includes('图片')
  ) {
    return 'image';
  }
  return 'business';
}

const BUSINESS_SEGMENT_NAMES = /^(sub-header|tabs)$/i;
const TEXT_NODE_TAGS = new Set(['SPAN', 'P', 'H1', 'H2', 'H3', 'H4', 'DIV', 'LABEL', 'A']);

/** 从 figma-node-data 提取节点树数组（兼容 document 包装） */
function collectNodes(figmaNodeData) {
  const nodes = [];
  const walk = (n, depth) => {
    if (!n || typeof n !== 'object' || depth > 64) return;
    nodes.push(n);
    for (const c of n.children || []) walk(c, depth + 1);
  };
  walk(figmaNodeData?.document || figmaNodeData, 0);
  return nodes;
}

/** 逐条收集子树 TEXT（独立遍历，禁复用外层收集 walk——0dce5e24 无限扩张教训） */
function textsOf(node) {
  const texts = [];
  const collect = (n, depth) => {
    if (!n || typeof n !== 'object' || depth > 64) return;
    if (n.type === 'TEXT' && n.characters && n.characters.trim()) {
      texts.push(String(n.characters).replace(/\s+/g, ''));
    }
    for (const c of n.children || []) collect(c, depth + 1);
  };
  collect(node, 0);
  return texts;
}

/**
 * 🛡️ P0-2（2026-11-11 交接文档漏口①）：剥掉 script 段注释后提取字符串字面量。
 *   为什么必须剥注释：JSDoc/行注释里的中文说明若被当「臆造文案」会整组误报。
 *   单遍扫描：跟踪字符串状态（' " `）与注释状态，字符串内的 // 与 /* 不当注释。
 *   转义（\' 等）按字面跳过下一字符。
 * @param {string} scriptSrc <script> 段源码
 * @returns {string[]} 字符串字面量内容数组（保序，含重复）
 */
export function extractScriptStringLiterals(scriptSrc) {
  return extractScriptStringLiteralSpans(scriptSrc).map((s) => s.value);
}

/**
 * 同 extractScriptStringLiterals，但附带每个字面量在 scriptSrc 中的起始下标。
 * 🛡️ 2026-11-12 · mc-1794428949810-19730823 实锤：C1-DUP 需要「defineProps 块内豁免」，
 *   没有位置信息无法判定字面量是否属于 props 兜底值。
 */
export function extractScriptStringLiteralSpans(scriptSrc) {
  const out = [];
  if (typeof scriptSrc !== 'string' || !scriptSrc) return out;
  let inStr = null; // 当前字符串定界符
  let inLineComment = false;
  let inBlockComment = false;
  let cur = '';
  let startIdx = -1;
  for (let i = 0; i < scriptSrc.length; i++) {
    const ch = scriptSrc[i];
    const next = scriptSrc[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inStr) {
      if (ch === '\\') { cur += ch + (next || ''); i++; continue; }
      if (ch === inStr) {
        out.push({ value: cur, start: startIdx });
        cur = '';
        inStr = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if ((ch === '"' || ch === "'" || ch === '`') && !inBlockComment) {
      inStr = ch;
      cur = '';
      startIdx = i;
      continue;
    }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
  }
  return out;
}

/** 占位文案黑名单（P0-2 漏口②：`--` 被纯符号豁免放行的实锤补口） */
const PLACEHOLDER_TEXT_RX = /^[—–\-·•.\s]+$/;
const PLACEHOLDER_WORDS = new Set(['暂无', '待补充', '待定']);

/** 资源/模块扩展名（判「模块路径字面量」用） */
const MODULE_PATH_EXT_RX =
  /\.(?:png|jpe?g|gif|webp|svg|ico|bmp|less|scss|sass|css|vue|m?js|cjs|ts|json|woff2?|ttf|otf|eot|mp4|webm)$/i;
/** 相对/绝对/协议前缀（`./` `../` `/` `a://` `@scope/x`） */
const MODULE_PATH_PREFIX_RX = /^(?:\.{1,2}\/|\/|[A-Za-z][\w+.-]*:\/\/|@[\w-]+\/)/;
/** 路径字符集：除空白外的路径安全字符（含中文 —— 本管线资源名常带中文语义，如 icon-战略厂商-3160.png） */
const MODULE_PATH_CHARS_RX = /^[^\s"'`<>{}()]+$/;

/**
 * 判「模块/资源路径字面量」（不是展示文案）。
 *
 * 🔴 2026-11-12 · mc-max-1794424580714-e32c7951 实锤：C1 的 script 字面量判据原本用
 *   `hasCjk` 豁免纯 ASCII 路径（类名/事件名/英文文案），但本管线资源命名**含中文语义**
 *   （`icon-战略厂商-3160.png`）⇒ `import icon6 from '../../resources/images/icon-战略厂商-3160.png'`
 *   被判「臆造文案」，修复轮去删一个不存在的文案，白耗 1/3 的 FAIL 预算。
 *
 * 判据零语义（只看形态，不押任何具体路径）：
 *   ① 带相对/绝对/协议前缀 ⇒ 路径；② 以资源/模块扩展名结尾且不含空白与引号 ⇒ 路径。
 * 不放水：真值展示文案是自然语言短语，不会同时满足「无空白 + 以 .png/.less 等结尾」。
 */
export function looksLikeModulePath(t) {
  if (typeof t !== 'string') return false;
  const s = t.trim();
  if (!s || /\s/.test(s)) return false;
  if (!MODULE_PATH_CHARS_RX.test(s)) return false;
  if (MODULE_PATH_PREFIX_RX.test(s)) return true;
  return MODULE_PATH_EXT_RX.test(s);
}

/**
 * 验收判据主入口（纯函数，无 IO）。
 * @param {{ files: Record<string,string>, figmaNodeData?: object, textOverlaps?: Array }} input
 *   - files: 终态产物（package/index.vue + 子组件）
 *   - figmaNodeData: Figma 真值树（A1/G1 需要）
 *   - textOverlaps: 渲染期文本重叠对（RUNTIME-016 采集；可选）
 * @returns {{ fails: Array<{code:string,detail:string}>, warns: string[], checked: number }}
 */
export function runAcceptanceChecks(input = {}) {
  const files = input.files || {};
  const fails = [];
  const warns = [];
  let checked = 0;

  // 🛡️ files 路径归一（2026-11-12 · mc-1794428949810-19730823 实锤）：LLM 内存
  //   generatedFiles 里同一子组件被以 `package/X.vue` 与 `package/components/X.vue`
  //   两个 key 收录（磁盘落盘层已按契约归一到 components/，内存 map 没有）⇒ 判据把
  //   同一份代码当「两个组件重复渲染」⇒ C1-DUP FAIL ⇒ 修复轮删真数据 ⇒ C1b 真值缺席，
  //   互踢死循环。归一规则（与落盘契约同口径，可辩驳）：同 basename 双 key 时保留
  //   `components/` 路径者（管线契约：子组件一律落 components/），丢弃顶层散件 key。
  //   只影响判据输入，不改产物。
  const normalizedFiles = { ...files };
  {
    const byBasename = new Map();
    for (const p of Object.keys(normalizedFiles)) {
      if (!/\.vue$/i.test(p) || typeof normalizedFiles[p] !== 'string') continue;
      const base = p.split('/').pop();
      if (!byBasename.has(base)) byBasename.set(base, []);
      byBasename.get(base).push(p);
    }
    for (const paths of byBasename.values()) {
      if (paths.length < 2) continue;
      const keep =
        paths.find((p) => /\/components\//.test(p)) ||
        paths.find((p) => /^components\//.test(p));
      if (!keep) continue;
      for (const p of paths) {
        if (p !== keep) delete normalizedFiles[p];
      }
    }
  }

  const entries = Object.entries(normalizedFiles).filter(([p, c]) => /\.vue$/i.test(p) && typeof c === 'string');
  // 🛡️ A7（2026-11-11 · 查重发现 S2 与 A1-v2 打架）：剔除 S2 自愈兜底容器
  //   （`DEGENERATE_FALLBACK_CLASS`='mc-truth-fallback'，code-fix-rules.js:1027）
  //   内的文本后再算命中率——S2 是管线自愈（绑定失效时追加真值文本救可读性），
  //   其文本与 A1-v2 用同一批真值 ⇒ 不剔除 = 「改者=验者同源」假绿（门禁红线）。
  //   自愈可救可读性，但不许污染验收信号。单一事实源：直接 import 既有常量。
  const s2FallbackText = (() => {
    const chunks = [];
    for (const [, c] of entries) {
      for (const m of c.matchAll(
        new RegExp(
          `<div class="${DEGENERATE_FALLBACK_CLASS}"[^>]*>([\\s\\S]*?)</div>`,
          'g',
        ),
      )) {
        chunks.push(m[1]);
      }
    }
    return chunks.join('\n');
  })();
  const allVue = entries.map(([, c]) => c).join('\n');
  const allVueNoS2 = s2FallbackText
    ? allVue.split(s2FallbackText).join('')
    : allVue;

  // ── A1-v2 / G1-v2：Figma 真值结构判据 ──────────────────────────────
  if (input.figmaNodeData && typeof input.figmaNodeData === 'object') {
    // 🛡️ F1（2026-11-11 · d3877740 实锤）：G1-v2 只判**最外层 tab 容器**。
    //   原判据对每个 name 含 tab 的业务节点独立要求 @click+切换绑定 ⇒ 单个 tab 项
    //   （2:8825 tab-active / 2:8830 tab ... 宽 34-37px）被逐项报「无承载」，
    //   一个缺失的 tab 块产生 8 条 FAIL（1 真 + 7 噪音），重试 guidance 被淹没。
    //   收敛规则（确定性、命名无关）：若某节点祖先链上已有 tab 角色节点 ⇒ 跳过。
    const _parentOf = new Map();
    const _nodeById = new Map();
    {
      const walkP = (node, parent) => {
        if (!node || typeof node !== 'object') return;
        if (node.id != null) {
          _parentOf.set(String(node.id), parent ? String(parent.id) : null);
          _nodeById.set(String(node.id), node);
        }
        for (const c of Array.isArray(node.children) ? node.children : []) walkP(c, node);
      };
      walkP(input.figmaNodeData?.document || input.figmaNodeData, null);
    }
    const _isTabRole = (node) =>
      /\btab/.test(String(node?.name || '').toLowerCase()) &&
      identifyNodeRole(node?.name) === 'business';
    const _hasTabAncestor = (id) => {
      let cur = _parentOf.get(String(id));
      while (cur) {
        const anc = _nodeById.get(cur);
        if (anc && _isTabRole(anc)) return true;
        cur = _parentOf.get(cur);
      }
      return false;
    };

    // ── A1-H（2026-11-12 · mc-max-1794425183657-e429decb 实锤）：真值小段 × 大弹性 grow 对账 ──
    // 病灶：36:1697 "header" 真值只有 9.9×9.8px（小图标），产物却写 flex: 2.297 1 0，
    // 在纵向 flex 父容器里按份额瓜走 ~1/3 屏高。该 grow 来自规划/LLM 臆造，无真值依据
    // （真值占比 9.85/555 ≈ 1.8%）。判据：挂锚段真值高 < 根高 5% 且承载 CSS 对该段
    // class 写了 flex: N 1 0（N>1）⇒ FAIL，配方指示改为 flex: 0 0 auto（高度由内容撑开）。
    // 不命中枚举：正常大段（占比≥5%）、小段 flex:1（平均份）、小段固定高（无弹性）均不触发。
    const _rootBox =
      input.figmaNodeData?.document?.absoluteBoundingBox ||
      input.figmaNodeData?.absoluteBoundingBox || null;
    const _rootH = _rootBox && Number(_rootBox.height) > 0 ? Number(_rootBox.height) : 0;
    // 段锚 id → { file, className }：从产物模板抓 data-section-id 所在标签的 class
    const _anchorCarriers = new Map();
    for (const [file, content] of entries) {
      for (const m of content.matchAll(
        /class="([^"]+)"[^>]*data-section-id="([^"]+)"|data-section-id="([^"]+)"[^>]*class="([^"]+)"/g,
      )) {
        const cls = (m[1] || m[4] || '').trim().split(/\s+/).pop();
        const sid = m[2] || m[3];
        if (cls && sid && !_anchorCarriers.has(sid)) _anchorCarriers.set(sid, { file, cls });
      }
    }
    const _flexGrowOf = (file, cls) => {
      const entry = entries.find(([f]) => f === file);
      if (!entry) return 0;
      // 在该文件的 <style> 中定位 .className { ... } 规则体，提取 flex: N 1 0 的 N
      const re = new RegExp(
        `\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
        'g',
      );
      for (const rule of entry[1].matchAll(re)) {
        const fm = rule[1].match(/flex:\s*([\d.]+)\s+1\s+0/);
        if (fm) return Number(fm[1]);
      }
      return 0;
    };

    for (const n of collectNodes(input.figmaNodeData)) {
      const name = String(n?.name || '').toLowerCase();
      const id = String(n?.id || '');
      checked += 1;

      // A1-H：真值小段 × 大弹性 grow（判据与配方见上方注释块）
      if (_rootH > 0 && _anchorCarriers.has(id)) {
        const box = n?.absoluteBoundingBox || {};
        const segH = Number(box.height);
        if (segH > 0 && segH / _rootH < 0.05) {
          const carrier = _anchorCarriers.get(id);
          const grow = _flexGrowOf(carrier.file, carrier.cls);
          if (grow > 1) {
            fails.push({
              code: 'A1-H',
              file: carrier.file,
              detail:
                `段 ${id}（${n.name}）真值高度仅 ${segH.toFixed(1)}px（占根高 ${((segH / _rootH) * 100).toFixed(1)}%），` +
                `但 ${carrier.file} 对 .${carrier.cls} 写了 flex: ${grow} 1 0，弹性瓜分远超真值占比` +
                `——改为 flex: 0 0 auto（高度由内容自然撑开）并删除配套的 min-height: 0；` +
                `禁止用弹性 grow 拉高真值小段`,
            });
          }
        }
      }

      if (BUSINESS_SEGMENT_NAMES.test(name)) {
        // A1-v2：真值段 TEXT 逐条命中，命中率 <50% ⇒ 段缺失
        // 🛡️ A7：命中计算基于 allVueNoS2（剔除 S2 兜底容器文本）——S2 注入的真值文本
        //   与本判据同源，计入命中 = 自愈给验收刷分（假绿）。
        const texts = textsOf(n);
        if (texts.length > 0) {
          const hit = texts.filter((t) => allVueNoS2.includes(t)).length;
          const rate = hit / texts.length;
          if (rate < 0.5) {
            const missed = texts.filter((t) => !allVueNoS2.includes(t)).slice(0, 3).join('/');
            // 🛡️ A6（2026-11-11）：结构化 file 字段——段文本应承载的文件按「含段锚 id」
            // 定位；找不到锚时视为整组待重生成（file 缺省由消费方按全量处理）。
            const carrierFile =
              entries.find(([, c]) => c.includes(`data-section-id="${id}"`))?.[0] || null;
            const s2Masked =
              s2FallbackText && texts.filter((t) => allVue.includes(t) && !allVueNoS2.includes(t)).length;
            fails.push({
              code: 'A1-v2',
              file: carrierFile,
              // 🛡️ 防线2 载荷（2026-11-12 · mc-max-1794452025496-3d081117 实锤）：仅给 detail 时
              //   修复轮无从照抄 ⇒ 无法「补建承载组件」。结构化给出段身份 + 全量真值文本（Figma
              //   顺序），供 formatAcceptanceGuidance 生成可照抄的承载补建配方。
              sectionId: id,
              sectionName: n.name,
              hitRate: rate,
              truthTexts: texts.slice(0, 40),
              detail:
                `段 ${id}（${n.name}）文本命中率 ${(rate * 100).toFixed(0)}%（${hit}/${texts.length}），缺失如「${missed}」` +
                (s2Masked ? `（${s2Masked} 条仅存在于 S2 兜底块，已按 A7 剔除）` : ''),
            });
          }
        }
      }

      // 🛡️ 判据收紧（2026-11-10 R10 首验实锤）：bg-tab-active/tabs-icon 是 Figma 命名
      //   巧合（装饰背景/图标段，非用户可交互 tab）——触发无意义重试且 LLM 一轮修不动
      //   （effective=false）。只认真 tab 段：name 含 tab 且不含装饰性后缀。
      // 🛡️ G1-v2（naming 向下兼容 P1）：tab 段识别改走 identifyNodeRole 共享判定——
      //   角色必须为业务容器（非 bg/icon/image/chrome）且 name 含 tab 语义。
      //   bg-tab-active→'bg'、tabs-icon→'icon' 天然排除（对齐 _identifyNodeType 单一口径，
      //   替换 R10 自造装饰后缀黑名单）。
      if (
        /\btab/.test(name) &&
        identifyNodeRole(n.name) === 'business' &&
        // 🛡️ F1：item 级 tab 节点不独立判（祖先已是 tab 角色 ⇒ 由最外层容器统一判）
        !_hasTabAncestor(id)
      ) {
        // G1-v2：tab 段承载必须有交互绑定。
        //   🛡️ carrier 三级解析（2026-11-11 深夜 · mc-max-1794410168821-0f6cb791 实锤）：
        //   tab 常被并入祖先段生成（2:3566 @antd/tab 并入 83:30 slot-流量预测 ⇒
        //   ContentForecast.vue data-section-id="83:30" 且接线完整），而旧解析只认
        //   「tabId 精确锚 → 第一个含段首文本的文件」——文本匹配按 entries 序随机命中
        //   数据列表/图例文件（无绑定）⇒ 语义 carrier 从未被检视 ⇒ 接线明明存在仍
        //   FAIL，同画板两任务四轮全灭（09afd1bc + 0f6cb791，LLM 修复 0/4）。
        //   级1：data-section-id == tabId（原样）；
        //   级2：真值祖先链上第一个命中产物 data-section-id 的祖先段（语义归属）；
        //   级3：段首文本命中（收集全部候选，不再取 first）。
        //   判决：任一候选满足绑定 ⇒ PASS；全部无绑定 ⇒ FAIL（file 按级1>级2>级3
        //   首个供 A6 定向）。真错形态（产物完全没接 tab）仍 FAIL，无放行口径变化。
        let carriers = [];
        {
          const exact = entries.find(([, c]) => c.includes(`data-section-id="${id}"`));
          if (exact) carriers.push(exact);
          let anc = _parentOf.get(id);
          while (anc) {
            const ancHit = entries.find(([, c]) => c.includes(`data-section-id="${anc}"`));
            if (ancHit) {
              if (!carriers.includes(ancHit)) carriers.push(ancHit);
              break;
            }
            anc = _parentOf.get(anc);
          }
          const firstText = textsOf(n).find((t) => t.length >= 2);
          if (firstText) {
            for (const e of entries) {
              if (e[1].includes(firstText) && !carriers.includes(e)) carriers.push(e);
            }
          }
        }
        if (carriers.length === 0) {
          fails.push({ code: 'G1-v2', detail: `tab 段 ${id}（${n.name}）在产物中无承载` });
        } else {
          const satisfied = carriers.filter(([, c]) => /@click/.test(c) && /handleTabChange|active/i.test(c));
          if (satisfied.length === 0) {
            fails.push({
              code: 'G1-v2',
              // 🛡️ A6：结构化 file——tab 段承载文件必须重新生成
              file: carriers[0][0],
              detail: `tab 段 ${id} 承载于 ${carriers.map(([f]) => f.split('/').pop()).join('/')} 但均无切换绑定（@click/handleTabChange/active 缺失）`,
            });
          }
        }
      }
    }
  }

  // ── E3-v2：双 bg 声明（静态 style 与动态 :style 并存）─────────────
  for (const [p, c] of entries) {
    for (const m of c.matchAll(
      /<[^>]*:style="[^"]*backgroundImage[^"]*"[^>]*style="[^"]*background-image[^"]*"[^>]*>/g,
    )) {
      fails.push({
        code: 'E3-v2',
        // 🛡️ A6：结构化 file——双 bg 声明文件必须重新生成
        file: p,
        detail: `${p.split('/').pop()}: 双 bg 声明（:style 动态 + style 静态并存 ⇒ 静态死代码/两者互换）`,
      });
      break; // 每文件计 1 次（多卡同构，样本 1 个足够定位）
    }
  }

  // ── E3-v3：卡级 bg 强制（2026-11-10 · 车辆 30a318a9 实锤：三张独立卡 bg 全丢，
  //   一张卡图挂上整条容器——代码只一处声明语法合法，E3-v2 双写判据抓不到）。
  //   判据（确定性）：真值存在「同级多段各带独立 bg 资源」（映射/真值树），产物中
  //   这些段的卡级元素必须各自有 backgroundImage——祖先挂载不算数。
  if (input.figmaNodeData && input.files) {
    const bgOwnedChildren = [];
    const walkLevel = (n, depth) => {
      if (!n || typeof n !== 'object' || depth > 6) return;
      const kids = Array.isArray(n.children) ? n.children : [];
      // 同一父下 ≥2 个子节点自身带 IMAGE fill（多卡独立图形态）
      const imgKids = kids.filter(
        (k) => Array.isArray(k.fills) && k.fills.some((f) => f && f.type === 'IMAGE' && f.visible !== false),
      );
      if (imgKids.length >= 2) {
        for (const k of imgKids) bgOwnedChildren.push({ id: k.id, name: k.name });
      }
      kids.forEach((k) => walkLevel(k, depth + 1));
    };
    walkLevel(input.figmaNodeData?.document || input.figmaNodeData, 0);
    if (bgOwnedChildren.length >= 2) {
      const missing = bgOwnedChildren.filter((c) => {
        // 产物里该段（或其等价卡）无卡级 bg 声明：找 data-section-id 同 id 的元素标签
        const tagMatch = allVue.match(
          new RegExp(`<[^>]*data-section-id="${c.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}"[^>]*>`),
        );
        if (!tagMatch) return false; // 段不存在（A1-v2 已管）或 id 未挂锚——不重复报
        return !/backgroundImage/.test(tagMatch[0]);
      });
      if (missing.length > 0) {
        fails.push({
          code: 'E3-v3',
          detail: `真值 ${bgOwnedChildren.length} 张卡各带独立 bg，产物中 ${missing.length} 个卡级元素无 backgroundImage（${missing
            .slice(0, 3)
            .map((m) => m.id)
            .join('/')}）——禁止把卡图挂到祖先容器`,
        });
      }
    }
  }

  // ── E3-v4：bg 归属段对位（2026-11-11 · 流量 mc-max-1794114542727-b6af7a51 实锤：
  //   88:34「bg-[m]」的归属父段 = 2:3660（91px 横条卡），mapping.targetDomSelector 已
  //   确定性给出 [data-section-id="2:3660"]；产物中该段根本不存在，bg-_m-34.png 被挂到
  //   祖先段 88:33（398px 整段）且 backgroundSize:100% 100% ⇒ 卡图被拉伸约 4 倍。
  //   判据（确定性）：mapping 中 role=bg 且 success 且**已被 import**的资源，其背景必须
  //   消费在 targetDomSelector 指定的 data-section-id 段开标签上；挂到祖先/其它段即 FAIL。
  //   零硬编码：归属宿主 id 全部来自 mapping 结构化字段（targetDomSelector/ancestorIds），
  //   无名称/尺寸枚举。未 import 的 bg 不在此报（由 E2-v3 落盘未消费覆盖，两判据正交）。
  if (input.resourceDomMapping && input.files) {
    // (a) 资源文件名 → 产物中 import 的局部变量名（跨文件；一图可被多处 import）
    const varsByFile = new Map(); // fname -> Set<varName>
    const varSourceFile = new Map(); // fname -> 首个 import 它的 .vue 路径（🛡️ A6 定位重生成目标）
    for (const [p, code] of entries) {
      for (const m of code.matchAll(
        /import\s+(\w+)\s+from\s+['"][^'"]*\/images\/([\w.\u4e00-\u9fa5-]+\.png)['"]/g,
      )) {
        if (!varsByFile.has(m[2])) varsByFile.set(m[2], new Set());
        varsByFile.get(m[2]).add(m[1]);
        if (!varSourceFile.has(m[2])) varSourceFile.set(m[2], p);
      }
    }
    // (b) 产物中含 data-section-id 的开标签 → 该标签引用的标识符集合（消费取证）
    const consumers = [];
    for (const [p, code] of entries) {
      for (const m of code.matchAll(/<[a-zA-Z][^>]*>/g)) {
        const idm = m[0].match(/data-section-id="([^"]+)"/);
        if (!idm) continue;
        consumers.push({ id: idm[1], vars: new Set(m[0].match(/\b[A-Za-z_$][\w$]*\b/g) || []), file: p });
      }
    }
    // 🛡️ E3-v4 v2（2026-11-11 · b598c432 实锤，两个缺陷叠加）：
    //   缺陷① 消费取证口径过窄——原来只在 `data-section-id` 开标签内做变量名字面匹配，
    //     而数据驱动消费是合法形态（`FG_GRID_BGS = [bg1,bg2,bg3]` + `FG_GRID_BGS[it.bgImg]`、
    //     `{ bg: bg3 }` + `statItems` v-for），字面匹配必然漏判 ⇒ 误报「未消费/归属段缺失」。
    //   缺陷② 要求层级过深——card 级 owner（如 136:127 的 141×74 单卡）要求 per-card 持有
    //     `data-section-id`，而产物模型是「段级容器 + v-for 卡片」，卡片本就不持有 id。
    //     实测该产物 grid 行高 74px/列宽 141px 与真值完全一致——背景其实挂对了。
    //   处置：消费取证升级为三层（段级开标签 → 任意开标签 → 数据驱动容器→模板可达），
    //     并做层级分流：wantId **不是产物已建的段级容器**且未挂祖先段、且已被数据驱动消费
    //     ⇒ 放行（真「拉伸」判定需运行时 DOM 尺寸，归 G3，不在静态判据里假装能判）。
    const sectionIds = new Set(consumers.map((c) => c.id));
    const templateOf = (code) => {
      const m = code.match(/<template>([\s\S]*?)<\/template>/i);
      return m ? m[1] : '';
    };
    const scriptOf = (code) => {
      const m = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      return m ? m[1] : '';
    };
    const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /** 资源变量是否经「const 容器字面量 → 模板引用」被数据驱动消费 */
    const isDataDrivenConsumed = (code, varName) => {
      const tpl = templateOf(code);
      const src = scriptOf(code);
      if (!tpl || !src) return false;
      const decls = [];
      for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=/g)) {
        decls.push({ name: m[1], idx: m.index ?? 0 });
      }
      if (decls.length === 0) return false;
      const tokRe = new RegExp(`\\b${escapeRe(varName)}\\b`, 'g');
      for (const hit of src.matchAll(tokRe)) {
        const at = hit.index ?? 0;
        // 归属容器 = 该引用之前最近的 const 声明（不做括号配平：正则配平在嵌套结构上
        // 会截断，是已知脆弱根因点，此处只需定位即可）
        let owner = null;
        for (const d of decls) if (d.idx < at) owner = d;
        if (!owner) continue;
        if (new RegExp(`\\b${escapeRe(owner.name)}\\b`).test(tpl)) return true;
      }
      return false;
    };
    const hasDataDrivenConsumption = (ownVars) => {
      for (const [, code] of entries) {
        for (const v of ownVars) if (isDataDrivenConsumed(code, v)) return true;
      }
      return false;
    };
    // 🛡️ E3-v4 v6（2026-11-12 · mc-max-1794461963464-28ec5c09 实锤，根治④）：
    //   v4 的豁免是**按资源**的布尔（`hasDataDrivenConsumption(ownVars)` 命中即 continue），
    //   且先于祖先判定 ⇒ 资源有一条合法的数据驱动消费（FG_CARD_BGS 轮换）就会把同一 var
    //   **字面挂在祖先段开标签**上的错挂一起洗白（进 warns 不进 fails）。
    //   v6 改为**按挂载点**判定：现场消费点（带 data-section-id 的开标签）本身引用的是
    //   数据驱动容器名 ⇒ 合规挂载点；标签内**字面**出现该 var ⇒ 字面挂载点，即使资源
    //   另有数据驱动消费也不豁免（一处合规不洗白另一处错挂）。
    const fileCode = new Map(entries);
    const ddContainerNamesCache = new Map();
    /** var 所归属、且模板可达的 const 容器名集合（isDataDrivenConsumed 的集合版） */
    const ddContainerNamesOf = (file, varName) => {
      const key = `${file}|${varName}`;
      if (ddContainerNamesCache.has(key)) return ddContainerNamesCache.get(key);
      const names = new Set();
      const code = fileCode.get(file);
      if (code) {
        const tpl = templateOf(code);
        const src = scriptOf(code);
        if (tpl && src) {
          const decls = [];
          for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=/g)) {
            decls.push({ name: m[1], idx: m.index ?? 0 });
          }
          const tokRe = new RegExp(`\\b${escapeRe(varName)}\\b`, 'g');
          for (const hit of src.matchAll(tokRe)) {
            const at = hit.index ?? 0;
            let owner = null;
            for (const d of decls) if (d.idx < at) owner = d;
            if (!owner) continue;
            if (new RegExp(`\\b${escapeRe(owner.name)}\\b`).test(tpl)) names.add(owner.name);
          }
        }
      }
      ddContainerNamesCache.set(key, names);
      return names;
    };
    /**
     * 对「var 的全部现场消费点」分类：
     *   ddMountExists  存在挂载点标签引用的是数据驱动容器名（合规形态）
     *   literalMount   存在挂载点标签字面引用该 var（错挂候选，v5 判据接管）
     */
    const classifyConsumptionSites = (ownVars, wantId) => {
      let ddMountExists = false;
      let literalMount = null;
      let firstAny = null;
      for (const c of consumers) {
        if (c.id === wantId) continue;
        const hitVar = [...ownVars].find((v) => c.vars.has(v));
        if (!hitVar) continue;
        if (!firstAny) firstAny = c;
        const ddNames = ddContainerNamesOf(c.file, hitVar);
        const isDdMount = [...ddNames].some((n) => c.vars.has(n));
        if (isDdMount) ddMountExists = true;
        else if (!literalMount) literalMount = c;
      }
      return { ddMountExists, literalMount, firstAny };
    };

    const misownedBg = [];
    let relaxedCardLevel = 0;
    let degenerateTruth = 0;
    let ancestorStretchFail = 0;
    for (const r of input.resourceDomMapping) {
      if (r?.previewAnalysisRole !== 'bg' || r?.downloadStatus !== 'success' || !r.resourceFile) continue;
      const fname = String(r.resourceFile).split('/').pop();
      const ownVars = varsByFile.get(fname);
      if (!ownVars || ownVars.size === 0) continue; // 未 import ⇒ 归 E2-v3
      const idm = String(r.targetDomSelector || '').match(/data-section-id="([^"]+)"/);
      if (!idm) continue; // 无确定性 id 锚（降级形态）不在此判据范围
      const wantId = idm[1];
      const ownTag = consumers.find((c) => c.id === wantId);
      if (ownTag && [...ownVars].some((v) => ownTag.vars.has(v))) continue; // 归属段已消费 ⇒ 合规
      // 🛡️ v6（根治④）补充：归属段存在、且其标签是**数据驱动消费**（引用容器名而非
      //   字面 var，如 `:style="... FG_CARD_BGS[i % len] ..."`）⇒ 同样算归属段已消费。
      //   旧 v4 由按资源豁免兜到此形态；按挂载点分类后须在此显式放行（408d924a spec ①）。
      if (ownTag) {
        const _ownDdHit = [...ownVars].some((v) =>
          [...ddContainerNamesOf(ownTag.file, v)].some((n) => ownTag.vars.has(n)),
        );
        if (_ownDdHit) {
          relaxedCardLevel += 1;
          continue;
        }
      }
      // 🛡️ v6（根治④）：按挂载点分类现场消费（数据驱动容器引用 vs 字面引用）
      const _sites = classifyConsumptionSites(ownVars, wantId);
      const elsewhere = _sites.literalMount || _sites.firstAny;
      const isAncestor = !!elsewhere && (r.ancestorIds || []).slice(1).includes(elsewhere.id);
      const box = r.figmaBox || null;
      // 🛡️ E3-v4 v3（2026-11-11 · bd907abf/0a501b7e/830ae7bd 三连拒实锤）：
      //   退化真值豁免——figmaBox 宽/高 ≤0（bd907abf: 390×0）的节点不是可见背景，
      //   「应挂归属段」判据对不可见节点无权威，弃权（否则定向修复轮永远修不过）。
      if (box && (Number(box.width) <= 0 || Number(box.height) <= 0)) {
        degenerateTruth += 1;
        continue;
      }
      // 🛡️ E3-v4 v4（2026-11-11 · mc-max-1794407888630-408d924a 实锤）：数据驱动消费是
      //   **独立合规形态**，与 wantId 是否为产物段级容器无关；真错形态仍 FAIL。
      // 🛡️ v6（根治④ · 28ec5c09 实锤）：豁免收窄为「按挂载点」——存在**字面挂载点**
      //   （标签内字面引用该 var，如 `url(' + bg4 + ')'` 挂祖先段根）时，即使资源另有
      //   数据驱动消费也不豁免（一处合规不洗白另一处错挂）⇒ 走 v5 祖先 FAIL 闭环。
      //   无字面挂载点时保持 v4 行为：数据驱动消费（容器名→模板可达，含无锚点标签上的
      //   v-for 轮换）即放行（408d924a spec ①）。
      if (
        !_sites.literalMount &&
        (_sites.ddMountExists || hasDataDrivenConsumption(ownVars))
      ) {
        relaxedCardLevel += 1;
        continue;
      }
      // 🛡️ E3-v4 v5（2026-11-12 · 55a17681 实锤 + 用户裁决「只允许挂父级」）：v3 的
      //   「祖先段挂载 WARN 放行」口子删除。真值语义：ancestorIds[0] = 直接父级
      //   （= owner = wantId，视觉宿主，真值 box 与资源同尺寸）；ancestorIds[1+] = 祖父
      //   及以上——bg 挂上去必被拉伸/错位（55a17681: bg-126 141×74 挂 136:121 整段成
      //   横幅；b6af7a51: 91×34 挂 88:33 拉伸 4 倍）。v3 放宽理由「修复轮修不过」已被
      //   hardConstraints 可照抄配方推翻（55a17681 修复轮 effective=true 实证）。
      //   挂祖先段 ⇒ FAIL（isAncestor 仅作 detail 文案区分），走既有修复轮闭环。
      if (isAncestor) {
        ancestorStretchFail += 1;
      }
      misownedBg.push({
        fname,
        wantId,
        ownerExists: !!ownTag,
        actualId: elsewhere ? elsewhere.id : null,
        isAncestor,
        box,
        ownerIsSection: sectionIds.has(wantId),
      });
    }
    if (relaxedCardLevel > 0) {
      // 真机计数行（判据必须可观测；不允许只靠函数入参塞值验证）
      warns.push(
        `E3-v4 卡片级 owner 放行 ${relaxedCardLevel} 张（产物按段级建模、背景经数据驱动消费；拉伸检测归运行时 G3）`,
      );
    }
    if (degenerateTruth > 0) {
      warns.push(
        `E3-v4 退化真值弃权 ${degenerateTruth} 张（figmaBox 宽/高≤0 不可见节点，归属判据无权威）`,
      );
    }
    if (ancestorStretchFail > 0) {
      // 真机计数行：v5 远祖挂载已改判 FAIL（原 v3 WARN 放行口子删除），计数进 fail 明细
      warns.push(
        `E3-v4 远祖挂载判 FAIL ${ancestorStretchFail} 张（裁决：背景只允许挂直接父级/归属段；挂祖先段必拉伸，走修复轮 hardConstraints 配方闭环）`,
      );
    }
    if (misownedBg.length > 0) {
      // 🛡️ A6：结构化 file——被错挂的资源 import 所在文件 + 错挂目标段文件都须重生成
      const misownedFiles = new Set();
      for (const m of misownedBg) {
        const src = varSourceFile.get(m.fname);
        if (src) misownedFiles.add(src);
        const actual = m.actualId
          ? consumers.find((c) => c.id === m.actualId)?.file
          : null;
        if (actual) misownedFiles.add(actual);
      }
      // 🛡️ 硬约束配方（2026-11-11 · b7d38dc3/c4b057c9 两连败实锤）：自然语言 guidance
      //   回灌后 LLM 单轮重采样执行率 0/2（甚至把归属段容器删掉）。改为把 mapping 真值
      //   直接给成「可照抄」的挂载配方——LLM 无需理解语义，逐条落地即可满足判据。
      const hardConstraints = misownedBg.slice(0, 6).map((m) => ({
        fname: m.fname,
        targetDomSelector: `[data-section-id="${m.wantId}"]`,
        mountedOn: m.actualId || null, // 🛡️ v5：当前错挂段（多为祖先段），修复=迁回归属段
        width: m.box ? Math.round(m.box.width) : null,
        height: m.box ? Math.round(m.box.height) : null,
        importPath: `../resources/images/${m.fname}`,
      }));
      fails.push({
        code: 'E3-v4',
        files: [...misownedFiles],
        hardConstraints,
        detail: `${misownedBg.length} 张背景未挂到归属段（${misownedBg
          .slice(0, 3)
          .map(
            (m) =>
              `${m.fname} 应挂 [${m.wantId}]${
                m.box ? `（真值尺寸 ${Math.round(m.box.width)}×${Math.round(m.box.height)}）` : ''
              }，${
                m.actualId
                  ? `实际挂 ${m.actualId}${m.isAncestor ? '（祖先段，被拉伸铺满）' : '（非归属段）'}`
                  : m.ownerExists
                    ? '归属段存在但未消费该背景'
                    : m.ownerIsSection
                      ? '归属段在产物中缺失'
                      : `归属容器 ${m.wantId} 未建且该背景无任何消费形态（含数据驱动）`
              }`,
          )
          .join('；')}）——按下方硬约束配方逐条落地（容器必须存在且背景挂其上）`,
      });
    }
  }

  // ── E2-v3：落盘未消费（2026-11-11 · R20 流量实锤：image_2136639306-7458.png 等
  //   新入册资源 success 落盘但代码零 import——A 层打通后的生成层消费缺口）。
  //   判据（确定性）：mapping 中 success 且 ownerSectionId 非根的资源文件名，
  //   未在任何 .vue 的 import 语句出现 ⇒ FAIL（回灌 guidance 逼 LLM 消费）。
  if (input.resourceDomMapping && input.files) {
    const importedFiles = new Set();
    // 🛡️ 2026-11-11 修：原 `Object.values(allVue)` 对字符串是**逐字符**遍历，
    //   单字符永不匹配 `images/xxx.png` ⇒ importedFiles 恒空 ⇒ 全量误报。
    //   改为遍历各 .vue 源码（跨文件）。
    for (const [, c] of entries) {
      for (const m of c.matchAll(/images\/([\w.\u4e00-\u9fa5-]+\.png)/g)) {
        importedFiles.add(m[1]);
      }
    }
    const unconsumed = [];
    const unconsumedForeground = []; // 🛡️ 前景内容位图（image/icon）零消费＝产物肉眼缺图
    const seenFiles = new Set(); // 同一资源文件被多个节点复用（1 图 N 挂点）只计 1 次，避免数字虚高
    // 🛡️ A6-c′ 承载文件定位器（2026-11-12 · mc-max-1794461963464-28ec5c09 实锤）：
    //   修复轮 shouldRegenerate 用 files 与 chunk.files **逐字相等**匹配（microcode-
    //   engineer.js:2004/2017，chunk.files 即 `package/components/Xxx.vue`），故 files
    //   给错承载文件 ⇒ 正确 chunk 永不重写 ⇒ 判据修复后仍 FAIL（effective=false 必然）。
    //   真机四级定位实测：
    //     ① ownerSectionId 段锚：S1 inject-section-anchors 只标**段根**，深层前景 9/10
    //        在产物无该锚 ⇒ 失效（仅 1 例 `2:3550` 存在，且属已被 isTinyDecoration 豁免的资源）；
    //     ①′ figmaPath 区域段（**本轮新增·主定位**）：mapping 现成字段 `slot-<中文段名>/…`，
    //        取 slot 段中文名（其次 figmaPath 内最长中文段）→ 内容命中唯一 .vue；真机
    //        10/10 命中正确子组件（当日总流量→ContentDailyTotalFlow / 车型分布→
    //        ContentVehicleDist），区域段无歧义（每段仅命中 1 文件）、figmaPath 覆盖 30/30；
    //     ② 资源名中文段：真机 fname 全英文（Group-3664/Group_206-3505…）⇒ 恒空，保留兜底；
    //     ③ 兜底 package/index.vue（会写错文件，仅当以上全失才用）。
    const locateCarrier = (u) => {
      if (u.ownerSectionId) {
        const owner =
          entries.find(([, c]) => c.includes(`data-section-id="${u.ownerSectionId}"`))?.[0] || null;
        if (owner) return owner;
      }
      const fp = String(u.figmaPath || '');
      const cands = [];
      const slotM = fp.match(/slot-([^/]+)/);
      if (slotM) {
        const ch = (slotM[1].match(/[\u4e00-\u9fff]{2,}/g) || []).sort(
          (a, b) => b.length - a.length,
        )[0];
        if (ch) cands.push(ch);
      }
      for (const s of (fp.match(/[\u4e00-\u9fff]{2,}/g) || []).sort((a, b) => b.length - a.length)) {
        cands.push(s);
      }
      for (const s of cands) {
        const f = entries.find(([, c]) => c.includes(s))?.[0] || null;
        if (f) return f;
      }
      const stem = String(u.fname || '').replace(/\.[a-z]+$/i, '');
      const seg = stem.split(/[-_]/).find((s) => /[\u4e00-\u9fff]{2,}/.test(s));
      const byName = seg ? entries.find(([, c]) => c.includes(seg))?.[0] || null : null;
      return byName || 'package/index.vue';
    };
    for (const r of input.resourceDomMapping) {
      if (r.downloadStatus !== 'success' || !r.resourceFile) continue;
      const fname = r.resourceFile.split('/').pop();
      // 根级/整面背景常经 index 大容器引用——已在 importedFiles 则跳过
      if (importedFiles.has(fname) || seenFiles.has(fname)) continue;
      // 装饰性微小图标豁免（≤12px）
      if (r.isTinyDecoration) continue;
      seenFiles.add(fname);
      // 🛡️ E2-v3 语义分层（2026-11-11 晚 · mc-max-1794410550718-37f6f9fd 实锤回归修正）：
      //   296709f 把本判据整体 FAIL→WARN 治了误杀（bg 冗余落盘连坐拒交付），但把两类
      //   性质不同的形态一刀切：previewAnalysisRole=image/icon 的**前景内容位图**零
      //   import＝产物肉眼缺一块内容（本例产品图 98×98 已下载却零 <img> 消费），是
      //   真缺陷必须 FAIL 逼修复轮；bg/无 role 的落盘未消费多为容器吸收/组合让位的
      //   合法残余，维持 WARN。role 取值来自 resource-dom-mapping 单一事实源。
      const role = String(r.previewAnalysisRole || '').toLowerCase();
      // 🛡️ 刀 b-装饰豁免（2026-11-12 · 3756576b「标题-线-5891」（470×2 细线）/「Group_11-
      //   5897」（20×20 装饰点）双实锤）：**纯装饰位图**（细长线 ≥8:1、微点 ≤24px 且
      //   名称含装饰语义「线/线/deco/divider/Group N 自动名」）降 WARN——它们是标题
      //   下划线/分隔装饰，缺失不损内容表达，FAIL 只会逼 LLM 顶包。内容位图（产品图/
      //   车图/人物）仍 FAIL。
      const _nm = String(r.name || '');
      const _fb = r.figmaBox || {};
      const _w = Number(_fb.width) || 0;
      const _h = Number(_fb.height) || 0;
      const isDecorative =
        (Math.max(_w, _h) > 0 && Math.min(_w, _h) / Math.max(_w, _h) <= 0.125) || // 细长线
        (Math.max(_w, _h) <= 24 && /线|deco|divider|group \d+/i.test(_nm)); // 微点+装饰名
      if (role === 'image' || (role === 'icon' && !isDecorative)) {
        // 🛡️ P0#4（2026-11-12 · a3529d83 icon-8036 / 828c281a img-1725 / 84dc4bdf 10×Group
        //   三连拒实锤）：修复轮只有自然语言 guidance 时 LLM 拿别的资源顶包或不动（0/1），
        //   与 E3-v4 b7d38dc3 同构病。配方数据 mapping 全现成——保留完整字段供
        //   hardConstraints 可照抄（fname 不截断，截断名仅用于 detail 展示）。
        unconsumedForeground.push({
          fname,
          name: (r.name || '').slice(0, 16),
          ownerSectionId: r.ownerSectionId || null,
          figmaPath: r.figmaPath || null, // 🛡️ A6-c′：区域段定位原始依据（见 locateCarrier）
          selector: r.targetDomSelector || null,
          usage: String(r.recommendedUsage || 'imgSrc'),
          width: r.figmaBox ? Math.round(Number(r.figmaBox.width)) || null : null,
          height: r.figmaBox ? Math.round(Number(r.figmaBox.height)) || null : null,
          carrierFile: locateCarrier({
            ownerSectionId: r.ownerSectionId || null,
            figmaPath: r.figmaPath || null,
            fname,
          }),
        });
      } else {
        unconsumed.push({ fname: fname.slice(0, 36), name: (r.name || '').slice(0, 16) });
      }
    }
    if (unconsumedForeground.length > 0) {
      // 前景内容缺失：FAIL（带资源文件名 + 可照抄挂载配方，修复轮按 ownerSectionId 落位）
      const fgConstraints = unconsumedForeground.slice(0, 6).map((u) => ({
        fname: u.fname,
        ownerSectionId: u.ownerSectionId,
        // 🛡️ A6-c′：承载文件（四级定位）——修复轮按此写入对应 chunk，避免写错文件
        carrierFile: u.carrierFile,
        selector: u.selector, // 🛡️ 原始 selector 形态（.img-container 等）——建容器时作 class 提示
        usage: u.usage,
        width: u.width,
        height: u.height,
        importPath: `../resources/images/${u.fname}`,
      }));
      fails.push({
        code: 'E2-v3',
        detail:
          `${unconsumedForeground.length} 张前景资源（image/icon）已落盘但产物零消费` +
          `（如 ${unconsumedForeground
            .slice(0, 3)
            .map((u) => u.fname)
            .join('、')}）——内容位图缺失，须挂载或说明。` +
          `禁止用其他资源顶包：每张资源必须按下方配方 import 并在其归属段消费`,
        // 🛡️ A6-c（2026-11-12 · 9e75b757 修复轮 0 有效实锤）：files 必须是**承载文件**
        //   而非资源图片路径——A6 修复轮的 shouldRegenerate 用 files 匹配 chunk.files
        //   （全是 .vue），资源路径永远匹配不上 ⇒ 零 chunk 重生成 ⇒ guidance 回灌了
        //   但没有任何组件被改写 ⇒ effective=false 必然。
        // 🛡️ A6-c′（2026-11-12 · mc-max-1794461963464-28ec5c09 实锤修正）：承载文件由
        //   `locateCarrier`（四级）在入列时**逐资源**定位并写入 `u.carrierFile`，此处去重汇总。
        //   真机旧三级映射两级失效（owner 段锚 9/10 缺失 + fname 全英文无中文段）⇒ 10/10 兜底
        //   index.vue ⇒ 只重写 chunk 3、真承载 chunk 5/8 永不重写 ⇒ E2-v3 恒不复检通过。
        //   新增 figmaPath 区域段级后真机 10/10 命中正确子组件。
        files: [...new Set(unconsumedForeground.map((u) => u.carrierFile).filter(Boolean))],
        hardConstraints: fgConstraints,
      });
    }
    if (unconsumed.length > 0) {
      // bg/无 role 冗余落盘：维持 296709f 的 WARN 口径（卫生问题无交付否决权）
      warns.push(
        `E2-v3 ${unconsumed.length} 张已落盘资源未被任何组件 import（如 ${unconsumed
          .slice(0, 3)
          .map((u) => u.fname)
          .join('、')}）——冗余落盘不影响视觉，关键缺失归视觉门禁兜底（不拦交付）`,
      );
    }
  }

  // ── Dangling：悬空引用（index import 的本地 .vue 缺失）────────────
  const idxKey = Object.keys(files).find(
    (p) => p === 'package/index.vue' || p.endsWith('/index.vue'),
  );
  if (idxKey && typeof files[idxKey] === 'string') {
    const missing = collectMissingVueImports(idxKey, (p) =>
      typeof files[p] === 'string' ? files[p] : null,
    );
    for (const mp of missing) {
      fails.push({ code: 'Dangling', detail: `index 引用的 ${mp} 未落盘（悬空引用）` });
    }
  }

  // ── G2：父子 props 契约断链（2026-11-12 · mc-max-1794412559305-c97b7008 实锤）──
  //   分块生成跨 chunk 接线不一致（父传 :attribute-list 子接 tableRows）⇒ 运行时子
  //   组件 props 恒空 ⇒ 字段表/图片等整块不渲染。源码文本判据（C1/C1b/E2-v3）对此
  //   结构性失明——文本在源码常量里存在即命中、import 存在即算消费。
  {
    const edges = collectComponentPropEdges(files);
    const seenEdge = new Set();
    for (const e of edges) {
      const k = `${e.parent}->${e.child}`;
      if (seenEdge.has(k)) continue;
      seenEdge.add(k);
      checked += 1;
      fails.push({
        code: 'G2',
        files: [e.parent, e.child],
        detail:
          `父子 props 契约断链：<${e.tag}> 传参 ${e.passed.map((x) => `:${x}`).join(' ')} ` +
          `与 ${e.child.split('/').pop()} defineProps 声明 {${e.declared.join(', ')}} 零交集 ` +
          `⇒ 运行时子组件 props 恒为默认空值（内容整块不渲染）。两端对齐其一：` +
          `父改传子声明的键，或子 defineProps 改声明父传的键（:attribute-list ⇔ attributeList 等价）`,
      });
    }
  }

  // ── D2：文本重叠（消费 runtime 采集，不重复渲染）──────────────────
  if (Array.isArray(input.textOverlaps) && input.textOverlaps.length > 0) {
    fails.push({
      code: 'D2',
      detail: `文本重叠 ${input.textOverlaps.length} 对（${input.textOverlaps
        .slice(0, 3)
        .map((o) => `${o.a}↔${o.b}`)
        .join('、')}）`,
    });
  }

  // ── C2：假数据禁令（2026-11-11 · a3d97188 实锤：refreshStats() 用 Math.random()
  //   造假数据 onMounted 刷新——用户明确拒绝过的 fake 数据家族。确定性正则判据）。
  {
    const fakeHits = [];
    for (const [p, c] of entries) {
      if (/Math\.random\s*\(/.test(c)) {
        fakeHits.push(p.split('/').pop());
      }
    }
    if (fakeHits.length > 0) {
      fails.push({
        code: 'C2',
        detail: `${fakeHits.length} 个文件含 Math.random() 假数据生成（${fakeHits
          .slice(0, 3)
          .join('、')}）——演示假数据违反真实数据契约，删除随机生成逻辑，静态展示真值文本或经 componentProps/businessProps 接入宿主数据`,
      });
    }
  }

  // ── C1：内容真值（2026-11-11 · 4e881233 实锤：AntD 演示占位文案「标签一/二/三」
  //   + a3d97188 臆造标签「告警数量/设备总数」（设备监测词串到车辆监测）——产物展示
  //   文本必须来自真值 TEXT characters 集合。判据（确定性）：从模板插值/静态文本中
  //   提取中文/字母数字串（≥2 字符），命中真值集合的占比 <50% 且臆造数 ≥2 ⇒ FAIL。
  //   豁免：纯数字/单字符/事件名/样式类名（只扫展示层文本）。）
  if (input.figmaNodeData && typeof input.figmaNodeData === 'object') {
    // 真值全量 TEXT characters 集合（C1 用）+ 出现次数（C1-DUP 判真值唯一性用）
    const truthTexts = new Set();
    const truthTextCount = new Map();
    // 🛡️ C1-DUP keeper 几何归属（2026-11-12 · mc-max-1794419314972-fbd77192 实锤）：
    //   label → 真值节点、id → 节点（取 absoluteBoundingBox）两份索引，供「该文本落在哪个段」
    //   的确定性判定使用。只建索引，不改判据。
    const truthNodeByLabel = new Map();
    const nodeById = new Map();
    const walkTruth = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.id != null && !nodeById.has(String(n.id))) nodeById.set(String(n.id), n);
      if (n.type === 'TEXT' && typeof n.characters === 'string' && n.characters.trim()) {
        const k = n.characters.trim();
        truthTexts.add(k);
        truthTextCount.set(k, (truthTextCount.get(k) || 0) + 1);
        if (!truthNodeByLabel.has(k)) truthNodeByLabel.set(k, n);
      }
      for (const k of Array.isArray(n.children) ? n.children : []) walkTruth(k);
    };
    walkTruth(input.figmaNodeData?.document || input.figmaNodeData);

    if (truthTexts.size > 0) {
      const fabricated = new Set();
      for (const [p, c] of entries) {
        // 只扫模板段（script 里的注释/变量名不算展示文本）
        const tplMatch = c.match(/<template[\s\S]*<\/template>/i);
        if (!tplMatch) continue;
        const tpl = tplMatch[0];
        // 剥离注释/插值绑定/属性值/标签（只留静态文本节点）。
        // 🛡️ P0#1（2026-11-12 · mc-max-1794413869389-bd32c592 实锤）：属性值内含 `>`
        //   （如 @legend-select="(v) => $emit('legend-select', v)"）会让 <[^>]+> 提前截断，
        //   标签残段（$emit('legen、@data-zoom="、/>）泄漏成「静态文本」被误判臆造 ⇒
        //   修复轮被假 FAIL 连坐。治本：剥标签前先清空引号属性值（="…"→=""），
        //   残余代码特征 token（/>、=>、</ 等跨行/未闭合形态）再加一道豁免兜底。
        const staticText = tpl
          .replace(/<!--[\s\S]*?-->/g, '\n')
          .replace(/=(?:"[^"]*"|'[^']*')/g, '=""')
          .replace(/\{\{[\s\S]*?\}\}/g, '\n')
          .replace(/<[^>]+>/g, '\n');
        for (const raw of staticText.split('\n')) {
          const t = raw.trim();
          if (t.length < 2) continue;
          // 🛡️ P0#1 兜底（bd32c592 实锤）：代码特征 token 不是展示文本——标签残段
          //   （/>、</x）、箭头函数（=>）、emit 调用（$emit(）、指令/事件残迹（@x=、v-if）。
          //   窄口径：只豁免含这些明确代码序列的片段，正常中文/英文文案不受影响。
          if (/(\/>|=>|<\/|<[\w-]|\$emit\(|[\s"'`(]@(?:click|change|input|zoom|legend)[\w-]*[=("]|(?:^|\s)v-[\w-]+=)/.test(t)) {
            continue;
          }
          // 🛡️ P0-2 漏口②（2026-11-11 交接文档 · a2fcdff7 statsItems=[{'--',''}×4] 实锤）：
          //   `--`/占位符号串先判占位再放行——下方纯符号豁免正则含 `-` 会放行 `--`。
          if (PLACEHOLDER_TEXT_RX.test(t) || PLACEHOLDER_WORDS.has(t)) {
            fabricated.add(t);
            continue;
          }
          // 豁免：纯数字/符号、真值命中、事件/英文标识符（onClick 等）
          if (/^[\d\s.,%/：（）()\-]+$/.test(t)) continue;
          if (/^[A-Za-z_$][\w-]*$/.test(t)) continue;
          if (truthTexts.has(t)) continue;
          // 相互包含豁免：真值某条包含该片段（截断/换行差异）
          let contained = false;
          for (const tt of truthTexts) {
            if (tt.includes(t) || t.includes(tt)) { contained = true; break; }
          }
          if (!contained) fabricated.add(t);
        }
      }
      if (fabricated.size >= 2) {
        fails.push({
          code: 'C1',
          detail: `${fabricated.size} 条展示文本在 Figma 真值中不存在（如 ${[...fabricated]
            .slice(0, 3)
            .map((t) => `「${t.slice(0, 12)}」`)
            .join('、')}）——展示文案必须逐字取自真值 TEXT，禁止臆造占位（AntD 演示文案）或跨组件串词`,
        });
      }

      // ── P0-2 漏口①（2026-11-11 交接文档 · SwitchSection「设备开关 1/主电源」与
      //    a2fcdff7 statsItems 实锤）：模板静态文本只扫得到写死在标签体里的字，
      //    LLM 把占位文案放 script 常量数组再 v-for 渲染 ⇒ 旧判据全瞎。
      //    判据：script 段字符串字面量（剥注释后）跑同一真值集合 + 占位黑名单，
      //    命中数 ≥2 ⇒ FAIL（附 file 供 A6 复检定位）。豁免与模板侧一致。
      const scriptFabricatedByFile = new Map();
      for (const [p, c] of entries) {
        const scriptMatch = c.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (!scriptMatch) continue;
        for (const lit of extractScriptStringLiterals(scriptMatch[1])) {
          const t = String(lit).trim();
          if (t.length < 2) continue;
          // 🛡️ 2026-11-12（e32c7951 实锤）：模块/资源路径不是展示文案。中文资源名会绕过
          //   下方 hasCjk 豁免（原判据假设路径都是 ASCII），必须按形态单独排除。
          if (looksLikeModulePath(t)) continue;
          const isPlaceholder = PLACEHOLDER_TEXT_RX.test(t) || PLACEHOLDER_WORDS.has(t);
          const hasCjk = /[\u4e00-\u9fff]/.test(t);
          if (!isPlaceholder && !hasCjk) continue; // 类名/事件名/英文文案不算展示文案
          if (truthTexts.has(t)) continue;
          let contained = false;
          for (const tt of truthTexts) {
            if (tt.includes(t) || t.includes(tt)) { contained = true; break; }
          }
          if (contained) continue;
          if (!scriptFabricatedByFile.has(p)) scriptFabricatedByFile.set(p, new Set());
          scriptFabricatedByFile.get(p).add(t);
        }
      }
      const scriptFabricatedTotal = [...scriptFabricatedByFile.values()].reduce(
        (n, s) => n + s.size, 0,
      );
      if (scriptFabricatedTotal >= 2) {
        const firstFileHits = [...scriptFabricatedByFile.values()][0];
        const samples = firstFileHits
          ? [...firstFileHits].slice(0, 3).map((t) => `「${t.slice(0, 12)}」`).join('、')
          : '';
        fails.push({
          code: 'C1',
          file: [...scriptFabricatedByFile.keys()][0],
          files: [...scriptFabricatedByFile.keys()],
          detail: `${scriptFabricatedTotal} 条 script 常量/默认值文案在 Figma 真值中不存在（如 ${samples}）——数据驱动渲染的文案同样必须逐字取自真值，禁止占位数组`,
        });
      }

      // ── C1-DUP：重复渲染（2026-11-12 · mc-max-1794415139727-828c281a 实锤）：
      //   刀53/54 regions 接管把弹窗根 36:1693 渲染成绝对定位 textRun（ContentHeader.vue
      //   的 rt4=「产品描述」），LLM chunk 又独立生成 36:1708 段组件（ContentSection.vue
      //   的 runs[0]）渲染同一真值文本 ⇒ 页面出现两份。接管/chunk 互斥只对同 subPath
      //   生效，跨文件重叠无守卫（规划层根治项已登记）。
      //   判据（确定性）：真值中恰好出现 1 次的 CJK 标签（≥2 字），产物中 ≥2 个 .vue
      //   文件渲染（模板静态文本或 script 字面量，同文件去重）⇒ FAIL。
      //   keeper=类名命中 FG_TAKEOVER_CLASS_RX 的接管文件（终裁覆写自愈，不进 files）；
      //   无 keeper 时 files=全部重复文件，guidance 指示保留带 data-section-id 段锚者。
      //   不命中枚举：真值出现 ≥2 次（本就多处展示）跳过；单文件渲染跳过；非 CJK 跳过；
      //   真值缺席标签（如 echarts markLine 配置文案）走 C1 script 通道、不进本判据。
      {
        const contentByFile = new Map(entries);
        const renderFilesByLabel = new Map();
        for (const [p, c] of entries) {
          const labels = new Set();
          const tplM = c.match(/<template[\s\S]*<\/template>/i);
          if (tplM) {
            const st = tplM[0]
              .replace(/<!--[\s\S]*?-->/g, '\n')
              .replace(/=(?:"[^"]*"|'[^']*')/g, '=""')
              .replace(/\{\{[\s\S]*?\}\}/g, '\n')
              .replace(/<[^>]+>/g, '\n');
            for (const raw of st.split('\n')) {
              const t = raw.trim();
              if (t.length >= 2 && /[\u4e00-\u9fff]/.test(t)) labels.add(t);
            }
          }
          const scM = c.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
          if (scM) {
            // 🛡️ C1-DUP 死数据守卫（2026-11-12 · mc-max-1794419765173-f8d1be8a 实锤）：
            //   script 字面量必须被本文件模板消费（字面量所属变量出现在模板
            //   插值/v-for/:prop 中）才算「渲染」——否则 LLM 留在 index.vue 的
            //   未接线 tabList 常量（模板只有 <TabsSection/>，真渲染在子组件）
            //   会被误判成第二份渲染 ⇒ 修复轮删真渲染/加死代码循环空转（初检 5 条
            //   →复检 2 条，effective=false 拒交付）。
            //   判据：字面量 → 所在声明变量名（const/let x = ... 'lit' ...）→ 模板中
            //   出现该变量名（{{ x }}、v-for="... in x"、:prop="x..."）⇒ 消费。
            //   模板零消费的字面量不进本判据（死数据归 C1 script 通道管臆造）。
            const tplSrc = tplM ? tplM[0] : '';
            // 🛡️ C1-DUP props 兜底豁免（2026-11-12 · mc-1794428949810-19730823 实锤）：
            //   ContentSection.vue `items: { default: () => [{ name: '华为技术', ... }] }`、
            //   `title: { default: '战略合作厂商' }` 是 props 兜底值，不是渲染；旧逻辑经
            //   「键名 name/title → 模板 {{ item.name }} 消费」通道把它们判成该文件的独立
            //   渲染，与 index.vue 传入的真实数据构成「两文件重复」⇒ FAIL ⇒ 修复轮删真数据
            //   ⇒ C1b 真值缺席，互踢死循环。判据：defineProps(...) 平衡括号块内的字面量
            //   一律不计入本文件「渲染」（props 兜底从来不是渲染；臆造兜底值仍由 C1 script
            //   通道按真值集合另行管）。
            const propBlockSpans = [];
            {
              const src = scM[1];
              const rx = /\bdefineProps\s*\(/g;
              let m2;
              while ((m2 = rx.exec(src))) {
                let depth = 0;
                let i2 = m2.index + m2[0].length - 1; // 停在 '('
                for (; i2 < src.length; i2++) {
                  if (src[i2] === '(') depth += 1;
                  else if (src[i2] === ')') {
                    depth -= 1;
                    if (depth === 0) break;
                  }
                }
                propBlockSpans.push([m2.index, i2]);
              }
            }
            const inPropsBlock = (start) =>
              propBlockSpans.some(([a, b]) => start > a && start < b);
            const declaredVars = new Set();
            const consumedLits = new Set();
            for (const litSpan of extractScriptStringLiteralSpans(scM[1])) {
              const t = String(litSpan.value).trim();
              if (t.length < 2 || !/[\u4e00-\u9fff]/.test(t)) continue;
              if (inPropsBlock(litSpan.start)) continue;
              // 找字面量所在声明行/块的变量名（`label: 'x'` 取键名；`const y = 'x'` 取 y）
              const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const declRe = new RegExp(
                `(?:const|let|var)\\s+(\\w+)\\s*=[^;]*['"]${esc}['"]|(?:^|[{,]\\s*)(\\w+)\\s*:\\s*['"]${esc}['"]`,
              );
              const dm = scM[1].match(declRe);
              const varName = dm ? dm[1] || dm[2] : null;
              // 🛡️ 供数≠渲染收紧（2026-11-12 · mc-1794448552628-9b26f383 实锤）：
              //   index.vue `v-for="isoItem in ISO_REPEAT" :title="isoItem.title"` 是把
              //   数据经 props **下发**给子组件——父组件没有渲染该文本，旧口径「变量名
              //   在模板出现 ⇒ 渲染」把父计成渲染者，与子组件构成假 dup ⇒ 修复轮删
              //   父侧真数据源 ⇒ C1b 真值缺席。收紧口径：变量名（或其 v-for 别名）必须
              //   出现在**插值 `{{ }}`** 中才算渲染；仅出现在 `:prop`/`v-for` 绑定 ⇒ 供数。
              //   spec ⑤（828c281a 形态）不受扰：`v-for="r in runs" + {{ r.text }}`
              //   别名 r 进了插值 ⇒ 仍算渲染。
              if (varName && tplSrc) {
                const interpBlocks = [...tplSrc.matchAll(/\{\{([\s\S]*?)\}\}/g)].map(
                  (m3) => m3[1],
                );
                const nameRx = new RegExp(`\\b${varName}\\b`);
                let consumed = interpBlocks.some((b) => nameRx.test(b));
                if (!consumed) {
                  // v-for 别名通道：`v-for="(alias, idx) in varName"` / `v-for="alias in varName"`
                  for (const m3 of tplSrc.matchAll(
                    /v-for="\s*\(?\s*([\w$]+)(?:\s*,[^)]*)?\)?\s+in\s+([\w$]+)/g,
                  )) {
                    if (m3[2] !== varName) continue;
                    const aliasRx = new RegExp(`\\b${m3[1]}\\b`);
                    if (interpBlocks.some((b) => aliasRx.test(b))) {
                      consumed = true;
                      break;
                    }
                  }
                }
                if (consumed) consumedLits.add(t);
              }
            }
            for (const t of consumedLits) labels.add(t);
          }
          for (const t of labels) {
            if (!renderFilesByLabel.has(t)) renderFilesByLabel.set(t, new Set());
            renderFilesByLabel.get(t).add(p);
          }
        }
        const dupRenders = [];
        for (const [label, fs] of renderFilesByLabel) {
          if ((truthTextCount.get(label) || 0) === 1 && fs.size >= 2) {
            const fileList = [...fs];
            // keeper 优先级：①确定性接管类名（终裁覆写自愈）→ ②真值几何归属（文本节点的
            // 包围盒中心落在哪个 data-section-id 段的 bbox 内）。②的动机（fbd77192 实锤）：
            // 「在线设备」真值节点 38:3285 的父容器是 796:3（不是任何段），旧规则「保留带
            // 段锚的那份」在**两个文件都带段锚**时不可判定 ⇒ 修复轮只能猜 ⇒ 删错/不删。
            // 几何是唯一可辩驳的归属证据：中心 (27359,51508) 落在 38:3282 内，不在 38:3260。
            const takeoverKeeper = fileList.find((f) =>
              FG_TAKEOVER_CLASS_RX.test(String(contentByFile.get(f) || '')),
            );
            let geoKeeper = '';
            let ownerSectionId = '';
            const tnode = truthNodeByLabel.get(label);
            const tb = tnode && tnode.absoluteBoundingBox;
            if (!takeoverKeeper && tb && typeof tb.x === 'number' && typeof tb.y === 'number') {
              const cx = tb.x + tb.width / 2;
              const cy = tb.y + tb.height / 2;
              for (const f of fileList) {
                const c = String(contentByFile.get(f) || '');
                for (const m of c.matchAll(/data-section-id="([^"]+)"/g)) {
                  const sb = nodeById.get(m[1])?.absoluteBoundingBox;
                  if (
                    sb &&
                    typeof sb.x === 'number' &&
                    cx >= sb.x &&
                    cx <= sb.x + sb.width &&
                    cy >= sb.y &&
                    cy <= sb.y + sb.height
                  ) {
                    geoKeeper = f;
                    ownerSectionId = m[1];
                    break;
                  }
                }
                if (geoKeeper) break;
              }
            }
            const keeper = takeoverKeeper || geoKeeper;
            const dupFiles = keeper ? fileList.filter((f) => f !== keeper) : fileList;
            if (dupFiles.length > 0) {
              dupRenders.push({
                label,
                keeper,
                keeperBy: takeoverKeeper ? 'takeover' : geoKeeper ? 'geometry' : 'none',
                ownerSectionId,
                dupFiles,
              });
            }
          }
        }
        if (dupRenders.length > 0) {
          // 🛡️ C1-DUP 变体豁免（2026-11-12 · e32c7951 三色分组实锤，规划层变体归组的
          //   判据配套）：同一 Figma 组件的多个实例（仅 fill/颜色不同）被 LLM 写成多个
          //   **不同文件名**的组件文件，渲染同一组真值文本 ⇒ 被本判据判「重复」⇒ 修复轮
          //   按指示删数据 ⇒ 三色拆丢 + C1b 真值缺席互踢。变体判定（零语义、可辩驳）：
          //   dup 双方文件剥离颜色字面量与资源 import 行后，**模板静态文本序列完全一致**
          //   ⇒ 结构同构 ⇒ 是同源变体对。豁免的 dup 条目降级为 WARN（不 FAIL、不进修复
          //   轮），guidance 指示「合并为一个组件 prop 驱动颜色」交由规划层变体归组根治。
          const stripVariantNoise = (c) => {
            const tpl = String(c || '').match(/<template[\s\S]*<\/template>/i)?.[0] || '';
            return tpl
              .replace(/<!--[\s\S]*?-->/g, '\n')
              .replace(/=(?:"[^"]*"|'[^']*')/g, '=""')
              .replace(/\{\{[\s\S]*?\}\}/g, '\n')
              .replace(/<[^>]+>/g, '\n')
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean);
          };
          // 渲染文本集合：模板静态行 ∪ script CJK 字面量（e32c7951 实锤：厂商组组件
          // 数据全在 script 字面量、模板近乎空——只比模板骨架会漏判。宽松集合是安全的：
          // 能进入 dup 判定的字面量已在「死数据守卫」验证过模板消费，不是死数据）。
          const labelSetOf = (c) => {
            const s = new Set(stripVariantNoise(c));
            const scM = String(c || '').match(/<script[^>]*>([\s\S]*?)<\/script>/i);
            if (scM) {
              for (const lit of extractScriptStringLiterals(scM[1])) {
                const t = String(lit).trim();
                if (t.length >= 2 && /[\u4e00-\u9fff]/.test(t)) s.add(t);
              }
            }
            return s;
          };
          const isVariantPair = (a, b) => {
            const sa = labelSetOf(contentByFile.get(a));
            const sb = labelSetOf(contentByFile.get(b));
            if (sa.size === 0 || sb.size === 0) return false;
            let inter = 0;
            for (const v of sa) if (sb.has(v)) inter += 1;
            // 🛡️ 双条件（repair-recipe 夹具回归实锤：单条 label 重复的两个段组件
            //   集合重合度也是 100%——那是要 keeper 裁决的真重复，不是变体）：
            //   ① 较小集合 ≥80% 在大集合中出现；② 共享文本 ≥3 条（整组数据重合
            //   才是同源变体副本；单条/双条重复交给 keeper 几何归属裁决）。
            return inter >= 3 && inter >= Math.min(sa.size, sb.size) * 0.8;
          };
          const variantPairs = [];
          const keptRenders = [];
          for (const d of dupRenders) {
            const { dupFiles, keeper } = d;
            // 🛡️ takeover 互撞不豁免（745b68de 回归实锤）：接管文件（fg-regions 绝对
            //   定位）与 chunk 组件渲染同一组 KV，文本集合天然高度重合——但这是刀53/54
            //   接管与 chunk 的**结构性互撞**（该删 chunk 侧），不是颜色变体。只在
            //   geometry/none keeper 场景做变体豁免。
            if (d.keeperBy === 'takeover') {
              keptRenders.push(d);
              continue;
            }
            const base = keeper || dupFiles[0];
            const others = keeper ? dupFiles : dupFiles.slice(1);
            const variantOthers = others.filter((f) => isVariantPair(base, f));
            const realDupFiles = others.filter((f) => !variantOthers.includes(f));
            if (variantOthers.length > 0) {
              variantPairs.push({ label: d.label, keeper: base, variantFiles: variantOthers });
            }
            if (realDupFiles.length > 0) {
              keptRenders.push({ ...d, dupFiles: realDupFiles });
            }
          }
          if (variantPairs.length > 0) {
            warns.push(
              `C1-DUP-variant：${variantPairs.length} 条真值文本的「重复渲染」实为同源变体对` +
                `（如 「${variantPairs[0].label.slice(0, 12)}」：${variantPairs[0].keeper.split('/').pop()} 与 ${variantPairs[0].variantFiles.map((f) => f.split('/').pop()).join('、')} 模板骨架逐字一致仅颜色不同）——不判重复、禁止删除；` +
                `根治方向=规划层变体归组（一个组件 prop 驱动颜色）`,
            );
          }
          dupRenders.length = 0;
          dupRenders.push(...keptRenders);
        }
        if (dupRenders.length > 0) {
          fails.push({
            code: 'C1-DUP',
            detail:
              `${dupRenders.length} 条真值文本被多个组件重复渲染（如 「${dupRenders[0].label.slice(0, 12)}」` +
              `${dupRenders[0].keeper ? `，确定性保留 ${dupRenders[0].keeper.split('/').pop()}（${dupRenders[0].keeperBy === 'geometry' ? '真值几何归属' : '接管类名'}）为准` : ''}）` +
              `——同一真值文本只应渲染一份，删除其余重复块`,
            files: [...new Set(dupRenders.flatMap((d) => d.dupFiles))],
            // 结构化载荷（附加，不改既有 files 语义）：修复配方逐条给「保留谁 / 删谁的哪块」
            dupRenders: dupRenders.map((d) => ({
              label: d.label,
              keeper: d.keeper || '',
              keeperBy: d.keeperBy,
              ownerSectionId: d.ownerSectionId || '',
              dupFiles: d.dupFiles,
            })),
          });
        }
      }

      // ── G-SLOT：外壳 slot 装配契约（2026-11-12 · mc-max-1794421297344-f3543604 实锤）：
      //    T4 剥离器把「根直系+顶部薄条」的面板标题元素从组件剥掉（注释
      //    「面板标题由 base-panel 外壳渲染」留痕）并回写 declare.attribute.title，
      //    依赖外壳 #title-left slot 渲染——但 LLM 是否把标题组件挂进 title-left
      //    是随机的（f6a0da7b 挂了 ⇒ 标题在；f3543604 没挂 ⇒ 标题丢失+外壳占位露出）。
      //    判据（确定性）：任一 .vue 含 T4 剥离留痕注释 ⇒ index.vue 模板必须满足：
      //    ①存在 #title-left 具名 slot；②其内容渲染 declare.attribute.title 文本
      //    （slot 块内出现该标题文本本身或渲染 declare 的插值）。不满足 ⇒ FAIL
      //    + 配方「把标题组件/文本挂入 #title-left」。
      //    不命中枚举：无剥离留痕（T4 未触发）跳过；title-left 有内容但标题由
      //    declare 动态注入（slot 内任意非空内容即视为已挂载，不苛求字面命中）。
      {
        const STRIP_MARK = '面板标题由 base-panel 外壳渲染';
        const contentByFileGS = new Map(entries);
        const strippedFile = [...contentByFileGS.values()].find((c) => c.includes(STRIP_MARK));
        const indexSrc = String(contentByFileGS.get('package/index.vue') || '');
        if (strippedFile && indexSrc) {
          const tplM = indexSrc.match(/<template[\s\S]*<\/template>/i);
          const tpl = tplM ? tplM[0] : '';
          const hasTitleLeft = /<template\s+#title-left[\s>]/.test(tpl) || /<template\s+v-slot:title-left[\s>]/.test(tpl);
          const titleLeftBlock = tpl.match(/<template\s+#title-left[\s>][\s\S]*?<\/template>/i);
          const titleLeftFilled = Boolean(titleLeftBlock && /[A-Za-z<]/.test(titleLeftBlock[0].replace(/<\/?template[^>]*>/g, '')));
          if (!hasTitleLeft || !titleLeftFilled) {
            fails.push({
              code: 'G-SLOT',
              detail:
                '面板标题元素已被剥离（依赖 base-panel 外壳 #title-left 渲染），但 index.vue 未挂载 title-left slot 内容 ⇒ 标题丢失且外壳占位露出。须把标题组件（或 declare.title 文本）挂入 <template #title-left>',
              files: ['package/index.vue'],
            });
          }
        }
      }

      // ── P0-2 漏口③（2026-11-11 交接文档 · fc3d948f「爆闪灯」空胶囊实锤）：
      //    真值有标签文本、产物全量源码零命中 ⇒ 标签未物化（空 span/背景注入失败残留）。
      //    判据：真值 TEXT 中「含 CJK、2-16 字、非 @图表库标记子树」（图表内部文案由
      //    运行时渲染，不要求 DOM 在场）的标签，在 allVueNoS2（剔除 S2 自愈文本）中
      //    子串零命中 ⇒ 计缺失；缺失 ≥2 ⇒ FAIL。
      //    🛡️ 2026-11-11 晚政策修订（mc-max-1794410424120-4b27c0bd 实锤）：旧「整组类
      //    不附 file」让 failFiles 永远不含真坏文件 ⇒ A6/R12 断点恢复把占位组件每轮
      //    复活（修复轮 0/4）。现按祖先链定位 carrier 文件附 files（找不到 carrier 时
      //    维持无 file 的放行语义，判据不变）。
      const _chartSubNodeIds = new Set();
      {
        const markChartSubtree = (n, inChart) => {
          if (!n || typeof n !== 'object') return;
          const isChart = inChart || /^@(echarts|chart|chartjs|plotly|g2|antv|d3)\b/i.test(String(n.name || ''));
          if (n.id != null && isChart) _chartSubNodeIds.add(String(n.id));
          for (const c of Array.isArray(n.children) ? n.children : []) markChartSubtree(c, isChart);
        };
        markChartSubtree(input.figmaNodeData?.document || input.figmaNodeData, false);
      }
      const _missingLabels = [];
      const _seenLabelNodes = new Set();
      // 子树内任意节点命中图表标记 ⇒ 其 TEXT 免检（parent 链映射一次建好）
      // 🛡️ parentMapC1 上提到本层（2026-11-11 晚）：C1b fail 定位 carrier 需沿祖先链
      //   上行，映射必须在 missingLabels 消费处可见。
      const parentMapC1 = new Map();
      // 🛡️ 拆分渲染拼接等价（2026-11-12 · mc-1794448938089-3b9dd65c 实锤）：真值「8台」
      //   被产物渲染成相邻两 span `{{ s.v }}`（"8"）+ `{{ s.l }}`（"台"）——源码无「8台」
      //   连体 ⇒ includes 误判缺席 ⇒ 修复轮白耗。等价判定（确定性）：按源码顺序提取每
      //   文件的渲染文本片段序列（模板静态行 ∪ script 字面量），相邻 2~3 片段的拼接若
      //   等于真值文本 ⇒ 视为已物化（DOM 中相邻兄弟 span 文本视觉连续）。
      const c1bEquivTexts = new Set();
      for (const [, c] of entries) {
        const seq = [];
        const tplC1b = String(c || '').match(/<template[\s\S]*<\/template>/i)?.[0] || '';
        const stC1b = tplC1b
          .replace(/<!--[\s\S]*?-->/g, '\n')
          .replace(/=(?:"[^"]*"|'[^']*')/g, '=""')
          .replace(/\{\{[\s\S]*?\}\}/g, '\n')
          .replace(/<[^>]+>/g, '\n');
        for (const raw of stC1b.split('\n')) {
          const t = raw.trim();
          if (t) seq.push(t);
        }
        const scC1b = String(c || '').match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (scC1b) {
          for (const lit of extractScriptStringLiterals(scC1b[1])) {
            const t = String(lit).trim();
            if (t && t.length <= 16 && /[\u4e00-\u9fff0-9]/.test(t)) seq.push(t);
          }
        }
        for (let i = 0; i + 1 < seq.length; i++) {
          c1bEquivTexts.add(seq[i] + seq[i + 1]);
          if (i + 2 < seq.length) c1bEquivTexts.add(seq[i] + seq[i + 1] + seq[i + 2]);
        }
      }
      {
        const walkC1 = (n, parent) => {
          if (!n || typeof n !== 'object') return;
          if (n.id != null) parentMapC1.set(n, parent);
          for (const c of Array.isArray(n.children) ? n.children : []) walkC1(c, n);
        };
        walkC1(input.figmaNodeData?.document || input.figmaNodeData, null);
        const inChartSubtree = (n) => {
          let cur = n;
          for (let d = 0; cur && d < 64; d++) {
            if (_chartSubNodeIds.has(String(cur.id))) return true;
            cur = parentMapC1.get(cur);
          }
          return false;
        };
        const collectLabels = (n) => {
          if (!n || typeof n !== 'object') return;
          if (
            n.type === 'TEXT' &&
            !_seenLabelNodes.has(n) &&
            typeof n.characters === 'string'
          ) {
            _seenLabelNodes.add(n);
            const t = n.characters.trim();
            if (t.length >= 2 && t.length <= 16 && /[\u4e00-\u9fff]/.test(t) && !inChartSubtree(n)) {
              _missingLabels.push({ text: t, present: allVueNoS2.includes(t) || c1bEquivTexts.has(t), node: n });
            }
          }
          for (const c of Array.isArray(n.children) ? n.children : []) collectLabels(c);
        };
        collectLabels(input.figmaNodeData?.document || input.figmaNodeData);
      }
      const missingLabels = _missingLabels.filter((x) => !x.present);
      if (missingLabels.length >= 2) {
        // 🛡️ A6 前置（2026-11-11 晚 · mc-max-1794410424120-4b27c0bd 实锤）：C1b 必须给出
        //   **可定位文件**——此前 fail 无 file ⇒ failFiles 不含真坏文件 ⇒ A6/R12 把占位
        //   组件当「已完成分块」每轮从磁盘恢复，修复轮永远修不到。定位判据（确定性）：
        //   缺席标签节点沿 parentMapC1 祖先链上行，首个 id 出现在产物 data-section-id
        //   的祖先 = 承载段 ⇒ 该段所在 .vue 即 carrier（与 A1-v2 carrierFile 同源口径）。
        const _c1bSectionFile = new Map(); // sectionId → file
        for (const [p, c] of entries) {
          for (const m of c.matchAll(/data-section-id="([^"]+)"/g)) {
            if (!_c1bSectionFile.has(m[1])) _c1bSectionFile.set(m[1], p);
          }
        }
        const _c1bCarriers = new Set();
        for (const x of missingLabels) {
          let cur = x.node;
          for (let d = 0; cur && d < 64; d++) {
            const f = _c1bSectionFile.get(String(cur.id));
            if (f) {
              _c1bCarriers.add(f);
              break;
            }
            cur = parentMapC1.get(cur);
          }
        }
        // 🛡️ C1b 修复配方载荷（2026-11-12 · fbd77192 实锤）：修复轮只拿到「15 个标签缺席」
        //   的描述 ⇒ LLM 无从照抄，复检仍 FAIL。结构化给出「哪一段 / 哪个文件 / 真值条目
        //   （标签+数值，按 Figma 顺序）」= 可照抄配方；数值取同父容器内相邻的纯数字/台数 TEXT。
        const _cnValueRx = /^\d+(?:\.\d+)?\s*台?$/;
        const _c1bItems = [];
        for (const x of missingLabels) {
          let carrier = '';
          let sectionId = '';
          let cur = x.node;
          for (let d = 0; cur && d < 64; d++) {
            const sid = _c1bSectionFile.get(String(cur.id));
            if (sid) {
              carrier = sid;
              sectionId = String(cur.id);
              break;
            }
            cur = parentMapC1.get(cur);
          }
          // 数值：同父容器内紧邻（先向后、再向前）的数值型 TEXT
          let count = '';
          const parent = parentMapC1.get(x.node);
          const sibs = Array.isArray(parent?.children) ? parent.children : [];
          const idx = sibs.indexOf(x.node);
          if (idx >= 0) {
            for (const step of [1, 2, -1, -2]) {
              const s = sibs[idx + step];
              if (s && s.type === 'TEXT' && typeof s.characters === 'string') {
                const t = s.characters.trim();
                if (_cnValueRx.test(t)) {
                  count = t;
                  break;
                }
              }
            }
          }
          _c1bItems.push({ text: x.text, count, file: carrier, sectionId });
        }
        fails.push({
          code: 'C1b',
          detail: `${missingLabels.length} 个真值标签文本在产物中完全缺席（如 ${missingLabels
            .slice(0, 5)
            .map((x) => `「${x.text.slice(0, 12)}」`)
            .join('、')}）——真值有文本而产物为空（空 span/空胶囊）= 标签未物化，补齐承载或修背景注入`,
          ...(Array.from(_c1bCarriers).length > 0
            ? { files: Array.from(_c1bCarriers) }
            : {}),
          missingLabels: _c1bItems,
        });
      }
    }
  }

  // ── E5：style 空声明（P0-2 · 2026-11-11 交接文档 L5：ContentSection2.vue:49 /
  //    StatsSection.vue:52 孤立 `;` = 资源注入静默失败留痕）。判据（确定性）：
  //    <style> 块内整行只有 `;` ⇒ 该规则块声明被注入器吞掉。
  //    🛡️ 2026-11-11 降级 FAIL→WARN（0a501b7e 连坐拒交付实锤）：空声明本身无视觉
  //    危害，只是痕迹标记；注入真失败时其视觉缺陷由对应资源/背景判据独立判定，
  //    不给空声明交付一票否决权。恒开。
  for (const [p, c] of entries) {
    const styleBlocks = c.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    let emptyDeclLines = 0;
    for (const block of styleBlocks) {
      for (const line of block.split('\n')) {
        if (/^\s*;\s*$/.test(line)) emptyDeclLines += 1;
      }
    }
    if (emptyDeclLines > 0) {
      checked += 1;
      warns.push(
        `E5 style 内 ${emptyDeclLines} 行空声明「;」（如 ${p}）——注入静默失败留痕，建议定位选择器补齐真实声明（不拦交付）`,
      );
    }
  }

  // ── D1/D-GRID/D3：分组结构守恒 / 网格列数 / 主轴方向 ─────────────────────
  // 🛡️ 2026-11-12（mc-1794428749650-cc633474 实锤）：三张分组卡（161/212/265 高、
  //   标题各异、各带 icon 与独立底框）被折叠成 1 段 33 条 ⇒ 产物只剩一个组标题、
  //   33 条平铺 5 列、两张统计卡竖排各占 24% 高，验收却 FAIL=2 放行。
  //   病根：既有判据只覆盖「图标消费/重复渲染/props 链」，**没有一条看分组数与主轴方向**。
  //
  //   真值源：`input.componentPlan.effectiveSections`（纯附加入参，缺省则整段跳过 = fail-open，
  //   不改变任何既有判据行为）。三条判据各自可辩驳：
  //     D1 分组数守恒：真值中带 header.title 的段 ≥2 ⇒ 每个标题文本必须出现在产物模板里
  //        （标题是无样式依赖的纯文本，与配色/布局实现无关 ⇒ 与 C 层修复不同源）。
  //     D-GRID 网格列数：段 gridColumns=K ⇒ 承载该段（data-section-id）的**文件**必须存在
  //        K 列声明（`repeat(K` 或 `grid-template-columns` 后紧跟 K）。只认声明存在，
  //        不认具体写法位置（C 层写 inline、LLM 写 class 规则均可通过）。
  //     D3 主轴方向：真值存在「相邻两段 y 相同、x 相邻、等宽」的并排对 ⇒ index.vue 里必须有
  //        row 主轴声明（flex-direction:row 或两列 grid）。纵排组件不触发（fail-open）。
  //   不命中枚举：无 componentPlan / 段无 header.title（单组列表）/ K 缺省 / 未找到承载元素
  //    / 无并排对 ⇒ 一律跳过，不给假 FAIL。
  const _planSections =
    (input.componentPlan && Array.isArray(input.componentPlan.effectiveSections)
      ? input.componentPlan.effectiveSections
      : null) ||
    (Array.isArray(input.effectiveSections) ? input.effectiveSections : null);
  if (_planSections && _planSections.length > 0) {
    const flatSecs = [];
    const walkPlan = (arr, d) => {
      if (!Array.isArray(arr) || d > 5) return;
      for (const s of arr) {
        if (!s || typeof s !== 'object') continue;
        flatSecs.push(s);
        walkPlan(s.children, d + 1);
        if (Array.isArray(s.body?.children)) walkPlan(s.body.children, d + 1);
      }
    };
    walkPlan(_planSections, 0);
    const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // D1 分组数守恒
    const titledSecs = flatSecs.filter((s) => {
      const t = s.header && s.header.title;
      return typeof t === 'string' && t.trim().length > 0;
    });
    if (titledSecs.length >= 2) {
      checked += 1;
      const missing = titledSecs.filter((s) => !allVueNoS2.includes(String(s.header.title).trim()));
      if (missing.length > 0) {
        fails.push({
          code: 'D1',
          detail:
            `分组结构塌陷：真值 ${titledSecs.length} 个独立分组（各带标题+底框），产物缺 ${missing.length} 个标题 —— ` +
            `「${missing.map((s) => String(s.header.title).trim()).slice(0, 4).join('」「')}」完全缺席。` +
            `禁止把多个分组合并成一个网格；每组必须有独立容器与标题（可 v-for 分组，但标题逐组渲染）`,
        });
      }
    }

    // D-GRID 网格列数落地（**元素级**：必须证明承载该段的那个元素声明了 K 列）
    // 🛡️ 2026-11-12 P0-2 收紧：旧实现是**文件级**正则（`repeat(K` 出现在文件任意处即通过）
    //   ⇒ 同文件里别的网格写对 K 列，本段哪怕写成 flex 平铺也照样 PASS = 放水。
    //   新实现走既有解析链（findVForPairs 定位 v-for 宿主 → resolveElementDecls 合并
    //   class 规则 + inline style → declaredColumns 数列），与 GRID-CONTRACT-001 同源。
    //   列数**数不出**判 FAIL（fail-closed）：修复轮配方已给可照抄形态，有能力过。
    {
      const fileList = entries.map(([path, content]) => ({ path, content }));
      const styleSources = collectStyleSources(fileList);
      const pairsCache = new Map();
      const pairsOf = (fp, fc) => {
        if (!pairsCache.has(fp)) pairsCache.set(fp, findVForPairs(fc, fp) || []);
        return pairsCache.get(fp);
      };
      for (const s of flatSecs) {
        const k = Number(s.gridColumns || (s.body && s.body.gridColumns) || 0);
        const isGrid =
          s.type === 'grid' || s.layout === 'grid' || String(s.id || '').endsWith('-list');
        if (!isGrid || k < 2 || k > 8) continue;
        const sidRx = new RegExp(`^${esc(String(s.id))}(?:-.+)?$`);
        let host = null;
        for (const [fp, fc] of entries) {
          const pairs = pairsOf(fp, fc);
          if (pairs.length === 0) continue;
          // R8-11 同口径：段锚点常挂在组件根，v-for 宿主在内层 ⇒ 根锚点也认
          const rootAttrs = matchAllTags(fc).find((a) => sectionIdOf(a)) || '';
          for (const pair of pairs) {
            const wrapAttrs = pair.parent?.attrs || '';
            const itemAttrs = pair.item?.attrs || '';
            const sid = sectionIdOf(wrapAttrs) || sectionIdOf(rootAttrs);
            if (!sid || !sidRx.test(sid)) continue;
            host = { fp, wrapAttrs, itemAttrs };
            break;
          }
          if (host) break;
        }
        // 无 v-for / 找不到承载 ⇒ fail-open：没有重复项就无「列数」语义，
        // 该场景由 GRID-CONTRACT-001（精确比对）与 C 层自愈覆盖。
        if (!host) continue;
        checked += 1;
        const wrap = resolveElementDecls(
          styleSources,
          classAttrOf(host.wrapAttrs),
          inlineStyleOf(host.wrapAttrs),
        );
        const item = resolveElementDecls(
          styleSources,
          classAttrOf(host.itemAttrs),
          inlineStyleOf(host.itemAttrs),
        );
        const dc = declaredColumns(wrap, item);
        if (dc && dc.cols === k) continue;
        fails.push({
          code: 'D-GRID',
          file: host.fp,
          detail: dc
            ? `段 ${s.id} 真值 ${k} 列网格（gridColumns=${k}），但 ${host.fp} 的承载元素声明的是 ${dc.cols} 列` +
              `（display:${wrap.display || '(未声明)'}，写法=${dc.form}）—— 列数不符`
            : `段 ${s.id} 真值 ${k} 列网格（gridColumns=${k}），但 ${host.fp} 的承载元素**数不出列数**` +
              `（display:${wrap.display || '(未声明)'}，grid-template-columns:${wrap['grid-template-columns'] || '(未声明)'}）` +
              `—— flex 平铺 / flex:1 均分 / repeat(auto-fill) 都无法证明列数`,
        });
      }
    }

    // D3 主轴方向（并排段 ⇒ row）
    const boxOf = (s) => (s.figmaBox || s.absoluteBoundingBox || null);
    let rowPairs = 0;
    for (let i = 0; i < _planSections.length - 1; i++) {
      const a = boxOf(_planSections[i]);
      const b = boxOf(_planSections[i + 1]);
      if (!a || !b || !Number(a.width) || !Number(b.width)) continue;
      if (Math.abs(Number(a.y) - Number(b.y)) > SIBLING_ROW_TOLERANCE.y) continue;
      if (Math.abs(Number(a.x) - Number(b.x)) <= SIBLING_ROW_TOLERANCE.x) continue;
      if (Math.abs(Number(a.width) - Number(b.width)) > SIBLING_ROW_TOLERANCE.width) continue;
      rowPairs += 1;
    }
    if (rowPairs > 0) {
      checked += 1;
      const idxEntry = entries.find(([p]) => /package\/index\.vue$/.test(p));
      if (idxEntry) {
        const hasRow =
          /flex-direction\s*:\s*row/.test(idxEntry[1]) ||
          /grid-template-columns\s*:\s*[^;"]*\b2\b/.test(idxEntry[1]);
        if (!hasRow) {
          fails.push({
            code: 'D3',
            file: idxEntry[0],
            detail:
              `真值有 ${rowPairs} 组并排段（y 相同、x 相邻、等宽），但 ${idxEntry[0]} 无 row 主轴声明` +
              `（全列排布 ⇒ 并排卡被拉成整行高、各占等分高度）。应为并排段加 flex-direction:row 容器`,
          });
        }
      }
    }
  }

  return { fails, warns, checked };
}

/**
 * 🛡️ G2（2026-11-12 · mc-max-1794412559305-c97b7008 实锤）：提取 defineProps 声明的
 * props 键集合。支持对象形态（含嵌套 default 工厂——键只在顶层深度收集）与数组形态。
 * 花括号配平字符串感知（' " ` 与 \ 转义），不含 try/eval，纯静态。
 */
export function extractDefinePropsKeys(src) {
  const keys = new Set();
  if (typeof src !== 'string' || !src) return keys;
  const m = /defineProps\s*\(/.exec(src);
  if (!m) return keys;
  let i = m.index + m[0].length;
  while (i < src.length && src[i] !== '{' && src[i] !== '[') {
    if (src[i] === ')' || src[i] === ';') return keys;
    i += 1;
  }
  if (i >= src.length) return keys;
  const openCh = src[i];
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0;
  let inStr = null;
  let esc = false;
  const start = i;
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (inStr) { if (ch === inStr) inStr = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === openCh) depth += 1;
    else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) { i += 1; break; }
    }
  }
  const body = src.slice(start + 1, i - 1);
  if (openCh === '[') {
    for (const s of body.split(',')) {
      const t = s.trim().replace(/^['"]|['"]$/g, '');
      if (/^[\w$]+$/.test(t)) keys.add(t);
    }
    return keys;
  }
  // 对象形态：depth===0 处按逗号分段取段首键（嵌套 default 工厂内的键在更深层不误收）
  let d = 0;
  inStr = null;
  esc = false;
  let segStart = 0;
  const segs = [];
  for (let j = 0; j < body.length; j += 1) {
    const ch = body[j];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (inStr) { if (ch === inStr) inStr = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '{' || ch === '[' || ch === '(') d += 1;
    else if (ch === '}' || ch === ']' || ch === ')') d -= 1;
    else if (ch === ',' && d === 0) { segs.push(body.slice(segStart, j)); segStart = j + 1; }
  }
  segs.push(body.slice(segStart));
  for (const seg of segs) {
    const km = /^\s*['"]?([\w$]+)['"]?\s*:/.exec(seg);
    if (km) keys.add(km[1]);
  }
  return keys;
}

const _kebabToCamel = (s) => String(s).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * 🛡️ G2（2026-11-12 · mc-max-1794412559305-c97b7008 实锤）：收集父子 props 契约断链边。
 *   病灶：分块生成跨 chunk 接线不一致——MainSection 传 :attribute-list（camel 化
 *   attributeList）/ :device-img（deviceImg），子组件 defineProps 声明的却是
 *   tableRows / imgSrc ⇒ 交集为空 ⇒ 运行时子组件 props 恒为 default 空值 ⇒
 *   字段表 0 行、图片 v-if 不渲染（肉眼整块缺失）。既有判据全是源码静态文本口径
 *   （文本在源码常量里存在即命中、import 存在即算消费），对「接线断链导致运行时
 *   不渲染」结构性失明 ⇒ acceptance FAIL=0 放行。
 *   判据（确定性、零硬编码）：对每条「父 .vue import 子 .vue 且模板传了动态绑定
 *   （:x / v-bind:x，排除 :key）」边，kebab→camel 归一后与子组件 defineProps 键
 *   集合求交；交集为空 ⇒ 断链。
 *   豁免（窄化枚举，防误伤）：①子组件无 defineProps（$attrs 透传形态）不判；
 *   ②父未传动态绑定不判；③交集非空（部分断链可降级工作）本轮不报；④动态组件
 *   <component :is> 不在标签匹配范围（已知盲区，登记）。
 */
export function collectComponentPropEdges(files) {
  const edges = [];
  if (!files || typeof files !== 'object') return edges;
  const resolveImport = (parentPath, spec) => {
    if (!spec || !spec.endsWith('.vue')) return null;
    const stack = parentPath.split('/').slice(0, -1);
    for (const seg of spec.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') stack.pop();
      else stack.push(seg);
    }
    const out = stack.join('/');
    return (
      Object.keys(files).find((k) => k === out || k.endsWith(`/${out}`)) || null
    );
  };
  for (const [p, code] of Object.entries(files)) {
    if (!/\.vue$/i.test(p) || typeof code !== 'string') continue;
    const compMap = new Map();
    for (const m of code.matchAll(
      /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.vue)['"]/g,
    )) {
      const target = resolveImport(p, m[2]);
      if (target) compMap.set(m[1], target);
    }
    if (compMap.size === 0) continue;
    const tpl = code.match(/<template>([\s\S]*?)<\/template>/i)?.[1] || '';
    if (!tpl) continue;
    for (const [tag, childPath] of compMap) {
      const tagRe = new RegExp(`<${tag}(\\s[^>]*?)?>`, 'g');
      for (const tm of tpl.matchAll(tagRe)) {
        const attrs = tm[1] || '';
        const passed = new Set();
        for (const am of attrs.matchAll(/(?::|v-bind:)([A-Za-z][\w-]*)/g)) {
          if (am[1] === 'key') continue;
          passed.add(_kebabToCamel(am[1]));
        }
        if (passed.size === 0) continue;
        const childSrc = files[childPath];
        const declared = extractDefinePropsKeys(typeof childSrc === 'string' ? childSrc : '');
        if (declared.size === 0) continue; // $attrs 透传形态豁免
        const inter = [...passed].filter((k) => declared.has(k));
        if (inter.length === 0) {
          edges.push({
            parent: p,
            child: childPath,
            tag,
            passed: [...passed],
            declared: [...declared],
          });
        }
      }
    }
  }
  return edges;
}

/** FAIL 清单 → 定向修复指导文本（回灌 L0-B retryGuidance 用） */
/** 分组结构类判据（共用一份分组配方；**禁止**用 /^D\d$/ 正则——既有 D2 是「文本重叠」，
 *  2026-11-12 cc6334 实锤：旧正则把文本重叠误拉进分组配方，修复轮被误导）。 */
export const GROUP_STRUCTURE_CODES = ['D1', 'D3', 'D-GRID'];

/**
 * 🛡️ 防线2 触发判据（**单一来源** · 2026-11-12）：判「是否属整块承载未生成」的大面积缺席。
 *   判据：① C1b 缺席标签合计 ≥3 条；② 任一段 A1-v2 真值文本命中率 <50%（有 A1-v2 fail 即满足）。
 *   命中 ⇒ 修复契约须开「允许新建承载组件文件」例外（否则与 A6-e「禁止新建组件文件」自相矛盾，
 *   LLM 会照禁止办 ⇒ 承载永不补建）。**修复措辞与配方共用此函数，禁两处各写一份判据。**
 * @param {Array} fails runAcceptanceChecks 的 fails
 * @returns {boolean}
 */
export function needsCarrierRebuild(fails) {
  if (!Array.isArray(fails)) return false;
  const c1bTotal = fails
    .filter((f) => f.code === 'C1b' && Array.isArray(f.missingLabels))
    .reduce((n, f) => n + f.missingLabels.length, 0);
  return c1bTotal >= 3 || fails.some((f) => f.code === 'A1-v2');
}

/**
 * 🛡️ C 降级交付判据分级（**单一来源** · 2026-11-12 · mc-max-1794458950336-47b996c3 实锤）
 *
 * 病灶：C1b（3 条真值文本未物化）判据**正确**、定向修复两轮未修好 ⇒ 出口直接
 *   `throw 拒绝交付坏结构` ⇒ 用户拿到「生成失败」，但磁盘产物其实**能打开、能进编辑器**，
 *   只差 3 处文本。判据没问题，问题在**交付策略**：把「视觉/内容缺失」和「产物不可用」
 *   一视同仁地 fail-closed。
 *
 * 现按「**能打开的产物就交付，打不开的才拦**」分级：
 *   - 可降级（degradable）：缺文本 / 缺图标 / 背景错挂 / 分组结构偏差 / 重复渲染 /
 *     props 断链 / 假数据 / 标题槽未挂 ⇒ 产物是「不完整的组件」，页面照常打开，
 *     用户可进编辑器手改。降级交付 = completed + qualityGate='warned' + 待补清单。
 *   - 阻断（blocking）：`Dangling`（index 引用的组件未落盘）⇒ 产物**打不开**（白屏/编译失败），
 *     交付等于交付坏包 ⇒ 维持 fail-closed。
 *
 * 🔴 纪律：**只放宽交付策略，绝不放宽判据**。判据照旧全跑、FAIL 照旧计数、修复轮照旧回灌；
 *   本清单只决定「最后一轮仍 FAIL 时，是交付+警告 还是 拒绝」。
 * 🔴 未知码默认阻断（白名单制）——新增判据码若未在此登记，行为与改动前逐字一致（零回归）。
 */
export const DELIVERABLE_DEGRADABLE_CODES = [
  // 文本/内容缺失（产物可打开，只是字不全）
  'C1b',
  'C1',
  'C1-DUP',
  'A1-v2',
  // 视觉/样式偏差（可打开，观感偏差）
  'A1-H',
  'D1',
  'D3',
  'D-GRID',
  'D2',
  'E2-v3',
  'E3-v2',
  'E3-v3',
  'E3-v4',
  'G1-v2',
  // 接线/数据契约（运行时降级渲染，不崩）
  'G2',
  'C2',
  // 标题槽未挂（用户明确要求：保留「缺标题」显式提示）
  'G-SLOT',
];

/** 阻断类判据（列全，便于审计；未登记的码同样按阻断处理 = fail-closed） */
export const DELIVERABLE_BLOCKING_CODES = ['Dangling'];

/**
 * FAIL 清单 → { degradable, blocking } 分级（单一来源，禁各调用点各写一份判据）。
 * @param {Array} fails runAcceptanceChecks 的 fails（{code, detail, file?, files?}）
 * @returns {{degradable: Array, blocking: Array}}
 */
export function classifyAcceptanceFails(fails) {
  const list = Array.isArray(fails) ? fails.filter(Boolean) : [];
  const degradable = [];
  const blocking = [];
  for (const f of list) {
    const code = String(f?.code ?? '');
    if (DELIVERABLE_DEGRADABLE_CODES.includes(code)) degradable.push(f);
    else blocking.push(f); // 含 Dangling 与所有未登记码
  }
  return { degradable, blocking };
}

/**
 * 可降级 FAIL → 交付警告清单（一次性列出待补内容，供任务记录/UI/日志三处共用同一份文本）。
 * 文本来源只取判据自带的**真值**（C1b.missingLabels 的原始文本），不做任何语义推测。
 * @param {Array} fails classifyAcceptanceFails().degradable
 * @returns {{codes: string[], missingTexts: string[], items: Array<{code: string}>, text: string}}
 */
export function formatDeliveryWarnings(fails) {
  const list = Array.isArray(fails) ? fails : [];
  const codes = [];
  for (const f of list) {
    const c = String(f?.code ?? '');
    if (c && !codes.includes(c)) codes.push(c);
  }
  // 待补文本：C1b 的 missingLabels（真值原文，去重、保序、上限 30 条防刷屏）
  const missingTexts = [];
  for (const f of list) {
    if (!Array.isArray(f?.missingLabels)) continue;
    for (const lb of f.missingLabels) {
      const t = String(lb?.text ?? '').trim();
      if (t && !missingTexts.includes(t)) missingTexts.push(t);
    }
  }
  const shown = missingTexts.slice(0, 30);
  const parts = [];
  if (shown.length > 0) {
    parts.push(
      `以下 ${missingTexts.length} 处真值文本尚未物化，可进入编辑器补全：` +
        shown.map((t) => `「${t}」`).join('、') +
        (missingTexts.length > shown.length ? ` 等 ${missingTexts.length} 处` : ''),
    );
  }
  // 🛡️ 「缺标题」显式提示（用户明确保留项）：标题是阅读入口，缺失必须点名而非埋在代码里
  if (codes.includes('G-SLOT')) {
    parts.push('面板标题未挂载（#title-left 插槽为空）⇒ 标题缺失，须在 index.vue 挂入标题内容');
  }
  if (parts.length === 0) parts.push('存在结构性缺失项（详见任务详情 FAIL 清单）');
  return {
    codes,
    missingTexts,
    items: list.map((f) => ({ code: String(f?.code ?? ''), detail: String(f?.detail ?? '') })),
    text: parts.join('；'),
  };
}

export function formatAcceptanceGuidance(fails) {
  if (!Array.isArray(fails) || fails.length === 0) return '';
  const lines = fails.map((f, i) => `${i + 1}. [${f.code}] ${f.detail}`);
  const hasTabFail = fails.some((f) => f.code === 'G1-v2');
  const hasBgOwnerFail = fails.some((f) => f.code === 'E3-v4');
  // 🛡️ A1-H 高度配方（2026-11-12 · e429decb 实锤）：真值小段被弹性 grow 拉高的唯一正确修法
  const hasHeightRatioFail = fails.some((f) => f.code === 'A1-H');
  const heightRatioRecipe = hasHeightRatioFail
    ? [
        '',
        '【A1-H 高度比例修复规则（确定性改法，禁止重新调大 grow）】',
        '1. 凡 FAIL 指出「真值高度仅 Xpx（占比 Y%）却写了 flex: N 1 0」的段：',
        '   将其 CSS 中的 `flex: N 1 0; min-height: 0;` 整体替换为 `flex: 0 0 auto;`（高度由内容自然撑开）。',
        '2. 禁止把像素高度写进 grow（如 flex: 120 1 0），也禁止改用 height:100% / position:absolute 拉满父容器。',
        '3. 若该段在真值中只是行内小元素（图标/标签），其内容应与同行的相邻元素横向并排，而不是纵向占满。',
      ].join('\n')
    : '';
  // 🛡️ G2 修复模板（2026-11-12 · c97b7008 实锤）：接线对齐的两种合法形态逐条给出
  const propContractRecipe = fails.some((f) => f.code === 'G2')
    ? [
        '',
        '【G2 props 契约修复模板（父子两端必须对齐，禁止各写各的）】',
        '形态①（推荐，改父组件传参对齐子组件声明）：',
        '  子组件已声明 defineProps({ tableRows: { type: Array, default: () => [] } })',
        '  ⇒ 父组件必须写 <DeviceInfoGroup :table-rows="attributeList" />（:table-rows ⇔ tableRows）',
        '形态②（改子组件声明对齐父组件传参）：',
        '  父组件已写 <DeviceInfoGroup :attribute-list="attributeList" />',
        '  ⇒ 子组件必须声明 defineProps({ attributeList: { type: Array, default: () => [] } })',
        '对齐后子组件模板中引用的 props 名也必须同步改名，确保运行时真实渲染。',
      ].join('\n')
    : '';
  // 🛡️ 硬约束配方（2026-11-11 · b7d38dc3/c4b057c9 两连败）：自然语言规则执行率 0/2，
  //   改为逐条可照抄的代码形态（数据来自 mapping targetDomSelector/figmaBox 真值）。
  const hardRecipeLines = [];
  for (const f of fails) {
    if (f.code !== 'E3-v4' || !Array.isArray(f.hardConstraints)) continue;
    for (const hc of f.hardConstraints) {
      const size =
        hc.width && hc.height ? ` style="width:${hc.width}px;height:${hc.height}px;"` : '';
      hardRecipeLines.push(
        `必须存在容器：<div data-section-id="${hc.targetDomSelector.match(/"([^"]+)"/)?.[1] || ''}"${size} 且 :style="backgroundImage:url(<${hc.fname} 的 import 变量>)">`,
      );
      hardRecipeLines.push(`  import 路径：import bgX from '${hc.importPath}'（变量名任意，须在该容器上消费）`);
    }
  }
  const bgOwnerRecipe = hasBgOwnerFail
    ? [
        '',
        '【E3-v4 背景归属硬约束（逐条照抄落地，禁止改挂祖先容器）】',
        ...hardRecipeLines,
        '',
        '【E3-v4 背景归属修复规则（按此形态改，禁止只缩样式糊过去）】',
        '1. 每条失败均给出「资源文件 → 应挂的 data-section-id」及该节点真值尺寸（宽×高）。',
        '2. 在模板中为该 id 建（或改用）承载容器，并把背景挂在该容器自身的 :style 上：',
        '   <div :data-section-id="\'应挂id\'" :style="{ backgroundImage: \'url(\' + bgX + \')\', backgroundSize: \'100% 100%\', backgroundRepeat: \'no-repeat\' }">',
        '3. bgX 必须 import 自 resources/images/<资源文件>，且只在该归属容器上消费。',
        '4. 严禁把该背景挂到祖先容器：祖先段尺寸远大于该资源原始尺寸，会整体拉伸变形。',
        '5. 归属容器的宽高必须按真值尺寸（宽×高）显式设定，不得由父容器 100% 撑开。',
      ].join('\n')
    : '';
  // 🛡️ E2-v3 前景配方（2026-11-12 · a3529d83/828c281a/84dc4bdf 三连拒实锤）：image/icon
  //   零消费修复轮缺定位信息 ⇒ LLM 拿别的资源顶包（如 icon-123 顶 icon-8036）→ 复检仍
  //   FAIL → 拒交付。逐条给可照抄 <img> 挂载配方（数据来自 mapping ownerSectionId/
  //   recommendedUsage/figmaBox 真值），并明令禁止顶包。
  const fgRecipeLines = [];
  for (const f of fails) {
    if (f.code !== 'E2-v3' || !Array.isArray(f.hardConstraints)) continue;
    for (const hc of f.hardConstraints) {
      const size =
        hc.width && hc.height ? ` style="width:${hc.width}px;height:${hc.height}px;object-fit:contain"` : '';
      const at = hc.ownerSectionId
        ? `（挂在归属段 [data-section-id="${hc.ownerSectionId}"] 内部）`
        : '（挂在所属组件根容器内部）';
      const selHint = hc.selector && /^\./.test(hc.selector.trim())
        ? `，容器 class 用「${hc.selector.trim().replace(/^\./, '')}」`
        : '';
      fgRecipeLines.push(
        // 🛡️ A6-c′（2026-11-12）：显式点名**承载文件**——修复轮每个 chunk 都收到本全局配方，
        //   不给文件名时 LLM 会把资源挂到当前正在改的任意文件（真机旧版 10/10 落到 index.vue
        //   的错因即由此放大）。逐条标注目标文件后，LLM 只在对应组件内落位。
        `【写入 ${hc.carrierFile || 'package/index.vue'}】<img :src="${hc.fname.replace(/[^\w]/g, '_').replace(/^_+|_+$/g, '')}"${size} /> ${at} —— import 路径：import X from '${hc.importPath}'（推荐用途 ${hc.usage}）`,
        // 🛡️ 4bed3cd6 实锤：归属段常未被产物建模（801:3 不存在）⇒ 配方必须带「先建宿主」
        //   指令，否则 LLM 无处可挂只能顶包/放弃（与 E3-v4「建（或改用）承载容器」同语义）。
        `  若产物中不存在 [data-section-id="${hc.ownerSectionId || ''}"]：在 ${hc.carrierFile || '该组件文件'} 内、其真值父段（或最接近的已建祖先段）范围内新建承载容器 <div data-section-id="${hc.ownerSectionId || ''}"${selHint}> 再挂该 <img>，禁止因段缺失而放弃或换图，禁止改写到其它 .vue`,
      );
    }
  }
  const fgRecipe =
    fgRecipeLines.length > 0
      ? [
          '',
          '【E2-v3 前景资源挂载配方（逐条照抄落地，严禁用其他资源顶包/省略）】',
          ...fgRecipeLines,
          '要求：每条资源的 import 变量必须真实出现在模板 <img :src> 上（v-if 包裹也算消费）；',
          '该资源原文件必须被 import——不得改用别的图片文件替代。',
          '🛡️ 卡类形态补充（f3543604 实锤）：若卡片数据是 v-for 数组（如 statItems/statCards），',
          '每个数据项的 icon 字段必须逐一赋对应资源 import 变量——严禁只给一张卡挂 icon、',
          '其余卡 icon 字段留空（v-if 会静默不渲染 ⇒ 图标消失），严禁多卡共用同一资源顶包。',
        ].join('\n')
      : '';
  const tabRecipe = hasTabFail
    ? [
        '',
        '【G1-v2 交互修复模板（照此形态改写 tab 承载组件）】',
        '<script setup> 部分：',
        "  const tabs = [{ key: 'a', label: '标签A' }, { key: 'b', label: '标签B' }]",
        "  const activeTab = ref('a')",
        '  const handleTabChange = (key) => { activeTab.value = key }',
        '<template> 部分（tab 容器内，每个项必须绑 @click 与激活态）：',
        '  <div v-for="t in tabs" :key="t.key" @click="handleTabChange(t.key)"',
        '    :style="activeTab === t.key ? activeStyle : normalStyle">{{ t.label }}</div>',
        '  要求：点击切换 activeTab；激活项背景色与非激活项必须不同。',
      ].join('\n')
    : '';
  // 🛡️ C1-DUP 修复配方（828c281a 实锤）：修复轮只动非接管文件——接管文件有终裁
  //   覆写自愈，LLM 对它的修改必被回滚，指导语必须显式禁止。
  const hasDupFail = fails.some((f) => f.code === 'C1-DUP');
  // 🛡️ 逐条归属行（fbd77192 实锤）：keeper 由「接管类名」或「真值几何归属」确定性给出时，
  //   直接写明「保留哪个文件 / 从哪个文件删哪一块」——旧规则③（保留带段锚者）在两文件
  //   都带段锚时不可判定，修复轮只能猜。
  const dupOwnerLines = [];
  for (const f of fails) {
    if (f.code !== 'C1-DUP' || !Array.isArray(f.dupRenders)) continue;
    for (const d of f.dupRenders) {
      if (!d.keeper) continue;
      const why =
        d.keeperBy === 'geometry'
          ? `真值节点几何落在该文件的 data-section-id="${d.ownerSectionId}" 段内`
          : '该类名承担确定性接管（终裁覆写自愈，不得改动）';
      dupOwnerLines.push(
        `- 「${d.label}」：保留 ${d.keeper}（${why}）；从 ${d.dupFiles.join('、')} 中删除该文本的整块渲染（<span>/<div>/常量+v-for 一起删）`,
      );
    }
  }
  const dupRecipe = hasDupFail
    ? [
        '',
        '【C1-DUP 重复渲染修复规则（照此执行，禁止两份都保留）】',
        ...(dupOwnerLines.length > 0
          ? ['0. 逐条归属（已由判据确定性确定，照此执行，禁止自行选择保留哪份）：', ...dupOwnerLines]
          : []),
        '1. 每条失败：同一真值文本在多个组件中渲染。若存在类名含 fg-regions/fg-grid/fg-kvgrid/fg-header 等的确定性接管组件，以它为准（禁止改动/删除它）。', // eslint-disable-line
        '2. 从 files 所列的普通组件中删除该文本的重复渲染块（整个 <span>/<div>/常量+v-for 块一起删），保留文件其余内容与其它文本。',
        '3. 若不存在接管组件：保留带 data-section-id 段锚的组件中的那份，删除其余文件中的重复块。',
        '4. 禁止用 v-if=false、display:none 等隐藏方式糊过去，必须物理删除重复渲染块。',
      ].join('\n')
    : '';
  // 🛡️ C1b 配方（fbd77192 实锤）：只给「N 个标签缺席」的描述 ⇒ 修复轮 1 轮空转、复检仍 FAIL。
  //   实测产物形态：子组件声明 defineProps({ vendorRows: { type: Array, default: () => [] } })
  //   而父组件零传参 ⇒ v-for 遍历空数组 ⇒ 整组标签不物化；而段身份契约里真值文案本就下发过
  //   （contractTruths=20）⇒ LLM 自行改成 props 占位。配方必须逐字给出真值条目并要求拆掉
  //   空 props 依赖，否则「照抄」无处可抄。
  const c1bGroups = [];
  for (const f of fails) {
    if (f.code !== 'C1b' || !Array.isArray(f.missingLabels)) continue;
    const byKey = new Map(); // `${file}|${sectionId}` → items[]
    for (const it of f.missingLabels) {
      const key = `${it.file || ''}|${it.sectionId || ''}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(it);
    }
    for (const [key, items] of byKey) {
      const [file, sectionId] = key.split('|');
      c1bGroups.push(
        `- 段${sectionId ? ` [data-section-id="${sectionId}"]` : ''} → ${file || '（未定位到承载文件）'}`,
        '  本段真值条目（顺序即 Figma 顺序；text/count 逐字照抄，禁止改写、翻译、补造）：',
        '  const rows = [',
        ...items
          .slice(0, 40)
          .map((it) => `    { name: '${it.text}', count: '${it.count || ''}' },`),
        '  ]',
      );
      if (items.length > 40) c1bGroups.push(`  （另有 ${items.length - 40} 条，按同一规则续写）`);
    }
  }
  const c1bRecipe =
    c1bGroups.length > 0
      ? [
          '',
          '【C1b 真值标签缺席修复配方（逐条照抄落地，禁止留空数组/空 props/空 span）】',
          ...c1bGroups,
          '落地规则：',
          '1. 删除该文件里 `defineProps` 的**空默认数组/对象**（如 `vendorRows: { type: Array, default: () => [] }`）——父组件零传参时它就是空渲染源；改用上面 `rows` 本地常量。',
          '2. 若父组件确实传参，则把 `rows` 定义在父文件并作为实参传入（`:vendor-rows="rows"`），子组件 `defineProps` 保留。',
          '3. `v-for` 沿用现有结构渲染 `rows`：一维直接用；模板已是二维行数组时按现有列数（读 `grid-template-columns: repeat(N, …)` 的 N）每 N 条切一行。',
          '4. 禁止用占位文案（`标签1`）、`v-if="false"`、`display:none`、空 `<span>` 掩盖缺席——必须真实渲染上面每一条。',
        ].join('\n')
      : '';
  // 🛡️ 防线2 配方（2026-11-12 · mc-max-1794452025496-3d081117 实锤）：C1b/C1b 缺席或 A1-v2
  //   命中率 <50% 属**整块承载未生成**（非「容器在、少几条」）⇒「补标签文本」级指令无从落地，
  //   修复轮 1 轮空转、复检仍 FAIL（E2-v3/G-SLOT/C1b 三连拒交付）。
  //   判据（可辩驳、单一来源）：① C1b 缺席标签合计 ≥3 条；② 任一段 A1-v2 真值文本命中率 <50%。
  //   命中 ⇒ 指令升级为「按真值补建承载组件/承载容器」：先建承载（含未定位到承载文件的新建），
  //   再按真值顺序逐条落条目；禁止只挑缺失的那几条、禁止 defineProps 空默认当唯一渲染源。
  const c1bMissingTotal = fails
    .filter((f) => f.code === 'C1b' && Array.isArray(f.missingLabels))
    .reduce((n, f) => n + f.missingLabels.length, 0);
  const a1v2Fails = fails.filter((f) => f.code === 'A1-v2');
  const buildCarrierSegments = []; // { sectionId, sectionName, file, truths[] }
  for (const f of a1v2Fails) {
    buildCarrierSegments.push({
      sectionId: f.sectionId || '',
      sectionName: f.sectionName || '',
      file: f.file || '',
      truths: Array.isArray(f.truthTexts) ? f.truthTexts : [],
    });
  }
  // C1b 分段汇总（同一 段×文件 聚合），与 c1bRecipe 同源口径（file|sectionId）
  for (const f of fails) {
    if (f.code !== 'C1b' || !Array.isArray(f.missingLabels)) continue;
    const byKey = new Map();
    for (const it of f.missingLabels) {
      const key = `${it.file || ''}|${it.sectionId || ''}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(it);
    }
    for (const [key, items] of byKey) {
      const [file, sectionId] = key.split('|');
      buildCarrierSegments.push({
        sectionId,
        sectionName: '',
        file,
        truths: items.map((it) => `${it.text}${it.count ? ` ${it.count}` : ''}`),
      });
    }
  }
  const buildCarrierTriggered = needsCarrierRebuild(fails);
  const buildCarrierLines = [];
  for (const seg of buildCarrierSegments) {
    const sid = seg.sectionId ? `[data-section-id="${seg.sectionId}"]` : '（段锚未定）';
    const nameSuffix = seg.sectionName ? `（${seg.sectionName}）` : '';
    buildCarrierLines.push(
      `- 段 ${sid}${nameSuffix} → 承载文件：${seg.file || '（未定位到承载文件 ⇒ 整块未生成）'}`,
      '  本段真值条目（顺序即 Figma 顺序；逐字照抄，禁止改写/翻译/补造；**禁止只挑缺失的几条**）：',
      ...seg.truths.slice(0, 40).map((t) => `    '${t}'`),
    );
    if (seg.truths.length > 40) buildCarrierLines.push(`  （另有 ${seg.truths.length - 40} 条，按同一规则续写）`);
  }
  const buildCarrierRecipe =
    buildCarrierTriggered && buildCarrierLines.length > 0
      ? [
          '',
          '【防线2 · 承载组件补建配方（大面积缺席 ⇒ 先建承载、再落真值；禁止只补标签）】',
          `触发依据：真值整块承载未生成（C1b 缺席 ${c1bMissingTotal} 条${a1v2Fails.length ? `；A1-v2 段命中率<50% × ${a1v2Fails.length}` : ''}）。只往现有空容器塞标签无效，必须先补齐「承载」。`,
          '逐段执行：',
          ...buildCarrierLines,
          '每段落地三步（缺一不可）：',
          '  ① 承载不存在（如上标「整块未生成」）⇒ 新建承载：在同目录新建 `<段名>.vue`（或直接在 index.vue 内建 `<section data-section-id="段id">`），并在 index.vue 按 Figma 顺序 import + 组装/注册。',
          '  ② 承载存在但为空壳（仅段锚 + 空 props/占位/空 span）⇒ 就地重建该段完整结构，不要只改局部。',
          '  ③ 在承载容器内按真值顺序逐条渲染（把上面条目写成常量数组 + v-for），**必须全部落**，不是只补 detail 里点名的那几条。',
          '硬约束（逐条必须满足，违反即复检 FAIL）：',
          '  1. 产物中必须真实存在 `<容器 data-section-id="段id">` 且其内包含上述全部真值文本。',
          '  2. 禁止 defineProps 的空默认数组/对象作为唯一渲染源（父组件零传参 ⇒ 整块空渲染）——改用本地常量数组。',
          '  3. 禁止占位文案、v-if="false"、display:none、空 <span> 掩盖缺席；必须真实渲染。',
          '  4. 段间顺序、段内条目顺序必须与真值一致（Figma 顺序）。',
        ].join('\n')
      : '';
  // 🛡️ D1/D3/D-GRID 分组结构配方（2026-11-12 · cc6334 实锤）：三张分组卡被合并成一个网格、
  //   列数靠 flex 自适应、并排统计卡被竖排 —— 自然语言描述执行率低，给可照抄形态。
  const hasGroupStructureFail = fails.some((f) => GROUP_STRUCTURE_CODES.includes(f.code));
  const groupStructureRecipe = hasGroupStructureFail
    ? [
        '',
        '【D1/D3/D-GRID 分组结构修复配方（逐组照抄，禁止合并）】',
        '形态①（推荐 · 分组数据驱动，标题逐组渲染）：',
        '  const groups = [',
        "    { id: 'g1', title: '战略合作厂商', bg: 'rgba(...)', items: [...] },",
        "    { id: 'g2', title: '优质厂商',     bg: 'rgba(...)', items: [...] },",
        "    { id: 'g3', title: '普通厂商',     bg: 'rgba(...)', items: [...] },",
        '  ]',
        '  <section v-for="g in groups" :key="g.id" class="group-card" :class="`group-${g.id}`">',
        '    <div class="group-hd"><img :src="g.icon" /><span>{{ g.title }}</span></div>',
        '    <div class="group-grid">',
        '      <div v-for="it in g.items" :key="it.name" class="vendor-card">…</div>',
        '    </div>',
        '  </section>',
        '  .group-grid { display: grid; grid-template-columns: repeat(K, ITEM_W px); column-gap: GAPpx; row-gap: GAPpx; }',
        '形态②（每组一个子组件文件）：GroupA.vue / GroupB.vue / GroupC.vue，各自 header+grid，index.vue 顺序组装。',
        // 🔴 2026-11-12（mc-max-1794461199581-253def62 实锤）：统计卡段（真值 2 列）被写成
        //   `<div style="display:grid;grid-template-columns:repeat(2,1fr)" v-for=...>` ——
        //   grid **写在被重复的卡上**，每张卡各自成了 2 列网格，宿主容器反而没有网格
        //   ⇒ D-GRID「数不出列数」FAIL。配方必须显式点名这个错法与正确形态。
        '形态③（统计卡行 · N 张横向卡）：',
        '  <div class="stat-row">                         ← 宿主容器：grid 只写这里',
        '    <div v-for="it in stats" :key="it.label" class="stat-card">  ← 卡：flex，禁止 grid',
        '      <img :src="it.icon" class="stat-icon" />',
        '      <div class="stat-text">',
        '        <span class="stat-value">{{ it.value }}</span>',
        '        <span class="stat-label">{{ it.label }}</span>',
        '      </div>',
        '    </div>',
        '  </div>',
        '  .stat-row  { display: grid; grid-template-columns: repeat(K, minmax(0, 1fr)); column-gap: GAPpx; }',
        '  .stat-card { display: flex; flex-direction: row; align-items: center; gap: 8px; }',
        '  .stat-text { display: flex; flex-direction: column; }',
        '硬约束（逐条必须满足）：',
        '  1. 真值有几个分组标题，产物就必须有几处标题文本（禁止只保留第一个）。',
        '  2. 每组保留自己的底框样式与分组图标（bgColor/icon 真值逐组用，不许共用首组）。',
        '  3. 网格列数必须显式写 repeat(K, …)（K 取自该段 gridColumns），禁止 display:flex 平铺靠内容自适应。',
        '  4. y 相同、x 相邻的兄弟段（并排卡）必须包在同一层 flex-direction:row 容器内，各段 flex:1 1 0。',
        '  5. 🔴 v-for 场景：grid-template-columns 只能写在 **v-for 的宿主容器**上；被重复的那个元素上',
        '     禁止再声明 display:grid / grid-template-columns（每张卡各自成网格 = 列数不可证明 = D-GRID FAIL）。',
        '  6. 🔴 卡内同时有「图标 + 数值 + 标签」时：卡容器用 flex-direction:row，文本侧再包一层',
        '     flex-direction:column（数值/标签按真值顺序），禁止把三块平铺成 grid 或全塞进同一行。',
      ].join('\n')
    : '';
  return [
    '以下问题由组件验收判据实测命中，修复时必须逐条消除（禁止跳过/绕过）：',
    ...lines,
    tabRecipe,
    bgOwnerRecipe,
    fgRecipe,
    propContractRecipe,
    dupRecipe,
    c1bRecipe,
    buildCarrierRecipe,
    heightRatioRecipe,
    groupStructureRecipe,
    // 🛡️ G-SLOT 配方（f3543604 实锤）：标题已剥 ⇒ 必须挂回外壳 title-left
    fails.some((f) => f.code === 'G-SLOT')
      ? [
          '',
          '【G-SLOT 外壳标题装配配方（照此形态改 index.vue）】',
          '<template> 根内 base-panel 下追加：',
          '  <template #title-left>',
          '    <div class="...-header-left"><span class="...-title">面板标题文本（取自 declare.attribute.title）</span></div>',
          '  </template>',
          '要求：标题文本必须逐字等于 declare.json attribute.title；禁止把标题留在 default 内容区（外壳会重复渲染）。',
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
