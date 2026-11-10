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
 *   G1-v2 交互     真值 name=/tab/i 段承载文件无 @click+切换绑定 ⇒ FAIL（2:7954 实锤）
 *   Dangling 悬空  index import 的本地 .vue 缺失（复用 collectMissingVueImports 单一来源）
 *   D2 文本重叠    消费方传入 runtime 采集的 overlaps（RUNTIME-016 同源），本模块不重复渲染
 */
import { collectMissingVueImports } from '../vue-import-closure.js';

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
  const allVue = entries.map(([, c]) => c).join('\n');

  // ── A1-v2 / G1-v2：Figma 真值结构判据 ──────────────────────────────
  if (input.figmaNodeData && typeof input.figmaNodeData === 'object') {
    for (const n of collectNodes(input.figmaNodeData)) {
      const name = String(n?.name || '').toLowerCase();
      const id = String(n?.id || '');
      checked += 1;

      if (BUSINESS_SEGMENT_NAMES.test(name)) {
        // A1-v2：真值段 TEXT 逐条命中，命中率 <50% ⇒ 段缺失
        const texts = textsOf(n);
        if (texts.length > 0) {
          const hit = texts.filter((t) => allVue.includes(t)).length;
          const rate = hit / texts.length;
          if (rate < 0.5) {
            const missed = texts.filter((t) => !allVue.includes(t)).slice(0, 3).join('/');
            fails.push({
              code: 'A1-v2',
              detail: `段 ${id}（${n.name}）文本命中率 ${(rate * 100).toFixed(0)}%（${hit}/${texts.length}），缺失如「${missed}」`,
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
        identifyNodeRole(n.name) === 'business'
      ) {
        // G1-v2：tab 段承载必须有交互绑定（id 精确 → 段首文本 两级匹配）
        let carrier = entries.find(([, c]) => c.includes(`data-section-id="${id}"`));
        if (!carrier) {
          const firstText = textsOf(n).find((t) => t.length >= 2);
          if (firstText) carrier = entries.find(([, c]) => c.includes(firstText));
        }
        if (!carrier) {
          fails.push({ code: 'G1-v2', detail: `tab 段 ${id}（${n.name}）在产物中无承载` });
        } else {
          const c = carrier[1];
          const hasClick = /@click/.test(c);
          const hasSwitch = /handleTabChange|active/i.test(c);
          if (!hasClick || !hasSwitch) {
            fails.push({
              code: 'G1-v2',
              detail: `tab 段 ${id} 承载于 ${carrier[0].split('/').pop()} 但无切换绑定（@click/handleTabChange/active 缺失）`,
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

  return { fails, warns, checked };
}

/** FAIL 清单 → 定向修复指导文本（回灌 L0-B retryGuidance 用） */
export function formatAcceptanceGuidance(fails) {
  if (!Array.isArray(fails) || fails.length === 0) return '';
  const lines = fails.map((f, i) => `${i + 1}. [${f.code}] ${f.detail}`);
  const hasTabFail = fails.some((f) => f.code === 'G1-v2');
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
  ]
    .filter(Boolean)
    .join('\n');
}
