import { Injectable, Logger } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import { LiteService } from './lite.service';
import { GenerateLiteDto } from './dto/generate-lite.dto';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { tempComponentsDir } from '../config/backend-root';
import { TasksService } from '../tasks/tasks.service';

/**
 * HTML 大屏拆分服务（DOM 分析 + 显式标记）
 *
 * 识别规则（优先级从高到低）：
 * 1. 显式标记：`data-component` 属性
 * 2. 语义标签：`<section>`, `<article>`, `<aside>`, `<header>`, `<footer>`
 * 3. 布局容器子项：`.grid > *`, `.flex > *`, `.dashboard > *`
 * 4. 常见组件类名：`.card`, `.panel`, `.widget`, `.chart-container`, `.module`
 */
@Injectable()
export class HtmlSplitService {
  private readonly logger = new Logger(HtmlSplitService.name);

  constructor(
    private readonly liteService: LiteService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * 只分析 HTML 中的组件列表（不触发任何生成）
   * 返回每个区块的 htmlContent、name、strategy 等信息，供前端选择后再生成
   */
  analyzeHtml(params: {
    htmlContent: string;
    htmlFileName?: string;
  }): {
    success: boolean;
    totalComponents: number;
    fileName: string;
    previewHtml: string;         // 带标注的完整预览 HTML
    components: Array<{
      index: number;
      name: string;
      strategy: 'explicit' | 'semantic' | 'layout-child' | 'class-name';
      htmlContent: string;       // 该区块的完整 HTML（含样式），可直接传给 generate 接口
    }>;
  } {
    const { htmlContent, htmlFileName } = params;
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    const globalStyles = this.extractGlobalStyles(document);
    const regions = this.identifyComponentRegions(document);

    // 为每个区域注入标注索引
    regions.forEach((region, idx) => {
      region.element.setAttribute('data-split-idx', String(idx));
    });

    // 处理重名：统计每个名字出现的次数，重名的加序号
    const nameCount = new Map<string, number>();
    const components = regions.map((region, idx) => {
      const extractedHtml = this.extractRegionHtml(region, document, globalStyles);
      
      // 获取当前名字的出现次数
      const count = nameCount.get(region.name) || 0;
      nameCount.set(region.name, count + 1);
      
      // 重名时加序号（第一个不加，第二个加 -2，第三个加 -3...）
      const finalName = count === 0 ? region.name : `${region.name}-${count + 1}`;
      
      return {
        index: idx,
        name: finalName,
        strategy: region.strategy,
        htmlContent: extractedHtml,
      };
    });

    // 生成带标注的预览 HTML
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

  /**
   * 根据用户选择的组件列表，逐个生成
   */
  async generateSelectedComponents(params: {
    htmlContent: string;       // 原始完整 HTML（用于重新分析）
    htmlFileName?: string;
    groupId?: string;
    config?: Record<string, any>;
    userId?: string;
    selections: Array<{
      index: number;
      componentType: 'vue3' | 'microcode';
      componentName?: string;
    }>;
  }): Promise<{
    success: boolean;
    totalSelected: number;
    components: Array<{
      sessionId: string;
      name: string;
      type: 'vue3' | 'microcode';
      status: 'pending' | 'running' | 'completed' | 'failed';
      error?: string;
    }>;
  }> {
    const { htmlContent, htmlFileName, groupId, config, userId, selections } = params;
    // 暂无分组概念时按 uid 落到私人组（与 lite.controller 一致）；显式传非 default-group 则尊重。
    const resolvedGroupId =
      groupId && groupId !== 'default-group'
        ? groupId
        : await this.liteService.resolvePrivateGroupId(undefined, userId);

    if (!selections || selections.length === 0) {
      return { success: false, totalSelected: 0, components: [] };
    }

    // 重新分析 HTML 以获取各区块的提取 HTML
    const analysis = this.analyzeHtml({ htmlContent, htmlFileName });
    if (!analysis.success) {
      return { success: false, totalSelected: 0, components: [] };
    }

    const components: Array<{
      sessionId: string;
      name: string;
      type: 'vue3' | 'microcode';
      status: 'pending' | 'running' | 'completed' | 'failed';
      error?: string;
    }> = [];

    const fileName = analysis.fileName;

    for (const sel of selections) {
      const region = analysis.components[sel.index];
      if (!region) continue;

      const componentName = sel.componentName || `${fileName}-${sel.index + 1}`;
      const componentType = sel.componentType;

      const dto = new GenerateLiteDto();
      dto.htmlContent = region.htmlContent;
      dto.htmlFileName = `${componentName}.html`;
      dto.componentName = componentName;
      dto.componentType = componentType;
      dto.groupId = resolvedGroupId;
      dto.config = config;

      const typePrefix = componentType === 'microcode' ? 'mc' : 'mv';
      const sessionId = `${typePrefix}-lite-${Date.now()}-${randomBytes(4).toString('hex')}`;

      this.tasksService.createTask(
        sessionId,
        {
          componentId: sessionId,
          componentName,
          target: componentType,
          groupId: resolvedGroupId,
          panelKey: 'default-panel',
          taskType: 'component',
          userId,
          generationTier: 'lite',
          sourceType: 'html',
          outputPath: join(tempComponentsDir, resolvedGroupId, sessionId),
        },
        'running',
      );

      components.push({
        sessionId,
        name: componentName,
        type: componentType,
        status: 'running',
      });

      // 异步启动生成（不阻塞响应）
      this.startComponentGeneration(sessionId, dto, resolvedGroupId, userId)
        .then(() => {
          const comp = components.find((c) => c.sessionId === sessionId);
          if (comp) comp.status = 'completed';
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

  /**
   * [已废弃] 拆分 HTML 大屏为多个独立组件（旧接口，直接全部生成）
   * 请使用 analyzeHtml + generateSelectedComponents 两步流程
   */
  async splitHtmlScreen(params: {
    htmlContent: string;
    htmlFileName?: string;
    componentType: 'vue3' | 'microcode';
    groupId?: string;
    config?: Record<string, any>;
    userId?: string;
  }): Promise<{
    success: boolean;
    totalComponents: number;
    components: Array<{
      sessionId: string;
      name: string;
      type: string;
      boundingBox?: { x: number; y: number; width: number; height: number };
      status: 'pending' | 'generating' | 'completed' | 'failed';
      error?: string;
    }>;
  }> {
    const { htmlContent, htmlFileName, componentType, groupId, config, userId } = params;
    // 暂无分组概念时按 uid 落到私人组（与 lite.controller 一致）；显式传非 default-group 则尊重。
    const resolvedGroupId =
      groupId && groupId !== 'default-group'
        ? groupId
        : await this.liteService.resolvePrivateGroupId(undefined, userId);

    // 1️⃣ 解析 HTML 并识别组件边界
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    // 收集所有样式表内容（用于提取作用域 CSS）
    const globalStyles = this.extractGlobalStyles(document);

    // 2️⃣ 识别组件区块
    const regions = this.identifyComponentRegions(document);

    if (regions.length === 0) {
      return {
        success: false,
        totalComponents: 0,
        components: [],
      };
    }

    this.logger.log(`🔍 识别到 ${regions.length} 个组件区块`);

    // 3️⃣ 为每个区块生成独立组件
    const components: Array<{
      sessionId: string;
      name: string;
      type: 'microcode' | 'vue3';
      boundingBox?: { x: number; y: number; width: number; height: number };
      status: 'pending' | 'completed' | 'failed';
      error?: string;
    }> = [];

    for (let idx = 0; idx < regions.length; idx++) {
      const region = regions[idx];
      const componentName = `${htmlFileName?.replace(/\.html?$/i, '') || 'screen'}-${idx + 1}`;

      // 提取该区块的 HTML + 作用域 CSS
      const regionHtml = this.extractRegionHtml(region, document, globalStyles);

      // 创建 Lite 生成 DTO
      const dto = new GenerateLiteDto();
      dto.htmlContent = regionHtml;
      dto.htmlFileName = `${componentName}.html`;
      dto.componentName = componentName;
      dto.componentType = componentType;
      dto.groupId = resolvedGroupId;
      dto.config = config;

      // 生成 sessionId
      const typePrefix = componentType === 'microcode' ? 'mc' : 'mv';
      const sessionId = `${typePrefix}-lite-${Date.now()}-${randomBytes(4).toString('hex')}`;

      components.push({
        sessionId,
        name: componentName,
        type: componentType,
        boundingBox: region.boundingBox,
        status: 'pending' as const,
      });

      // 异步启动生成（不阻塞拆分响应）
      this.startComponentGeneration(sessionId, dto, resolvedGroupId, userId)
        .then(() => {
          const comp = components.find((c) => c.sessionId === sessionId);
          if (comp) comp.status = 'completed';
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

  /**
   * 识别 HTML 中的组件区块
   */
  private identifyComponentRegions(document: Document): Region[] {
    const regions: Region[] = [];
    const processedNodes = new Set<Node>();

    // 策略 1：显式标记（优先级最高）
    // 有 data-component 属性 → 用它的值；没有 → 默认 'module'
    const explicitNodes = document.querySelectorAll('[data-component]');
    explicitNodes.forEach((node) => {
      if (!processedNodes.has(node)) {
        regions.push({
          element: node as HTMLElement,
          name: node.getAttribute('data-component') || 'module',
          strategy: 'explicit',
        });
        processedNodes.add(node);
      }
    });

    // 策略 2：语义标签（无 data-component → 默认 module）
    const semanticTags = ['section', 'article', 'aside', 'header', 'footer'];
    const semanticSelector = semanticTags.join(',');
    const semanticNodes = document.querySelectorAll(semanticSelector);
    semanticNodes.forEach((node) => {
      if (!processedNodes.has(node) && this.isSignificantRegion(node as HTMLElement)) {
        regions.push({
          element: node as HTMLElement,
          name: 'module',
          strategy: 'semantic',
        });
        processedNodes.add(node);
      }
    });

    // 策略 3：布局容器子项（Grid/Flex 直接子元素 → 默认 module）
    const layoutContainers = document.querySelectorAll('.grid, .flex, .dashboard, [class*="grid"], [class*="layout"]');
    layoutContainers.forEach((container) => {
      Array.from(container.children).forEach((child) => {
        if (!processedNodes.has(child) && this.isSignificantRegion(child as HTMLElement)) {
          regions.push({
            element: child as HTMLElement,
            name: 'module',
            strategy: 'layout-child',
          });
          processedNodes.add(child);
        }
      });
    });

    // 策略 4：常见组件类名（→ 默认 module）
    const componentClasses = ['.card', '.panel', '.widget', '.chart-container', '.module', '.block', '.item'];
    componentClasses.forEach((cls) => {
      const nodes = document.querySelectorAll(cls);
      nodes.forEach((node) => {
        if (!processedNodes.has(node) && this.isSignificantRegion(node as HTMLElement)) {
          regions.push({
            element: node as HTMLElement,
            name: 'module',
            strategy: 'class-name',
          });
          processedNodes.add(node);
        }
      });
    });

    // 过滤：移除过小或过大的区域
    return regions.filter((r) => this.isValidComponentSize(r.element));
  }

  /**
   * 提取单个区块的 HTML + 作用域 CSS
   */
  private extractRegionHtml(region: Region, document: Document, globalStyles: string): string {
    const { element } = region;

    // 克隆元素以避免修改原始 DOM
    const cloned = element.cloneNode(true) as HTMLElement;

    // 提取相关样式
    const relevantStyles = this.extractRelevantStyles(element, document, globalStyles);

    // 构建完整 HTML（包含样式）
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

  /**
   * 生成带标注的预览 HTML（支持 hover 高亮联动 + 框选组件）
   */
  private generatePreviewHtml(document: Document): string {
    // 克隆整个文档
    const clonedDoc = document.cloneNode(true) as Document;
    
    // 注入高亮样式和交互脚本
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

    // 将样式插入到 <head> 开头
    const head = clonedDoc.querySelector('head');
    if (head) {
      head.insertAdjacentHTML('afterbegin', highlightStyle);
    } else {
      // 如果没有 <head>，创建一个
      const html = clonedDoc.querySelector('html');
      if (html) {
        html.insertAdjacentHTML('afterbegin', `<head>${highlightStyle}</head>`);
      }
    }

    // 返回完整的 HTML 字符串
    return clonedDoc.documentElement.outerHTML;
  }

  /**
   * 提取全局样式表内容
   */
  private extractGlobalStyles(document: Document): string {
    const styles: string[] = [];

    // 内联 <style> 标签
    document.querySelectorAll('style').forEach((style) => {
      styles.push(style.textContent || '');
    });

    return styles.join('\n');
  }

  /**
   * 提取与指定元素相关的样式
   */
  private extractRelevantStyles(element: HTMLElement, document: Document, globalStyles: string): string {
    // 简化实现：返回所有全局样式（后续可优化为精确提取）
    // 精确提取需要解析 CSS 选择器并匹配元素树

    // 收集元素及其祖先的所有类名和 ID
    const relevantSelectors = new Set<string>();
    let current: HTMLElement | null = element;

    while (current) {
      if (current.className && typeof current.className === 'string') {
        current.className.split(/\s+/).forEach((cls) => {
          if (cls) relevantSelectors.add(`.${cls}`);
        });
      }
      if (current.id) {
        relevantSelectors.add(`#${current.id}`);
      }
      current = current.parentElement;
    }

    // 子元素选择器
    element.querySelectorAll('*').forEach((child) => {
      if (child.className && typeof child.className === 'string') {
        child.className.split(/\s+/).forEach((cls) => {
          if (cls) relevantSelectors.add(`.${cls}`);
        });
      }
      if (child.id) {
        relevantSelectors.add(`#${child.id}`);
      }
    });

    // 从全局样式中过滤出相关规则（简化版）
    const lines = globalStyles.split('\n');
    const relevantLines: string[] = [];

    let inRelevantBlock = false;
    for (const line of lines) {
      // 检查是否包含相关选择器
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

    // 如果没有提取到相关样式，返回全部（兜底）
    return relevantLines.length > 0 ? relevantLines.join('\n') : globalStyles;
  }

  /**
   * 推断组件名称（基于类名/标签）
   */
  private inferComponentName(element: HTMLElement): string {
    // 优先使用类名
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(/\s+/);
      const meaningfulClass = classes.find(
        (cls) => cls && !['active', 'selected', 'hidden', 'visible'].includes(cls),
      );
      if (meaningfulClass) {
        return meaningfulClass.toLowerCase().replace(/[^a-z0-9]/g, '-');
      }
    }

    // 兜底使用标签名
    return element.tagName.toLowerCase();
  }

  /**
   * 判断是否为有意义的区域（非纯文本节点、有实际内容）
   */
  private isSignificantRegion(element: HTMLElement): boolean {
    // 检查是否有子元素或较多文本
    const childElements = element.querySelectorAll('*').length;
    const textLength = element.textContent?.trim().length || 0;

    return childElements > 0 || textLength > 20;
  }

  /**
   * 检查组件尺寸是否合理（避免过小或过大）
   */
  private isValidComponentSize(element: HTMLElement): boolean {
    // 检查元素是否有实际的尺寸信息（通过内联样式或类名推断）
    const style = element.getAttribute('style') || '';
    const hasSizeHint = /width|height|grid|flex/i.test(style);

    // 或者检查子元素数量（避免空容器）
    const childCount = element.children.length;

    return hasSizeHint || childCount > 0;
  }

  /**
   * 启动单个组件的生成流程
   */
  private async startComponentGeneration(
    sessionId: string,
    dto: GenerateLiteDto,
    groupId: string,
    userId: string | undefined,
  ): Promise<void> {
    this.logger.log(`🚀 开始生成组件 ${sessionId}`);

    await this.liteService.startGeneration(sessionId, dto, groupId, userId, {
      sourceType: 'html',
      componentType: dto.componentType as 'vue3' | 'microcode',
      generationTier: 'lite',
    });

    this.logger.log(`✅ 组件生成完成 ${sessionId}`);
  }
}

/**
 * 识别到的组件区块
 */
interface Region {
  element: HTMLElement;
  name: string;
  strategy: 'explicit' | 'semantic' | 'layout-child' | 'class-name';
  boundingBox?: { x: number; y: number; width: number; height: number };
}
