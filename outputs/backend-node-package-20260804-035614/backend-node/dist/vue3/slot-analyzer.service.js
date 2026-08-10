"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SlotAnalyzerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlotAnalyzerService = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const fs_1 = require("fs");
const workspace_config_1 = require("../config/workspace.config");
let SlotAnalyzerService = SlotAnalyzerService_1 = class SlotAnalyzerService {
    logger = new common_1.Logger(SlotAnalyzerService_1.name);
    async analyzeSlots(componentId, groupId) {
        const sfcContent = this.readSFC(componentId, groupId);
        const parts = this.parseSfcParts(sfcContent);
        const refComments = this.extractRefComments(parts.script);
        const rawSlots = [];
        let slotNum = 0;
        slotNum = this.analyzeTemplateSlots(parts.template, parts.templateStartLine, refComments, rawSlots, slotNum);
        slotNum = this.analyzeEChartsSlots(parts, refComments, rawSlots, slotNum);
        slotNum = this.analyzeScriptDataSlots(parts.script, parts.scriptStartLine, refComments, rawSlots, slotNum);
        const filtered = rawSlots.filter((s) => !['container', 'wrapper', 'root', 'body', 'header', 'footer'].includes(s.refName.toLowerCase()));
        this.logger.log(`[SlotAnalyzer] 组件 ${componentId} 分析完成，发现 ${filtered.length} 个数据槽`);
        return { slots: filtered };
    }
    parseSfcParts(sfcContent) {
        const templateMatch = sfcContent.match(/<template[^>]*>([\s\S]*?)<\/template>/);
        const scriptMatch = sfcContent.match(/<script[^>]*>([\s\S]*?)<\/script>/);
        return {
            template: templateMatch ? templateMatch[1] : sfcContent,
            script: scriptMatch ? scriptMatch[1] : '',
            templateStartLine: templateMatch && templateMatch.index !== undefined
                ? sfcContent.substring(0, templateMatch.index).split('\n').length
                : 1,
            scriptStartLine: scriptMatch && scriptMatch.index !== undefined
                ? sfcContent.substring(0, scriptMatch.index).split('\n').length
                : 1,
        };
    }
    analyzeTemplateSlots(template, templateStartLine, refComments, rawSlots, slotNum) {
        const lines = template.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = templateStartLine + i;
            const context = this.getTemplateContext(lines, i);
            const vForMatch = line.match(/v-for="[^"]*?\bin\b\s+([\w.]+)"/);
            if (vForMatch && !this.isAlreadyAdded(rawSlots, vForMatch[1])) {
                const refName = vForMatch[1];
                const isTabs = this.isTabsLike(refName, context);
                rawSlots.push({
                    slotId: `slot-${++slotNum}`,
                    slotType: isTabs ? 'select' : 'list',
                    role: isTabs ? 'filter.tabs' : 'list.items',
                    label: refComments.get(refName) || this.inferLabel(refName, isTabs ? 'select' : 'list'),
                    refName,
                    sourceLine: lineNum,
                    sourceContext: line.trim().substring(0, 120),
                    sourceKind: 'template',
                    confidence: isTabs ? 'high' : 'medium',
                    reason: isTabs
                        ? '检测到 v-for 位于 Tab/筛选上下文，按筛选维度识别'
                        : '检测到模板 v-for 列表渲染',
                    bindable: !isTabs,
                });
            }
            const dsMatch = line.match(/:data-?source="([\w.]+)"/i);
            if (dsMatch && !this.isAlreadyAdded(rawSlots, dsMatch[1])) {
                rawSlots.push({
                    slotId: `slot-${++slotNum}`,
                    slotType: 'table',
                    role: 'table.rows',
                    label: refComments.get(dsMatch[1]) || this.inferLabel(dsMatch[1], 'table'),
                    refName: dsMatch[1],
                    sourceLine: lineNum,
                    sourceContext: line.trim().substring(0, 120),
                    sourceKind: 'template',
                    confidence: 'high',
                    reason: '检测到表格 dataSource 数据绑定',
                    bindable: true,
                });
            }
            const colMatch = line.match(/:columns="([\w.]+)"/);
            if (colMatch && !this.isAlreadyAdded(rawSlots, colMatch[1])) {
                rawSlots.push({
                    slotId: `slot-${++slotNum}`,
                    slotType: 'table',
                    role: 'table.columns',
                    label: refComments.get(colMatch[1]) || this.inferLabel(colMatch[1], 'table'),
                    refName: colMatch[1],
                    sourceLine: lineNum,
                    sourceContext: line.trim().substring(0, 120),
                    sourceKind: 'template',
                    confidence: 'medium',
                    reason: '检测到表格 columns 配置绑定',
                    bindable: false,
                });
            }
            const optMatch = line.match(/:options="([\w.]+)"/);
            if (optMatch && !this.isAlreadyAdded(rawSlots, optMatch[1])) {
                rawSlots.push({
                    slotId: `slot-${++slotNum}`,
                    slotType: 'select',
                    role: 'filter.options',
                    label: refComments.get(optMatch[1]) || this.inferLabel(optMatch[1], 'select'),
                    refName: optMatch[1],
                    sourceLine: lineNum,
                    sourceContext: line.trim().substring(0, 120),
                    sourceKind: 'template',
                    confidence: 'high',
                    reason: '检测到 options 选项绑定',
                    bindable: true,
                });
            }
            const chartMatch = line.match(/:option="([\w.]+)"|setOption\(([\w.]+)\)/);
            if (chartMatch) {
                const refName = chartMatch[1] || chartMatch[2];
                if (refName && !this.isAlreadyAdded(rawSlots, refName)) {
                    rawSlots.push({
                        slotId: `slot-${++slotNum}`,
                        slotType: 'chart',
                        role: 'chart.option',
                        label: refComments.get(refName) || this.inferLabel(refName, 'chart'),
                        refName,
                        sourceLine: lineNum,
                        sourceContext: line.trim().substring(0, 120),
                        sourceKind: 'template',
                        confidence: 'medium',
                        reason: '检测到图表 option 绑定',
                        bindable: true,
                    });
                }
            }
            const statMatch = line.match(/\{\{\s*([\w]+)\.(total|count|num|number|value)\s*\}\}/);
            if (statMatch && !this.isAlreadyAdded(rawSlots, statMatch[1])) {
                rawSlots.push({
                    slotId: `slot-${++slotNum}`,
                    slotType: 'stat',
                    role: 'stat.metric',
                    label: refComments.get(statMatch[1]) || this.inferLabel(statMatch[1], 'stat'),
                    refName: statMatch[1],
                    sourceLine: lineNum,
                    sourceContext: line.trim().substring(0, 120),
                    sourceKind: 'template',
                    confidence: 'high',
                    reason: '检测到统计数值插值',
                    bindable: true,
                });
            }
        }
        return slotNum;
    }
    analyzeEChartsSlots(parts, refComments, rawSlots, slotNum) {
        const script = parts.script;
        if (!/echarts\.init|setOption\(/.test(script))
            return slotNum;
        const chartRefs = this.extractChartRefs(parts.template, script);
        const primaryChartRef = chartRefs[0] || 'chartRef';
        const seriesName = this.firstMatch(script, /name:\s*['"]([^'"]+)['"]/);
        const seriesDataExpr = this.firstMatch(script, /series\s*:\s*\[[\s\S]*?data:\s*([^,\n}\]]+)/);
        const xAxisExpr = this.firstMatch(script, /xAxis\s*:\s*{[\s\S]*?data:\s*(\[[\s\S]*?\]|[\w.]+(?:\(\))?)/);
        const markLineExpr = this.firstMatch(script, /markLine\s*:\s*{[\s\S]*?data:\s*(\[[\s\S]*?\])/);
        const chartType = this.firstMatch(script, /type:\s*['"](line|bar|pie|radar|scatter|area)['"]/);
        const children = [];
        const tabSlot = rawSlots.find((slot) => slot.role === 'filter.tabs');
        if (tabSlot) {
            children.push({
                role: 'filter.tabs',
                refName: tabSlot.refName,
                label: tabSlot.label,
                sourceKind: 'template',
                sourceLine: tabSlot.sourceLine,
                sourceContext: tabSlot.sourceContext,
            });
        }
        if (xAxisExpr) {
            children.push({
                role: 'chart.xAxis',
                refName: this.cleanExpression(xAxisExpr),
                label: '图表 X 轴数据',
                sourceKind: 'echarts',
                sourceLine: this.getLineNumberForMatch(script, parts.scriptStartLine, xAxisExpr),
                sourceContext: `xAxis.data: ${this.cleanExpression(xAxisExpr)}`,
            });
        }
        if (seriesDataExpr) {
            const expr = this.cleanExpression(seriesDataExpr);
            children.push({
                role: 'chart.series',
                refName: expr,
                label: seriesName ? `${seriesName}数据` : '图表系列数据',
                sourceKind: 'echarts',
                sourceLine: this.getLineNumberForMatch(script, parts.scriptStartLine, seriesDataExpr),
                sourceContext: `series.data: ${expr}`,
            });
        }
        if (seriesName) {
            children.push({
                role: 'chart.legend',
                refName: seriesName,
                label: '图表图例/指标名称',
                sourceKind: 'echarts',
                sourceLine: this.getLineNumberForMatch(script, parts.scriptStartLine, seriesName),
                sourceContext: `series.name: ${seriesName}`,
            });
        }
        if (markLineExpr) {
            children.push({
                role: 'chart.threshold',
                refName: 'markLine.data',
                label: '图表阈值/预警线',
                sourceKind: 'echarts',
                sourceLine: this.getLineNumberForMatch(script, parts.scriptStartLine, 'markLine'),
                sourceContext: `markLine.data: ${this.cleanExpression(markLineExpr).substring(0, 80)}`,
            });
        }
        if (!children.length)
            return slotNum;
        const label = this.inferChartLabel(parts.template, seriesName, chartType);
        const refName = this.toSafeIdentifier(primaryChartRef || seriesDataExpr || `chartSlot${slotNum + 1}`);
        if (this.isAlreadyAdded(rawSlots, refName))
            return slotNum;
        rawSlots.push({
            slotId: `slot-${++slotNum}`,
            slotType: 'chart',
            role: 'chart.composite',
            label,
            refName,
            sourceLine: this.getLineNumberForMatch(script, parts.scriptStartLine, 'setOption'),
            sourceContext: `ECharts ${chartType || ''} ${seriesName || ''}`.trim(),
            sourceKind: 'echarts',
            confidence: seriesDataExpr ? 'high' : 'medium',
            reason: `检测到 ECharts setOption，${seriesDataExpr ? `series.data 来自 ${this.cleanExpression(seriesDataExpr)}` : '存在图表配置'}${seriesName ? `，series.name 为 ${seriesName}` : ''}`,
            bindable: true,
            children,
        });
        return slotNum;
    }
    analyzeScriptDataSlots(script, scriptStartLine, refComments, rawSlots, slotNum) {
        const propsMatch = script.match(/defineProps\s*\(\s*{([\s\S]*?)}\s*\)/);
        if (propsMatch) {
            const propPattern = /(?:^|\n)\s*(\w+)\s*:\s*{/g;
            let propMatch;
            while ((propMatch = propPattern.exec(propsMatch[1])) !== null) {
                const refName = propMatch[1];
                if (this.isAlreadyAdded(rawSlots, refName))
                    continue;
                const kind = this.inferSlotKindFromName(refName);
                if (!kind.bindable)
                    continue;
                rawSlots.push({
                    slotId: `slot-${++slotNum}`,
                    slotType: kind.slotType,
                    role: kind.role,
                    label: refComments.get(refName) || this.inferLabel(refName, kind.slotType),
                    refName,
                    sourceLine: this.getLineNumberForMatch(script, scriptStartLine, refName),
                    sourceContext: `defineProps.${refName}`,
                    sourceKind: 'props',
                    confidence: 'medium',
                    reason: '检测到 props 数据入口，可由外部接口数据驱动',
                    bindable: true,
                });
            }
        }
        const fnArrayPattern = /const\s+(get\w*Data|\w+Data)\s*=\s*\([^)]*\)\s*=>\s*\[/g;
        let fnMatch;
        while ((fnMatch = fnArrayPattern.exec(script)) !== null) {
            const refName = fnMatch[1];
            if (this.isAlreadyAdded(rawSlots, refName))
                continue;
            rawSlots.push({
                slotId: `slot-${++slotNum}`,
                slotType: 'chart',
                role: 'chart.series',
                label: refComments.get(refName) || this.inferLabel(refName, 'chart'),
                refName,
                sourceLine: this.getLineNumberForMatch(script, scriptStartLine, refName),
                sourceContext: `${refName}() => [...]`,
                sourceKind: 'script',
                confidence: /series\s*:\s*\[[\s\S]*?data:\s*[^\n]*\b/.test(script) ? 'medium' : 'low',
                reason: '检测到返回数组的数据函数，可能用于图表或列表数据',
                bindable: true,
            });
        }
        return slotNum;
    }
    readSFC(componentId, groupId) {
        const sfcNames = ['package/index.vue'];
        const bases = [
            (0, path_1.join)(process.cwd(), 'workspace'),
            (0, workspace_config_1.resolveFrontendWorkspace)(),
        ];
        if (groupId) {
            for (const base of bases) {
                for (const name of sfcNames) {
                    const p = (0, path_1.join)(base, 'vue3-components', groupId, componentId, name);
                    if ((0, fs_1.existsSync)(p)) {
                        this.logger.debug(`[SlotAnalyzer] 读取 SFC: ${p}`);
                        return (0, fs_1.readFileSync)(p, 'utf-8');
                    }
                }
            }
        }
        for (const base of bases) {
            const vue3Base = (0, path_1.join)(base, 'vue3-components');
            if (!(0, fs_1.existsSync)(vue3Base))
                continue;
            for (const gDir of (0, fs_1.readdirSync)(vue3Base)) {
                const compDir = (0, path_1.join)(vue3Base, gDir, componentId);
                if (!(0, fs_1.existsSync)(compDir) || !(0, fs_1.statSync)(compDir).isDirectory())
                    continue;
                for (const name of sfcNames) {
                    const p = (0, path_1.join)(compDir, name);
                    if ((0, fs_1.existsSync)(p)) {
                        this.logger.debug(`[SlotAnalyzer] 读取 SFC (递归兜底): ${p}`);
                        return (0, fs_1.readFileSync)(p, 'utf-8');
                    }
                }
            }
        }
        throw new common_1.NotFoundException(`组件 SFC 文件未找到: vue3-components/${groupId || '*'}/${componentId} (已尝试 index.vue 与 package/index.vue，及跨 groupId / 跨 workspace 兜底)`);
    }
    isAlreadyAdded(slots, refName) {
        return slots.some((s) => s.refName === refName);
    }
    extractRefComments(script) {
        const comments = new Map();
        const refPattern = /(?:\/\/\s*(.+)|\/\*\s*(.+?)\s*\*\/)\s*\n\s*const\s+(\w+)\s*=\s*ref/g;
        let match;
        while ((match = refPattern.exec(script)) !== null) {
            const comment = (match[1] || match[2] || '').trim();
            if (comment)
                comments.set(match[3], comment);
        }
        return comments;
    }
    getTemplateContext(lines, index) {
        const start = Math.max(0, index - 4);
        const end = Math.min(lines.length, index + 4);
        return lines.slice(start, end).join('\n');
    }
    isTabsLike(refName, context) {
        return /tabs?|tabList|filter|options/i.test(refName) || /tab-|tab_|tab\b|role="tab"|筛选|切换/.test(context);
    }
    extractChartRefs(template, script) {
        const refs = new Set();
        const refPattern = /ref="(\w+)"/g;
        let match;
        while ((match = refPattern.exec(template)) !== null) {
            const refName = match[1];
            if (new RegExp(`echarts\\.init\\(\\s*${refName}\\.value`).test(script)) {
                refs.add(refName);
            }
        }
        return Array.from(refs);
    }
    firstMatch(source, pattern) {
        const match = source.match(pattern);
        return match?.[1]?.trim() || '';
    }
    cleanExpression(expr) {
        return expr.trim().replace(/[,;]$/, '').replace(/\s+/g, ' ');
    }
    getLineNumberForMatch(source, startLine, needle) {
        const index = source.indexOf(needle);
        if (index < 0)
            return startLine;
        return startLine + source.substring(0, index).split('\n').length - 1;
    }
    inferChartLabel(template, seriesName, chartType) {
        const chartTitle = this.firstMatch(template, /(?:chart-title[^>]*>[\s\S]*?<[^>]*>)([^<]+)</);
        const panelTitle = this.firstMatch(template, /(?:header-title|sub-title|title)[^>]*>([^<]+)</);
        if (chartTitle)
            return `${chartTitle}图表`;
        if (panelTitle)
            return `${panelTitle}趋势图`;
        if (seriesName)
            return `${seriesName}图表`;
        return chartType ? `${chartType} 图表数据` : '图表数据';
    }
    inferSlotKindFromName(refName) {
        if (/^(initial|default|visible|isVisible|disabled|readonly|className|style|theme)/i.test(refName)) {
            return { slotType: 'form', role: 'component.config', bindable: false };
        }
        if (/chart|series|trend|hourly|xAxis|yAxis/i.test(refName))
            return { slotType: 'chart', role: 'chart.data', bindable: true };
        if (/table|rows|columns/i.test(refName))
            return { slotType: 'table', role: 'table.rows', bindable: true };
        if (/tabs?|options?|filter|select/i.test(refName))
            return { slotType: 'select', role: 'filter.options', bindable: true };
        if (/list|items|cards/i.test(refName))
            return { slotType: 'list', role: 'list.items', bindable: true };
        return { slotType: 'stat', role: 'stat.group', bindable: true };
    }
    toSafeIdentifier(value) {
        const normalized = value.replace(/[^a-zA-Z0-9_$]/g, '_');
        return /^[a-zA-Z_$]/.test(normalized) ? normalized : `slot_${normalized}`;
    }
    inferLabel(refName, slotType) {
        let name = refName.replace(/^(table|chart|list|form|stat|select)?Data/i, '').replace(/Data$|List$|Options$|Option$|Info$/i, '');
        name = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
        if (!name)
            name = refName;
        const typeLabels = {
            list: '列表数据',
            table: '表格数据',
            chart: '图表数据',
            select: '筛选/选项',
            stat: '统计数据',
            form: '表单数据',
        };
        return `${name} (${typeLabels[slotType] || slotType})`;
    }
};
exports.SlotAnalyzerService = SlotAnalyzerService;
exports.SlotAnalyzerService = SlotAnalyzerService = SlotAnalyzerService_1 = __decorate([
    (0, common_1.Injectable)()
], SlotAnalyzerService);
//# sourceMappingURL=slot-analyzer.service.js.map