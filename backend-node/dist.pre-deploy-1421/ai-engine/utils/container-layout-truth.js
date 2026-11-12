/**
 * 🛡️ G1（2026-11-09 · mc-max-1794215877507-669d8bf8 实锤）：「零样式容器」布局真值注入。
 *
 * ── 病灶 ────────────────────────────────────────────────────────────────
 * LLM 随机层漏写容器样式：流量监测 669d8bf8 的车型分布整层（1263-38-con /
 * 2-3446-con / 2-3496-con）在 common.less **零样式块**、行内也只有 flex:0.201/
 * min-height:0——无 display、无尺寸。真值两卡横向并排（2:3446 x=32 / 2:3496
 * x=227，同 y=601，各 192×114），产物容器块级堆叠 ⇒ 右卡掉到左下、底图
 * （191×80 背景不撑高度）塌陷、标题/数字行散排。
 *
 * ── 守卫缺口（查重结论）──────────────────────────────────────────────────
 * 现有守卫覆盖「样式**值**错误」（THEME-SLOT/flex-shrink）、「文本缺失」
 * （TEXT-TRUTH/COVERAGE）、「锚缺失」（unmaterialized）——「容器类零样式块
 * （连 display 都没有）」无任何判据，漏写布局样式静默通过。
 * 家族定位：W1（段几何透传）→ R9-c（横排定宽）→ **G1（容器布局方向+比例）**。
 *
 * ── 注入语义（全部来自 Figma bbox 真值，零硬编码）────────────────────────
 * 对每个「零样式容器」（带 data-section-id、样式源零规则块、行内无 display）：
 *   ① 方向：该段在段树中的子节点 bbox——同 y 异 x ⇒ row；同 x 异 y ⇒ column；
 *      单子/混合 ⇒ 只跳过方向注入（不猜）
 *   ② 比例：row ⇒ 子项按宽度比注入 `flex: w/sum`；column ⇒ 按高度比注入
 *      `flex: h/sum`（注入到容器内深度 1 子元素开标签行内 style；子项已有
 *      flex 声明则跳过——与 R9-c hasFlexSemantics 同口径不覆盖既有语义）
 *   幂等：容器行内已含等值方向声明 / 子项已含 flex ⇒ 跳过。
 *
 * ── 实现要点（B1 评审修正）──────────────────────────────────────────────
 *   · 替换全部按「字符偏移量切片」进行（tag 文本可能在全文多处出现，
 *     String.replace 首次匹配在同构兄弟容器场景会错位）。
 *   · classHasRules 字符类含 `>`（子组合器 `.a > .c-x-con`）。
 *   · 标签带 `:style` 绑定且绑定串含 display ⇒ 保守跳过（Vue 动态 style
 *     优先级高，双声明冲突不猜）。
 *
 * 纯函数；挂 pre-write-self-healing ⑥-d（R9-c 之后），fail-open。
 */

/** 样式源中该 class 是否有任何规则块（零规则块 = 零样式容器判据之一） */
function classHasRules(rules, cls) {
  for (const r of rules) {
    const sel = String(r.selector || '');
    if (sel === '.' + cls) return true;
    // 复合选择器匹配：`.cls…` 开头（后接 . : 空格 , >）或选择器中段（前接空格 , > .）
    const head = new RegExp('^\\.' + cls + '(\\.|:| |$|,|>)');
    const mid = new RegExp('[\\s,.>]' + cls + '(\\.|:| |$|>)');
    if (head.test(sel) || mid.test(sel)) return true;
  }
  return false;
}

/** 从开标签文本取静态 style 属性值（不含 :style 绑定） */
function readStyleAttr(tagText) {
  const m = String(tagText || '').match(/\sstyle\s*=\s*"([^"]*)"/);
  return m ? m[1] : '';
}

/** 扫描标签结束位置（引号感知） */
function scanTagEnd(src, lt) {
  let quote = '';
  for (let i = lt + 1; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i + 1;
  }
  return -1;
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** 解析 style 属性串为声明 map */
function parseDecls(styleStr) {
  const out = {};
  for (const d of String(styleStr || '').split(';')) {
    const ci = d.indexOf(':');
    if (ci === -1) continue;
    const k = d.slice(0, ci).trim().toLowerCase();
    const v = d.slice(ci + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/**
 * 容器布局真值注入。
 *
 * @param {string} indexContent index.vue 全文
 * @param {Array<{path:string,content:string}>} styleSources 全量样式文件（.less/.css/.vue）
 * @param {object} opts
 * @param {(sid:string)=>Array<{id:string,box:{x:number,y:number,width:number,height:number}}>|null} opts.childrenBoxesOf
 *        段树回调：sid → 子节点 bbox 列表（来自 effectiveSections 树的 figmaBox；缺 ⇒ 跳过该容器）
 * @returns {{content:string, changed:boolean, injected:Array<{sid:string,dir:string,flexes:number[]}>, stats:Object}}
 */
export function injectContainerLayoutTruth(indexContent, styleSources, opts = {}) {
  const content = String(indexContent || '');
  const stats = { scanned: 0, zeroStyle: 0, injected: 0, childFlex: 0, noKids: 0, mixedSkipped: 0, dynamicStyleSkipped: 0 };
  const injected = [];
  const childrenBoxesOf = typeof opts.childrenBoxesOf === 'function' ? opts.childrenBoxesOf : () => null;
  if (!content) return { content, changed: false, injected, stats };

  // ① 解析样式源 → 规则选择器清单（末段；跳过 @ 规则头与注释）
  const rules = [];
  for (const src of styleSources || []) {
    if (!src || typeof src.content !== 'string') continue;
    const cssNoComment = src.content.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of cssNoComment.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const lastSeg =
        String(m[1]).split(/[\n;]|\}\s*/).map((x) => x.trim()).filter(Boolean).pop() || '';
      if (!lastSeg || lastSeg.startsWith('@')) continue;
      rules.push({ selector: lastSeg });
    }
  }

  // ② 只扫 <template> 段（data-section-id 只出现在模板）
  const tplM = content.match(/<template[^>]*>([\s\S]*)<\/template>/i);
  if (!tplM) return { content, changed: false, injected, stats };
  const htmlStart = tplM.index + tplM[0].indexOf('>') + 1;
  const html = tplM[1];

  // ③ 收集替换动作（偏移量基准 = html 段内），统一从后往前切片替换（偏移不漂移）
  const edits = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt);
      if (e === -1) break;
      i = e + 3;
      continue;
    }
    if (/^<\s*\//.test(html.slice(lt, lt + 3))) {
      i = lt + 2;
      continue;
    }
    const end = scanTagEnd(html, lt);
    if (end === -1) break;
    const tag = html.slice(lt, end);
    const sidM = tag.match(/\sdata-section-id\s*=\s*"([^"]+)"/);
    if (!sidM) {
      i = end;
      continue;
    }
    stats.scanned += 1;
    const sid = sidM[1];

    // 零样式判据：行内无 display、:style 绑定不含 display、class 全部零规则块
    const inlineDecls = parseDecls(readStyleAttr(tag));
    const hasInlineDisplay = 'display' in inlineDecls;
    const bindM = tag.match(/:style\s*=\s*"[^"]*"/);
    const dynamicDisplay = bindM ? /display\s*:/.test(bindM[0]) : false;
    if (dynamicDisplay) stats.dynamicStyleSkipped += 1;
    const classes = [...tag.matchAll(/\sclass\s*=\s*"([^"]*)"/g)]
      .flatMap((m) => m[1].split(/\s+/))
      .filter(Boolean);
    const styled = classes.some((c) => classHasRules(rules, c));

    if (hasInlineDisplay || dynamicDisplay || styled) {
      i = end;
      continue;
    }
    stats.zeroStyle += 1;

    // 方向与比例（真值回调缺 ⇒ noKids 跳过）
    const kids = childrenBoxesOf(sid);
    if (!Array.isArray(kids) || kids.length < 2) {
      stats.noKids += 1;
      i = end;
      continue;
    }
    const ys = [...new Set(kids.map((k) => Math.round((k.box && k.box.y) ?? NaN)))];
    const xs = [...new Set(kids.map((k) => Math.round((k.box && k.box.x) ?? NaN)))];
    let dir = null;
    if (ys.length === 1 && Number.isFinite(ys[0]) && xs.length === kids.length) dir = 'row';
    else if (xs.length === 1 && Number.isFinite(xs[0]) && ys.length === kids.length) dir = 'column';
    if (!dir) {
      stats.mixedSkipped += 1;
      i = end;
      continue;
    }

    // ④ 容器方向注入（幂等：已有等值声明跳过）
    const wantDir = `display: flex; flex-direction: ${dir}`;
    const alreadyDir =
      inlineDecls.display === 'flex' && (inlineDecls['flex-direction'] || 'row') === dir;
    if (!alreadyDir) {
      const base = readStyleAttr(tag);
      const inject = base ? `${base.replace(/;\s*$/, '')};${wantDir}` : wantDir;
      const newTag = /\sstyle\s*=\s*"/.test(tag)
        ? tag.replace(/(\sstyle\s*=\s*")([^"]*)(")/, (_m, a, _b, c) => `${a}${inject}${c}`)
        : tag.replace(/>\s*$/, ` style="${wantDir}">`);
      edits.push({ from: lt, to: end, text: newTag });
    }

    // ⑤ 深度 1 子项比例注入（跳过已有 flex 声明的子项——hasFlexSemantics 同口径）
    const nameM = tag.match(/^<\s*([a-zA-Z][\w-]*)/);
    const name = nameM ? nameM[1] : 'div';
    const key = dir === 'row' ? 'width' : 'height';
    const sum = kids.reduce((s, k) => s + (Number(k.box && k.box[key]) || 0), 0);
    const flexes = kids.map((k) => {
      const v = Number(k.box && k.box[key]) || 0;
      return sum > 0 ? Math.round((v / sum) * 1000) / 1000 : null;
    });

    let depth = 0;
    let j = end;
    let kIdx = 0;
    while (j < html.length) {
      const lt2 = html.indexOf('<', j);
      if (lt2 === -1) break;
      if (html.startsWith('<!--', lt2)) {
        const e2 = html.indexOf('-->', lt2);
        if (e2 === -1) break;
        j = e2 + 3;
        continue;
      }
      const e2 = scanTagEnd(html, lt2);
      if (e2 === -1) break;
      const t2 = html.slice(lt2, e2);
      const m2 = t2.match(/^<\s*\/?\s*([a-zA-Z][\w-]*)/);
      if (!m2) {
        j = e2;
        continue;
      }
      const closing = /^<\s*\//.test(t2);
      const selfClosing = /\/\s*>$/.test(t2);
      if (closing) {
        if (m2[1] === name && depth === 0) break; // 容器闭合
        depth = Math.max(0, depth - 1);
        j = e2;
        continue;
      }
      if (depth === 0) {
        // 深度 1 子元素：按出现顺序对应 kids
        if (kIdx < kids.length && flexes[kIdx] != null) {
          const flexV = flexes[kIdx];
          const childInline = parseDecls(readStyleAttr(t2));
          const childBind = t2.match(/:style\s*=\s*"[^"]*"/);
          const childDynFlex = childBind ? /(^|[^-\w])flex\s*:/.test(childBind[0]) : false;
          const hasFlex =
            'flex' in childInline ||
            'flex-grow' in childInline ||
            'flex-basis' in childInline ||
            childDynFlex;
          if (!hasFlex) {
            const flexDecl = `flex: ${flexV}`;
            let newT2;
            if (/\sstyle\s*=\s*"/.test(t2)) {
              newT2 = t2.replace(
                /(\sstyle\s*=\s*")([^"]*)(")/,
                (_m, a, b, c) => `${a}${b.replace(/;\s*$/, '')};${flexDecl}${c}`,
              );
            } else {
              newT2 = t2.replace(/>\s*$/, ` style="${flexDecl}">`);
            }
            edits.push({ from: lt2, to: e2, text: newT2 });
            stats.childFlex += 1;
          }
        }
        kIdx += 1;
      }
      if (!selfClosing && !VOID_TAGS.has(m2[1].toLowerCase())) depth += 1;
      j = e2;
    }

    injected.push({ sid, dir, flexes });
    stats.injected += 1;
    i = end;
  }

  if (edits.length === 0) return { content, changed: false, injected, stats };

  // ⑥ 从后往前切片替换（html 段偏移 → 全文偏移 = htmlStart + 相对偏移）
  edits.sort((a, b) => b.from - a.from);
  let out = content;
  for (const ed of edits) {
    out = out.slice(0, htmlStart + ed.from) + ed.text + out.slice(htmlStart + ed.to);
  }
  return { content: out, changed: out !== content, injected, stats };
}

export default injectContainerLayoutTruth;
