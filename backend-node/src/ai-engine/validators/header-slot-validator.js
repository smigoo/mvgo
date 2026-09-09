/**
 * 头部插槽验证器
 * 基于Figma节点Y坐标验证头部插槽，避免硬编码关键词判断
 */

import { createLogger } from '../logger/index.js';

const logger = createLogger({ name: 'header-slot-validator' });

/**
 * 头部插槽验证器
 */
export class HeaderSlotValidator {
  constructor(figmaConnector) {
    this.figmaConnector = figmaConnector;
  }

  /**
   * 基于Figma节点坐标验证头部插槽
   * @param {Object} figmaNodeData - Figma节点树
   * @param {Array} headerSlotsFromPreview - 预览图分析的插槽候选
   * @param {Object} options - 配置选项
   * @param {string} options.componentType - 组件类型: 'microcode' | 'vue3'，默认 'microcode'
   * @returns {Object} 验证结果
   */
  validateHeaderSlots(
    figmaNodeData,
    headerSlotsFromPreview = [],
    options = {},
  ) {
    const componentType = options.componentType || 'microcode';

    const result = {
      validatedSlots: [],
      rejectedNodes: [],
      warnings: [],
      componentType,
    };

    // Vue3 组件：不做插槽验证（Vue3 没有 base-panel 插槽），
    // 只做同行节点检测（确保标题栏控件不被遗漏）
    if (componentType === 'vue3') {
      logger.info('Vue3 组件: 跳过微码插槽验证，仅检测标题栏控件完整性');
      const vue3Result = this._validateVue3HeaderControls(
        figmaNodeData,
        headerSlotsFromPreview,
        options,
        result,
      );
      // 契约推导同样执行（vue3 不消费 base-panel 插槽，但 state 数据双端一致，
      // 结构标记/文字清单链路可复用；无任何 prompt 副作用）
      try {
        const derived = this.deriveHeaderSlotsFromFigma(figmaNodeData);
        vue3Result.derivedSlots = derived;
        vue3Result.contractSlots = derived;
        if (derived.length > 0) {
          logger.info(
            `✅ vue3 headerSlots 契约推导: ${derived.length} 个（仅记录，不进 base-panel 插槽）`,
          );
        }
      } catch {
        /* 非阻塞 */
      }
      return vue3Result;
    }

    // 微码组件：完整的插槽验证流程
    // 步骤1：定位标题节点
    const titleNode = this.figmaConnector.findPanelTitleNode(figmaNodeData);
    if (!titleNode) {
      result.warnings.push('未找到面板标题节点');
      logger.warn('未找到面板标题节点，跳过头部插槽验证');
      return result;
    }

    logger.info(`找到标题节点: "${titleNode.name}"`);

    // 继续验证逻辑...
    const validated = this._performValidation(
      figmaNodeData,
      titleNode,
      headerSlotsFromPreview,
      options,
      result,
    );

    // 🎯 契约推导：不依赖 vision 候选——vision 漏识别（headerSlots=[]）时 validatedSlots 恒空。
    // 从 Figma header 容器确定性推导 declare/prompt 契约形态的插槽，供图节点回写 state.headerSlots。
    try {
      const derived = this.deriveHeaderSlotsFromFigma(figmaNodeData, titleNode);
      result.derivedSlots = derived;
      const byId = new Map();
      for (const d of derived) byId.set(d.figmaNodeId || d.content, d);
      // validated 候选（vision 提出且验证通过）优先于推导值
      for (const v of result.validatedSlots || []) {
        const c = this._validatedToContract(v);
        if (c && !byId.has(c.figmaNodeId || c.content))
          byId.set(c.figmaNodeId || c.content, c);
      }
      result.contractSlots = [...byId.values()];
      if (result.contractSlots.length > 0) {
        logger.info(
          `✅ headerSlots 契约推导完成: ${result.contractSlots.length} 个`,
          {
            slots: result.contractSlots.map(
              (s) =>
                `${s.slotType}/${s.elementType}: ${String(s.content).slice(0, 20)}`,
            ),
          },
        );
      }
    } catch (err) {
      logger.warn('headerSlots 契约推导失败（非阻塞）', { error: err.message });
    }

    return validated;
  }

  /**
   * 从 Figma header 容器确定性推导 headerSlots（vision 契约形态，零臆造）。
   * 形态：{ slotType: 'title-left|title-right|header-right', elementType, content, figmaNodeId }
   * 通用规则（无组件特例）：
   *   - 子树含数字文本的容器 → statistic（header-right，content 按 x 坐标拼接 label+value）
   *   - tab/switch/segmented 命名 → tab（header-right）
   *   - COMPONENT/INSTANCE/icon 命名且无文本 → icon（title-left）
   *   - 纯小字文本（非注释、非标题）→ label（title-right）
   *   - 设计师注释（* / # 开头、TODO/标注）与面板标题自身 → 排除
   *
   * 🆕 v3.1 优化：按 X 坐标和间距智能分类插槽位置
   */
  deriveHeaderSlotsFromFigma(figmaNodeData, titleNode = null) {
    const container = this.figmaConnector.findHeaderContainer(figmaNodeData);
    const isAnnotation = (t) =>
      /^[*#]/.test(t) || /TODO|FIXME|标注|备注/.test(t);
    const slots = [];

    const collectTexts = (node, acc) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'TEXT' && typeof node.characters === 'string') {
        const t = node.characters.trim();
        if (t)
          acc.push({
            text: t,
            x: node.absoluteBoundingBox?.x ?? 0,
            size: node.style?.fontSize ?? 14,
            id: node.id,
          });
      }
      if (Array.isArray(node.children))
        node.children.forEach((c) => collectTexts(c, acc));
    };

    // 标题自判：header 容器内 x 最靠左的 meaningful 文本（面板标题惯例居左；
    // 不依赖外部 titleNode——大屏设计中数值字号常大于标题，id 匹配会错位）
    let titleText = '';
    let titleRight = 0;
    if (container) {
      const all = [];
      collectTexts(container, all);
      const meaningfulAll = all
        .filter((t) => !isAnnotation(t.text))
        .sort((a, b) => a.x - b.x);
      if (meaningfulAll.length > 0) {
        titleText = meaningfulAll[0].text;
        // 计算标题右边界（用于后续判断插槽位置）
        const titleNode = this._findNodeByText(container, titleText);
        if (titleNode?.absoluteBoundingBox) {
          titleRight =
            titleNode.absoluteBoundingBox.x +
            titleNode.absoluteBoundingBox.width;
        }
      }
    } else if (titleNode) {
      titleText = String(titleNode.characters || '').trim();
      if (titleNode.absoluteBoundingBox) {
        titleRight =
          titleNode.absoluteBoundingBox.x + titleNode.absoluteBoundingBox.width;
      }
    }

    const sources =
      Array.isArray(container?.children) && container.children.length > 0
        ? container.children
        : [];

    for (const child of sources) {
      if (!child) continue;
      const name = String(child.name || '').toLowerCase();
      const texts = [];
      collectTexts(child, texts);
      const meaningful = texts
        .filter((t) => !isAnnotation(t.text) && t.text !== titleText)
        .sort((a, b) => a.x - b.x);

      // 🆕 计算元素与标题的距离，用于智能分类
      const childX = child.absoluteBoundingBox?.x ?? 0;
      const gapFromTitle = titleRight > 0 ? childX - titleRight : 0;

      // 🆕 距离阈值：<16px 为 title-right（紧贴），>=16px 为 header-right（远离）
      const CLOSE_GAP_THRESHOLD = 16;

      if (meaningful.length === 0) {
        if (/tab|switch|segmented/.test(name)) {
          slots.push({
            slotType: 'header-right',
            elementType: 'tab',
            content: '标签页切换控件',
            figmaNodeId: child.id,
          });
        } else if (
          child.type === 'COMPONENT' ||
          child.type === 'INSTANCE' ||
          /icon/.test(name)
        ) {
          // 图标根据位置判断：在标题左侧为 title-left，否则为 header-right
          const slotType = childX < titleRight ? 'title-left' : 'header-right';
          slots.push({
            slotType,
            elementType: 'icon',
            content: '装饰图标',
            figmaNodeId: child.id,
          });
        }
        continue;
      }

      const joined = meaningful.map((t) => t.text).join(' ');

      // 🆕 智能分类：包含数字的统计指标通常在 header-right
      // 🛡️ P2-2（2026-08-30）：含数字就一律判 statistic 会误伤「距标题很近的 tab/segmented
      // 控件」——设计里标签页常带数字角标/计数（如「监测类型 12」），本质是内容筛选控件
      // 而非统计指标。距标题 <80px 且节点名是 tab/segmented/switch → 判 tab，不再判 statistic。
      if (/\d/.test(joined)) {
        const isTabLikeControl = /tab|switch|segmented/.test(name);
        const nearTitle = gapFromTitle >= 0 && gapFromTitle < 80;
        if (isTabLikeControl && nearTitle) {
          slots.push({
            slotType: 'header-right',
            elementType: 'tab',
            content: joined,
            figmaNodeId: child.id,
            _gap: gapFromTitle,
          });
        } else {
          slots.push({
            slotType: 'header-right',
            elementType: 'statistic',
            content: joined,
            figmaNodeId: child.id,
            _gap: gapFromTitle, // 调试用
          });
        }
      } else {
        // 🆕 纯文本根据距离判断：紧贴标题为 title-right，远离为 header-right
        const slotType =
          gapFromTitle > 0 && gapFromTitle < CLOSE_GAP_THRESHOLD
            ? 'title-right'
            : 'header-right';
        slots.push({
          slotType,
          elementType: 'label',
          content: joined,
          figmaNodeId: child.id,
          _gap: gapFromTitle, // 调试用
        });
      }
    }

    // 🆕 记录分类结果
    if (slots.length > 0) {
      logger.info('✅ 插槽智能分类完成', {
        titleRight,
        slots: slots.map(
          (s) =>
            `${s.slotType}/${s.elementType}: "${s.content.slice(0, 20)}" (gap: ${s._gap || 'N/A'})`,
        ),
      });
    }

    return slots;
  }

  /**
   * 🆕 辅助方法：根据文本内容查找节点
   * @private
   */
  _findNodeByText(container, text) {
    let found = null;
    const walk = (node) => {
      if (found) return;
      if (node.type === 'TEXT' && node.characters?.trim() === text) {
        found = node;
        return;
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(walk);
      }
    };
    walk(container);
    return found;
  }

  /** validated 候选 → 契约形态转换（slotType 透传 vision 候选值；content 从 figmaNode 子树文本提取） */
  _validatedToContract(v) {
    if (!v) return null;
    const controlMap = {
      统计指标: 'statistic',
      Tab切换: 'tab',
      图标操作: 'icon',
      辅助文字: 'label',
    };
    let content = '';
    if (v.figmaNode) {
      const acc = [];
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (
          n.type === 'TEXT' &&
          typeof n.characters === 'string' &&
          n.characters.trim()
        )
          acc.push(n.characters.trim());
        if (Array.isArray(n.children)) n.children.forEach(walk);
      };
      walk(v.figmaNode);
      content = acc.slice(0, 4).join(' ');
    }
    const slotType =
      String(v.slotType || '').replace('_', '-') || 'header-right';
    return {
      slotType,
      elementType: controlMap[v.controlType] || 'label',
      content: content || v.controlType || '',
      figmaNodeId: v.figmaNode?.id,
    };
  }

  /**
   * Vue3 专属：验证标题栏控件完整性（不检查插槽，只确保控件不被遗漏）
   * @private
   */
  _validateVue3HeaderControls(
    figmaNodeData,
    headerSlotsFromPreview,
    options,
    result,
  ) {
    // 步骤1：定位标题节点
    const titleNode = this.figmaConnector.findPanelTitleNode(figmaNodeData);
    if (!titleNode) {
      result.warnings.push('未找到面板标题节点');
      logger.info('Vue3: 未找到标题节点，跳过控件完整性检查');
      return result;
    }

    logger.info(`Vue3: 找到标题节点: "${titleNode.name}"`);

    // 步骤2：获取header容器和动态计算阈值
    const headerContainer =
      this.figmaConnector.findHeaderContainer(figmaNodeData);
    const headerHeight = headerContainer?.absoluteBoundingBox?.height || 40;
    const THRESHOLD_RATIO = options.thresholdRatio || 0.3;
    const SAME_ROW_THRESHOLD = Math.round(headerHeight * THRESHOLD_RATIO);

    // 步骤3：计算标题baseline和同行范围
    const bbox = titleNode.absoluteBoundingBox;
    const titleBaseline = bbox.y + bbox.height / 2;
    const sameRowRange = {
      min: titleBaseline - SAME_ROW_THRESHOLD,
      max: titleBaseline + SAME_ROW_THRESHOLD,
    };

    // 步骤4：筛选同行节点
    const sameRowNodes = this._findSameRowNodes(
      figmaNodeData,
      titleNode,
      titleBaseline,
      sameRowRange,
    );
    logger.info(`Vue3: 找到 ${sameRowNodes.length} 个标题栏同行节点`);

    // 步骤5：检测是否有控件在预览分析中被遗漏
    this._checkVue3ControlCompleteness(
      sameRowNodes,
      headerSlotsFromPreview,
      result,
    );

    return result;
  }

  /**
   * Vue3 专属：检查标题栏控件是否完整（不遗漏）
   * @private
   */
  _checkVue3ControlCompleteness(sameRowNodes, headerSlotsFromPreview, result) {
    // 对每个同行节点，检查是否在预览分析的 headerSlots 中有对应
    // Vue3 中这些控件应该渲染为真实 DOM，不需要放入插槽
    sameRowNodes.forEach(({ node, yOffset }) => {
      const nodeName = node.name?.toLowerCase() || '';

      // 判断这个节点是否是重要的控件（按钮、Tab、统计指标等）
      const isImportantControl =
        node.type === 'COMPONENT' ||
        node.type === 'INSTANCE' ||
        nodeName.includes('button') ||
        nodeName.includes('tab') ||
        nodeName.includes('icon') ||
        nodeName.includes('switch') ||
        (node.type === 'TEXT' && /\d+/.test(node.characters || ''));

      if (isImportantControl) {
        // 检查是否在预览分析中被识别
        const matchedInPreview = headerSlotsFromPreview?.some(
          (slot) =>
            slot.controlType &&
            (slot.controlType.includes('Tab') ||
              slot.controlType.includes('统计') ||
              slot.controlType.includes('图标')),
        );

        if (!matchedInPreview) {
          result.warnings.push(
            `Vue3: Figma 标题栏发现控件"${node.name}" (Y偏移: ${yOffset.toFixed(1)}px)，请确保在 <template> 中渲染为真实 DOM`,
          );
        }
      }
    });
  }

  /**
   * 执行验证逻辑
   * @private
   */
  _performValidation(
    figmaNodeData,
    titleNode,
    headerSlotsFromPreview,
    options,
    result,
  ) {
    // 步骤2：获取header容器和动态计算阈值
    const headerContainer =
      this.figmaConnector.findHeaderContainer(figmaNodeData);
    const headerHeight = headerContainer?.absoluteBoundingBox?.height || 40;
    const THRESHOLD_RATIO = options.thresholdRatio || 0.3;
    const SAME_ROW_THRESHOLD = Math.round(headerHeight * THRESHOLD_RATIO);

    logger.info(
      `Header高度: ${headerHeight}px, Y坐标阈值: ±${SAME_ROW_THRESHOLD}px`,
    );

    // 步骤3：计算标题baseline和同行范围
    const bbox = titleNode.absoluteBoundingBox;
    const titleBaseline = bbox.y + bbox.height / 2;
    const sameRowRange = {
      min: titleBaseline - SAME_ROW_THRESHOLD,
      max: titleBaseline + SAME_ROW_THRESHOLD,
    };

    logger.info(
      `标题baseline: ${titleBaseline.toFixed(1)}px, 同行范围: [${sameRowRange.min.toFixed(1)}, ${sameRowRange.max.toFixed(1)}]`,
    );

    // 步骤4：筛选同行节点
    const sameRowNodes = this._findSameRowNodes(
      figmaNodeData,
      titleNode,
      titleBaseline,
      sameRowRange,
    );

    logger.info(`找到${sameRowNodes.length}个同行节点`);

    // 步骤5：匹配预览图插槽候选
    this._matchSlotCandidates(sameRowNodes, headerSlotsFromPreview, result);

    // 步骤6：检测未匹配的同行节点
    this._checkUnmatchedNodes(sameRowNodes, result);

    return result;
  }

  /**
   * 查找与标题同行的节点
   * @private
   */
  _findSameRowNodes(figmaNodeData, titleNode, titleBaseline, sameRowRange) {
    const sameRowNodes = [];

    this.figmaConnector.traverseFigmaTree(figmaNodeData, (node) => {
      // 跳过标题自身
      if (node.id === titleNode.id) return;

      const bbox = node.absoluteBoundingBox;
      if (!bbox || !bbox.y || !bbox.height) return;

      const nodeBaseline = bbox.y + bbox.height / 2;
      const yOffset = Math.abs(nodeBaseline - titleBaseline);

      // 判断是否在同行范围内
      if (
        nodeBaseline >= sameRowRange.min &&
        nodeBaseline <= sameRowRange.max
      ) {
        // 只收集可能是插槽控件的节点
        if (this.figmaConnector.isLikelySlotControl(node)) {
          sameRowNodes.push({
            node,
            yOffset,
            baseline: nodeBaseline,
          });
          logger.debug(
            `同行节点: "${node.name}" (Y偏移: ${yOffset.toFixed(1)}px)`,
          );
        }
      }
    });

    return sameRowNodes;
  }

  /**
   * 匹配预览图插槽候选与Figma节点
   * @private
   */
  _matchSlotCandidates(sameRowNodes, headerSlotsFromPreview, result) {
    if (!headerSlotsFromPreview || headerSlotsFromPreview.length === 0) {
      logger.info('预览图未检测到插槽候选');
      return;
    }

    headerSlotsFromPreview.forEach((slotCandidate) => {
      const matchedNode = this._findBestMatchNode(sameRowNodes, slotCandidate);

      if (matchedNode) {
        result.validatedSlots.push({
          slotType: slotCandidate.slotType,
          controlType: slotCandidate.controlType,
          figmaNode: matchedNode.node,
          yOffset: matchedNode.yOffset,
          validated: true,
        });
        logger.info(
          `✅ 匹配成功: ${slotCandidate.controlType} → "${matchedNode.node.name}"`,
        );
      } else {
        // 🛡️ C-1（2026-09-02，mc-max-1788349399134-9c3aff7f）：vision 把内容区元素
        // （sub-t 内 tab 行右侧的 tabs-icon / num 角标）误判为 header-right 插槽时，
        // 在 Figma 标题同行找不到节点 → 此前只 warnings.push，误判仍流入 prompt →
        // T09 兜底把图标当纯文字渲染 + 图标双份挂载。升级：同时写 rejectedNodes，
        // 让 graph 消费端按 figmaNodeId/figmaPath 从 state.headerSlots 剔除，杜绝误判流入产物。
        result.rejectedNodes.push({
          slotCandidate,
          figmaNodeId: slotCandidate.figmaNodeId || slotCandidate.id || null,
          figmaPath: slotCandidate.figmaPath || null,
          reason: 'figma-no-same-row',
        });
        result.warnings.push(
          `预览图检测到${slotCandidate.controlType || slotCandidate.elementType || 'undefined'}，但Figma中未找到同行节点`,
        );
        logger.warn(`⚠️ 未匹配: ${slotCandidate.controlType} → 已 reject`);
      }
    });
  }

  /**
   * 根据插槽候选找到最佳匹配的Figma节点
   * @private
   */
  _findBestMatchNode(sameRowNodes, slotCandidate) {
    const controlType = slotCandidate.controlType;

    // 根据控件类型筛选候选节点
    const candidates = sameRowNodes.filter(({ node }) => {
      const name = node.name?.toLowerCase() || '';
      const nodeType = node.type;

      if (controlType === '统计指标') {
        // 统计指标：TEXT节点且包含数字
        return nodeType === 'TEXT' && /\d+/.test(node.characters || '');
      }
      if (controlType === 'Tab切换') {
        // Tab切换：名称包含tab/switch/segmented
        return (
          name.includes('tab') ||
          name.includes('switch') ||
          name.includes('segmented')
        );
      }
      if (controlType === '图标操作') {
        // 图标操作：COMPONENT/INSTANCE或名称包含icon
        return (
          nodeType === 'COMPONENT' ||
          nodeType === 'INSTANCE' ||
          name.includes('icon')
        );
      }
      if (controlType === '辅助文字') {
        // 辅助文字：小号TEXT节点
        return nodeType === 'TEXT' && (node.style?.fontSize || 14) <= 14;
      }

      return false;
    });

    if (candidates.length === 0) return null;

    // 返回Y坐标偏移最小的
    return candidates.sort((a, b) => a.yOffset - b.yOffset)[0];
  }

  /**
   * 检查预览图未发现但Figma中存在的同行节点
   * @private
   */
  _checkUnmatchedNodes(sameRowNodes, result) {
    sameRowNodes.forEach(({ node, yOffset }) => {
      const alreadyMatched = result.validatedSlots.some(
        (slot) => slot.figmaNode.id === node.id,
      );

      if (!alreadyMatched) {
        result.warnings.push(
          `Figma中发现同行节点"${node.name}" (Y偏移: ${yOffset.toFixed(1)}px)，但预览图未检测到，请人工确认`,
        );
        logger.warn(`⚠️ Figma中发现未匹配的同行节点: "${node.name}"`);
      }
    });
  }
}
