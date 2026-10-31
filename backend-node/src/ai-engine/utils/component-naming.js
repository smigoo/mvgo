/**
 * 组件语义命名公共工具（2026-09-04）
 *
 * 背景：figma/截图生成组件此前 componentId 有两套坏格式——
 *   - max 管线：LLM 自由发挥 englishId（c-monitor）撞名后 workspace 目录被 resolveUnique
 *     追加 -2/-27（目录≠declare 内容、不可追溯）
 *   - lite 管线：整段 sessionId（mc-lite-1788... / 无 c- 前缀）当 componentId
 * 统一为确定性格式：`c-<语义段>-<sessionId 尾 8 hex>`（如 c-monitor-43e7fe45）。
 * 语义段可复用（monitor），尾 8 hex 保证唯一且可追溯回 sessionId。
 *
 * 解耦原则（重要）：
 *   declare.componentId / workspace 目录 / DB componentId 用「带尾段完整 id」；
 *   CSS class 前缀（CODE-003 事实源）与 onload 事件 id 用 classPrefixOf(id) 的
 *   「剥离尾段短前缀」（如 c-monitor），避免 LLM 生成的 .c-monitor-root 与
 *   c-monitor-43e7fe45 误判缺前缀 / 事件二次叠加。
 *
 * 本模块为纯 ESM .js（node 直接执行），被 ai-engine .js 模块与 tsc .ts 服务层共用。
 */

/** 中文业务词 → 语义英文 token 映射（长词优先，顺序敏感） */
export const ZH_SEMANTIC_RULES = [
  // —— 组合长词优先（先匹配先返回）——
  ['环境监测', 'env-monitor'],
  ['流量监测', 'traffic-monitor'],
  ['交通监测', 'traffic-monitor'],
  ['车辆监测', 'vehicle-monitor'],
  ['设备监测', 'device-monitor'],
  ['隧道监测', 'tunnel-monitor'],
  ['能耗监测', 'energy-monitor'],
  ['电力监测', 'power-monitor'],
  ['实时监测', 'realtime-monitor'],
  ['在线监测', 'online-monitor'],
  ['环境监控', 'env-monitor'],
  ['隧道交通', 'tunnel-traffic'],
  ['交通诱导', 'traffic-guidance'],
  ['供配电', 'power-distribution'],
  ['数据大屏', 'data-screen'],
  ['监控大屏', 'monitor-screen'],
  ['实时数据', 'realtime-data'],
  // —— 单词 ——
  ['监测', 'monitor'],
  ['监控', 'monitor'],
  ['诱导', 'guidance'],
  ['液位', 'liquid-level'],
  ['水位', 'water-level'],
  ['能见度', 'visibility'],
  ['风速', 'wind-speed'],
  ['风机', 'fan'],
  ['照明', 'lighting'],
  ['泵站', 'pump-station'],
  ['配电', 'power-distribution'],
  ['环境', 'env'],
  ['隧道', 'tunnel'],
  ['交通', 'traffic'],
  ['车辆', 'vehicle'],
  ['车流', 'traffic-flow'],
  ['设备', 'device'],
  ['流量', 'traffic'],
  ['告警', 'alert'],
  ['预警', 'warning'],
  ['报警', 'alarm'],
  ['能耗', 'energy'],
  ['电力', 'power'],
  ['气体', 'gas'],
  ['浓度', 'concentration'],
  ['温度', 'temperature'],
  ['湿度', 'humidity'],
  ['大屏', 'screen'],
  ['数据', 'data'],
  ['统计', 'stats'],
  ['趋势', 'trend'],
  ['图表', 'chart'],
  ['面板', 'panel'],
  ['概览', 'overview'],
  ['详情', 'detail'],
  ['列表', 'list'],
  ['实时', 'realtime'],
  ['在线', 'online'],
  ['工单', 'work-order'],
  ['巡检', 'inspection'],
  ['运维', 'ops'],
  ['首页', 'home'],
];

/** camelCase 拆分（DeviceList → Device-List），供 ASCII token 提取前预处理 */
function camelSplit(s = '') {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
}

/** kebab 清洗：仅保留 [a-z0-9-]，连续非法折叠为单 -，去首尾 - */
export function toKebab(s = '') {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * 中文名 → 语义英文 token（词表包含词映射）。未命中返回 null（由调用方兜底）。
 * 优先返回匹配规则中「最长中文包含词」的 token：遍历顺序即优先级（长词在前）。
 */
export function zhToSemanticEn(zh = '') {
  const n = String(zh || '').trim();
  if (!n) return null;
  for (const [kw, token] of ZH_SEMANTIC_RULES) {
    if (n.includes(kw)) return token;
  }
  return null;
}

/**
 * 从 displayName / figma 名 / 中文名提取语义 token（不含 c- 前缀）。
 * 优先级：ASCII 可读 token（如 env-overview、sales-trend）→ 中文词表映射 → fallbackToken → 'component'
 */
export function semanticTokenFrom({
  displayName = '',
  figmaName = '',
  zhName = '',
  fallbackToken = '',
} = {}) {
  const src = String(displayName || figmaName || zhName || '')
    .replace(/^(cp|mc|mv|page)-(\d{13}-)?/i, '')
    .trim();
  // 🛡️ 治本（2026-09-16 c-max-<ts>-<hex>-<hex> 实锤）：src 若仍含 13 位时间戳（如
  // "max-1789494573361-77f2ae7d"，即 LLM 把任务号 mc-max-... 当 componentName），说明这是
  // 任务号污染、不是语义段。与 semanticSegmentOf 的 /\d{13}/ 判空同源——此处判空返回 ''，
  // 让 sanitizeComponentId 走 fallbackToken 或保底 'component'，杜绝脏语义段进 componentId。
  if (/\d{13}/.test(src)) return '';
  // 1. ASCII token 提取（如 env-overview / sales-trend / data-card；先拆 camelCase）
  const asciiTokens = camelSplit(src).match(
    /[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*/g,
  );
  if (asciiTokens && asciiTokens.length) {
    const joined = toKebab(asciiTokens.join('-'));
    if (joined) return joined.slice(0, 32);
  }
  // 2. 中文词表映射
  const zhMapped = zhToSemanticEn(src);
  if (zhMapped) return zhMapped;
  // 3. fallbackToken（如用户显式名/derive 结果）清洗
  const fb = toKebab(fallbackToken);
  if (fb && !/\d{13}/.test(fb)) return fb.slice(0, 32);
  // 4. 保底
  return 'component';
}

/**
 * sessionId 尾 8 hex（mc-max-1788491328748-9abce496 → 9abce496）。
 * 无匹配返回 ''（由 buildComponentId 决定是否拼尾段）。
 */
export function tailHexOf(sessionId = '') {
  const m = String(sessionId || '').match(/([0-9a-f]{8})$/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * 🛡️ 2026-09-29 治本（mc-1790667029984-86d05609 实锤）：
 * 判定「该字符串其实是**任务号/sessionId**，不是组件语义名」。
 *
 * 事故：AI WorkSpace 对话里 LLM 调 `generate_from_figma` 时，把**上一个任务的
 * sessionId**（`mc-max-1790666569567-ddbcf714`）当成 `componentName` 传了进来。
 * 后果有两处，均源于本判据的缺失：
 *   ① `phase2.service.ts` 用它拼 temp 目录名 ⇒
 *      `mc-1790667029984-86d05609-mc-max-1790666569567-ddbcf714`
 *      （新任务被**嵌套**进旧任务目录），污染断点恢复 / 资源归属 / 预览 URL；
 *   ② 该脏名进 prompt 后，LLM 在容器上写了一个多出来的 class
 *      `c-mc-max-1790666569567-ddbcf714`（虽无对应 CSS 规则，但属脏产物）。
 *
 * 判据与 `semanticTokenFrom` **完全同源**（同一处 `/\d{13}/` 检查）：
 * 任务号必含 13 位毫秒时间戳，而**语义段不可能含 13 位连续数字**。
 * ⚠️ 刻意不写第二套更"精确"的正则 —— 同一事实两处各自命名必然失配（本仓血泪）。
 *
 * @param {string} name 待判定的名字（componentName / displayName / 目录名等）
 * @returns {boolean} true = 任务号污染，调用方应回退到 sessionId 或忽略该名
 */
export function isTaskIdLikeName(name = '') {
  const s = String(name || '').trim();
  if (!s) return false;
  return /\d{13}/.test(s);
}

/**
 * 🛡️ 2026-09-29 治本（mc-1790667029984-86d05609 实锤）：temp 产物目录名的**单一事实源**。
 *
 * 契约：`{sessionId}` 或 `{sessionId}-{componentName}`（后者仅在 componentName 是
 * 干净的语义名、且不等于 sessionId 时拼上，纯为可读性）。
 * temp 目录**必须**以任务 sessionId 开头 —— 断点恢复依赖该前缀精确关联任务产物。
 *
 * 历史缺陷：`phase2.service.ts` 直接拿 dto 的 `componentName` 拼目录名，而该字段来自
 * LLM 工具调用参数（不可信）⇒ LLM 传入上一个任务的 sessionId 时，目录名被拼成
 * `mc-1790667029984-86d05609-mc-max-1790666569567-ddbcf714` ⇒ **新任务被嵌套进旧任务
 * 目录**，破坏断点恢复 / 资源归属 / 预览 URL。
 *
 * @param {string} sessionId 本任务 sessionId（形如 mc-max-<ts>-<hex>）
 * @param {string} [componentName] 上游传入的组件名（可能被任务号污染）
 * @returns {string} 安全的目录名（恒以 sessionId 开头）
 */
export function resolveTaskFolderName(sessionId = '', componentName = '') {
  const sid = String(sessionId || '').trim();
  if (!sid) return '';
  // 任务号污染 ⇒ 视为「未提供组件名」，目录名退化为纯 sessionId
  const raw = isTaskIdLikeName(componentName)
    ? ''
    : String(componentName || '').trim();
  if (!raw || raw === sid) return sid;
  return `${sid}-${raw}`;
}

/**
 * 构建确定性唯一 componentId：`c-<semantic>-<sessionId 尾 8 hex>`（如 c-monitor-43e7fe45）。
 * - semantic：语义 token（不含 c- 前缀），内部再清洗，超长截断保证总长 ≤ 50（M1-1）
 * - 无 tail 时退化为 c-<semantic>（保持旧行为兼容）；语义空时用 'component' 保底
 */
export function buildComponentId(semanticToken = '', sessionId = '') {
  const seg = toKebab(semanticToken) || 'component';
  const tail = tailHexOf(sessionId);
  // M1-1：id 全小写 kebab 且 ≤50 字符；语义段截断预算 = 50 - len('-') - len(tail)
  const budget = 50 - (tail ? 1 + tail.length : 0);
  const trimmedSeg = seg.slice(0, Math.max(8, budget));
  return tail ? `c-${trimmedSeg}-${tail}` : `c-${trimmedSeg}`;
}

/**
 * 🆕 用户指定组件 ID 规范化（2026-10-09 · 高级选项 P0）。
 *
 * 设计（与刀 9 可剥离契约的关系）：
 *   用户指定 id 形态 = `c-<kebab>`（**无 8hex 尾段**）。classPrefixOf 对无尾段 id
 *   原样返回整 id ⇒ class 前缀 = 完整 id，天然「可剥离」（prefix = whole），
 *   不触发 CODE-003 双前缀问题；且无随机段 → 同名重生成 id 恒定（本需求核心）。
 *
 * 规则：小写 kebab-case；自动补 `c-` 前缀；非法字符转 `-`；总长 ≤64；
 *       保留字拒收；空串返回 ''（= 未指定，走自动生成）。
 *
 * @param {string} raw 用户原始输入
 * @returns {string} 规范化后的 id（空串 = 无效/未指定）
 */
const USER_ID_RESERVED = new Set(['component', 'unknown-component', 'test', 'temp']);

export function normalizeUserComponentId(raw = '') {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  if (!s) return '';
  if (!/^c-/.test(s)) s = `c-${s}`;
  s = s.slice(0, 64).replace(/-+$/g, '');
  if (s.length < 4) return ''; // c-xx 至少 2 个语义字符
  const seg = s.slice(2);
  if (USER_ID_RESERVED.has(seg)) return '';
  if (/^[0-9a-f]{8}$/.test(seg)) return ''; // 纯 8hex 会撞 classPrefixOf 剥离规则，拒收
  return s;
}

/**
 * 🛡️ 刀 9（2026-09-13）：componentId **可剥离闸门**——任何入口产出的 id 在落盘前
 * 强制收敛为契约形态 `c-<语义段>-<8hex尾>`，杜绝不可剥离的随机段污染 class 前缀契约。
 *
 * 为何需要：code-generator / microcode-engineer / playground-tools 三条通道各自装配 id，
 * 历史上任一条漏网（如四段 `c-device-monitor-00g6b7vh-075b13a4`、检查点原样沿用脏 id、
 * playground seg 来源含随机中段）都会让 `classPrefixOf` 剥离失败 → CODE-003 双前缀叠加。
 * 此函数作为**单一收敛点**，无论上游喂什么脏 id，落盘必是可剥离形态。
 *
 * 收敛策略（优先级）：
 *   1. 先剥装饰性随机段（stripDecorSlugTail），再取语义段（semanticSegmentOf）。
 *   2. 语义段非空 → buildComponentId(seg, sessionId)（尾 8hex 由 sessionId 决定，可剥离）。
 *   3. 语义段空（纯 hex / 纯数字 / 编码形态）→ 用 fallbackToken 派生，仍走 buildComponentId。
 *   4. 无 sessionId 时退化为 `c-<semantic>`（兼容老产物 / 模板调用），但不含随机段。
 *
 * @param {string} rawId 任意来源的 componentId 候选
 * @param {Object} [opts]
 * @param {string} [opts.sessionId] 任务 sessionId（提供则尾段收敛为其 8hex 尾）
 * @param {string} [opts.fallbackToken] 语义段派生 fallback（displayName/componentName 等）
 * @returns {string} 契约形态 componentId
 */
export function sanitizeComponentId(rawId = '', opts = {}) {
  const raw = String(rawId || '').trim();
  const sessionId = String(opts?.sessionId || '').trim();
  const fallbackToken = String(opts?.fallbackToken || '').trim();

  // 1. 剥装饰段（先形态①再形态②），无论中段/末段随机段都去掉
  const stripped = stripDecorSlugTail(raw);
  // 2. 提取语义段（内部同样会再剥一次装饰段，双保险）
  let seg = semanticSegmentOf(stripped);

  // 3. 语义段无效 → 用 fallback 派生
  if (!seg) {
    seg = semanticTokenFrom({
      displayName: fallbackToken,
      zhName: fallbackToken,
      fallbackToken,
    });
  }

  // 4. 统一走 buildComponentId：保证尾段仅来自 sessionId 的 8hex（可剥离）
  return buildComponentId(seg || 'component', sessionId);
}

/**
 * 🆕 2026-10-31（刀 33b · P0 契约修复）：declare componentId **终态裁定**（唯一事实源）。
 *
 * 缺陷背景（实锤 mc-max-1793416305379-cf43d973，组件 c-list1）：
 *   `code-generator#resolveDeclareComponentId` 已按用户指定输出终态 `c-list1`；
 *   但下游 `normalizeDeclareJson` 不认识 userComponentId，把这个「无尾段」的**合法终态**
 *   当成「缺尾段的非规范 id」再 sanitizeComponentId 一次 ⇒ `c-list1` → `c-list1-cf43d973`，
 *   违背 P0 高级选项承诺「同名重生成 id 恒定」（契约见 normalizeUserComponentId 的 JSDoc）。
 *
 * 优先级（本函数即该优先级的唯一来源；engineer 侧只赋值、不再自行判断）：
 *   ① user        用户指定 id = 终态，**禁止**再 sanitize、**禁止**被检查点覆盖；
 *   ② checkpoint  检查点（仍过「可剥离闸门」，防历史四段脏 id 复发 CODE-003）；
 *   ③ sanitize    LLM 给的 id 过闸门，收敛结果 === 原 id 才算「已规范」（刀 9 判据，勿放宽）；
 *   ④ derive      LLM 未给 id → 由 displayName / figmaName 语义派生确定性 id；
 *   ⑤ compat      无 sessionId 的兼容路径（模板/兜底调用），保持旧归一行为。
 *
 * @param {Object} [o]
 * @param {string} [o.userComponentId] 高级选项 P0 用户指定 id（原始输入，未归一化）
 * @param {string} [o.checkpointId]    resolveComponentIdCheckpoint 命中的检查点 id
 * @param {string} [o.sessionId]       任务 sessionId（决定尾 8hex）
 * @param {string} [o.llmComponentId]  declare.json 现值（= d.componentId，同时用于「是否已规范」比对）
 * @param {string} [o.displayName]     组件中文显示名（derive 优先来源）
 * @param {string} [o.figmaName]       Figma 图层机名（derive 次选来源）
 * @param {string} [o.fallbackToken]   derive / sanitize 的兜底 token
 * @param {string} [o.compatComponentId] 兼容路径的归一结果（由调用方 `_normalizeComponentId` 算出）
 * @returns {{componentId:string, source:string, changed:boolean, forceChanged:boolean}}
 *   source ∈ user | checkpoint | sanitize | derive | compat | compat-keep | none；
 *   changed = 需不需要写回 declare.componentId；forceChanged = 是否属「被重建」
 *   （engineer 据此打重建留痕日志 + 自愈内存检查点）。
 */
export function decideDeclareComponentIdFinal({
  userComponentId = '',
  checkpointId = '',
  sessionId = '',
  llmComponentId = '',
  displayName = '',
  figmaName = '',
  fallbackToken = '',
  compatComponentId = '',
} = {}) {
  const sid = String(sessionId || '').trim();
  const fallback = String(fallbackToken || '').trim();
  const current = String(llmComponentId || '').trim();

  // ① 用户指定 id = 终态（无尾段 ⇒ classPrefixOf 原样返回 ⇒ 天然可剥离，且重生成恒定）
  const userId = normalizeUserComponentId(userComponentId);
  if (userId) {
    return {
      componentId: userId,
      source: 'user',
      changed: userId !== current,
      forceChanged: userId !== current,
    };
  }

  // ② 检查点优先（保持 刀 9 原行为：无条件重写 + 脏值走闸门收敛）
  const ckpt = String(checkpointId || '').trim();
  if (ckpt && sid) {
    const clean = sanitizeComponentId(ckpt, {
      sessionId: sid,
      fallbackToken: fallback,
    });
    return {
      componentId: clean,
      source: 'checkpoint',
      changed: true,
      forceChanged: clean !== ckpt,
    };
  }

  // ③ LLM 给的 id 走「可剥离闸门」，收敛结果 === 原 id 才算已规范
  if (sid && current) {
    const clean = sanitizeComponentId(current, {
      sessionId: sid,
      fallbackToken: fallback,
    });
    const alreadyUnique = clean === current;
    return {
      componentId: alreadyUnique ? current : clean,
      source: 'sanitize',
      changed: !alreadyUnique,
      forceChanged: !alreadyUnique,
    };
  }

  // ④ LLM 未产出 componentId → 从 displayName / figmaName 语义派生
  if (sid) {
    const seg = semanticTokenFrom({
      displayName: String(displayName || ''),
      zhName: String(displayName || ''),
      figmaName: String(figmaName || ''),
      fallbackToken: fallback,
    });
    return {
      componentId: buildComponentId(seg || 'component', sid),
      source: 'derive',
      changed: true,
      forceChanged: true,
    };
  }

  // ⑤ 兼容路径（无 sessionId 的模板/兜底调用）：保留旧归一行为
  const compat = String(compatComponentId || '').trim();
  if (!current) {
    return { componentId: compat, source: 'compat', changed: true, forceChanged: false };
  }
  if (!/^(c|cp|mv|page)-/.test(current)) {
    return {
      componentId: `c-${current.replace(/^[-]+/, '')}`,
      source: 'compat',
      changed: true,
      forceChanged: false,
    };
  }
  return { componentId: current, source: 'compat-keep', changed: false, forceChanged: false };
}

/**
 * 🛡️ 刀 8b（2026-09-13）：判定「装饰性随机尾段」——base36 随机串特征。
 *
 * 历史缺陷：sessionId 缺失时 safeGenerateDeclareJson 用
 * `Math.random().toString(36).slice(2,10)` 生成 8 位 base36 随机段拼进 componentId
 * （如 c-device-monitor-00g6b7vh-075b13a4）。该段含非 hex 字母（g/v/h…），
 * classPrefixOf 的 `-[0-9a-f]{8}$` 无法剥离 → 随机段滞留进 class 前缀契约 →
 * 与 LLM 生成的 `c-device-monitor-*` 失配 → CODE-003 全量误判 + autoFix 双前缀叠加。
 *
 * 判据（同时要求「数字 + 非 hex 字母」，最大限度避免误伤语义词）：
 *   - 长度恰为 8、字符集 [a-z0-9]；
 *   - 非纯 hex（纯 hex 由既有 `-[0-9a-f]{8}$` 尾段规则处理，如 43e7fe45）；
 *   - 至少含 1 个数字；至少含 1 个非 hex 字母（g-z）。
 * 反例（不判随机段）：overview / register / monitor（无数字）；20240913（纯数字=纯 hex）；43e7fe45 / a326cabd（纯 hex）。
 * 正例：00g6b7vh / 6ajwy8yn / i3ej9whi / 1fduq67s / 25hce807 / vi4f6tl2。
 */
export function isDecorSlugSegment(seg = '') {
  const s = String(seg || '').trim().toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(s)) return false;
  if (/^[0-9a-f]{8}$/.test(s)) return false; // 纯 hex → 既有尾段规则
  if (!/\d/.test(s)) return false; // 无数字 → 视为语义词
  if (!/[g-z]/.test(s)) return false; // 无非 hex 字母 → 视为 hex 变体
  return true;
}

/**
 * 🛡️ 刀 8b：剥离**一个**装饰性随机段（仅当该段命中 isDecorSlugSegment，
 * 且剥离后头部仍含字母，避免把整串剥空 / 剥成纯数字）。支持两种形态：
 *   ① `…-<slug8>-<hex8>`（随机段后紧跟唯一尾段）→ `…-<hex8>`
 *      c-device-monitor-00g6b7vh-075b13a4 → c-device-monitor-075b13a4
 *   ② `…-<slug8>`（随机段即末段）→ `…`
 *      c-device-monitor-00g6b7vh → c-device-monitor
 * 不剥离的反例：c-device-monitor-43e7fe45（纯 hex 尾）/ c-vehicle-overview-abcd1234
 * （overview 无数字）/ c-device-monitor（无 8 位尾段）。
 */
export function stripDecorSlugTail(id = '') {
  const s = String(id || '').trim();
  // 形态①：…-<slug8>-<hex8>
  const m1 = s.match(/^(.*?)-([a-z0-9]{8})-([0-9a-f]{8})$/i);
  if (m1 && isDecorSlugSegment(m1[2]) && /[a-z]/i.test(m1[1])) {
    return `${m1[1]}-${m1[3]}`;
  }
  // 形态②：…-<slug8>
  const m2 = s.match(/^(.*?)-([a-z0-9]{8})$/i);
  if (m2 && isDecorSlugSegment(m2[2]) && /[a-z]/i.test(m2[1])) return m2[1];
  return s;
}

/**
 * 剥离尾 8 hex 的短前缀（CODE-003 / onload 事件事实源）。
 * c-monitor-43e7fe45 → c-monitor；c-monitor（无尾段）→ c-monitor；monitor → c-monitor
 * ⚠️ 时间戳守卫：历史实例形态（语义段含 13 位时间戳，如 c-mc-max-<ts>-<hash>）
 * 不剥离，保持完整供老产物兼容（其 class 确实带完整实例前缀）。
 * 🛡️ 刀 8b：额外剥离装饰性随机尾段（历史随机兜底产物），保证前缀始终收敛到语义干。
 */
export function classPrefixOf(componentId = '') {
  let id = String(componentId || '').trim().toLowerCase();
  if (!id) return '';
  // 刀 8b-①：先剥装饰段（针对 `…-<slug8>-<hex8>` 形态）
  id = stripDecorSlugTail(id);
  // 剥 c-<语义>-<8hex> 的尾段（仅当中间段不含 13 位时间戳）
  const m = id.match(/^(c|cp|mv|page)-(.+)-[0-9a-f]{8}$/);
  if (m && !/\d{13}/.test(m[2])) id = `${m[1]}-${m[2]}`;
  // 刀 8b-②：无 hex 尾段时装饰段可能正好位于末尾（`…-<slug8>`）
  id = stripDecorSlugTail(id);
  if (/^(c|cp|mv|page)-/.test(id)) return id;
  return `c-${id.replace(/^-+/, '')}`;
}


/**
 * 从已有 componentId / componentName 中提取「语义段」（剥离 c- 前缀、尾 8 hex、数字撞名尾段）。
 * 供 buildComponentId 复用 LLM/旧产物已给出的语义段（如 c-monitor → monitor）。
 * c-monitor-43e7fe45 → monitor；c-env-monitor → env-monitor；c-env-monitor-24 → env-monitor
 * 编码形态（含 13 位时间戳或纯长 hex，如 mc-max-1788491328748-xxx）→ ''（判无效）
 */
export function semanticSegmentOf(componentId = '') {
  let s = String(componentId || '').trim().toLowerCase();
  if (!s) return '';
  // 剥离前缀（含 mc- 这类编码前缀）
  s = s.replace(/^(c|cp|mv|page|mc)-/, '');
  // 编码形态：剩余含 13 位时间戳 → 无语义段
  if (/\d{13}/.test(s)) return '';
  // 剥离尾 8 hex 与数字撞名尾段（-43e7fe45 / -24 / -27）
  s = s.replace(/[.-]([0-9a-f]{8}|-?\d{1,3})$/g, '').replace(/-+$/g, '');
  // 🛡️ 刀 8b：剥离装饰性随机尾段（c-device-monitor-00g6b7vh → device-monitor）。
  // LLM/旧产物给出的 componentId 若混入随机兜底段，此处收敛回语义干，
  // 避免随机段被 buildComponentId 当语义段继承、再污染 class 前缀契约。
  s = stripDecorSlugTail(s);
  // 剥离后可能仍是编码/过长，做最终合法性判断
  if (!s) return '';
  // 纯 hex（≥8 位，如 9abce496）或纯数字 → 非语义，判无效
  // （避免 c-9abce496-9abce496 这类双尾编码被误当语义段保留）
  if (/^[0-9a-f]{8,}$/.test(s) || /^\d{2,}$/.test(s)) return '';
  if (!/^[a-z][a-z0-9-]*$/.test(s)) return '';
  return s;
}

/**
 * Loop 0.B：componentId 检查点解析（纯函数）。
 * 读路径：内存 Map → declare.json.meta.checkpoint.componentId → 都 miss 才空（调用方新建）。
 * 重试只读，禁止重掷随机中段。
 */
export function resolveComponentIdCheckpoint({
  sessionId = '',
  memoryId = '',
  declareCheckpointId = '',
} = {}) {
  const sid = String(sessionId || '').trim();
  const mem = String(memoryId || '').trim();
  const disk = String(declareCheckpointId || '').trim();
  if (!sid) return mem || disk || '';
  if (mem) return mem;
  if (disk) return disk;
  return '';
}

/** 写入 declare.meta.checkpoint（不丢既有 meta 其它字段） */
export function applyDeclareCheckpoint(declare, { sessionId, componentId, classPrefix } = {}) {
  const d = declare && typeof declare === 'object' ? declare : {};
  const sid = String(sessionId || '').trim();
  const cid = String(componentId || '').trim();
  if (!sid || !cid) return d;
  const meta = d.meta && typeof d.meta === 'object' ? d.meta : {};
  d.meta = meta;
  meta.checkpoint = {
    sessionId: sid,
    componentId: cid,
    classPrefix: String(classPrefix || '').trim() || undefined,
  };
  return d;
}

/** 判断字符串是否为「编码 sessionId 形态」（mc-/mv- 前缀 + 时间戳 + hex） */
export function isEncodedSessionId(s = '') {
  return /^(mc|mv|cp|page)-(lite|max|gen)-?\d{13}-[a-f0-9]+$/i.test(
    String(s || '').trim(),
  ) || /^(mc|mv|cp|page)-\d{13}-[a-f0-9]+$/i.test(String(s || '').trim());
}

/**
 * 🛡️ §六 #3 类名净化（2026-09-30 · f8116aa6「class 出现了中文」实锤，用户质询）：
 *
 * 全语料实测 ~46 组件 / 92 文件中文类名（`.c-f8116a-小标题` / `.c-bf3612-默认-text` /
 * `.c-component-eachrts-环形图`…）。来源 = LLM 把 Figma 中文层名直接写进 class（prompt
 * 无禁令）+ containerClassFor 兜底清洗只删不译。契约：类名段必须 ASCII kebab。
 *
 * 本净化器为**确定性出口**：中文段 → 语义英文词表映射（长词优先贪心替换）；
 * 未命中段按原文首现序 `zh<N>` 兜底（同一中文原文全产物一致，跨文件可对齐）。
 * 重命名以「完整 class token」为单位全内容替换（模板 class/:class + style 选择器 +
 * common.less + JS 字符串引用一次覆盖）；文本内容中的裸中文（如 <span>场区污水</span>）
 * 不是 token、不在收集范围，绝不误伤。
 */

/** 类名段专用中文 → 英文词表（独立于 ZH_SEMANTIC_RULES，避免扰动 componentId 语义段命名）。 */
const ZH_CLASS_TOKEN_RULES = [
  // —— 业务/图表 ——
  ['环形图', 'donut-chart'],
  ['折线图', 'line-chart'],
  ['柱状图', 'bar-chart'],
  ['饼图', 'pie-chart'],
  ['仪表盘', 'gauge'],
  ['点背景', 'dot-bg'],
  ['文字', 'text'],
  ['背景', 'bg'],
  ['分割线', 'divider'],
  ['小标题', 'subtitle'],
  ['标题', 'title'],
  ['激活', 'active'],
  ['默认', 'default'],
  ['悬浮', 'hover'],
  ['选中', 'selected'],
  ['禁用', 'disabled'],
  ['图例', 'legend'],
  ['标签', 'tag'],
  ['按钮', 'btn'],
  ['图标', 'icon'],
  ['箭头', 'arrow'],
  ['总数', 'total'],
  ['异常', 'abnormal'],
  ['正常', 'normal'],
  ['数量', 'count'],
  ['百分比', 'percent'],
  ['滚动', 'scroll'],
  ['弹窗', 'modal'],
  ['卡片', 'card'],
  ['容器', 'container'],
  ['内容', 'content'],
  // —— Figma 图层机名（矩形备份4 / 位图 / 编组…）——
  ['矩形', 'rect'],
  ['椭圆', 'ellipse'],
  ['直线', 'line'],
  ['位图', 'img'],
  ['编组', 'group'],
  ['蒙版', 'mask'],
  ['备份', '-copy'], // 中缀词带前导 -：'矩形备份4'→'rect-copy-4'；独立出现时 toKebab 去首 - → 'copy'
  ['形状', 'shape'],
];

/** 按关键词长度降序（贪心最长匹配），模块加载时排一次 */
const ZH_CLASS_TOKEN_RULES_SORTED = [...ZH_CLASS_TOKEN_RULES].sort(
  (a, b) => b[0].length - a[0].length,
);

/** 收集某文件内容中「class 语境」的中文 class token（模板属性 + style 选择器） */
function collectClassContextTokens(content) {
  const out = new Set();
  const pushToken = (t) => {
    const tok = String(t || '').trim();
    if (tok && /[\u4e00-\u9fa5]/.test(tok) && /^[A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*$/.test(tok)) {
      out.add(tok);
    }
  };
  // ① 静态 class="a b c"（含单引号变体）
  for (const m of content.matchAll(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const raw = m[1] ?? m[2] ?? '';
    for (const t of raw.split(/\s+/)) pushToken(t);
  }
  // ② 动态 :class="{ 'x--active': cond }" / :class="[ 'a', 'b' ]" 中的引号串
  for (const m of content.matchAll(/[:\s]class\s*=\s*"([^"]*)"/g)) {
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) pushToken(q[1]);
  }
  // ③ style 选择器 .token（<style> 块与 common.less 同一形态）
  for (const m of content.matchAll(/\.([A-Za-z][\w\u4e00-\u9fa5-]*)/g)) pushToken(m[1]);
  return [...out];
}

/** 单个中文连续段 → 英文（贪心最长匹配；残留中文视为未命中返回 null） */
function mapChineseRun(run, fallbackCounter) {
  let out = run;
  for (const [kw, en] of ZH_CLASS_TOKEN_RULES_SORTED) {
    if (out.includes(kw)) out = out.split(kw).join(en);
  }
  if (/[\u4e00-\u9fa5]/.test(out)) {
    // 未命中兜底：同一中文原文 → 同一编号（首现序，确定性）
    if (!fallbackCounter.has(run)) fallbackCounter.set(run, fallbackCounter.size + 1);
    return `zh${fallbackCounter.get(run)}`;
  }
  return toKebab(out) || null;
}

/**
 * 非 ASCII 类名净化（§六 #3 治本出口）。
 *
 * @param {Record<string,string>} files 路径 → 内容（.vue 与 common.less）
 * @param {object} [options]
 * @returns {{ files: Record<string,string>, renamed: Array<{from:string,to:string,file:string}>, remaining: string[] }}
 */
export function autoFixNonAsciiClassNames(files, options = {}) {
  const paths = Object.keys(files || {}).filter((p) => {
    const c = files[p];
    return typeof c === 'string' && c;
  });
  // ① 跨文件收集坏 token（同一 token 多文件出现必须同步改名，否则模板/CSS 失配）
  const badTokens = new Set();
  for (const p of paths) {
    for (const t of collectClassContextTokens(files[p])) badTokens.add(t);
  }
  if (badTokens.size === 0) return { files: {}, renamed: [], remaining: [] };

  // ② 构建 token → 新名映射（中文连续段逐段映射；长 token 先建，防止子串双重应用）
  const fallbackCounter = new Map(); // 中文原文 → zh<N>
  const renameMap = new Map(); // 坏 token → 新名
  for (const tok of [...badTokens].sort((a, b) => b.length - a.length)) {
    const mapped = tok.replace(/[\u4e00-\u9fa5]+/g, (run) => mapChineseRun(run, fallbackCounter));
    if (mapped && mapped !== tok) renameMap.set(tok, mapped);
  }

  // ③ 应用：长 token 优先整串替换（c-x-默认-text 先于 c-x-默认，避免残段）
  const changed = {};
  const renamed = [];
  for (const p of paths) {
    let content = files[p];
    for (const [from, to] of [...renameMap.entries()].sort(
      (a, b) => b[0].length - a[0].length,
    )) {
      if (!content.includes(from)) continue;
      content = content.split(from).join(to);
      renamed.push({ from, to, file: p });
    }
    if (content !== files[p]) changed[p] = content;
  }

  // ④ 余量复核（理论上应为空；留作告警与防御）
  const remaining = new Set();
  for (const p of Object.keys(changed)) {
    for (const t of collectClassContextTokens(changed[p])) remaining.add(t);
  }
  if (options.logger?.warn && remaining.size) {
    options.logger.warn(`§六 #3 类名净化后仍有非 ASCII 类名: ${[...remaining].join(', ')}`);
  }
  return { files: changed, renamed, remaining: [...remaining] };
}

/**
 * 🛡️ businessEvents 键 kebab 门禁（2026-10-19，M3-3 fail-closed，c-a579d-6a579df0 实锤）。
 *
 * 事故：LLM 代码 publishEvent('6a579d-onload')（数字开头非 kebab）→ declare 双 onload，
 *   mc-check M3-3 判 error。normalizeDeclareJson 的 stray 折叠只管 *-onload 后缀，
 *   其它违规键（'2btn_Click_Ev' 等）无防御 ⇒ 这里统一确定性改名：
 *   'c-' + 小写 slug 化（非 [a-z0-9] 连续段折叠为 '-'）；与已有键碰撞则折叠（保留已有键内容）。
 *
 * 纯函数、幂等（合法键原样返回）。
 * @param {object|null} events businessEvents 对象（null/非对象 ⇒ 原样返回）
 * @returns {{events: object|null, changed: boolean, renames: Array<{from:string,to:string}>}}
 */
export function normalizeBusinessEventKeys(events) {
  if (!events || typeof events !== 'object' || Array.isArray(events)) {
    return { events, changed: false, renames: [] };
  }
  const KEBAB_OK = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
  let changed = false;
  const renames = [];
  for (const k of Object.keys(events)) {
    if (KEBAB_OK.test(k)) continue;
    const fixed = `c-${k
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}`;
    const evt = events[k];
    delete events[k];
    if (!events[fixed]) {
      events[fixed] = evt;
      if (evt && typeof evt === 'object') evt.eventId = fixed;
    }
    changed = true;
    renames.push({ from: k, to: fixed });
  }
  return { events, changed, renames };
}
