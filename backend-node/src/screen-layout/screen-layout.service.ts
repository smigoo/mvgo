import { Injectable, Logger } from '@nestjs/common';
const { ZipArchive } = require('archiver');
import { ProgressService } from '../progress/progress.service';
import { TasksService } from '../tasks/tasks.service';

// ============================================================
// 类型定义（与设计方案 .workbuddy/design/screen-layout-builder.md 一致）
// ============================================================

interface CanvasConfig {
  width: number;
  height: number;
  aspectRatioLocked: boolean;
  aspectRatio: number;
  outputScaleMode: 'contain' | 'fillWidth' | 'fillHeight' | 'none';
  backgroundColor: string;
  backgroundImage?: string;
  showGrid: boolean;
  gridSize: number;
  snapToGrid: boolean;
  editorZoom: number;
}

interface GridComponent {
  id: string;
  componentName: string;
  layout: {
    x: number; y: number;
    w: number; h: number;
    minW: number; maxW: number;
    minH: number; maxH: number;
    static: boolean;
  };
  props: Record<string, unknown>;
}

interface HeaderFooterConfig {
  enabled: boolean;
  height: string;
  backgroundColor?: string;
  innerLayout: 'grid';
  gridCols: number;
  components: GridComponent[];
}

interface FlexConfig {
  direction: 'row' | 'column';
  gap: string;
  wrap: boolean;
  justify: string;
  align: string;
}

interface ZoneConfig {
  id: string;
  colIndex: number;
  contentAlign: {
    vertical: 'top' | 'center' | 'bottom' | 'stretch';
    horizontal: 'left' | 'center' | 'right' | 'stretch';
  };
  padding: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  zIndex: 'bottom' | 'middle';
  offset: {
    left: string;
    right: string;
  };
  layoutMode: 'grid' | 'flex';
  contentType: 'components' | 'zones';
  gridConfig: {
    cols: number;
    rowHeight: number;
    components: GridComponent[];
  };
  flexConfig: FlexConfig;
  children?: ZoneConfig[];
}

interface ColumnConfig {
  id: string;
  width: string;
  resizable: boolean;
  collapsible: boolean;
  defaultCollapsed: boolean;
  collapsedWidth: string;
}

interface BodyConfig {
  columns: ColumnConfig[];
  zones: ZoneConfig[];
}

interface ScreenLayout {
  id: string;
  name: string;
  canvas: CanvasConfig;
  header: HeaderFooterConfig | null;
  body: BodyConfig;
  footer: HeaderFooterConfig | null;
}

// ============================================================
// 工具函数
// ============================================================

/** 将 PascalCase 转为 kebab-case（用于 CSS 类名降级） */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** 递归收集 zone 及其子 zone 中的所有 componentName */
function collectZoneComponentNames(zone: ZoneConfig, names: Set<string>): void {
  if (zone.gridConfig?.components) {
    for (const comp of zone.gridConfig.components) {
      if (comp.componentName) names.add(comp.componentName);
    }
  }
  if (zone.children) {
    for (const child of zone.children) {
      collectZoneComponentNames(child, names);
    }
  }
}

/** 从布局中收集所有唯一的 componentName（递归） */
function collectComponentNames(layout: ScreenLayout): string[] {
  const names = new Set<string>();

  // 头部组件
  if (layout.header?.enabled && layout.header.components) {
    for (const comp of layout.header.components) {
      if (comp.componentName) names.add(comp.componentName);
    }
  }

  // 底部组件
  if (layout.footer?.enabled && layout.footer.components) {
    for (const comp of layout.footer.components) {
      if (comp.componentName) names.add(comp.componentName);
    }
  }

  // 主体 Zone 组件（递归子 zone）
  for (const zone of layout.body.zones) {
    collectZoneComponentNames(zone, names);
  }

  return Array.from(names).sort();
}

// ============================================================
// 生成函数
// ============================================================

/**
 * 生成 index.vue 文件内容
 */
function generateIndexVue(layout: ScreenLayout): string {
  const componentNames = collectComponentNames(layout);
  const hasHeader = layout.header?.enabled ?? false;
  const hasFooter = layout.footer?.enabled ?? false;

  // ---- part 1: imports ----
  const imports = componentNames
    .map(name => `import ${name} from './components/${name}.vue'`)
    .join('\n');

  // ---- part 2: componentMap ----
  const mapEntries = componentNames
    .map(name => `  ${name},`)
    .join('\n');
  const componentMap = mapEntries
    ? `const componentMap = {\n${mapEntries}\n}`
    : 'const componentMap = {}';

  // ---- part 3: template (zone body) — 支持 grid/flex + 嵌套 ----

  /** 递归生成 zone 内容 HTML */
  function generateZoneContent(zone: ZoneConfig, indent: string): string {
    // 嵌套子布局
    if (zone.contentType === 'zones' && zone.children && zone.children.length > 0) {
      const containerStyle = zone.layoutMode === 'flex'
        ? `display: flex; flex-direction: ${zone.flexConfig.direction}; gap: ${zone.flexConfig.gap}; flex-wrap: ${zone.flexConfig.wrap ? 'wrap' : 'nowrap'}; justify-content: ${zone.flexConfig.justify}; align-items: ${zone.flexConfig.align};`
        : `display: grid; grid-template-columns: repeat(${zone.gridConfig.cols}, 1fr); grid-auto-rows: minmax(0, 1fr); gap: 4px;`;

      const childContents = zone.children.map(child => {
        const childStyle = generateZoneStyle(child);
        const childContent = generateZoneContent(child, indent + '  ');
        return `${indent}  <div class="zone-${child.id}" style="height: 100%; min-height: 0; ${childStyle}">
${childContent}
${indent}  </div>`;
      }).join('\n');

      return `${indent}<div class="zone-children-container" style="${containerStyle}">
${childContents}
${indent}</div>`;
    }

    // 组件模式 — grid
    if (zone.layoutMode === 'grid' && zone.gridConfig && zone.gridConfig.components.length > 0) {
      const gridItems = zone.gridConfig.components.map(comp =>
        `${indent}  <div :style="{ gridColumn: 'span ${comp.layout.w}', gridRow: 'span ${comp.layout.h}', height: '100%', minHeight: '0', overflow: 'hidden' }">
${indent}    <component :is="resolveComponent('${comp.componentName}')" v-bind='${JSON.stringify(comp.props)}' />
${indent}  </div>`
      ).join('\n');

      return `${indent}<div class="zone-grid" :style="{
        display: 'grid',
        gridTemplateColumns: 'repeat(${zone.gridConfig.cols}, 1fr)',
        gap: '${zone.gridConfig.rowHeight}px',
      }">
${gridItems}
${indent}</div>`;
    }

    // 组件模式 — flex
    if (zone.layoutMode === 'flex' && zone.gridConfig && zone.gridConfig.components.length > 0) {
      const flexItems = zone.gridConfig.components.map(comp =>
        `${indent}  <div class="flex-item">
${indent}    <component :is="resolveComponent('${comp.componentName}')" v-bind='${JSON.stringify(comp.props)}' />
${indent}  </div>`
      ).join('\n');

      return `${indent}<div class="zone-flex" :style="{
        display: 'flex',
        flexDirection: '${zone.flexConfig.direction}',
        gap: '${zone.flexConfig.gap}',
        flexWrap: '${zone.flexConfig.wrap ? 'wrap' : 'nowrap'}',
        justifyContent: '${zone.flexConfig.justify}',
        alignItems: '${zone.flexConfig.align}',
      }">
${flexItems}
${indent}</div>`;
    }

    return `${indent}<!-- empty zone -->`;
  }

  /** 生成 zone 的内联样式 */
  function generateZoneStyle(zone: ZoneConfig): string {
    const parts: string[] = [];
    parts.push(`padding: ${zone.padding.top} ${zone.padding.right} ${zone.padding.bottom} ${zone.padding.left}`);

    if (zone.zIndex === 'bottom') {
      parts.push('position: absolute');
      parts.push('inset: 0');
      parts.push('z-index: 0');
    } else if (zone.colIndex >= 0) {
      parts.push('position: relative');
      parts.push('z-index: 5');
      if (zone.offset.left && zone.offset.left !== '0') parts.push(`margin-left: ${zone.offset.left}`);
      if (zone.offset.right && zone.offset.right !== '0') parts.push(`margin-right: ${zone.offset.right}`);
    } else {
      // 兜底：colIndex 异常时仍给相对定位上下文，避免子元素脱离文档流
      parts.push('position: relative');
      parts.push('z-index: 1');
    }

    const hMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end', stretch: 'stretch' };
    const vMap: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end', stretch: 'stretch' };
    parts.push(`align-items: ${hMap[zone.contentAlign.horizontal] || 'stretch'}`);
    parts.push(`justify-content: ${vMap[zone.contentAlign.vertical] || 'stretch'}`);

    return parts.join('; ');
  }

  const zoneTemplates: string[] = [];
  for (const zone of layout.body.zones) {
    const zoneContent = generateZoneContent(zone, '        ');
    const zoneStyle = generateZoneStyle(zone);
    // 非 absolute 定位的 zone 需要显式撑高
    const heightStyle = zone.zIndex !== 'bottom' ? 'height: 100%; min-height: 0; ' : '';

    zoneTemplates.push(`      <!-- Zone: ${zone.id} -->
      <div class="zone-${zone.id}" style="${heightStyle}${zoneStyle}">
${zoneContent}
      </div>`);
  }

  const zoneTemplateBlock = zoneTemplates.join('\n\n');

  // ---- part 5: header/footer templates ----
  const headerTemplate = hasHeader
    ? `    <!-- 头部 -->
    <header class="screen-header" :style="{ height: '${layout.header!.height}', backgroundColor: '${layout.header!.backgroundColor || 'transparent'}' }">
      <div class="header-grid" :style="{ display: 'grid', gridTemplateColumns: 'repeat(${layout.header!.gridCols}, 1fr)', gridAutoRows: 'minmax(0, 1fr)' }">
${(layout.header!.components || []).map(comp =>
        `        <div :style="{ gridColumn: 'span ${comp.layout.w}', gridRow: 'span ${comp.layout.h}', height: '100%', minHeight: '0', overflow: 'hidden' }">
          <component :is="resolveComponent('${comp.componentName}')" v-bind="${JSON.stringify(comp.props)}" />
        </div>`
      ).join('\n')}
      </div>
    </header>`
    : '';

  const footerTemplate = hasFooter
    ? `    <!-- 底部 -->
    <footer class="screen-footer" :style="{ height: '${layout.footer!.height}', backgroundColor: '${layout.footer!.backgroundColor || 'transparent'}' }">
      <div class="footer-grid" :style="{ display: 'grid', gridTemplateColumns: 'repeat(${layout.footer!.gridCols}, 1fr)', gridAutoRows: 'minmax(0, 1fr)' }">
${(layout.footer!.components || []).map(comp =>
        `        <div :style="{ gridColumn: 'span ${comp.layout.w}', gridRow: 'span ${comp.layout.h}', height: '100%', minHeight: '0', overflow: 'hidden' }">
          <component :is="resolveComponent('${comp.componentName}')" v-bind="${JSON.stringify(comp.props)}" />
        </div>`
      ).join('\n')}
      </div>
    </footer>`
    : '';

  // ---- part 6: column widths for body grid ----
  const columnWidths = layout.body.columns
    .map(c => c.defaultCollapsed ? (c.collapsedWidth || '0fr') : c.width)
    .join(' ');

  // ---- part 7: assemble ----
  return `<template>
  <div class="screen-wrapper" :style="wrapperStyle">
${headerTemplate}
${headerTemplate ? '\n' : ''}    <!-- 主体 -->
    <main class="screen-body" :style="bodyStyle">
${zoneTemplateBlock}
    </main>
${footerTemplate ? '\n' : ''}${footerTemplate}
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import layoutConfig from './layout-config.json'
${imports ? '\n' + imports : ''}

const layout = ref(layoutConfig)

${componentMap}

function resolveComponent(name) {
  return componentMap[name] || null
}

const wrapperStyle = computed(() => ({
  backgroundColor: layout.value.canvas.backgroundColor,
  backgroundImage: layout.value.canvas.backgroundImage
    ? \`url(\${layout.value.canvas.backgroundImage})\`
    : undefined,
}))

const bodyStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: '${columnWidths}',
  gridAutoRows: 'minmax(0, 1fr)',
  height: '100%',
}))
</script>

<style lang="less" scoped>
.screen-wrapper {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.screen-header,
.screen-footer {
  flex-shrink: 0;
}

.screen-body {
  flex: 1;
  position: relative;
  min-height: 0;
  transition: grid-template-columns 0.3s ease;
}

.zone-grid {
  width: 100%;
  height: 100%;
  grid-auto-rows: minmax(0, 1fr);
}

.zone-flex {
  width: 100%;
  height: 100%;
}

.flex-item {
  flex: 1 1 0;
  min-height: 0;
}

.zone-children-container {
  width: 100%;
  height: 100%;
}
</style>`;
}

/**
 * 生成组件缺省骨架文件内容
 */
function generateComponentSkeleton(componentName: string): string {
  return `<template>
  <div class="${componentName}">
    <div class="panel-header">
      <span class="panel-title">${componentName}</span>
    </div>
    <div class="panel-body">
      <div class="placeholder-chart">
        <span>${componentName} 组件占位</span>
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style lang="less" scoped>
.${componentName} {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;

  .panel-header {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    .panel-title {
      font-size: 14px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.85);
    }
  }

  .panel-body {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;

    .placeholder-chart {
      padding: 24px;
      border: 1px dashed rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.3);
      font-size: 13px;
    }
  }
}
</style>`;
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class ScreenLayoutService {
  private readonly logger = new Logger(ScreenLayoutService.name);

  constructor(
    private readonly progressService: ProgressService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * 根据 ScreenLayout 生成 ZIP Buffer
   */
  async generateZip(layout: ScreenLayout): Promise<Buffer> {
    this.logger.log(`生成 ZIP: ${layout.name} (${layout.id})`);

    return new Promise((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err: Error) => reject(err));

      // 1. 生成 index.vue
      const indexVue = generateIndexVue(layout);
      archive.append(indexVue, { name: 'index.vue' });

      // 2. 生成 layout-config.json
      const configJson = JSON.stringify(layout, null, 2);
      archive.append(configJson, { name: 'layout-config.json' });

      // 3. 生成组件缺省骨架
      const componentNames = collectComponentNames(layout);
      for (const name of componentNames) {
        const skeleton = generateComponentSkeleton(name);
        archive.append(skeleton, { name: `components/${name}.vue` });
      }

      archive.finalize();
    });
  }

  /**
   * 空间分析 — 调用规则引擎对布局进行空间结构预处理
   * 返回行/列检测、重叠分析、Zone 树、响应式建议等结构化报告
   */
  async analyzeSpatial(layout: ScreenLayout): Promise<any> {
    this.logger.log(`空间分析: ${layout.name || layout.id}`);
    // 动态导入 JS 模块（TypeScript NestJS 中 import ESM JS 模块）
    const { LayoutSpatialAnalyzer } = await import('../ai-engine/utils/layout-spatial-analyzer.js');
    const analyzer = new LayoutSpatialAnalyzer({
      rowTolerance: 30,
      colTolerance: 30,
    });
    return analyzer.analyze(layout);
  }

  /**
   * 启动响应式生成（异步，不阻塞请求）
   * @param sessionId - SSE 会话 ID
   * @param layout - 原始 ScreenLayout
   */
  startResponsiveGeneration(sessionId: string, layout: ScreenLayout, userId?: string): void {
    this.logger.log(`启动响应式生成: ${sessionId}`);

    // 创建任务记录
    this.tasksService.createTask(sessionId, {
      taskType: 'page',
      componentName: layout.name || sessionId,
      userId,
      generationTier: 'max',
      sourceType: 'figma',
    });

    // 异步执行（不 await，立即返回)
    this._runGenerationWorkflow(sessionId, layout).catch((err) => {
      this.logger.error(`响应式生成工作流异常: ${sessionId}`, err.stack);
      this.progressService.sendError(sessionId, {
        message: err.message || '生成失败',
        stack: err.stack,
      });
    });
  }

  /**
   * 获取已生成的响应式 ZIP Buffer
   * @param sessionId - SSE 会话 ID
   */
  async getGeneratedZip(sessionId: string): Promise<Buffer | null> {
    const result = this._getGenerationResult(sessionId);
    if (!result) return null;

    const { vueCode, analysisResult, previews, spatialReport } = result;

    return new Promise((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err: Error) => reject(err));

      // 1. 响应式 index.vue
      archive.append(vueCode || '', { name: 'responsive/index.vue' });

      // 2. 分析报告
      archive.append(JSON.stringify(analysisResult || {}, null, 2), {
        name: 'responsive/analysis-report.json',
      });

      // 3. 空间分析报告
      archive.append(JSON.stringify(spatialReport || {}, null, 2), {
        name: 'responsive/spatial-report.json',
      });

      // 4. 多断点预览
      if (previews) {
        for (const [label, html] of Object.entries(previews)) {
          archive.append(html as string, {
            name: `responsive/previews/${label}.html`,
          });
        }
      }

      // 5. 原始布局（参考）
      archive.append(JSON.stringify(result._originalLayout || {}, null, 2), {
        name: 'original-layout.json',
      });

      archive.finalize();
    });
  }

  // ============================================================
  // Private: 响应式生成工作流
  // ============================================================

  private _generationResults?: Map<string, {
    data: any;
    expiresAt: number;
    timer: NodeJS.Timeout;
  }>;

  /** 生成结果 TTL（30 分钟） */
  private static readonly RESULT_TTL_MS = 30 * 60 * 1000;

  /**
   * 存储生成结果（带 TTL 自动清理）
   */
  private _setGenerationResult(sessionId: string, data: any): void {
    if (!this._generationResults) {
      this._generationResults = new Map();
    }

    // 先清理已过期的条目
    const now = Date.now();
    for (const [key, entry] of this._generationResults) {
      if (entry.expiresAt <= now) {
        clearTimeout(entry.timer);
        this._generationResults.delete(key);
      }
    }

    // 如果已存在旧条目，先清理其定时器
    const existing = this._generationResults.get(sessionId);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const expiresAt = now + ScreenLayoutService.RESULT_TTL_MS;
    const timer = setTimeout(() => {
      this._generationResults?.delete(sessionId);
      this.logger.log(`生成结果已过期清理: ${sessionId}`);
    }, ScreenLayoutService.RESULT_TTL_MS);

    this._generationResults.set(sessionId, { data, expiresAt, timer });
    this.logger.log(`缓存生成结果: ${sessionId} (TTL=${ScreenLayoutService.RESULT_TTL_MS / 60000}min)`);
  }

  /**
   * 获取生成结果数据（自动过滤过期条目）
   */
  private _getGenerationResult(sessionId: string): any | null {
    const entry = this._generationResults?.get(sessionId);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      clearTimeout(entry.timer);
      this._generationResults?.delete(sessionId);
      return null;
    }

    return entry.data;
  }

  private async _runGenerationWorkflow(sessionId: string, layout: ScreenLayout): Promise<void> {
    const { runLayoutResponsiveGeneration } = await import(
      '../ai-engine/graphs/layout-responsive-graph.js'
    );

    const onProgress = (data: { stage: string; message: string; data?: any }) => {
      this.progressService.sendProgress(sessionId, {
        stage: data.stage,
        message: data.message,
        ...(data.data ? { data: data.data } : {}),
      });
    };

    try {
      const result = await runLayoutResponsiveGeneration({
        layoutData: layout,
        onProgress,
        onTokenUsage: (usage: any) => {
          // 通过 SSE 推送 token 用量
          this.progressService.sendProgress(sessionId, {
            stage: 'token-usage',
            type: 'metrics',
            data: usage,
          });
        },
      });

      // 缓存结果供下载（带 TTL）
      this._setGenerationResult(sessionId, {
        ...result,
        _originalLayout: layout,
      });

      // 发送完成事件
      this.progressService.sendComplete(sessionId, {
        summary: result.summary,
        codePreview: result.vueCode?.substring(0, 500), // 前 500 字符预览
        previewBreakpoints: result.previewBreakpoints || Object.keys(result.previews || {}),
        hasAnalysisResult: !!result.analysisResult,
      });
    } catch (error: any) {
      this.logger.error(`响应式生成失败: ${sessionId}`, error.stack);
      this.progressService.sendError(sessionId, {
        message: error.message || '生成失败',
      });
      throw error;
    }
  }
}
