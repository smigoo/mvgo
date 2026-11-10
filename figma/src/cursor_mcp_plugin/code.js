// mv-figma 文件自动整理插件
// 仅保留「AI 自动扫描图层 + 批量规范重命名」所需逻辑，去除通用 MCP 命令库与统计上报。

const state = { serverPort: 3055 };

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
let lastNonEmptySelection = [];
function broadcastSelection() {
  const live = figma.currentPage.selection;
  if (live && live.length > 0) lastNonEmptySelection = live;
  const sel = live && live.length ? live : lastNonEmptySelection;
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

// 启动：恢复本地服务端口 + 广播一次当前选区
(async () => {
  try {
    const p = await figma.clientStorage.getAsync("serverPort");
    if (p) state.serverPort = p;
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
      break;
    case "clear-cache":
      // 插件关闭时清空 transient 缓存（选区回退缓存）；AI 配置(clientStorage)属「设置」保留不清除
      lastNonEmptySelection = [];
      break;
    case "save-server-port":
      state.serverPort = msg.port || 3055;
      figma.clientStorage.setAsync("serverPort", state.serverPort).catch(() => {});
      break;
    case "ai-organize": {
      try {
        const TYPE_CN = { RECTANGLE: "矩形", TEXT: "文本", ELLIPSE: "椭圆", VECTOR: "矢量图形", LINE: "线条" };
        let sel = figma.currentPage.selection;
        if (!sel || sel.length === 0) sel = lastNonEmptySelection;
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
        progress("scan", 5, "正在扫描图层树...");
        const scanResult = await scanTree({ nodeId: root.id });

        // 1.5 收集隐藏节点（visible===false），整理时一并删除（用户要求清理所有隐藏节点）
        const hiddenNodeIds = await collectHidden(root);

        // 2. 读取 AI 配置（fetch 在 UI iframe 发，这里只回传配置）
        const cfg = await figma.clientStorage.getAsync("aiConfig");
        if (!cfg || !cfg.baseUrl || !cfg.apiKey || !cfg.model) {
          figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: "请先在「AI 设置」中填写接口地址、API Key 和模型名" });
          break;
        }

        // 3. 视觉模式：导出渲染图（需网关有可用视觉模型），随报告给 UI
        let imageData = null;
        const useVision = !!msg.useVision && !!cfg.visionModel;
        if (useVision) {
          try {
            progress("scan", 12, "正在导出渲染图...");
            imageData = await exportFramePng(root);
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
        if (!sel || sel.length === 0) sel = lastNonEmptySelection;
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
        if (!sel || sel.length === 0) sel = lastNonEmptySelection;
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
          rootName: String(root.name || ""), fileKey: fileKey, nodeId: nodeId, figmaUrl: figmaUrl,
        });
      } catch (error) {
        figma.ui.postMessage({ type: "structure-contract", ok: false, error: error.message });
      }
      break;
    }
    case "structure-only": {
      // 零 token 结构化整理：完全不调用 LLM，只跑确定性后处理。
      // 纯几何行聚类建业务容器 → 背景收纳 / y 排序 → 资源导出预设。
      // 目的：先把图层变成「大模型一眼能看出组件边界」的结构；语义命名仍由后续 AI 整理补上。
      try {
        resetGroupDiag(); resetStructLog();
        let sel = figma.currentPage.selection;
        if (!sel || sel.length === 0) sel = lastNonEmptySelection;
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
          moduleExcluded: 0,
          chartNormalized: 0, chartAtFixed: 0,
          graphicFolders: 0, graphicMerged: 0,           graphicOutside: 0, graphicFailed: 0,
          graphicRunFolders: 0, graphicRunMerged: 0, graphicRunFailed: 0,
          slotConCreated: 0, slotConReused: 0, slotConMerged: 0, slotConModules: 0,
          slotConOutside: 0, slotConFailed: 0,
          subHeadersDemoted: 0, subSlotConsDemoted: 0,
          slotSorted: 0, slotSortPinned: 0, slotConEmptyRemoved: 0,
          sectionGroupsCreated: 0, sectionGroupsMerged: 0, sectionGroupsPinned: 0,
          sectionContainersRenamed: 0, sectionGroupFailed: 0,
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
        try { organizeGraphicContainers(root, summary); } catch (e7) { summary.graphicFailed++; }
        // v20261110.18：普通业务容器里的连续零散图形（Ellipse / bg-*）按段合并，z 序等价。
        try { mergeLooseGraphicRuns(containers, summary); } catch (e8) { summary.graphicRunFailed++; }
        summary.containers = containers.length;
        for (const container of containers) {
          try { organizeLayout(container, summary, intentCtx); }
          catch (e3) { summary.layoutErrors++; summary.layoutErrorMsg = String((e3 && e3.message) || e3).slice(0, 200); }
        }
        // v20261110.24：先归一化根级骨架命名（唯一 header / 唯一 slot-con），再建组。
        try { demoteSubHeaders(root || containers[0] || null, summary); } catch (e10) {}
        // v20261110.26：按副标题把内容切成子模块 Group，再统一收进 slot-con。
        try { groupSectionsByTitle(root || containers[0] || null, summary); } catch (e12) {}
        // v20261110.21：收尾建组件骨架 —— 根下 header/bg 保持平级，其余内容（含所有模块 Group）收进一个真 slot-con Group。
        try { createSlotConGroup(root || containers[0] || null, summary); } catch (e9) { summary.slotConFailed++; }
        // v20261110.25：建组后按视觉顺序重排槽内直接子级（重叠节点 pin 住不动）。
        try { sortSlotConChildren(root || containers[0] || null, summary); } catch (e11) {}
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
          total, renamed: 0, reparented: 0, reordered: 0, grouped: 0, deleted: 0,
          decorMerged: summary.decorMerged, sorted: summary.sorted,
          skippedOverlap: summary.skippedOverlap, conflict: 0, doubleConfirmed: 0,
          intentShared: 0, orderMismatch: 0,
          exportSet: summary.exportSet, exportCleared: summary.exportCleared, exportLoose: summary.exportLoose,
          foregroundKept: summary.foregroundKept, forcedBg: summary.forcedBg,
          groupFailed: summary.groupFailed, singleDecor: summary.singleDecor,
          unlocked: summary.unlocked, prefixFixed: summary.prefixFixed,
          moduleGroups: 0, moduleSkipped: 0, moduleGroupFailed: 0,
          containers: summary.containers, layoutErrors: summary.layoutErrors,
          groupModulesOn: groupModules, intentModuleCount: 0, moduleExpanded: 0,
          geometricGroups: summary.geometricGroups, geoCandidates: summary.geoCandidates,
          geoRows: summary.geoRows, geoSpanKept: summary.geoSpanKept,
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
          structurePlanText: planPreview ? planPreview.text : "",
          layoutErrorMsg: summary.layoutErrorMsg, failed: 0, opsCount: 0,
          qualityBefore: qualityBefore, qualityAfter: qualityAfter,
          qualityText: qualityDiffText(qualityBefore, qualityAfter),
        });
      } catch (error) {
        figma.ui.postMessage({ type: "ai-organize-result", ok: false, error: error.message });
      }
      break;
    }
    case "apply-ai-ops": {
      // 执行 AI 返回的重组方案：rename / reparent / reorder / group / delete
      try {
        resetGroupDiag(); resetStructLog();
        // v20261110.15：planPreview 必须声明在外层作用域。
        // .12 曾把它声明在「P0-a 后处理」的内层 try 里，结果消息在外层引用 ⇒ ReferenceError
        // 'planPreview' is not defined（整理其实已执行完，只是回报失败）。node --check 查不出这种错误。
        let planPreview = null;
        // v20261110.15 教训：内层 try 算出的值外层要用，必须在外层先声明。
        let qualityBefore = null, qualityAfter = null;
        const ops = Array.isArray(msg.ops) ? msg.ops : [];
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
          moduleExcluded: 0,
          chartNormalized: 0, chartAtFixed: 0,
          graphicFolders: 0, graphicMerged: 0,           graphicOutside: 0, graphicFailed: 0,
          graphicRunFolders: 0, graphicRunMerged: 0, graphicRunFailed: 0,
          slotConCreated: 0, slotConReused: 0, slotConMerged: 0, slotConModules: 0,
          slotConOutside: 0, slotConFailed: 0,
          subHeadersDemoted: 0, subSlotConsDemoted: 0,
          slotSorted: 0, slotSortPinned: 0, slotConEmptyRemoved: 0,
          sectionGroupsCreated: 0, sectionGroupsMerged: 0, sectionGroupsPinned: 0,
          sectionContainersRenamed: 0, sectionGroupFailed: 0,
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
          try { organizeGraphicContainers(root || containers[0] || null, summary); } catch (e7) { summary.graphicFailed++; }
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
          // v20261110.24：先归一化根级骨架命名（唯一 header / 唯一 slot-con），再建组。
          try { demoteSubHeaders(root || containers[0] || null, summary); } catch (e10) {}
          // v20261110.26：按副标题把内容切成子模块 Group，再统一收进 slot-con。
          try { groupSectionsByTitle(root || containers[0] || null, summary); } catch (e12) {}
          // v20261110.21：收尾建组件骨架 —— 视觉/几何模块与其它内容统一收进一个真 slot-con Group。
          try { createSlotConGroup(root || containers[0] || null, summary); } catch (e9) { summary.slotConFailed++; }
          // v20261110.25：建组后按视觉顺序重排槽内直接子级（重叠节点 pin 住不动）。
          try { sortSlotConChildren(root || containers[0] || null, summary); } catch (e11) {}
          // 收尾：给所有资源文件夹挂导出预设（icon→SVG / img·bg→PNG@2x），并清掉内部子节点的导出项。
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
          skippedOverlap: summary.skippedOverlap,
          conflict: summary.conflict,
          doubleConfirmed: summary.doubleConfirmed,
          intentShared: summary.intentShared,
          orderMismatch: summary.orderMismatch,
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
          structurePlanText: planPreview ? planPreview.text : "",
          layoutErrorMsg: summary.layoutErrorMsg,
          qualityBefore: qualityBefore, qualityAfter: qualityAfter,
          qualityText: qualityDiffText(qualityBefore, qualityAfter),
          failed: fail,
          opsCount: ops.length,
        });
      } catch (error) {
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
          useVision: !!msg.useVision,
          useLayoutIntent: msg.autoLayoutIntent !== false, // 兼容旧读取路径，值与新键同步
          autoLayoutIntent: msg.autoLayoutIntent !== false, // v20261110.14 新键：旧配置无此键 → 默认开启
          setExport: msg.setExport !== false,
          autoModuleGroups: !!msg.groupModules, // v20261110.8 新键：旧配置无此键 → 默认开启
          disableThinking: !!msg.disableThinking,
          namingRef: msg.namingRef || "",
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

// ---- 结构方案（v20261110.12 / C 双轨）------------------------------------------
// collectGeometryRows 只做计算、不碰任何节点：方案预览与实际执行共用同一套聚类结果，
// 保证「先输出方案、再按方案整理」不是两套逻辑各说各话。
function collectGeometryRows(root) {
  const info = { rows: [], shared: [], candidates: 0, rowCount: 0, targets: 0, excluded: 0 };
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
    const hs = raw.map(n => n.height || 0).slice().sort((a, b) => a - b);
    const medianH = hs[Math.floor(hs.length / 2)] || 1;
    const spatial = [], spanning = [];
    for (const n of raw) {
      const h = n.height || 0;
      // 高度 > 中位 3 倍且占容器过半 → 跨行共享层，留在父级，不参与切分
      if (h > medianH * 3 && h > H * 0.5) spanning.push(n);
      else spatial.push(n);
    }
    for (const s of spanning) info.shared.push({ node: s, parentName: String(container.name || "") });
    // 第二层：内容型节点判据，把 header / 默认名背景 / 铺满父级大图形挡在业务容器外
    const rowKids = spatial.filter((n) => isContentCandidate(n, container));
    info.excluded += all.length - rowKids.length - spanning.length;
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
      seq++;
      const slug = rowSlug(members) || moduleSlug(container.name) || "row";
      info.rows.push({
        container, containerName: String(container.name || ""),
        members, slug, seq, name: "item-" + slug + "-" + seq,
      });
    }
  }
  return info;
}

async function groupRowsByGeometry(root, summary) {
  const info = collectGeometryRows(root);
  summary.geoSpanKept += info.shared.length;
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
    const name = "item-" + moduleSlug(m.name) + order;
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
      const name = "item-" + moduleSlug(m.name) + (order !== "" ? "-" + order : "");
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
function chartSlug(name) {
  const m = /^(?:echarts-|@echarts\/|chart-|gauge-)(.+)$/i.exec(String(name || ""));
  return moduleSlug(m ? m[1] : name) || "graphic";
}
// 真图表判据：模型已显式写 @echarts/ → 尊重；否则看是否还有坐标轴/图例/系列语义层级。
// 只看结构不看「长得像不像仪表」，避免把静态矢量仪表盘误升格成 ECharts 组件。
function hasChartSemantics(container) {
  if (/^@echarts\//i.test(String(container.name || ""))) return true;
  let axisLike = 0;
  const walk = (n, d) => {
    if (!n || d > 5) return;
    if (/\b(?:axis|legend|series|grid|tooltip)\b/i.test(String(n.name || ""))) axisLike++;
    if ("children" in n && d < 5) for (const c of n.children) walk(c, d + 1);
  };
  walk(container, 0);
  return axisLike > 0;
}
function normalizeChartName(container, summary) {
  const nm = String(container.name || "");
  if (/^@/.test(nm)) return;                              // @echarts/ @antd/ 已合规，尊重模型判断
  if (!/^(?:echarts-|chart-|gauge-)/i.test(nm)) return;  // 已是 graphic-*/item-* 等语义名 → 不重复处理
  const slug = chartSlug(nm);
  try {
    if (hasChartSemantics(container)) { container.name = "@echarts/" + slug; summary.chartAtFixed++; }
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
      if (!already && graphic.length >= 2) {
        for (const n of graphic) { try { if (n.locked) { n.locked = false; summary.unlocked++; } } catch (e) {} }
        const minIdx = Math.min.apply(null, graphic.map(n => kids.indexOf(n)));
        const grp = createFolder(ctn, graphic, "img");
        if (grp) {
          try { grp.name = "img-" + slug; } catch (e) {}
          try { ctn.insertChild(Math.max(0, Math.min(minIdx, ctn.children.length - 1)), grp); } catch (e) {}
          summary.graphicFolders++;
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
const SEMANTIC_PREFIX = /^(cp-|card-|list-|item-|section-|graphic-|form-|img-|icon-|echarts-|@|header|slot-|chart-|legend|axis|label|value)/i;
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

// 几何判据：语义前缀白名单 + 含 TEXT 后代 = 内容，绝不收纳（防误伤业务容器）。
function isDecoration(n, parent, ctx) {
  if (!n || n.type === "TEXT") return false;
  const nm = n.name || "";
  if (folderRole(n)) return false;            // 插件自建的文件夹：跳过，避免嵌套
  if (/^bg-/.test(nm)) return true;                         // 模型已明确标注的装饰：正信号
  if (SEMANTIC_PREFIX.test(nm)) return false;
  if (hasTextDescendant(n)) return false;
  const t = n.type;
  if (t === "VECTOR" || t === "BOOLEAN_OPERATION" || t === "LINE" || t === "STAR" || t === "POLYGON") return true;
  const pw = parent.width || 0, ph = parent.height || 0;
  if (GRAPHIC_TYPES[t]) {
    if (pw > 0 && ph > 0 && ((n.width || 0) >= pw * 0.8 || (n.height || 0) >= ph * 0.8)) return true;
    if (fillHas(n, /IMAGE|GRADIENT/) && childCount(n) <= 2) return true;
    if (childCount(n) === 0 && ctx.total > 0 && ctx.index <= ctx.total * 0.3) return true;
    if ((t === "FRAME" || t === "GROUP" || t === "INSTANCE") && isPureGraphicGroup(n)) return true;
  }
  return false;
}

// organizeLayout：对单个容器做「装饰收纳 + 分层 + 从上到下排序」。
// 交叉验证：视觉意图只作加权/否决，不产生任何结构变更；几何为默认兜底。
function organizeLayout(parent, summary, intentCtx) {
  if (!parent || !("children" in parent)) return;
  if (folderRole(parent)) return; // 已是插件建的文件夹，避免嵌套
  // v20261110.16：图表/矢量仪表容器已由 organizeGraphicContainers 统一合并成 img-* 资源文件夹，
  // 这里必须整体跳过，否则通用装饰收纳会把已建好的组再拆一遍、排序 appendChild 会拉出组内节点。
  if (isGraphicContainer(parent)) return;
  // v20261110.21：slot-con 是整块内容区，内部模块位置已定；跳过可避免排序/装饰收纳把模块拉出组，
  // 也保证重复整理幂等。
  if (isSlotContainer(parent)) return;
  // 祖先链上已有文件夹 → 说明该容器已被收纳到 bg/img/icon 里，不再向内建组
  let anc = parent.parent, hops = 0;
  while (anc && hops++ < 20) {
    if (folderRole(anc)) return;
    anc = anc.parent;
  }
  const kids = Array.prototype.slice.call(parent.children || []);
  if (kids.length < 2) return;
  const ctx = intentCtx || { intentMap: new Map(), moduleOrder: new Map(), sharedIds: new Set(), useLayoutIntent: false };

  const decor = [], content = [];
  kids.forEach((n, i) => {
    const intent = ctx.useLayoutIntent ? ctx.intentMap.get(n.id) : null;
    // 跨模块共享装饰（光柱/光环）：留在共同父级，不按模块切分
    if (ctx.useLayoutIntent && (ctx.sharedIds.has(n.id) || (intent && intent.shared))) {
      summary.intentShared++; content.push(n); return;
    }
    const geo = isDecoration(n, parent, { index: i, total: kids.length });
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
  const contentIdx = content.map((n) => kids.indexOf(n));
  const isForegroundDecor = (n) => {
    const ni = kids.indexOf(n);
    for (let k = 0; k < content.length; k++) {
      if (contentIdx[k] < ni && rectsOverlap(n, content[k])) return true;
    }
    return false;
  };
  const toMerge = [], keepInPlace = [];
  for (const n of decor) {
    // bg- 前缀是模型给出的明确背景信号：优先强制收纳（用户要求「背景全部合成」）。
    if (/^bg-/.test(n.name || "")) {
      if (isForegroundDecor(n)) summary.forcedBg++;
      toMerge.push(n);
    } else if (isForegroundDecor(n)) keepInPlace.push(n);
    else toMerge.push(n);
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
      const minIdx = Math.min.apply(null, toMerge.map(n => kids.indexOf(n)));
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
  const movable = content.filter(n => !pinned.has(n));
  summary.skippedOverlap += pinned.size;
  const ordered = movable.slice().sort((a, b) => (b.y || 0) - (a.y || 0)); // y 降序 → 图层面板从上到下 = 视觉从上到下
  // 视觉给的 order 与 y 序不一致时只记录，仍以真实 y 为准
  if (ctx.useLayoutIntent && ctx.moduleOrder.size) {
    ordered.forEach((n, rank) => {
      const o = ctx.moduleOrder.get(n.id);
      if (Number.isFinite(o) && o !== rank + 1) summary.orderMismatch++;
    });
  }
  for (const n of ordered) { try { parent.appendChild(n); summary.sorted++; } catch (e) {} }
  // 前景装饰（原本盖在内容之上）保持在最上层，且不参与排序，确保遮挡关系不变。
  // 它们在 kids 中的先后即原始相对顺序，按序 append 即可保持彼此层级。
  for (const n of keepInPlace) { try { parent.appendChild(n); } catch (e) {} }
  // 前缀补收放在最后：避免排序阶段的 appendChild 把已入组的 img-/icon- 节点从组里拉出来。
  // 不再依赖 toMerge.length —— 即使本容器没有装饰层，也照常收纳 img-/icon- 资源。
  groupChildrenByCategory(parent, summary);
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

// ---- v20261110.22 P1：整理前后结构质量快照（纯只读）------------------------------
// 目的：把「提高生成质量」变成可度量指标；不写入节点、不影响整理逻辑。
const DEFAULT_NAME_RE = /^(?:Frame|Group|Rectangle|Ellipse|Vector|Line|Star|Polygon|Boolean\s*Operation|Component|Instance|Text|Union|Subtract|Intersect|Exclude|Image)\s*[\d\s._-]*$/i;
const SEMANTIC_NAME_RE = /^(?:cp-|card-|list-|item-|section-|graphic-|form-|img-|icon-|bg-|@echarts\/|@antd\/|header|slot-|chart-|legend|axis|label|value|unit|title|footer)/i;

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
const SCHEMA_VERSION = "20261110.28";

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
  "# 全组件只有一个 slot-con；异构分区用 section-*，容器用 card-*/list-*/form-*，绝不出现第二个 slot-con-*。",
  "# slot-con 下以 section-title-* 为锚点按视觉顺序分成 section-* 子模块；段前/跨段节点直属 slot-con。",
  "# graphic-* 是零散矢量拼成的静态图形容器（内部已合并为 img-* 资源），按图片实现，严禁用图表库重建。",
  "# item- 只用于【带 -N 序号】的同构循环子项：list-*/cards-* 内 item-xxx-1..N 按一份模板 + v-for/map 渲染；",
  "#   契约只展开首项，其余折叠为 [循环 ×N]，绝不生成 N 份重复代码；不带序号的 item- 不是循环项。",
  "# 资源文件夹 bg-*/img-*/icon-* 整体导出；@echarts/* 用图表库实现。",
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
  "# 头部 # @meta 是机器可读摘要；truncated=true 或出现 [省略 N 行] 表示树不完整，勿据此推断缺失模块。",
].join("\n");

function cleanContractName(n) {
  let nm = "";
  try { nm = String((n && n.name) || "").trim(); } catch (e) {}
  nm = nm.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").slice(0, 80);
  return nm || "(unnamed)";
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

function buildStructureContract(root, opts) {
  const o = opts || {};
  const maxNodes = o.maxNodes || 600;
  const maxDepth = o.maxDepth || 12;
  const maxChars = o.maxChars || 18000; // requirementDocText 在 mvgo 侧上限 20000 字
  const raw = !!o.raw; // raw=true：原样镜像图层树（不做骨架归一化），供对照与回归
  const version = String(o.version || SCHEMA_VERSION);
  const includeIds = !!o.includeIds; // v20261110.28 P0-2：默认关，UI 开关显式开启
  const lines = [];
  let count = 0, chars = 0, truncated = false, loops = 0, slots = 0;
  let sections = 0, omitted = 0, omittedDepth = -1;
  const slotBudget = { left: 3000 }; // 摘要总预算：超出后只留 [data:xxx] 标签

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
    const groups = findLoopGroups(kids);
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
    const slot = describeDataSlot(n, slotBudget);
    if (slot) slots++;
    push(cleanContractName(n) + slot, depth, n);
    emitChildren(n, depth + 1);
  }

  // 组件根级骨架：cp- 根 → header / bg / slot-con 三段；header 内标注插槽。
  function walkSkeleton(rootNode) {
    push(cpComponentName(rootNode), 0, rootNode);
    const kids = visibleChildren(rootNode);
    // v20261110.24：只读导出也要归一化 —— 未整理的文件常有多个 header-* / slot-con-*，
    // 契约里只能有一个根 header；其余副标题按 section-title-* 输出在 slot-con 内。
    const allHeaders = kids.filter(isHeaderNode);
    const rootHeader = pickRootHeader(allHeaders, rootNode);
    const headers = rootHeader ? [rootHeader] : [];
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
      if (k === rootHeader || isBgNode(k) || isSlotConNode(k)) continue;
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
      // v20261110.28 P1-1：分区数进 @meta，供管线做生成后计数校验。
      sections = (anchors.length >= 2 && !realGroups.length) ? anchors.length : realGroups.length;
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
