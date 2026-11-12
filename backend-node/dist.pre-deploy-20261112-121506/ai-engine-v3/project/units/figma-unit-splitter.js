"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readProjectFigmaUrl = readProjectFigmaUrl;
exports.figmaLinkAbsenceNote = figmaLinkAbsenceNote;
exports.splitFigmaUnits = splitFigmaUnits;
const figma_url_parser_js_1 = require("../../../ai-engine/utils/figma-url-parser.js");
const page_decomposer_js_1 = require("../../../ai-engine/utils/page-decomposer.js");
const unit_contract_1 = require("./unit-contract");
const unit_naming_1 = require("./unit-naming");
function readProjectFigmaUrl(s0) {
    const content = s0?.projectJson?.content;
    const links = content && !content.__parseError && content.links;
    const figma = links && links.figma;
    return typeof figma === 'string' && figma.trim() ? figma.trim() : null;
}
function figmaLinkAbsenceNote(s0) {
    const content = s0?.projectJson?.content;
    const err = content && content.__parseError;
    if (err) {
        return `项目清单（mvgo.project.json）解析失败：${String(err).slice(0, 200)}`;
    }
    return '';
}
function idSlug(nodeId) {
    return (0, unit_naming_1.slug)(String(nodeId || '').replace(/[:;]/g, '-'));
}
function emptyContract(runId, builtAt, degraded, source, features) {
    return {
        version: unit_contract_1.UNIT_CONTRACT_VERSION,
        runId,
        builtAt,
        source,
        degraded,
        units: [],
        stats: (0, unit_contract_1.computeUnitStats)([], features),
    };
}
async function splitFigmaUnits(params, deps) {
    const runId = String(params?.runId || '');
    const builtAt = params.builtAt || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const features = Array.isArray(params?.features) ? params.features : [];
    const figmaUrl = params?.figmaUrl ? String(params.figmaUrl).trim() : '';
    const inputKey = params?.inputKey ? String(params.inputKey) : '';
    const source = {
        kind: 'figma',
        figmaUrl: figmaUrl || null,
        figmaFileKey: null,
        figmaNodeId: null,
        inputKey,
    };
    const log = (extra) => {
        try {
            params.onLog?.({ runId, ...extra });
        }
        catch {
        }
    };
    if (!figmaUrl) {
        const note = String(params?.figmaUrlAbsenceNote ?? '').trim();
        const degraded = {
            code: unit_contract_1.DEGRADED_NO_FIGMA_LINK,
            message: note ? `取不到画板链接：${note}` : '项目未声明 links.figma，无画板可拆',
        };
        log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
        return emptyContract(runId, builtAt, degraded, { ...source, kind: 'none' }, features);
    }
    let parsed = null;
    try {
        parsed = (0, figma_url_parser_js_1.parseFigmaUrl)(figmaUrl);
    }
    catch (err) {
        const degraded = {
            code: unit_contract_1.DEGRADED_BAD_FIGMA_URL,
            message: `Figma 链接无法解析 fileKey/nodeId：${String(err?.message ?? err).slice(0, 200)}`,
        };
        log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
        return emptyContract(runId, builtAt, degraded, source, features);
    }
    source.figmaFileKey = parsed?.fileKey || null;
    source.figmaNodeId = parsed?.nodeId || null;
    if (!source.figmaFileKey || !source.figmaNodeId) {
        const degraded = {
            code: unit_contract_1.DEGRADED_BAD_FIGMA_URL,
            message: `Figma 链接缺少 ${!source.figmaFileKey ? 'fileKey' : 'nodeId'}`,
        };
        log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
        return emptyContract(runId, builtAt, degraded, source, features);
    }
    if (params?.tokenAvailable === false) {
        const degraded = {
            code: unit_contract_1.DEGRADED_NO_FIGMA_TOKEN,
            message: '未配置 Figma Token（用户配置或 FIGMA_ACCESS_TOKEN），无法读取画板节点树',
        };
        log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
        return emptyContract(runId, builtAt, degraded, source, features);
    }
    let tree = null;
    try {
        tree = await deps.getNode(source.figmaFileKey, source.figmaNodeId);
    }
    catch (err) {
        const degraded = {
            code: unit_contract_1.DEGRADED_FIGMA_FETCH_FAILED,
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
    const cps = (0, page_decomposer_js_1.findCpComponents)(tree) || [];
    if (!cps.length) {
        const degraded = {
            code: unit_contract_1.DEGRADED_NO_CP_COMPONENT,
            message: `画板内未发现 \`cp-\` 前缀节点（root=${source.figmaNodeId}），无法按约定拆单元`,
        };
        log({ stage: 'figma-units', mode: 'degraded', ...degraded, units: 0 });
        return emptyContract(runId, builtAt, degraded, source, features);
    }
    const used = new Set();
    const units = [];
    let dropped = 0;
    for (const c of cps) {
        const figmaNodeId = c?.figmaNodeId ? String(c.figmaNodeId) : '';
        if (!figmaNodeId) {
            dropped += 1;
            continue;
        }
        const folderName = String(c?.folderName || '');
        const base = idSlug(figmaNodeId);
        let componentId = `u-figma-${base}`;
        for (let i = 2; used.has(componentId); i += 1)
            componentId = `u-figma-${base}-${i}`;
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
            tier: (0, unit_contract_1.deriveUnitTier)('figma'),
            status: 'pending',
            feature: (0, unit_naming_1.attributeFeature)(name, folderName, features),
            note: `cp 前缀命中：${String(c?.figmaNodeName || folderName)}`,
        });
    }
    units.sort((a, b) => (a.componentId < b.componentId ? -1 : a.componentId > b.componentId ? 1 : 0));
    const stats = (0, unit_contract_1.computeUnitStats)(units, features);
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
        version: unit_contract_1.UNIT_CONTRACT_VERSION,
        runId,
        builtAt,
        source,
        degraded: null,
        units,
        stats,
    };
}
//# sourceMappingURL=figma-unit-splitter.js.map