/**
 * LayoutSpatialAnalyzer — 大屏布局空间分析规则引擎
 *
 * 将绝对定位布局中的组件坐标转化为结构化空间分析报告，
 * 供 LLM 后续进行响应式布局策略决策。
 *
 * 分析维度：
 *   1. 组件收集 — 递归提取所有 GridComponent（含嵌套 Zone）
 *   2. 行检测 — 基于 Y 坐标聚类
 *   3. 列检测 — 基于 X 坐标聚类
 *   4. 网格吸附分析 — 对齐百分比
 *   5. 重叠分析 — 类型分类（有意 / 无意）
 *   6. Zone 包含关系 — 递归树结构
 *   7. 响应式建议 — 基于行列模式推荐断点策略
 */

// ============================================================
// 类型定义（JSDoc，与前端 screen-layout.ts 镜像）
// ============================================================

/**
 * @typedef {Object} ComponentLayout
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} minW
 * @property {number} maxW
 * @property {number} minH
 * @property {number} maxH
 * @property {boolean} static
 */

/**
 * @typedef {Object} GridComponent
 * @property {string} id
 * @property {string} componentName
 * @property {ComponentLayout} layout
 * @property {number} [zIndex]
 * @property {Object} props
 */

/**
 * @typedef {Object} ZoneConfig
 * @property {string} id
 * @property {number} colIndex
 * @property {'grid'|'flex'} layoutMode
 * @property {'components'|'zones'} contentType
 * @property {Object} gridConfig
 * @property {GridComponent[]} [gridConfig.components]
 * @property {ZoneConfig[]} [children]
 */

/**
 * @typedef {Object} ScreenLayout
 * @property {string} id
 * @property {Object} canvas
 * @property {number} canvas.width
 * @property {number} canvas.height
 * @property {number} canvas.gridSize
 * @property {Object|null} header
 * @property {Object} body
 * @property {ZoneConfig[]} body.zones
 * @property {Object|null} footer
 */

// ============================================================
// 内部数据结构
// ============================================================

/**
 * 扁平化后的组件（携带上下文信息）
 * @typedef {Object} FlattenedComponent
 * @property {string} id           - 组件 ID
 * @property {string} name         - 组件名
 * @property {number} x            - 绝对 X
 * @property {number} y            - 绝对 Y
 * @property {number} w            - 宽度
 * @property {number} h            - 高度
 * @property {number} cx           - 中心 X
 * @property {number} cy           - 中心 Y
 * @property {number} right        - 右边界
 * @property {number} bottom       - 下边界
 * @property {number} area         - 面积
 * @property {number} zIndex       - 层级
 * @property {string} zoneId       - 所属 Zone ID
 * @property {number} zoneDepth    - Zone 嵌套深度（0 = 顶层）
 * @property {string} region       - 所在区域 'header'|'body'|'footer'
 * @property {boolean} snapX       - X 是否吸附网格
 * @property {boolean} snapY       - Y 是否吸附网格
 */

// ============================================================
// 主类
// ============================================================

export class LayoutSpatialAnalyzer {

  /**
   * @param {Object} [options]
   * @param {number} [options.rowTolerance=20]  行检测的 Y 坐标容差（px）
   * @param {number} [options.colTolerance=20]  列检测的 X 坐标容差（px）
   * @param {number} [options.snapThreshold=5]  网格吸附判定阈值（px）
   * @param {number} [options.overlapIntentThreshold=0.15] 重叠面积比超过此值视为有意重叠
   */
  constructor(options = {}) {
    this.rowTolerance = options.rowTolerance ?? 20;
    this.colTolerance = options.colTolerance ?? 20;
    this.snapThreshold = options.snapThreshold ?? 5;
    this.overlapIntentThreshold = options.overlapIntentThreshold ?? 0.15;
  }

  // ============================================================
  // 公开入口
  // ============================================================

  /**
   * 分析完整布局，返回空间分析报告
   * @param {ScreenLayout} layout
   * @returns {Object} spatialReport
   */
  analyze(layout) {
    const canvas = layout.canvas || {};
    const gridSize = canvas.gridSize || 10;

    // Step 1: 收集所有组件（按区域分组）
    const allComponents = this._collectAllComponents(layout);
    const grouped = this._groupComponents(allComponents);

    // Step 2: 按 Zone 分组检测行列（更有意义）
    const zoneAnalysis = [];
    const allRows = [];
    const allCols = [];
    let globalRowIdx = 0;
    let globalColIdx = 0;

    for (const group of grouped) {
      const rows = this._detectRows(group.components, gridSize);
      const cols = this._detectColumns(group.components, gridSize);

      // 重新编号为全局索引
      const renumberedRows = rows.map(r => ({ ...r, rowIndex: globalRowIdx++, zoneId: group.zoneId, region: group.region }));
      const renumberedCols = cols.map(c => ({ ...c, colIndex: globalColIdx++, zoneId: group.zoneId, region: group.region }));

      allRows.push(...renumberedRows);
      allCols.push(...renumberedCols);

      zoneAnalysis.push({
        zoneId: group.zoneId,
        region: group.region,
        zoneDepth: group.zoneDepth,
        componentCount: group.components.length,
        rows: renumberedRows.map(r => ({
          rowIndex: r.rowIndex,
          y: r.y,
          height: r.height,
          componentCount: r.componentCount,
          componentIds: r.componentIds,
        })),
        columns: renumberedCols.map(c => ({
          colIndex: c.colIndex,
          x: c.x,
          width: c.width,
          componentCount: c.componentCount,
          componentIds: c.componentIds,
        })),
      });
    }

    // Step 3: 网格吸附分析
    this._analyzeSnapAlignment(allComponents, gridSize);

    // Step 4: 重叠分析
    const overlaps = this._analyzeOverlaps(allComponents);

    // Step 5: Zone 树结构
    const zoneTree = this._buildZoneTree(layout);

    // Step 6: 响应式建议
    const responsiveHints = this._generateResponsiveHints(
      layout, allRows, allCols, overlaps, allComponents
    );

    // Step 7: 统计摘要
    const summary = this._generateSummary(layout, allComponents, allRows, allCols, overlaps, zoneTree);

    return {
      meta: {
        analyzerVersion: '1.0.0',
        analyzedAt: new Date().toISOString(),
        canvasWidth: canvas.width || 1920,
        canvasHeight: canvas.height || 1080,
        gridSize,
      },
      summary,
      rows: allRows,
      columns: allCols,
      zoneAnalysis,
      overlapAnalysis: overlaps,
      zoneTree,
      responsiveHints,
      components: allComponents.map(c => ({
        id: c.id,
        name: c.name,
        zone: c.zoneId,
        zoneDepth: c.zoneDepth,
        region: c.region,
        x: c.x, y: c.y, w: c.w, h: c.h,
        center: { x: c.cx, y: c.cy },
        zIndex: c.zIndex,
        snapped: { x: c.snapX, y: c.snapY },
      })),
    };
  }

  // ============================================================
  // 组件分组：按 Zone + Region 分组，行列检测在组内进行
  // ============================================================

  /**
   * 将组件按 (region, zoneId, zoneDepth) 分组
   * 这样行列检测在同一个 Zone 内进行，结果更有意义
   * @param {FlattenedComponent[]} components
   * @returns {Object[]} 分组列表
   */
  _groupComponents(components) {
    const map = new Map();

    for (const comp of components) {
      // 分组键：region + zoneId + zoneDepth
      const key = `${comp.region}::${comp.zoneId}::${comp.zoneDepth}`;
      if (!map.has(key)) {
        map.set(key, {
          region: comp.region,
          zoneId: comp.zoneId,
          zoneDepth: comp.zoneDepth,
          components: [],
        });
      }
      map.get(key).components.push(comp);
    }

    return Array.from(map.values());
  }

  // ============================================================
  // Step 1: 组件收集
  // ============================================================

  /**
   * 递归收集布局中所有 GridComponent，扁平化并附加上下文
   * @param {ScreenLayout} layout
   * @returns {FlattenedComponent[]}
   */
  _collectAllComponents(layout) {
    const components = [];

    // 头部
    if (layout.header?.enabled && layout.header.components) {
      for (const comp of layout.header.components) {
        components.push(this._flattenComponent(comp, 'header', 'header', 0));
      }
    }

    // 底部
    if (layout.footer?.enabled && layout.footer.components) {
      for (const comp of layout.footer.components) {
        components.push(this._flattenComponent(comp, 'footer', 'footer', 0));
      }
    }

    // 主体 Zone（递归嵌套）
    if (layout.body?.zones) {
      for (const zone of layout.body.zones) {
        this._collectZoneComponents(zone, 'body', components, 0);
      }
    }

    return components;
  }

  /**
   * 递归收集 Zone 中的组件
   * @param {ZoneConfig} zone
   * @param {string} region
   * @param {FlattenedComponent[]} out
   * @param {number} depth
   */
  _collectZoneComponents(zone, region, out, depth) {
    // Zone 直接包含的组件
    if (zone.gridConfig?.components) {
      for (const comp of zone.gridConfig.components) {
        out.push(this._flattenComponent(comp, zone.id, region, depth));
      }
    }

    // 递归子 Zone
    if (zone.children) {
      for (const child of zone.children) {
        this._collectZoneComponents(child, region, out, depth + 1);
      }
    }
  }

  /**
   * 将 GridComponent 转化为 FlattenedComponent
   * @param {GridComponent} comp
   * @param {string} zoneId
   * @param {string} region
   * @param {number} zoneDepth
   * @returns {FlattenedComponent}
   */
  _flattenComponent(comp, zoneId, region, zoneDepth) {
    const { x, y, w, h } = comp.layout || {};
    return {
      id: comp.id,
      name: comp.componentName || 'Unknown',
      x: x || 0,
      y: y || 0,
      w: w || 1,
      h: h || 1,
      cx: (x || 0) + (w || 1) / 2,
      cy: (y || 0) + (h || 1) / 2,
      right: (x || 0) + (w || 1),
      bottom: (y || 0) + (h || 1),
      area: (w || 1) * (h || 1),
      zIndex: comp.zIndex ?? 0,
      zoneId,
      zoneDepth,
      region,
      snapX: false,
      snapY: false,
    };
  }

  // ============================================================
  // Step 2: 行检测 — Y 坐标聚类
  // ============================================================

  /**
   * 按 Y 坐标将组件聚类为「行」
   * 算法：排序后，相邻组件 Y 差 ≤ rowTolerance 则归入同一行
   * @param {FlattenedComponent[]} components
   * @param {number} gridSize
   * @returns {Object[]} 行列表
   */
  _detectRows(components, gridSize) {
    if (components.length === 0) return [];

    const sorted = [...components].sort((a, b) => a.y - b.y);
    const rows = [];
    let currentRow = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = currentRow[currentRow.length - 1];
      const diff = Math.abs(sorted[i].y - prev.y);

      // 只按 Y 坐标差判断是否同一行（更精确）
      if (diff <= this.rowTolerance) {
        currentRow.push(sorted[i]);
      } else {
        rows.push(this._summarizeRow(currentRow, gridSize));
        currentRow = [sorted[i]];
      }
    }

    rows.push(this._summarizeRow(currentRow, gridSize));

    // 按 Y 排序后重新编号
    return rows
      .sort((a, b) => a.y - b.y)
      .map((row, i) => ({ ...row, rowIndex: i }));
  }

  /**
   * 总结一行的特征
   * @param {FlattenedComponent[]} rowComps
   * @param {number} gridSize
   * @returns {Object}
   */
  _summarizeRow(rowComps, gridSize) {
    const minY = Math.min(...rowComps.map(c => c.y));
    const maxY = Math.max(...rowComps.map(c => c.bottom));
    const avgH = rowComps.reduce((s, c) => s + c.h, 0) / rowComps.length;

    return {
      y: minY,
      height: maxY - minY,
      avgComponentHeight: Math.round(avgH),
      componentCount: rowComps.length,
      componentIds: rowComps.map(c => c.id),
      // 此行内组件的 X 分布
      xRange: {
        min: Math.min(...rowComps.map(c => c.x)),
        max: Math.max(...rowComps.map(c => c.right)),
      },
      // 行间距（到下一行的距离，稍后在排序时计算）
      gapToNext: null,
    };
  }

  // ============================================================
  // Step 3: 列检测 — X 坐标聚类
  // ============================================================

  /**
   * 按 X 坐标将组件聚类为「列」
   * @param {FlattenedComponent[]} components
   * @param {number} gridSize
   * @returns {Object[]} 列列表
   */
  _detectColumns(components, gridSize) {
    if (components.length === 0) return [];

    const sorted = [...components].sort((a, b) => a.x - b.x);
    const columns = [];
    let currentCol = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = currentCol[currentCol.length - 1];
      const diff = Math.abs(sorted[i].x - prev.x);

      if (diff <= this.colTolerance) {
        currentCol.push(sorted[i]);
      } else {
        columns.push(this._summarizeColumn(currentCol, gridSize));
        currentCol = [sorted[i]];
      }
    }

    columns.push(this._summarizeColumn(currentCol, gridSize));

    return columns
      .sort((a, b) => a.x - b.x)
      .map((col, i) => ({ ...col, colIndex: i }));
  }

  /**
   * 总结一列的特征
   * @param {FlattenedComponent[]} colComps
   * @param {number} gridSize
   * @returns {Object}
   */
  _summarizeColumn(colComps, gridSize) {
    const minX = Math.min(...colComps.map(c => c.x));
    const maxX = Math.max(...colComps.map(c => c.right));
    const avgW = colComps.reduce((s, c) => s + c.w, 0) / colComps.length;

    return {
      x: minX,
      width: maxX - minX,
      avgComponentWidth: Math.round(avgW),
      componentCount: colComps.length,
      componentIds: colComps.map(c => c.id),
      yRange: {
        min: Math.min(...colComps.map(c => c.y)),
        max: Math.max(...colComps.map(c => c.bottom)),
      },
      gapToNext: null,
    };
  }

  // ============================================================
  // Step 4: 网格吸附分析
  // ============================================================

  /**
   * 分析每个组件的网格吸附情况
   * @param {FlattenedComponent[]} components
   * @param {number} gridSize
   */
  _analyzeSnapAlignment(components, gridSize) {
    for (const comp of components) {
      comp.snapX = (comp.x % gridSize) < this.snapThreshold ||
        (gridSize - (comp.x % gridSize)) < this.snapThreshold;
      comp.snapY = (comp.y % gridSize) < this.snapThreshold ||
        (gridSize - (comp.y % gridSize)) < this.snapThreshold;
    }
  }

  // ============================================================
  // Step 5: 重叠分析
  // ============================================================

  /**
   * 检测组件间的重叠关系
   * @param {FlattenedComponent[]} components
   * @returns {Object[]} 重叠分析列表
   */
  _analyzeOverlaps(components) {
    if (components.length < 2) return [];

    // 先按区域分组，跨区域不分析重叠
    const byRegion = {};
    for (const comp of components) {
      if (!byRegion[comp.region]) byRegion[comp.region] = [];
      byRegion[comp.region].push(comp);
    }

    const allOverlaps = [];

    for (const region of Object.keys(byRegion)) {
      const regionComps = byRegion[region];
      // 同时按 zoneId 分组，跨 Zone 不分析
      const byZone = {};
      for (const comp of regionComps) {
        if (!byZone[comp.zoneId]) byZone[comp.zoneId] = [];
        byZone[comp.zoneId].push(comp);
      }

      for (const zoneId of Object.keys(byZone)) {
        const zoneComps = byZone[zoneId];
        for (let i = 0; i < zoneComps.length; i++) {
          for (let j = i + 1; j < zoneComps.length; j++) {
            const overlap = this._computeOverlap(zoneComps[i], zoneComps[j]);
            if (overlap) {
              allOverlaps.push(overlap);
            }
          }
        }
      }
    }

    // 排序：重叠严重的排前面
    return allOverlaps.sort((a, b) => b.overlapRatio - a.overlapRatio);
  }

  /**
   * 计算两个组件的重叠关系
   * @param {FlattenedComponent} a
   * @param {FlattenedComponent} b
   * @returns {Object|null}
   */
  _computeOverlap(a, b) {
    const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));

    if (overlapX <= 0 || overlapY <= 0) return null;

    const overlapArea = overlapX * overlapY;
    const minArea = Math.min(a.area, b.area);
    // 重叠面积占较小组件面积的比例
    const overlapRatio = overlapArea / minArea;

    // 分类
    let type = 'none';
    if (overlapRatio > 0.5) {
      type = 'major_overlap';      // 大量重叠，可能是故意叠加
    } else if (overlapRatio > this.overlapIntentThreshold) {
      type = 'intentional_overlay'; // 有意重叠（如标签、浮层）
    } else if (overlapRatio > 0.01) {
      type = 'minor_overlap';      // 轻微重���，可能是布局误差
    } else {
      type = 'edge_touch';         // 边缘接触，不算重叠
    }

    return {
      componentA: a.id,
      componentB: b.id,
      nameA: a.name,
      nameB: b.name,
      overlapArea: Math.round(overlapArea),
      overlapRatio: Math.round(overlapRatio * 1000) / 1000,
      type,
      zIndexOrder: a.zIndex > b.zIndex
        ? `${a.id} > ${b.id}`
        : `${b.id} > ${a.id}`,
      recommendation: type === 'major_overlap' || type === 'intentional_overlay'
        ? '在响应式布局中用 position:relative + 负 margin 或 CSS Grid 叠加实现'
        : type === 'minor_overlap'
          ? '调整组件边距消除轻微重叠，或归入同行/同列自动对齐'
          : null,
    };
  }

  // ============================================================
  // Step 6: Zone 树结构
  // ============================================================

  /**
   * 构建 Zone 嵌套树
   * @param {ScreenLayout} layout
   * @returns {Object} zone 树
   */
  _buildZoneTree(layout) {
    const buildNode = (zone, depth = 0) => {
      const componentCount = zone.gridConfig?.components?.length || 0;
      const childNodes = zone.children
        ? zone.children.map(c => buildNode(c, depth + 1))
        : [];

      return {
        id: zone.id,
        colIndex: zone.colIndex,
        layoutMode: zone.layoutMode || 'grid',
        contentType: zone.contentType || 'components',
        depth,
        componentCount,
        children: childNodes,
        totalDescendantComponents: componentCount + childNodes.reduce(
          (sum, c) => sum + c.totalDescendantComponents, 0
        ),
      };
    };

    // Body zones
    const bodyZones = (layout.body?.zones || []).map(z => buildNode(z, 0));

    return {
      headerActive: layout.header?.enabled ?? false,
      headerComponents: layout.header?.components?.length || 0,
      footerActive: layout.footer?.enabled ?? false,
      footerComponents: layout.footer?.components?.length || 0,
      bodyZones,
      maxDepth: bodyZones.reduce((max, z) => Math.max(max, z.depth), 0),
    };
  }

  // ============================================================
  // Step 7: 响应式建议
  // ============================================================

  /**
   * 根据空间结构生成响应式断点建议
   * @param {ScreenLayout} layout
   * @param {Object[]} rows
   * @param {Object[]} columns
   * @param {Object[]} overlaps
   * @param {FlattenedComponent[]} components
   * @returns {Object}
   */
  _generateResponsiveHints(layout, rows, columns, overlaps, components) {
    const canvasW = layout.canvas?.width || 1920;
    const canvasH = layout.canvas?.height || 1080;

    // 检测到的行列模式
    const gridPattern = this._detectGridPattern(rows, columns);

    // 断点建议
    const breakpoints = this._suggestBreakpoints(canvasW, rows, columns, gridPattern);

    // 固定/流体元素
    const headerFixed = layout.header?.enabled ?? false;
    const footerFixed = layout.footer?.enabled ?? false;

    // 关键元素
    const criticalElements = this._identifyCriticalElements(components, overlaps);

    return {
      detectedGridPattern: gridPattern.pattern,
      gridPatternConfidence: gridPattern.confidence,
      gridPatternDescription: gridPattern.description,

      breakpointSuggestions: breakpoints,

      fixedElements: [
        ...(headerFixed ? ['header'] : []),
        ...(footerFixed ? ['footer'] : []),
      ],
      fluidElements: ['body-grid', 'body-zones'],

      criticalOverlaps: overlaps
        .filter(o => o.type === 'major_overlap' || o.type === 'intentional_overlay')
        .map(o => ({ a: o.componentA, b: o.componentB, ratio: o.overlapRatio })),

      // 布局复杂度评分（0-10）
      complexityScore: this._computeComplexityScore(rows, columns, overlaps, components),
    };
  }

  /**
   * 检测行列模式
   */
  _detectGridPattern(rows, columns) {
    const rLen = rows.length;
    const cLen = columns.length;

    if (rLen === 1 && cLen === 1) {
      return { pattern: 'single-panel', confidence: 1.0, description: '单面板布局' };
    }
    if (rLen === 1) {
      return { pattern: `${cLen}-column-layout`, confidence: 0.9, description: `${cLen} 列布局` };
    }
    if (cLen === 1) {
      return { pattern: `${rLen}-row-layout`, confidence: 0.9, description: `${rLen} 行布局` };
    }
    if (rLen <= 3 && cLen <= 4) {
      return { pattern: `${rLen}x${cLen}-grid-layout`, confidence: 0.85, description: `${rLen} 行 × ${cLen} 列网格布局` };
    }
    return { pattern: 'complex-grid', confidence: 0.6, description: `复杂网格（${rLen} 行 × ${cLen} 列）` };
  }

  /**
   * 建议断点策略
   */
  _suggestBreakpoints(canvasW, rows, columns, gridPattern) {
    const breakpoints = [];

    // 全宽 → 降级到最常见的中屏
    if (canvasW >= 3840) {
      breakpoints.push({
        width: 1920,
        strategy: 'scale_down_to_half',
        description: '4K → 2K：直接缩放为一半，保持行列不变',
      });
    }

    // 标准大屏 → 笔记本屏
    if (canvasW >= 1920) {
      if (columns.length > 2) {
        breakpoints.push({
          width: 1440,
          strategy: 'reduce_column_count',
          description: `减少列数（从 ${columns.length} 列降到 ${Math.max(2, columns.length - 1)} 列），或缩小列宽`,
        });
      } else {
        breakpoints.push({
          width: 1440,
          strategy: 'scale_content',
          description: '保持行列不变，按比例缩小组件',
        });
      }
    }

    // 笔记本 → 平板
    if (columns.length > 1 || rows.length > 2) {
      breakpoints.push({
        width: 1024,
        strategy: 'stack_or_reflow',
        description: columns.length > 1
          ? `${columns.length} 列 → 单列堆叠`
          : '保持单列，缩小字体和间距',
      });
    } else {
      breakpoints.push({
        width: 1024,
        strategy: 'scale_down',
        description: '单列布局直接缩小即可',
      });
    }

    return breakpoints;
  }

  /**
   * 识别关键元素（大的、重叠的、特殊位置的）
   */
  _identifyCriticalElements(components, overlaps) {
    const critical = [];

    // 大组件（面积 > 均值 2 倍）
    if (components.length > 0) {
      const avgArea = components.reduce((s, c) => s + c.area, 0) / components.length;
      const large = components.filter(c => c.area > avgArea * 2);
      for (const c of large) {
        critical.push({ id: c.id, name: c.name, reason: `大面积组件（${c.area} vs 均值 ${Math.round(avgArea)}）` });
      }
    }

    // 叠层组件
    const overlappedIds = new Set();
    for (const o of overlaps) {
      if (o.type === 'major_overlap' || o.type === 'intentional_overlay') {
        overlappedIds.add(o.componentA);
        overlappedIds.add(o.componentB);
      }
    }
    for (const id of overlappedIds) {
      if (!critical.find(c => c.id === id)) {
        const comp = components.find(c => c.id === id);
        if (comp) {
          critical.push({ id, name: comp.name, reason: '参与叠层关系' });
        }
      }
    }

    return critical;
  }

  /**
   * 布局复杂度评分
   */
  _computeComplexityScore(rows, columns, overlaps, components) {
    let score = 0;

    // 组件数量
    score += Math.min(components.length * 0.3, 3);

    // 行列复杂度
    score += Math.min(rows.length * 0.5, 2);
    score += Math.min(columns.length * 0.5, 2);

    // 重叠复杂度
    const majorOverlaps = overlaps.filter(o => o.type !== 'edge_touch').length;
    score += Math.min(majorOverlaps * 0.5, 2);

    // 嵌套 Zone
    // (通过组件深度间接衡量)
    const maxDepth = Math.max(...components.map(c => c.zoneDepth), 0);
    score += Math.min(maxDepth * 0.5, 1);

    return Math.round(score * 10) / 10;
  }

  // ============================================================
  // Step 8: 统计摘要
  // ============================================================

  /**
   * 生成统计摘要
   */
  _generateSummary(layout, components, rows, columns, overlaps, zoneTree) {
    const snapXCount = components.filter(c => c.snapX).length;
    const snapYCount = components.filter(c => c.snapY).length;

    // 组件区域分布
    const headerComps = components.filter(c => c.region === 'header').length;
    const footerComps = components.filter(c => c.region === 'footer').length;
    const bodyComps = components.filter(c => c.region === 'body').length;

    // 递归计数 Zone 总数（含嵌套）
    const countZones = (zones) => {
      let count = 0;
      for (const z of zones) {
        count += 1;
        if (z.children && z.children.length > 0) {
          count += countZones(z.children);
        }
      }
      return count;
    };
    const totalZones = zoneTree ? countZones(zoneTree.bodyZones) : 0;

    return {
      totalComponents: components.length,
      headerComponents: headerComps,
      bodyComponents: bodyComps,
      footerComponents: footerComps,
      totalZones,
      detectedRows: rows.length,
      detectedColumns: columns.length,
      totalOverlaps: overlaps.length,
      majorOverlaps: overlaps.filter(o => o.type === 'major_overlap').length,
      intentionalOverlays: overlaps.filter(o => o.type === 'intentional_overlay').length,
      minorOverlaps: overlaps.filter(o => o.type === 'minor_overlap').length,
      snapXRate: components.length > 0 ? Math.round((snapXCount / components.length) * 100) : 0,
      snapYRate: components.length > 0 ? Math.round((snapYCount / components.length) * 100) : 0,
      avgComponentWidth: components.length > 0
        ? Math.round(components.reduce((s, c) => s + c.w, 0) / components.length)
        : 0,
      avgComponentHeight: components.length > 0
        ? Math.round(components.reduce((s, c) => s + c.h, 0) / components.length)
        : 0,
    };
  }
}

export default LayoutSpatialAnalyzer;
