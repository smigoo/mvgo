"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ScreenLayoutService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenLayoutService = void 0;
const common_1 = require("@nestjs/common");
const { ZipArchive } = require('archiver');
const progress_service_1 = require("../progress/progress.service");
const tasks_service_1 = require("../tasks/tasks.service");
function toKebabCase(str) {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}
function collectZoneComponentNames(zone, names) {
    if (zone.gridConfig?.components) {
        for (const comp of zone.gridConfig.components) {
            if (comp.componentName)
                names.add(comp.componentName);
        }
    }
    if (zone.children) {
        for (const child of zone.children) {
            collectZoneComponentNames(child, names);
        }
    }
}
function collectComponentNames(layout) {
    const names = new Set();
    if (layout.header?.enabled && layout.header.components) {
        for (const comp of layout.header.components) {
            if (comp.componentName)
                names.add(comp.componentName);
        }
    }
    if (layout.footer?.enabled && layout.footer.components) {
        for (const comp of layout.footer.components) {
            if (comp.componentName)
                names.add(comp.componentName);
        }
    }
    for (const zone of layout.body.zones) {
        collectZoneComponentNames(zone, names);
    }
    return Array.from(names).sort();
}
function generateIndexVue(layout) {
    const componentNames = collectComponentNames(layout);
    const hasHeader = layout.header?.enabled ?? false;
    const hasFooter = layout.footer?.enabled ?? false;
    const imports = componentNames
        .map(name => `import ${name} from './components/${name}.vue'`)
        .join('\n');
    const mapEntries = componentNames
        .map(name => `  ${name},`)
        .join('\n');
    const componentMap = mapEntries
        ? `const componentMap = {\n${mapEntries}\n}`
        : 'const componentMap = {}';
    function generateZoneContent(zone, indent) {
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
        if (zone.layoutMode === 'grid' && zone.gridConfig && zone.gridConfig.components.length > 0) {
            const gridItems = zone.gridConfig.components.map(comp => `${indent}  <div :style="{ gridColumn: 'span ${comp.layout.w}', gridRow: 'span ${comp.layout.h}', height: '100%', minHeight: '0', overflow: 'hidden' }">
${indent}    <component :is="resolveComponent('${comp.componentName}')" v-bind='${JSON.stringify(comp.props)}' />
${indent}  </div>`).join('\n');
            return `${indent}<div class="zone-grid" :style="{
        display: 'grid',
        gridTemplateColumns: 'repeat(${zone.gridConfig.cols}, 1fr)',
        gap: '${zone.gridConfig.rowHeight}px',
      }">
${gridItems}
${indent}</div>`;
        }
        if (zone.layoutMode === 'flex' && zone.gridConfig && zone.gridConfig.components.length > 0) {
            const flexItems = zone.gridConfig.components.map(comp => `${indent}  <div class="flex-item">
${indent}    <component :is="resolveComponent('${comp.componentName}')" v-bind='${JSON.stringify(comp.props)}' />
${indent}  </div>`).join('\n');
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
    function generateZoneStyle(zone) {
        const parts = [];
        parts.push(`padding: ${zone.padding.top} ${zone.padding.right} ${zone.padding.bottom} ${zone.padding.left}`);
        if (zone.zIndex === 'bottom') {
            parts.push('position: absolute');
            parts.push('inset: 0');
            parts.push('z-index: 0');
        }
        else if (zone.colIndex >= 0) {
            parts.push('position: relative');
            parts.push('z-index: 5');
            if (zone.offset.left && zone.offset.left !== '0')
                parts.push(`margin-left: ${zone.offset.left}`);
            if (zone.offset.right && zone.offset.right !== '0')
                parts.push(`margin-right: ${zone.offset.right}`);
        }
        else {
            parts.push('position: relative');
            parts.push('z-index: 1');
        }
        const hMap = { left: 'flex-start', center: 'center', right: 'flex-end', stretch: 'stretch' };
        const vMap = { top: 'flex-start', center: 'center', bottom: 'flex-end', stretch: 'stretch' };
        parts.push(`align-items: ${hMap[zone.contentAlign.horizontal] || 'stretch'}`);
        parts.push(`justify-content: ${vMap[zone.contentAlign.vertical] || 'stretch'}`);
        return parts.join('; ');
    }
    const zoneTemplates = [];
    for (const zone of layout.body.zones) {
        const zoneContent = generateZoneContent(zone, '        ');
        const zoneStyle = generateZoneStyle(zone);
        const heightStyle = zone.zIndex !== 'bottom' ? 'height: 100%; min-height: 0; ' : '';
        zoneTemplates.push(`      <!-- Zone: ${zone.id} -->
      <div class="zone-${zone.id}" style="${heightStyle}${zoneStyle}">
${zoneContent}
      </div>`);
    }
    const zoneTemplateBlock = zoneTemplates.join('\n\n');
    const headerTemplate = hasHeader
        ? `    <!-- 头部 -->
    <header class="screen-header" :style="{ height: '${layout.header.height}', backgroundColor: '${layout.header.backgroundColor || 'transparent'}' }">
      <div class="header-grid" :style="{ display: 'grid', gridTemplateColumns: 'repeat(${layout.header.gridCols}, 1fr)', gridAutoRows: 'minmax(0, 1fr)' }">
${(layout.header.components || []).map(comp => `        <div :style="{ gridColumn: 'span ${comp.layout.w}', gridRow: 'span ${comp.layout.h}', height: '100%', minHeight: '0', overflow: 'hidden' }">
          <component :is="resolveComponent('${comp.componentName}')" v-bind="${JSON.stringify(comp.props)}" />
        </div>`).join('\n')}
      </div>
    </header>`
        : '';
    const footerTemplate = hasFooter
        ? `    <!-- 底部 -->
    <footer class="screen-footer" :style="{ height: '${layout.footer.height}', backgroundColor: '${layout.footer.backgroundColor || 'transparent'}' }">
      <div class="footer-grid" :style="{ display: 'grid', gridTemplateColumns: 'repeat(${layout.footer.gridCols}, 1fr)', gridAutoRows: 'minmax(0, 1fr)' }">
${(layout.footer.components || []).map(comp => `        <div :style="{ gridColumn: 'span ${comp.layout.w}', gridRow: 'span ${comp.layout.h}', height: '100%', minHeight: '0', overflow: 'hidden' }">
          <component :is="resolveComponent('${comp.componentName}')" v-bind="${JSON.stringify(comp.props)}" />
        </div>`).join('\n')}
      </div>
    </footer>`
        : '';
    const columnWidths = layout.body.columns
        .map(c => c.defaultCollapsed ? (c.collapsedWidth || '0fr') : c.width)
        .join(' ');
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
function generateComponentSkeleton(componentName) {
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
let ScreenLayoutService = class ScreenLayoutService {
    static { ScreenLayoutService_1 = this; }
    progressService;
    tasksService;
    logger = new common_1.Logger(ScreenLayoutService_1.name);
    constructor(progressService, tasksService) {
        this.progressService = progressService;
        this.tasksService = tasksService;
    }
    async generateZip(layout) {
        this.logger.log(`生成 ZIP: ${layout.name} (${layout.id})`);
        return new Promise((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const chunks = [];
            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(err));
            const indexVue = generateIndexVue(layout);
            archive.append(indexVue, { name: 'index.vue' });
            const configJson = JSON.stringify(layout, null, 2);
            archive.append(configJson, { name: 'layout-config.json' });
            const componentNames = collectComponentNames(layout);
            for (const name of componentNames) {
                const skeleton = generateComponentSkeleton(name);
                archive.append(skeleton, { name: `components/${name}.vue` });
            }
            archive.finalize();
        });
    }
    async analyzeSpatial(layout) {
        this.logger.log(`空间分析: ${layout.name || layout.id}`);
        const { LayoutSpatialAnalyzer } = await import('../ai-engine/utils/layout-spatial-analyzer.js');
        const analyzer = new LayoutSpatialAnalyzer({
            rowTolerance: 30,
            colTolerance: 30,
        });
        return analyzer.analyze(layout);
    }
    startResponsiveGeneration(sessionId, layout, userId) {
        this.logger.log(`启动响应式生成: ${sessionId}`);
        this.tasksService.createTask(sessionId, {
            taskType: 'page',
            componentName: layout.name || sessionId,
            userId,
        });
        this._runGenerationWorkflow(sessionId, layout).catch((err) => {
            this.logger.error(`响应式生成工作流异常: ${sessionId}`, err.stack);
            this.progressService.sendError(sessionId, {
                message: err.message || '生成失败',
                stack: err.stack,
            });
        });
    }
    async getGeneratedZip(sessionId) {
        const result = this._getGenerationResult(sessionId);
        if (!result)
            return null;
        const { vueCode, analysisResult, previews, spatialReport } = result;
        return new Promise((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const chunks = [];
            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(err));
            archive.append(vueCode || '', { name: 'responsive/index.vue' });
            archive.append(JSON.stringify(analysisResult || {}, null, 2), {
                name: 'responsive/analysis-report.json',
            });
            archive.append(JSON.stringify(spatialReport || {}, null, 2), {
                name: 'responsive/spatial-report.json',
            });
            if (previews) {
                for (const [label, html] of Object.entries(previews)) {
                    archive.append(html, {
                        name: `responsive/previews/${label}.html`,
                    });
                }
            }
            archive.append(JSON.stringify(result._originalLayout || {}, null, 2), {
                name: 'original-layout.json',
            });
            archive.finalize();
        });
    }
    _generationResults;
    static RESULT_TTL_MS = 30 * 60 * 1000;
    _setGenerationResult(sessionId, data) {
        if (!this._generationResults) {
            this._generationResults = new Map();
        }
        const now = Date.now();
        for (const [key, entry] of this._generationResults) {
            if (entry.expiresAt <= now) {
                clearTimeout(entry.timer);
                this._generationResults.delete(key);
            }
        }
        const existing = this._generationResults.get(sessionId);
        if (existing) {
            clearTimeout(existing.timer);
        }
        const expiresAt = now + ScreenLayoutService_1.RESULT_TTL_MS;
        const timer = setTimeout(() => {
            this._generationResults?.delete(sessionId);
            this.logger.log(`生成结果已过期清理: ${sessionId}`);
        }, ScreenLayoutService_1.RESULT_TTL_MS);
        this._generationResults.set(sessionId, { data, expiresAt, timer });
        this.logger.log(`缓存生成结果: ${sessionId} (TTL=${ScreenLayoutService_1.RESULT_TTL_MS / 60000}min)`);
    }
    _getGenerationResult(sessionId) {
        const entry = this._generationResults?.get(sessionId);
        if (!entry)
            return null;
        if (entry.expiresAt <= Date.now()) {
            clearTimeout(entry.timer);
            this._generationResults?.delete(sessionId);
            return null;
        }
        return entry.data;
    }
    async _runGenerationWorkflow(sessionId, layout) {
        const { runLayoutResponsiveGeneration } = await import('../ai-engine/graphs/layout-responsive-graph.js');
        const onProgress = (data) => {
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
                onTokenUsage: (usage) => {
                    this.progressService.sendProgress(sessionId, {
                        stage: 'token-usage',
                        type: 'metrics',
                        data: usage,
                    });
                },
            });
            this._setGenerationResult(sessionId, {
                ...result,
                _originalLayout: layout,
            });
            this.progressService.sendComplete(sessionId, {
                summary: result.summary,
                codePreview: result.vueCode?.substring(0, 500),
                previewBreakpoints: result.previewBreakpoints || Object.keys(result.previews || {}),
                hasAnalysisResult: !!result.analysisResult,
            });
        }
        catch (error) {
            this.logger.error(`响应式生成失败: ${sessionId}`, error.stack);
            this.progressService.sendError(sessionId, {
                message: error.message || '生成失败',
            });
            throw error;
        }
    }
};
exports.ScreenLayoutService = ScreenLayoutService;
exports.ScreenLayoutService = ScreenLayoutService = ScreenLayoutService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [progress_service_1.ProgressService,
        tasks_service_1.TasksService])
], ScreenLayoutService);
//# sourceMappingURL=screen-layout.service.js.map