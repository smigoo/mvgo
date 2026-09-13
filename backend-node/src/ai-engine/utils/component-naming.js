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
  if (fb) return fb.slice(0, 32);
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
