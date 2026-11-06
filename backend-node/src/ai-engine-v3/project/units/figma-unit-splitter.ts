/**
 * Figma 单元拆分器（P1/P2 · Figma 分支）
 *
 * 职责只有三件：
 *   1. 从 `mvgo.project.json` 的 `links.figma` 解析出 fileKey + nodeId；
 *   2. 取节点树，复用既有 `findCpComponents`（`ai-engine/utils/page-decomposer.js`）
 *      识别 `cp-` 单元 —— **不重写拆解规则**，那套规则已被 batch-orchestrator 验证过；
 *   3. 归一成 `ProjectUnit[]` 并回填锚点（fileKey + nodeId + 原始宽高）。
 *
 * 🔴 为什么 `getNode` 走依赖注入：拆解规则必须有**可离线运行**的判据，
 *    否则单测一碰网络就变成「跑不通就跳过」，等于没判据。
 *    生产调用方传 `(fk, id) => new FigmaClient({token}).getNode(fk, id)`。
 *
 * 🔴 为什么失败不抛异常：拆分是**增强路径**。取不到图就退化成「零单元 + 原因」，
 *    让前端能显示「未拆出单元：未配置 Figma Token」，而不是一个 500。
 */

import { parseFigmaUrl } from '../../../ai-engine/utils/figma-url-parser.js';
import { findCpComponents } from '../../../ai-engine/utils/page-decomposer.js';
// 🔴 同模块内的 TS 之间用**无后缀**（与同目录树 `stages/` 的既有写法一致）：
//    本仓 jest 的 moduleFileExtensions 是 ["js","json","ts"]，`js` 在前 —— 写 `'./x.js'`
//    只有两种情况：① 真存在编译产物 `x.js`（如 phase2/refine-target.js 那种 src 里躺着的
//    历史遗留），那就**跑的是旧 JS 而不是 TS**；② 不存在，则直接 Cannot find module。
//    两种都不好，所以新模块一律无后缀。
import {
  DEGRADED_BAD_FIGMA_URL,
  DEGRADED_FIGMA_FETCH_FAILED,
  DEGRADED_NO_CP_COMPONENT,
  DEGRADED_NO_FIGMA_LINK,
  DEGRADED_NO_FIGMA_TOKEN,
  UNIT_CONTRACT_VERSION,
  computeUnitStats,
  deriveUnitTier,
  type ProjectUnit,
  type UnitContract,
  type UnitDegraded,
} from './unit-contract';
// 🔴 命名与归属的单一来源：figma / html 两个拆分器共用，别在本文件再抄一份
import { attributeFeature, slug } from './unit-naming';

/**
 * 从 S0 清单里读出 `links.figma`（取不到 → null）。
 *
 * 🔴 判据形状与 `scanner/s0-scan.js:1011-1012` **逐字同源**：
 *    `content && !content.__parseError && content.links`。
 *    扫描器是零依赖独立产物（且被 SCANNER_MD5 钉死），只能各留一份；
 *    改动这里必须同步改扫描器，否则「页面上说没声明、拆分说声明了」。
 */
export function readProjectFigmaUrl(s0: any): string | null {
  const content = s0?.projectJson?.content;
  const links = content && !content.__parseError && content.links;
  const figma = links && links.figma;
  return typeof figma === 'string' && figma.trim() ? figma.trim() : null;
}

/**
 * 取不到画板链接时，**补充说明「为什么取不到」** —— 只喂给降级文案，不参与任何分支判据。
 *
 * 🔴 与 `readProjectFigmaUrl` 是**刻意分工**，不是为了省函数：
 *    那个函数只回答「有没有链接」，判据必须与 `scanner/s0-scan.js:1011-1012` **逐字同源**；
 *    这个只回答「为什么没有」，而且**只读 `__parseError` 这一个字段** —— 不复刻「有没有」
 *    的判据，就不会长出第二份会漂移的判据。
 *
 * 🔴 为什么值得单独做：`mvgo.project.json` 解析失败时 `readProjectFigmaUrl` 同样返回 null，
 *    若文案一律写「项目未声明 links.figma」，人会跑去配置里翻半天，而真实原因是清单没解析
 *    出来（`NO_FIGMA_LINK`）。**两者的修复动作完全不同**，文案必须能区分。
 *
 * 返回空串 = 没有额外信息（调用方沿用默认文案）。
 */
export function figmaLinkAbsenceNote(s0: any): string {
  const content = s0?.projectJson?.content;
  const err = content && content.__parseError;
  if (err) {
    // 截断：解析错误可能带整段源码片段，别把日志撑爆
    return `项目清单（mvgo.project.json）解析失败：${String(err).slice(0, 200)}`;
  }
  return '';
}

/** 取节点树的最小依赖面（单测注入假实现，生产注入 FigmaClient） */
export interface FigmaUnitSplitDeps {
  getNode: (fileKey: string, nodeId: string) => Promise<any>;
}

export interface FigmaUnitSplitParams {
  runId: string;
  /**
   * 输入指纹（`unitInputKeyFigma(figmaUrl)`）—— 由调用方算好传入，单一来源在服务层。
   * 落到 `source.inputKey`，是缓存一致性门的唯一判据。
   */
  inputKey: string;
  /** `mvgo.project.json` 的 links.figma；空值即「项目没声明画板」 */
  figmaUrl?: string | null;
  /**
   * `figmaUrl` 为空时，**为什么**为空（来自 `figmaLinkAbsenceNote`）。
   * 只影响 `NO_FIGMA_LINK` 的 `message`，**不参与任何判据分支** —— 传不传，降级码都一样。
   */
  figmaUrlAbsenceNote?: string;
  /** 已提取的功能点列表（feature-details.json 的 key），用于把单元归属到功能点 */
  features?: string[];
  /**
   * 调用方是否已拿到 Figma Token。
   * 刻意**不是**从 env 里读——凭证解析口径（用户配置 > 环境变量）只有调用方一处，
   * 拆分层只问「有没有」，不自己去找。默认 true（独立使用时不因缺参数而误报降级）。
   */
  tokenAvailable?: boolean;
  /** 固定时间戳（单测传定值可获得逐字节幂等的结果） */
  builtAt?: string;
  /** 真机计数行回调（生产传 logger，让「拆了几个 / 降级原因」成为可观测事实） */
  onLog?: (payload: Record<string, any>) => void;
}

/**
 * 节点 id（`2:7952`）→ slug（`2-7952`）。**单元 id 的唯一来源。**
 *
 * 🔴 为什么不用目录名做 id：实测 8 个真实画板里 7 个的 `folderName` 是中文
 *    （`c-环境监测` / `c-设备监测` / `c-流量监测`…），经 `slug()` 后**全部塌成 `'c'`**。
 *    若再靠「重名加 -2/-3」去重，序号就由遍历顺序决定 ⇒ 同一份节点树换个 children
 *    顺序，`u-figma-c-2` 会挂到另一个物理节点上，**幂等直接失效**。
 *    nodeId 在文件内唯一、与遍历顺序无关，且它本来就是单元的锚点
 *    —— 「id 由锚点派生」才是单一真值。
 */
function idSlug(nodeId: string): string {
  return slug(String(nodeId || '').replace(/[:;]/g, '-'));
}

function emptyContract(
  runId: string,
  builtAt: string,
  degraded: UnitDegraded | null,
  source: UnitContract['source'],
  features: string[],
): UnitContract {
  return {
    version: UNIT_CONTRACT_VERSION,
    runId,
    builtAt,
    source,
    degraded,
    units: [],
    stats: computeUnitStats([], features),
  };
}

/**
 * 拆分主流程。**永不抛异常**（除参数缺失这种编程错误），失败一律转 `degraded`。
 */
export async function splitFigmaUnits(
  params: FigmaUnitSplitParams,
  deps: FigmaUnitSplitDeps,
): Promise<UnitContract> {
  const runId = String(params?.runId || '');
  const builtAt = params.builtAt || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const features = Array.isArray(params?.features) ? params.features : [];
  const figmaUrl = params?.figmaUrl ? String(params.figmaUrl).trim() : '';
  // 输入指纹：必需字段，缺省兜底空串（真实调用方一律传入，见 buildUnits）
  const inputKey = params?.inputKey ? String(params.inputKey) : '';

  const source: UnitContract['source'] = {
    kind: 'figma',
    figmaUrl: figmaUrl || null,
    figmaFileKey: null,
    figmaNodeId: null,
    inputKey,
  };

  const log = (extra: Record<string, any>) => {
    try {
      params.onLog?.({ runId, ...extra });
    } catch {
      /* 日志失败不得影响拆分 */
    }
  };

  // ① 声明层没有画板链接 —— 确定性降级（可缓存）
  if (!figmaUrl) {
    // 「没声明」与「清单没解析出来」都会走到这里，但**修复动作完全不同**，
    // 有补充说明时必须让文案能区分（否则排障方向会被误导到配置项上）。
    const note = String(params?.figmaUrlAbsenceNote ?? '').trim();
    const degraded = {
      code: DEGRADED_NO_FIGMA_LINK,
      message: note ? `取不到画板链接：${note}` : '项目未声明 links.figma，无画板可拆',
    };
    log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
    return emptyContract(runId, builtAt, degraded, { ...source, kind: 'none' }, features);
  }

  // ② 链接不合格 —— 确定性降级（可缓存）
  let parsed: any = null;
  try {
    parsed = parseFigmaUrl(figmaUrl);
  } catch (err: any) {
    const degraded = {
      code: DEGRADED_BAD_FIGMA_URL,
      message: `Figma 链接无法解析 fileKey/nodeId：${String(err?.message ?? err).slice(0, 200)}`,
    };
    log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
    return emptyContract(runId, builtAt, degraded, source, features);
  }
  source.figmaFileKey = parsed?.fileKey || null;
  source.figmaNodeId = parsed?.nodeId || null;
  if (!source.figmaFileKey || !source.figmaNodeId) {
    const degraded = {
      code: DEGRADED_BAD_FIGMA_URL,
      message: `Figma 链接缺少 ${!source.figmaFileKey ? 'fileKey' : 'nodeId'}`,
    };
    log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
    return emptyContract(runId, builtAt, degraded, source, features);
  }

  // ③ 没 Token —— 确定性降级（可缓存）。**在取图之前**判定：
  //    没凭证就必然取不到图，若先取图会把「缺配置」误报成「网络偶发失败」，
  //    而后者不可缓存 ⇒ 每次刷新都白打一次 Figma 请求。
  if (params?.tokenAvailable === false) {
    const degraded = {
      code: DEGRADED_NO_FIGMA_TOKEN,
      message: '未配置 Figma Token（用户配置或 FIGMA_ACCESS_TOKEN），无法读取画板节点树',
    };
    log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
    return emptyContract(runId, builtAt, degraded, source, features);
  }

  // ④ 取节点树 —— 失败是**偶发**降级（不可缓存，下次要重试）
  let tree: any = null;
  try {
    tree = await deps.getNode(source.figmaFileKey, source.figmaNodeId);
  } catch (err: any) {
    const degraded = {
      code: DEGRADED_FIGMA_FETCH_FAILED,
      message: `Figma 节点获取失败：${String(err?.message ?? err).slice(0, 200)}`,
    };
    log({
      stage: 'figma-units',
      mode: 'degraded',
      ...degraded,
      units: 0,
      fileKey: source.figmaFileKey,
      nodeId: source.figmaNodeId,
    });
    return emptyContract(runId, builtAt, degraded, source, features);
  }

  // ⑤ 复用既有 cp- 拆解规则（不重写）
  const cps: any[] = findCpComponents(tree) || [];
  if (!cps.length) {
    const degraded = {
      code: DEGRADED_NO_CP_COMPONENT,
      message: `画板内未发现 \`cp-\` 前缀节点（root=${source.figmaNodeId}），无法按约定拆单元`,
    };
    log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
    return emptyContract(runId, builtAt, degraded, source, features);
  }

  // ⑥ 归一成契约单元。无 figmaNodeId 的条目**丢弃**（无锚点不得进 units[]）
  const used = new Set<string>();
  const units: ProjectUnit[] = [];
  let dropped = 0;
  for (const c of cps) {
    const figmaNodeId = c?.figmaNodeId ? String(c.figmaNodeId) : '';
    if (!figmaNodeId) {
      dropped += 1;
      continue;
    }
    const folderName = String(c?.folderName || '');
    // 🔴 id 只由**锚点**派生（nodeId 文件内唯一、与遍历顺序无关）。
    //    曾用 `slug(folderName) || idSlug(...)`：真实数据里 7/8 的目录名是中文，
    //    经 slug 后全部塌成 'c'，去重序号于是由遍历顺序决定 ⇒ 幂等失效。
    //    下面这个 for 循环只是「同一 nodeId 理论上出现两次」的兜底
    //    —— 此时两条记录本就是同一个物理节点，加不加序号都不影响语义。
    const base = idSlug(figmaNodeId);
    let componentId = `u-figma-${base}`;
    for (let i = 2; used.has(componentId); i += 1) componentId = `u-figma-${base}-${i}`;
    used.add(componentId);

    const name = String(c?.componentName || c?.figmaNodeName || folderName || figmaNodeId);
    units.push({
      componentId,
      name,
      sourceType: 'figma',
      anchor: { figmaFileKey: source.figmaFileKey, figmaNodeId },
      box: {
        width: typeof c?.figmaWidth === 'number' ? c.figmaWidth : null,
        height: typeof c?.figmaHeight === 'number' ? c.figmaHeight : null,
      },
      // 🔴 档位只从 deriveUnitTier 来，这里绝不写字面量 'max'
      tier: deriveUnitTier('figma'),
      status: 'pending',
      feature: attributeFeature(name, folderName, features),
      note: `cp 前缀命中：${String(c?.figmaNodeName || folderName)}`,
    });
  }

  // ⑦ 稳定排序 ⇒ 同输入逐字节幂等（不依赖 Figma 遍历顺序）
  units.sort((a, b) => (a.componentId < b.componentId ? -1 : a.componentId > b.componentId ? 1 : 0));

  const stats = computeUnitStats(units, features);
  log({
    stage: 'figma-units',
    mode: 'ok',
    fileKey: source.figmaFileKey,
    nodeId: source.figmaNodeId,
    cpFound: cps.length,
    units: units.length,
    dropped,
    unmatched: stats.unmatched,
    byTier: stats.byTier,
    bySource: stats.bySource,
  });

  return {
    version: UNIT_CONTRACT_VERSION,
    runId,
    builtAt,
    source,
    degraded: null,
    units,
    stats,
  };
}
