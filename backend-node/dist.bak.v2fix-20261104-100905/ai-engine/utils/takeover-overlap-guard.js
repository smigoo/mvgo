/**
 * 🛡️ 刀 13（2026-10-27 · mv-max-1793101716713-f33d8c12 实锤）：接管叶重复覆盖守卫（vue3 链）。
 *
 * ## 病灶
 * vue3 的 index.vue 由 **LLM 自由装配**（不走确定性模板）：LLM 自造 `DeviceDetailHeader`
 * （data-section-id="801:3"，完整实现 左图+名称+编码+爆闪灯+ROB004），同时 plan 的刀 53
 * 接管叶（`801:3-orphan-text-0` GD-Robot-04 / `801:3-orphan-text-1` 编码+爆闪灯）也被
 * index 引用 ⇒ **同一头部区域双份渲染**（名称、编码行各出现两次）。微码链无此病
 * （index 骨架确定性、LLM 无权自造区域）。
 *
 * ## 判据（纯结构 + 真值文本，命名无关）
 * 对每个接管叶 T（仅 **合成孤儿文本段**：sectionId 含 `-orphan-text-` / `-tail-text`）：
 *   ① 存在非接管组件 X（.vue、非 index、非接管产物）的 data-section-id 命中 T 的
 *      **祖先段**（`801:3-orphan-text-0` → `801:3`）；
 *   ② X 模板可见文本**全覆盖** T 的全部真值文本（runs/text，剥标签剥注释、压空白后子串）；
 *   ⇒ X 已完整实现该区域 ⇒ 从 index.vue 摘除 T 的标签（重复渲染源）。
 *
 * ## 爆炸半径控制
 *   · 只动 index.vue 的标签引用：叶文件本体保留（死 import 由既有 prune 守卫收，
 *     孤儿文件由 OrphanComponentDetector 收）；
 *   · 只认孤儿文本叶：kvgrid/statrow 等**整段接管**（如 `81:7`）不参与——X 标容器
 *     sid 可能是「整段实现」，摘它内容全丢；
 *   · 任一条件不满足 ⇒ 不摘（fail-open 零行为变化）。
 *
 * 纯函数、无 import.meta、不修改入参。
 *
 * @param {object} params
 * @param {string} params.indexContent package/index.vue 内容
 * @param {Record<string,string>} params.files 全部产物（path → content）
 * @param {Map<string,object>} params.takeoverTargets 接管产物（subPath → tr，tr 含 sectionId/runs/text）
 * @returns {{ content: string, removed: Array<{tag:string, sectionId:string, coveredBy:string, texts:string[]}> }}
 */
export function pruneTakeoverCoveredLeaves({ indexContent, files, takeoverTargets } = {}) {
  const content = String(indexContent || '');
  const allFiles = files && typeof files === 'object' ? files : {};
  const targets = takeoverTargets instanceof Map ? takeoverTargets : new Map();
  const removed = [];
  if (!content || targets.size === 0) return { content, removed };

  const ancestorOf = (sid) => {
    const s = String(sid || '');
    const i = s.indexOf('-orphan-text-');
    if (i > 0) return s.slice(0, i);
    const j = s.indexOf('-tail-text');
    if (j > 0) return s.slice(0, j);
    return null; // 非合成孤儿叶不参与（见头注释爆炸半径控制）
  };
  const normText = (s) =>
    String(s || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, '');
  // 接管叶真值文本集：优先 tr.runs/tr.text；真实 tr 形态（{kind,sectionId,baseId,vue}）
  // 文本在 tr.vue 的 script 常量里 ⇒ 回退提取字符串字面量（过滤样式值/类名/路径）。
  const extractTruthTextsFromVue = (vue) => {
    const src = String(vue || '');
    // 分段：template 段剥掉标签（属性值如 class="c-..." 不是可见文本）；script 段整取；
    // style 段不扫（类名/样式值混入会造成假阴）。
    const tpl = (src.match(/<template[\s\S]*?<\/template>/i) || [''])[0].replace(/<[^>]+>/g, ' ');
    const script = (src.match(/<script[\s\S]*?<\/script>/i) || [''])[0];
    const pool = `${tpl}\n${script}`;
    const out = new Set();
    // 只取「赋值/键值右侧」的字符串（真值常量），排除键名、$attrs 这类绑定值
    for (const m of pool.matchAll(/(?:=|:)\s*"([^"\n]+)"|(?:=|:)\s*'([^'\n]+)'/g)) {
      const s = (m[1] || m[2] || '').trim();
      if (s.length < 2) continue;
      if (!/[\u4e00-\u9fa5A-Za-z]/.test(s)) continue; // 必须含字母或汉字
      if (/[{};/:#\\$]/.test(s)) continue; // 样式值/路径/类名/绑定值
      if (/^[\w-]+$/.test(s) && !/[\u4e00-\u9fa5]/.test(s) && s.length < 4) continue; // 短标识符（text/vue 等）
      out.add(s);
    }
    return [...out];
  };
  const leafTextsOf = (tr) => {
    if (Array.isArray(tr?.runs) && tr.runs.length > 0) {
      return tr.runs.map((r) => String(r?.text || '').trim()).filter(Boolean);
    }
    const t = String(tr?.text || '').trim();
    if (t) return [t];
    return extractTruthTextsFromVue(tr?.vue);
  };
  const sidsOf = (src) => {
    const out = new Set();
    for (const m of String(src || '').matchAll(/data-section-id="([^"]+)"/g)) out.add(m[1]);
    return out;
  };

  // 非接管组件池（排除 index 与接管产物自身）
  const llmFiles = Object.keys(allFiles).filter(
    (p) => /\.vue$/i.test(p) && p !== 'package/index.vue' && !targets.has(p),
  );

  let out = content;
  for (const [subPath, tr] of targets) {
    const sid = String(tr?.sectionId || '');
    const ancestor = ancestorOf(sid);
    if (!ancestor) continue;
    const texts = leafTextsOf(tr);
    if (texts.length === 0) continue;
    const tag = String(subPath.split('/').pop() || '').replace(/\.vue$/i, '');
    if (!tag || !new RegExp(`<${tag}\\b`).test(out)) continue; // index 未引用 ⇒ 无重复
    for (const xp of llmFiles) {
      if (xp === subPath) continue;
      const xs = String(allFiles[xp] || '');
      if (!sidsOf(xs).has(ancestor)) continue;
      const xText = normText(xs);
      if (texts.every((t) => xText.includes(t.replace(/\s+/g, '')))) {
        // 摘除 index 中该叶的标签（自闭合与成对两种形态）
        const re = new RegExp(`[ \\t]*<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)\\s*`, 'g');
        out = out.replace(re, '\n');
        removed.push({ tag, sectionId: sid, coveredBy: xp, texts });
        break;
      }
    }
  }
  return { content: out, removed };
}
