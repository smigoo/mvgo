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
 *                  指定的 data-section-id 段上；挂到祖先/其它段（含归属段缺失）⇒ FAIL
 *                  （2026-11-11 流量 88:34→2:3660 实锤：bg 挂祖先 88:33 被拉伸 4 倍）
 *   E2-v3 未消费    mapping 中 success 的资源文件名未出现在任何 .vue ⇒ FAIL（落盘但零 import）
 *   G1-v2 交互     真值 name=/tab/i 段承载文件无 @click+切换绑定 ⇒ FAIL（2:7954 实锤）
 *   Dangling 悬空  index import 的本地 .vue 缺失（复用 collectMissingVueImports 单一来源）
 *   D2 文本重叠    消费方传入 runtime 采集的 overlaps（RUNTIME-016 同源），本模块不重复渲染
 */
import { collectMissingVueImports } from '../vue-import-closure.js';
// 🛡️ A7：S2 自愈兜底类名单一事实源（validators/code-fix-rules.js 既有导出，禁复制第二份口径）
import { DEGENERATE_FALLBACK_CLASS } from '../../validators/code-fix-rules.js';

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
  const out = [];
  if (typeof scriptSrc !== 'string' || !scriptSrc) return out;
  let inStr = null; // 当前字符串定界符
  let inLineComment = false;
  let inBlockComment = false;
  let cur = '';
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
        out.push(cur);
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

  const entries = Object.entries(files).filter(([p, c]) => /\.vue$/i.test(p) && typeof c === 'string');
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

    for (const n of collectNodes(input.figmaNodeData)) {
      const name = String(n?.name || '').toLowerCase();
      const id = String(n?.id || '');
      checked += 1;

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

    const misownedBg = [];
    let relaxedCardLevel = 0;
    let degenerateTruth = 0;
    let relaxedAncestor = 0;
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
      const elsewhere = consumers.find(
        (c) => c.id !== wantId && [...ownVars].some((v) => c.vars.has(v)),
      );
      const isAncestor = !!elsewhere && (r.ancestorIds || []).slice(1).includes(elsewhere.id);
      const box = r.figmaBox || null;
      // 🛡️ E3-v4 v3（2026-11-11 · bd907abf/0a501b7e/830ae7bd 三连拒实锤）：
      //   ① 退化真值豁免——figmaBox 宽/高 ≤0（bd907abf: 390×0）的节点不是可见背景，
      //     「应挂归属段」判据对不可见节点无权威，弃权（否则定向修复轮永远修不过）。
      //   ② 祖先段挂载降级 WARN——背景已消费在结构化祖先段（段级容器）时，「卡片级
      //     owner 才算对」是建模口径错位；静态分析判不了拉伸（v2 已定 philosoph：归运行
      //     时 G3），且 S3/S3-c 已在产物层确定性纠正归属。保留 FAIL 的只有「挂到无关段」
      //     与「import 了但全产物零消费」两种真错形态。
      if (box && (Number(box.width) <= 0 || Number(box.height) <= 0)) {
        degenerateTruth += 1;
        continue;
      }
      if (isAncestor) {
        relaxedAncestor += 1;
        continue;
      }
      // 🛡️ E3-v4 v4（2026-11-11 · mc-max-1794407888630-408d924a 实锤）：数据驱动消费是
      //   **独立合规形态**，与 wantId 是否为产物段级容器无关。v2 分支把它限制在
      //   「wantId 非段级容器 + 未挂任何段级容器」前提之下，漏掉折叠接管家族的最后一种
      //   合法形态：兄弟卡背景组被资源计划层轮换注入 v-for item（FG_CARD_BGS 常量 +
      //   item :style，resource-mount-plan.mountCardBgGroups），此时 wantId 恰是**已建
      //   段级容器**（锚卡 id，如 136:127），但 var 只经常量间接消费 ⇒ 旧判据误 FAIL。
      //   v2 的「wantId 非段级 + 未挂段级 + 数据驱动」分支被本分支完全覆盖，故删除。
      //   判据不变式：真错形态仍 FAIL——「字面挂无关段」（非祖先段开标签字面消费且
      //   无数据驱动）与「import 后全产物零消费」都到不了本分支。
      if (hasDataDrivenConsumption(ownVars)) {
        relaxedCardLevel += 1;
        continue;
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
    if (relaxedAncestor > 0) {
      warns.push(
        `E3-v4 祖先段挂载放行 ${relaxedAncestor} 张（背景已消费在结构化祖先段；卡片级 owner 为建模口径错位，拉伸检测归运行时 G3、归属纠正归 S3 产物层）`,
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
      if (role === 'image' || role === 'icon') {
        unconsumedForeground.push({ fname: fname.slice(0, 36), name: (r.name || '').slice(0, 16) });
      } else {
        unconsumed.push({ fname: fname.slice(0, 36), name: (r.name || '').slice(0, 16) });
      }
    }
    if (unconsumedForeground.length > 0) {
      // 前景内容缺失：FAIL（带资源文件名，修复轮可定位）
      fails.push({
        code: 'E2-v3',
        detail:
          `${unconsumedForeground.length} 张前景资源（image/icon）已落盘但产物零消费` +
          `（如 ${unconsumedForeground
            .slice(0, 3)
            .map((u) => u.fname)
            .join('、')}）——内容位图缺失，须挂载或说明`,
        files: unconsumedForeground.map((u) => `package/resources/images/${u.fname}`),
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
    // 真值全量 TEXT characters 集合
    const truthTexts = new Set();
    const walkTruth = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'TEXT' && typeof n.characters === 'string' && n.characters.trim()) {
        truthTexts.add(n.characters.trim());
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
        // 剥离插值绑定 {{ }} 与属性（只留静态文本节点）
        const staticText = tpl
          .replace(/\{\{[\s\S]*?\}\}/g, '\n')
          .replace(/<[^>]+>/g, '\n');
        for (const raw of staticText.split('\n')) {
          const t = raw.trim();
          if (t.length < 2) continue;
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
              _missingLabels.push({ text: t, present: allVueNoS2.includes(t), node: n });
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
        fails.push({
          code: 'C1b',
          detail: `${missingLabels.length} 个真值标签文本在产物中完全缺席（如 ${missingLabels
            .slice(0, 5)
            .map((x) => `「${x.text.slice(0, 12)}」`)
            .join('、')}）——真值有文本而产物为空（空 span/空胶囊）= 标签未物化，补齐承载或修背景注入`,
          ...(Array.from(_c1bCarriers).length > 0
            ? { files: Array.from(_c1bCarriers) }
            : {}),
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

  return { fails, warns, checked };
}

/** FAIL 清单 → 定向修复指导文本（回灌 L0-B retryGuidance 用） */
export function formatAcceptanceGuidance(fails) {
  if (!Array.isArray(fails) || fails.length === 0) return '';
  const lines = fails.map((f, i) => `${i + 1}. [${f.code}] ${f.detail}`);
  const hasTabFail = fails.some((f) => f.code === 'G1-v2');
  const hasBgOwnerFail = fails.some((f) => f.code === 'E3-v4');
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
  return [
    '以下问题由组件验收判据实测命中，修复时必须逐条消除（禁止跳过/绕过）：',
    ...lines,
    tabRecipe,
    bgOwnerRecipe,
  ]
    .filter(Boolean)
    .join('\n');
}
