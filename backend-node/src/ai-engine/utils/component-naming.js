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
 * 剥离尾 8 hex 的短前缀（CODE-003 / onload 事件事实源）。
 * c-monitor-43e7fe45 → c-monitor；c-monitor（无尾段）→ c-monitor；monitor → c-monitor
 * ⚠️ 时间戳守卫：历史实例形态（语义段含 13 位时间戳，如 c-mc-max-<ts>-<hash>）
 * 不剥离，保持完整供老产物兼容（其 class 确实带完整实例前缀）。
 */
export function classPrefixOf(componentId = '') {
  let id = String(componentId || '').trim().toLowerCase();
  if (!id) return '';
  // 剥 c-<语义>-<8hex> 的尾段（仅当中间段不含 13 位时间戳）
  const m = id.match(/^(c|cp|mv|page)-(.+)-[0-9a-f]{8}$/);
  if (m && !/\d{13}/.test(m[2])) id = `${m[1]}-${m[2]}`;
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
