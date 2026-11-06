/**
 * 项目单元契约（P0）—— 「功能点 → 可独立生成的最小单元」的**唯一**数据结构。
 *
 * 为什么单独成模块而不是塞进 scanner：
 *   · 拆单元是**派生事实**（由 S0 声明层 + Figma 节点树算出来的），不是扫描事实。
 *     塞进 `scanner/s0-scan.js` 会连带改 `SCANNER_MD5`（project-pipeline.service.ts:45），
 *     让「引擎被改过」的自检红一次，收益为零。
 *   · 档位派生（figma→max / screenshot·html→lite）必须只有一处实现。
 *     本文件 `deriveUnitTier` 就是那一处，lite 与 v3 两条链路都要**调它**，不许各抄一份。
 *
 * 三层落盘（刻意分开，避免「跑一次扫描把状态洗掉」）：
 *   spec/components.json  ← 本契约：拆分**快照**，同输入幂等可重建
 *   spec/unit-state.json  ← 单元**运行状态**（P4 回填；快照里 status 恒 'pending'）
 *   spec/decisions.md     ← 人的**裁决层**（追加式，本模块只读不写）
 */

import { createHash } from 'crypto';

/**
 * 契约版本：形状变更必 +1，读取端据此判定缓存是否可用。
 *
 * v1 → v2 的三条理由（任何一条都足以 bump）：
 *   ① `source.kind` 扩枚举：新增 `html`（原型页分支）与 `screenshot`；
 *   ② `UnitAnchor` 增 `pagePath`（HTML 单元的页级锚点）；
 *   ③ `source.inputKey` 取代「只比 figmaUrl」的输入一致性门。
 *
 * 🔴 旧 v1 快照**必须整体作废**：HTML 项目的历史 `NO_FIGMA_LINK` 快照里
 *    `figmaUrl === null`，而新分支的输入指纹同样可能是 `none:` —— 若不 bump，
 *    `null === null` 会让新分支**永远命中**那份空快照、永不触发页级拆分。
 */
export const UNIT_CONTRACT_VERSION = 'unit.v2';

export type UnitSourceType = 'figma' | 'screenshot' | 'html';
export type UnitTier = 'lite' | 'max';
export type UnitStatus = 'pending' | 'running' | 'done' | 'failed';

export const UNIT_SOURCE_TYPES: UnitSourceType[] = ['figma', 'screenshot', 'html'];
export const UNIT_TIERS: UnitTier[] = ['lite', 'max'];
export const UNIT_STATUSES: UnitStatus[] = ['pending', 'running', 'done', 'failed'];

/**
 * `UnitContract.source.kind` 的合法集合 —— 校验层唯一来源，别处不得再抄一份。
 *
 * ⚠️ 与 `UnitSourceType` 刻意不同：后者是**单元**的来源（figma/screenshot/html），
 *    前者是**契约**的来源（多一个 `none`：整份契约没有任何可拆的输入）。
 */
export const UNIT_SOURCE_KINDS: string[] = ['figma', 'html', 'screenshot', 'none'];
export type UnitSourceKind = 'figma' | 'html' | 'screenshot' | 'none';

/**
 * 单元锚点 —— 「这个单元到底对应哪一块真值」。
 * 只有锚点齐了才能谈「独立生成」：没有锚点 = 不知道该生成什么，
 * 所以**无锚点的单元不得进入 units[]**（宁缺勿假）。
 */
export interface UnitAnchor {
  /** Figma 文件 key（与 figmaNodeId 成对出现，缺一即悬空引用） */
  figmaFileKey?: string | null;
  /** Figma 节点 id（画板锚点） */
  figmaNodeId?: string | null;
  /** 原型页相对路径（`html/模块1/云资源监测.html`）—— HTML 单元的页级锚点 */
  pagePath?: string | null;
  /** HTML **元素级** DOM 锚点（当前拆分器未产出，留给后续细化粒度） */
  selector?: string | null;
  /** 截图单元的图片相对路径（`spec/shots/...`） */
  shotPath?: string | null;
}

/** 单元原始尺寸（供按实际宽高渲染 / 判断「是否值得单独生成」） */
export interface UnitBox {
  width: number | null;
  height: number | null;
}

export interface ProjectUnit {
  /** 稳定 id，格式 `u-<sourceType>-<slug>`；同输入必须同 id（幂等的前提） */
  componentId: string;
  /** 人可读名（Figma 单元取 panel-header 中文标题，兜底取节点名解析） */
  name: string;
  sourceType: UnitSourceType;
  anchor: UnitAnchor;
  box: UnitBox;
  /** 档位：由 deriveUnitTier 派生，**不允许调用方自行填** */
  tier: UnitTier;
  /** 快照里恒 'pending'；真实运行态在 spec/unit-state.json */
  status: UnitStatus;
  /** 归属的功能点（与 feature-details.json 的 key 同名字符串）；未归属为 null */
  feature: string | null;
  /** 派生说明（如「cp 前缀命中」「标题来自 panel-header」），便于事后追责 */
  note?: string;
}

/** 降级原因。确定性降级可缓存，偶发失败不可缓存（见图拆分器） */
export interface UnitDegraded {
  code: string;
  message: string;
}

export interface UnitContract {
  version: string;
  runId: string;
  builtAt: string;
  source: {
    kind: UnitSourceKind;
    figmaUrl: string | null;
    figmaFileKey: string | null;
    figmaNodeId: string | null;
    /**
     * 输入指纹 —— 缓存一致性门（`unitsCacheMatchesInput`）**唯一**比对的字段。
     *   figma:<url> | html:<sha1(原型页 rel 升序 join "\n").slice(0,12)> | none:
     * 只比 figmaUrl 会让「HTML 项目加了/删了一个原型页」永远命中旧快照。
     */
    inputKey: string;
  };
  /** null = 拆分成功（units 可能为空数组，但那不是降级） */
  degraded: UnitDegraded | null;
  units: ProjectUnit[];
  stats: {
    total: number;
    bySource: Record<string, number>;
    byTier: Record<string, number>;
    /** 未能归属到任何功能点的单元数（>0 说明功能点匹配有缺口，要人看） */
    unmatched: number;
  };
}

/* ------------------------------------------------------------ 降级码 --- */

/** 确定性降级：项目没声明 links.figma —— 缓存有意义（除非人改声明，结果不会变） */
export const DEGRADED_NO_FIGMA_LINK = 'NO_FIGMA_LINK';
/** 确定性降级：声明了但没有 Figma Token —— 用户补配置即可，缓存同样有意义 */
export const DEGRADED_NO_FIGMA_TOKEN = 'NO_FIGMA_TOKEN';
/** 确定性降级：URL 里缺 fileKey / nodeId —— 链接本身不合格 */
export const DEGRADED_BAD_FIGMA_URL = 'BAD_FIGMA_URL';
/** 确定性降级：节点树里一个 `cp-` 都没有 —— 画板没按约定命名 */
export const DEGRADED_NO_CP_COMPONENT = 'NO_CP_COMPONENT';
/** 偶发降级：Figma 请求失败（限流/网络/权限）—— **不可缓存**，下次要重试 */
export const DEGRADED_FIGMA_FETCH_FAILED = 'FIGMA_FETCH_FAILED';

/** 可缓存的降级码白名单：只有「除非人改配置/改画板，否则结果不会变」的才进这里 */
export const CACHEABLE_DEGRADED_CODES: string[] = [
  DEGRADED_NO_FIGMA_LINK,
  DEGRADED_NO_FIGMA_TOKEN,
  DEGRADED_BAD_FIGMA_URL,
  DEGRADED_NO_CP_COMPONENT,
];

export function isCacheableDegraded(code: string | null | undefined): boolean {
  return !!code && CACHEABLE_DEGRADED_CODES.includes(code);
}

/* -------------------------------------------------------- 输入指纹单一来源 --- */

/**
 * 输入指纹构造器 —— 缓存一致性门（`unitsCacheMatchesInput`）的**唯一**判据来源。
 *
 * 🔴 服务层与两个拆分器都必须调这里，**禁止各写一份**：指纹一旦有两处实现，
 *    「服务算出来的 key」与「快照里记的 key」会以不同规则归一（trim/排序/dedupe），
 *    于是同一份输入时而判等、时而判不等 —— 缓存门当场失去意义。
 */

/** 没有任何可拆输入的指纹（既无 figma 链接、也无原型页） */
export const UNIT_INPUT_KEY_NONE = 'none:';

export function unitInputKeyFigma(figmaUrl: string): string {
  return `figma:${figmaUrl}`;
}

export function unitInputKeyHtml(pageRels: Iterable<string>): string {
  const sorted = [...new Set([...pageRels].map((s) => String(s ?? '').trim()).filter(Boolean))].sort();
  const h = createHash('sha1').update(sorted.join('\n')).digest('hex').slice(0, 12);
  return `html:${h}`;
}

/* -------------------------------------------------------- 档位单一来源 --- */

/**
 * 唯一档位判据：**锚点类型决定档位**。
 *
 *   figma               → max（有节点树 = 有精修与视觉回归所需的真值）
 *   screenshot / html   → lite（只有图/结构，跑 max 的精修与视觉回归没有对照物）
 *
 * 🔴 这是全仓唯一实现。`lite/lite.controller.ts` 的 `figma ? 'max' : 'lite'` 与
 *    `ai-engine-v3` 的单元派生都必须调这里 —— 两处各写一遍就会互相漂移。
 */
export function deriveUnitTier(sourceType: UnitSourceType): UnitTier {
  return sourceType === 'figma' ? 'max' : 'lite';
}

/* ------------------------------------------------------------ 校验 --- */

function isNonEmptyString(v: any): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function isNumOrNull(v: any): boolean {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}

/**
 * 校验契约形状。返回**错误清单**（空数组 = 合法），不抛异常 ——
 * 调用方决定是「拒绝写入」还是「只告警继续」。
 */
export function validateUnitContract(obj: any): string[] {
  const errs: string[] = [];
  if (!obj || typeof obj !== 'object') return ['contract 必须是对象'];

  if (obj.version !== UNIT_CONTRACT_VERSION) {
    errs.push(`version 必须是 ${UNIT_CONTRACT_VERSION}，实际 ${JSON.stringify(obj.version)}`);
  }
  if (!isNonEmptyString(obj.runId)) errs.push('runId 必须是非空字符串');
  // builtAt 是「这份快照什么时候算出来的」，读端要据此判断新旧 —— 不可解析就等于没有
  if (!isNonEmptyString(obj.builtAt) || Number.isNaN(Date.parse(obj.builtAt))) {
    errs.push(`builtAt 必须是可解析的时间字符串，实际 ${JSON.stringify(obj.builtAt)}`);
  }
  if (!obj.source || typeof obj.source !== 'object') {
    errs.push('source 必须是对象');
  } else {
    if (!UNIT_SOURCE_KINDS.includes(obj.source.kind)) {
      errs.push(`source.kind 必须是 ${UNIT_SOURCE_KINDS.join('|')}，实际 ${JSON.stringify(obj.source.kind)}`);
    }
    // 输入指纹是缓存一致性门的唯一判据：缺了它，「比什么」就没定义
    if (!isNonEmptyString(obj.source.inputKey)) {
      errs.push('source.inputKey 必须是非空字符串（缓存一致性门的唯一判据）');
    }
  }
  if (!Array.isArray(obj.units)) {
    errs.push('units 必须是数组');
    return errs;
  }

  // ── degraded 只校验**形状** ───────────────────────────────────────────
  // 🔴 「这个 code 可不可缓存」属于**缓存策略**，刻意不在这里判：
  //    策略的单一来源是 `project-pipeline.service.ts#readUnits`。若把策略也塞进来，
  //    就成了两层守卫 —— 删掉 readUnits 那一层判据依然绿，「策略守卫」失去独立判据。
  if (obj.degraded !== null && obj.degraded !== undefined) {
    if (typeof obj.degraded !== 'object') {
      errs.push('degraded 必须是 null 或对象');
    } else {
      if (!isNonEmptyString(obj.degraded.code)) errs.push('degraded.code 必须是非空字符串');
      if (!isNonEmptyString(obj.degraded.message)) {
        errs.push('degraded.message 必须是非空字符串');
      }
    }
  }

  // ── stats 是派生量：手填的数字自证不了自己，至少要能和 units 对上 ──────
  if (!obj.stats || typeof obj.stats !== 'object') {
    errs.push('stats 必须是对象');
  } else {
    if (typeof obj.stats.total !== 'number') {
      errs.push('stats.total 必须是数字');
    } else if (obj.stats.total !== obj.units.length) {
      errs.push(`stats.total=${obj.stats.total} 与 units.length=${obj.units.length} 不一致`);
    }
    if (typeof obj.stats.unmatched !== 'number') errs.push('stats.unmatched 必须是数字');
    if (!obj.stats.bySource || typeof obj.stats.bySource !== 'object') {
      errs.push('stats.bySource 必须是对象');
    }
    if (!obj.stats.byTier || typeof obj.stats.byTier !== 'object') {
      errs.push('stats.byTier 必须是对象');
    }
  }

  const seen = new Set<string>();
  obj.units.forEach((u: any, i: number) => {
    const at = `units[${i}]`;
    if (!isNonEmptyString(u?.componentId)) {
      errs.push(`${at}.componentId 必须是非空字符串`);
    } else {
      if (seen.has(u.componentId)) errs.push(`${at}.componentId 重复：${u.componentId}`);
      seen.add(u.componentId);
    }
    if (!isNonEmptyString(u?.name)) errs.push(`${at}.name 必须是非空字符串`);
    if (!UNIT_SOURCE_TYPES.includes(u?.sourceType)) {
      errs.push(`${at}.sourceType 必须是 ${UNIT_SOURCE_TYPES.join('|')}`);
    }
    if (!UNIT_TIERS.includes(u?.tier)) {
      errs.push(`${at}.tier 必须是 ${UNIT_TIERS.join('|')}`);
    } else if (UNIT_SOURCE_TYPES.includes(u?.sourceType) && u.tier !== deriveUnitTier(u.sourceType)) {
      // 派生值与来源不一致 = 有人在别处手填了档位，就地拦下
      errs.push(
        `${at}.tier=${u.tier} 与 deriveUnitTier(${u.sourceType})=${deriveUnitTier(u.sourceType)} 不符`,
      );
    }
    if (!UNIT_STATUSES.includes(u?.status)) {
      errs.push(`${at}.status 必须是 ${UNIT_STATUSES.join('|')}`);
    }
    if (!u?.anchor || typeof u.anchor !== 'object') {
      errs.push(`${at}.anchor 必须是对象`);
    } else if (
      !isNonEmptyString(u.anchor.figmaNodeId) &&
      !isNonEmptyString(u.anchor.pagePath) &&
      !isNonEmptyString(u.anchor.selector) &&
      !isNonEmptyString(u.anchor.shotPath)
    ) {
      // 「无锚点的单元不得进入 units[]」
      errs.push(`${at}.anchor 至少要有一个锚点（figmaNodeId / pagePath / selector / shotPath）`);
    }
    if (!u?.box || typeof u.box !== 'object') {
      errs.push(`${at}.box 必须是对象`);
    } else if (!isNumOrNull(u.box.width) || !isNumOrNull(u.box.height)) {
      errs.push(`${at}.box.width/height 必须是数字或 null`);
    }
    if (u?.feature !== null && u?.feature !== undefined && typeof u.feature !== 'string') {
      errs.push(`${at}.feature 必须是字符串或 null`);
    }
  });

  return errs;
}

/** 统计（派生而非手填，避免「数字自证不了自己」） */
export function computeUnitStats(units: ProjectUnit[], features: string[] = []) {
  const bySource: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  let unmatched = 0;
  for (const u of units) {
    bySource[u.sourceType] = (bySource[u.sourceType] || 0) + 1;
    byTier[u.tier] = (byTier[u.tier] || 0) + 1;
    if (!u.feature || (features.length && !features.includes(u.feature))) unmatched += 1;
  }
  return { total: units.length, bySource, byTier, unmatched };
}
