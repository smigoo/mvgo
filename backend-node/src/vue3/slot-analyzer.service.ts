import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolveFrontendWorkspace } from '../config/workspace.config';
import { workspaceRoot } from '../config/backend-root';

export interface DataSlotChild {
  role: string;
  refName: string;
  label: string;
  sourceKind: 'template' | 'script' | 'echarts' | 'props' | 'computed';
  sourceLine?: number;
  sourceContext?: string;
}

export interface DataSlot {
  slotId: string;
  slotType: 'table' | 'chart' | 'select' | 'list' | 'stat' | 'form';
  label: string;
  refName: string;
  sourceLine: number;
  sourceContext: string;
  role?: string;
  sourceKind?: 'template' | 'script' | 'echarts' | 'props' | 'computed';
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;
  bindable?: boolean;
  children?: DataSlotChild[];
}

interface ParsedSfcParts {
  template: string;
  script: string;
  templateStartLine: number;
  scriptStartLine: number;
}

@Injectable()
export class SlotAnalyzerService {
  private readonly logger = new Logger(SlotAnalyzerService.name);

  /**
   * 分析 Vue3 SFC，提取数据消费点。
   * P0 版本：template 规则 + script/ECharts 轻量识别，保持旧 DataSlot 字段兼容。
   */
  async analyzeSlots(componentId: string, groupId: string): Promise<{ slots: DataSlot[] }> {
    const sfcContent = this.readSFC(componentId, groupId);
    const parts = this.parseSfcParts(sfcContent);
    const refComments = this.extractRefComments(parts.script);

    const rawSlots: DataSlot[] = [];
    let slotNum = 0;

    slotNum = this.analyzeTemplateSlots(parts.template, parts.templateStartLine, refComments, rawSlots, slotNum);
    slotNum = this.analyzeEChartsSlots(parts, refComments, rawSlots, slotNum);
    slotNum = this.analyzeScriptDataSlots(parts.script, parts.scriptStartLine, refComments, rawSlots, slotNum);

    const filtered = rawSlots.filter(
      (s) => !['container', 'wrapper', 'root', 'body', 'header', 'footer'].includes(s.refName.toLowerCase()),
    );

    this.logger.log(`[SlotAnalyzer] 组件 ${componentId} 分析完成，发现 ${filtered.length} 个数据槽`);
    return { slots: filtered };
  }

  private parseSfcParts(sfcContent: string): ParsedSfcParts {
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

  private analyzeTemplateSlots(
    template: string,
    templateStartLine: number,
    refComments: Map<string, string>,
    rawSlots: DataSlot[],
    slotNum: number,
  ): number {
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

  private analyzeEChartsSlots(
    parts: ParsedSfcParts,
    refComments: Map<string, string>,
    rawSlots: DataSlot[],
    slotNum: number,
  ): number {
    const script = parts.script;
    if (!/echarts\.init|setOption\(/.test(script)) return slotNum;

    const seriesName = this.firstMatch(script, /name:\s*['"]([^'"]+)['"]/);
    const seriesDataExpr = this.firstMatch(script, /series\s*:\s*\[[\s\S]*?data:\s*([^,\n}\]]+)/);
    const xAxisExpr = this.firstMatch(script, /xAxis\s*:\s*{[\s\S]*?data:\s*(\[[\s\S]*?\]|[\w.]+(?:\(\))?)/);
    const markLineExpr = this.firstMatch(script, /markLine\s*:\s*{[\s\S]*?data:\s*(\[[\s\S]*?\])/);
    const chartType = this.firstMatch(script, /type:\s*['"](line|bar|pie|radar|scatter|area)['"]/);

    const children: DataSlotChild[] = [];
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
      const expr = this.cleanExpression(xAxisExpr);
      const xRef = this.extractRefNameFromExpr(expr);
      // 🛡️ 2026-09-03：xAxis 内联数组（无 ref 数据源）不可绑定 → 不产生无意义 child
      if (xRef) {
        children.push({
          role: 'chart.xAxis',
          refName: xRef,
          label: '图表 X 轴数据',
          sourceKind: 'echarts',
          sourceLine: this.getLineNumberForMatch(script, parts.scriptStartLine, xAxisExpr),
          sourceContext: `xAxis.data: ${expr}`,
        });
      }
    }

    if (seriesDataExpr) {
      const expr = this.cleanExpression(seriesDataExpr);
      // 🛡️ 2026-09-03：child 也归一为根 ref（chartData.value → chartData），与主槽一致
      const childRef = this.extractRefNameFromExpr(expr) || expr;
      children.push({
        role: 'chart.series',
        refName: childRef,
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

    if (!children.length) return slotNum;

    const label = this.inferChartLabel(parts.template, seriesName, chartType);
    // 🛡️ 2026-09-03 治本：ECharts 数据槽主 refName 必须以「series.data 的数据源变量」为准
    // （如 chartData / seriesData，ref 声明且被 data: xxx.value 消费），而不是 echarts.init 的
    // DOM ref（chartRef）。此前 primaryChartRef 优先 → 顶层槽名成了 DOM ref（chartRef），
    // 绑定注入给 chartRef 造 chartRefData/markLinedata 等臆造 ref，组件 echarts 渲染从不消费 →
    // 「对接后预览无效果」且告警数据变量未被消费。series 数据是内联字面量时无法绑定 → 丢弃。
    const seriesDataRefName = this.extractRefNameFromExpr(seriesDataExpr);
    const dataRefName = seriesDataRefName || '';
    // series 数据源必须是组件声明的 ref 变量（const xxx = ref(...)），内联数组/函数调用无法安全改写
    const isDeclaredRef = dataRefName
      ? new RegExp(`(?:const|let|var)\\s+${dataRefName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*ref\\(`).test(script)
      : false;
    if (!isDeclaredRef) return slotNum;
    const refName = this.toSafeIdentifier(dataRefName);
    if (this.isAlreadyAdded(rawSlots, refName)) return slotNum;

    // 🛡️ 2026-09-03：数据源是「直接数组 ref」→ 图表数据可直接整体替换，绑定应直赋
    // （chartData.value = res.data，无 adapter 包装），不再套 chart.composite 的容器适配语义。
    // 判定：主 ref 声明为 ref([...]) 数组字面量（chartData = ref([...])）即属直赋型。
    const isArrayDataRef = new RegExp(
      `(?:const|let|var)\\s+${refName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*ref\\(\\s*\\[`,
    ).test(script);
    const role = isArrayDataRef ? 'chart.data' : 'chart.composite';

    rawSlots.push({
      slotId: `slot-${++slotNum}`,
      slotType: 'chart',
      role,
      label,
      refName,
      sourceLine: this.getLineNumberForMatch(script, parts.scriptStartLine, 'setOption'),
      sourceContext: `ECharts ${chartType || ''} ${seriesName || ''}`.trim(),
      sourceKind: 'echarts',
      confidence: 'high',
      reason: `检测到 ECharts setOption，series.data 来自数据 ref ${refName}${isArrayDataRef ? '（数组 ref，绑定直赋）' : ''}${seriesName ? `，series.name 为 ${seriesName}` : ''}`,
      bindable: true,
      children,
    });

    return slotNum;
  }

  /**
   * 🛡️ 2026-09-03：从 series.data 表达式提取可绑定 ref 名。
   * 支持 chartData.value / chartData（ref 变量）→ chartData；内联数组/对象/函数调用返回空。
   */
  private extractRefNameFromExpr(expr: string): string {
    const cleaned = this.cleanExpression(expr);
    if (!cleaned) return '';
    // 内联字面量（[1,2,3] / {a:1}）或调用（getData()/chart.getOption()）→ 不可直接绑定
    if (/^[[{'"`]/.test(cleaned)) return '';
    if (/\(\)\s*$/.test(cleaned)) return '';
    // 去掉 .value / 成员链尾巴，取根变量（chartData.value → chartData；a.b.chartData → chartData）
    const segs = cleaned.split('.');
    const root = segs[0].trim();
    return /^[a-zA-Z_$][\w$]*$/.test(root) ? root : '';
  }

  private analyzeScriptDataSlots(
    script: string,
    scriptStartLine: number,
    refComments: Map<string, string>,
    rawSlots: DataSlot[],
    slotNum: number,
  ): number {
    const propsMatch = script.match(/defineProps\s*\(\s*{([\s\S]*?)}\s*\)/);
    if (propsMatch) {
      const propPattern = /(?:^|\n)\s*(\w+)\s*:\s*{/g;
      let propMatch: RegExpExecArray | null;
      while ((propMatch = propPattern.exec(propsMatch[1])) !== null) {
        const refName = propMatch[1];
        if (this.isAlreadyAdded(rawSlots, refName)) continue;
        const kind = this.inferSlotKindFromName(refName);
        if (!kind.bindable) continue;
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
    let fnMatch: RegExpExecArray | null;
    while ((fnMatch = fnArrayPattern.exec(script)) !== null) {
      const refName = fnMatch[1];
      if (this.isAlreadyAdded(rawSlots, refName)) continue;
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

  /**
   * 读取 Vue3 SFC 源码
   * 兼容两种产物结构：
   *  - 未绑定接口：vue3-components/{groupId}/{componentId}/index.vue
   *  - 已绑定接口：vue3-components/{groupId}/{componentId}/package/index.vue
   * 搜索范围：backend workspace + frontend workspace（polyrepo 兜底）
   * groupId 兜底：若给定 groupId 找不到，递归所有 groupId 目录按 componentId 定位
   */
  readSFC(componentId: string, groupId?: string): string {
    const sfcNames = ['package/index.vue'];
    const bases = [
      workspaceRoot,
      resolveFrontendWorkspace(),
    ];

    if (groupId) {
      for (const base of bases) {
        for (const name of sfcNames) {
          const p = join(base, 'vue3-components', groupId, componentId, name);
          if (existsSync(p)) {
            this.logger.debug(`[SlotAnalyzer] 读取 SFC: ${p}`);
            return readFileSync(p, 'utf-8');
          }
        }
      }
    }

    for (const base of bases) {
      const vue3Base = join(base, 'vue3-components');
      if (!existsSync(vue3Base)) continue;
      for (const gDir of readdirSync(vue3Base)) {
        const compDir = join(vue3Base, gDir, componentId);
        if (!existsSync(compDir) || !statSync(compDir).isDirectory()) continue;
        for (const name of sfcNames) {
          const p = join(compDir, name);
          if (existsSync(p)) {
            this.logger.debug(`[SlotAnalyzer] 读取 SFC (递归兜底): ${p}`);
            return readFileSync(p, 'utf-8');
          }
        }
      }
    }

    throw new NotFoundException(
      `组件 SFC 文件未找到: vue3-components/${groupId || '*'}/${componentId} (已尝试 index.vue 与 package/index.vue，及跨 groupId / 跨 workspace 兜底)`,
    );
  }

  private isAlreadyAdded(slots: DataSlot[], refName: string): boolean {
    return slots.some((s) => s.refName === refName);
  }

  private extractRefComments(script: string): Map<string, string> {
    const comments = new Map<string, string>();
    const refPattern = /(?:\/\/\s*(.+)|\/\*\s*(.+?)\s*\*\/)\s*\n\s*const\s+(\w+)\s*=\s*ref/g;
    let match: RegExpExecArray | null;
    while ((match = refPattern.exec(script)) !== null) {
      const comment = (match[1] || match[2] || '').trim();
      if (comment) comments.set(match[3], comment);
    }
    return comments;
  }

  private getTemplateContext(lines: string[], index: number): string {
    const start = Math.max(0, index - 4);
    const end = Math.min(lines.length, index + 4);
    return lines.slice(start, end).join('\n');
  }

  private isTabsLike(refName: string, context: string): boolean {
    return /tabs?|tabList|filter|options/i.test(refName) || /tab-|tab_|tab\b|role="tab"|筛选|切换/.test(context);
  }

  private extractChartRefs(template: string, script: string): string[] {
    const refs = new Set<string>();
    const refPattern = /ref="(\w+)"/g;
    let match: RegExpExecArray | null;
    while ((match = refPattern.exec(template)) !== null) {
      const refName = match[1];
      if (new RegExp(`echarts\\.init\\(\\s*${refName}\\.value`).test(script)) {
        refs.add(refName);
      }
    }
    return Array.from(refs);
  }

  private firstMatch(source: string, pattern: RegExp): string {
    const match = source.match(pattern);
    return match?.[1]?.trim() || '';
  }

  private cleanExpression(expr: string): string {
    return expr.trim().replace(/[,;]$/, '').replace(/\s+/g, ' ');
  }

  private getLineNumberForMatch(source: string, startLine: number, needle: string): number {
    const index = source.indexOf(needle);
    if (index < 0) return startLine;
    return startLine + source.substring(0, index).split('\n').length - 1;
  }

  private inferChartLabel(template: string, seriesName: string, chartType: string): string {
    const chartTitle = this.firstMatch(template, /(?:chart-title[^>]*>[\s\S]*?<[^>]*>)([^<]+)</);
    const panelTitle = this.firstMatch(template, /(?:header-title|sub-title|title)[^>]*>([^<]+)</);
    if (chartTitle) return `${chartTitle}图表`;
    if (panelTitle) return `${panelTitle}趋势图`;
    if (seriesName) return `${seriesName}图表`;
    return chartType ? `${chartType} 图表数据` : '图表数据';
  }

  private inferSlotKindFromName(refName: string): { slotType: DataSlot['slotType']; role: string; bindable: boolean } {
    if (/^(initial|default|visible|isVisible|disabled|readonly|className|style|theme)/i.test(refName)) {
      return { slotType: 'form', role: 'component.config', bindable: false };
    }
    if (/chart|series|trend|hourly|xAxis|yAxis/i.test(refName)) return { slotType: 'chart', role: 'chart.data', bindable: true };
    if (/table|rows|columns/i.test(refName)) return { slotType: 'table', role: 'table.rows', bindable: true };
    if (/tabs?|options?|filter|select/i.test(refName)) return { slotType: 'select', role: 'filter.options', bindable: true };
    if (/list|items|cards/i.test(refName)) return { slotType: 'list', role: 'list.items', bindable: true };
    return { slotType: 'stat', role: 'stat.group', bindable: true };
  }

  private toSafeIdentifier(value: string): string {
    const normalized = value.replace(/[^a-zA-Z0-9_$]/g, '_');
    return /^[a-zA-Z_$]/.test(normalized) ? normalized : `slot_${normalized}`;
  }

  private inferLabel(refName: string, slotType: string): string {
    let name = refName.replace(/^(table|chart|list|form|stat|select)?Data/i, '').replace(/Data$|List$|Options$|Option$|Info$/i, '');
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    if (!name) name = refName;

    const typeLabels: Record<string, string> = {
      list: '列表数据',
      table: '表格数据',
      chart: '图表数据',
      select: '筛选/选项',
      stat: '统计数据',
      form: '表单数据',
    };

    return `${name} (${typeLabels[slotType] || slotType})`;
  }
}
