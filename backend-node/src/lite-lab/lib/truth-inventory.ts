/**
 * truth-inventory 组装（S3 共享抽取，2026-11-06）：lab Stage B 与 lite 资源续跑
 * （upgradeAssets 换芯）共用的「Figma 节点树 + 下载清单 → TruthInventory」纯函数层。
 *
 * 抽取前这段逻辑内联在 lite-lab.service#executeLab（:296-394）——续跑通道要复用
 * 就得复制第二份 ⇒ 违反判据单一来源。抽取后 lab service 改调本函数，行为等价。
 *
 * 职责（与原内联版逐段对应）：
 * 1. collectFigmaTruth：IMAGE fill 主采集（texts/assets/containers）；
 * 2. imageRef 三级对齐：下载条目 ↔ 真值条目（imageRef 子树映射 > nodeId 精确 > name 兜底）；
 * 3. VECTOR 反哺：下载成功但 truth 未收录的条目（VECTOR 无 IMAGE fill）造真值条目
 *    （resolveFeedNodeId：ref 优先、文件名后缀历史兼容），带 nearbyTexts/几何（含 S1 x/y）/
 *    parentFill/parentMeta（bg 结构锚定）；
 * 4. 去重：外层容器 vs imageRef 内层节点（同一张图不双记）。
 *
 * 纯函数：不读盘、不下载、不 log——下载与持久化留在调用方（service 层职责）。
 */
import {
  buildImageRefIndex,
  buildNodeTextContext,
  collectAssetParentMeta,
  collectFigmaTruth,
  findNodeById,
  findNodeIdBySuffix,
  findParentFillById,
  type TruthInventory,
} from './truth-matcher';
import { resolveFeedNodeId } from './asset-feed';

export interface BuildTruthInventoryInput {
  /** Figma fetchNodeData 返回的节点树 */
  nodeData: any;
  /** connector.downloadAssets 的返回（localPath/ref/name） */
  downloadedAssets: any[];
}

/** 反哺结果统计（真机日志计数行用，0 也打） */
export interface TruthInventoryFeedStats {
  /** 下载条目总数 */
  downloaded: number;
  /** 反哺新造条目数 */
  fed: number;
  /** imageRef 对齐命中数（主采集条目补 fileName） */
  aligned: number;
  /** 未对齐到下载文件的真值条目数（将计入 noFile） */
  unmatched: number;
}

export interface TruthInventoryResult {
  truth: TruthInventory;
  feed: TruthInventoryFeedStats;
}

export function buildTruthInventory(
  nodeData: any,
  downloadedAssets: any[],
): TruthInventoryResult {
  const truth = collectFigmaTruth(nodeData);
  const feed: TruthInventoryFeedStats = {
    downloaded: downloadedAssets.length,
    fed: 0,
    aligned: 0,
    unmatched: 0,
  };

  // ── imageRef 三级对齐（2026-11-05 实锤 mc-lab-1793865328825）：downloadAssets 下载的是
  //    命名启发式选中的外层容器（icon-8036），truth 收集的是 IMAGE fill 内层节点
  //    （2:8037）——节点 id 两套体系对不上；改按「子树 imageRef」对齐（同一张图
  //    imageRef 必相同），节点 id 精确/name 兜底降级为后备。
  const imageRefIndex = buildImageRefIndex(nodeData);
  for (const a of downloadedAssets) {
    if (!a.localPath) continue;
    const fileName = String(a.localPath).split('/').pop();
    const imgRef = imageRefIndex.get(String(a.ref));
    let hit = imgRef ? truth.assets.find((x) => x.imageRef === imgRef) : undefined;
    if (!hit) hit = truth.assets.find((x) => x.nodeId === a.ref);
    if (!hit && a.name) hit = truth.assets.find((x) => !x.fileName && x.name === a.name);
    if (hit && fileName) {
      hit.fileName = fileName;
      feed.aligned += 1;
    }
  }

  // ── VECTOR 反哺（mc-lab-1793869928144 实锤）：VECTOR 图标无 IMAGE fill，collectFigmaTruth
  //    收不到 ⇒ truth.assets=0 ⇒ 拷贝/挂载全链路空转、产物留空 src 破图；而
  //    downloadAssets 命名启发式实际下载成功。按文件名后缀反查 nodeId 造真值条目。
  //    🆕 2026-11-05 grill 决议：扩前缀 icon-/bg-/g- 全反哺（bg- 走命名↔结构锚定
  //    换 CSS background；g- 只采集不消费——消费裁决收口到 classifyAsset S2）。
  const textCtx = buildNodeTextContext(nodeData);
  for (const a of downloadedAssets) {
    if (!a.localPath) continue;
    const fn = String(a.localPath).split('/').pop() ?? '';
    // 🔴 2026-11-06 治本（mc-lab-1793900783082-741c9eed / 1793900809960-11a0ef5f 双实锤）：
    //    旧判据 `^icon-\d+\.` 只认「节点名不含其它字符」的文件名，但
    //    `_downloadImageFromUrl` 命名是 `${sanitizeFilename(nodeName)}-${idSuffix}.png`，
    //    而 sanitizeFilename **保留中文** ⇒ 真机文件名 `icon-战略厂商-3160.png` 不匹配
    //    ⇒ continue ⇒ 三个 section 图标下载成功却永不进真值清单，下游只好用
    //    CSS 圆点冒充。判据收口到 asset-feed#resolveFeedNodeId：**ref 优先，文件名后缀仅作历史兼容**。
    const nodeId = resolveFeedNodeId(
      a,
      (id) => !!findNodeById(nodeData, id),
      (suffix) => findNodeIdBySuffix(nodeData, suffix),
    );
    if (!nodeId) continue;
    // 「外层容器 vs imageRef 内层节点」去重：该容器子树里的图已被 truth 收录时不重复造条目
    {
      const refImgRef = imageRefIndex.get(String(a.ref));
      if (refImgRef && truth.assets.some((x) => x.imageRef === refImgRef)) continue;
    }
    if (truth.assets.some((x) => x.nodeId === nodeId)) continue;
    const bbox = findNodeById(nodeData, nodeId)?.absoluteBoundingBox;
    // 🆕 bg 结构锚定（c91f6190 实锤）：本设计稿没有 IMAGE fill，资产全靠本段反哺，
    // 而 collectFigmaTruth 的 parentTexts 只在 imageFill 分支里写 ⇒ 反哺条目必须自己补，
    // 否则 structCand=0、结构通道整条空转（真机 bgAiStructCand=0 / parentTexts=None）。
    // 取词与容器级判定共用 collectAssetParentMeta（判据单一来源）。
    const pMeta = collectAssetParentMeta(nodeData, nodeId);
    truth.assets.push({
      nodeId,
      name: String(a.name ?? fn),
      fileName: fn,
      // 近邻文本放 nearbyTexts（字段语义锚定专用，不进模板锚点路径）
      siblingTexts: [],
      nearbyTexts: textCtx.get(nodeId) ?? [],
      width: bbox?.width,
      height: bbox?.height,
      // 🔴 2026-11-06 S1（cec84299 实锤）：bbox 原点必须补——反哺条目缺 x/y ⇒
      //    兜底链 (y,x) 视觉排序退化为数组序 ⇒ alt 缺失时盲 zip 图标错位。
      //    主采集路径早已带 x/y，本处对齐同一口径（rounded，与主路径一致）。
      ...(bbox ? { x: Math.round(bbox.x), y: Math.round(bbox.y) } : {}),
      // 🆕 Q2：父容器 SOLID fill（icon-wrap 臆造底色纠正的真值来源）
      parentFill: findParentFillById(nodeData, nodeId) ?? null,
      ...(pMeta.parentTexts.length > 0 ? { parentTexts: pMeta.parentTexts } : {}),
      ...(pMeta.parentId ? { parentId: pMeta.parentId } : {}),
      containerLevel: pMeta.containerLevel,
    });
    feed.fed += 1;
  }

  feed.unmatched = truth.assets.filter((x) => !x.fileName).length;
  return { truth, feed };
}
