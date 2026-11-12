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
var HtmlSplitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HtmlSplitService = void 0;
const common_1 = require("@nestjs/common");
const jsdom_1 = require("jsdom");
const lite_service_1 = require("./lite.service");
const generate_lite_dto_1 = require("./dto/generate-lite.dto");
const crypto_1 = require("crypto");
const path_1 = require("path");
const backend_root_1 = require("../config/backend-root");
const tasks_service_1 = require("../tasks/tasks.service");
let HtmlSplitService = HtmlSplitService_1 = class HtmlSplitService {
    liteService;
    tasksService;
    logger = new common_1.Logger(HtmlSplitService_1.name);
    constructor(liteService, tasksService) {
        this.liteService = liteService;
        this.tasksService = tasksService;
    }
    analyzeHtml(params) {
        const { htmlContent, htmlFileName } = params;
        const dom = new jsdom_1.JSDOM(htmlContent);
        const document = dom.window.document;
        const globalStyles = this.extractGlobalStyles(document);
        const regions = this.identifyComponentRegions(document);
        regions.forEach((region, idx) => {
            region.element.setAttribute('data-split-idx', String(idx));
        });
        const nameCount = new Map();
        const components = regions.map((region, idx) => {
            const extractedHtml = this.extractRegionHtml(region, document, globalStyles);
            const count = nameCount.get(region.name) || 0;
            nameCount.set(region.name, count + 1);
            const finalName = count === 0 ? region.name : `${region.name}-${count + 1}`;
            return {
                index: idx,
                name: finalName,
                strategy: region.strategy,
                htmlContent: extractedHtml,
            };
        });
        const previewHtml = this.generatePreviewHtml(document);
        const fileName = (htmlFileName || 'screen').replace(/\.html?$/i, '');
        return {
            success: true,
            totalComponents: components.length,
            fileName,
            previewHtml,
            components,
        };
    }
    async generateSelectedComponents(params) {
        const { htmlContent, htmlFileName, groupId, config, userId, selections } = params;
        const resolvedGroupId = groupId && groupId !== 'default-group'
            ? groupId
            : await this.liteService.resolvePrivateGroupId(undefined, userId);
        if (!selections || selections.length === 0) {
            return { success: false, totalSelected: 0, components: [] };
        }
        const analysis = this.analyzeHtml({ htmlContent, htmlFileName });
        if (!analysis.success) {
            return { success: false, totalSelected: 0, components: [] };
        }
        const components = [];
        const fileName = analysis.fileName;
        for (const sel of selections) {
            const region = analysis.components[sel.index];
            if (!region)
                continue;
            const componentName = sel.componentName || `${fileName}-${sel.index + 1}`;
            const componentType = sel.componentType;
            const dto = new generate_lite_dto_1.GenerateLiteDto();
            dto.htmlContent = region.htmlContent;
            dto.htmlFileName = `${componentName}.html`;
            dto.componentName = componentName;
            dto.componentType = componentType;
            dto.groupId = resolvedGroupId;
            dto.config = config;
            const typePrefix = componentType === 'microcode' ? 'mc' : 'mv';
            const sessionId = `${typePrefix}-lite-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
            this.tasksService.createTask(sessionId, {
                componentId: sessionId,
                componentName,
                target: componentType,
                groupId: resolvedGroupId,
                panelKey: 'default-panel',
                taskType: 'component',
                userId,
                generationTier: 'lite',
                sourceType: 'html',
                outputPath: (0, path_1.join)(backend_root_1.tempComponentsDir, resolvedGroupId, sessionId),
            }, 'running');
            components.push({
                sessionId,
                name: componentName,
                type: componentType,
                status: 'running',
            });
            this.startComponentGeneration(sessionId, dto, resolvedGroupId, userId)
                .then(() => {
                const comp = components.find((c) => c.sessionId === sessionId);
                if (comp)
                    comp.status = 'completed';
            })
                .catch((err) => {
                const comp = components.find((c) => c.sessionId === sessionId);
                if (comp) {
                    comp.status = 'failed';
                    comp.error = err.message;
                }
            });
        }
        return {
            success: true,
            totalSelected: selections.length,
            components,
        };
    }
    async splitHtmlScreen(params) {
        const { htmlContent, htmlFileName, componentType, groupId, config, userId } = params;
        const resolvedGroupId = groupId && groupId !== 'default-group'
            ? groupId
            : await this.liteService.resolvePrivateGroupId(undefined, userId);
        const dom = new jsdom_1.JSDOM(htmlContent);
        const document = dom.window.document;
        const globalStyles = this.extractGlobalStyles(document);
        const regions = this.identifyComponentRegions(document);
        if (regions.length === 0) {
            return {
                success: false,
                totalComponents: 0,
                components: [],
            };
        }
        this.logger.log(`🔍 识别到 ${regions.length} 个组件区块`);
        const components = [];
        for (let idx = 0; idx < regions.length; idx++) {
            const region = regions[idx];
            const componentName = `${htmlFileName?.replace(/\.html?$/i, '') || 'screen'}-${idx + 1}`;
            const regionHtml = this.extractRegionHtml(region, document, globalStyles);
            const dto = new generate_lite_dto_1.GenerateLiteDto();
            dto.htmlContent = regionHtml;
            dto.htmlFileName = `${componentName}.html`;
            dto.componentName = componentName;
            dto.componentType = componentType;
            dto.groupId = resolvedGroupId;
            dto.config = config;
            const typePrefix = componentType === 'microcode' ? 'mc' : 'mv';
            const sessionId = `${typePrefix}-lite-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`;
            components.push({
                sessionId,
                name: componentName,
                type: componentType,
                boundingBox: region.boundingBox,
                status: 'pending',
            });
            this.startComponentGeneration(sessionId, dto, resolvedGroupId, userId)
                .then(() => {
                const comp = components.find((c) => c.sessionId === sessionId);
                if (comp)
                    comp.status = 'completed';
            })
                .catch((err) => {
                const comp = components.find((c) => c.sessionId === sessionId);
                if (comp) {
                    comp.status = 'failed';
                    comp.error = err.message;
                }
            });
        }
        return {
            success: true,
            totalComponents: regions.length,
            components,
        };
    }
    identifyComponentRegions(document) {
        const regions = [];
        const processedNodes = new Set();
        const explicitNodes = document.querySelectorAll('[data-component]');
        explicitNodes.forEach((node) => {
            if (!processedNodes.has(node)) {
                regions.push({
                    element: node,
                    name: node.getAttribute('data-component') || 'module',
                    strategy: 'explicit',
                });
                processedNodes.add(node);
            }
        });
        const semanticTags = ['section', 'article', 'aside', 'header', 'footer'];
        const semanticSelector = semanticTags.join(',');
        const semanticNodes = document.querySelectorAll(semanticSelector);
        semanticNodes.forEach((node) => {
            if (!processedNodes.has(node) && this.isSignificantRegion(node)) {
                regions.push({
                    element: node,
                    name: 'module',
                    strategy: 'semantic',
                });
                processedNodes.add(node);
            }
        });
        const layoutContainers = document.querySelectorAll('.grid, .flex, .dashboard, [class*="grid"], [class*="layout"]');
        layoutContainers.forEach((container) => {
            Array.from(container.children).forEach((child) => {
                if (!processedNodes.has(child) && this.isSignificantRegion(child)) {
                    regions.push({
                        element: child,
                        name: 'module',
                        strategy: 'layout-child',
                    });
                    processedNodes.add(child);
                }
            });
        });
        const componentClasses = ['.card', '.panel', '.widget', '.chart-container', '.module', '.block', '.item'];
        componentClasses.forEach((cls) => {
            const nodes = document.querySelectorAll(cls);
            nodes.forEach((node) => {
                if (!processedNodes.has(node) && this.isSignificantRegion(node)) {
                    regions.push({
                        element: node,
                        name: 'module',
                        strategy: 'class-name',
                    });
                    processedNodes.add(node);
                }
            });
        });
        return regions.filter((r) => this.isValidComponentSize(r.element));
    }
    extractRegionHtml(region, document, globalStyles) {
        const { element } = region;
        const cloned = element.cloneNode(true);
        const relevantStyles = this.extractRelevantStyles(element, document, globalStyles);
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* 作用域样式 */
    ${relevantStyles}
  </style>
</head>
<body>
  ${cloned.outerHTML}
</body>
</html>`;
    }
    generatePreviewHtml(document) {
        const clonedDoc = document.cloneNode(true);
        const highlightStyle = `
<style>
[data-split-idx] {
  transition: outline 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
}
[data-split-idx]:hover {
  outline: 2px solid #3b82f6 !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}
[data-split-idx].highlighted {
  outline: 3px solid #10b981 !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.15);
}
[data-split-idx].clicked-highlighted {
  outline: 3px solid #f59e0b !important;
  outline-offset: 3px;
  box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.18);
}

/* 框选模式样式 */
.selection-mode-active {
  cursor: crosshair !important;
}
.selection-mode-active [data-split-idx] {
  cursor: crosshair !important;
}
.selection-rect {
  position: fixed;
  border: 2px dashed #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  pointer-events: none;
  z-index: 9999;
  transition: none;
}
.selection-mode-banner {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: #f59e0b;
  color: #fff;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  display: none;
}
.selection-mode-banner.visible {
  display: block;
}
</style>
<script>
(function() {
  let selectionMode = false;
  let isDrawing = false;
  let startX = 0, startY = 0;
  let selectionRect = null;
  let banner = null;

  // 创建提示横幅
  function createBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.className = 'selection-mode-banner';
    banner.textContent = '框选模式：按住鼠标拖动选择区域';
    document.body.appendChild(banner);
    return banner;
  }

  // 监听来自父窗口的消息
  window.addEventListener('message', function(event) {
    const { type, idx } = event.data || {};
    
    // hover / click 高亮
    if (type === 'highlight' || type === 'unhighlight' || type === 'click-highlight') {
      const el = document.querySelector('[data-split-idx="' + idx + '"]');
      if (!el) return;
      if (type === 'highlight') {
        // 悬停只高亮，不滚动预览，避免列表 hover 引起页面跳动。
        el.classList.add('highlighted');
      } else if (type === 'click-highlight') {
        document.querySelectorAll('[data-split-idx].clicked-highlighted').forEach(function(node) {
          node.classList.remove('clicked-highlighted');
        });
        el.classList.add('clicked-highlighted');
        el.classList.add('highlighted');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        el.classList.remove('highlighted');
      }
    }
    
    // 进入框选模式
    else if (type === 'enter-selection-mode') {
      selectionMode = true;
      document.body.classList.add('selection-mode-active');
      createBanner().classList.add('visible');
    }
    
    // 退出框选模式
    else if (type === 'exit-selection-mode') {
      selectionMode = false;
      document.body.classList.remove('selection-mode-active');
      if (banner) banner.classList.remove('visible');
      if (selectionRect) {
        selectionRect.remove();
        selectionRect = null;
      }
    }
  });
  
  // 框选模式：鼠标事件
  document.addEventListener('mousedown', function(e) {
    if (!selectionMode) return;
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    
    // 创建选择矩形
    selectionRect = document.createElement('div');
    selectionRect.className = 'selection-rect';
    selectionRect.style.left = startX + 'px';
    selectionRect.style.top = startY + 'px';
    selectionRect.style.width = '0';
    selectionRect.style.height = '0';
    document.body.appendChild(selectionRect);
    
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isDrawing || !selectionRect) return;
    
    const currentX = e.clientX;
    const currentY = e.clientY;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    selectionRect.style.left = Math.min(startX, currentX) + 'px';
    selectionRect.style.top = Math.min(startY, currentY) + 'px';
    selectionRect.style.width = width + 'px';
    selectionRect.style.height = height + 'px';
    
    e.preventDefault();
  });
  
  document.addEventListener('mouseup', function(e) {
    if (!isDrawing || !selectionRect) return;
    isDrawing = false;
    
    const endX = e.clientX;
    const endY = e.clientY;
    const rect = {
      left: Math.min(startX, endX),
      top: Math.min(startY, endY),
      right: Math.max(startX, endX),
      bottom: Math.max(startY, endY),
    };
    
    // 查找框选区域内的所有元素
    const selectedElements = [];
    document.querySelectorAll('[data-split-idx]').forEach(function(el) {
      const r = el.getBoundingClientRect();
      // 元素中心点在框选区域内
      const centerX = r.left + r.width / 2;
      const centerY = r.top + r.height / 2;
      if (centerX >= rect.left && centerX <= rect.right && 
          centerY >= rect.top && centerY <= rect.bottom) {
        selectedElements.push(el);
      }
    });
    
    // 如果有选中的元素，生成 CSS 选择器和 HTML
    if (selectedElements.length > 0) {
      // 生成包围所有选中元素的最小容器的 CSS 选择器
      let commonAncestor = selectedElements[0];
      for (let i = 1; i < selectedElements.length; i++) {
        let parent = selectedElements[i].parentNode;
        while (parent && !parent.contains(commonAncestor)) {
          parent = parent.parentNode;
        }
        if (parent) commonAncestor = parent;
      }
      
      // 生成 CSS 选择器（简化版）
      let cssSelector = '';
      if (commonAncestor.tagName) {
        cssSelector = commonAncestor.tagName.toLowerCase();
        if (commonAncestor.id) {
          cssSelector += '#' + commonAncestor.id;
        } else if (commonAncestor.className) {
          const classes = commonAncestor.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            cssSelector += '.' + classes.join('.');
          }
        }
      }
      
      // 提取 HTML 内容
      const htmlContent = commonAncestor.outerHTML;
      
      // 发送给父窗口
      window.parent.postMessage({
        type: 'selection-complete',
        cssSelector: cssSelector,
        htmlContent: htmlContent,
      }, '*');
    }
    
    // 清理选择矩形
    if (selectionRect) {
      selectionRect.remove();
      selectionRect = null;
    }
  });
  
  // 向父窗口广播 hover 事件
  document.querySelectorAll('[data-split-idx]').forEach(function(el) {
    el.addEventListener('mouseenter', function() {
      if (selectionMode) return; // 框选模式下不触发 hover
      const idx = this.getAttribute('data-split-idx');
      window.parent.postMessage({ type: 'hover', idx: idx }, '*');
    });
    el.addEventListener('mouseleave', function() {
      if (selectionMode) return;
      const idx = this.getAttribute('data-split-idx');
      window.parent.postMessage({ type: 'hover-end', idx: idx }, '*');
    });
  });

  // 上报文档高度给父窗口，用于 iframe 自适应高度
  function reportHeight() {
    var h = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    );
    window.parent.postMessage({ type: 'doc-height', height: h }, '*');
  }
  // 初始上报 + 延迟上报（等待外部资源）
  if (document.readyState === 'complete') { reportHeight(); }
  else { window.addEventListener('load', reportHeight); }
  setTimeout(reportHeight, 500);
  setTimeout(reportHeight, 2000);
})();
</script>
`;
        const head = clonedDoc.querySelector('head');
        if (head) {
            head.insertAdjacentHTML('afterbegin', highlightStyle);
        }
        else {
            const html = clonedDoc.querySelector('html');
            if (html) {
                html.insertAdjacentHTML('afterbegin', `<head>${highlightStyle}</head>`);
            }
        }
        return clonedDoc.documentElement.outerHTML;
    }
    extractGlobalStyles(document) {
        const styles = [];
        document.querySelectorAll('style').forEach((style) => {
            styles.push(style.textContent || '');
        });
        return styles.join('\n');
    }
    extractRelevantStyles(element, document, globalStyles) {
        const relevantSelectors = new Set();
        let current = element;
        while (current) {
            if (current.className && typeof current.className === 'string') {
                current.className.split(/\s+/).forEach((cls) => {
                    if (cls)
                        relevantSelectors.add(`.${cls}`);
                });
            }
            if (current.id) {
                relevantSelectors.add(`#${current.id}`);
            }
            current = current.parentElement;
        }
        element.querySelectorAll('*').forEach((child) => {
            if (child.className && typeof child.className === 'string') {
                child.className.split(/\s+/).forEach((cls) => {
                    if (cls)
                        relevantSelectors.add(`.${cls}`);
                });
            }
            if (child.id) {
                relevantSelectors.add(`#${child.id}`);
            }
        });
        const lines = globalStyles.split('\n');
        const relevantLines = [];
        let inRelevantBlock = false;
        for (const line of lines) {
            const hasRelevantSelector = Array.from(relevantSelectors).some((sel) => line.includes(sel));
            if (hasRelevantSelector || line.trim().startsWith('/*')) {
                inRelevantBlock = true;
            }
            if (inRelevantBlock) {
                relevantLines.push(line);
                if (line.includes('}')) {
                    inRelevantBlock = false;
                }
            }
        }
        return relevantLines.length > 0 ? relevantLines.join('\n') : globalStyles;
    }
    inferComponentName(element) {
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.split(/\s+/);
            const meaningfulClass = classes.find((cls) => cls && !['active', 'selected', 'hidden', 'visible'].includes(cls));
            if (meaningfulClass) {
                return meaningfulClass.toLowerCase().replace(/[^a-z0-9]/g, '-');
            }
        }
        return element.tagName.toLowerCase();
    }
    isSignificantRegion(element) {
        const childElements = element.querySelectorAll('*').length;
        const textLength = element.textContent?.trim().length || 0;
        return childElements > 0 || textLength > 20;
    }
    isValidComponentSize(element) {
        const style = element.getAttribute('style') || '';
        const hasSizeHint = /width|height|grid|flex/i.test(style);
        const childCount = element.children.length;
        return hasSizeHint || childCount > 0;
    }
    async startComponentGeneration(sessionId, dto, groupId, userId) {
        this.logger.log(`🚀 开始生成组件 ${sessionId}`);
        await this.liteService.startGeneration(sessionId, dto, groupId, userId, {
            sourceType: 'html',
            componentType: dto.componentType,
            generationTier: 'lite',
        });
        this.logger.log(`✅ 组件生成完成 ${sessionId}`);
    }
};
exports.HtmlSplitService = HtmlSplitService;
exports.HtmlSplitService = HtmlSplitService = HtmlSplitService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [lite_service_1.LiteService,
        tasks_service_1.TasksService])
], HtmlSplitService);
//# sourceMappingURL=html-split.service.js.map