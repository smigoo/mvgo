/**
 * 下载结果 → 真值条目的实例定位（纯函数，便于单测）
 *
 * 这段逻辑在 2026-11-05~06 连续出错三次，每次都是「用文件名反推实例」引起的：
 *   ① `^icon-\d+\.` 撞上中文节点名（`icon-战略厂商-3160.png`）⇒ 整类图标静默丢失；
 *   ② 去重复用条目与锚点共用文件名 ⇒ N 个实例塌缩成锚点那 1 个；
 *   ③ 退回「按 name 模糊匹配」⇒ 同名多实例互相顶替。
 *
 * 根因是**文件名不是实例标识**：它由 `sanitizeFilename(nodeName) + idSuffix` 拼出来，
 * 既受节点名影响（可能是中文），又会因去重而重复。唯一可靠的实例标识是
 * `downloadAssets` 每条结果自带的 `ref`（= `node.id`）。
 *
 * 因此本函数的口径是：**ref 优先，文件名后缀只作历史产物兼容兜底**，
 * 且后缀必须从末尾取（`icon-战略厂商-3160.png` → `3160`）。
 */

export interface DownloadedAssetLike {
  name?: string;
  /** `downloadAssets` 结果里的源节点 id（dedupe 条目为被合并实例自己的 id） */
  ref?: string;
  localPath?: string | null;
  /** 非空表示这条是「去重复用」而非真实下载 */
  deduplicatedFrom?: string;
}

/** 产物图片文件名是否属于本通道管理的前缀（icon-/bg-/g-） */
export function isFedAssetFileName(fileName: string): boolean {
  return /^(?:icon|bg|g)-/.test(fileName);
}

/**
 * 从末尾抽取数字段 —— 兼容两种命名：
 *   `icon-5823.png`            → `5823`（节点名无中文，id 紧跟前缀）
 *   `icon-战略厂商-3160.png`    → `3160`（节点名含中文，id 在末尾）
 */
export function trailingNumericSuffix(fileName: string): string | undefined {
  const m = fileName.match(/(\d+)\.\w+$/);
  return m ? m[1] : undefined;
}

/**
 * 定位某个下载结果对应的 Figma 节点 id。
 *
 * @param a             downloadAssets 的单个结果
 * @param isKnownNode   该 id 是否真实存在于节点树（防「ref 指向已删除节点」）
 * @param idBySuffix    按数字后缀反查 nodeId 的兜底查询器
 * @returns 命中的 nodeId；无法定位时 `undefined`（调用方应跳过而非猜测）
 */
export function resolveFeedNodeId(
  a: DownloadedAssetLike,
  isKnownNode: (id: string) => boolean,
  idBySuffix: (suffix: string) => string | undefined,
): string | undefined {
  const fileName = String(a.localPath ?? '').split('/').pop() ?? '';
  if (!isFedAssetFileName(fileName)) return undefined;

  // ① ref 优先：唯一可靠的实例标识
  const refId = String(a.ref ?? '');
  if (refId && isKnownNode(refId)) return refId;

  // ② 历史产物兼容：文件名末尾的数字段
  const suffix = trailingNumericSuffix(fileName);
  if (!suffix) return undefined;
  const bySuffix = idBySuffix(suffix);
  return bySuffix && isKnownNode(bySuffix) ? bySuffix : undefined;
}
