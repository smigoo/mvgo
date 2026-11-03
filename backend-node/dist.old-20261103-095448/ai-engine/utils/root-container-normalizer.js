/**
 * @file root-container-normalizer.js — 🛡️ 治本（2026-09-11，c-env-monitor-xh8jdcpy-2aa25837 复发实锤）：
 * 组件「内容根容器」的高度归一 —— `flex: N 1 0` / `flex: 1 1 0` → `height: 100%`。
 *
 * 根因：内容根容器（`c-{semantic}-slot-con` / `c-xxx-root`，直连宿主 `.pannel-content`）的父级是
 * **block**（default-panel: `height: calc(100% - 38px)`，6/6 面板均无 display:flex）。
 * `flex: 1 1 0` 在非 flex 父容器下完全失效 → 根高退 auto → 内部 `flex:1; min-height:0` 的
 * 图表区拿到 0 → 图表整块不可见（「只有上面一部分」）。
 *
 * flex 值来源有二，必须双防：
 *   ① resource-mounter fixSectionHeightsForResource 规则②（height:100% → flex:1 1 0）——
 *     豁免已补 -slot-con（同日修复），历史产物仍中招；
 *   ② LLM 直写 flex:1 1 0（root-container.md 规范写法误用于根容器）。
 * 本归一器在落盘终验兜底：无论来源，内容根容器一律恢复 `height: 100%`。
 *
 * 根容器识别（与 code-generator 确定性模板同源，不猜）：
 *   index.vue 中 base-panel 之后第一个 div 的 class，命中 `-(slot-con|-root)$` 词尾；
 *   找不到时回退 detectRootContainerClass（base-panel 实例类不可作为内容根，直接跳过）。
 *
 * 幂等：已是 height:100% 的块零副作用。只改 .less 与 .vue <style> 块，不碰模板/脚本。
 *
 * 🛡️ 扩展（2026-09-11，P2-1 时序治理 / I4 不变量终验兜底）：
 * 传入 figmaNodeData（absoluteBoundingBox，W/H > 50 有效）时，对内容根容器补齐
 * `aspect-ratio: W / H`（仅当 width 或 height 缺一时注入，与 anchorRootContainerInFiles
 * 语义一致：两者都全时 aspect-ratio 无效即噪声）。动机：fix pipeline 中 anchor 对
 * common.less 的补丁会被后续产物重建类步骤（writeFiles 出口的 consolidateSubComponentClasses
 * 等重建链）覆盖 —— 布局类关键修复必须在「写盘前最后一刻」重跑。本归一器挂在终验链，
 * 天然存续到最后写盘。
 */

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 index.vue 模板识别内容根容器类名。
 * @returns {string|null}
 */
export function detectContentRootClass(indexVueContent = '') {
  if (!indexVueContent || typeof indexVueContent !== 'string') return null;
  // 🛡️ 模板区截取不能用 lazy <\/template>（根 template 内嵌具名插槽的 </template>
  // 会提前截断，后续标签丢失）—— 与 artifact-invariants.extractVueEdges 同源修法。
  const tplStart = indexVueContent.search(/<template\b[^>]*>/i);
  if (tplStart < 0) return null;
  const rest = indexVueContent.slice(tplStart);
  const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
  const tpl = (endIdx > 0 ? rest.slice(0, endIdx) : rest).replace(/<!--[\s\S]*?-->/g, '');
  // base-panel 之后第一个带 class 的容器 div，词尾 -slot-con / -root
  const region = tpl.slice(tpl.search(/<base-panel\b/i) >= 0 ? tpl.search(/<base-panel\b/i) : 0);
  const m = region.match(
    /<div[^>]*\bclass=(["'])([^"']*)\1/i,
  );
  if (m) {
    for (const cls of m[2].split(/\s+/)) {
      if (/-slot-con$|-root$/.test(cls)) return cls;
    }
  }
  return null;
}

const FLEX_FILL_RE = /(?:^|[\s;{])flex\s*:\s*[\d.]+\s+1\s+0\s*;?/gi;

/** 拼接产物内全部样式源文本（.less/.css 全量 + .vue 的 <style> 块） */
function styleTextOf(list) {
  let all = '';
  for (const f of list) {
    const p = String(f?.path || '');
    const c = f?.content;
    if (typeof c !== 'string') continue;
    if (/\.(less|css)$/i.test(p)) all += `\n${c}`;
    else if (/\.vue$/i.test(p)) {
      const m = c.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
      if (m) all += `\n${m.join('\n')}`;
    }
  }
  return all;
}

/**
 * 🛡️ R1-2（2026-09-11）布局事实数据流化：解析内容根类名。
 * 优先级：**facts 显式值**（来自确定性模板 buildDeterministicIndexTemplate，不猜）→
 * 词尾猜测 detectContentRootClass（LLM 模板回退路径 / 旧 checkpoint）。
 * facts 值必须能在样式源中找到规则块才采信（防 stale facts 指向已被改名的类导致整体不修）；
 * 找不到则回落猜测，保证「宁可猜，不可不修」。
 * @returns {{ rootCls: string|null, source: 'facts'|'detected'|null }}
 */
function resolveRootClass(list, idxContent, options = {}) {
  const explicit =
    options?.rootLayoutFacts?.rootContainerClass || options?.rootCls || null;
  if (explicit && typeof explicit === 'string') {
    const styles = styleTextOf(list);
    if (new RegExp(`\\.${escapeRe(explicit)}\\s*(?:,|\\{)`).test(styles)) {
      return { rootCls: explicit, source: 'facts' };
    }
  }
  const detected = detectContentRootClass(idxContent);
  return { rootCls: detected || null, source: detected ? 'detected' : null };
}

/**
 * 归一内容根容器高度。
 * @param {Array<{path:string,content:string}>|Object<string,string>} files
 * @param {Object} [options] { logger, figmaNodeData, rootLayoutFacts|rootCls }
 * @returns {{ files: Array<{path,content}>, fixes: Array<{path, rootCls, action}>, rootCls: string|null, rootClsSource: string|null }}
 */
export function normalizeRootContainerLayout(files = [], options = {}) {
  const logger = options?.logger || null;
  // 🛡️ I4 终验兜底：figma bbox 有效时对内容根补 aspect-ratio（语义对齐 anchorRootContainerInFiles）
  const _rootNode = options?.figmaNodeData?.document || options?.figmaNodeData || null;
  const _bb = _rootNode?.absoluteBoundingBox;
  const _W = Math.round(_bb?.width || 0);
  const _H = Math.round(_bb?.height || 0);
  const bboxValid = _W > 50 && _H > 50;
  const list = Array.isArray(files)
    ? files
    : Object.entries(files || {}).map(([path, content]) => ({ path, content }));
  const fixes = [];

  const idxPath = list.find((f) => /(^|\/)package\/index\.vue$/i.test(String(f?.path || ''))) ||
    list.find((f) => /(^|\/)index\.vue$/i.test(String(f?.path || '')));
  if (!idxPath || typeof idxPath.content !== 'string') {
    return { files: list, fixes, rootCls: null, rootClsSource: null };
  }
  const { rootCls, source: rootClsSource } = resolveRootClass(
    list,
    idxPath.content,
    options,
  );
  if (!rootCls) return { files: list, fixes, rootCls: null, rootClsSource: null };

  const headRe = new RegExp(`([^{}]*\\.${escapeRe(rootCls)}(?:\\s*,[^{}]*)?\\s*\\{)([^{}]*)\\}`, 'g');

  // 🛡️ 根因 A 修复（2026-09-18，v3 参考 healMissingFlexContainers）：
  // 条件性补全根容器 flex 布局声明。
  // 判断逻辑（参考 healMissingFlexContainers 刀 20）：
  //   1. 根容器内 ≥2 个子元素带 flex 值（在样式源中可证）
  //   2. 根容器当前没有 display:flex（或不可证 flex）
  //   3. 根容器 class 在样式源中存在规则块（由 headRe 匹配保证）
  // 满足条件时才补 display:flex + flex-direction: column
  const patchRootFlexIfNeeded = (source, path, allStyles) => {
    // 从 index.vue 模板提取根容器的子元素 class
    const idxFile = list.find((f) => /(^|\/)package\/index\.vue$/i.test(String(f?.path || ''))) ||
      list.find((f) => /(^|\/)index\.vue$/i.test(String(f?.path || '')));
    if (!idxFile || typeof idxFile.content !== 'string') return source;
    
    const tplStart = idxFile.content.search(/<template\b[^>]*>/i);
    if (tplStart < 0) return source;
    const rest = idxFile.content.slice(tplStart);
    const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
    const tpl = (endIdx > 0 ? rest.slice(0, endIdx) : rest).replace(/<!--[\s\S]*?-->/g, '');
    
    // 找到根容器标签（匹配 class 包含 rootCls 的标签）
    // 不依赖闭合标签匹配，只找根容器的开始标签
    const rootClassEscaped = escapeRe(rootCls);
    const rootTagStartRe = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\bclass=["'][^"']*\\b${rootClassEscaped}\\b[^"']*["'][^>]*>`, 'i');
    const rootStartMatch = tpl.match(rootTagStartRe);
    if (!rootStartMatch) return source;
    
    // 从根容器开始位置向后截取，找到根容器内的所有子元素
    const rootStartIdx = rootStartMatch.index + rootStartMatch[0].length;
    const afterRootStart = tpl.slice(rootStartIdx);
    
    // 提取根容器内第一层子元素的 class（遇到嵌套同级别容器停止）
    // 简单策略：匹配所有带 class 的子元素标签，直到遇到闭合标签
    const childClassRe = /<([a-zA-Z][\w-]*)\b[^>]*\bclass=["']([^"']+)["'][^>]*>/gi;
    const childClasses = [];
    let cm;
    let depth = 0;
    let pos = 0;
    const content = afterRootStart;
    
    // 简单解析：遇到开始标签 depth++，遇到闭合标签 depth--，depth=0 时停止
    const tagRe = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g;
    let tagMatch;
    while ((tagMatch = tagRe.exec(content)) !== null) {
      const isClosing = tagMatch[0].startsWith('</');
      const tagName = tagMatch[1];
      
      if (isClosing) {
        if (depth === 0) break; // 遇到根容器的闭合标签
        depth--;
      } else {
        if (depth === 0 && tagMatch[0].includes('class=')) {
          // 第一层子元素
          const classMatch = tagMatch[0].match(/\bclass=["']([^"']+)["']/);
          if (classMatch) {
            const classes = classMatch[1].split(/\s+/);
            childClasses.push(...classes);
          }
        }
        depth++;
      }
    }
    
    // 检查这些 class 中有多少个在样式源中有 flex 值（flex-grow > 0 的任意 flex 简写）
    // 匹配模式：
    //   ① flex: N 1 0        （标准三值）
    //   ② flex: 1 0 113px    （flex-basis 带单位）
    //   ③ flex: 1            （简写，等价 1 1 0）
    //   ④ flex: 1.5          （小数简写）
    // 核心判据：flex-grow > 0（即第一个数字 > 0，且不是 flex: 0 开头）
    const flexChildSet = new Set();
    for (const cls of childClasses) {
      if (!cls || !cls.startsWith('c-')) continue;
      const clsRe = new RegExp(`\\.${escapeRe(cls)}\\s*\\{([^}]*)\\}`, 'g');
      const styleMatch = clsRe.exec(allStyles);
      if (styleMatch) {
        const styleBody = styleMatch[1];
        // 匹配 flex 简写：第一个值（flex-grow）> 0
        // 模式：flex: <positive-number>... （排除 flex: 0 或 flex: 0px 等）
        if (/(^|[\s;{])flex\s*:\s*([1-9]|0\.[0-9]*[1-9])/i.test(styleBody)) {
          flexChildSet.add(cls);
        }
      }
    }
    
    // 条件 1：至少 2 个子元素带 flex 值
    if (flexChildSet.size < 2) return source;
    
    let out = source;
    let changed = false;
    out = out.replace(headRe, (whole, head, body) => {
      const hasDisplayFlex = /(^|[\s;{])display\s*:\s*flex/i.test(body);
      const hasFlexDir = /(^|[\s;{])flex-direction\s*:/i.test(body);
      
      if (hasDisplayFlex) {
        // 已有 display:flex 但没有 flex-direction → 补 column
        if (!hasFlexDir) {
          const nb = `flex-direction: column;\n${body}`;
          changed = true;
          fixes.push({ path, rootCls, action: 'inject-flex-direction-column' });
          return head + nb + '}';
        }
        return whole;
      }
      
      // 没有 display:flex → 补 display:flex + flex-direction: column
      const nb = `display: flex;\nflex-direction: column;\n${body}`;
      changed = true;
      fixes.push({ path, rootCls, action: 'inject-flex-column-layout' });
      return head + nb + '}';
    });
    
    return changed ? out : source;
  };

  const patch = (source, path) => {
    let out = source;
    let changed = false;
    out = out.replace(headRe, (whole, head, body) => {
      // 只在「块体含 display:flex 或纯布局块」时视为容器本体；避免误伤嵌套选择器中的同名引用
      const hasHeight = /(^|[\s;{])height\s*:/.test(body);
      const hasWidth = /(^|[\s;{])width\s*:/.test(body);
      const hasFlexFill = FLEX_FILL_RE.test(body);
      FLEX_FILL_RE.lastIndex = 0;
      let nb = body;
      if (hasFlexFill) {
        if (hasHeight) {
          // 已有 height：只删失效的 flex 填充声明
          nb = body.replace(FLEX_FILL_RE, '');
        } else {
          nb = body.replace(FLEX_FILL_RE, 'height: 100%;');
        }
        if (nb !== body) {
          changed = true;
          fixes.push({
            path,
            rootCls,
            action: hasHeight ? 'removed-dead-flex' : 'flex-to-height',
          });
        }
      }
      // 🛡️ R4-b（2026-09-15）：删除 aspect-ratio 补齐，改为 width/height 100% 双全。
      // aspect-ratio 是 boxStyle（预览 iframe 比例）语义，不是 CSS 属性；宿主 .pannel-content
      // 有明确高度（calc(100%-38px)），width/height:100% 双全即满足 I4 形态锁。对纵向多
      // section 容器注入 aspect-ratio 会锁死高度 → 内容挤压（traffic-monitor 实锤）。
      // 保留 bboxValid 门（与原 aspect-ratio 兜底一致：仅 figma bbox 有效时补齐）。
      if (bboxValid) {
        const nbHasWidth = /(^|[\s;{])width\s*:/.test(nb);
        const nbHasHeight = /(^|[\s;{])height\s*:/.test(nb);
        if (!nbHasWidth) {
          nb = `width: 100%;\n${nb}`;
          changed = true;
          fixes.push({ path, rootCls, action: 'width-to-100' });
        }
        if (!nbHasHeight) {
          nb = `height: 100%;\n${nb}`;
          changed = true;
          fixes.push({ path, rootCls, action: 'height-to-100' });
        }
      }
      if (nb !== body) {
        return head + nb + '}';
      }
      return whole;
    });
    return changed ? out : source;
  };

  // 🛡️ 先执行 flex 布局补全（在 patch 之前，确保 display:flex 和 flex-direction 都就位）
  // 拼接全部样式源用于检查子元素是否有 flex 值
  const allStyles = styleTextOf(list);
  const afterFlexPatch = list.map((f) => {
    const p = String(f?.path || '');
    const c = f?.content;
    if (typeof c !== 'string') return { path: p, content: c };
    if (/\.less$/i.test(p)) {
      const next = patchRootFlexIfNeeded(c, p, allStyles);
      return { path: p, content: next };
    }
    if (/\.vue$/i.test(p)) {
      let changed = false;
      const next = c.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (whole, body) => {
        const nb = patchRootFlexIfNeeded(body, p, allStyles);
        if (nb !== body) {
          changed = true;
          return whole.replace(body, nb);
        }
        return whole;
      });
      return { path: p, content: changed ? next : c };
    }
    return { path: p, content: c };
  });

  const out = afterFlexPatch.map((f) => {
    const p = String(f?.path || '');
    const c = f?.content;
    if (typeof c !== 'string') return { path: p, content: c };
    if (/\.less$/i.test(p)) {
      const next = patch(c, p);
      return { path: p, content: next };
    }
    if (/\.vue$/i.test(p)) {
      let changed = false;
      const next = c.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (whole, body) => {
        const nb = patch(body, p);
        if (nb !== body) {
          changed = true;
          return whole.replace(body, nb);
        }
        return whole;
      });
      return { path: p, content: changed ? next : c };
    }
    return { path: p, content: c };
  });

  if (fixes.length > 0 && logger && typeof logger.warn === 'function') {
    logger.warn('🛡️ 内容根容器布局归一（flex 填充 → height:100% + aspect-ratio 补齐，宿主 .pannel-content 为 block）', {
      rootCls,
      rootClsSource,
      bboxValid,
      fixes,
    });
  }
  return { files: out, fixes, rootCls, rootClsSource };
}
