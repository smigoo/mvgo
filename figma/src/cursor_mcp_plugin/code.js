// mvgo-figma-structure
// 仅保留「AI 自动扫描图层 + 批量规范重命名」所需逻辑，去除通用 MCP 命令库与统计上报。

const state = { serverPort: 3055 };
let lastOrganizeUndoAvailable = false;
function publishUndoState() {
  figma.ui.postMessage({ type: "organize-undo-state", available: lastOrganizeUndoAvailable });
}

// 建组诊断（v20261110.10）：把 figma.group 第一次抛出的真实错误回传给 UI。
// 之前的版本只能看到「建组失败 N」，无法区分是跨父级 / 锁定 / 实例只读 / API 不可用，只能靠猜。
const groupDiag = { err: "", frames: 0 };
function resetGroupDiag() { groupDiag.err = ""; groupDiag.frames = 0; }
function noteGroupError(e) {
  try {
    const m = String((e && e.message) || e || "").slice(0, 240);
    if (m && !groupDiag.err) groupDiag.err = m;
  } catch (e2) {}
}

// 结构清单（v20261110.11）：把每次新建的业务容器「叫什么 / 在哪个父级 / 装了几个节点 / 什么类型」列出来。
// 之前只有「业务容器 4」一个数字，用户在图层树里根本找不到它们在哪。
const structLog = [];
function resetStructLog() { structLog.length = 0; }
function logContainer(kind, node, memberCount, parentName) {
  if (!node || structLog.length >= 60) return;
  let nm = "", type = "";
  try { nm = String(node.name || ""); type = String(node.type || ""); } catch (e) {}
  structLog.push(kind + " " + nm + "  ← 父[" + (parentName || "?") + "]  " + memberCount + " 节点  [" + type + "]");
}

// 选区缓存与广播：Dev Mode 下焦点切到插件 UI 时 figma.currentPage.selection 会被清空，
// 这里监听 selectionchange 缓存最近一次非空选区，并实时推给 UI。
// 注意：只缓存「节点 id 数组」，不缓存节点对象引用——被删/失效节点再用 getNodeById 解析会抛 get_name。
let lastNonEmptySelection = [];
function resolveCachedSelection() {
  return lastNonEmptySelection.map(id => figma.getNodeById(id)).filter(Boolean);
}
function broadcastSelection() {
  const live = figma.currentPage.selection;
  if (live && live.length > 0) lastNonEmptySelection = live.map(n => n.id);
  const sel = live && live.length ? live : resolveCachedSelection();
  figma.ui.postMessage({
    type: "selection-state",
    count: sel ? sel.length : 0,
    name: sel && sel.length ? (sel.length === 1 ? sel[0].name : `多选(${sel.length})`) : null,
    nodeType: sel && sel.length ? sel[0].type : null,
    id: sel && sel.length === 1 ? sel[0].id : null,
    live: !!(live && live.length),
  });
}
figma.on("selectionchange", broadcastSelection);

figma.showUI(__html__, { width: 360, height: 560 });

// v20261114：整理结果本地缓存（figma.clientStorage）。重开插件 / 切换文件后自动回填，不依赖后端。
async function cacheStructureResult(partial) {
  try {
    const prev = await figma.clientStorage.getAsync("mvgo-structure-cache") || {};
    await figma.clientStorage.setAsync("mvgo-structure-cache", { ...prev, ...partial, ts: Date.now() });
  } catch (e) {}
}

// 启动：恢复本地服务端口 + 恢复整理缓存 + 广播一次当前选区
(async () => {
  try {
    const p = await figma.clientStorage.getAsync("serverPort");
    if (p) state.serverPort = p;
  } catch (e) {}
  try {
    const cache = await figma.clientStorage.getAsync("mvgo-structure-cache");
    if (cache && (cache.contractText || cache.json)) {
      figma.ui.postMessage({ type: "structure-cache", cache });
    }
  } catch (e) {}
  broadcastSelection();
})();

figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case "notify":
      figma.notify(msg.message);
      break;
    case "request-selection":
      // UI 加载完成 / 「重新捕获选区」按钮来要选区
      broadcastSelection();
      publishUndoState();
      break;
    case "undo-organize": {
      if (!lastOrganizeUndoAvailable) {
        figma.ui.postMessage({ type: "organize-undo-result", ok: false, error: "没有可撤回的整理记录" });
        break;
      }
      try {
        figma.triggerUndo();
        lastOrganizeUndoAvailable = false;
        figma.ui.postMessage({ type: "organize-undo-result", ok: true });
      } catch (error) {
        figma.ui.postMessage({ type: "organize-undo-result", ok: false, error: error.message || String(error) });
      }
      publishUndoState();
      break;
    }
    case "clear-cache":
      // 插件关闭时清空 transient 缓存（选区回退缓存）；AI 配置(clientStorage)属「设置」保留不清除
      lastNonEmptySelection = [];
      figma.clientStorage.deleteAsync("mvgo-structure-cache").catch(() => {});
      break;
    case "save-server-port":
      state.serverPort = msg.port || 3055;
      figma.clientStorage.setAsync("serverPort", state.serverPort).catch(() => {});
      break;
    case "ai-organize": {
      try {
        const TYPE_CN = { RECTANGLE: "矩形", TEXT: "文本", ELLIPSE: "椭圆", VECTOR: "矢量图形", LINE: "线条" };
        let sel = figma.currentPage.selection;
        if (!sel || sel.length === 0) sel = resolveCachedSelection();
        if (!sel || sel.length === 0) {
          figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: "请先在画布中选中要整理的框架节点" });
          break;
        }
        let root = sel[0];
        if (sel.length > 1) root = sel[0].parent;
        if (!["FRAME", "GROUP", "SECTION", "COMPONENT", "INSTANCE", "PAGE"].includes(root.type)) {
          figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: `当前选中的是「${root.name}」（${TYPE_CN[root.type] || root.type}），请选中容器框架` });
          break;
        }

        const progress = (stage, pct, m) =>
          figma.ui.postMessage({ type: "ai-progress", stage, pct, msg: m });

        // 1. 扫描图层树
        const tScan0 = Date.now();   // v20261110.53：扫描 + 隐藏节点收集计时
        progress("scan", 5, "正在扫描图层树...");
        const scanResult = await scanTree({ nodeId: root.id });

        // 1.5 收集隐藏节点（visible===false），整理时一并删除（用户要求清理所有隐藏节点）
        const hiddenNodeIds = await collectHidden(root);
        const scanMs = Date.now() - tScan0;   // v20261110.53

        // 2. 读取 AI 配置（fetch 在 UI iframe 发，这里只回传配置）
        const cfg = await figma.clientStorage.getAsync("aiConfig");
        if (!cfg || !cfg.baseUrl || !cfg.apiKey || !cfg.model) {
          figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: "请先在「AI 设置」中填写接口地址、API Key 和模型名" });
          break;
        }

        // 3. 视觉模式：导出渲染图（需网关有可用视觉模型），随报告给 UI
        let imageData = null;
        let renderMs = 0;
        const useVision = !!msg.useVision && !!cfg.visionModel;
        if (useVision) {
          try {
            progress("scan", 12, "正在导出渲染图...");
            const tRender0 = Date.now();   // v20261110.53：渲染图导出很快，但视觉模式的分析慢，分开记更好定位
            imageData = await exportFramePng(root);
            renderMs = Date.now() - tRender0;
          } catch (e) {
            imageData = null;
          }
        }

        // 4. 把扫描报告交给 UI（UI 负责调 LLM 并回传方案）
        figma.ui.postMessage({
          type: "ai-scan-done",
          cfg,
          report: { rootId: root.id, rootName: root.name, total: scanResult.total, nodes: scanResult.nodes, hiddenNodeIds },
          useVision: useVision,
          useLayoutIntent: !!msg.useLayoutIntent, // P0-b：透传给 UI（需同时开视觉模式）
          setExport: msg.setExport !== false,     // 资源文件夹导出属性（默认开）
          groupModules: !!msg.groupModules,        // 业务容器开关，透传给 UI
          imageData: imageData,
          scanMs: scanMs,                          // v20261110.53：分阶段计时回传
          renderMs: renderMs,
        });
      } catch (error) {
        figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: error.message });
      }
      break;
    }
    case "plan-structure": {
      // 阶段 1：只读结构方案预览。零 token、零副作用，不修改任何节点。
      try {
        let sel = figma.currentPage.selection;
        if (!sel || sel.length === 0) sel = resolveCachedSelection();
        if (!sel || sel.length === 0) {
          figma.ui.postMessage({ type: "structure-plan", ok: false, error: "请先在画布中选中要分析的框架节点" });
          break;
        }
        let root = sel[0];
        if (sel.length > 1) root = sel[0].parent;
        if (!root || !("children" in root)) {
          figma.ui.postMessage({ type: "structure-plan", ok: false, error: "选中的节点不是容器，请选中框架 / 分组" });
          break;
        }
        const plan = await describeStructurePlan(root, []);
        figma.ui.postMessage({
          type: "structure-plan", ok: true,
          rootName: String(root.name || ""),
          text: plan.text, count: plan.count, shared: plan.shared, conflicts: plan.conflicts,
        });
      } catch (error) {
        figma.ui.postMessage({ type: "structure-plan", ok: false, error: error.message });
      }
      break;
    }
    // v20261110.19：结构契约 —— 只把「整理后的节点名 + 父子层级」拼成文本。
    // 纯内存、不写文件、不缓存；由 UI 直接随 mvgo 生成请求进 prompt。
    case "export-structure-contract": {
      try {
        const cOpts = msg || {};
        let sel = figma.currentPage.selection;
        if (!sel || sel.length === 0) sel = resolveCachedSelection();
        if (!sel || sel.length === 0) {
          figma.ui.postMessage({ type: "structure-contract", ok: false, error: "请先在画布中选中要整理的框架节点" });
          break;
        }
        let root = sel[0];
        if (sel.length > 1) root = sel[0].parent;
        if (!root || !("children" in root)) {
          figma.ui.postMessage({ type: "structure-contract", ok: false, error: "选中的节点不是容器，请选中框架 / 分组" });
          break;
        }
        // v20261110.28：nodeId 默认关闭，UI 开关显式开启；版本由 UI 的 PLUGIN_VERSION 单一来源传入。
        const contract = buildStructureContract(root, {
          includeIds: !!cOpts.includeIds,
          version: String(cOpts.version || SCHEMA_VERSION),
          // v20261114 P0-2：命名规范仅影响落盘 componentName，组织内 cp-* 语义标签不变。
          namingConvention: String(cOpts.namingConvention || "cp"),
        });
        let fileKey = "";
        try { fileKey = String(figma.fileKey || ""); } catch (e) {}
        const nodeId = String(root.id || "").replace(/:/g, "-");
        const figmaUrl = fileKey
          ? "https://www.figma.com/design/" + fileKey + "/x?node-id=" + nodeId
          : "";
        figma.ui.postMessage({
          type: "structure-contract", ok: true,
          text: contract.text, nodes: contract.nodes, truncated: contract.truncated,
          loops: contract.loops, slots: contract.slots, sections: contract.sections,
          omitted: contract.omitted, includeIds: !!cOpts.includeIds, version: contract.version,
          componentName: contract.componentName,
          rootName: String(root.name || ""), fileKey: fileKey, nodeId: nodeId, figmaUrl: figmaUrl,
        });
        // v20261114：整理结果本地缓存（不依赖后端）；只带本指令产生的字段，避免覆盖另一形态。
        cacheStructureResult({
          fileKey, nodeId, rootName: String(root.name || ""), figmaUrl,
          componentName: contract.componentName, namingConvention: String(cOpts.namingConvention || "cp"),
          contractText: contract.text,
        });
      } catch (error) {
        figma.ui.postMessage({ type: "structure-contract", ok: false, error: error.message });
      }
      break;
    }
    // v20261114 P0-1：结构化 JSON 契约（与 export-structure-contract 同源，输出嵌套 JSON 而非文本）。
    // 供管线按 nodeId 精确回填、按骨架做结构校验；纯内存、不写文件、不缓存。
    case "export-structure-json": {
      try {
        const jOpts = msg || {};
        let sel = figma.currentPage.selection;
        if (!sel || sel.length === 0) sel = resolveCachedSelection();
        if (!sel || sel.length === 0) {
          figma.ui.postMessage({ type: "structure-json", ok: false, error: "请先在画布中选中要整理的框架节点" });
          break;
        }
        let root = sel[0];
        if (sel.length > 1) root = sel[0].parent;
        if (!root || !("children" in root)) {
          figma.ui.postMessage({ type: "structure-json", ok: false, error: "选中的节点不是容器，请选中框架 / 分组" });
          break;
        }
        const json = buildStructureJson(root, {
          includeIds: !!jOpts.includeIds,
          version: String(jOpts.version || SCHEMA_VERSION),
          namingConvention: String(jOpts.namingConvention || "cp"),
          raw: !!jOpts.raw,
        });
        let fileKey = "";
        try { fileKey = String(figma.fileKey || ""); } catch (e) {}
        const nodeId = String(root.id || "").replace(/:/g, "-");
        figma.ui.postMessage({
          type: "structure-json", ok: true,
          json: json,
          text: JSON.stringify(json, null, 2),
          componentName: json.componentName,
          rootName: String(root.name || ""),
          fileKey: fileKey, nodeId: nodeId,
          figmaUrl: fileKey ? "https://www.figma.com/design/" + fileKey + "/x?node-id=" + nodeId : "",
          // v20261114 L0：只读自检摘要，UI 直接展示；完整明细在 json.autoLayout 里。
          autoLayoutText: json.autoLayout ? formatAutoLayoutReport(json.autoLayout) : "",
        });
        // v20261114：整理结果本地缓存（不依赖后端）；只带本指令产生的字段，避免覆盖另一形态。
        cacheStructureResult({
          fileKey, nodeId, rootName: String(root.name || ""),
          componentName: json.componentName, namingConvention: String(jOpts.namingConvention || "cp"),
          json,
        });
      } catch (error) {
        figma.ui.postMessage({ type: "structure-json", ok: false, error: error.message });
      }
      break;
    }
    case "structure-only": {
      // 零 token 结构化整理：完全不调用 LLM，只跑确定性后处理。
      // 纯几何行聚类建业务容器 → 背景收纳 / y 排序 → 资源导出预设。
      // 目的：先把图层变成「大模型一眼能看出组件边界」的结构；语义命名仍由后续 AI 整理补上。
      try {
        lastOrganizeUndoAvailable = false;
        resetGroupDiag(); resetStructLog();
        const tStruct0 = Date.now();   // v20261110.53：零 token 路径的确定性整理计时
        let sel = figma.currentPage.selection;
        if (!sel || sel.length === 0) sel = resolveCachedSelection();
        if (!sel || sel.length === 0) {
          figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: "请先在画布中选中要整理的结构节点" });
          break;
        }
        let root = sel[0];
        if (sel.length > 1) root = sel[0].parent;
        if (!root || !("children" in root)) {
          figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: "选中的节点不是容器，请选中框架 / 分组" });
          break;
        }
        let qualityBefore = null, qualityAfter = null;
        try { qualityBefore = collectQualityMetrics(root); } catch (e) {}
        figma.ui.postMessage({ type: "ai-progress", stage: "apply", pct: 20, msg: "零 token 结构化整理：纯几何行聚类建组..." });
        const setExport = msg.setExport !== false;
        const groupModules = msg.groupModules !== false; // 默认开
        const summary = {
          rename: 0, reparent: 0, reorder: 0, group: 0, delete: 0,
          decorMerged: 0, sorted: 0, skippedOverlap: 0,
          conflict: 0, doubleConfirmed: 0, intentShared: 0, orderMismatch: 0,
          exportSet: 0, exportCleared: 0, exportLoose: 0,
          foregroundKept: 0, forcedBg: 0, groupFailed: 0, singleDecor: 0, unlocked: 0, prefixFixed: 0,
          moduleGroups: 0, moduleSkipped: 0, moduleGroupFailed: 0,
          containers: 0, layoutErrors: 0, layoutErrorMsg: "", moduleExpanded: 0,
          geometricGroups: 0, geoCandidates: 0, geoRows: 0, geoSpanKept: 0, geoGroupFailed: 0,
          geoColumnsKept: 0, geoProtectedSets: 0, geoRowRejected: 0, geoLoopNamed: 0,
          moduleExcluded: 0,
          chartNormalized: 0, chartAtFixed: 0,
          arcChartPromoted: 0, arcChartExportCleared: 0, arcChartFailed: 0,
          legendNormalized: 0, legendSwatchFixed: 0,
          chartLegendGuarded: 0, chartLegendSkippedMerge: 0,
          lineChartPromoted: 0, lineChartExportCleared: 0, lineChartFailed: 0,
          chartSeriesFolders: 0, chartExportsBlocked: 0, chartSubtreeGuarded: 0,
          barChartPromoted: 0, barChartFailed: 0,
          leafChartDemoted: 0, leafChartBgRestored: 0, leafChartExportRestored: 0, leafChartFailed: 0,
          graphicFolders: 0, graphicMerged: 0,           graphicOutside: 0, graphicFailed: 0,
          graphicRunFolders: 0, graphicRunMerged: 0, graphicRunFailed: 0,
          slotConCreated: 0, slotConReused: 0, slotConMerged: 0, slotConModules: 0,
          slotConOutside: 0, slotConFailed: 0,
          subHeadersDemoted: 0, subSlotConsDemoted: 0,
          slotSorted: 0, slotSortPinned: 0, slotConEmptyRemoved: 0,
          autoLayoutSortSkipped: 0, slotSortAutoLayoutSkipped: 0,
          badgeFound: 0, badgeRenamed: 0, badgeMatched: 0, badgeGroupRenamed: 0, badgeErrors: 0,
          bandsContainerFallback: 0,
          blurBackdropPinned: 0, bgProtected: 0, imgContentNamed: 0, sortPinned: 0,
          sectionGroupsCreated: 0, sectionGroupsMerged: 0, sectionGroupsPinned: 0,
          sectionContainersRenamed: 0, sectionGroupFailed: 0,
          bandErrors: 0, bandsDetected: 0, bandsPinned: 0, bandGroupsCreated: 0,
          bandContainersRenamed: 0, bandHeaderCreated: 0, bandFoldersDissolved: 0,
          rootHeaderPromoted: 0, rootHeaderAlready: 0, rootHeaderNoCandidate: 0, rootHeaderFailed: 0,
          bandFoldersRemoved: 0, bandGroupFailed: 0, bandIdempotent: 0,
          rootBackdropMoved: 0, rootBackdropOrdered: 0,
        };
        const intentCtx = { intentMap: new Map(), moduleOrder: new Map(), sharedIds: new Set(), useLayoutIntent: false };
        let planPreview = null;
        planPreview = await describeStructurePlan(root, []).catch(() => null);
        if (groupModules) { try { await buildModuleGroups([], root, summary); } catch (e6) {} }
        const containers = [], seen = new Set();
        const collect = (n, depth) => {
          if (!n || depth > 40 || seen.has(n.id)) return;
          seen.add(n.id);
          if ("children" in n && n.type !== "PAGE") containers.push(n);
          if ("children" in n && depth < 40) for (const c of n.children) collect(c, depth + 1);
        };
        collect(root, 0);
        // v20261110.16：先把图表/矢量仪表容器内部的零散 VECTOR 合并成 img-* 资源文件夹、
        // 并把 echarts- 假图表名归一化，再跑通用装饰收纳（organizeLayout 会跳过已标记容器）。
        // v20261111.35 P2：badge 必须先于 organizeLayout（内部 groupChildrenByCategory）归一化，
        // 否则 4 个纯数字徽标会被按 icon-* 前缀并成一张静态图标并挂 SVG 导出。
        try { normalizeTabBadges(root, summary); } catch (e14) { summary.badgeErrors = (Number(summary.badgeErrors) || 0) + 1; }
        // v20261111.64：@echarts/* / @antd/* 误命名到叶子（典型是背景 VECTOR）时按几何降级，
        // 必须在 organizeGraphicContainers / createSlotConGroup 之前，否则背景会被收进 slot-con 且丢导出。
        try { demoteLeafCharts(root, summary); } catch (e21) { summary.leafChartFailed = (Number(summary.leafChartFailed) || 0) + 1; }
        try { organizeGraphicContainers(root, summary); } catch (e7) { summary.graphicFailed++; }
        // v20261111.59：真环形图按几何补升级 + 同级图例归一化（必须在 applyAssetExports 之前，
        // 否则内部弧段仍会被挂 PNG@2x 固化成位图）。
        try { promoteArcCharts(root, summary); } catch (e15) { summary.arcChartFailed++; }
        try { normalizeChartLegend(root, summary); } catch (e16) {}
        // v20261110.18：普通业务容器里的连续零散图形（Ellipse / bg-*）按段合并，z 序等价。
        try { mergeLooseGraphicRuns(containers, summary); } catch (e8) { summary.graphicRunFailed++; }
        summary.containers = containers.length;
        for (const container of containers) {
          try { organizeLayout(container, summary, intentCtx); }
          catch (e3) { summary.layoutErrors++; summary.layoutErrorMsg = String((e3 && e3.message) || e3).slice(0, 200); }
        }
        // v20261111.61：AI 命名态若把面板主标题降级成 section-title-*，先按几何提升回根级 header。
        // 必须在 demoteSubHeaders / groupSectionsByTitle / createSlotConGroup 之前，否则标题已进 slot-con。
        try { promoteRootHeader(root || containers[0] || null, summary); } catch (e19) { summary.rootHeaderFailed = (Number(summary.rootHeaderFailed) || 0) + 1; }
        // v20261110.24：先归一化根级骨架命名（唯一 header / 唯一 slot-con），再建组。
        try { demoteSubHeaders(root || containers[0] || null, summary); } catch (e10) {}
        // v20261110.26：按副标题把内容切成子模块 Group，再统一收进 slot-con。
        try { groupSectionsByTitle(root || containers[0] || null, summary); } catch (e12) {}
        // v20261110.21：收尾建组件骨架 —— 根下 header/bg 保持平级，其余内容（含所有模块 Group）收进一个真 slot-con Group。
        try { createSlotConGroup(root || containers[0] || null, summary); } catch (e9) { summary.slotConFailed++; }
        // v20261111.31 Step 2：按 y 空白间隙真建 header / section-NN-*，并拆分跨带资源文件夹。
        try { groupBySpatialBands(root || containers[0] || null, summary); } catch (e13) { summary.bandErrors++; }
        // v20261110.25：建组后按视觉顺序重排槽内直接子级（重叠节点 pin 住不动）。
        try { sortSlotConChildren(root || containers[0] || null, summary); } catch (e11) {}
        // v20261111.60：结构分组全部完成后再升级真折线图（必须在 applyAssetExports 之前，
        // 既拿到已合并的 img-* 文件夹作为输入，又不会被 groupBySpatialBands 再切一次带）。
        try { promoteLineCharts(root || containers[0] || null, summary); } catch (e17) { summary.lineChartFailed++; }
        // v20261111.64：与折线图并列补柱状图的确定性升级，同样必须在 applyAssetExports 之前。
        try { promoteBarCharts(root || containers[0] || null, summary); } catch (e22) { summary.barChartFailed = (Number(summary.barChartFailed) || 0) + 1; }
        try { normalizeChartLegend(root || containers[0] || null, summary); } catch (e18) {}
        if (setExport) { try { applyAssetExports(root, summary); } catch (e4) {} }
        let total = 0;
        const countAll = (n, depth) => {
          if (!n || depth > 40) return;
          total++;
          if ("children" in n) for (const c of n.children) countAll(c, depth + 1);
        };
        countAll(root, 0);
        try { qualityAfter = collectQualityMetrics(root); } catch (e) {}
        figma.ui.postMessage({
          type: "ai-organize-result", ok: true, structureOnly: true,
          postMs: Date.now() - tStruct0,   // v20261110.53
          total, renamed: 0, reparented: 0, reordered: 0, grouped: 0, deleted: 0,
          decorMerged: summary.decorMerged, sorted: summary.sorted,
          chartLegendGuarded: summary.chartLegendGuarded,
          chartLegendSkippedMerge: summary.chartLegendSkippedMerge,
          skippedOverlap: summary.skippedOverlap, conflict: 0, doubleConfirmed: 0,
          intentShared: 0, orderMismatch: 0,
          rootHeaderPromoted: summary.rootHeaderPromoted, rootHeaderAlready: summary.rootHeaderAlready,
          rootHeaderPromotedFrom: summary.rootHeaderPromotedFrom, rootHeaderFailed: summary.rootHeaderFailed,
          exportSet: summary.exportSet, exportCleared: summary.exportCleared, exportLoose: summary.exportLoose,
          foregroundKept: summary.foregroundKept, forcedBg: summary.forcedBg,
          groupFailed: summary.groupFailed, singleDecor: summary.singleDecor,
          unlocked: summary.unlocked, prefixFixed: summary.prefixFixed,
          moduleGroups: 0, moduleSkipped: 0, moduleGroupFailed: 0,
          containers: summary.containers, layoutErrors: summary.layoutErrors,
          groupModulesOn: groupModules, intentModuleCount: 0, moduleExpanded: 0,
          geometricGroups: summary.geometricGroups, geoCandidates: summary.geoCandidates,
          geoRows: summary.geoRows, geoSpanKept: summary.geoSpanKept,
          geoColumnsKept: summary.geoColumnsKept, geoProtectedSets: summary.geoProtectedSets,
          geoRowRejected: summary.geoRowRejected, geoLoopNamed: summary.geoLoopNamed,
          geoGroupFailed: summary.geoGroupFailed,
          moduleExcluded: summary.moduleExcluded,
          chartNormalized: summary.chartNormalized, chartAtFixed: summary.chartAtFixed,
          graphicFolders: summary.graphicFolders, graphicMerged: summary.graphicMerged,
          graphicOutside: summary.graphicOutside, graphicFailed: summary.graphicFailed,
          graphicRunFolders: summary.graphicRunFolders, graphicRunMerged: summary.graphicRunMerged,
          graphicRunFailed: summary.graphicRunFailed,
          slotConCreated: summary.slotConCreated, slotConReused: summary.slotConReused,
          slotConMerged: summary.slotConMerged, slotConModules: summary.slotConModules,
          slotConOutside: summary.slotConOutside, slotConFailed: summary.slotConFailed,
          subHeadersDemoted: summary.subHeadersDemoted, subSlotConsDemoted: summary.subSlotConsDemoted,
          slotSorted: summary.slotSorted, slotSortPinned: summary.slotSortPinned,
          slotConEmptyRemoved: summary.slotConEmptyRemoved,
          sectionGroupsCreated: summary.sectionGroupsCreated,
          sectionGroupsMerged: summary.sectionGroupsMerged,
          sectionGroupsPinned: summary.sectionGroupsPinned,
          sectionContainersRenamed: summary.sectionContainersRenamed,
          groupErrorMsg: groupDiag.err, frameGroups: groupDiag.frames,
          structureList: structLog.join("\n"),
          autoLayoutText: autoLayoutTextFor(root), // v20261114 L0：整理后只读 AL 自检，不写图层
          structurePlanText: planPreview ? planPreview.text : "",
          layoutErrorMsg: summary.layoutErrorMsg, failed: 0, opsCount: 0,
          qualityBefore: qualityBefore, qualityAfter: qualityAfter,
          qualityText: qualityDiffText(qualityBefore, qualityAfter),
        });
        figma.commitUndo();
        lastOrganizeUndoAvailable = true;
        publishUndoState();
      } catch (error) {
        publishUndoState();
        figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: error.message });
      }
      break;
    }
    case "apply-ai-ops": {
      // 执行 AI 返回的重组方案：rename / reparent / reorder / group / delete
      try {
        lastOrganizeUndoAvailable = false;
        resetGroupDiag(); resetStructLog();
        // v20261110.15：planPreview 必须声明在外层作用域。
        // .12 曾把它声明在「P0-a 后处理」的内层 try 里，结果消息在外层引用 ⇒ ReferenceError
        // 'planPreview' is not defined（整理其实已执行完，只是回报失败）。node --check 查不出这种错误。
        let planPreview = null;
        // v20261110.15 教训：内层 try 算出的值外层要用，必须在外层先声明。
        // v20261114 L0：整理根同理——内层 const root 作用域不覆盖结果消息，需在外层持有。
        let applyRoot = null;
        let qualityBefore = null, qualityAfter = null;
        const ops = Array.isArray(msg.ops) ? msg.ops : [];
        const tApply0 = Date.now();   // v20261110.53：应用阶段计时（含 P0-a 确定性后处理）
        // P0-b：视觉布局意图（可选）。模型只描述「是什么/属于哪个模块/是否共享」，不输出结构变更。
        const setExport = msg.setExport !== false; // 资源导出属性开关（默认开）
        const groupModules = !!msg.groupModules;    // 按视觉模块生成业务容器（独立开关，默认关）
        const useLayoutIntent = !!msg.useLayoutIntent && msg.layoutIntent && typeof msg.layoutIntent === "object";
        const intentMap = new Map();      // nodeId -> { role, shared, spans }
        const moduleOrder = new Map();    // nodeId -> 视觉从上到下的序号(1..N)
        const sharedIds = new Set();      // 跨模块共享装饰：留在共同父级，不按模块切分
        if (useLayoutIntent) {
          for (const d of (msg.layoutIntent.decorations || [])) {
            if (d && d.nodeId) { intentMap.set(d.nodeId, d); if (d.shared) sharedIds.add(d.nodeId); }
          }
          for (const m of (msg.layoutIntent.modules || [])) {
            if (!m || !Array.isArray(m.nodeIds)) continue;
            for (const id of m.nodeIds) if (Number.isFinite(Number(m.order))) moduleOrder.set(id, Number(m.order));
          }
        }
        const moduleGroups = useLayoutIntent ? (msg.layoutIntent.modules || []) : [];
        const intentCtx = { intentMap, moduleOrder, sharedIds, useLayoutIntent };
        let ok = 0, fail = 0;
        const summary = {
          rename: 0, reparent: 0, reorder: 0, group: 0, delete: 0,
          decorMerged: 0, sorted: 0, skippedOverlap: 0,
          conflict: 0, doubleConfirmed: 0, intentShared: 0, orderMismatch: 0,
          exportSet: 0, exportCleared: 0, exportLoose: 0,
          foregroundKept: 0, forcedBg: 0, groupFailed: 0, singleDecor: 0, unlocked: 0, prefixFixed: 0,
          moduleGroups: 0, moduleSkipped: 0, moduleGroupFailed: 0,
          containers: 0, layoutErrors: 0, layoutErrorMsg: "", moduleExpanded: 0,
          geometricGroups: 0, geoCandidates: 0, geoRows: 0, geoSpanKept: 0, geoGroupFailed: 0,
          geoColumnsKept: 0, geoProtectedSets: 0, geoRowRejected: 0, geoLoopNamed: 0,
          moduleExcluded: 0,
          chartNormalized: 0, chartAtFixed: 0,
          arcChartPromoted: 0, arcChartExportCleared: 0, arcChartFailed: 0,
          legendNormalized: 0, legendSwatchFixed: 0,
          chartLegendGuarded: 0, chartLegendSkippedMerge: 0,
          lineChartPromoted: 0, lineChartExportCleared: 0, lineChartFailed: 0,
          chartSeriesFolders: 0, chartExportsBlocked: 0, chartSubtreeGuarded: 0,
          barChartPromoted: 0, barChartFailed: 0,
          leafChartDemoted: 0, leafChartBgRestored: 0, leafChartExportRestored: 0, leafChartFailed: 0,
          graphicFolders: 0, graphicMerged: 0,           graphicOutside: 0, graphicFailed: 0,
          graphicRunFolders: 0, graphicRunMerged: 0, graphicRunFailed: 0,
          slotConCreated: 0, slotConReused: 0, slotConMerged: 0, slotConModules: 0,
          slotConOutside: 0, slotConFailed: 0,
          subHeadersDemoted: 0, subSlotConsDemoted: 0,
          slotSorted: 0, slotSortPinned: 0, slotConEmptyRemoved: 0,
          autoLayoutSortSkipped: 0, slotSortAutoLayoutSkipped: 0,
          badgeFound: 0, badgeRenamed: 0, badgeMatched: 0, badgeGroupRenamed: 0, badgeErrors: 0,
          bandsContainerFallback: 0,
          blurBackdropPinned: 0, bgProtected: 0, imgContentNamed: 0, sortPinned: 0,
          sectionGroupsCreated: 0, sectionGroupsMerged: 0, sectionGroupsPinned: 0,
          sectionContainersRenamed: 0, sectionGroupFailed: 0,
          bandErrors: 0, bandsDetected: 0, bandsPinned: 0, bandGroupsCreated: 0,
          bandContainersRenamed: 0, bandHeaderCreated: 0, bandFoldersDissolved: 0,
          rootHeaderPromoted: 0, rootHeaderAlready: 0, rootHeaderNoCandidate: 0, rootHeaderFailed: 0,
          bandFoldersRemoved: 0, bandGroupFailed: 0, bandIdempotent: 0,
          rootBackdropMoved: 0, rootBackdropOrdered: 0,
        };
        const ACT_CN = { rename: "改名", reparent: "归父", reorder: "排序", group: "成组", delete: "删除" };
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i] || {};
          const action = op.action;
          figma.ui.postMessage({
            type: "ai-progress",
            stage: "apply",
            pct: 30 + Math.round(((i + 1) / Math.max(ops.length, 1)) * 65),
            msg: `执行中 ${i + 1}/${ops.length}: ${ACT_CN[action] || action} ${op.name || op.nodeId || ""}`,
          });
          try {
            // 整理时解除节点锁定再操作：被锁定的节点（如图标实例 Frame 2136637422）可能因锁定导致改名/重组失败，
            // 解除后执行，避免「默认名图标/图层没被处理」的假象。
            const unlock = (n) => { try { if (n && n.locked) n.locked = false; } catch (e) {} };
            if (action === "rename" && op.nodeId && op.name) {
              const node = await figma.getNodeByIdAsync(op.nodeId);
              if (node) { unlock(node); node.name = op.name; ok++; summary.rename++; } else fail++;
            } else if (action === "reorder" && op.nodeId) {
              const idx = Number(op.index);
              const node = await figma.getNodeByIdAsync(op.nodeId);
              if (node && node.parent && Number.isFinite(idx)) {
                unlock(node);
                const max = node.parent.children.length;
                node.parent.insertChild(Math.max(0, Math.min(Math.round(idx), max)), node); // 越界 index 钳制，避免抛错
                ok++; summary.reorder++;
              } else fail++;
            } else if (action === "reparent" && op.nodeId && op.parentId) {
              const node = await figma.getNodeByIdAsync(op.nodeId);
              const target = await figma.getNodeByIdAsync(op.parentId);
              if (node && target && typeof target.appendChild === "function") {
                unlock(node); unlock(target);
                const idx = Number(op.index);
                if (Number.isFinite(idx)) target.insertChild(Math.round(idx), node);
                else target.appendChild(node); // Figma 原生 reparent 自动保持绝对位置
                ok++; summary.reparent++;
              } else fail++;
            } else if (action === "group" && Array.isArray(op.nodeIds) && op.nodeIds.length >= 2) {
              const nodes = [];
              for (const id of op.nodeIds) { const n = await figma.getNodeByIdAsync(id); if (n) { unlock(n); nodes.push(n); } }
              if (nodes.length >= 2) {
                const grp = safeGroup(nodes, op.name); // 同父级合组；跨父级自动 reparent 后再合组
                if (grp) ok++; else fail++;
                if (grp) summary.group++;
              } else fail++;
            } else if (action === "delete" && op.nodeId) {
              const node = await figma.getNodeByIdAsync(op.nodeId);
              if (node) { unlock(node); node.remove(); ok++; summary.delete++; } else fail++;
            } else {
              fail++;
            }
          } catch (e) { fail++; }
        }
        // P0-a：确定性布局后处理（约定 > 配置）。
        // 从被整理的根开始递归遍历所有容器，而不再只扫「被 op 命中的父级」——
        // 后者会让整段没有 rename 的容器（背景层最常出现在这里）永远漏合并。
        try {
          const root = msg.rootId ? await figma.getNodeByIdAsync(msg.rootId) : null;
          applyRoot = root; // v20261114 L0：供外层结果消息做只读 AL 自检（不写图层）
          try { qualityBefore = root ? collectQualityMetrics(root) : null; } catch (e) {}
          // 阶段 1 快照：建组前先算只读结构方案（视觉语义分区 + 几何兜底），用于方案/实际对照。
          planPreview = await describeStructurePlan(root, moduleGroups).catch(() => null);
          // P1：先按模块建组（视觉语义 + 纯几何行聚类兜底），再 collect，
          // 保证新建容器也参与后续整理，且趁背景还没被收走、节点仍同父级时完成。
          if (groupModules) { try { await buildModuleGroups(moduleGroups, root, summary); } catch (e5) {} }
          const containers = [];
          const seen = new Set();
          const collect = (n, depth) => {
            if (!n || depth > 40 || seen.has(n.id)) return;
            seen.add(n.id);
            if ("children" in n && n.type !== "PAGE") containers.push(n);
            if ("children" in n && depth < 40) {
              for (const c of n.children) collect(c, depth + 1);
            }
          };
          if (root) collect(root, 0);
          else {
            // 兜底：未提供 rootId 时退回 touchedParents
            const touched = new Set();
            for (const op of ops) {
              if (op.action === "delete" || !op.nodeId) continue;
              try {
                const n = await figma.getNodeByIdAsync(op.nodeId);
                if (n && n.parent && n.parent.type !== "PAGE") touched.add(n.parent.id);
              } catch (e2) {}
            }
            for (const pid of touched) {
              const p = await figma.getNodeByIdAsync(pid);
              if (p) collect(p, 0);
            }
          }
          // v20261110.16：图表/矢量仪表容器治理（命名归一化 + 零散矢量合并 + 导出预设）。
          // 放在 ops 执行之后、通用 organizeLayout 之前；无 rootId 的兜底路径用 containers[0]。
          // v20261111.35 P2：同上，两条主流程都必须先归一化 badge。
          try { normalizeTabBadges(root || containers[0] || null, summary); } catch (e14) { summary.badgeErrors = (Number(summary.badgeErrors) || 0) + 1; }
          // v20261111.64：同上，AI / 视觉命名态也要先按几何降级 @ 前缀叶子，再走容器治理。
          try { demoteLeafCharts(root || containers[0] || null, summary); } catch (e21) { summary.leafChartFailed = (Number(summary.leafChartFailed) || 0) + 1; }
          try { organizeGraphicContainers(root || containers[0] || null, summary); } catch (e7) { summary.graphicFailed++; }
          // v20261111.59：同上，AI 命名态也要按几何补升级真环形图并归一化同级图例。
          try { promoteArcCharts(root || containers[0] || null, summary); } catch (e15) { summary.arcChartFailed++; }
          try { normalizeChartLegend(root || containers[0] || null, summary); } catch (e16) {}
          // v20261110.18：普通业务容器里的连续零散图形按段合并，插回原位保证视觉零改动。
          try { mergeLooseGraphicRuns(containers, summary); } catch (e8) { summary.graphicRunFailed++; }
          summary.containers = containers.length;
          for (const container of containers) {
            try { organizeLayout(container, summary, intentCtx); }
            catch (e3) {
              summary.layoutErrors++;
              summary.layoutErrorMsg = String((e3 && e3.message) || e3).slice(0, 200);
            }
          }
          // v20261111.61：同上，AI / 视觉命名态也要先把面板主标题按几何提升回根级 header。
          try { promoteRootHeader(root || containers[0] || null, summary); } catch (e20) { summary.rootHeaderFailed = (Number(summary.rootHeaderFailed) || 0) + 1; }
          // v20261110.24：先归一化根级骨架命名（唯一 header / 唯一 slot-con），再建组。
          try { demoteSubHeaders(root || containers[0] || null, summary); } catch (e10) {}
          // v20261110.26：按副标题把内容切成子模块 Group，再统一收进 slot-con。
          try { groupSectionsByTitle(root || containers[0] || null, summary); } catch (e12) {}
          // v20261110.21：收尾建组件骨架 —— 视觉/几何模块与其它内容统一收进一个真 slot-con Group。
          try { createSlotConGroup(root || containers[0] || null, summary); } catch (e9) { summary.slotConFailed++; }
          // v20261111.31 Step 2：按 y 空白间隙真建 header / section-NN-*，并拆分跨带资源文件夹。
          try { groupBySpatialBands(root || containers[0] || null, summary); } catch (e13) { summary.bandErrors++; }
          // v20261110.25：建组后按视觉顺序重排槽内直接子级（重叠节点 pin 住不动）。
          try { sortSlotConChildren(root || containers[0] || null, summary); } catch (e11) {}
          // v20261111.60：同上，AI / 视觉命名态也要按路径几何补升级真折线图，并补跑图例归一。
          try { promoteLineCharts(root || containers[0] || null, summary); } catch (e17) { summary.lineChartFailed++; }
          // v20261111.64：同上，AI / 视觉命名态也按柱体几何补升级，并补跑图例归一。
          try { promoteBarCharts(root || containers[0] || null, summary); } catch (e22) { summary.barChartFailed = (Number(summary.barChartFailed) || 0) + 1; }
          try { normalizeChartLegend(root || containers[0] || null, summary); } catch (e18) {}
          // 收尾：给所有资源文件夹挂导出预设（icon→SVG / img·bg→PNG@2x），并清掉内部子节点的导出项。
          // v20261111.60：applyAssetExports 内部对 @echarts/* 子树有硬门禁，不会把真图表位图化。
          const exportRoot = root || containers[0] || null; // 无 rootId 的兜底路径也要覆盖
          if (setExport) { try { applyAssetExports(exportRoot, summary); } catch (e4) {} }
          try { qualityAfter = root ? collectQualityMetrics(root) : null; } catch (e) {}
        } catch (e) { /* 后处理失败不影响已完成的命名 */ }
        figma.ui.postMessage({
          type: "ai-organize-result",
          ok: true,
          total: msg.total || 0,
          renamed: summary.rename,
          reparented: summary.reparent,
          reordered: summary.reorder,
          grouped: summary.group,
          deleted: summary.delete,
          decorMerged: summary.decorMerged,
          sorted: summary.sorted,
          chartLegendGuarded: summary.chartLegendGuarded,
          chartLegendSkippedMerge: summary.chartLegendSkippedMerge,
          skippedOverlap: summary.skippedOverlap,
          conflict: summary.conflict,
          doubleConfirmed: summary.doubleConfirmed,
          intentShared: summary.intentShared,
          orderMismatch: summary.orderMismatch,
          rootHeaderPromoted: summary.rootHeaderPromoted, rootHeaderAlready: summary.rootHeaderAlready,
          rootHeaderPromotedFrom: summary.rootHeaderPromotedFrom, rootHeaderFailed: summary.rootHeaderFailed,
          exportSet: summary.exportSet,
          exportCleared: summary.exportCleared,
          exportLoose: summary.exportLoose,
          foregroundKept: summary.foregroundKept,
          forcedBg: summary.forcedBg,
          groupFailed: summary.groupFailed,
          singleDecor: summary.singleDecor,
          unlocked: summary.unlocked,
          prefixFixed: summary.prefixFixed,
          moduleGroups: summary.moduleGroups,
          moduleSkipped: summary.moduleSkipped,
          moduleGroupFailed: summary.moduleGroupFailed,
          containers: summary.containers,
          layoutErrors: summary.layoutErrors,
          groupModulesOn: groupModules,
          intentModuleCount: moduleGroups.length,
          moduleExpanded: summary.moduleExpanded,
          geometricGroups: summary.geometricGroups,
          geoCandidates: summary.geoCandidates,
          geoRows: summary.geoRows,
          geoSpanKept: summary.geoSpanKept,
          geoGroupFailed: summary.geoGroupFailed,
          moduleExcluded: summary.moduleExcluded,
          chartNormalized: summary.chartNormalized, chartAtFixed: summary.chartAtFixed,
          graphicFolders: summary.graphicFolders, graphicMerged: summary.graphicMerged,
          graphicOutside: summary.graphicOutside, graphicFailed: summary.graphicFailed,
          graphicRunFolders: summary.graphicRunFolders, graphicRunMerged: summary.graphicRunMerged,
          graphicRunFailed: summary.graphicRunFailed,
          slotConCreated: summary.slotConCreated, slotConReused: summary.slotConReused,
          slotConMerged: summary.slotConMerged, slotConModules: summary.slotConModules,
          slotConOutside: summary.slotConOutside, slotConFailed: summary.slotConFailed,
          subHeadersDemoted: summary.subHeadersDemoted, subSlotConsDemoted: summary.subSlotConsDemoted,
          slotSorted: summary.slotSorted, slotSortPinned: summary.slotSortPinned,
          slotConEmptyRemoved: summary.slotConEmptyRemoved,
          sectionGroupsCreated: summary.sectionGroupsCreated,
          sectionGroupsMerged: summary.sectionGroupsMerged,
          sectionGroupsPinned: summary.sectionGroupsPinned,
          sectionContainersRenamed: summary.sectionContainersRenamed,
          groupErrorMsg: groupDiag.err, frameGroups: groupDiag.frames,
          structureList: structLog.join("\n"),
          autoLayoutText: autoLayoutTextFor(applyRoot), // v20261114 L0：整理后只读 AL 自检，不写图层
          structurePlanText: planPreview ? planPreview.text : "",
          layoutErrorMsg: summary.layoutErrorMsg,
          // v20261111.44 修复：AI 路径的结果消息漏了这三项，护栏实际命中（几何计算里有值）
          // 但面板恒显示 0，用户无法判断护栏是否生效。
          geoColumnsKept: summary.geoColumnsKept,
          geoProtectedSets: summary.geoProtectedSets,
          geoRowRejected: summary.geoRowRejected, geoLoopNamed: summary.geoLoopNamed,
          qualityBefore: qualityBefore, qualityAfter: qualityAfter,
          qualityText: qualityDiffText(qualityBefore, qualityAfter),
          failed: fail,
          opsCount: ops.length,
          postMs: Date.now() - tApply0,   // v20261110.53
        });
        figma.commitUndo();
        lastOrganizeUndoAvailable = true;
        publishUndoState();
      } catch (error) {
        publishUndoState();
        figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: error.message });
      }
      break;
    }
    case "save-ai-config": {
      try {
        await figma.clientStorage.setAsync("aiConfig", {
          baseUrl: msg.baseUrl || "",
          apiKey: msg.apiKey || "",
          model: msg.model || "",
          visionModel: msg.visionModel || "",
          organizeModel: msg.organizeModel || "", // v20261111.47：整理专用模型（可填不思考的模型）
          useVision: !!msg.useVision,
          useLayoutIntent: msg.autoLayoutIntent !== false, // 兼容旧读取路径，值与新键同步
          autoLayoutIntent: msg.autoLayoutIntent !== false, // v20261110.14 新键：旧配置无此键 → 默认开启
          setExport: msg.setExport !== false,
          autoModuleGroups: !!msg.groupModules, // v20261110.8 新键：旧配置无此键 → 默认开启
          disableThinking: !!msg.disableThinking,
          namingRef: msg.namingRef || "",
          // v20261114 P0-2：组件命名规范（cp 默认 / kebab=c-tunnel-* / pascal=PascalCase）。
          // 仅影响「落盘给生成管线的 componentName」，组织内语义标签 cp-* 保持不变。
          namingConvention: msg.namingConvention || "cp",
        });
        figma.ui.postMessage({ type: "ai-config-saved", ok: true });
      } catch (error) {
        figma.ui.postMessage({ type: "ai-config-saved", ok: false, error: error.message });
      }
      break;
    }
    case "load-ai-config": {
      const cfg = await figma.clientStorage.getAsync("aiConfig");
      figma.ui.postMessage({ type: "ai-config-loaded", cfg: cfg || {} });
      break;
    }
  }
};

// 将 Uint8Array 转 base64（不依赖 btoa，Figma 沙箱稳妥）
function bytesToBase64(u8) {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  const len = u8.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = u8[i], b1 = u8[i + 1], b2 = u8[i + 2];
    out += table[b0 >> 2];
    out += table[((b0 & 3) << 4) | (b1 >> 4)];
    out += b1 === undefined ? "=" : table[((b1 & 15) << 2) | (b2 >> 6)];
    out += b2 === undefined ? "=" : table[b2 & 63];
  }
  return out;
}

// 导出选中 Frame 为降分辨率 PNG（base64），用于视觉模型对照渲染图定层级/顺序
// 降分辨率到 maxWidth 以内，避免 base64 过大撑爆请求体（重蹈 504 覆辙）
async function exportFramePng(node, maxWidth) {
  maxWidth = maxWidth || 900;
  const w = node.width || 0;
  const scale = w > maxWidth ? maxWidth / w : 1;
  const bytes = await node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: scale },
  });
  return bytesToBase64(bytes);
}

// collectHidden：收集子树中所有「最顶层隐藏节点」（visible===false）。
// 隐藏节点在 Figma 中整棵子树一并隐藏，记录最顶层即可（删除它其子树随之移除，避免重复删除）。
async function collectHidden(node) {
  const ids = [];
  function walk(n) {
    if (n.visible === false) { ids.push(n.id); return; } // 记录并停止下钻
    if ("children" in n) for (const c of n.children) walk(c);
  }
  walk(node);
  return ids;
}

// 兜底 3（v20261110.10）：figma.group 全路径不可用时的「透明 Frame 容器」。
// v20261110.8 实测日志：建组失败 78 / 背景收纳 0 / 模块建组失败 2 ⇒ figma.group 在该文件里 100% 抛错，
// 所有「判据/阈值/视觉意图」修复都建在它之上，所以前面 7 版一直合不了。这里彻底不依赖 figma.group。
// 透明化：fills=[] / strokes=[] / clipsContent=false，避免深色大屏白底、光晕被裁。
// 坐标：先取包围盒，reparent 后显式把子节点相对坐标换算到 Frame 内，保证视觉零位移。
function frameFallback(nodes, name) {
  const parent = nodes[0] && nodes[0].parent;
  if (!parent || typeof parent.appendChild !== "function") return null;
  const src = nodes.filter(n => n && n.parent === parent);
  if (!src.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of src) {
    const x = Number(n.x) || 0, y = Number(n.y) || 0;
    const w = Number(n.width) || 0, h = Number(n.height) || 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  let frame;
  try { frame = figma.createFrame(); } catch (e) { noteGroupError(e); return null; }
  try {
    frame.name = name || "group";
    frame.x = minX; frame.y = minY;
    frame.resize(Math.max(1, maxX - minX), Math.max(1, maxY - minY));
    frame.fills = [];
    frame.strokes = [];
    frame.clipsContent = false;
    // 父级若是 Auto Layout，把容器设成绝对定位，避免被当成一个 flow item 重排其他子节点
    if (parent.layoutMode && parent.layoutMode !== "NONE") frame.layoutPositioning = "ABSOLUTE";
    parent.appendChild(frame);
  } catch (e) { noteGroupError(e); try { frame.remove(); } catch (e2) {} return null; }
  let moved = 0;
  for (const n of src) {
    const rx = Number(n.x) || 0, ry = Number(n.y) || 0;
    try {
      frame.appendChild(n);
      n.x = rx - minX;
      n.y = ry - minY;
      moved++;
    } catch (e) { noteGroupError(e); }
  }
  if (!moved) { try { frame.remove(); } catch (e2) {} return null; }
  groupDiag.frames++;
  return frame;
}

// safeGroup：把节点合组。figma.group 要求所有节点是同父级兄弟，否则抛错；
// 三条 figma.group 路径全失败时降级为透明 Frame，保证「合成」这件事不再依赖单一 API。
function safeGroup(nodes, name) {
  // 允许单节点成组（等同 Figma 里对单个图层 Ctrl+G），用于把孤立 icon-/img- 资源收进语义文件夹。
  if (!nodes || nodes.length < 1) return null;
  // ★ v20261110.11 真根因：官方签名是 group(nodes, parent, index?)，parent 是【必需】参数。
  // 之前所有版本都写成 group(nodes) ⇒ 真实报错「in group: Second argument to group() must be provided」
  // ⇒ figma.group 100% 抛错 ⇒ .10 只能靠 41 个透明 Frame 硬兜底，产出的是 FRAME 不是 GROUP。
  const parent = nodes[0] && nodes[0].parent;
  if (!parent || typeof parent.appendChild !== "function") return frameFallback(nodes, name);
  try {
    const g = figma.group(nodes, parent);
    if (name) g.name = name;
    return g;
  } catch (e) {
    noteGroupError(e);
    // 跨父级兜底：先 reparent 到同一父级再合组
    for (const n of nodes) {
      try { if (n.parent !== parent) parent.appendChild(n); } catch (e2) {}
    }
    try {
      const g = figma.group(nodes, parent);
      if (name) g.name = name;
      return g;
    } catch (e3) {
      noteGroupError(e3);
      // 兜底 2：整组 group 仍失败时，先对前 2 个建组，再逐个并入。
      if (nodes.length > 2) {
        try {
          const g = figma.group(nodes.slice(0, 2), parent);
          for (const n of nodes.slice(2)) { try { g.appendChild(n); } catch (e4) {} }
          if (name) g.name = name;
          return g;
        } catch (e5) { noteGroupError(e5); }
      }
      // 兜底 3：完全绕开 figma.group（此时才是真的 API 不可用）
      try { return frameFallback(nodes, name); } catch (e6) { noteGroupError(e6); return null; }
    }
  }
}

// ---- 资源文件夹：语义命名 + 导出预设（约定 > 配置）------------------------------
// 文件夹不再叫纯 bg/img/icon，而是 bg-<父容器语义> 等，便于后期 AI / 前端识别资源归属。
// 用 pluginData 打标记区分「插件建的文件夹」与「模型命名的 bg-xxx 节点」，避免按名字误判导致嵌套。
const EXPORT_RULES = {
  bg:   [{ format: "PNG", suffix: "@2x", constraint: { type: "SCALE", value: 2 } }],
  img:  [{ format: "PNG", suffix: "@2x", constraint: { type: "SCALE", value: 2 } }],
  icon: [{ format: "SVG", suffix: "", svgOutlineText: true }],
};

function folderRole(n) {
  if (!n || !("children" in n)) return "";
  let r = "";
  try { r = String(n.getPluginData("mvAssetFolder") || ""); } catch (e) {}
  if (/^(bg|img|icon)$/.test(r)) return r;
  const nm = String(n.name || "");
  if (/^(bg|img|icon)$/.test(nm)) return nm; // 兼容旧版纯名文件夹
  return "";
}
function findFolder(parent, cat) {
  if (!parent || !("children" in parent)) return null;
  for (const c of parent.children) if (folderRole(c) === cat) return c;
  return null;
}
function folderSemantic(parent, cat) {
  let nm = "";
  try { nm = String(parent.name || ""); } catch (e) {}
  nm = nm.replace(/^(bg|img|icon)-/i, "").trim();
  const isDefault = !nm || /^(Frame|Group|Rectangle|Component|Instance|Section|Layer|Vector)\s*[\d:\-]+$/i.test(nm) || /^\d+[:\-]\d+$/.test(nm);
  if (isDefault) return cat === "bg" ? "decor" : "assets";
  nm = nm.replace(/[\/\\]/g, "-").replace(/\s+/g, "-").replace(/[^A-Za-z0-9_\-\u4e00-\u9fff]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return (nm || (cat === "bg" ? "decor" : "assets")).slice(0, 40);
}
// 先用纯名建组（保证旧版兼容），标记成功后再改成带语义的名字；
// 若 setPluginData 不可用，则保持纯名 —— folderRole 仍能识别，绝不产生嵌套。
function createFolder(parent, nodes, cat) {
  const g = safeGroup(nodes, cat);
  if (!g) return null;
  try { g.setPluginData("mvAssetFolder", cat); } catch (e) { return g; }
  try { g.name = cat + "-" + folderSemantic(parent, cat); } catch (e) {}
  return g;
}
// ---- 真图表落盘硬门禁（v20261111.60）---------------------------------------
// 旧版把 AI/视觉直接命名的 @echarts/line 当成「静态图形容器」，内部矢量被合并成
// img-* 并挂 PNG@2x ⇒ 名字对了但曲线仍是位图（视觉根治性评审探针已复现）。
// 这里提供三件套：① 系列容器（合并但不打资源标记）；② 深清导出；③ applyAssetExports 拦截。
function createChartSeriesFolder(parent, nodes, name, summary) {
  const g = safeGroup(nodes, name);
  if (!g) return null;
  try { g.setPluginData("mvAssetFolder", ""); } catch (e) {}
  try { g.setPluginData("mvChartSeries", "1"); } catch (e) {}
  try { g.name = name; } catch (e) {}
  clearExportsDeep(g, summary, 0);
  return g;
}
// 清掉节点及所有后代的导出预设。真图表内部一律用图表库重建，不位图化。
function clearExportsDeep(n, summary, depth) {
  depth = depth || 0;
  if (!n || depth > 12) return;
  try {
    if (Array.isArray(n.exportSettings) && n.exportSettings.length) {
      n.exportSettings = [];
      if (summary) summary.lineChartExportCleared = (Number(summary.lineChartExportCleared) || 0) + 1;
    }
  } catch (e) {}
  if ("children" in n && depth < 12) for (const c of n.children) clearExportsDeep(c, summary, depth + 1);
}
function clearChartBitmapExports(chartNode, summary) {
  const seen = new Set();
  const walk = (n, d) => {
    if (!n || d > 12 || seen.has(n.id)) return;
    seen.add(n.id);
    if (folderRole(n) === "icon") return;   // 真图标保留 SVG 导出
    try {
      if (Array.isArray(n.exportSettings) && n.exportSettings.length) {
        n.exportSettings = [];
        if (summary) summary.chartExportsBlocked = (Number(summary.chartExportsBlocked) || 0) + 1;
      }
    } catch (e) {}
    if ("children" in n && d < 12) for (const c of n.children) walk(c, d + 1);
  };
  walk(chartNode, 0);
}

function setExportPreset(node, cat) {
  const rule = EXPORT_RULES[cat];
  if (!rule || !node) return false;
  try {
    node.exportSettings = rule.map((r) => Object.assign({}, r, r.constraint ? { constraint: Object.assign({}, r.constraint) } : {}));
    return true;
  } catch (e) { return false; }
}
// 「内部不要导出」：清掉文件夹内所有后代已有的导出预设，导出项只来自文件夹本身。
function clearDescendantExports(node, summary, depth) {
  depth = depth || 0;
  if (!node || depth > 12 || !("children" in node)) return;
  for (const c of node.children) {
    if (folderRole(c)) continue; // 嵌套文件夹由它自己负责
    try {
      if (Array.isArray(c.exportSettings) && c.exportSettings.length) { c.exportSettings = []; summary.exportCleared++; }
    } catch (e) {}
    clearDescendantExports(c, summary, depth + 1);
  }
}
// 收尾统一处理：给所有资源文件夹挂导出预设 + 清内部；孤立的 bg-/img-/icon- 节点也挂上，保证资源可导出。
function applyAssetExports(root, summary) {
  if (!root) return;
  const folders = [], loose = [], seen = new Set();
  const walk = (n, depth) => {
    if (!n || depth > 40 || seen.has(n.id)) return;
    seen.add(n.id);
    // v20261111.60 硬门禁：@echarts/* 真图表内部禁止任何位图导出。
    // 不下钻 ⇒ 内部 bg-/img- 节点既不进 loose、也不挂导出；已有的 PNG@2x 一并清掉。
    if (/^@echarts\//i.test(String(n.name || "")) && "children" in n) {
      clearChartBitmapExports(n, summary);
      if (summary) summary.chartSubtreeGuarded = (Number(summary.chartSubtreeGuarded) || 0) + 1;
      return;
    }
    const role = folderRole(n);
    if (role) { folders.push({ node: n, role }); return; } // 文件夹内部不下钻，统一清导出
    const m = /^(bg|img|icon)-/.exec(String(n.name || ""));
    if (m) loose.push({ node: n, role: m[1] });
    if ("children" in n && depth < 40) for (const c of n.children) walk(c, depth + 1);
  };
  walk(root, 0);
  for (const f of folders) {
    clearDescendantExports(f.node, summary, 0);
    if (setExportPreset(f.node, f.role)) summary.exportSet++;
  }
  for (const l of loose) if (setExportPreset(l.node, l.role)) summary.exportLoose++;
}

// ---- P1：按视觉模块生成业务容器（自动 Group，视觉零改动）----------------------
// 只对「同父级 + 垂直区间有交集」的 nodeIds 成组，防止视觉幻觉把跨行/跨容器节点硬凑。
// 新容器打 pluginData 标记，保证重复整理幂等（不会二次嵌套）。
function isModuleContainer(n) {
  if (!n || !("children" in n)) return false;
  try { return n.getPluginData("mvModuleContainer") === "1"; } catch (e) { return false; }
}
function isAncestor(a, b) {
  let p = b && b.parent, hop = 0;
  while (p && hop++ < 20) { if (p === a) return true; p = p.parent; }
  return false;
}
function inAssetOrModule(n) {
  let a = n && n.parent, hops = 0;
  while (a && hops++ < 20) {
    if (folderRole(a) || isModuleContainer(a)) return true;
    a = a.parent;
  }
  return false;
}
function moduleSlug(raw) {
  let s = String(raw || "").trim().toLowerCase();
  s = s.replace(/[\s_]+/g, "-").replace(/[^a-z0-9\-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return (s || "module").slice(0, 36);
}
// v20261114 根治护栏：成员内部子结构签名。仅统计与「是否同构循环」相关的维度：
//   texts = 后代 TEXT 数量；nums = 纯数值文本数量；ratio = 是否含比率(x%)文本。
// 两个块 texts 差≤1 且 nums 相同且 ratio 一致 ⇒ 视为同构（可安全 v-for）；
// 否则内部字段不齐（如一块有 36%+450/1568，另一块只有 120）⇒ 不同构，不应折成 item-<slug>-N 循环。
function memberStructureSig(node) {
  let texts = 0, nums = 0, ratio = false;
  const walk = (n) => {
    if (!n) return;
    if (n.type === "TEXT") {
      texts++;
      const t = String(n.characters || n.name || "").replace(/\s/g, "");
      if (/%/.test(t)) ratio = true;
      if (/^[\d.,+\-/]+%?$/.test(t)) nums++;
      return;
    }
    if ("children" in n) for (const c of n.children) walk(c);
  };
  walk(node);
  return texts + "|" + nums + "|" + (ratio ? 1 : 0);
}
function membersAreUniformLoop(members) {
  const arr = (Array.isArray(members) ? members : []).filter(Boolean);
  if (arr.length < 2) return false;
  const base = memberStructureSig(arr[0]).split("|").map(Number);
  for (let i = 1; i < arr.length; i++) {
    const s = memberStructureSig(arr[i]).split("|").map(Number);
    if (Math.abs(s[0] - base[0]) > 1) return false; // 文本槽位差太多
    if (s[1] !== base[1]) return false;              // 数值字段数不同
    if (s[2] !== base[2]) return false;              // 比率字段有无不一致
  }
  return true;
}
function verticalOverlap(a, b) {
  const ay = a.y || 0, ah = a.height || 0, by = b.y || 0, bh = b.height || 0;
  return ay < by + bh && by < ay + ah;
}
// 纯几何模块建组：不调用任何 LLM、零 token。
// 判据：同父级 + 按「垂直中心」行聚类（中心超出当前行均值 0.55×中位高度即换行）；
// 高度离群的跨行共享层（整页底图 / 光柱 / 光环）先剔除，避免把整页拖成一行。
// 容器名从行内【已被 AI 命名】的子节点语义派生（item-<slug>-N）：
// 结构由几何定、语义由 LLM 定 → 下游大模型能直接看出组件边界与类型。
function rowSlug(members) {
  for (const n of members) {
    const m = /^(?:card|list|form|item|echarts|header|chart|gauge|cp)-(.+)$/i.exec(String(n.name || ""));
    if (m) {
      const s = m[1].replace(/-\d+$/, "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 28);
      if (s) return s;
    }
  }
  for (const n of members) {
    const m = /^(@(?:echarts|antd)\/[A-Za-z0-9-]+)/i.exec(String(n.name || ""));
    if (m) {
      const s = m[1].replace(/[^A-Za-z0-9-]/g, "").slice(0, 28);
      if (s) return s;
    }
  }
  return "";
}
// ---- 业务容器成员判据（v20261110.13）------------------------------------------
// 用户 node-id=1-1727 实测：item-disposal-efficiency-1 把整个组件的 header 和 bg 都吞了。
// 根因：旧的候选过滤只排除「带 bg-/img-/icon- 前缀」和 TEXT；默认名背景矩形、header、
// 铺满父级的大图形都不带前缀，加上单 id 几何扩展只要求 verticalOverlap（太宽），
// 于是同父级兄弟几乎全被收进 item-*，组件边界反而更糊。
// 这里统一定义「什么节点能进业务容器」：只有内容型节点。背景装饰与独立头部保持平级，
// 由 organizeLayout 统一收进 bg-* 资源文件夹 —— 下游大模型才看得出组件边界。
function isContentCandidate(n, parent) {
  if (!n || n.type === "TEXT") return false;
  const nm = String(n.name || "");
  if (folderRole(n) || isModuleContainer(n) || isSlotContainer(n) || inAssetOrModule(n)) return false;
  if (/^(bg|img|icon)-/.test(nm)) return false;
  if (/^header(?:-|$)/i.test(nm)) return false; // 顶部条是独立组件，与内容模块平级
  // 复用既有装饰判据（VECTOR / 铺满父级 / IMAGE 填充 / 纯图形组）；
  // ctx 传 index=1,total=1 避开「无子节点叶子」这条过宽的启发式
  try { if (isDecoration(n, parent, { index: 1, total: 1 })) return false; } catch (e) {}
  const pw = Number(parent && parent.width) || 0, ph = Number(parent && parent.height) || 0;
  const w = Number(n.width) || 0, h = Number(n.height) || 0;
  if (pw > 0 && ph > 0 && (w >= pw * 0.9 || h >= ph * 0.9)) return false;
  return true;
}
// 同一视觉行：不只看重叠，还要求垂直中心足够接近（挡住 header 与下方内容被判成同一行）
function sameVisualRow(a, b) {
  const ac = (a.y || 0) + (a.height || 0) / 2, bc = (b.y || 0) + (b.height || 0) / 2;
  const ah = a.height || 0, bh = b.height || 0;
  return verticalOverlap(a, b) && Math.abs(ac - bc) <= Math.max(16, Math.min(ah, bh) * 0.6);
}
// 单 id 视觉模块的确定性几何扩展：同父级 + 同一视觉行 + 内容型节点，最多补到 5 个。
// 方案预览（describeStructurePlan）与实际执行（groupModulesByIntent）共用同一函数，
// 否则方案会把单 id 模块误标成「待补」，又把即将被视觉占用的节点重复列进几何兜底。
function expandModuleNodes(nodes, parent, onExcluded) {
  if (!Array.isArray(nodes) || nodes.length !== 1) return nodes || [];
  if (!parent || !("children" in parent) || parent.type === "PAGE") return nodes;
  const out = nodes.slice();
  for (const sib of parent.children) {
    if (sib === out[0]) continue;
    if (!isContentCandidate(sib, parent)) { if (onExcluded) onExcluded(sib); continue; }
    if (!sameVisualRow(out[0], sib)) continue;
    out.push(sib);
    if (out.length >= 5) break;
  }
  return out;
}

// ---- v20261111.43 几何护栏：两栏布局 / 同规格网格不再被「视觉行」误合并 --------------
// 实测（设备监测面板）：左侧竖排 tab 列与右侧卡片网格同高并列，而 sameVisualRow 只看垂直重叠
// 与中心距离、不看横向跨度 ⇒ 两栏被判成同一视觉行；行聚类又是「一行 ≥2 成员就建 item-*」，
// 于是「导航列 + 内容区」被揉成一个循环项，3×4 设备卡网格也被按行拆成 4 个 item-row-N。
// 护栏 1：竖栏（高过半 + 窄于半宽 + 明显竖长）不是行成员，留在父级平级。
//   注：只看「高过半 + 窄于半宽」会把 320×160 这类普通卡片在矮容器里误判成竖栏
//   （H=300 时 160>150 就命中）⇒ 必须同时要求 h > w×1.5。
// 护栏 2：同规格兄弟集合（≥3 个同类型 + 尺寸接近）或父级名以 list-/grid- 开头 ⇒ 跳过行聚类，
//        同构兄弟保持平级，由结构契约折叠成 [循环 ×N，首项即模板]。
// 护栏 3：同一行成员面积差异超过 1:4 ⇒ 不是同类卡片，不建行容器。
function isColumnLikeNode(n, container, H) {
  // v20261111.44：竖栏必须是「容器」（导航列 / 侧栏都有子项）。叶子矩形（竖向分隔线、滚动条轨、
  // 装饰细条）也会满足「窄 + 高」，实测被误报成竖栏 2 个 ⇒ 无子节点直接不算。
  if (!n || !("children" in n) || !n.children || !n.children.length) return false;
  const h = Number(n && n.height) || 0, w = Number(n && n.width) || 0;
  const cw = Number(container && container.width) || 0;
  if (!(H > 0) || !(cw > 0) || !(w > 0) || !(h > 0)) return false;
  return h > H * 0.55 && w < cw * 0.5 && h > w * 1.5;
}
// 同规格兄弟集合：同类型 + 尺寸互相接近（长宽各 5% / 至少 4px 容差），达到 minCount 个即视为网格/列表集合。
// v20261111.43 修正：8px 分桶会把 218 与 220 拆到相邻桶 ⇒ 改为两两比对，避免「几乎同尺寸」被漏判。
// 这里刻意不比对子树指纹 —— 护栏只负责「不做行聚类」，严格的同构折叠仍由结构契约判定。
function isUniformSiblingSet(nodes, minCount) {
  const need = minCount || 3;
  const list = (Array.isArray(nodes) ? nodes : []).filter(Boolean);
  if (list.length < need) return false;
  const near = (a, b) => {
    const aw = Number(a.width) || 0, ah = Number(a.height) || 0;
    const bw = Number(b.width) || 0, bh = Number(b.height) || 0;
    if (!(aw > 0) || !(ah > 0) || !(bw > 0) || !(bh > 0)) return false;
    return Math.abs(aw - bw) <= Math.max(4, aw * 0.05) && Math.abs(ah - bh) <= Math.max(4, ah * 0.05);
  };
  for (let i = 0; i < list.length; i++) {
    let count = 1;
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      if (String(list[i].type || "") !== String(list[j].type || "")) continue;
      if (near(list[i], list[j])) count++;
    }
    if (count >= need) return true;
  }
  return false;
}
// v20261111.49 确定性循环命名：同规格兄弟集合里【仍是默认名】的成员，按视觉顺序改名
// item-<slug>-1..N，让结构契约能折叠成 [循环 ×N，首项即模板]。
// 动机：AI 步在部分网关（思考关不掉）根本产不出命名，v-for 信号不能只押在模型上；
// 只动默认名，AI 已给语义名的节点一律不覆盖。
function loopSlugFor(container, members) {
  let nm = String((container && container.name) || "").replace(/^(list|grid|cards?)-/i, "").trim();
  if (nm && !DEFAULT_NAME_RE.test(nm)) {
    nm = nm.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);
  } else {
    nm = "";
  }
  if (!nm) {
    for (const m of members) {
      const mm = String((m && m.name) || "");
      if (!mm || DEFAULT_NAME_RE.test(mm)) continue;
      const seg = mm.replace(/^(card|list|item|cp|section|graphic|icon|img)-/i, "").replace(/[-_]\d+$/, "").trim();
      if (seg) { nm = seg.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 28); break; }
    }
  }
  return (nm || "item").toLowerCase().slice(0, 30);
}
// 只规划、不改动：供只读结构方案预览「将要命名成什么」
function planLoopNames(container, members) {
  const targets = (Array.isArray(members) ? members : []).filter(n => n && DEFAULT_NAME_RE.test(String(n.name || "")));
  if (targets.length < 2) return [];
  // v20261114 根治护栏：默认名兄弟若内部子结构明显不同构（数值/比率字段数不对齐），不强行折成循环，
  // 避免生成 v-for 时首项模板字段在后续项缺失。返回空 ⇒ 这些兄弟保持默认名，由人工或视觉路径把关。
  if (!membersAreUniformLoop(targets)) return [];
  const slug = loopSlugFor(container, targets);
  return targets.slice()
    .sort((a, b) => ((a.y || 0) - (b.y || 0)) || ((a.x || 0) - (b.x || 0)))
    .map((n, i) => ({ node: n, name: "item-" + slug + "-" + (i + 1) }));
}
function nameLoopItems(container, members, summary) {
  const plan = planLoopNames(container, members);
  let done = 0;
  for (const it of plan) {
    try {
      if (it.node.locked) it.node.locked = false;
      if (String(it.node.name || "") !== it.name) { it.node.name = it.name; done++; }
    } catch (e) {}
  }
  if (summary) summary.geoLoopNamed = (Number(summary.geoLoopNamed) || 0) + done;
  return done;
}

// 已被命名成「同基名 + 序号」的兄弟 ≥2 个 ⇒ 本来就是循环集合，不再套一层行容器。
function hasLoopNamedSiblings(nodes) {
  const buckets = new Map();
  for (const n of nodes) {
    const b = loopBaseName(String((n && n.name) || ""));
    if (!b) continue;
    const k = b.base.toLowerCase();
    buckets.set(k, (buckets.get(k) || 0) + 1);
  }
  for (const c of buckets.values()) if (c >= 2) return true;
  return false;
}
// 同一行成员面积比超过 1:4 ⇒ 尺寸差异过大（导航条 / 表格 / 图形混进卡片行），不建组。
function rowSizesComparable(row) {
  if (!Array.isArray(row) || row.length < 2) return false;
  const area = (n) => (Number(n && n.width) || 1) * (Number(n && n.height) || 1);
  const a0 = area(row[0]);
  return row.every(n => {
    const a = area(n);
    if (a <= 0 || a0 <= 0) return true;
    const r = a / a0;
    return r >= 0.25 && r <= 4;
  });
}

// ---- 结构方案（v20261110.12 / C 双轨）------------------------------------------
// collectGeometryRows 只做计算、不碰任何节点：方案预览与实际执行共用同一套聚类结果，
// 保证「先输出方案、再按方案整理」不是两套逻辑各说各话。
function collectGeometryRows(root) {
  const info = {
    rows: [], shared: [], columns: [], protected: [], candidates: 0, rowCount: 0, targets: 0,
    excluded: 0, protectedSets: 0, rowRejected: 0,
  };
  if (!root || !("children" in root)) return info;
  const targets = [root];
  for (const c of root.children) {
    // v20261110.21：slot-con 内部已是模块层，不再二次行聚类（否则会被再包一层 item-*）。
    if ("children" in c && c.type !== "PAGE" && !folderRole(c) && !isModuleContainer(c) && !isSlotContainer(c)) targets.push(c);
  }
  info.targets = targets.length;
  let seq = 0;
  for (const container of targets) {
    const all = Array.prototype.slice.call(container.children || []);
    // 第一层只排除明确的资源/容器/TEXT，保留完整几何分布用来识别跨行共享层
    const raw = all.filter((n) => {
      if (folderRole(n) || isModuleContainer(n) || isSlotContainer(n) || inAssetOrModule(n)) return false;
      if (/^(bg|img|icon)-/.test(String(n.name || ""))) return false;
      if (n.type === "TEXT") return false;
      return true;
    });
    if (raw.length < 2) continue;
    let H = container.height || 0;
    if (!H) for (const n of raw) H = Math.max(H, (n.y || 0) + (n.height || 0));
    H = Math.max(1, H);
    const cName = String(container.name || "");
    // 护栏 2：list-/grid- 容器，或已是「同基名+序号」/ 同规格兄弟集合 ⇒ 整块跳过行聚类。
    if (/^(list|grid)-/i.test(cName) || hasLoopNamedSiblings(raw) || isUniformSiblingSet(raw, 3)) {
      info.protectedSets++;
      info.protected.push({ container, members: raw.slice() });   // v20261111.49：交给循环命名
      continue;
    }
    const hs = raw.map(n => n.height || 0).slice().sort((a, b) => a - b);
    const medianH = hs[Math.floor(hs.length / 2)] || 1;
    const spatial = [], spanning = [], columns = [];
    for (const n of raw) {
      const h = n.height || 0;
      // 护栏 1：竖栏（高过半 + 窄于半宽）是导航列 / 侧栏，不是行成员，留在父级平级
      if (isColumnLikeNode(n, container, H)) columns.push(n);
      // 高度 > 中位 3 倍且占容器过半 → 跨行共享层，留在父级，不参与切分
      else if (h > medianH * 3 && h > H * 0.5) spanning.push(n);
      else spatial.push(n);
    }
    for (const c of columns) info.columns.push({ node: c, parentName: cName });
    for (const s of spanning) info.shared.push({ node: s, parentName: cName });
    // 第二层：内容型节点判据，把 header / 默认名背景 / 铺满父级大图形挡在业务容器外
    const rowKids = spatial.filter((n) => isContentCandidate(n, container));
    info.excluded += all.length - rowKids.length - spanning.length - columns.length;
    info.candidates += rowKids.length;
    if (rowKids.length < 2) continue;
    const tol = Math.max(16, medianH * 0.55);
    const sorted = rowKids.slice().sort((a, b) => {
      const ca = (a.y || 0) + (a.height || 0) / 2, cb = (b.y || 0) + (b.height || 0) / 2;
      return ca - cb || (a.x || 0) - (b.x || 0);
    });
    const rows = [];
    let cur = [], sumC = 0;
    for (const n of sorted) {
      const c = (n.y || 0) + (n.height || 0) / 2;
      const avg = cur.length ? sumC / cur.length : c;
      if (cur.length && c - avg > tol) { rows.push(cur); cur = []; sumC = 0; }
      cur.push(n); sumC += c;
    }
    if (cur.length) rows.push(cur);
    info.rowCount += rows.length;
    for (const row of rows) {
      const members = row.filter((n) => n.parent === container);
      if (members.length < 2) continue;
      // 护栏 3：同行成员尺寸差异过大（面积比超 1:4）⇒ 不是同类卡片，不建行容器
      if (!rowSizesComparable(members)) { info.rowRejected++; continue; }
      seq++;
      const slug = rowSlug(members) || moduleSlug(container.name) || "row";
      // v20261114 根治护栏：同行成员内部子结构明显不同构（数值/比率字段数不对齐）⇒ 不折成 item-<slug>-N 循环，
      // 改落 section-<slug>（异构容器，不进 v-for），与视觉路径同口径。
      const rowName = membersAreUniformLoop(members) ? ("item-" + slug + "-" + seq) : ("section-" + slug);
      info.rows.push({
        container, containerName: String(container.name || ""),
        members, slug, seq, name: rowName,
      });
    }
  }
  return info;
}

async function groupRowsByGeometry(root, summary) {
  const info = collectGeometryRows(root);
  summary.geoSpanKept += info.shared.length;
  summary.geoColumnsKept = (Number(summary.geoColumnsKept) || 0) + info.columns.length;
  summary.geoProtectedSets = (Number(summary.geoProtectedSets) || 0) + info.protectedSets;
  summary.geoRowRejected = (Number(summary.geoRowRejected) || 0) + info.rowRejected;
  // v20261111.49：先给同规格集合里的默认名成员起循环名（item-<slug>-1..N），
  // 这样即使 AI 一段正文都没产出，结构契约仍能折叠出 [循环 ×N，首项即模板]。
  for (const p of (info.protected || [])) {
    try { nameLoopItems(p.container, p.members, summary); } catch (e) {}
  }
  summary.geoCandidates += info.candidates;
  summary.geoRows += info.rowCount;
  summary.moduleExcluded += info.excluded;
  for (const r of info.rows) {
    for (const n of r.members) { try { if (n.locked) { n.locked = false; summary.unlocked++; } } catch (e) {} }
    const minIdx = Math.min.apply(null, r.members.map((n) => r.container.children.indexOf(n)));
    const g = safeGroup(r.members, r.name);
    if (!g) { summary.geoGroupFailed++; continue; }
    try { g.setPluginData("mvModuleContainer", "1"); } catch (e) {}
    try { r.container.insertChild(Math.max(0, Math.min(minIdx, r.container.children.length - 1)), g); } catch (e) {}
    summary.geometricGroups++;
    logContainer("[几何]", g, r.members.length, r.containerName);
  }
}

// 只读结构方案：视觉语义分区（可选）+ 几何行兜底，输出可复制的树形文本，不修改任何节点。
// C 方案的核心：视觉给「应该怎么分」，几何校验「能不能这么分」并补齐未覆盖区域。
async function describeStructurePlan(root, modules) {
  const out = { text: "", count: 0, vision: 0, geometry: 0, shared: 0, conflicts: 0 };
  if (!root || !("children" in root)) { out.text = "(选区不是容器)"; return out; }
  const rootName = String(root.name || "root");
  const names = (arr, max) => arr.slice(0, max).map(n => String(n.name || "?")).join(", ") + (arr.length > max ? " …" : "");
  const lines = [
    "【结构方案 · C 双轨：视觉语义分区 + 几何校验兜底】",
    "根：" + rootName + "  [" + String(root.type || "") + "]",
    "",
    rootName,
  ];
  // 1) 视觉模块优先（语义最准）
  const visionLines = [], claimed = new Set();
  for (const m of (Array.isArray(modules) ? modules : [])) {
    if (!m || !Array.isArray(m.nodeIds) || !m.nodeIds.length) continue;
    const rawNodes = [];
    for (const id of m.nodeIds) {
      let n = null;
      try { n = await figma.getNodeByIdAsync(id); } catch (e) {}
      if (!n) continue;
      if (!isContentCandidate(n, n.parent)) continue;
      if (rawNodes.indexOf(n) === -1) rawNodes.push(n);
    }
    // 与执行路径共用同一个扩展函数，方案才能准确预测单 id 模块会收哪些节点
    const nodes = expandModuleNodes(rawNodes, rawNodes.length === 1 ? rawNodes[0].parent : null);
    const order = Number.isFinite(Number(m.order)) ? "-" + Number(m.order) : "";
    // v20261114 同步执行路径护栏：预览与执行同判据，避免「方案显示循环、实际异构」的落差。
    const previewSlug = moduleSlug(m.name);
    const name = (order !== "" && membersAreUniformLoop(nodes))
      ? ("item-" + previewSlug + order)
      : ("section-" + previewSlug);
    if (!nodes.length) { out.conflicts++; visionLines.push("├─ [视觉×] " + name + "  无有效节点，跳过"); continue; }
    const sameParent = nodes.every(n => n.parent === nodes[0].parent);
    const sameRow = nodes.every(n => verticalOverlap(nodes[0], n));
    if (nodes.length < 2 || !sameParent || !sameRow) {
      out.conflicts++;
      visionLines.push("├─ [视觉?] " + name + "  " + nodes.length + " 节点，几何校验待补（单 id 将由几何扩展补齐）");
      continue;
    }
    out.vision++;
    for (const n of nodes) claimed.add(n.id);
    visionLines.push("├─ [视觉] " + name + "  ← 父[" + String((nodes[0].parent && nodes[0].parent.name) || "?") + "]  " + nodes.length + " 节点");
    visionLines.push("│    └ " + names(nodes, 4));
  }
  // 2) 几何行兜底：只补视觉没覆盖到的节点
  const geo = collectGeometryRows(root);
  out.shared = geo.shared.length;
  const geoLines = [];
  for (const r of geo.rows) {
    const rest = r.members.filter(n => !claimed.has(n.id));
    if (rest.length < 2) continue;
    out.geometry++;
    geoLines.push("├─ [几何] " + r.name + "  ← 父[" + r.containerName + "]  " + rest.length + " 节点  (视觉未覆盖区域)");
    geoLines.push("│    └ " + names(rest, 4));
  }
  for (const l of visionLines) lines.push(l);
  for (const l of geoLines) lines.push(l);
  if (geo.columns.length)
    lines.push("├─ [竖栏] 高过半且窄于半宽的导航列 / 侧栏 " + geo.columns.length + " 个：留在父级平级，不并入同行的 item-*：" + names(geo.columns.map(c => c.node), 4));
  if (geo.protectedSets) {
    lines.push("├─ [集合保护] " + geo.protectedSets + " 个容器判定为同规格兄弟集合 / list-·grid- 容器：跳过行聚类，交由契约折叠 [循环 ×N，首项即模板]");
    for (const p of (geo.protected || [])) {
      const plan = planLoopNames(p.container, p.members);
      if (!plan.length) continue;   // 已有语义名 ⇒ 无需确定性命名
      const first = plan[0].name, last = plan[plan.length - 1].name;
      lines.push("│    └ " + String(p.container.name || "?") + " → 确定性命名 " + first + " … " + last
        + "（" + plan.length + " 项，v-for 信号）");
    }
  }
  if (geo.rowRejected)
    lines.push("├─ [尺寸不符] " + geo.rowRejected + " 行成员面积差异超 1:4：不是同类卡片，未建行容器");
  if (geo.shared.length)
    lines.push("└─ [共享] 跨模块光柱/光环等 " + geo.shared.length + " 个，留在共同父级不切分：" + names(geo.shared.map(s => s.node), 6));
  if (geo.excluded)
    lines.push("└─ [排除] 背景装饰 / 独立头部 / 资源文件夹 " + geo.excluded + " 个：保持平级，由 organizeLayout 归入 bg-* 文件夹，不进 item-*");
  lines.push("");
  lines.push("└─ [骨架] 执行后组件根生成 slot-con 真 Group：header / bg 保持平级，上述所有内容模块统一收纳进去");
  lines.push("视觉分区 " + out.vision + " 个 / 几何兜底 " + out.geometry + " 个 / 共享层 " + out.shared + " 个 / 校验待补 " + out.conflicts + " 个");
  lines.push("（方案为执行前的只读快照；执行后请看「新建业务容器清单」做方案/实际对照）");
  out.count = out.vision + out.geometry;
  out.text = lines.join("\n");
  return out;
}
async function buildModuleGroups(modules, root, summary) {
  // 视觉语义路径（可选）：有 layoutIntent.modules 时用模型给的英文 slug，更准但仍走同一套几何校验
  if (Array.isArray(modules) && modules.length) {
    try { await groupModulesByIntent(modules, summary); } catch (e) {}
  }
  // 纯几何兜底：零 token，总是跑；完全没有 layoutIntent 也能生成模块容器
  try { await groupRowsByGeometry(root, summary); } catch (e) {}
}

async function groupModulesByIntent(modules, summary) {
  if (!Array.isArray(modules)) return;
  // v20261110.11：不再要求 >= 2 个 nodeId。旧版把「模型只给 1 个主要容器 id」的模块直接丢掉
  // （.8 日志 8 个 module 里 5 个单 id ⇒ 模块扩展 0），单 id 交给下面的几何扩展补齐即可。
  const list = modules.filter(m => m && Array.isArray(m.nodeIds) && m.nodeIds.length >= 1)
    .slice().sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
  for (const m of list) {
    try {
      const raw = [];
      for (const id of m.nodeIds) {
        const n = await figma.getNodeByIdAsync(id);
        if (!n) continue;
        if (!isContentCandidate(n, n.parent)) { summary.moduleExcluded++; continue; }
        if (raw.indexOf(n) === -1) raw.push(n);
      }
      // 同一组里存在祖先-后代关系时只保留外层节点，否则 figma.group 语义不明
      const nodes = raw.filter(n => !raw.some(o => o !== n && isAncestor(o, n)));
      // 单 id 兜底：视觉模型常只给 1 个「主要容器 id」（或 100 节点分片把同模块切散）。
      // 用确定性几何把它同父级、同一视觉行的非资源兄弟补进来，保证仍能生成模块容器。
      if (nodes.length === 1) {
        const expanded = expandModuleNodes(nodes, nodes[0].parent, () => { summary.moduleExcluded++; });
        nodes.length = 0;
        for (const n of expanded) nodes.push(n);
        if (nodes.length >= 2) summary.moduleExpanded++;
      }
      if (nodes.length < 2) { summary.moduleSkipped++; continue; }
      const parent = nodes[0].parent;
      if (!parent || !("children" in parent) || parent.type === "PAGE") { summary.moduleSkipped++; continue; }
      if (nodes.some(n => n.parent !== parent)) { summary.moduleSkipped++; continue; } // 跨父级不硬凑
      const anchor = nodes[0];
      if (nodes.some(n => !verticalOverlap(anchor, n))) { summary.moduleSkipped++; continue; } // 不在同一视觉行
      for (const n of nodes) { try { if (n.locked) n.locked = false; } catch (e) {} }
      const order = Number.isFinite(Number(m.order)) ? Number(m.order) : "";
      const slug = moduleSlug(m.name);
      // v20261114 根治护栏：视觉模块成员内部子结构差异过大（数值/比率字段数不对齐）⇒ 不是同构循环，
      // 不应折成 item-<slug>-N（否则生成 v-for 时首项模板字段在第二项缺失）。改落 section-<slug> 异构容器。
      const name = (order !== "" && membersAreUniformLoop(nodes))
        ? "item-" + slug + "-" + order
        : "section-" + slug;
      const kids = Array.prototype.slice.call(parent.children || []);
      const minIdx = Math.min.apply(null, nodes.map(n => kids.indexOf(n)));
      const g = safeGroup(nodes, name);
      if (!g) { summary.moduleGroupFailed++; continue; }
      try { g.setPluginData("mvModuleContainer", "1"); } catch (e) {}
      // 插回被收纳节点中最靠下的原位置，保护与其它兄弟的 z-order
      try { parent.insertChild(Math.max(0, Math.min(minIdx, parent.children.length - 1)), g); } catch (e) {}
      summary.moduleGroups++;
      logContainer("[视觉]", g, nodes.length, parent.name);
    } catch (e) { summary.moduleGroupFailed++; }
  }
}

// ---- 图表语义容器治理（v20261110.16）------------------------------------------
// 用户 node-id=1-1727 实测：echarts-gauge 内部几十个 arc/tick/vector 仍裸露在图层面板。
// 根因一（命名）：旧 prompt 把「视觉上像仪表」的静态矢量组合一律写成 echarts-<类型>，
//   而真图表的 @echarts/ 只是「建议」⇒ 假图表占着图表名、真图表反而不带 @。
// 根因二（结构）：旧 prompt 承诺「内部最小元素随容器收纳」，但 code.js 只对 img-/icon-
//   前缀做补收、对默认名 VECTOR 只按父级做 bg- 装饰收纳（前景装饰 / 视觉 role=content
//   还会保留原位），从来没有任何「按图表容器合并」的逻辑 ⇒ 零碎矢量既不合并也无导出预设。
// 治理：① 命名二分：静态矢量图去 echarts → graphic-<slug>；真图表补 @ → @echarts/<slug>；
//   ② 容器内纯图形子节点合并成 img-<语义> 文件夹（applyAssetExports 挂 PNG@2x），
//      TEXT 数值/标签保留为独立节点，下游才能生成动态数据；
//   ③ mvGraphicContainer 标记保证幂等，organizeLayout 直接跳过，避免二次拆组 / z 序漂移。
const CHART_NAME_RE = /^(?:echarts-|@echarts\/|chart-|gauge-)/i;
function isGraphicContainer(n) {
  if (!n || !("children" in n)) return false;
  try { return n.getPluginData("mvGraphicContainer") === "1"; } catch (e) { return false; }
}
// 默认名图形（Frame 12 / Group 3 / Vector 5028…）：没有语义，可以安全合并成静态资源。
function isDefaultGraphicName(nm) {
  const s = String(nm || "").trim();
  if (!s) return true;
  return /^(?:Frame|Group|Rectangle|Ellipse|Vector|Line|Boolean|Union|Subtract|Intersect|Star|Polygon|Component|Instance|Section|Layer)\s*[\d:\-]+$/i.test(s) || /^\d+[:\-]\d+$/.test(s);
}
// 纯图形节点：不含任何 TEXT 后代（含文本的分组若被整体导出，动态数据会被固化成图片）；
// 带语义名的容器（axis-x / legend / series-1…）是下游要识别的结构层级，绝不压平成位图。
function isPureGraphicNode(n) {
  if (!n || n.type === "TEXT" || folderRole(n)) return false;
  if (hasTextDescendant(n)) return false;
  if (!GRAPHIC_TYPES[n.type]) return false;
  if ((n.type === "FRAME" || n.type === "GROUP" || n.type === "INSTANCE") && !isDefaultGraphicName(n.name)) return false;
  return true;
}

// ---- 图例归属护栏（v20261114.66）------------------------------------------------
// 用户判据：「图例永远和图表一个文件夹」。
// 落地方式：默认名 VECTOR 无法确定性判定「哪个节点是图例」，所以不逐节点识别，而是保护
// 【整个图表几何容器】不被矢量合并 / 装饰收纳拆开 —— 同心多边形、轴标 TEXT、图例色块与
// 文字必然同留一个容器 ⇒ 图例与图表恒在同一个文件夹，零节点移动、零 bbox 变化。
// 只拦「未定性的几何图表组」（雷达同心多边形 + 多轴标）：真 @echarts/* 走 series-* 合并，
// 图形与图例本就同组；graphic-speed-gauge 只有 2 个 TEXT 且图例是平级兄弟 ⇒ 不命中，
// promoteArcCharts 的历史升级链零回归。判据单一来源：三处跳过分支只调本函数。
const LEGEND_NAME_RE = /^(?:legend(?:-|$)|list-[a-z0-9-]*legend)/i;
function isLegendNode(n) {
  if (!n) return false;
  try { if (LEGEND_NAME_RE.test(String(n.name || ""))) return true; } catch (e) {}
  try { return n.getPluginData("mvLegend") === "1"; } catch (e) { return false; }
}
function hasLegendIn(ctn) {
  if (!ctn || !("children" in ctn)) return false;
  const walk = (n, d) => {
    if (!n || d > 8) return false;
    if (isLegendNode(n)) return true;
    if ("children" in n) for (const c of (n.children || [])) if (walk(c, d + 1)) return true;
    return false;
  };
  return walk(ctn, 0);
}
function isChartGeometryContainer(ctn) {
  if (!ctn || !("children" in ctn) || ctn.type === "PAGE") return false;
  const kids = Array.prototype.slice.call(ctn.children || []);
  if (kids.length < 3) return false;
  // 排除组件根 / slot-con / 业务大容器：它们直属子级多是容器，若误命中，
  // organizeLayout 会把所有装饰都 keepInPlace ⇒ 背景收纳整体失效（回归）。
  const nested = kids.filter(k => k && "children" in k && (k.children || []).length > 0 && k.type !== "TEXT");
  if (nested.length > 2) return false;
  const leaves = [];
  let texts = 0;
  const scan = (n, d) => {
    if (!n || d > 4) return;
    if (n.type === "TEXT") { texts++; return; }
    if (isPureGraphicNode(n)) leaves.push(n);
    if ("children" in n) for (const c of (n.children || [])) scan(c, d + 1);
  };
  for (const k of kids) scan(k, 0);
  // ① ≥3 个纯图形叶子；② ≥4 个 TEXT（雷达多轴标）或容器内已有 legend-* 命名节点；
  //    TEXT 上限 12 再次排除整页容器。环形图 53:34075 只有 2 个 TEXT 且图例平级 ⇒ 不命中。
  if (leaves.length < 3 || texts > 12 || (texts < 4 && !hasLegendIn(ctn))) return false;
  // ③ 图形中心近似重合 + 尺寸递减（同心多边形），普通卡片的 1~2 个装饰图形不适用。
  const ctr = absRect(ctn);
  const boxes = leaves.map(absRect).filter(r => r && r.w > 0 && r.h > 0);
  if (!ctr || ctr.w <= 0 || ctr.h <= 0 || boxes.length < 3) return false;
  const cx = ctr.x + ctr.w / 2, cy = ctr.y + ctr.h / 2;
  const tol = Math.max(ctr.w, ctr.h) * 0.25;
  const centered = boxes.filter(r =>
    Math.abs((r.x + r.w / 2) - cx) <= tol && Math.abs((r.y + r.h / 2) - cy) <= tol);
  if (centered.length < 3) return false;
  const areas = boxes.map(r => r.w * r.h).sort((a, b) => b - a);
  return areas[0] > areas[1] * 1.1 && areas[1] > areas[2] * 1.1;
}
function chartSlug(name) {
  const m = /^(?:echarts-|@echarts\/|chart-|gauge-)(.+)$/i.exec(String(name || ""));
  return moduleSlug(m ? m[1] : name) || "graphic";
}
// ---- 折线 / 面积图几何信号（v20261111.60）------------------------------------
// 5:35420 实测：折线是 2 个 346x22 的宽扁 VECTOR，路径含 18 段三次贝塞尔 C；
// 配 5 条等距水平网格线（y 差 17/18/17/17）与 y/x 双轴数字刻度。全树 arcData=0，
// 因此 .59 只认同心弧的升级链路整条空转。这里按【路径几何】补第二套判据。
function vectorPathData(node) {
  const out = [];
  try { if (Array.isArray(node.vectorPaths)) for (const p of node.vectorPaths) out.push(String((p && p.data) || "")); } catch (e) {}
  try { if (Array.isArray(node.fillGeometry)) for (const p of node.fillGeometry) out.push(String((p && p.path) || "")); } catch (e) {}
  try { if (Array.isArray(node.strokeGeometry)) for (const p of node.strokeGeometry) out.push(String((p && p.path) || "")); } catch (e) {}
  return out;
}
function vectorCurveStats(node) {
  let cmds = 0, curves = 0, closed = 0;
  for (const p of vectorPathData(node)) {
    cmds += (p.match(/[MLCQZAHVTSmlcqzahvts]/g) || []).length;
    curves += (p.match(/[CSQTcsqt]/g) || []).length;
    if (/[Zz]/.test(p)) closed++;
  }
  return { cmds: cmds, curves: curves, closed: closed };
}
function nodeBox(n) {
  try {
    const b = n && n.absoluteBoundingBox;
    if (b) return { x: Number(b.x) || 0, y: Number(b.y) || 0, w: Number(b.width) || 0, h: Number(b.height) || 0 };
  } catch (e) {}
  return { x: Number(n && n.x) || 0, y: Number(n && n.y) || 0, w: Number(n && n.width) || 0, h: Number(n && n.height) || 0 };
}
// 宽扁多段曲线 = 折线/面积图主体。圆形仪表盘 w/h≈1，天然排除；
// 小箭头 / 图标矢量 w<100，也排除。
function isLineCurveVector(n) {
  if (!n) return false;
  const t = String(n.type || "");
  if (t !== "VECTOR" && t !== "LINE" && t !== "BOOLEAN_OPERATION") return false;
  const b = nodeBox(n);
  if (b.w < 100 || b.h <= 0 || b.w / Math.max(b.h, 0.5) < 6) return false;
  return vectorCurveStats(n).curves >= 3;
}
function countLineCurves(container) {
  let n = 0;
  const walk = (x, d) => {
    if (!x || d > 8 || n >= 8) return;
    if (isLineCurveVector(x)) n++;
    if ("children" in x && d < 8) for (const c of x.children) walk(c, d + 1);
  };
  walk(container, 0);
  return n;
}
// ≥3 条等距水平网格线（水平线 w>=60 且 h<=2，y 差值稳定）
function hasEvenGrid(container) {
  const ys = new Set();
  const walk = (x, d) => {
    if (!x || d > 8) return;
    const b = nodeBox(x);
    if (b.w >= 60 && b.h <= 2) ys.add(Math.round(b.y));
    if ("children" in x && d < 8) for (const c of x.children) walk(c, d + 1);
  };
  walk(container, 0);
  const sorted = Array.from(ys).sort((a, b) => a - b);
  if (sorted.length < 3) return false;
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  const nz = gaps.filter(g => g > 0);
  if (nz.length < 2) return false;
  const mn = Math.min.apply(null, nz), mx = Math.max.apply(null, nz);
  return mn >= 5 && mx <= 60 && mx / mn <= 1.8;
}
// y/x 双轴数字刻度：纯数字 TEXT（x 轴 12 个）+ 换行数字串（y 轴 "40\n30\n..."）
function countAxisNumbers(container) {
  let n = 0;
  const walk = (x, d) => {
    if (!x || d > 8) return;
    if (x.type === "TEXT") {
      const s = String(x.characters || "").trim();
      if (/^\d+$/.test(s)) n += 1;
      else if (/^[\d\s.,:\-\/\n]+$/.test(s)) n += Math.min((s.match(/\d+/g) || []).length, 6);
    }
    if ("children" in x && d < 8) for (const c of x.children) walk(c, d + 1);
  };
  walk(container, 0);
  return n;
}
// 三条件同时满足才判折线图：① ≥1 条宽扁多段贝塞尔曲线；② ≥3 条等距水平网格；
// ③ ≥4 个数字刻度。1-1727 的静态仪表盘（圆弧 + 刻度，但无宽扁曲线/网格）、
// 53:34075 的环形图与柱状图（同心弧或矩形柱，无宽扁曲线）均不误伤。
function isLineChartCandidate(container) {
  if (!container || !("children" in container)) return false;
  const nm = String(container.name || "");
  if (/^@echarts\//i.test(nm)) return false;      // 已是图表 → 幂等跳过
  if (/^(?:header|bg)(?:-|$)/i.test(nm)) return false;
  // v20261111.60 幂等：子树里已经有真图表容器，说明这一段整理过了；
  // 否则第二次重跑时父级会因「子容器不再是 candidate」而失去 childHit 保护被整块升级。
  let hasChartChild = false;
  const scan = (x, d) => {
    if (!x || d > 10 || hasChartChild) return;
    if (x !== container && /^@echarts\//i.test(String(x.name || ""))) { hasChartChild = true; return; }
    if ("children" in x && d < 10) for (const c of x.children) scan(c, d + 1);
  };
  scan(container, 0);
  if (hasChartChild) return false;
  return countLineCurves(container) >= 1 && hasEvenGrid(container) && countAxisNumbers(container) >= 4;
}
// 取「最内层」满足容器，避免把 slot-con / 组件根整块升成图表
function findLineChartTargets(root) {
  const out = [], seen = new Set();
  const walk = (n, d) => {
    if (!n || d > 40 || seen.has(n.id)) return;
    seen.add(n.id);
    if ("children" in n && n.type !== "PAGE") {
      let childHit = false;
      for (const c of (n.children || [])) {
        if (c && "children" in c && isLineChartCandidate(c)) { childHit = true; break; }
      }
      if (isLineChartCandidate(n) && !childHit) out.push(n);
    }
    if ("children" in n && d < 40) for (const c of n.children) walk(c, d + 1);
  };
  walk(root, 0);
  return out;
}

// v20261111.59：数出容器内「带 innerRadius 的同心弧段」个数。
// Figma 的 EllipseNode.arcData = { startingAngle, endingAngle, innerRadius }，
// innerRadius>0 就是甜甜圈/扇区；多个不同起止角 = 多段数据系列（53:34075 实测 4 段）。
function countArcSegments(container) {
  let n = 0;
  const walk = (x, d) => {
    if (!x || d > 6 || n >= 12) return;
    try {
      const a = x.arcData;
      if (a && typeof a.innerRadius === "number" && a.innerRadius > 0.05) n++;
    } catch (e) {}
    if ("children" in x && d < 6) for (const c of x.children) walk(c, d + 1);
  };
  walk(container, 0);
  return n;
}
// 真图表判据：模型已显式写 @echarts/ → 尊重；否则看坐标轴/图例/系列语义层级、
// 【v59 新增】多段同心弧几何、以及【同级独立的图例容器】。
// 旧版只认容器内部的英文关键词，53:34075 的图例是环形图的平级兄弟 ⇒ 永远漏判。
function hasChartSemantics(container) {
  if (/^@echarts\//i.test(String(container.name || ""))) return true;
  let axisLike = 0;
  const walk = (n, d) => {
    if (!n || d > 5) return;
    if (/\b(?:axis|legend|series|grid|tooltip)\b/i.test(String(n.name || ""))) axisLike++;
    if ("children" in n && d < 5) for (const c of n.children) walk(c, d + 1);
  };
  walk(container, 0);
  const arcs = countArcSegments(container);
  let siblingLegend = false;
  try {
    const sibs = (container.parent && "children" in container.parent) ? container.parent.children : [];
    for (const s of sibs) {
      if (s === container) continue;
      if (/^legend(?:-|$)/i.test(String(s.name || "")) || /^list-[a-z0-9-]*legend/i.test(String(s.name || ""))) { siblingLegend = true; break; }
    }
  } catch (e) {}
  // ≥2 段弧本身已构成多系列图表；单段弧必须配图例才算（避免纯装饰发光环被误升）。
  return axisLike > 0 || arcs >= 2 || (arcs >= 1 && siblingLegend);
}
function normalizeChartName(container, summary) {
  const nm = String(container.name || "");
  if (/^@/.test(nm)) return;                              // @echarts/ @antd/ 已合规，尊重模型判断
  if (!/^(?:echarts-|chart-|gauge-)/i.test(nm)) return;  // 已是 graphic-*/item-* 等语义名 → 不重复处理
  const slug = chartSlug(nm);
  try {
    if (hasChartSemantics(container)) {
      // v59：多段同心弧 = 环形/饼图，类型统一写 pie；保留语义 slug 会让下游认不出图表类型。
      container.name = "@echarts/" + (countArcSegments(container) >= 2 ? "pie" : slug);
      summary.chartAtFixed++;
    }
    else { container.name = "graphic-" + slug; summary.chartNormalized++; }
  } catch (e) {}
}
function organizeGraphicContainers(root, summary) {
  if (!root) return;
  const targets = [], seen = new Set();
  const walk = (n, d) => {
    if (!n || d > 40 || seen.has(n.id)) return;
    seen.add(n.id);
    if ("children" in n && n.type !== "PAGE") {
      if (CHART_NAME_RE.test(String(n.name || "")) || isGraphicContainer(n)) targets.push(n);
    }
    if ("children" in n && d < 40) for (const c of n.children) walk(c, d + 1);
  };
  walk(root, 0);
  for (const ctn of targets) {
    try {
      if (!ctn || !("children" in ctn)) continue;
      // v20261114.66：图例永远和图表一个文件夹 —— 未定性的几何图表容器整体跳过矢量合并，
      // 同心多边形 / 轴标 TEXT / 图例色块全部留在原容器，不新建 img-* 把图例分家。
      if (isChartGeometryContainer(ctn)) {
        if (summary) summary.chartLegendGuarded = (Number(summary.chartLegendGuarded) || 0) + 1;
        continue;
      }
      const already = isGraphicContainer(ctn);
      const kids = Array.prototype.slice.call(ctn.children || []);
      // 容器外同级散落矢量：只诊断不移动 —— 跨父级 appendChild 会改相对坐标，视觉会漂移。
      if (!already && ctn.parent && "children" in ctn.parent) {
        for (const sib of ctn.parent.children) {
          if (sib === ctn || !isPureGraphicNode(sib) || !rectsOverlap(sib, ctn)) continue;
          summary.graphicOutside++;
        }
      }
      const graphic = kids.filter(isPureGraphicNode);
      const slug = chartSlug(ctn.name);
      // v20261111.60 硬门禁：AI / 视觉直接命名成 @echarts/* 的真图表，内部矢量
      // 绝不合并成 img-* 资源文件夹（旧版随后会挂 PNG@2x 把曲线固化成位图）。
      const isRealChart = /^@echarts\//i.test(String(ctn.name || ""));
      if (!already && graphic.length >= 2) {
        for (const n of graphic) { try { if (n.locked) { n.locked = false; summary.unlocked++; } } catch (e) {} }
        const minIdx = Math.min.apply(null, graphic.map(n => kids.indexOf(n)));
        const grp = isRealChart
          ? createChartSeriesFolder(ctn, graphic, "series-" + slug, summary)
          : createFolder(ctn, graphic, "img");
        if (grp) {
          if (isRealChart) {
            summary.chartSeriesFolders = (Number(summary.chartSeriesFolders) || 0) + 1;
          } else {
            try { grp.name = "img-" + slug; } catch (e) {}
            summary.graphicFolders++;
          }
          try { ctn.insertChild(Math.max(0, Math.min(minIdx, ctn.children.length - 1)), grp); } catch (e) {}
          summary.graphicMerged += graphic.length;
        } else {
          summary.graphicFailed++;
        }
      }
      normalizeChartName(ctn, summary);
      try { ctn.setPluginData("mvGraphicContainer", "1"); } catch (e) {}
    } catch (e) { summary.graphicFailed++; }
  }
}

// ---- 真环形图补升级 + 图例归一化（v20261111.59）-------------------------------
// 53:34075 实测：环形图由 4 个 innerRadius=0.763 的 ELLIPSE 扇区 + 2 个独立 TEXT 组成，
// 右侧 4 行色块图例是它的平级兄弟。旧链路把它判成 graphic-speed-gauge 并给内部
// bg-* 文件夹挂了 PNG@2x ⇒ 动态占比被固化成位图，下游无法用 ECharts 重建。
// 这里做确定性后处理（不依赖 LLM，零 token 模式同样生效）：
//   ① graphic-* 容器满足「≥2 段同心弧 + 含 TEXT 数值」→ 升为 @echarts/pie；
//   ② 内部 bg-/img- 资源文件夹改名 series-arcs、清 mvAssetFolder 标记与导出预设，
//      使 applyAssetExports 不再挂 PNG@2x；打 mvGraphicContainer 防止二次合并；
//   ③ 与其同级的 list-*-legend 归一为 legend-<语义> / legend-item-N / legend-swatch-N。
// 纯装饰环（无 TEXT 数值、单段弧、无图例）一律不动，1-1727 的静态仪表盘回归不受影响。
function promoteArcCharts(root, summary) {
  if (!root) return;
  const targets = [], seen = new Set();
  const collect = (n, d) => {
    if (!n || d > 40 || seen.has(n.id)) return;
    seen.add(n.id);
    if (/^graphic-/i.test(String(n.name || "")) && "children" in n) targets.push(n);
    if ("children" in n && d < 40) for (const c of n.children) collect(c, d + 1);
  };
  collect(root, 0);
  for (const ctn of targets) {
    try {
      if (countArcSegments(ctn) < 2) continue;
      if (!hasTextDescendant(ctn)) continue;
      ctn.name = "@echarts/pie";
      summary.arcChartPromoted = (Number(summary.arcChartPromoted) || 0) + 1;
      for (const c of Array.prototype.slice.call(ctn.children || [])) {
        if (!/^(?:bg|img|icon)[-]/i.test(String(c.name || ""))) continue;
        try { c.name = "series-arcs"; } catch (e) {}
        try { c.setPluginData("mvAssetFolder", ""); } catch (e) {}
        try {
          if (Array.isArray(c.exportSettings) && c.exportSettings.length) {
            c.exportSettings = [];
            summary.arcChartExportCleared = (Number(summary.arcChartExportCleared) || 0) + 1;
          }
        } catch (e) {}
      }
      try { ctn.setPluginData("mvGraphicContainer", "1"); } catch (e) {}
    } catch (e) { summary.arcChartFailed = (Number(summary.arcChartFailed) || 0) + 1; }
  }
}
// ---- 真折线 / 面积图补升级（v20261111.60）-----------------------------------
// 与 .59 的 promoteArcCharts 对称，但判据换成路径几何（不依赖 LLM / 渲染图）：
//   ① 最内层容器满足「宽扁多段贝塞尔曲线 + ≥3 条等距水平网格 + ≥4 个数字刻度」
//      → 升为 @echarts/line；
//   ② 内部资源文件夹：含曲线的改 series-line、网格/装饰改 axis-grid，清
//      mvAssetFolder 标记与全部导出预设，使 applyAssetExports 不再挂 PNG@2x；
//   ③ TEXT 刻度保持独立（下游要绑定动态数据）；打 mvLineChart 标记保幂等。
function promoteLineCharts(root, summary) {
  if (!root) return;
  const targets = findLineChartTargets(root);
  for (const ctn of targets) {
    try {
      const from = String(ctn.name || "");
      try { ctn.name = "@echarts/line"; } catch (e) {}
      try { ctn.setPluginData("mvLineChart", "1"); } catch (e) {}
      try { ctn.setPluginData("mvLineChartFrom", from); } catch (e) {}
      try { ctn.setPluginData("mvGraphicContainer", "1"); } catch (e) {}
      summary.lineChartPromoted = (Number(summary.lineChartPromoted) || 0) + 1;
      const seen = new Set();
      const walk = (x, d) => {
        if (!x || d > 12 || seen.has(x.id)) return;
        seen.add(x.id);
        const nm = String(x.name || "");
        let role = "";
        try { role = String(x.getPluginData("mvAssetFolder") || ""); } catch (e) {}
        // 只处理 bg/img 资源文件夹；真图标（icon-*）保留 SVG 导出不动。
        const isChartFolder = (/^(bg|img)$/.test(role) || /^(?:bg|img)-/.test(nm)) && "children" in x;
        if (isChartFolder) {
          const curveHit = countLineCurves(x) >= 1;
          try { x.name = curveHit ? "series-line" : "axis-grid"; } catch (e) {}
          try { x.setPluginData("mvAssetFolder", ""); } catch (e) {}
          try { x.setPluginData("mvChartSeries", "1"); } catch (e) {}
          clearExportsDeep(x, summary, 0);
        }
        if ("children" in x && d < 12) for (const c of x.children) walk(c, d + 1);
      };
      walk(ctn, 0);
      clearExportsDeep(ctn, summary, 0);
    } catch (e) {
      summary.lineChartFailed = (Number(summary.lineChartFailed) || 0) + 1;
    }
  }
}

// ---- @echarts/* 叶子误命名降级护栏（v20261111.64）-----------------------------
// 53:34075 实测：视觉 AI 把 @echarts/bar rename 配给了全屏背景 VECTOR（id 53:34076，
// 原 bg-panel-traffic + PNG@2x）。旧链路对 @ 前缀无条件放行：normalizeChartName 早退、
// organizeGraphicContainers 只收有 children 的容器、isBgLike 只认名字 ⇒ 背景被收进
// slot-con 又丢了导出，契约里输出裸行 `- @echarts/bar`，下游会把背景当柱状图重建。
// 这里在【AI ops 之后 / organizeGraphicContainers 之前】做确定性降级：
//  ① 全屏(≥90% W&H) + 有 fills → bg-panel，提回组件根最底层并恢复 PNG@2x；
//  ② 其余 → img-<原名>，按普通静态资源整体导出；
//  ③ mvLeafChartDemoted 标记 + 改名后不再命中 @ 前缀 ⇒ 重复整理幂等。
const LEAF_CHART_NAME_RE = /^@(?:echarts|antd)\//i;
function demoteLeafCharts(root, summary) {
  if (!root) return;
  const rb = nodeBox(root);
  const seen = new Set(), targets = [];
  const walk = (n, d) => {
    if (!n || d > 40 || seen.has(n.id)) return;
    seen.add(n.id);
    const kids = ("children" in n) && Array.isArray(n.children) ? n.children.length : 0;
    if (n !== root && !kids && LEAF_CHART_NAME_RE.test(String(n.name || ""))) targets.push(n);
    if ("children" in n && d < 40) for (const c of (n.children || [])) walk(c, d + 1);
  };
  walk(root, 0);
  for (const n of targets) {
    try {
      if (String(n.getPluginData("mvLeafChartDemoted") || "") === "1") continue;
      const from = String(n.name || "");
      const b = nodeBox(n);
      const full = rb.w > 0 && rb.h > 0 && b.w / rb.w >= 0.9 && b.h / rb.h >= 0.9;
      let hasFills = false;
      try { hasFills = Array.isArray(n.fills) && n.fills.length > 0; } catch (e) {}
      const asBg = full && hasFills;
      const slug = from.replace(/^@/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "chart";
      n.name = asBg ? "bg-panel" : "img-" + slug;
      n.setPluginData("mvLeafChartDemoted", "1");
      n.setPluginData("mvLeafChartFrom", from);
      if (summary) summary.leafChartDemoted = (Number(summary.leafChartDemoted) || 0) + 1;
      if (asBg) {
        // 背景必须直属组件根且沉在 z 序最底；Figma 原生 reparent 保持绝对位置，视觉零改动。
        try {
          if (root && typeof root.insertChild === "function" && (n.parent !== root || root.children[0] !== n)) {
            root.insertChild(0, n);
          }
        } catch (e) {}
        try {
          if (setExportPreset(n, "bg") && summary) {
            summary.leafChartExportRestored = (Number(summary.leafChartExportRestored) || 0) + 1;
          }
        } catch (e) {}
        if (summary) summary.leafChartBgRestored = (Number(summary.leafChartBgRestored) || 0) + 1;
      }
    } catch (e) {
      if (summary) summary.leafChartFailed = (Number(summary.leafChartFailed) || 0) + 1;
    }
  }
}

// ---- 真柱状图补升级（v20261111.64）-------------------------------------------
// 53:34075 实测：柱体是 12 个等宽（w=12）窄高 GROUP，x 间距恒 28、底边对齐；
// 配 6 条等距水平网格（y 差 18）与 y/x 双轴数字刻度（graphic-area 直属 18 个）。
// .59 只认同心弧、.60 只认宽扁贝塞尔曲线，bar 从来没有确定性判据 ⇒ 柱子被 img-area
// 挂 PNG@2x 固化成图片、数字写死。这里补第三套几何判据，零 token 生效，与 .60 对称。
function collectBarPillars(container) {
  const out = [];
  const walk = (x, d) => {
    if (!x || d > 8 || out.length >= 48) return;
    try { if (x.visible === false || x.type === "TEXT") return; } catch (e) {}
    const t = String(x.type || "");
    const b = nodeBox(x);
    // 窄高矩形柱：w 6..40、h≥8、w/h≤0.6。命中即不再下钻，避免外层 Group 与
    // 内部「柱子 / 柱体」VECTOR 被重复计数；网格线 w≥60、h≤2 天然不命中。
    if (/^(?:RECTANGLE|VECTOR|GROUP|FRAME|INSTANCE|BOOLEAN_OPERATION)$/.test(t)
        && b.w >= 6 && b.w <= 40 && b.h >= 8 && b.w / Math.max(b.h, 0.5) <= 0.6) {
      out.push({ x: b.x, w: b.w, bottom: b.y + b.h });
      return;
    }
    if ("children" in x && d < 8) for (const c of (x.children || [])) walk(c, d + 1);
  };
  walk(container, 0);
  return out;
}
// 取「等宽(±2) + 同底(±3) + x 等距(最大/最小 ≤1.8)」的最长连续段；≥6 根才算柱图。
function countBarPillars(container) {
  const all = collectBarPillars(container);
  if (all.length < 6) return 0;
  let best = 0;
  for (const seed of all) {
    const grp = all.filter(a => Math.abs(a.w - seed.w) <= 2 && Math.abs(a.bottom - seed.bottom) <= 3)
      .sort((a, b) => a.x - b.x);
    if (grp.length < 6) continue;
    let run = 1, prevGap = null;
    for (let j = 1; j < grp.length; j++) {
      const g = grp[j].x - grp[j - 1].x, w = grp[j].w;
      const even = prevGap === null
        || Math.max(g, prevGap) / Math.max(Math.min(g, prevGap), 0.5) <= 1.8;
      if (g >= w + 1 && g <= w * 8 && even) { run++; prevGap = g; }
      else { run = 1; prevGap = null; }
      if (run > best) best = run;
    }
  }
  return best;
}
// 与 isLineChartCandidate 对称：≥6 根等宽等距柱 + ≥3 条等距网格 + ≥4 个数字刻度，
// 且自身/子树都不是已升级的 @echarts/*（重跑整理幂等，不会把父级整块升级）。
function isBarChartCandidate(container) {
  if (!container || !("children" in container)) return false;
  const nm = String(container.name || "");
  if (/^@echarts\//i.test(nm)) return false;
  if (/^(?:header|bg)(?:-|$)/i.test(nm)) return false;
  let hasChartChild = false;
  const scan = (x, d) => {
    if (!x || d > 10 || hasChartChild) return;
    if (x !== container && /^@echarts\//i.test(String(x.name || ""))) { hasChartChild = true; return; }
    if ("children" in x && d < 10) for (const c of (x.children || [])) scan(c, d + 1);
  };
  scan(container, 0);
  if (hasChartChild) return false;
  return countBarPillars(container) >= 6 && hasEvenGrid(container) && countAxisNumbers(container) >= 4;
}
function findBarChartTargets(root) {
  const out = [], seen = new Set();
  const walk = (n, d) => {
    if (!n || d > 40 || seen.has(n.id)) return;
    seen.add(n.id);
    if ("children" in n && n.type !== "PAGE") {
      let childHit = false;
      for (const c of (n.children || [])) {
        if (c && "children" in c && isBarChartCandidate(c)) { childHit = true; break; }
      }
      if (isBarChartCandidate(n) && !childHit) out.push(n);
    }
    if ("children" in n && d < 40) for (const c of n.children) walk(c, d + 1);
  };
  walk(root, 0);
  return out;
}
function promoteBarCharts(root, summary) {
  if (!root) return;
  const targets = findBarChartTargets(root);
  for (const ctn of targets) {
    try {
      const from = String(ctn.name || "");
      ctn.name = "@echarts/bar";
      try { ctn.setPluginData("mvBarChart", "1"); } catch (e) {}
      try { ctn.setPluginData("mvBarChartFrom", from); } catch (e) {}
      try { ctn.setPluginData("mvGraphicContainer", "1"); } catch (e) {}
      if (summary) summary.barChartPromoted = (Number(summary.barChartPromoted) || 0) + 1;
      const seen = new Set();
      const walk = (x, d) => {
        if (!x || d > 12 || seen.has(x.id)) return;
        seen.add(x.id);
        if (x !== ctn && "children" in x) {
          const nm = String(x.name || "");
          let role = "";
          try { role = String(x.getPluginData("mvAssetFolder") || ""); } catch (e) {}
          const isChartFolder = /^(bg|img)$/.test(role) || /^(?:bg|img)(?:-|$)/.test(nm);
          if (isChartFolder) {
            const hasBars = countBarPillars(x) >= 3;
            try { x.name = hasBars ? "series-bar" : "axis-grid"; } catch (e) {}
            try { x.setPluginData("mvAssetFolder", ""); } catch (e) {}
            try { x.setPluginData("mvChartSeries", "1"); } catch (e) {}
            clearExportsDeep(x, summary, 0);
          }
        }
        if ("children" in x && d < 12) for (const c of (x.children || [])) walk(c, d + 1);
      };
      walk(ctn, 0);
      clearExportsDeep(ctn, summary, 0);
    } catch (e) {
      if (summary) summary.barChartFailed = (Number(summary.barChartFailed) || 0) + 1;
    }
  }
}
function normalizeChartLegend(root, summary) {
  if (!root) return;
  const seen = new Set();
  const walk = (n, d) => {
    if (!n || d > 40 || seen.has(n.id)) return;
    seen.add(n.id);
    if ("children" in n) {
      const kids = Array.prototype.slice.call(n.children || []);
      // v20261111.60：除了「与真图表同级」，图表容器【自身】的子图例也要归一
      //（5:35420 升级 section → @echarts/line 后 legend 变成子节点）。
      const selfChart = /^@echarts\//i.test(String(n.name || ""));
      if (selfChart || kids.some(k => /^@echarts\//i.test(String(k.name || "")))) {
        for (const lg of kids) {
          const nm = String(lg.name || "");
          if (!/^list-[a-z0-9-]*legend|^list-legend/i.test(nm)) continue;
          const slug = nm.replace(/^list-/i, "").replace(/[-_]?legend(?:[-_]|$)/gi, "").replace(/[-_]+$/, "").trim() || "chart";
          try {
            lg.name = "legend-" + slug;
            summary.legendNormalized = (Number(summary.legendNormalized) || 0) + 1;
            for (const it of Array.prototype.slice.call(lg.children || [])) {
              const im = /(\d+)\s*$/.exec(String(it.name || ""));
              const idx = im ? im[1] : "1";
              if (/^item-/i.test(String(it.name || ""))) {
                try { it.name = "legend-item-" + idx; } catch (e) {}
              }
              for (const c of Array.prototype.slice.call(it.children || [])) {
                if (c.type === "TEXT" || !isDefaultGraphicName(String(c.name || ""))) continue;
                try {
                  c.name = "legend-swatch-" + idx;
                  summary.legendSwatchFixed = (Number(summary.legendSwatchFixed) || 0) + 1;
                } catch (e) {}
              }
            }
          } catch (e) {}
        }
      }
      for (const c of kids) walk(c, d + 1);
    }
  };
  walk(root, 0);
}

// ---- 零散图形段合并（v20261110.18）------------------------------------------
// 用户 node-id=1-1727 实测：item-rate-metric-4 里 8 个默认名 Ellipse、2 个 bg-*
// 仍散在图层面板。根因是三条启发式判据互相打架：
//   ① organizeGraphicContainers 只认 echarts-/chart-/gauge- 容器，普通 graphic-*/item-* 完全不进；
//   ② isDecoration 只对 VECTOR/BOOLEAN_OPERATION/LINE/STAR/POLYGON 无条件判装饰，
//      ELLIPSE/RECTANGLE 叶子只有排在 kids 前 30% 才算装饰 ⇒ 排在 TEXT 之后的全部漏判成 content；
//   ③ isForegroundDecor 把压在 content 上的图形 keepInPlace，只补 bg- 前缀、不成组
//      （诊断里的「前景保留 8」），bg--4-_-7 这类怪名字正是补前缀的产物。
// 治本：不看类型 / 位置 / 视觉意图，只看【同父级连续的纯图形段】。整段被一个 Group 替换
// 并插回原起始 index ⇒ 段内相对顺序不变、段外相对顺序不变 ⇒ z-order 等价、视觉零改动，
// 因此也不再需要「前景装饰保留」这种会把合并挡掉的豁免。
function isLooseGraphic(n) {
  if (!n || n.type === "TEXT") return false;
  if (folderRole(n) || isGraphicContainer(n)) return false;
  // v20261111.30 Step 1 补齐：mergeLooseGraphicRuns 在主流程里【先于】organizeLayout 执行。
  // 旧判据只排除 FRAME/GROUP/INSTANCE 的语义名，RECTANGLE 叶子（如 image 473992 / img-* 截图）
  // 不看名字就被当成「零散图形」，整段被 createFolder 收进 bg-* 文件夹；之后 organizeLayout
  // 因祖先链已有文件夹直接 return，.29 的装饰四分流判据永远作用不到这些节点。
  // 这就是 53:31607 重跑后监控截图仍与毛玻璃底图同组、视觉仍损坏 26.18% 的直接原因。
  const nm = String(n.name || "");
  if (SEMANTIC_PREFIX.test(nm)) return false;   // img-/icon-/section-/graphic-/@... 一律是内容
  if (fillHas(n, /IMAGE/)) return false;        // 任意命名的 IMAGE 填充 = 内容图，不是装饰碎片
  if (hasAbsGeometry(n)) {                      // 真实 Figma 节点才做绝对几何判据
    const base = absRect(componentRootOf(n));
    if (isBlurBackdrop(n, base)) return false;  // 整块毛玻璃底图必须保持 root 最底层，不与内容同组
  }
  if (hasTextDescendant(n)) return false;
  if (!GRAPHIC_TYPES[n.type]) return false;
  // 带语义名的容器（axis-x / legend / icon-item-xxx 这类）交给 groupChildrenByCategory 收纳，
  // 绝不在这一段里被压平，否则下游模型就看不到组件边界了。
  if ((n.type === "FRAME" || n.type === "GROUP" || n.type === "INSTANCE") && !isDefaultGraphicName(n.name)) return false;
  return true;
}
function runRole(nodes) {
  const names = nodes.map(n => String(n.name || ""));
  if (names.every(nm => /^icon-/.test(nm))) return "icon";
  if (names.every(nm => /^img-/.test(nm))) return "img";
  return "bg";
}
function mergeLooseGraphicRuns(containers, summary) {
  if (!Array.isArray(containers)) return;
  for (const parent of containers) {
    try {
      if (!parent || !("children" in parent)) continue;
      if (folderRole(parent) || isGraphicContainer(parent)) continue;
      // v20261114.66：图例永远和图表一个文件夹 —— 几何图表容器里的裸 VECTOR
      // 不按连续图形段收进 bg-*，否则图例色块会与雷达几何分到两个文件夹。
      if (isChartGeometryContainer(parent)) {
        summary.chartLegendSkippedMerge = (Number(summary.chartLegendSkippedMerge) || 0) + 1;
        continue;
      }
      const kids = Array.prototype.slice.call(parent.children || []);
      if (kids.length < 2) continue;
      let run = [];
      const flush = () => {
        if (run.length < 2) { run = []; return; }
        for (const n of run) { try { if (n.locked) { n.locked = false; summary.unlocked++; } } catch (e) {} }
        // 用【当前】children 里段首节点的位置，而不是原始快照 index：
        // 同一容器可能合并多段，前一段已让后续节点前移，快照 index 会偏大导致 z 序错乱。
        const idx = Math.max(0, parent.children.indexOf(run[0]));
        const role = runRole(run);
        const g = createFolder(parent, run, role);
        if (g) {
          const seq = summary.graphicRunFolders + 1;
          try { g.name = role + "-" + folderSemantic(parent, role) + (seq > 1 ? "-" + seq : ""); } catch (e) {}
          try { g.setPluginData("mvGraphicRun", "1"); } catch (e) {}
          try { parent.insertChild(Math.max(0, Math.min(idx, parent.children.length - 1)), g); } catch (e) {}
          summary.graphicRunFolders++;
          summary.graphicRunMerged += run.length;
        } else {
          summary.graphicRunFailed++;
        }
        run = [];
      };
      for (let i = 0; i < kids.length; i++) {
        if (isLooseGraphic(kids[i])) run.push(kids[i]);
        else flush();
      }
      flush();
    } catch (e) { summary.graphicRunFailed++; }
  }
}

// ---- P0-a：确定性布局后处理（约定 > 配置）-------------------------------------
// 模型只做语义命名；装饰收纳、分层、从上到下排序全部由代码按真实几何完成。
// Figma children[0] = z 最底层（图层面板最下方），所以「图层面板从上到下 = 视觉从上到下」
// 等价于：content 按 y 降序铺在 children 里，bg 放在最底。
// 业务语义白名单：这些前缀代表「内容」，绝不作为装饰收纳。
// 注意 bg- 不在此列——它是模型给出的明确装饰信号，应优先判为装饰（见 isDecoration 开头）。
// v20261110.27：section-（异构分区）/ graphic-（静态图形容器）也属于业务内容，
// 必须进白名单，否则 isDecoration 会把新命名的子模块当成装饰收进 bg-* 文件夹。
// item- 从此只表示【带 -N 序号的同构循环子项】，不带序号的异构容器一律 section-/graphic-。
const SEMANTIC_PREFIX = /^(cp-|card-|list-|item-|section-|graphic-|form-|img-|icon-|badge-|echarts-|@|header|slot-|chart-|legend|axis|label|value)/i;
const GRAPHIC_TYPES = { VECTOR: 1, BOOLEAN_OPERATION: 1, LINE: 1, ELLIPSE: 1, RECTANGLE: 1, STAR: 1, POLYGON: 1, FRAME: 1, GROUP: 1 };

function hasTextDescendant(n, depth) {
  depth = depth || 0;
  if (depth > 4) return false;
  if (n.type === "TEXT") return true;
  if ("children" in n) for (const c of n.children) if (hasTextDescendant(c, depth + 1)) return true;
  return false;
}
function childCount(n) { return ("children" in n && Array.isArray(n.children)) ? n.children.length : 0; }
function fillHas(n, re) {
  try {
    if (Array.isArray(n.fills)) for (const f of n.fills) if (f && f.visible !== false && re.test(String(f.type || ""))) return true;
  } catch (e) {}
  return false;
}
function isPureGraphicGroup(n) {
  if (!childCount(n)) return false;
  for (const c of n.children) {
    if (!GRAPHIC_TYPES[c.type] || hasTextDescendant(c)) return false;
  }
  return true;
}
function rectsOverlap(a, b) {
  const ax = a.x || 0, ay = a.y || 0, aw = a.width || 0, ah = a.height || 0;
  const bx = b.x || 0, by = b.y || 0, bw = b.width || 0, bh = b.height || 0;
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

// ---- v20261111.29 Step 0：绝对坐标基座 -------------------------------------------
// 根因：figma.group() 之后 node.x/y 会按新父级重算（见 664-668），跨父级比较天然不可比；
// 之前所有分组/装饰判据只用相对 x/y，导致图片被当成「同父级的大图形」误判为背景。
// 优先级：absoluteBoundingBox（Plugin API 只读绝对包围盒）→ absoluteTransform（平移 tx/ty）
// → 相对 x/y（纯对象测试桩 / 旧数据兼容）。全程只用本地 Plugin API，不引入 REST、不联网。
const NEAR_FULLSCREEN_RATIO = 0.9; // 宽【且】高都 ≥90% 才算整块底图（旧版 0.8 用 OR，384/420 就误判）
function absRect(n) {
  if (!n) return null;
  try {
    const b = n.absoluteBoundingBox;
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y)
        && Number.isFinite(b.width) && Number.isFinite(b.height)) {
      return { x: b.x, y: b.y, w: b.width, h: b.height,
               right: b.x + b.width, bottom: b.y + b.height };
    }
  } catch (e) {}
  try {
    const t = n.absoluteTransform; // [[a,b,tx],[c,d,ty]]
    if (t && t.length >= 2 && t[0] && t[1]
        && Number.isFinite(t[0][2]) && Number.isFinite(t[1][2])
        && Number.isFinite(n.width) && Number.isFinite(n.height)) {
      return { x: t[0][2], y: t[1][2], w: n.width, h: n.height,
               right: t[0][2] + n.width, bottom: t[1][2] + n.height };
    }
  } catch (e) {}
  const x = Number(n.x) || 0, y = Number(n.y) || 0;
  const w = Number(n.width) || 0, h = Number(n.height) || 0;
  return { x: x, y: y, w: w, h: h, right: x + w, bottom: y + h };
}
// 找当前组件根（最顶层非 PAGE 容器），用于把绝对坐标统一到同一原点。
function componentRootOf(n) {
  let p = n, hops = 0;
  while (p && p.parent && p.parent.type !== "PAGE" && hops++ < 40) p = p.parent;
  return p || n;
}
function relRect(n, base) {
  const r = absRect(n);
  if (!r) return null;
  const b = base || absRect(componentRootOf(n));
  if (!b) return null;
  return { x: r.x - b.x, y: r.y - b.y, w: r.w, h: r.h,
           right: r.right - b.x, bottom: r.bottom - b.y,
           cx: r.x - b.x + r.w / 2, cy: r.y - b.y + r.h / 2 };
}
function hasAbsGeometry(n) { return !!(n && (n.absoluteBoundingBox || n.absoluteTransform)); }
// 近全屏判据（统一入口）：必须宽【且】高都达标，杜绝「宽 91% 就被当整页背景」。
function isNearFullscreen(n, base) {
  const r = relRect(n, base);
  if (!r || !base || base.w <= 0 || base.h <= 0) return false;
  return r.w >= base.w * NEAR_FULLSCREEN_RATIO && r.h >= base.h * NEAR_FULLSCREEN_RATIO;
}
// 整块毛玻璃底图：带 BLUR 效果 + 近全屏。它必须保持原 z-index，绝不与内容节点同组。
function isBlurBackdrop(n, base) {
  if (!isNearFullscreen(n, base)) return false;
  try {
    const fx = n.effects || [];
    for (const e of fx) if (e && e.visible !== false && /BLUR/i.test(String(e.type || ""))) return true;
  } catch (e2) {}
  return false;
}

// 几何判据：语义前缀白名单 + 含 TEXT 后代 = 内容，绝不收纳（防误伤业务容器）。
// v20261111.29 Step 1：装饰四分流。ctx.abs 为真（真实 Figma 节点有绝对坐标）时走新判据；
// 纯对象测试桩 / 旧数据 ctx.abs 为假时严格保持旧行为，保证回归探针与历史整理结果不回归。
function isDecoration(n, parent, ctx) {
  if (!n || n.type === "TEXT") return false;
  const nm = n.name || "";
  if (folderRole(n)) return false;            // 插件自建的文件夹：跳过，避免嵌套
  const c = ctx || {};
  const abs = !!c.abs, base = c.base;

  // ① 非近全屏的 IMAGE 填充一律是【内容图】，不是背景装饰。
  //    旧版 fillHas(/IMAGE|GRADIENT/) 把 384×218 监控截图判成装饰 → 收进 bg-* → 被毛玻璃盖住。
  if (abs && fillHas(n, /IMAGE/) && !isNearFullscreen(n, base)) return false;

  // ② bg- 前缀不再是无条件正信号：非近全屏时交给几何判定，
  //    避免「局部卡片底 / 分隔线」被打上 bg- 后重跑又被硬收进根级 bg 文件夹。
  if (/^bg-/.test(nm)) {
    if (!abs || isNearFullscreen(n, base)) return true;
  }
  if (SEMANTIC_PREFIX.test(nm)) return false;
  if (hasTextDescendant(n)) return false;
  const t = n.type;
  if (t === "VECTOR" || t === "BOOLEAN_OPERATION" || t === "LINE" || t === "STAR" || t === "POLYGON") return true;
  const pw = parent.width || 0, ph = parent.height || 0;
  if (GRAPHIC_TYPES[t]) {
    // ③ 近全屏判据从「0.8 且用 OR」改为「0.9 且必须宽高同时达标」；
    //    旧版 384/420=91% 单靠宽度就触发，是图片被误判的第二条路径。
    if (abs) {
      if (isNearFullscreen(n, base)) return true;
    } else if (pw > 0 && ph > 0 && ((n.width || 0) >= pw * 0.8 || (n.height || 0) >= ph * 0.8)) return true;
    if (fillHas(n, /GRADIENT/) && childCount(n) <= 2) return true; // IMAGE 已由 ① 单独处理
    if (childCount(n) === 0 && c.total > 0 && c.index <= c.total * 0.3) return true;
    if ((t === "FRAME" || t === "GROUP" || t === "INSTANCE") && isPureGraphicGroup(n)) return true;
  }
  return false;
}

// organizeLayout：对单个容器做「装饰收纳 + 分层 + 从上到下排序」。
// 交叉验证：视觉意图只作加权/否决，不产生任何结构变更；几何为默认兜底。
// v20261111.35 P2：tab 数字徽标（badge）零 token 归一化。
// 判据（2:8858 原始树 / 整理后树各 4/4 命中、0 误伤）：
//   ≤26×26 + 恰好 1 个纯数字 TEXT + ≥1 个纯色 RECTANGLE/ELLIPSE/VECTOR。
// 归属：badge 左边界 ≈ tab 容器右边界（±15px）且 y 重叠 > 0。
// 硬约束：只改名 + pluginData，不 reparent / 不建组 / 不动 z-order（.31 视觉回归教训）。
function isTabBadgeNode(n) {
  if (!n || !("children" in n)) return false;
  const r = absRect(n);
  if (!r || r.w <= 0 || r.h <= 0 || r.w > 26 || r.h > 26) return false;
  const kids = Array.prototype.slice.call(n.children || []);
  if (kids.length < 2) return false;
  const nums = kids.filter(c => c && c.type === "TEXT" && /^\d{1,4}$/.test(String(c.characters || "").trim()));
  if (nums.length !== 1) return false;
  return kids.some(c => c && /^(RECTANGLE|ELLIPSE|VECTOR)$/.test(c.type) &&
    Array.prototype.slice.call(c.fills || []).some(f => f && f.type === "SOLID"));
}
function normalizeTabBadges(root, summary) {
  const s = summary || {};
  if (!root || !("children" in root)) return 0;
  const all = [], seen = new Set();
  (function walk(n, parent, depth) {
    if (!n || depth > 40 || seen.has(n.id)) return;
    seen.add(n.id);
    all.push({ n: n, parent: parent });
    if ("children" in n) for (const c of Array.prototype.slice.call(n.children || [])) walk(c, n, depth + 1);
  })(root, null, 0);
  const badges = all.filter(x => isTabBadgeNode(x.n) || /^badge-count-/i.test(String(x.n.name || "")));
  if (!badges.length) return 0;
  // tab 容器：含非纯数字 TEXT、宽 28..90；列表行里的「待办」等按 y 重叠自动排除。
  const tabFrames = [];
  for (const x of all) {
    const r = absRect(x.n);
    if (!r || r.w < 28 || r.w > 90 || r.h <= 0) continue;
    const t = Array.prototype.slice.call(x.n.children || []).filter(c =>
      c && c.type === "TEXT" && !/^\d{1,4}$/.test(String(c.characters || "").trim()))[0];
    if (!t) continue;
    tabFrames.push({ r: r, label: String(t.characters || "").trim().replace(/\s+/g, "").slice(0, 12) });
  }
  badges.sort((a, b) => {
    const ra = absRect(a.n) || { x: 0, y: 0 }, rb = absRect(b.n) || { x: 0, y: 0 };
    return (ra.x - rb.x) || (ra.y - rb.y);
  });
  let matched = 0, renamed = 0, idx = 0;
  for (const b of badges) {
    idx++;
    const r = absRect(b.n) || { x: 0, y: 0 };
    let best = null;
    for (const t of tabFrames) {
      const d = Math.abs(r.x - t.r.right);
      const ov = Math.min(r.y + r.h, t.r.y + t.r.h) - Math.max(r.y, t.r.y);
      if (ov <= 0 || d > 15) continue;
      if (!best || d < best.d) best = { t: t, d: d };
    }
    const label = best ? best.t.label : "";
    if (best) matched++;
    const target = "badge-count-" + twoDigit(idx);
    try {
      if (String(b.n.name || "") !== target) {
        if (b.n.locked) b.n.locked = false;
        b.n.name = target; renamed++;
      }
      b.n.setPluginData("mvTabBadge", label);
      b.n.setPluginData("mvTabBadgeIndex", String(idx));
    } catch (e) {}
    // 历史整理结果里 badge 已被并进 icon-* 文件夹：只把文件夹改名为 badge-group-*，
    // 使其不再按 icon 资源整体导出；不 reparent、不建组、不动 z-order。
    const p = b.parent;
    if (p && /^icon-/i.test(String(p.name || ""))) {
      const members = Array.prototype.slice.call(p.children || []);
      if (members.length >= 2 && members.filter(isTabBadgeNode).length >= 2) {
        const slug = String(p.name || "").replace(/^icon-/i, "").trim() || "tabs";
        const pn = "badge-group-" + slug;
        try {
          if (String(p.name || "") !== pn) {
            if (p.locked) p.locked = false;
            p.name = pn;
            s.badgeGroupRenamed = (Number(s.badgeGroupRenamed) || 0) + 1;
          }
        } catch (e) {}
      }
    }
  }
  s.badgeFound = (Number(s.badgeFound) || 0) + badges.length;
  s.badgeRenamed = (Number(s.badgeRenamed) || 0) + renamed;
  s.badgeMatched = (Number(s.badgeMatched) || 0) + matched;
  return badges.length;
}

// v20261111.35 P0：Auto Layout 容器的 children 顺序就是【视觉坐标】。
// 普通 Group 里 appendChild 只改 z-order，但 VERTICAL/HORIZONTAL FRAME 里会直接把行上下颠倒
// （2:8858 实测 6 行告警列表倒序 → 51.7036% 视觉回归）。:673 已有同类判断，这里统一成唯一入口。
function isAutoLayoutContainer(n) {
  if (!n) return false;
  let mode = "";
  try { mode = String(n.layoutMode || ""); } catch (e) { return false; }
  return mode !== "" && mode !== "NONE";
}

// === v20261114 L0 · Auto Layout 只读自检（BEGIN）===
// 判据单一来源：docs/2026-11-14-Figma结构整理规范.md §3.1/§3.2 + 布局真值整治方案 §4.3。
// 纯计算：不写任何 Figma 属性、不连生成管线；输出只进本地 JSON / 结构清单 / clientStorage。
// 与上面 isAutoLayoutContainer() 的区别：那个只判「现在是不是 AL」，这里判「几何上该不该是 AL」。
// BEGIN/END 标记供离线 golden 自测按源码切片执行，避免测试跑的是复制品。
function inferAutoLayoutFromBoxes(boxes, containerBox, current) {
  const cur = current || {};
  const EPS = 2;
  const arr = (Array.isArray(boxes) ? boxes : []).filter(b =>
    b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h) && b.w > 0 && b.h > 0);
  const out = { geoMode: "unknown", gaps: [], gap: null, uniform: false, reason: "", suggest: null, modeConflict: false, warnings: [] };
  if (arr.length < 2) { out.reason = arr.length ? "single-child" : "no-bbox"; return out; }

  const overlapRate = (a, b, axis) => {
    const s1 = axis === "x" ? a.x : a.y, e1 = s1 + (axis === "x" ? a.w : a.h);
    const s2 = axis === "x" ? b.x : b.y, e2 = s2 + (axis === "x" ? b.w : b.h);
    const inter = Math.min(e1, e2) - Math.max(s1, s2);
    const span = Math.min(e1 - s1, e2 - s2);
    return span > 0 ? inter / span : 0;
  };
  // 主轴判定（区间法，不用「对齐」）：沿轴排序，区间两两不交叠（容差 2px）且另一轴重叠率 ≥0.5
  const axisGaps = (axis) => {
    const sorted = arr.slice().sort((p, q) => (axis === "y" ? p.y - q.y : p.x - q.x));
    const gaps = [];
    let disjoint = true;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], next = sorted[i];
      const ps = axis === "y" ? prev.y : prev.x, pe = ps + (axis === "y" ? prev.h : prev.w);
      const ns = axis === "y" ? next.y : next.x;
      gaps.push(Math.round((ns - pe) * 10) / 10);
      if (ns - pe < -EPS) disjoint = false;
      if (overlapRate(prev, next, axis === "y" ? "x" : "y") < 0.5) disjoint = false;
    }
    return { gaps: gaps, disjoint: disjoint, sorted: sorted };
  };

  const col = axisGaps("y"), row = axisGaps("x");
  let mode = "", gaps = [];
  if (col.disjoint) { mode = "column"; gaps = col.gaps; }
  else if (row.disjoint) { mode = "row"; gaps = row.gaps; }
  else mode = "free-overlay";

  if (mode === "free-overlay" || gaps.some(g => g < -EPS)) {
    // 子项重叠 ⇒ AL 无法表达重叠；硬设会把内容摊平（真机 2:3660 就是这么错的）
    out.geoMode = "free-overlay";
    out.reason = "children-overlap";
    out.suggest = { layoutMode: "NONE", hint: "子项重叠，Auto Layout 无法表达；保持普通 Frame 自由摆放" };
    out.gaps = gaps;
  } else {
    out.gaps = gaps;
    const maxG = Math.max.apply(null, gaps), minG = Math.min.apply(null, gaps);
    out.uniform = (maxG - minG) <= EPS;
    out.gap = out.uniform ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null;
    // 守卫 G1：任一子项越出容器 bbox >2px ⇒ 不判 between
    let outOfBounds = false;
    if (containerBox) for (const b of arr) {
      if (b.x < containerBox.x - EPS || b.y < containerBox.y - EPS ||
          b.x + b.w > containerBox.x + containerBox.w + EPS ||
          b.y + b.h > containerBox.y + containerBox.h + EPS) { outOfBounds = true; break; }
    }
    // 首尾贴边（≤16px）
    let edgeTouch = false;
    if (containerBox) {
      const sorted = mode === "row" ? row.sorted : col.sorted;
      const first = sorted[0], last = sorted[sorted.length - 1];
      const lead = mode === "row" ? first.x - containerBox.x : first.y - containerBox.y;
      const tail = mode === "row"
        ? (containerBox.x + containerBox.w) - (last.x + last.w)
        : (containerBox.y + containerBox.h) - (last.y + last.h);
      edgeTouch = lead <= 16 && tail <= 16 && lead >= -EPS && tail >= -EPS;
    }
    // 守卫 G2：仅 1 个 gap 且 gap > 主轴尺寸×0.3 ⇒ between（不写 gap）
    const axisSize = containerBox ? (mode === "row" ? containerBox.w : containerBox.h) : 0;
    const singleLargeGap = gaps.length === 1 && axisSize > 0 && gaps[0] > axisSize * 0.3;
    const modeUpper = mode === "row" ? "HORIZONTAL" : "VERTICAL";
    // 守卫 G2 必须优先于 uniform：单个 gap 恒满足 max-min=0，若不提前判 between，
    // 「标题左 + 下拉右」会被误写成 itemSpacing=220（整治方案 §4.3 step6 / §4.4 88:32 实锤）。
    if (singleLargeGap && !outOfBounds) {
      out.uniform = false; out.gap = null;
      out.geoMode = mode + "-between";
      out.reason = "single-large-gap";
      out.suggest = { layoutMode: modeUpper, itemSpacing: 0, primaryAxisAlignItems: "SPACE_BETWEEN",
        counterAxisAlignItems: "CENTER", primaryAxisSizingMode: "FIXED", counterAxisSizingMode: "FIXED" };
    } else if (out.uniform) {
      out.geoMode = mode;
      out.suggest = { layoutMode: modeUpper, itemSpacing: out.gap, primaryAxisAlignItems: "MIN",
        counterAxisAlignItems: "MIN", primaryAxisSizingMode: "FIXED", counterAxisSizingMode: "FIXED" };
    } else if (edgeTouch && !outOfBounds) {
      // 守卫 G3：间距不齐但首尾贴边 ⇒ between（不写 gap）
      out.geoMode = mode + "-between";
      out.reason = "edge-to-edge";
      out.suggest = { layoutMode: modeUpper, itemSpacing: 0, primaryAxisAlignItems: "SPACE_BETWEEN",
        counterAxisAlignItems: "CENTER", primaryAxisSizingMode: "FIXED", counterAxisSizingMode: "FIXED" };
    } else {
      // 间距不齐：v2 §3.4 明确「若强行 VERTICAL 会把不齐的间距抹平」⇒ 保持自由摆放
      out.geoMode = "column-stack";
      out.reason = "non-uniform-gaps";
      out.suggest = { layoutMode: "NONE", hint: "间距不齐（gaps " + gaps.join("/") + "），强行 AL 会抹平间距；保持自由摆放" };
    }
  }

  // 现有属性（只读）vs 几何推断 → 冲突 / 建议补 AL
  const lm = String(cur.layoutMode || "NONE").toUpperCase();
  const hasAL = lm === "HORIZONTAL" || lm === "VERTICAL";
  const geoWantsAL = !!(out.suggest && (out.suggest.layoutMode === "HORIZONTAL" || out.suggest.layoutMode === "VERTICAL"));
  if (hasAL && !geoWantsAL) {
    out.modeConflict = true;
    out.warnings.push({ code: "mode-conflict", hint: "mode=" + lm + " 但几何为 " + out.geoMode + "（" + out.reason + "）⇒ 建议 layoutMode=NONE" });
  } else if (hasAL && geoWantsAL && lm !== out.suggest.layoutMode) {
    out.modeConflict = true;
    out.warnings.push({ code: "mode-direction", hint: "mode=" + lm + " 与几何方向 " + out.suggest.layoutMode + " 相反" });
  } else if (!hasAL && geoWantsAL) {
    out.warnings.push({ code: "al-missing", hint: "mode=" + lm + " 但几何是 " + out.geoMode + " ⇒ 建议 " + out.suggest.layoutMode +
      (out.suggest.primaryAxisAlignItems === "SPACE_BETWEEN" ? " + SPACE_BETWEEN" : " + itemSpacing " + out.suggest.itemSpacing) });
  }
  if (hasAL && Number(cur.itemSpacing) > 0 && out.gap !== null && Math.abs(Number(cur.itemSpacing) - out.gap) > 1) {
    out.warnings.push({ code: "gap-mismatch", hint: "itemSpacing=" + cur.itemSpacing + " 与几何间距 " + out.gap + " 不符" });
  }
  if (Number(cur.absoluteChildren) > 0 && hasAL) {
    out.warnings.push({ code: "absolute-in-al", hint: "AL 容器内存在 " + cur.absoluteChildren + " 个 absolute 子项，几何会出现重叠（规范 §3.2）" });
  }
  if (String(cur.primaryAxisSizingMode || "").toUpperCase() === "HUG" || String(cur.counterAxisSizingMode || "").toUpperCase() === "HUG") {
    out.warnings.push({ code: "hug-size", hint: "容器 sizing=HUG，导出尺寸会随内容漂移（规范 B3）⇒ 建议 FIXED" });
  }
  return out;
}

// 全树只读体检：遍历容器，取直接子节点 absoluteBoundingBox，产出 v2 §四 的 segments/warnings。
function inspectAutoLayout(root) {
  const MAX = 200, MAX_WARN = 60, MAX_DEPTH = 12;
  const segments = [], warnings = [];
  let truncated = false;
  const s = { containers: 0, conflicts: 0, alMissing: 0, overlay: 0, hugSize: 0, absoluteInAl: 0, singleChild: 0, warnings: 0 };
  const read = (n, k, dflt) => { try { const v = n[k]; return (v === undefined || v === null) ? dflt : v; } catch (e) { return dflt; } };
  const safeStr = (n, k) => { try { return String(n[k] || ""); } catch (e) { return ""; } };
  function walk(n, depth) {
    if (!n || depth > MAX_DEPTH || truncated) return;
    let kids = [];
    try {
      if (Array.isArray(n.children)) kids = n.children.filter(c => { try { return c && c.visible !== false; } catch (e) { return !!c; } });
    } catch (e) {}
    if (kids.length >= 2 && s.containers >= MAX) { truncated = true; return; }
    if (kids.length >= 2) {
      const cur = {
        layoutMode: read(n, "layoutMode", "NONE"),
        itemSpacing: read(n, "itemSpacing", 0),
        primaryAxisAlignItems: read(n, "primaryAxisAlignItems", ""),
        counterAxisAlignItems: read(n, "counterAxisAlignItems", ""),
        primaryAxisSizingMode: read(n, "primaryAxisSizingMode", ""),
        counterAxisSizingMode: read(n, "counterAxisSizingMode", ""),
        absoluteChildren: kids.filter(c => { try { return c.layoutPositioning === "ABSOLUTE"; } catch (e) { return false; } }).length,
      };
      const r = inferAutoLayoutFromBoxes(kids.map(nodeBox), nodeBox(n), cur);
      const id = safeStr(n, "id"), name = safeStr(n, "name");
      s.containers++;
      if (r.modeConflict) s.conflicts++;
      if (r.geoMode === "free-overlay") s.overlay++;
      segments.push({ id: id, name: name, children: kids.length, geoMode: r.geoMode, gap: r.gap,
        gaps: r.gaps, reason: r.reason, current: cur, suggest: r.suggest, modeConflict: r.modeConflict });
      for (const w of r.warnings) {
        if (w.code === "al-missing") s.alMissing++;
        if (w.code === "hug-size") s.hugSize++;
        if (w.code === "absolute-in-al") s.absoluteInAl++;
        if (warnings.length < MAX_WARN) warnings.push({ code: w.code, id: id, name: name, hint: w.hint });
      }
    } else if (kids.length === 1 && s.singleChild < MAX_WARN && warnings.length < MAX_WARN) {
      const id = safeStr(n, "id"), name = safeStr(n, "name");
      s.singleChild++;
      warnings.push({ code: "single-child", id: id, name: name, hint: "容器只有 1 个直接子节点，布局判定将跳过（规范 §四）" });
    }
    for (const c of kids) walk(c, depth + 1);
  }
  walk(root, 0);
  s.warnings = warnings.length;
  s.truncated = truncated;
  return { version: 1, readOnly: true, rootId: safeStr(root, "id"), summary: s, segments: segments, warnings: warnings };
}

function formatAutoLayoutReport(report) {
  if (!report) return "";
  const s = report.summary || {};
  const lines = ["【Auto Layout 自检（只读 · 本地计算 · 不修改图层）】"];
  lines.push("容器 " + (s.containers || 0) + " · 冲突 " + (s.conflicts || 0) + " · 建议补 AL " + (s.alMissing || 0) +
    " · 重叠 " + (s.overlay || 0) + " · HUG " + (s.hugSize || 0) + " · AL内absolute " + (s.absoluteInAl || 0) +
    (s.truncated ? " · 已截断" : ""));
  const ws = report.warnings || [];
  for (const w of ws.slice(0, 30)) lines.push("⚠ " + (w.id || "?") + " " + (w.name || "") + " [" + w.code + "] " + w.hint);
  if (ws.length > 30) lines.push("… 其余 " + (ws.length - 30) + " 条见 JSON 的 autoLayout.warnings");
  if (!ws.length) lines.push("✅ 未发现 mode 与几何冲突");
  return lines.join("\n");
}
function autoLayoutTextFor(root) {
  if (!root) return ""; // 拿不到整理根时不输出「容器 0 ✅ 未发现冲突」这种误导性空报告
  try { return formatAutoLayoutReport(inspectAutoLayout(root)); } catch (e) { return ""; }
}
// === v20261114 L0 · Auto Layout 只读自检（END）===

function organizeLayout(parent, summary, intentCtx) {
  if (!parent || !("children" in parent)) return;
  if (folderRole(parent)) return; // 已是插件建的文件夹，避免嵌套
  // v20261110.16：图表/矢量仪表容器已由 organizeGraphicContainers 统一合并成 img-* 资源文件夹，
  // 这里必须整体跳过，否则通用装饰收纳会把已建好的组再拆一遍、排序 appendChild 会拉出组内节点。
  if (isGraphicContainer(parent)) return;
  // v20261110.21：slot-con 是整块内容区，内部模块位置已定；跳过可避免排序/装饰收纳把模块拉出组，
  // 也保证重复整理幂等。
  if (isSlotContainer(parent)) return;
  // v20261111.35 P2：badge 内部只有「纯色底 + 纯数字 TEXT」，不能被通用装饰收纳成
  // bg-badge-count-NN 文件夹（会挂 PNG@2x 导出，把动态计数固化成图片）。
  if (/^badge-count-/i.test(String(parent.name || ""))) return;
  // 祖先链上已有文件夹 → 说明该容器已被收纳到 bg/img/icon 里，不再向内建组
  let anc = parent.parent, hops = 0;
  while (anc && hops++ < 20) {
    if (folderRole(anc)) return;
    anc = anc.parent;
  }
  const kids = Array.prototype.slice.call(parent.children || []);
  if (kids.length < 2) return;
  const ctx = intentCtx || { intentMap: new Map(), moduleOrder: new Map(), sharedIds: new Set(), useLayoutIntent: false };

  // v20261111.29 Step 0：真实 Figma 节点统一到 root 绝对坐标系；纯对象测试桩回退旧行为。
  const abs = kids.some(hasAbsGeometry);
  const base = abs ? absRect(componentRootOf(parent)) : null;
  const geoCtx = { abs: abs, base: base };

  // v20261111.29 Step 1：整块毛玻璃底图 pin 住 —— 保持原 z-index、不进任何资源文件夹、
  // 不参与排序。它与内容节点同组会重排 z-order，是上一轮 26.18% 视觉回归的直接来源。
  const backdrop = abs ? kids.filter(n => isBlurBackdrop(n, base)) : [];
  const backdropSet = new Set(backdrop);
  const workKids = kids.filter(n => !backdropSet.has(n));
  if (workKids.length < 2) return;
  if (backdrop.length) {
    summary.blurBackdropPinned = (Number(summary.blurBackdropPinned) || 0) + backdrop.length;
    for (const n of backdrop) {
      try {
        const nm = String(n.name || "");
        if (!/^(bg|img|icon)-/.test(nm) && !folderRole(n)) {
          n.name = "bg-" + nm.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 40);
          summary.prefixFixed++;
        }
      } catch (e) {}
    }
  }

  const decor = [], content = [];
  workKids.forEach((n, i) => {
    const intent = ctx.useLayoutIntent ? ctx.intentMap.get(n.id) : null;
    // 跨模块共享装饰（光柱/光环）：留在共同父级，不按模块切分
    if (ctx.useLayoutIntent && (ctx.sharedIds.has(n.id) || (intent && intent.shared))) {
      summary.intentShared++; content.push(n); return;
    }
    const geo = isDecoration(n, parent, Object.assign({ index: i, total: workKids.length }, geoCtx));
    let take = geo;
    if (ctx.useLayoutIntent && intent && intent.role) {
      if (intent.role === "decoration") {
        if (geo) { summary.doubleConfirmed++; take = true; }      // 双确认 → 收纳
        else { summary.conflict++; take = false; }                 // 单源视觉无几何信号 → 只记录不执行
      } else if (intent.role === "content") {
        if (geo) summary.conflict++;                               // 视觉判为内容、几何判为装饰 → 冲突
        take = false;                                              // 尊重视觉判断，不收纳
      }
    }
    (take ? decor : content).push(n);
  });

  // 解锁：figma.group 对锁定节点会抛错，是「背景静默不合并」的常见原因（旧代码只在 op 循环里解锁）。
  for (const n of kids) {
    try { if (n.locked) { n.locked = false; summary.unlocked++; } } catch (e) {}
  }

  // 前景装饰判据（修正版）：只有「几何上压在某个 content 之上且与它重叠」的装饰才保留原位。
  // 旧版用 min(content indexes) 作阈值，只要容器底层存在一个 content，几乎所有装饰都会被误判成前景，
  // toMerge 只剩 0~1 个 → 达不到建组条件 → 背景大面积不合并（用户截图里的直接根因）。
  const contentIdx = content.map((n) => workKids.indexOf(n));
  const isForegroundDecor = (n) => {
    const ni = workKids.indexOf(n);
    for (let k = 0; k < content.length; k++) {
      if (contentIdx[k] < ni && rectsOverlap(n, content[k])) return true;
    }
    return false;
  };
  const toMerge = [], keepInPlace = [];
  // v20261111.29 Step 1：去掉 bg- 前缀的「强制收纳豁免」。
  // 旧逻辑只要名字带 bg- 就跳过 isForegroundDecor 保护，局部卡片底、分隔线、内容图
  // 会被一起拖进根级 bg 文件夹，与毛玻璃底图重排 z-order。现在所有装饰一视同仁。
  // v20261114.66：图例永远和图表一个文件夹 —— 几何图表容器内的装饰（图例色块等）
  // 一律 keepInPlace，不进 toMerge ⇒ 不新建 bg-* 文件夹把图例从图表里分家。
  const legendGuarded = isChartGeometryContainer(parent);
  if (legendGuarded) summary.chartLegendGuarded = (Number(summary.chartLegendGuarded) || 0) + 1;
  for (const n of decor) {
    const bgNamed = /^bg-/.test(n.name || "");
    if (bgNamed) summary.forcedBg++; // 保留旧计数语义：统计本轮命中的 bg- 前缀节点数
    if (legendGuarded || isForegroundDecor(n)) {
      keepInPlace.push(n);
      if (bgNamed) summary.bgProtected = (Number(summary.bgProtected) || 0) + 1;
    } else toMerge.push(n);
  }
  summary.foregroundKept += keepInPlace.length;

  // 保留原位的装饰若仍是默认名，补 bg- 前缀：否则既不进文件夹、也挂不上导出预设（Vector 5028 这类）。
  for (const n of keepInPlace) {
    try {
      const nm = String(n.name || "");
      if (!/^(bg|img|icon)-/.test(nm) && !SEMANTIC_PREFIX.test(nm) && n.type !== "TEXT") {
        n.name = "bg-" + nm.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 40);
        summary.prefixFixed++;
      }
    } catch (e) {}
  }

  // v20261111.29 Step 1：非近全屏 IMAGE 内容图补 img- 前缀，由 applyAssetExports 挂 PNG@2x。
  // 同时保证重跑幂等：SEMANTIC_PREFIX 命中 img- 后 isDecoration 会直接判为内容，不会再被收纳。
  for (const n of content) {
    if (!abs || !fillHas(n, /IMAGE/) || isNearFullscreen(n, base)) continue;
    try {
      const nm = String(n.name || "");
      if (!/^(bg|img|icon)-/.test(nm) && !SEMANTIC_PREFIX.test(nm) && n.type !== "TEXT") {
        n.name = "img-" + nm.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 40);
        summary.imgContentNamed = (Number(summary.imgContentNamed) || 0) + 1;
      }
    } catch (e) {}
  }

  if (toMerge.length) {
    let bgGroup = findFolder(parent, "bg");
    let created = false;
    if (!bgGroup && toMerge.length >= 1) { bgGroup = createFolder(parent, toMerge, "bg"); created = !!bgGroup; }
    if (bgGroup) {
      if (!created) {
        // 已有 bg 组：逐个并入；新建组时节点已在组内，不可重复 appendChild
        for (const n of toMerge) { try { bgGroup.appendChild(n); } catch (e) {} }
      }
      summary.decorMerged += toMerge.length;
      // 保持 bg 位于被收纳装饰中最靠下的原位置，不强行沉到 index 0（保护与更底层节点的关系）
      const minIdx = Math.min.apply(null, toMerge.map(n => workKids.indexOf(n)));
      try { parent.insertChild(Math.max(0, Math.min(minIdx, parent.children.length - 1)), bgGroup); } catch (e) {}
    } else {
      // 建组失败：不再静默只改第一个名字，给全部待收纳节点补 bg- 前缀，保证命名一致 + 能挂上导出预设。
      if (toMerge.length < 2) summary.singleDecor++; else summary.groupFailed++;
      for (const n of toMerge) {
        try { n.name = "bg-" + String(n.name || "decor").replace(/^bg-/, ""); summary.prefixFixed++; } catch (e) {}
      }
    }
  }

  // v20261110.25：重叠保护从「整段放弃」改为「重叠节点 pin 住、只排互不重叠的节点」。
  // 大屏必有 tooltip/浮层重叠，旧逻辑一遇重叠就整段 return，导致顺序永远排不上。
  // movable 两两不重叠 ⇒ appendChild 改 z-order 也不会改画面；pinned 保持原相对层级。
  const pinned = new Set();
  for (let i = 0; i < content.length; i++)
    for (let j = i + 1; j < content.length; j++)
      if (rectsOverlap(content[i], content[j])) { pinned.add(content[i]); pinned.add(content[j]); }
  // v20261111.29 Step 1：排序收敛 —— 三类节点一律不参与 appendChild 重排：
  // 毛玻璃底图、非全屏 IMAGE 内容图、已进资源文件夹的节点。
  // 它们相对底图的 z-order 已经正确，跨带重排会再次把内容压到底图下面。
  const sortPinned = new Set(backdropSet);
  for (const n of content) {
    if (abs && fillHas(n, /IMAGE/) && !isNearFullscreen(n, base)) sortPinned.add(n);
  }
  for (const n of toMerge) sortPinned.add(n);
  summary.sortPinned = (Number(summary.sortPinned) || 0) + sortPinned.size;
  const movable = content.filter(n => !pinned.has(n) && !sortPinned.has(n));
  summary.skippedOverlap += pinned.size;
  const ordered = movable.slice().sort((a, b) => (b.y || 0) - (a.y || 0)); // y 降序 → 图层面板从上到下 = 视觉从上到下
  // 视觉给的 order 与 y 序不一致时只记录，仍以真实 y 为准
  if (ctx.useLayoutIntent && ctx.moduleOrder.size) {
    ordered.forEach((n, rank) => {
      const o = ctx.moduleOrder.get(n.id);
      if (Number.isFinite(o) && o !== rank + 1) summary.orderMismatch++;
    });
  }
  // v20261111.35 P0：Auto Layout 父级绝不重排 children（只保留前面的装饰收纳/命名）。
  if (isAutoLayoutContainer(parent)) {
    summary.autoLayoutSortSkipped = (Number(summary.autoLayoutSortSkipped) || 0) + ordered.length;
  } else {
    for (const n of ordered) { try { parent.appendChild(n); summary.sorted++; } catch (e) {} }
  }
  // 前景装饰（原本盖在内容之上）保持在最上层，且不参与排序，确保遮挡关系不变。
  // 它们在 kids 中的先后即原始相对顺序，按序 append 即可保持彼此层级。
  for (const n of keepInPlace) { try { parent.appendChild(n); } catch (e) {} }
  // 前缀补收放在最后：避免排序阶段的 appendChild 把已入组的 img-/icon- 节点从组里拉出来。
  // 不再依赖 toMerge.length —— 即使本容器没有装饰层，也照常收纳 img-/icon- 资源。
  groupChildrenByCategory(parent, summary);
  // v20261111.30 Step 1 补齐：上面 bg 装饰文件夹的 insertChild(minIdx) 可能把毛玻璃底图
  // 从 index 0 挤到后面，导致它反过来模糊局部卡片底/分隔线。毛玻璃必须恒在最底层。
  for (const n of backdrop) {
    try {
      if (n.parent === parent && parent.children.indexOf(n) > 0) parent.insertChild(0, n);
    } catch (e) {}
  }
}

// groupChildrenByCategory：降级为「img-/icon- 前缀补收」。
// bg- 全权交给 organizeLayout 的几何收纳（含「前景装饰保持原位」保护），此处不再碰，避免重复建组或破坏遮挡。
function groupChildrenByCategory(parent, summary) {
  if (!parent || !("children" in parent)) return;
  if (folderRole(parent)) return; // 跳过插件自己建的文件夹，避免嵌套
  const cats = { img: [], icon: [] };
  for (const ch of parent.children) {
    if (folderRole(ch)) continue; // 带语义名的文件夹本身不能被当成待收纳节点，否则会自我嵌套
    const nm = ch.name || "";
    if (/^img-/.test(nm)) cats.img.push(ch);
    else if (/^icon-/.test(nm)) cats.icon.push(ch);
  }
  for (const cat of ["img", "icon"]) {
    if (!cats[cat].length) continue;
    // 已有同名文件夹 → 直接并入，绝不重复建组（避免 bg 组嵌套/重名）
    let grp = findFolder(parent, cat);
    let created = false;
    // 放宽到单个也成组：用户要求「文件夹应该命名为 icon-xxx/bg-xxx」，孤立资源同样要有语义文件夹。
    if (!grp && cats[cat].length >= 1) { grp = createFolder(parent, cats[cat], cat); created = !!grp; }
    if (grp) {
      // v20261110.18：单成员资源节点常被模型命名成与文件夹同名（如 icon-item-rate-metric-4），
      // 包一层后图层面板会出现两个同名节点；给外层补 -folder 后缀，一眼分得清容器与内容。
      if (created && cats[cat].length === 1 && String(cats[cat][0].name || "") === String(grp.name || "")) {
        try { grp.name = String(grp.name) + "-folder"; } catch (e) {}
      }
      if (created) summary.group += cats[cat].length; // 新建组：节点已入组，不可重复 appendChild
      else for (const n of cats[cat]) {
        try { grp.appendChild(n); summary.group++; } catch (e) {}
      }
    }
  }
}

// ---- 组件骨架：slot-con 内容容器（v20261110.21）---------------------------------
// 用户诉求：组件根 cp-* 下固定 header / bg / slot-con 三段；视觉布局分析出的多个内容模块
// 必须收进【同一个】slot-con Group，而不是平铺在根下或散落在各级子容器里。
// 约束：只对选中的组件根执行；纯同父级 figma.group（Figma 换算相对坐标、绝对位置不变）；
// 插回收纳节点最小原 index 保护 z-order；幂等标记 mvSlotCon，重复整理不会再套一层。
const SLOT_CON_KEY = "mvSlotCon";
function isSlotContainer(n) {
  if (!n || !("children" in n)) return false;
  try { if (n.getPluginData(SLOT_CON_KEY) === "1") return true; } catch (e) {}
  // v20261110.24：只认精确名 slot-con。旧宽松前缀会把 AI 给局部模块起的
  // slot-con-xxx 当成「已有根级槽」，createSlotConGroup 走复用分支把内容 append 进局部组。
  return /^slot-con$/i.test(String((n && n.name) || "").trim());
}
function isHeaderLike(n) { return /^header(?:[-/]|$)/i.test(String((n && n.name) || "")); }
function isBgLike(n) {
  const nm = String((n && n.name) || "");
  return /^bg(?:-|$)/i.test(nm) || folderRole(n) === "bg";
}
function isModuleLike(n) {
  if (!n || n.type === "TEXT") return false;
  return isModuleContainer(n) || /^(item|card|list|form|cp|section|graphic)-/i.test(String(n.name || ""));
}
function countModuleKids(n) {
  if (!n || !("children" in n)) return 0;
  let c = 0;
  for (const ch of n.children) if (isModuleLike(ch)) c++;
  return c;
}
// 统计组件内所有业务模块，以及仍未进入 slot-con 的模块（用于诊断「是否真的合到一个 group」）。
function countModules(root) {
  const out = { total: 0, outside: 0 };
  const walk = (n, inside, depth) => {
    if (!n || depth > 24) return;
    const isMod = isModuleLike(n) && n !== root;
    if (isMod) { out.total++; if (!inside) out.outside++; }
    const next = inside || isSlotContainer(n);
    if ("children" in n) for (const c of n.children) walk(c, next, depth + 1);
  };
  walk(root, isSlotContainer(root), 0);
  return out;
}
// ---- v20261111.61 P0：根级 header 的几何护栏（按 y 判定）---------------------------------
// 根因（53:34075）：AI 把面板主标题从 `header` 改名成 `section-title-traffic` 后，
// isHeaderLike / createSlotConGroup / groupSectionsByTitle 全部只认名字 ⇒ 标题被当成模块小标题
// 切进 section-* 再收进 slot-con；groupBySpatialBands 的补建又要求顶带 ≤10%·rootH（35.8px），
// 实际顶带 164px ⇒ bandHeaderCreated=0，重跑也不会自愈。
// 治本：不依赖命名。用「最顶部 y + 整宽 + 薄带 + 短标题文本」四条件确定性识别，
// 在 AI ops 之后、demoteSubHeaders 之前提升为 root 直属 header（Figma reparent 保持绝对位置）。
// 只用 y 不够：全屏 bg-panel / 第一段 section-traffic 也在 y≈10，故必须叠加宽/高/文本护栏。
const ROOT_HEADER_TOP_RATIO = 0.08;     // relY ≤ 8%·rootH（358 → 28.6px）
const ROOT_HEADER_WIDTH_RATIO = 0.80;   // w ≥ 80%·rootW（420 → 336px）
const ROOT_HEADER_HEIGHT_RATIO = 0.15;  // h ≤ 15%·rootH（358 → 53.7px）
const ROOT_HEADER_MAX_TEXT = 12;        // 标题文本 ≤12 字，且不能是纯数值
const ROOT_HEADER_SCAN_DEPTH = 5;
function hasShortHeaderText(n, depth) {
  if (!n || depth > 3) return false;
  if (n.type === "TEXT") {
    const t = String((n && n.characters) || "").replace(/\s/g, "");
    return t.length > 0 && t.length <= ROOT_HEADER_MAX_TEXT && !/^[+-]?[\d.,%％]+$/.test(t);
  }
  if (!("children" in n)) return false;
  for (const c of Array.prototype.slice.call(n.children || []))
    if (hasShortHeaderText(c, depth + 1)) return true;
  return false;
}
function isHeaderBandCandidate(n, base) {
  if (!n || !("children" in n)) return false;
  const nm = String((n && n.name) || "").trim();
  if (!nm || isSlotContainer(n)) return false;
  // 背景 / 资源 / 图表 / 图例 / 列表项不可能是根级标题条
  if (/^(?:bg|img|icon|graphic|series|axis|legend|badge|item|card|list|form|@echarts\/|@antd\/)/i.test(nm)) return false;
  const r = relRect(n, base);
  if (!r || r.w <= 0 || r.h <= 0) return false;
  if (r.y > base.h * ROOT_HEADER_TOP_RATIO) return false;      // ① 最顶部
  if (r.w < base.w * ROOT_HEADER_WIDTH_RATIO) return false;    // ② 横跨整宽
  if (r.h > base.h * ROOT_HEADER_HEIGHT_RATIO) return false;   // ③ 薄标题带
  return hasShortHeaderText(n, 0);                             // ④ 含短标题 TEXT
}
// 只读查找：供「整理时提升」与「零 token 契约导出」共用同一套几何判据。
function findRootHeaderBand(root) {
  if (!root || !("children" in root) || root.type === "PAGE") return null;
  const base = absRect(root);
  if (!base || base.w <= 0 || base.h <= 0) return null;
  const hits = [];
  (function walk(n, depth) {
    if (!n || depth > ROOT_HEADER_SCAN_DEPTH) return;
    if (n !== root && isHeaderBandCandidate(n, base)) {
      const r = relRect(n, base);
      hits.push({ n: n, y: r.y, w: r.w });
    }
    for (const c of Array.prototype.slice.call(n.children || [])) walk(c, depth + 1);
  })(root, 0);
  if (!hits.length) return null;
  // 多个命中只取 y 最小（最顶），同 y 取最宽；绝不臆造第二个 header。
  hits.sort((a, b) => (a.y - b.y) || (b.w - a.w));
  return hits[0].n;
}
function promoteRootHeader(root, summary) {
  const s = summary || {};
  if (!root || !("children" in root) || root.type === "PAGE") return null;
  const kids = Array.prototype.slice.call(root.children || []);
  const existing = kids.filter(isHeaderLike)[0];
  if (existing) { // 幂等：已有根级 header，绝不改动、绝不第二个 header
    s.rootHeaderAlready = (Number(s.rootHeaderAlready) || 0) + 1;
    return existing;
  }
  const band = findRootHeaderBand(root);
  if (!band) {
    s.rootHeaderNoCandidate = (Number(s.rootHeaderNoCandidate) || 0) + 1;
    return null;
  }
  const from = String(band.name || "");
  try { if (band.locked) band.locked = false; } catch (e) {}
  try {
    if (band.parent !== root) root.appendChild(band);
    band.name = "header";
    try { band.setPluginData("mvRootHeader", "1"); } catch (e2) {}
  } catch (e) {
    s.rootHeaderPromoteFailed = (Number(s.rootHeaderPromoteFailed) || 0) + 1;
    return null;
  }
  s.rootHeaderPromoted = (Number(s.rootHeaderPromoted) || 0) + 1;
  s.rootHeaderPromotedFrom = from;
  return band;
}

// v20261110.24：组件根级骨架只允许一个 header。AI 常把每个视觉模块的小标题也命名成 header-*，
// 旧判据只看前缀 ⇒ createSlotConGroup 把它们全部排除，平铺在根级、进不了 slot-con。
// 这里用「精确名 + 几何」选出唯一根 header，其余降级为 section-title-* 参与内容建组；
// 误命名的 slot-con-xxx 降级为 section-xxx，避免被当成第二个根级槽复用。
// 纯改名：不移动节点、不改坐标、不改 z-order；改名后不再命中前缀，重复整理幂等。
function pickRootHeader(headers, root) {
  if (!headers || !headers.length) return null;
  const nameOf = (n) => String((n && n.name) || "").trim();
  const exact = headers.filter(n => /^header$/i.test(nameOf(n)));
  if (exact.length) return exact[0];
  const titled = headers.filter(n => /^header-title$/i.test(nameOf(n)));
  if (titled.length) return titled[0];
  const rootW = Number(root && root.width) || 0;
  const minY = Math.min.apply(null, headers.map(n => Number(n && n.y) || 0));
  let best = null, bestScore = -Infinity;
  for (const n of headers) {
    const y = Number(n && n.y) || 0, w = Number(n && n.width) || 0;
    const score = (rootW > 0 ? Math.min(40, (w / rootW) * 40) : 0)
      + (rootW > 0 && w >= rootW * 0.6 ? 20 : 0)
      + Math.max(0, 30 - (y - minY));
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best || headers[0];
}
function contractSectionTitle(nm) {
  const slug = String(nm || "").replace(/^header[-/]?/i, "")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-").replace(/^-+|-+$/g, "");
  return "section-title" + (slug ? "-" + slug : "");
}
function demoteSubHeaders(root, summary) {
  if (!root || !("children" in root) || root.type === "PAGE") return null;
  const s = summary || {};
  const kids = Array.prototype.slice.call(root.children || []);
  const headers = kids.filter(isHeaderLike);
  const keep = pickRootHeader(headers, root);
  let demoted = 0, slotsDemoted = 0;
  for (const n of headers) {
    if (n === keep) continue;
    const next = contractSectionTitle(String(n.name || ""));
    try { if (n.locked) n.locked = false; n.name = next; demoted++; } catch (e) {}
  }
  for (const n of kids) {
    if (n === keep || isSlotContainer(n)) continue;
    const nm = String(n.name || "");
    if (!/^slot-con(?:-|$)/i.test(nm)) continue;
    const slug = nm.replace(/^slot-con[-/]?/i, "")
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "-").replace(/^-+|-+$/g, "");
    try { if (n.locked) n.locked = false; n.name = "section-" + (slug || "block"); slotsDemoted++; } catch (e) {}
  }
  s.subHeadersDemoted = (Number(s.subHeadersDemoted) || 0) + demoted;
  s.subSlotConsDemoted = (Number(s.subSlotConsDemoted) || 0) + slotsDemoted;
  return keep;
}
// v20261110.25：复用分支里多余的历史空 slot-con 会夹在图层面板中间，让顺序看起来没排上。
function mergeExtraSlotCons(existing, slot, summary) {
  const s = summary || {};
  let moved = 0, removed = 0;
  for (const extra of (existing || []).slice(1)) {
    if (!extra || extra === slot) continue;
    for (const c of Array.prototype.slice.call(extra.children || [])) {
      try { slot.appendChild(c); moved++; } catch (e) {}
    }
    try {
      if (!((extra.children || []).length)) {
        if (extra.locked) extra.locked = false;
        extra.remove(); removed++;
      }
    } catch (e) {}
  }
  s.slotConMerged = (Number(s.slotConMerged) || 0) + moved;
  s.slotConEmptyRemoved = (Number(s.slotConEmptyRemoved) || 0) + removed;
  return moved;
}

// v20261110.25：slot-con 建组后统一按视觉顺序排直接子级。
// Figma 图层面板是 children 的【反序】显示，所以这里按 y 降序 appendChild；
// 与契约层的 y 升序方向正好相反，两边各自「从上到下」才成立。
// 保护：与任意其它同级节点重叠的（tooltip/浮层/全屏底图）pin 住不动；
// movable 两两不重叠，重排 z-order 视觉零变化。重复整理幂等。
function sortSlotConChildren(root, summary) {
  if (!root || !("children" in root)) return null;
  const s = summary || {};
  const slots = Array.prototype.slice.call(root.children || []).filter(isSlotContainer);
  // v20261110.26：子模块容器（mvSectionGroup）内部也按视觉序排，重叠节点仍 pin 住。
  const targets = slots.slice();
  for (const slot of slots)
    for (const ch of Array.prototype.slice.call(slot.children || []))
      if (isSectionGroup(ch)) targets.push(ch);
  let moved = 0, pinnedCount = 0;
  for (const slot of targets) {
    const kids = Array.prototype.slice.call(slot.children || []);
    if (kids.length < 2) continue;
    const pinned = new Set();
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++)
        if (rectsOverlap(kids[i], kids[j])) { pinned.add(kids[i]); pinned.add(kids[j]); }
    const movable = kids.filter(n => !pinned.has(n));
    pinnedCount += pinned.size;
    if (movable.length < 2) continue;
    // v20261111.35 P0：槽内子容器若本身是 Auto Layout FRAME，跳过 appendChild 重排。
    if (isAutoLayoutContainer(slot)) {
      s.slotSortAutoLayoutSkipped = (Number(s.slotSortAutoLayoutSkipped) || 0) + movable.length;
      continue;
    }
    movable.sort((a, b) => (Number(b && b.y) || 0) - (Number(a && a.y) || 0));
    for (const n of movable) {
      try { if (n.locked) n.locked = false; slot.appendChild(n); moved++; } catch (e) {}
    }
  }
  s.slotSorted = (Number(s.slotSorted) || 0) + moved;
  s.slotSortPinned = (Number(s.slotSortPinned) || 0) + pinnedCount;
  return slots[0] || null;
}

// ---- v20261110.26 P1：按副标题把内容切成子模块 Group -----------------------------------
// .24 把模块小标题统一成 section-title-*，.25 保证视觉顺序可用 ⇒ 标题的 y 就是天然分割线。
// v20261110.27：容器统一命名 section-<slug>，与锚点 section-title-<slug> 成套；
// item- 归还给「带 -N 序号的同构循环子项」，不再表示异构分区。
// 两种形态：① 平铺型（标题与图表同父级平铺）→ 按 y 区间建 section-<slug> Group；
//           ② 已有容器型（红框本来就是 Frame，标题在容器内部）→ 只把容器改名 section-<slug>，不套第二层。
// 保护：跨段/全屏底图 pin 住不归段；同父级才合组；插回原最小 index；mvSectionGroup 幂等。
const SECTION_GROUP_KEY = "mvSectionGroup";
function isSectionTitle(n) {
  return /^section-title(?:-|$)/i.test(String((n && n.name) || "").trim());
}
function isSectionGroup(n) {
  if (!n || !("children" in n)) return false;
  try { return n.getPluginData(SECTION_GROUP_KEY) === "1"; } catch (e) { return false; }
}
function sectionSlug(nm) {
  const slug = String(nm || "")
    .replace(/^(?:section-title|header)[-/]?/i, "")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "section";
}
function sectionGroupName(nm) { return "section-" + sectionSlug(nm); }

function groupSectionsByTitle(root, summary) {
  if (!root || !("children" in root) || root.type === "PAGE") return null;
  const s = summary || {};
  const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const rootKids = Array.prototype.slice.call(root.children || []);
  const slot = rootKids.filter(isSlotContainer)[0];
  // 优先整理已有槽（重跑时内容都在槽内）；首次整理则作用于组件根。
  const parent = (slot && (slot.children || []).length >= 2) ? slot : root;
  const kids = Array.prototype.slice.call(parent.children || []).filter(n =>
    n && !isSlotContainer(n) && !(parent === root && (isHeaderLike(n) || isBgLike(n))));
  const anchored = kids.filter(isSectionTitle);

  // ② 平铺标题不足 2 个：多半是「红框本来就是 Frame」或「已整理过」。
  // 只把自带小标题、且还没有语义名的容器改名；已有 section-*/item-*/mvSectionGroup 一律不动 ⇒ 幂等。
  if (anchored.length < 2) {
    let renamed = 0;
    for (const n of kids) {
      if (isSectionGroup(n) || !("children" in n)) continue;
      if (/^(item|card|list|form|cp|section|graphic)-/i.test(String(n.name || ""))) continue;
      const inner = Array.prototype.slice.call(n.children || []).find(isSectionTitle);
      if (!inner) continue;
      try {
        if (n.locked) n.locked = false;
        n.name = sectionGroupName(inner.name);
        n.setPluginData(SECTION_GROUP_KEY, "1");
        renamed++;
      } catch (e) {}
    }
    s.sectionContainersRenamed = (Number(s.sectionContainersRenamed) || 0) + renamed;
    return parent;
  }

  // ① 平铺型：按标题 y 区间分段。注意 kids 是 children 原序（z-order），
  // 这里只判断归属、不重排段内顺序，z-order 由 insertChild 原最小 index 保护。
  const titles = anchored.slice().sort((a, b) => num(a.y) - num(b.y));
  const parentH = num(parent.height);
  const segments = titles.map(() => []);
  let pinnedCount = 0;
  for (const n of kids) {
    const y = num(n.y), h = num(n.height);
    let seg = -1;
    for (let i = 0; i < titles.length; i++) {
      const start = num(titles[i].y);
      const end = i + 1 < titles.length ? num(titles[i + 1].y) : Infinity;
      if (y >= start - 1 && y < end) { seg = i; break; }
    }
    const nextY = (seg >= 0 && seg + 1 < titles.length) ? num(titles[seg + 1].y) : Infinity;
    // 段前 / 下沿越过下一标题 / 与父级等高（全屏底图）→ 一律留在 parent 直属
    if (seg < 0 || (h > 0 && y + h > nextY + 1) || (parentH > 0 && h >= parentH * 0.9)) {
      pinnedCount++; continue;
    }
    segments[seg].push(n);
  }
  s.sectionGroupsPinned = (Number(s.sectionGroupsPinned) || 0) + pinnedCount;

  let created = 0, merged = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.length < 2 || !seg.some(n => !isSectionTitle(n))) continue; // 只有标题不造空 Group
    const before = Array.prototype.slice.call(parent.children || []);
    let minIdx = Math.min.apply(null, seg.map(n => before.indexOf(n)).filter(j => j >= 0));
    if (!Number.isFinite(minIdx)) minIdx = 0;
    for (const n of seg) { try { if (n.locked) n.locked = false; } catch (e) {} }
    const grp = safeGroup(seg, sectionGroupName(titles[i].name));
    if (!grp) { s.sectionGroupFailed = (Number(s.sectionGroupFailed) || 0) + 1; continue; }
    try { grp.setPluginData(SECTION_GROUP_KEY, "1"); } catch (e) {}
    try { parent.insertChild(Math.max(0, Math.min(minIdx, parent.children.length - 1)), grp); } catch (e) {}
    created++; merged += seg.length;
    logContainer("[子模块]", grp, seg.length, String(parent.name || ""));
  }
  s.sectionGroupsCreated = (Number(s.sectionGroupsCreated) || 0) + created;
  s.sectionGroupsMerged = (Number(s.sectionGroupsMerged) || 0) + merged;
  return parent;
}
function createSlotConGroup(root, summary) {
  if (!root || !("children" in root) || root.type === "PAGE") return null;
  const kids = Array.prototype.slice.call(root.children || []);
  const existing = kids.filter(isSlotContainer);
  // header / bg 保持与 slot-con 平级；其余全部内容节点（含视觉与几何模块 Group）收进 slot-con。
  const contents = kids.filter(n => !isSlotContainer(n) && !isHeaderLike(n) && !isBgLike(n));
  if (!contents.length) {
    if (existing.length) summary.slotConReused = 1;
    // v20261110.25：即使本次没有新内容，也要清掉多余的历史空槽
    if (existing.length > 1) mergeExtraSlotCons(existing, existing[0], summary);
    return existing[0] || null;
  }
  let slot = null;
  if (existing.length) {
    // 幂等复用：已有 slot-con → 把后来新增的内容节点并入，绝不套第二层。
    slot = existing[0];
    let moved = 0;
    for (const n of contents) { try { slot.appendChild(n); moved++; } catch (e) {} }
    summary.slotConReused = 1;
    summary.slotConMerged = moved;
    // v20261110.25：并入剩余槽的内容后删掉空槽，避免图层面板夹着多个 slot-con
    mergeExtraSlotCons(existing, slot, summary);
  } else if (contents.length === 1 && countModuleKids(contents[0]) >= 2) {
    // 视觉/几何模块本来就都挂在同一个内容容器里 → 直接把它标记成 slot-con，
    // 不新建 Group、不移动任何节点，视觉零改动，模块自然都在同一 group 中。
    slot = contents[0];
    try { slot.setPluginData(SLOT_CON_KEY, "1"); } catch (e) {}
    try { slot.name = "slot-con"; } catch (e) {}
    summary.slotConReused = 1;
    summary.slotConMerged = 1;
  } else {
    for (const n of contents) { try { if (n.locked) { n.locked = false; summary.unlocked++; } } catch (e) {} }
    const minIdx = Math.min.apply(null, contents.map(n => kids.indexOf(n)));
    slot = safeGroup(contents, "slot-con");
    if (!slot) { summary.slotConFailed++; return null; }
    try { slot.setPluginData(SLOT_CON_KEY, "1"); } catch (e) {}
    try { root.insertChild(Math.max(0, Math.min(minIdx, root.children.length - 1)), slot); } catch (e) {}
    summary.slotConCreated = 1;
    summary.slotConMerged = contents.length;
    logContainer("[骨架]", slot, contents.length, String(root.name || ""));
  }
  const stat = countModules(root);
  summary.slotConModules = stat.total;
  summary.slotConOutside = stat.outside;
  return slot;
}

// ---- v20261111.31 Step 2：按视觉空白带切分 section / 真建 header -----------------------
// 根因：.26 groupSectionsByTitle 只有 ≥2 个【平铺】section-title-* 才切段，且全代码没有
// 创建 header 的逻辑。53:31607 的两个小标题都在已有 Group 内 ⇒ anchored=0 ⇒ 监控画面区 /
// 告警信息卡区没有容器，详情 TEXT 也被塞进 slot-con。
// 方案：锚点从「文字标题」泛化为「y 空白间隙」，用 Step0 的 absRect 统一到 root 绝对坐标系。
// 护栏：insertChild 原最小 index 保 z-order；已有容器只重命名不重建；mvBandGroup 幂等；
//       纯对象 / 无绝对几何 / 小树严格跳过，历史行为零回归；不引入 REST、不联网。
const BAND_GROUP_KEY = "mvBandGroup";
const BAND_GAP_MIN = 8;          // 最小空白间隙 px
const BAND_GAP_RATIO = 0.01;     // 或 1%·rootH，取较大者
const HEADER_BAND_RATIO = 0.10;  // 首带高度 ≤10%·rootH 才可能是 header
const BAND_PIN_RATIO = 0.6;      // 节点高度 ≥60%·rootH 视为跨带，pin 住不归段
function isBandGroup(n) {
  if (!n || !("children" in n)) return false;
  try { return n.getPluginData(BAND_GROUP_KEY) === "1"; } catch (e) { return false; }
}
function bandGapOf(base) {
  return Math.max(BAND_GAP_MIN, (base && base.h > 0 ? base.h : 0) * BAND_GAP_RATIO);
}
function twoDigit(i) { return ("0" + i).slice(-2); }
// 资源文件夹（icon-cp-xxx / img-cp-xxx）把不同 y 带的图标混装：不解包就永远无法按带归组。
// 解包后按原 index 顺序插回 slot，绝对位置与 z-order 等价；空文件夹随即移除。
function isAssetFolderLike(n) {
  if (!n || !("children" in n)) return false;
  const kids = Array.prototype.slice.call(n.children || []);
  if (kids.length < 2) return false;
  // mvAssetFolder 是 createFolder 写入的可信标记：命中即可，成员可能仍是原始默认名。
  try { if (/^(img|icon)$/.test(String(n.getPluginData("mvAssetFolder") || ""))) return true; } catch (e) {}
  if (!/^(img|icon)-/.test(String(n.name || ""))) return false;
  // 无标记的旧文件夹：至少一个成员同前缀即可，避免把业务容器误判为资源文件夹。
  return kids.some(c => /^(img|icon)-/.test(String((c && c.name) || "")));
}
function dissolveCrossBandFolders(slot, base, summary) {
  const gap = bandGapOf(base);
  const s = summary || {};
  let dissolved = 0, freed = 0;
  for (const folder of Array.prototype.slice.call(slot.children || [])) {
    if (!isAssetFolderLike(folder)) continue;
    const members = Array.prototype.slice.call(folder.children || []);
    const rects = members.map(n => ({ n: n, r: relRect(n, base) })).filter(x => x.r && x.r.h > 0);
    if (rects.length < 2) continue;
    rects.sort((a, b) => a.r.y - b.r.y);
    let cross = false;
    for (let i = 1; i < rects.length; i++) {
      const prevBottom = rects[i - 1].r.y + rects[i - 1].r.h;
      if (rects[i].r.y - prevBottom >= gap) { cross = true; break; }
    }
    const fr = relRect(folder, base);
    if (!cross && fr && fr.h > gap * 4 && rects.length >= 3) cross = true;
    if (!cross) continue;
    const before = Array.prototype.slice.call(slot.children || []);
    let at = before.indexOf(folder);
    if (at < 0) continue;
    for (const n of members) {
      try {
        if (n.locked) n.locked = false;
        slot.insertChild(Math.max(0, Math.min(at, slot.children.length)), n);
        at++;
      } catch (e) {}
    }
    try {
      if (!(folder.children || []).length) {
        if (folder.locked) folder.locked = false;
        folder.remove();
        freed++;
      }
    } catch (e) {}
    dissolved++;
  }
  s.bandFoldersDissolved = (Number(s.bandFoldersDissolved) || 0) + dissolved;
  s.bandFoldersRemoved = (Number(s.bandFoldersRemoved) || 0) + freed;
  return dissolved;
}
// y 空白间隙聚类：同一带 = 同一视觉区块 + 同一职责。跨带 / 近全屏节点 pin 住留平级。
function detectBands(slot, base, summary) {
  const gap = bandGapOf(base);
  const s = summary || {};
  const items = [];
  for (const n of Array.prototype.slice.call(slot.children || [])) {
    if (!n) continue;
    try { if (n.visible === false) continue; } catch (e) {}
    const r = relRect(n, base);
    if (!r || r.h <= 0) continue;
    if (r.h >= base.h * BAND_PIN_RATIO) { items.push({ n: n, r: r, pinned: true }); continue; }
    items.push({ n: n, r: r, pinned: false });
  }
  const movable = items.filter(x => !x.pinned).sort((a, b) => (a.r.y - b.r.y) || (a.r.x - b.r.x));
  const bands = [];
  for (const it of movable) {
    const last = bands[bands.length - 1];
    if (!last || it.r.y - last.end >= gap) {
      bands.push({ start: it.r.y, end: it.r.y + it.r.h, items: [it] });
    } else {
      last.items.push(it);
      const bottom = it.r.y + it.r.h;
      if (bottom > last.end) last.end = bottom;
    }
  }
  s.bandsPinned = (Number(s.bandsPinned) || 0) + items.filter(x => x.pinned).length;
  s.bandsDetected = (Number(s.bandsDetected) || 0) + bands.length;
  return { bands: bands, gap: gap, pinned: items.filter(x => x.pinned).length };
}
// 带名：优先沿用已有语义容器名，其次按内容启发式（图片→media / 多行键值→info / 按钮→actions）。
// 不臆造业务名，兜底 block-NN。
function bandSlug(band, idx, base) {
  const names = band.items.map(x => String((x.n && x.n.name) || ""));
  for (const nm of names) {
    const m = /^section-\d{2}-(.+)$/.exec(nm) || /^section-(.+)$/.exec(nm);
    if (m) return m[1].replace(/^\d{2}-/, "");
  }
  let hasImg = false, hasBtn = false, textCount = 0, hasMulti = false;
  for (const it of band.items) {
    const n = it.n, nm = String((n && n.name) || "");
    if (/^img-/.test(nm)) hasImg = true;
    try { if (fillHas(n, /IMAGE/)) hasImg = true; } catch (e) {}
    if (/@antd\/button|btn|button|action/i.test(nm)) hasBtn = true;
    if (n && n.type === "TEXT") {
      textCount++;
      if (/\n/.test(String(n.characters || ""))) hasMulti = true;
    }
  }
  if (hasImg) return "media";
  if (textCount >= 2 && hasMulti) return "info";
  if (hasBtn) return "actions";
  if (band.items.every(x => /^(graphic|icon|bg)-/.test(String((x.n && x.n.name) || "")))) return "graphic";
  return "block-" + twoDigit(idx);
}
// v20261111.35 P1：紧凑面板（区块间几乎无 y 空白）按【自带容器边界】切段。
// 仅在 detectBands < 2 时兜底启用，53:31607 那种 6 带面板完全不受影响。
// 带内只有 1 个容器时主循环走「只改名」分支 ⇒ 不建组、不 reparent、零视觉风险。
function bandContainerSlug(n) {
  const nm = String((n && n.name) || "");
  const m = /^section-(?:title-)?(.+)$/i.exec(nm) || /^(?:list|card|form)-(.+)$/i.exec(nm);
  if (!m) return "";
  return m[1].replace(/^\d{2}-/, "").replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 40).toLowerCase();
}
function detectContainerBands(slot, base, summary) {
  const s = summary || {};
  const cand = [];
  for (const n of Array.prototype.slice.call(slot.children || [])) {
    if (!n) continue;
    try { if (n.visible === false) continue; } catch (e) {}
    const nm = String(n.name || "");
    if (/^(bg|icon|img|graphic)-/.test(nm)) continue;   // 资源文件夹不是业务带
    if (!("children" in n)) continue;                    // 必须是自带容器
    const r = relRect(n, base);
    if (!r || r.h <= 0) continue;
    cand.push({ n: n, r: r });
  }
  if (cand.length < 2) return null;
  cand.sort((a, b) => (a.r.y - b.r.y) || (a.r.x - b.r.x));
  const bands = [];
  for (const it of cand) {
    // 落在已有大带内部的小碎片（悬浮文字标签等）既不单独成带，也不并入该带 items：
    // 保持 slot-con 平级，避免主循环把「主容器 + 碎片」新建成一个多余 Group。
    const host = bands.find(b => it.r.y >= b.start - 1 && it.r.bottom <= b.end + 1 &&
                                 it.r.h < (b.end - b.start) * 0.25);
    if (host) continue;
    const last = bands[bands.length - 1];
    const shorter = last ? Math.min(last.end - last.start, it.r.h) : 0;
    const ov = last ? Math.min(last.end, it.r.bottom) - Math.max(last.start, it.r.y) : 0;
    // 重叠超过较矮者一半 → 同带（如标题 + 同排图标）；否则另起一带。
    if (!last || !(shorter > 0 && ov > shorter * 0.5)) {
      bands.push({ start: it.r.y, end: it.r.bottom, items: [it], slug: bandContainerSlug(it.n) });
    } else {
      last.items.push(it);
      last.end = Math.max(last.end, it.r.bottom);
      if (!last.slug) last.slug = bandContainerSlug(it.n);
    }
  }
  if (bands.length >= 2) s.bandsContainerFallback = 1;
  return bands.length >= 2 ? bands : null;
}
function markBandGroup(n) {
  if (!n) return;
  try { n.setPluginData(BAND_GROUP_KEY, "1"); } catch (e) {}
  try { n.setPluginData(SECTION_GROUP_KEY, "1"); } catch (e) {}
}
// ---- v20261111.43：段内「覆盖型纯色底块」z-order 归一化 -----------------------------
// 根因（53:31607 AI 命名态）：384×222 纯色 SOLID 底块被 AI 命名成 img-event-snapshot，
// isDecoration 因 img- 前缀直接判「内容」不做装饰收纳；bandSlug 也按 img- 归进 media 段；
// reparent 无 index 时 appendChild 追加到段尾 → 图层面板最上层 → 不透明底盖住同段 4 个 TEXT
// （REST 实测 1.7445% / 24970 px 视觉回归，与 .31 同源）。
// 修法：不依赖名字，用「几何覆盖 + 无 IMAGE 填充 + 同级 TEXT 在其下」识别，强制沉到容器 idx0。
// 幂等：已在 idx0 时不动；调用点在 groupBySpatialBands 的幂等 return 之前，坏树重跑一次即恢复。
const COVER_BACKDROP_RATIO = 0.9;   // 宽且高都 ≥90% 所在容器
const COVER_TEXT_OVERLAP = 0.8;     // TEXT 被色块覆盖的面积比
function coverContains(r, t) {
  if (!r || !t || t.w <= 0 || t.h <= 0) return false;
  const ox = Math.max(0, Math.min(r.right, t.right) - Math.max(r.x, t.x));
  const oy = Math.max(0, Math.min(r.bottom, t.bottom) - Math.max(r.y, t.y));
  return ox * oy >= t.w * t.h * COVER_TEXT_OVERLAP;
}
function isCoverSolidBackdrop(n, parentRect, kids) {
  if (!n || n.type === "TEXT" || childCount(n) > 0) return false; // 只要叶子色块，资源文件夹不动
  if (hasTextDescendant(n)) return false;
  if (fillHas(n, /IMAGE/)) return false;                            // 真实内容图绝不沉底
  const r = absRect(n);
  if (!r || r.w <= 0 || r.h <= 0 || !parentRect || parentRect.w <= 0 || parentRect.h <= 0) return false;
  if (r.w < parentRect.w * COVER_BACKDROP_RATIO || r.h < parentRect.h * COVER_BACKDROP_RATIO) return false;
  return kids.some(c => c && c !== n && c.type === "TEXT" && coverContains(r, absRect(c)));
}
function normalizeSectionBackdropOrder(root, summary) {
  if (!root || !("children" in root)) return;
  const s = summary || {};
  let scanned = 0, moved = 0;
  const walk = (ctr, depth) => {
    if (!ctr || depth > 8 || !("children" in ctr)) return;
    const kids = Array.prototype.slice.call(ctr.children || []);
    if (kids.length >= 2) {
      const pr = absRect(ctr);
      for (const n of kids) {
        if (!isCoverSolidBackdrop(n, pr, kids)) continue;
        scanned++;
        const r = absRect(n);
        const ni = kids.indexOf(n);
        const coversTextBelow = kids.some((c, i) => i < ni && c && c.type === "TEXT" && coverContains(r, absRect(c)));
        if (coversTextBelow && ctr.children.indexOf(n) > 0) {
          try { ctr.insertChild(0, n); moved++; } catch (e) {}
        }
        break; // 单容器最多纠正一个覆盖底块，避免反复重排
      }
    }
    for (const c of kids) if (c && "children" in c) walk(c, depth + 1);
  };
  walk(root, 0);
  s.sectionBackdropScanned = (Number(s.sectionBackdropScanned) || 0) + scanned;
  s.sectionBackdropMoved = (Number(s.sectionBackdropMoved) || 0) + moved;
}

// v20261111.32：root 直属层 z-order 归一化。
// 根因：createSlotConGroup 把 slot-con 插到 contents 的 minIdx，而 bg 装饰节点散布在
// contents 中间；organizeLayout 的 y 降序排序后，局部卡片底 / 分隔线会落到 slot-con
// 之后（更上层），不透明深色底直接盖住 section-02-info 的 TEXT —— 节点 bbox 全部不变，
// 但视觉丢失。契约顺序：全屏毛玻璃 → 其余 bg 装饰 → 其它直属 → slot-con → header。
function normalizeRootBackdropOrder(root, base, summary) {
  if (!root || !("children" in root)) return;
  const s = summary || {};
  // v20261111.43：段内覆盖型纯色底块沉底。必须放在本函数的 early return 之前，
  // 这样即使 root 层无需重排、或 groupBySpatialBands 走幂等 return，坏树也能被纠正。
  normalizeSectionBackdropOrder(root, s);
  const kids = Array.prototype.slice.call(root.children || []);
  // 至少「slot-con + 1 个背景」即可纠正；不能要求 3 个，否则简单组件会漏修。
  if (kids.length < 2) return;
  const slot = kids.filter(isSlotContainer)[0];
  if (!slot) return;
  const header = kids.filter(isHeaderLike)[0];
  const isBackdrop = (n) =>
    /^bg-/i.test(String((n && n.name) || "")) ||
    (!!base && isBlurBackdrop(n, base));
  const backs = kids.filter(n => n !== slot && n !== header && isBackdrop(n));
  if (!backs.length) return;
  const blur = backs.filter(n => !!base && isBlurBackdrop(n, base));
  const plain = backs.filter(n => blur.indexOf(n) < 0);
  const rest = kids.filter(n => n !== slot && n !== header && backs.indexOf(n) < 0);
  const ordered = blur.concat(plain, rest, [slot], header ? [header] : []);
  let moved = 0;
  for (let i = 0; i < ordered.length; i++) {
    const n = ordered[i];
    if (!n) continue;
    try {
      if (root.children.indexOf(n) !== i) {
        root.insertChild(Math.max(0, Math.min(i, root.children.length)), n);
        moved++;
      }
    } catch (e) {}
  }
  s.rootBackdropMoved = (Number(s.rootBackdropMoved) || 0) + moved;
  s.rootBackdropOrdered = backs.length;
}
// 主入口：createSlotConGroup 之后、sortSlotConChildren 之前调用。
function groupBySpatialBands(root, summary) {
  if (!root || !("children" in root) || root.type === "PAGE") return null;
  const s = summary || {};
  const base = absRect(root);
  if (!base || base.w <= 0 || base.h <= 0) return null;
  const slot = Array.prototype.slice.call(root.children || []).filter(isSlotContainer)[0];
  if (!slot) return null;
  const kids0 = Array.prototype.slice.call(slot.children || []);
  // v20261111.32：背景层归一化必须在幂等 return 之前 —— 对历史 .31 结果直接重跑时，
  // 槽内已全是 section Group，若不先纠正 z-order，深色卡片底会继续盖住信息卡文字。
  normalizeRootBackdropOrder(root, base, s);
  // 纯对象测试桩 / 无绝对几何 / 内容过少：严格跳过，保证历史探针与旧整理结果零回归。
  // v20261111.35 P1：阈值 4→2。紧凑面板 slot-con 直属常只有 2~3 个业务容器，
  // 旧阈值会让 detectBands 一次都跑不到，section-NN-* 恒为 0（2:8858 实测）。
  if (kids0.length < 2 || !kids0.some(hasAbsGeometry)) return null;
  // 幂等：槽内直接子级全是已建带 Group → 不重复建组、不重复排序。
  if (kids0.every(n => isBandGroup(n) || isSectionGroup(n))) { s.bandIdempotent = 1; return slot; }

  dissolveCrossBandFolders(slot, base, s);
  const det = detectBands(slot, base, s);
  let bands = det.bands;
  // v20261111.35 P1：被 pin 的大业务容器（h ≥ 60%·H）在紧凑面板里往往就是主列表，
  // detectBands 会把它完全排除，导致主内容区永远拿不到 section-NN-*（2:8858 实测）。
  // 此时若容器边界能给出不少于原结果的带数，就优先按容器边界切。
  // 53:31607 的 pin 是近全屏毛玻璃（bg-* 被容器切带过滤），fb 带数 < 6 ⇒ 保持原 6 带，零回归。
  if (det.pinned > 0) {
    const fb = detectContainerBands(slot, base, s);
    if (fb && fb.length >= (bands ? bands.length : 0)) bands = fb;
  }
  // 无空白带的紧凑面板：改用自带容器边界切段（严格兜底，不影响已有 6 带场景）。
  if (!bands || bands.length < 2) {
    const fb = detectContainerBands(slot, base, s);
    if (fb) bands = fb;
  }
  if (!bands || bands.length < 2) return slot;

  let created = 0, renamed = 0, headerDone = false, sectionNo = 0;
  for (let bi = 0; bi < bands.length; bi++) {
    const band = bands[bi];
    const bandH = band.end - band.start;
    // v20261111.35 P1：容器边界带里短标题在子树内，需下钻 3 层才能识别顶带 header。
    const shortText = band.items.some(x => {
      const n = x.n;
      if (!n) return false;
      if (n.type === "TEXT") {
        const t = String(n.characters || "").replace(/\s/g, "");
        return t.length > 0 && t.length <= 12;
      }
      let hit = false;
      (function w(k, d) {
        if (!k || hit || d > 3) return;
        if (k.type === "TEXT") {
          const t = String(k.characters || "").replace(/\s/g, "");
          if (t.length > 0 && t.length <= 12) hit = true;
          return;
        }
        for (const c of Array.prototype.slice.call(k.children || [])) w(c, d + 1);
      })(n, 0);
      return hit;
    });
    const hasImg = band.items.some(x => /^img-/.test(String((x.n && x.n.name) || "")));
    const isHeader = !headerDone && bi === 0 && bandH <= base.h * HEADER_BAND_RATIO && shortText && !hasImg;
    const nodes = band.items.map(x => x.n);

    if (isHeader) {
      // 顶带真建 header Group，并提升到 root 平级（createSlotConGroup 会排除 isHeaderLike）。
      const before = Array.prototype.slice.call(slot.children || []);
      const idxs = nodes.map(n => before.indexOf(n)).filter(i => i >= 0);
      const minIdx = idxs.length ? Math.min.apply(null, idxs) : 0;
      for (const n of nodes) { try { if (n.locked) n.locked = false; } catch (e) {} }
      const grp = safeGroup(nodes.slice().sort((a, b) => before.indexOf(a) - before.indexOf(b)), "header");
      if (!grp) { s.bandGroupFailed = (Number(s.bandGroupFailed) || 0) + 1; continue; }
      markBandGroup(grp);
      try { slot.insertChild(Math.max(0, Math.min(minIdx, slot.children.length - 1)), grp); } catch (e) {}
      try { root.appendChild(grp); } catch (e) {}
      created++; headerDone = true;
      s.bandHeaderCreated = 1;
      logContainer("[骨架]", grp, nodes.length, String(root.name || ""));
      continue;
    }

    sectionNo++;
    const target = "section-" + twoDigit(sectionNo) + "-" + (band.slug || bandSlug(band, sectionNo, base));
    // 单节点且已是语义容器：只重命名 + 打标记，绝不套第二层（.26 护栏）。
    if (nodes.length === 1) {
      const only = nodes[0];
      if ("children" in only || /^section-/.test(String(only.name || ""))) {
        try {
          if (String(only.name || "") !== target) { if (only.locked) only.locked = false; only.name = target; renamed++; }
          markBandGroup(only);
        } catch (e) {}
        continue;
      }
    }
    if (nodes.length < 2) continue;
    const before = Array.prototype.slice.call(slot.children || []);
    const idxs = nodes.map(n => before.indexOf(n)).filter(i => i >= 0);
    const minIdx = idxs.length ? Math.min.apply(null, idxs) : 0;
    for (const n of nodes) { try { if (n.locked) n.locked = false; } catch (e) {} }
    const grp = safeGroup(nodes.slice().sort((a, b) => before.indexOf(a) - before.indexOf(b)), target);
    if (!grp) { s.bandGroupFailed = (Number(s.bandGroupFailed) || 0) + 1; continue; }
    markBandGroup(grp);
    try { slot.insertChild(Math.max(0, Math.min(minIdx, slot.children.length - 1)), grp); } catch (e) {}
    created++;
    logContainer("[子模块]", grp, nodes.length, String(slot.name || ""));
  }
  s.bandGroupsCreated = (Number(s.bandGroupsCreated) || 0) + created;
  s.bandContainersRenamed = (Number(s.bandContainersRenamed) || 0) + renamed;
  // v20261111.32：背景层整体归一化（毛玻璃恒 idx0 + 局部卡片底/分隔线全部在 slot-con 之下）。
  // 只重排、不增删节点，原有节点绝对 bbox 零变化，视觉恢复与 .30 等价。
  normalizeRootBackdropOrder(root, base, s);
  return slot;
}

// ---- v20261110.22 P1：整理前后结构质量快照（纯只读）------------------------------
// 目的：把「提高生成质量」变成可度量指标；不写入节点、不影响整理逻辑。
const DEFAULT_NAME_RE = /^(?:Frame|Group|Rectangle|Ellipse|Vector|Line|Star|Polygon|Boolean\s*Operation|Component|Instance|Text|Union|Subtract|Intersect|Exclude|Image)\s*[\d\s._-]*$/i;
const SEMANTIC_NAME_RE = /^(?:cp-|card-|list-|item-|section-|graphic-|form-|img-|icon-|badge-|bg-|@echarts\/|@antd\/|header|slot-|chart-|legend|axis|label|value|unit|title|footer)/i;

function collectQualityMetrics(root) {
  const m = {
    total: 0, defaultNames: 0, maxDepth: 0, duplicates: 0, semantic: 0,
    resourceFolders: 0, resourceNoExport: 0, hasHeader: false, hasSlotCon: false,
    modules: 0, texts: 0, score: 0, grade: "-", breakdown: {},
  };
  // 重名只在同一父级内计：循环模板 item-1/value 与 item-2/value 是同构子项，不应误扣分。
  const nameCount = new Map();
  const walk = (n, depth, parentKey) => {
    if (!n || depth > 40) return;
    m.total++;
    m.maxDepth = Math.max(m.maxDepth, depth);
    let nm = "";
    try { nm = String(n.name || "").trim(); } catch (e) {}
    if (DEFAULT_NAME_RE.test(nm)) m.defaultNames++;
    if (SEMANTIC_NAME_RE.test(nm)) m.semantic++;
    if (nm) { const key = parentKey + "::" + nm; nameCount.set(key, (nameCount.get(key) || 0) + 1); }
    try { if (n.type === "TEXT") m.texts++; } catch (e) {}
    if (folderRole(n)) {
      m.resourceFolders++;
      let ex = [];
      try { ex = n.exportSettings || []; } catch (e) {}
      if (!ex.length) m.resourceNoExport++;
    }
    if (isHeaderLike(n)) m.hasHeader = true;
    if (isSlotContainer(n)) m.hasSlotCon = true;
    if (n !== root && isModuleLike(n)) m.modules++;
    if ("children" in n && Array.isArray(n.children))
      for (const c of n.children) walk(c, depth + 1, String(n.id || ""));
  };
  walk(root, 0, "");
  for (const c of nameCount.values()) if (c > 1) m.duplicates += c - 1;
  const denom = Math.max(1, m.total);
  const qName = 25 * Math.max(0, 1 - m.defaultNames / denom);
  const qSemantic = 20 * Math.min(1, m.semantic / denom);
  const qResource = m.resourceFolders ? 20 * Math.max(0, 1 - m.resourceNoExport / m.resourceFolders) : 20;
  const qSkeleton = (m.hasHeader ? 5 : 0) + (m.hasSlotCon ? 10 : 0) + (m.modules > 0 ? 5 : 0);
  const qDepth = Math.max(0, 15 - Math.max(0, m.maxDepth - 6) * 2);
  const qDup = Math.min(10, m.duplicates);
  m.score = Math.max(0, Math.min(100, Math.round(qName + qSemantic + qResource + qSkeleton + qDepth - qDup)));
  m.grade = m.score >= 85 ? "A" : m.score >= 70 ? "B" : m.score >= 55 ? "C" : "D";
  m.breakdown = {
    naming: +qName.toFixed(1), semantic: +qSemantic.toFixed(1),
    resource: +qResource.toFixed(1), skeleton: qSkeleton, depth: qDepth, duplicatePenalty: -qDup,
  };
  return m;
}

// 第一行给 UI 常显（简洁），其余行给折叠详情。
function qualityDiffText(before, after) {
  if (!before || !after) return "";
  const d = after.score - before.score;
  const head = "质量 " + before.score + "→" + after.score + " (" + (d >= 0 ? "+" : "") + d + " " + after.grade + ")";
  const rows = [
    "默认名残留 " + before.defaultNames + "→" + after.defaultNames,
    "语义命名 " + before.semantic + "→" + after.semantic + "/" + after.total,
    "重名 " + before.duplicates + "→" + after.duplicates,
    "最大深度 " + before.maxDepth + "→" + after.maxDepth,
    "资源文件夹 " + before.resourceFolders + "→" + after.resourceFolders + "（未挂导出 " + after.resourceNoExport + "）",
    "骨架 header=" + (after.hasHeader ? "Y" : "N") + " slot-con=" + (after.hasSlotCon ? "Y" : "N") + " 模块=" + after.modules,
    "分项 命名" + after.breakdown.naming + " 语义" + after.breakdown.semantic
      + " 资源" + after.breakdown.resource + " 骨架" + after.breakdown.skeleton
      + " 层级" + after.breakdown.depth + " 重名扣分" + after.breakdown.duplicatePenalty,
  ];
  return head + "\n" + rows.join("\n");
}

// v20261110.20 结构契约：整理结果 → 下游代码生成模型的唯一载体。
// 只输出「节点名 + 缩进层级」：不写文件、不缓存、不带几何/颜色/资源二进制。
// 骨架三段式：cp- 根 / header + bg + slot-con / header-slot-*；同构序号子项折叠为 [循环 ×N]。
// v20261110.28：契约格式版本，UI 未传版本时的兜底（单一来源仍是 ui.html 的 PLUGIN_VERSION）。
// v20261111.37：插件改名，契约内容不变，仅随包升版便于核对重导入。
// v20261111.38：UI 版本尾注改为「最后更新于 …」，契约内容不变，仅随包升版。
// v20261111.39：默认零安装直连、本地代理可选；契约语义不变，仅随包升版。
// v20261111.40：仅改写 UI/文档说明文案，契约语义不变，仅随包升版。
// v20261111.41：修复断开态代理按钮变主按钮的误导；契约语义不变，仅随包升版。
// v20261111.42：UI/文档说明文案去 AI 化精简；契约语义不变，仅随包升版。
// v20261111.43：几何行聚类加三道护栏（竖栏不并入行 / 同规格集合与 list-·grid- 跳过行聚类 /
//   同行成员面积差异超 1:4 不建行容器），修复「左导航列 + 右卡片网格」被揉成一个 item-* 的问题。
//   契约文本与折叠语义不变，仅新增诊断计数（geoColumnsKept / geoProtectedSets / geoRowRejected）。
// v20261111.44：① 修复 AI 路径结果消息漏传上述三项计数（护栏已命中但面板恒显示 0）；
//   ② 竖栏判据要求「有子节点的容器」——叶子矩形（竖向分隔线 / 滚动条轨）实测被误报成竖栏 2 个。
// v20261111.45：契约语义不变。关思考链路修复（在 ui.html）：最后一个候选不再被当成成功并缓存
//   （那会让后续分段永不重试、全部只返回思考内容）；正文为空时先给同一方言加预算重试一次；
//   每段实际方言 / 预算 / 思考字数写进分析日志。另附 diag-thinking.mjs 供本地判定方言。
// v20261111.46：契约语义不变（改动都在 ui.html 的关思考链路）。按实测网关行为重写策略：
//   网关静默忽略全部关思考参数、思考长度随预算膨胀 ⇒ 改为「单次请求 + 12000 预算 + 剩余分片重切 40」。
// v20261111.47：新增「整理模型」配置项（organizeModel，可填不思考的模型彻底绕开思考）；契约语义不变。
// v20261111.48：关思考策略对齐 mvgo（路由顺序 / isReasoningModel 弃用判定 / length 熔断 /
//   推理模型 temperature=1 / 输出上限表）。
// v20261111.49：新增【确定性循环命名】——同规格兄弟集合里仍是默认名的成员改名 item-<slug>-1..N，
//   让结构契约在 AI 未产出命名时仍能折叠 [循环 ×N，首项即模板]；只动默认名，AI 语义名不覆盖。
// v20261111.57：新增 normalizeSectionBackdropOrder —— 不依赖名字，用「几何覆盖 + 无 IMAGE 填充 +
//   同级 TEXT 在其下」识别覆盖型纯色底块并沉到容器 idx0；修 AI 把纯色底命名成 img-* 后
//   reparent 追加到段尾、不透明底盖住文字（53:31607 实测 1.7445% 视觉回归）。契约语义不变。
// v20261111.58：契约语义不变（改动都在 ui.html 的关思考链路）。模型名路由优先于网关子句；
//   「始终思考」模型首选最低强度 low，不再逐条试关闭参数；文档补按模型族处置表。
// v20261111.59：① scanTree 补 arcData/strokes 几何字段；② hasChartSemantics 加多段同心弧
//   与同级图例判据；③ 新增 promoteArcCharts / normalizeChartLegend 确定性后处理，把被误判的
//   graphic-* 环形图升为 @echarts/pie 并清掉位图导出，图例统一 legend-*；
//   ④ 契约新增 [chart:… legend:…] / [legend→ …] 关联标注与头部声明（53:34075）。
// v20261111.60：① scanTree 补 VECTOR 压缩路径特征 vp：[命令数,C段数,是否闭合]；
//   ② 新增 countLineCurves / hasEvenGrid / countAxisNumbers / findLineChartTargets，
//      三条件同时满足才升 @echarts/line（零 token 确定性，不依赖视觉）；
//   ③ promoteLineCharts 把 img-*→series-line、bg-*→axis-grid、清 PNG@2x；
//   ④ 硬门禁：organizeGraphicContainers / applyAssetExports 对 @echarts/* 内部
//      禁止生成 img-* 与位图导出，修 AI/视觉直接命名图表仍被位图化的落盘 bug；
//   ⑤ describeChartBinding 改为同级+子级+祖先链查找，契约头部补折线声明（5:35420）。
// v20261111.61：面板主标题按 y 几何提升根级 header（promoteRootHeader）。
// v20261111.62：整理模型与本地代理收进默认折叠的高级设置（UI-only）。
// v20261111.63：契约层虚拟 unwrap / 装饰叶子压行（单子节点深链）。
// v20261111.64：① demoteLeafCharts —— @echarts/*|@antd/* 误命名到叶子时按几何降级
//     （全屏+有 fills → bg-panel 提回根并恢复 PNG@2x，否则 img-*），两条主流程都在容器治理之前；
//   ② 新增 collectBarPillars / countBarPillars / isBarChartCandidate / findBarChartTargets /
//      promoteBarCharts —— ≥6 根等宽等距同底柱体 + 等距网格 + ≥4 数字刻度才升 @echarts/bar，
//      内部 img-*/bg-* → series-bar / axis-grid，清 PNG@2x，TEXT 保留，mvBarChart 幂等；
//   ③ 契约头 + prompt 补 bar 判据与「@ 前缀只能是有 children 的容器」（53:34075）。
const SCHEMA_VERSION = "20261110.64";

const CONTRACT_HEADER = [
  "# Figma 整理后结构契约（组件骨架）",
  "# 每行是一个节点名；缩进表示父子包含关系；同级顺序即视觉从上到下（已按 y/x 排序，与 Figma 图层面板无关）。",
  "# 选区根节点 = 组件根，一律命名 cp-<语义>；组件内部固定三段式：",
  "#   header   → 标题区（header-title + header-slot-* 插槽）",
  "#   bg       → 背景/装饰层（整体导出，不要逐个重建矢量）",
  "#   slot-con → 其余全部内容区域，合成一个整体容器，不要平铺在组件根下",
  "# header 插槽按位置命名：header-title / header-slot-left / header-slot-center / header-slot-right；",
  "#   header-slot-right 通常放按钮、tab、图例、时间筛选；生成时预留 <slot> 供外部注入。",
  "# 全组件只有一个 header；模块小标题 section-title-* 属于 slot-con，不是根级 header 插槽。",
  "# 面板主标题按几何判定：最顶部（y≤8%·H）、横跨≥80%·W、高度≤15%·H 且含短标题文本的标题带恒为根级 header；",
  "#   严禁改名 section-title-* 或收进 slot-con。AI 误命名时插件按 y 几何提升回 cp 根直属，零 token 契约同样归一化。",
  "# 全组件只有一个 slot-con；异构分区用 section-*，容器用 card-*/list-*/form-*，绝不出现第二个 slot-con-*。",
  "# slot-con 下以 section-title-* 或视觉空白带分成 section-* 子模块；段前/跨段节点直属 slot-con。",
  "# section-NN-<语义> 是插件按 y 空白间隙【真建】的分区容器（NN 为视觉从上到下序号）；",
  "#   同带节点才归同一 section，禁止把 header/背景/相邻带的图标并进同一分区；",
  "#   分区内只有标题没有内容的是空壳，勿臆造列表/事件/数据。",
  "# graphic-* 是零散矢量拼成的静态图形容器（内部已合并为 img-* 资源），按图片实现，严禁用图表库重建。",
  "# item- 只用于【带 -N 序号】的同构循环子项：list-*/cards-* 内 item-xxx-1..N 按一份模板 + v-for/map 渲染；",
  "#   契约只展开首项，其余折叠为 [循环 ×N]，绝不生成 N 份重复代码；不带序号的 item- 不是循环项。",
  "# 资源文件夹 bg-*/img-*/icon-* 整体导出；@echarts/* 用图表库实现。",
  // v20261111.59：图表与图例的关联标注（53:34075 环形图/图例漏识别的契约侧补强）。
  "# @echarts/* 行尾 [chart:类型 legend:xxx] 给出图表类型与同级图例容器；legend-* 行尾",
  "#   [legend→ @echarts/xxx] 给出归属图表；两者必须按一份 legend 数据绑定，不要生成两份独立列表。",
  "# 环形/饼图由多个 innerRadius>0 的同心弧段组成，即使没有坐标轴也用图表库重建；",
  "#   series-arcs 是它的弧段容器，严禁按静态图片导出，占比数值一律绑定 props / 接口字段。",
  // v20261111.60：折线/面积图与落盘硬门禁（5:35420）。
  "# 折线/面积图由宽扁多段贝塞尔曲线 + 等距水平网格 + 双轴数字刻度组成，用 @echarts/line 重建；",
  "#   series-line / axis-grid 是它的曲线与网格容器；@echarts/* 内部一律不导出位图，",
  "#   刻度 TEXT 保持独立节点，数值绑定 props / 接口字段，不要当静态图片或独立列表。",
  // v20261111.64：柱状图与 @ 前缀叶子护栏（53:34075 背景误命名 + bar 未识别）。
  "# 柱状图由 ≥6 根等宽等距、底边对齐的窄柱 + 等距水平网格 + 双轴数字刻度组成，用 @echarts/bar 重建；",
  "#   series-bar / axis-grid 是柱体与网格容器；与折线/饼图一样，@echarts/* 内部一律不导出位图，",
  "#   刻度 TEXT 保持独立节点，数值绑定 props / 接口字段，不要把柱子写成静态 PNG。",
  "# @echarts/* / @antd/* 只能命名【有子节点的容器】：叶子图层（背景 VECTOR / 色块 / 图标）出现 @ 前缀",
  "#   一律是误命名，按背景或静态资源实现，严禁用图表库重建；插件整理时会按几何降级为 bg-*/img-*。",
  // v20261111.35 P2：badge 是动态计数，不是静态资源。
  "# badge-count-NN 是 tab / 列表项上的【动态计数徽标】：绑定接口计数（行尾 [tab:xxx] 指明归属 tab），",
  "#   严禁按图片导出、严禁把字面数字写死；它不属于 icon-*/img-*/bg-* 静态资源；",
  "#   每个 badge 独立绑定自己 [tab:xxx] 的计数，不是循环项，不要按一份模板 + v-for 生成。",
  "# 动态数据槽：TEXT 行尾 [data:value|label|unit \"内容摘要\"] 表示可变数据，",
  "#   生成时绑定 props / 接口字段，绝不把字面量写死；data:label 多为静态文案可保留。",
  "# 严格按此层级划分组件边界，不要臆造此树中不存在的节点、模块或数据。",
  // v20261110.28 P0-1/P0-3：契约是结构约束，不是需求文档；防止文档子管线把它当业务需求分析，
  // 也防止「视觉样式/布局让位设计稿」被泛化成整套骨架让位（同 2026-11-02 tab 事故）。
  "# 本段是【结构契约】，不是需求文档：禁止据此分析业务需求、臆造交互事件或数据接口。",
  "# 优先级例外：本段的结构约束（组件边界/分区划分/循环判定/图表 vs 静态图形/资源实现）等同 Figma @技术栈锚点契约，不让位设计稿；",
  "#   仅颜色、字号、间距等纯视觉样式可让位设计稿。",
  // v20261110.28 P0-2：nodeId 可选输出，给管线按 id 回填已有 section。
  "# 开启「附带节点 ID」时，行尾 #1-283 是 Figma nodeId：用于回填已有同名 section，不要据此新建节点；虚拟骨架行（header/bg/slot-con/section-* 合成行）无 ID。",
  // v20261111.63：契约层虚拟 unwrap / 装饰叶子压行（只读，零写 Figma）。
  "# 契约已虚拟折叠「单子 + 默认名 + 无危险属性 + 同 bbox」的空壳容器（FRAME / GROUP 同样处理），",
  "#   Figma 图层面板不变；行尾 [icon:N 矢量 · 整体导出] 表示纯装饰叶子组，按一份资源实现，不要逐个重建矢量。",
  "# 头部 # @meta 是机器可读摘要；truncated=true 或出现 [省略 N 行] 表示树不完整，勿据此推断缺失模块。",
].join("\n");

function cleanContractName(n) {
  let nm = "";
  try { nm = String((n && n.name) || "").trim(); } catch (e) {}
  nm = nm.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").slice(0, 80);
  return nm || "(unnamed)";
}

// v20261111.35 P2：契约行尾标注 badge 归属的 tab，供下游把计数绑到正确的 tab 上。
function describeTabBadge(n) {
  if (!n || !/^badge-count-/i.test(cleanContractName(n))) return "";
  let label = "";
  try { label = String(n.getPluginData("mvTabBadge") || ""); } catch (e) {}
  if (!label) return "";
  return "  [tab:" + label.replace(/[\r\n\t\[\]]+/g, " ").trim().slice(0, 20) + "]";
}

// v20261111.59：图表 ↔ 图例关联标注。图例常与图表平级（53:34075），
// 契约里不写清关联，下游会把图例当成独立列表再渲染一份。
// v20261111.60：图例也可能是图表容器的子节点（5:35420 把 section 升成 @echarts/line 后），
// 因此查找范围扩为「同级 + 子级 + 祖先链」，但只认有 children 的容器，避免叶子误标。
function chartNearbyNodes(n) {
  const out = [], seen = new Set();
  const add = (x) => { if (x && x !== n && !seen.has(x.id)) { seen.add(x.id); out.push(x); } };
  try {
    const p = n.parent;
    if (p && "children" in p) for (const s of p.children) add(s);
    if ("children" in n) for (const c of n.children) add(c);
  } catch (e) {}
  return out;
}
function chartAncestorNodes(n) {
  const out = [];
  let p = n && n.parent, hop = 0;
  while (p && hop++ < 4) { out.push(p); p = p.parent; }
  return out;
}
function describeChartBinding(n) {
  if (!n) return "";
  const nm = cleanContractName(n);
  const isContainer = (n.children || []).length > 0;
  const near = chartNearbyNodes(n);
  // 只标容器：图层里可能有同名叶子 VECTOR（如 53:34075 的柱体碎片叫 @echarts/bar），
  // 给它加 [chart:…] 会在契约里制造假的图表行。
  if (/^@echarts\//i.test(nm) && isContainer) {
    const type = nm.slice(9).trim() || "chart";
    const lg = near.find(s => /^legend(?:-|$)/i.test(cleanContractName(s)) && (s.children || []).length > 0);
    return "  [chart:" + type + (lg ? " legend:" + cleanContractName(lg) : "") + "]";
  }
  // 只标 .59 的 legend-<语义> 容器；纯名 legend 是旧规范节点，保持原样不打扰既有契约行。
  if (/^legend-/i.test(nm)) {
    const ch = near.concat(chartAncestorNodes(n)).find(s => /^@echarts\//i.test(cleanContractName(s)) && (s.children || []).length > 0);
    if (ch) return "  [legend→ " + cleanContractName(ch) + "]";
  }
  return "";
}

function cpComponentName(root) {
  const nm = cleanContractName(root);
  if (/^cp-/i.test(nm)) return nm;
  const slug = nm.replace(/[^\w\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).toLowerCase();
  return "cp-" + (slug || "component");
}

function isHeaderNode(n) { return /^header(?:[-/]|$)/i.test(cleanContractName(n)); }
function isBgNode(n) { return /^bg(?:-|$)/i.test(cleanContractName(n)); }
function isSlotConNode(n) { return /^slot-con$/i.test(cleanContractName(n)); }

function visibleChildren(n) {
  if (!n || !("children" in n) || !Array.isArray(n.children)) return [];
  const kids = n.children.filter(c => {
    try { return c && c.visible !== false; } catch (e) { return !!c; }
  });
  // v20261110.25：契约头声明「同级顺序即从上到下」，但 Figma 的 children 是 z-order
  //（图层面板反序显示），直接输出常常是倒的。这里统一按视觉 y 升序 / 同 y 按 x 升序。
  // 只影响只读文本，不动任何节点；无几何信息的树（测试桩/纯命名树）保持原序。
  const num = (v) => (v === undefined || v === null || v === "" ? null
    : (Number.isFinite(Number(v)) ? Number(v) : null));
  if (!kids.some(c => num(c && c.y) !== null)) return kids;
  return kids.map((c, i) => ({ c: c, i: i }))
    .sort((a, b) => {
      const ay = num(a.c && a.c.y), by = num(b.c && b.c.y);
      if (ay !== null && by !== null && ay !== by) return ay - by;
      const ax = num(a.c && a.c.x), bx = num(b.c && b.c.x);
      if (ax !== null && bx !== null && ax !== bx) return ax - bx;
      if (ay !== null && by === null) return -1;
      if (ay === null && by !== null) return 1;
      return a.i - b.i;
    })
    .map(o => o.c);
}

// v20261110.22 P0-2：TEXT 节点标成动态数据槽，附内容摘要（限字预算，防止挤压层级信息）。
// 纯文本判据，不依赖 LLM：数值/百分比 → value；单位后缀 → unit；其余有文本 → label。
function describeDataSlot(n, budget) {
  if (!n || n.type !== "TEXT") return "";
  let txt = "";
  try { txt = String(n.characters || "").trim(); } catch (e) {}
  const rawName = cleanContractName(n);
  // Figma 默认名（Text 9 / Frame 12 …）不参与语义判断，否则 "Text 9" 会被 ^text 误判成 label；
  // 这类节点一律按文本内容判数值/文案。
  const nm = /^(?:Text|Frame|Group|Rectangle|Ellipse|Vector|Line|Star|Polygon|Component|Instance)\s*[\d\s._-]*$/i.test(rawName) ? "" : rawName;
  let kind = "";
  if (/^(value|number|metric|count|rate|percent|price|amount|total|score)/i.test(nm)) kind = "value";
  else if (/^(unit|suffix)/i.test(nm)) kind = "unit";
  else if (/^(label|title|name|caption|desc|text|header-title|section-title)/i.test(nm)) kind = "label";
  else {
    const t = txt.replace(/[,，\s]/g, "");
    if (/^[+-]?\d+(?:\.\d+)?[%％]?$/.test(t)) kind = "value";
    else if (/^(?:个|人|次|件|条|天|小时|分钟|秒|%|％|px|km|m|元|万|亿)$/.test(txt)) kind = "unit";
    else if (txt) kind = "label";
  }
  if (!kind) return "";
  let preview = "";
  if (txt && budget && budget.left > 0) {
    preview = txt.replace(/[\r\n\t"\[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
    budget.left -= preview.length + 4;
  }
  return "  [data:" + kind + (preview ? " \"" + preview + "\"" : "") + "]";
}

// 循环模板识别：名称去掉尾部 -N 后相同 + 子树类型指纹相同 + 在原层级连续出现。
function loopBaseName(nm) {
  const m = nm.match(/^(.*?)[-_](\d+)$/);
  return m ? { base: m[1], index: Number(m[2]) } : null;
}
function subtreeFingerprint(n, depth) {
  if (!n || depth > 3) return "";
  const t = String((n && n.type) || "?");
  const kids = visibleChildren(n).slice(0, 12).map(c => subtreeFingerprint(c, depth + 1)).join(",");
  return t + (kids ? "[" + kids + "]" : "");
}
function findLoopGroups(siblings) {
  const buckets = new Map();
  for (let i = 0; i < siblings.length; i++) {
    const nm = cleanContractName(siblings[i]);
    const b = loopBaseName(nm);
    if (!b) continue;
    const key = b.base + "::" + subtreeFingerprint(siblings[i], 0);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ node: siblings[i], index: b.index, name: nm, at: i });
  }
  const out = [];
  for (const arr of buckets.values()) {
    if (arr.length < 2) continue;
    if (arr.every((it, i) => i === 0 || it.at === arr[i - 1].at + 1)) out.push(arr);
  }
  return out;
}

// ---- v20261111.63：契约层虚拟 unwrap（只读归一化，零写 Figma）------------------------
// 需求：Figma 图层树里大量「Frame → Group → 叶子」单子深链，视觉上只有一层，逐行输出
//   会让大模型误以为存在业务层级。真 ungroup（B 方案）受 Figma API 限制：
//   figma.ungroup 的 Possible error cases 含 Only group-like nodes can be ungrouped /
//   Instances cannot be ungrouped / Components cannot be ungrouped ⇒ FRAME 不能直接拆，
//   且是破坏性写操作、跨父级 appendChild 会改相对坐标导致视觉漂移。
// A 方案：契约是纯文本，输出时跳过无语义外壳即可 —— 【不看 node.type】，FRAME / GROUP /
//   INSTANCE / BOOLEAN_OPERATION 走同一套判据，这就是「unframe 也一样」的含义。
// 但「能处理 FRAME」≠「会拆 FRAME」：FRAME 常带 layoutMode / clipsContent / fills /
//   exportSettings / rotation，被③「无危险属性」挡掉。4 棵真实树实测可命中全在 GROUP：
//   53:34075 safe=14、5:35420 safe=0（8 FRAME 全带 layout/clip/export）、
//   53:31607 原始稿 safe=0（9 FRAME 全带 fills/strokes/effects）、v42 safe=1。
// 五道判据同时满足才 unwrap（最多连跳 4 层）：① 唯一可见子节点 ② 默认名
//   ③ 容器无危险属性 ④ 与唯一子节点同 bbox（±2px）⑤ 非语义名容器。
// 纯装饰叶子组（bg-/icon-/img-/默认名，子树全为纯图形叶子、无 TEXT、无语义子容器）
//   压成一行 `  [icon:N 矢量 · 整体导出]`，不再逐个展开 VECTOR。
function contractHasRisk(n) {
  try { if (Array.isArray(n.exportSettings) && n.exportSettings.length) return true; } catch (e) {}
  try { if (Array.isArray(n.fills) && n.fills.length) return true; } catch (e) {}
  try { if (Array.isArray(n.strokes) && n.strokes.length) return true; } catch (e) {}
  try { if (Array.isArray(n.effects) && n.effects.length) return true; } catch (e) {}
  try { if (n.layoutMode && n.layoutMode !== "NONE") return true; } catch (e) {}
  try { if (n.clipsContent === true) return true; } catch (e) {}
  try { if (Math.abs(Number(n.rotation) || 0) > 0.001) return true; } catch (e) {}
  try { if (n.opacity !== undefined && n.opacity !== null && Number(n.opacity) !== 1) return true; } catch (e) {}
  try { if (n.cornerRadius) return true; } catch (e) {}
  return false;
}
function contractSameBox(a, b) {
  const x = nodeBox(a), y = nodeBox(b);
  return Math.abs(x.x - y.x) <= 2 && Math.abs(x.y - y.y) <= 2 &&
         Math.abs(x.w - y.w) <= 2 && Math.abs(x.h - y.h) <= 2;
}
function contractUnwrapTarget(n) {
  let cur = n, hops = 0;
  while (cur && hops++ < 4) {
    if (!("children" in cur)) break;
    const nm = cleanContractName(cur);
    if (!isDefaultGraphicName(nm)) break;
    if (/^(?:cp-|header|slot-con|section-|bg-|icon-|img-|graphic-|list-|item-|card-|form-|legend|axis-|series-|@)/i.test(nm)) break;
    const kids = visibleChildren(cur);
    if (kids.length !== 1) break;
    const only = kids[0];
    if (contractHasRisk(cur) || !contractSameBox(cur, only)) break;
    cur = only;
  }
  return cur;
}
function contractDecorLeafCount(n) {
  if (!n || !("children" in n)) return 0;
  const nm = cleanContractName(n);
  if (/^(?:cp-|header|slot-con|section-|list-|item-|card-|form-|legend|axis-|series-|@echarts\/|@antd\/)/i.test(nm)) return 0;
  if (!/^(?:bg-|icon-|img-|graphic-)|^(?:Group|Frame|Rectangle|Vector|Ellipse|Line|Boolean|Union|Subtract|Intersect|Star|Polygon)\s*[\d:\-]+$/i.test(nm)) return 0;
  let leaves = 0, bad = false;
  (function w(x, d) {
    if (bad || !x || d > 6) return;
    if (x.type === "TEXT") { bad = true; return; }
    if ("children" in x && (x.children || []).length) {
      if (d > 0) {
        const cn = cleanContractName(x);
        if (!isDefaultGraphicName(cn) && !/^(?:bg|icon|img|graphic)-/i.test(cn)) bad = true;
      }
      for (const c of (x.children || [])) w(c, d + 1);
    } else {
      if (GRAPHIC_TYPES[x.type]) leaves++; else bad = true;
    }
  })(n, 0);
  return (!bad && leaves >= 2) ? leaves : 0;
}

function buildStructureContract(root, opts) {
  const o = opts || {};
  // v20261111.63：raw 镜像模式保持原样供对照；骨架契约默认开启虚拟 unwrap。
  const virtualUnwrap = !o.raw && o.virtualUnwrap !== false;
  const maxNodes = o.maxNodes || 600;
  const maxDepth = o.maxDepth || 12;
  const maxChars = o.maxChars || 18000; // requirementDocText 在 mvgo 侧上限 20000 字
  const raw = !!o.raw; // raw=true：原样镜像图层树（不做骨架归一化），供对照与回归
  const version = String(o.version || SCHEMA_VERSION);
  const includeIds = !!o.includeIds; // v20261110.28 P0-2：默认关，UI 开关显式开启
  const namingConvention = o.namingConvention || "cp"; // v20261114 P0-2：仅影响落盘 componentName
  const lines = [];
  let count = 0, chars = 0, truncated = false, loops = 0, slots = 0;
  let sections = 0, omitted = 0, omittedDepth = -1;
  const slotBudget = { left: 3000 }; // 摘要总预算：超出后只留 [data:xxx] 标签
  // v20261111.61：只读契约里被几何提升为根级 header 的节点，展开 slot-con 时跳过，避免重复行。
  let contractSkip = null;

  // 截断是【骨架优先】：header/bg/slot-con 三段先 push，超限只会砍掉深层内容；
  // 这里累计被跳过的行数与起始深度，末尾输出显式警示，不再静默丢尾部。
  function markOmitted(depth) {
    omitted++;
    if (omittedDepth < 0) omittedDepth = depth;
  }
  function push(name, depth, node) {
    if (truncated) { markOmitted(depth); return; }
    if (count >= maxNodes || depth > maxDepth) { truncated = true; markOmitted(depth); return; }
    let line = "  ".repeat(depth) + "- " + name;
    // 只有真实 Figma 节点带 id；header/bg/slot-con/section-* 等虚拟骨架行不带。
    if (includeIds && node) {
      let id = "";
      try { id = String((node && node.id) || "").replace(/:/g, "-"); } catch (e) {}
      if (id) line += "  #" + id;
    }
    if (chars + line.length + 1 > maxChars) { truncated = true; markOmitted(depth); return; }
    lines.push(line);
    chars += line.length + 1;
    count++;
  }

  function emitChildren(parent, depth) {
    const kids = visibleChildren(parent);
    // v20261111.35 P2：badge 各自属于不同 tab、数值不同，【不是循环项】。
    // 否则 4 个同构 badge 会被折成「[循环 ×4，首项即模板]」，下游按一份模板生成，
    // 导致所有 tab 的未读数变成同一个值。
    const groups = findLoopGroups(kids).filter(g =>
      !g.some(x => /^badge-count-/i.test(cleanContractName(x && x.node))));
    const folded = new Set();
    for (const g of groups) for (const item of g.slice(1)) folded.add(item.at);
    for (let i = 0; i < kids.length; i++) {
      if (truncated) return;
      if (folded.has(i)) continue; // 同构重复项跳过，由首项后的折叠行统一表示
      const g = groups.find(x => x[0].at === i);
      if (g) {
        walkNode(kids[i], depth);
        const first = g[0], last = g[g.length - 1];
        // v20261110.28 P1-3：旧标签从 first.index+1 起、[循环 ×N] 又含首项，模型会误判成 N+1 份。
        // 改为 1..N 全区间 + 明确「首项即模板」，与已单独展开的首行语义一致。
        const base = cleanContractName(first.node).replace(/[-_]\d+$/, "");
        const label = base + "-" + first.index + ".." + last.index;
        push(label + "  [循环 ×" + g.length + "，首项即模板]", depth);
        loops++;
        continue;
      }
      walkNode(kids[i], depth);
    }
  }

  function walkNode(n, depth) {
    if (truncated || !n) return;
    try { if (n.visible === false) return; } catch (e) {}
    if (contractSkip && contractSkip.has(n)) return; // 已在根级 header 行输出过
    // v20261111.63：只改「输出的名字 / 层级」，data / tab / chart 标注仍按原始节点算，
    // 循环折叠、slots / loops / sections 计数与旧版一致，回归零副作用。
    const target = virtualUnwrap ? contractUnwrapTarget(n) : n;
    const decor = virtualUnwrap ? contractDecorLeafCount(target) : 0;
    const slot = describeDataSlot(n, slotBudget);
    if (slot) slots++;
    push(cleanContractName(target) + slot + describeTabBadge(n) + describeChartBinding(n)
      + (decor ? "  [icon:" + decor + " 矢量 · 整体导出]" : ""), depth, target);
    if (!decor) emitChildren(target, depth + 1);
  }

  // 组件根级骨架：cp- 根 → header / bg / slot-con 三段；header 内标注插槽。
  function walkSkeleton(rootNode) {
    push(cpComponentName(rootNode), 0, rootNode);
    const kids = visibleChildren(rootNode);
    // v20261110.24：只读导出也要归一化 —— 未整理的文件常有多个 header-* / slot-con-*，
    // 契约里只能有一个根 header；其余副标题按 section-title-* 输出在 slot-con 内。
    const allHeaders = kids.filter(isHeaderNode);
    const rootHeader = pickRootHeader(allHeaders, rootNode);
    // v20261111.61：未整理 / AI 误命名的稿子里，主标题常叫 section-title-* 且藏在 slot-con 内。
    // 只读契约也按同一套几何判据（最顶 y + 整宽 + 薄带 + 短文本）把它输出成根级 header，
    // 纯文本归一化、不写 Figma；因此零 token 返喂 mvgo 时三段式骨架同样成立。
    const geoHeader = rootHeader ? null : findRootHeaderBand(rootNode);
    const headers = rootHeader ? [rootHeader] : (geoHeader ? [geoHeader] : []);
    contractSkip = geoHeader ? new Set([geoHeader]) : null;
    const demotedHeaders = allHeaders.filter(h => h !== rootHeader);
    const bgs = kids.filter(isBgNode);
    const slotCons = kids.filter(isSlotConNode);
    const contents = kids.filter(n => !isHeaderNode(n) && !isBgNode(n) && !isSlotConNode(n));

    if (headers.length) {
      push("header", 1);
      const hkids = [];
      for (const h of headers) for (const c of visibleChildren(h)) hkids.push({ node: c, header: h });
      // header 容器本身无子节点时，把自己当标题项，避免 header 下空行
      if (!hkids.length) for (const h of headers) hkids.push({ node: h, header: h });
      hkids.forEach((it, idx) => {
        const nm = cleanContractName(it.node);
        let out;
        if (/^header-(?:slot-|title)/i.test(nm)) out = nm;
        else if (isBgNode(it.node)) out = "bg";
        else if (idx === 0 && (/(?:title|label|caption|name)/i.test(nm) || it.node.type === "TEXT")) out = "header-title";
        else if (/right|action|btn|button|tab|tool|filter|legend|control|more|操作|筛选|按钮/i.test(nm)) out = "header-slot-right";
        else {
          const w = Number(it.header && it.header.width) || 0;
          const x = Number(it.node.x) || 0;
          if (w > 0 && x >= w * 0.6) out = "header-slot-right";
          else if (w > 0 && x <= w * 0.25) out = "header-slot-left";
          else out = "header-slot-center";
        }
        const slot = describeDataSlot(it.node, slotBudget);
        if (slot) slots++;
        push(out + slot, 2, it.node);
        emitChildren(it.node, 3);
      });
    }
    if (bgs.length) push("bg", 1); // 背景整体导出，内部矢量不需要展开
    // 按根级原始顺序装配 body：副标题按归一化名输出并标 label，其余节点原样展开。
    const body = [];
    for (const k of kids) {
      if (k === rootHeader || (contractSkip && contractSkip.has(k)) || isBgNode(k) || isSlotConNode(k)) continue;
      if (demotedHeaders.indexOf(k) >= 0) body.push({ node: k, forced: contractSectionTitle(cleanContractName(k)) });
      else if (contents.indexOf(k) >= 0) body.push({ node: k });
    }
    if (body.length || slotCons.length) {
      push("slot-con", 1);
      // v20261110.26 P0：平铺的 section-title-* 是天然模块锚点，
      // 未整理 / 未真建 Group 的文件里也输出一层 section-*（纯文本，不建 Figma 节点）。
      // .25 已保证 body 顺序 = 视觉从上到下；≥2 个锚点才分段，单标题不制造假层级。
      const nameOf = (b) => b.forced || cleanContractName(b.node);
      const emitItem = (b, d) => {
        if (b.forced) { push(b.forced + "  [data:label]", d, b.node); emitChildren(b.node, d + 1); }
        else walkNode(b.node, d);
      };
      const anchors = [];
      body.forEach((b, i) => { if (/^section-title(?:-|$)/i.test(nameOf(b))) anchors.push(i); });
      // 已经真分层的容器（内部自带 section-title）不再造虚拟层，避免重复层级
      const realGroups = body.filter(b =>
        /^(item|card|list|form|section|graphic)-/i.test(cleanContractName(b.node)) &&
        visibleChildren(b.node).some(c => isSectionTitle(c)));
      // v20261111.31：Step 2 真建的 section-NN-* 带容器挂在 slot-con 内，必须计入 @meta sections，
      // 否则结构切分后 sections 恒为 0，管线做「生成后分区计数校验」会误判为无分区。
      // 优先级：真容器数 > 平铺标题虚拟分段数。
      let realSections = 0;
      for (const sl of slotCons)
        for (const c of visibleChildren(sl)) {
          const cnm = cleanContractName(c);
          if (/^section-(?:\d{2}-)?/i.test(cnm) && !/^section-title(?:-|$)/i.test(cnm)) realSections++;
        }
      // v20261110.28 P1-1：分区数进 @meta，供管线做生成后计数校验。
      sections = realSections > 0 ? realSections
        : ((anchors.length >= 2 && !realGroups.length) ? anchors.length : realGroups.length);
      if (anchors.length < 2 || realGroups.length) {
        for (const b of body) emitItem(b, 2);
      } else {
        let cur = -1;
        for (let i = 0; i < body.length; i++) {
          if (anchors.indexOf(i) >= 0) { cur++; push(sectionGroupName(nameOf(body[i])), 2); }
          emitItem(body[i], cur >= 0 ? 3 : 2);
        }
      }
      for (const s of slotCons) emitChildren(s, 2); // 已存在 slot-con：展开其内容，避免嵌套两层
    }
    contractSkip = null;
  }

  if (raw) walkNode(root, 0);
  else walkSkeleton(root);
  // v20261110.28 P1-1：质量评分与结构统计一并进契约头，管线可据此决定信任权重 / 做门禁。
  let quality = -1;
  try { quality = collectQualityMetrics(root).score; } catch (e) {}
  const meta = "# @meta version=" + version
    + "; sections=" + sections + "; loops=" + loops + "; slots=" + slots
    + "; nodes=" + count + "; truncated=" + truncated
    + "; omitted=" + omitted + (omittedDepth >= 0 ? "; omittedDepth=" + omittedDepth : "")
    + "; ids=" + (includeIds ? "on" : "off")
    + "; quality=" + quality + "/100";
  const tail = truncated
    ? "\n\n(已达上限，其余节点省略)\n# [省略 " + omitted + " 行 @ 深度 "
      + (omittedDepth >= 0 ? omittedDepth : "?") + "；结构不完整，勿据此推断缺失模块]"
    : "";
  return {
    text: CONTRACT_HEADER + "\n" + meta + "\n\n" + lines.join("\n") + tail,
    componentName: deriveComponentName(root, namingConvention), // v20261114 P0-2
    nodes: count,
    truncated: truncated,
    loops: loops,
    slots: slots,
    sections: sections,
    omitted: omitted,
    quality: quality,
    version: version,
    includeIds: includeIds,
    raw: raw,
  };
}

// v20261114 P0-1：结构化 JSON 契约 —— 与 buildStructureContract 同源，复用全部判据
// （虚拟 unwrap / 数据槽 / 图表关联 / 循环折叠 / 三段式骨架），仅把「缩进文本」换成
// 「嵌套 JSON」，供管线按 nodeId 精确回填、按骨架做结构校验，避免再被 LLM 用视觉重扫一遍。
function nodeGeom(n) {
  const b = nodeBox(n);
  const r = (v) => Math.round(v * 10) / 10;
  return { x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) };
}
function roleOfName(nm) {
  const m = String(nm || "");
  if (/^cp-/i.test(m)) return "component-root";
  if (/^header-title/i.test(m)) return "header-title";
  if (/^header-slot-/i.test(m)) return "header-slot";
  if (/^header(?:[-/]|$)/i.test(m)) return "header";
  if (/^bg(?:-|$)/i.test(m)) return "bg";
  if (/^slot-con$/i.test(m)) return "slot-con";
  if (/^section-\d{2}-/i.test(m)) return "section";
  if (/^section-title/i.test(m)) return "section-title";
  if (/^item-/i.test(m)) return "item";
  if (/^card-/i.test(m)) return "card";
  if (/^list-/i.test(m)) return "list";
  if (/^form-/i.test(m)) return "form";
  if (/^graphic-/i.test(m)) return "graphic";
  if (/^icon-/i.test(m)) return "icon";
  if (/^img-/i.test(m)) return "img";
  if (/^@echarts\//i.test(m)) return "chart";
  if (/^legend-/i.test(m)) return "legend";
  if (/^axis-/i.test(m)) return "axis";
  if (/^series-/i.test(m)) return "series";
  if (/^badge-count-/i.test(m)) return "badge";
  if (/^@antd\//i.test(m)) return "antd";
  if (m === "(unnamed)") return "other";
  return "node";
}
function parseDataSlot(slotStr) {
  if (!slotStr) return null;
  const m = String(slotStr).trim().match(/^\[data:(\w+)(?:\s+"([^"]*)")?\]\s*$/);
  if (!m) return null;
  return { kind: m[1], preview: m[2] || "" };
}
// v20261114 P0-2：cp-* 仅作组织内语义标签；落盘给生成管线的 componentName 按规范派生。
function deriveComponentName(root, convention) {
  const nm = cleanContractName(root);
  const slug = nm.replace(/[^\w\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40);
  const base = slug || "component";
  if (convention === "kebab") return "c-" + base;          // c-tunnel-* 风格（aidocs / 隧道组件）
  if (convention === "pascal") {                            // PascalCase
    return base.split("-").filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");
  }
  // 默认 cp：与旧行为一致
  return /^cp-/i.test(nm) ? nm : "cp-" + base;
}

function buildStructureJson(root, opts) {
  const o = opts || {};
  const version = String(o.version || SCHEMA_VERSION);
  const includeIds = !!o.includeIds;
  const virtualUnwrap = !o.raw && o.virtualUnwrap !== false;
  const raw = !!o.raw;
  const maxNodes = o.maxNodes || 600;
  const maxDepth = o.maxDepth || 12;
  const namingConvention = o.namingConvention || "cp";
  let truncated = false, count = 0, loops = 0, slots = 0, sections = 0;
  const slotBudget = { left: 3000 };

  function newId(n) {
    let id = "";
    try { id = String((n && n.id) || "").replace(/:/g, "-"); } catch (e) {}
    return id || null;
  }
  function makeNode(n, depth, overrideName, overrideRole) {
    if (truncated) return null;
    if (count >= maxNodes || depth > maxDepth) { truncated = true; return null; }
    count++;
    const target = virtualUnwrap ? contractUnwrapTarget(n) : n;
    const name = overrideName || cleanContractName(target);
    const node = { name, role: overrideRole || roleOfName(name), type: String((target && target.type) || "?") };
    Object.assign(node, nodeGeom(target));
    if (includeIds) { const id = newId(target); if (id) node.id = id; }
    const slot = describeDataSlot(n, slotBudget);
    if (slot) { node.data = parseDataSlot(slot); slots++; }
    const badge = describeTabBadge(n);
    if (badge) node.badgeTab = badge.replace(/^.*\[tab:([^\]]*)\].*$/, "$1");
    const chart = describeChartBinding(n);
    if (chart) {
      const cm = chart.match(/\[chart:([^\s]+)(?:\s+legend:([^\]]+))?\]/);
      const lg = chart.match(/\[legend→\s*([^\]]+)\]/);
      node.chart = cm ? { type: cm[1], legend: cm[2] || null } : (lg ? { legendOf: lg[1] } : {});
    }
    const decor = virtualUnwrap ? contractDecorLeafCount(target) : 0;
    if (decor) node.decorVectors = decor;
    if (!decor) {
      const kids = visibleChildren(target);
      const groups = findLoopGroups(kids).filter(g =>
        !g.some(x => /^badge-count-/i.test(cleanContractName(x && x.node))));
      const folded = new Set();
      for (const g of groups) for (const item of g.slice(1)) folded.add(item.at);
      const children = [];
      for (let i = 0; i < kids.length; i++) {
        if (folded.has(i)) continue;
        const g = groups.find(x => x[0].at === i);
        if (g) {
          const child = makeNode(kids[i], depth + 1);
          if (child) {
            const base = cleanContractName(g[0].node).replace(/[-_]\d+$/, "");
            child.loop = { base: base, from: g[0].index, to: g[g.length - 1].index, count: g.length };
            loops++;
            children.push(child);
          }
          continue;
        }
        const child = makeNode(kids[i], depth + 1);
        if (child) children.push(child);
      }
      if (children.length) node.children = children;
    }
    return node;
  }

  let rootNode;
  if (raw) {
    rootNode = makeNode(root, 0);
  } else {
    const kids = visibleChildren(root);
    const allHeaders = kids.filter(isHeaderNode);
    const rootHeader = pickRootHeader(allHeaders, root);
    const geoHeader = rootHeader ? null : findRootHeaderBand(root);
    const demotedHeaders = allHeaders.filter(h => h !== rootHeader);
    const bgs = kids.filter(isBgNode);
    const slotCons = kids.filter(isSlotConNode);
    const contents = kids.filter(n => !isHeaderNode(n) && !isBgNode(n) && !isSlotConNode(n));
    rootNode = { name: cpComponentName(root), role: "component-root", type: String(root.type || "?") };
    Object.assign(rootNode, nodeGeom(root));
    if (includeIds) { const id = newId(root); if (id) rootNode.id = id; }
    const headerArr = [];
    const headers = rootHeader ? [rootHeader] : (geoHeader ? [geoHeader] : []);
    if (headers.length) {
      const hkidsAll = [];
      for (const h of headers) {
        const hk = [];
        for (const c of visibleChildren(h)) hk.push({ node: c, header: h });
        if (!hk.length) for (const h2 of headers) hk.push({ node: h2, header: h2 });
        for (const it of hk) hkidsAll.push(it);
      }
      for (const it of hkidsAll) {
        const nm = cleanContractName(it.node);
        let out;
        if (/^header-(?:slot-|title)/i.test(nm)) out = nm;
        else if (isBgNode(it.node)) out = "bg";
        else if (it === hkidsAll[0] && (/(?:title|label|caption|name)/i.test(nm) || it.node.type === "TEXT")) out = "header-title";
        else if (/right|action|btn|button|tab|tool|filter|legend|control|more|操作|筛选|按钮/i.test(nm)) out = "header-slot-right";
        else {
          const w = Number(it.header && it.header.width) || 0;
          const x = Number(it.node.x) || 0;
          if (w > 0 && x >= w * 0.6) out = "header-slot-right";
          else if (w > 0 && x <= w * 0.25) out = "header-slot-left";
          else out = "header-slot-center";
        }
        const cn = makeNode(it.node, 2, out, roleOfName(out));
        if (cn) headerArr.push(cn);
      }
    }
    const bgArr = bgs.map(b => makeNode(b, 1, "bg", "bg")).filter(Boolean);
    const body = [];
    for (const k of kids) {
      if (k === rootHeader || isBgNode(k) || isSlotConNode(k)) continue;
      if (demotedHeaders.indexOf(k) >= 0) body.push({ node: k, forced: contractSectionTitle(cleanContractName(k)) });
      else if (contents.indexOf(k) >= 0) body.push({ node: k });
    }
    const slotChildren = [];
    const nameOf = (b) => b.forced || cleanContractName(b.node);
    const emitItem = (b, d) => {
      if (b.forced) {
        const cn = makeNode(b.node, d, b.forced, roleOfName(b.forced));
        if (cn) { cn.data = { kind: "label" }; slots++; slotChildren.push(cn); }
      } else {
        const cn = makeNode(b.node, d);
        if (cn) slotChildren.push(cn);
      }
    };
    const anchors = [];
    body.forEach((b, i) => { if (/^section-title(?:-|$)/i.test(nameOf(b))) anchors.push(i); });
    const realGroups = body.filter(b =>
      /^(item|card|list|form|section|graphic)-/i.test(cleanContractName(b.node)) &&
      visibleChildren(b.node).some(c => isSectionTitle(c)));
    let realSections = 0;
    for (const sl of slotCons)
      for (const c of visibleChildren(sl)) {
        const cnm = cleanContractName(c);
        if (/^section-(?:\d{2}-)?/i.test(cnm) && !/^section-title(?:-|$)/i.test(cnm)) realSections++;
      }
    sections = realSections > 0 ? realSections
      : ((anchors.length >= 2 && !realGroups.length) ? anchors.length : realGroups.length);
    if (anchors.length < 2 || realGroups.length) {
      for (const b of body) emitItem(b, 2);
    } else {
      let cur = -1;
      for (let i = 0; i < body.length; i++) {
        if (anchors.indexOf(i) >= 0) { cur++; const sg = makeNode(body[i].node, 2, sectionGroupName(nameOf(body[i])), "section"); if (sg) slotChildren.push(sg); }
        emitItem(body[i], cur >= 0 ? 3 : 2);
      }
    }
    for (const s of slotCons) {
      const cn = makeNode(s, 2);
      if (cn && cn.children) slotChildren.push(...cn.children);
    }
    const slotCon = { name: "slot-con", role: "slot-con", type: "GROUP" };
    Object.assign(slotCon, nodeGeom(root));
    if (includeIds) { const id = newId(root); if (id) slotCon.id = id + "-slotcon"; }
    slotCon.children = slotChildren;
    rootNode.children = [];
    if (headerArr.length) rootNode.children.push(...headerArr);
    if (bgArr.length) rootNode.children.push(...bgArr);
    rootNode.children.push(slotCon);
  }
  let quality = -1;
  try { quality = collectQualityMetrics(root).score; } catch (e) {}
  // v20261114 L0：AL 只读自检随 JSON 一起本地输出（纯新增字段；includeAutoLayout:false 可关）。
  // 不写任何 Figma 属性、不连生成管线；下载 / clientStorage 通道天然带出。
  let autoLayout = null;
  if (o.includeAutoLayout !== false) {
    try { autoLayout = inspectAutoLayout(root); } catch (e) { autoLayout = null; }
  }
  return {
    schemaVersion: version,
    namingConvention: namingConvention,
    componentName: deriveComponentName(root, namingConvention),
    rootId: newId(root),
    rootName: String(root.name || ""),
    root: rootNode,
    stats: { nodes: count, sections: sections, loops: loops, slots: slots, truncated: truncated },
    quality: quality,
    autoLayout: autoLayout,
  };
}

// scanTree：轻量全树扫描（层级 + 文本 + 填充类型），供 AI 整理文件使用
async function scanTree(params) {
  const { nodeId, maxDepth = 99, includeInvisible = false } = params || {};
  const root = await figma.getNodeByIdAsync(nodeId);
  if (!root) throw new Error(`Node not found: ${nodeId}`);

  const out = [];
  let count = 0;

  function fillTypes(n) {
    try {
      const kinds = [];
      if (Array.isArray(n.fills)) {
        for (const f of n.fills) {
          if (f && f.visible !== false) kinds.push(f.type);
        }
      } else if (n.fills && n.fills.visible !== false && n.fills.type) {
        kinds.push(n.fills.type);
      }
      return kinds.join(",");
    } catch (e) { return ""; }
  }

  function walk(node, parentId, idx, depth, ancestors) {
    if (count >= 5000) return;
    if (!includeInvisible && node.visible === false) return;
    count++;
    const entry = {
      id: node.id,
      p: parentId,
      i: idx,
      t: node.type,
      n: node.name,
      x: Math.round((node.x || 0) * 10) / 10,
      y: Math.round((node.y || 0) * 10) / 10,
      w: Math.round((node.width || 0) * 10) / 10,
      h: Math.round((node.height || 0) * 10) / 10,
    };
    if (depth === 0) entry.root = true;
    if (node.type === "TEXT") entry.c = String(node.characters || "").slice(0, 40);
    const ft = fillTypes(node);
    if (ft) entry.f = ft;
    if (typeof node.fontSize === "number") entry.fs = node.fontSize;
    // v20261111.59：ELLIPSE 的 arcData（innerRadius / 起止角）是识别环形/扇形图的
    // 决定性几何信号。旧版只给 type/bbox/fills，AI 看到的是「N 个重叠实心圆」，
    // 于是把真环形图按「静态仪表盘」判成 graphic-*（53:34075 实测 4 段）。
    // 字段名压缩到 arc/sk/sw，单个节点只多十几个字节，不影响分片预算。
    if (node.type === "ELLIPSE" || node.type === "VECTOR") {
      try {
        const a = node.arcData;
        if (a) entry.arc = [
          Math.round((Number(a.innerRadius) || 0) * 100) / 100,
          Math.round((Number(a.startingAngle) || 0) * 100) / 100,
          Math.round((Number(a.endingAngle) || 0) * 100) / 100,
        ];
      } catch (e) {}
      try { if (Array.isArray(node.strokes) && node.strokes.length) entry.sk = node.strokes.length; } catch (e) {}
      try { if (typeof node.strokeWeight === "number" && node.strokeWeight > 0) entry.sw = Math.round(node.strokeWeight * 10) / 10; } catch (e) {}
    }
    // v20261111.60：VECTOR 的路径特征（5:35420 折线漏识别的根因）。
    // 只传压缩后的 [命令数, 曲线段数, 是否闭合]，绝不传完整 path data（会爆 token）。
    if (node.type === "VECTOR" || node.type === "LINE" || node.type === "BOOLEAN_OPERATION") {
      try {
        const st = vectorCurveStats(node);
        if (st.cmds) entry.vp = [st.cmds, st.curves, st.closed ? 1 : 0];
      } catch (e) {}
    }
    // 祖先名称链（根 > 分区 > ... > 父级），供 AI 分段整理时保留上下文
    if (ancestors.length) entry.path = ancestors.join(" > ");
    out.push(entry);
    if ("children" in node && depth < maxDepth) {
      const childAncestors = ancestors.concat(node.name);
      let i = 0;
      for (const child of node.children) walk(child, node.id, i++, depth + 1, childAncestors);
    }
  }

  walk(root, null, 0, 0, []);
  return { success: true, total: out.length, rootId: root.id, nodes: out };
}
