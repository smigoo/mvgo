/**
 * 🎯 2026-09-14 治本①②：section 内容映射守卫（验证优先，不自动重排/删除）。
 *
 * 两类真机实锤（c-traffic-monitor-29570c8e / 3147d679）：
 *   ① 左右镜像：inline-row（横向）section 的成员在产物模板中的 DOM 序与 Figma bbox.x 序相反
 *      —— 统计行「江阴大桥」渲染在左（设计稿隧道在左）、次行「24小时」渲染在左（设计稿标题在左）。
 *      注：TEXT-001 healer（code-healer.fixTextSiblingOrder）导出后从未被调用（死代码），
 *      且其范围（同父文本兄弟）也不覆盖「复合单元」级互换 → 本守卫补位。
 *   ② 跨组件内容错装：HeaderSection（顶栏）被装入次行 88:32 的「当日总流量+24小时」，
 *      与 ContentSubHeader 重复渲染。归属真值 = Figma 子树文本：
 *      文本只属于子树包含它的 section；若某文本唯一归属于 section X，却渲染在 ≥2 个组件文件
 *      → 错装/重复（如「当日总流量」只属 88:32，却出现在 HeaderSection.vue + ContentSubHeader.vue）。
 *      合法重复自动豁免：文本在多个 section 的子树中都存在（如图例「北京方向」同属两张图表）。
 *
 * 铁律：**验证优先于自愈**——不盲目重排 DOM（会与 CSS 左右专属样式打架）、不静默删文本；
 *       只产出可读 issues，由调用方决定留痕/BLOCK/重试。
 */
import {
  buildChildrenMap,
  collectSubtreeTexts,
  splitTitleValueByStyle,
  indexFigmaNodes,
  assignSectionComponentNames,
  isLayoutContainerSection,
} from './section-tree.js';
import { techStackRequiredPatterns } from '../validators/element-coverage-validator.js';
import { assessStatRowConfidence } from './inline-row-assembler.js';
import { extractRenderedText } from './text-truth-guard.js';

const MIN_SIG_LEN = 2; // 成员签名文本最小长度（如「24小时」=3）
const MIN_DUP_LEN = 4; // 重复检测文本最小长度（排除「24小时」类短共享词）


/**
 * 取成员视觉签名：优先「最独特」文本 —— 在组件文件中出现次数最少者（避免标题类文本
 * 跨 tabs/车型分布/预测多处重复导致的宿主文件歧义，如「江阴大桥」同现于 4 个组件）。
 * 同频时取更长者（**命名无关**：2026-09-30 起删除原「标题优先（t- 前缀）」排序键，
 * 该键依赖图层名判文本角色，违反「文本处理命名无关」契约；
 * 全语料 A/B：4871 个候选里仅 50 个（1.0%）签名因此变化）。
 */
function signatureText(nodeId, index, childrenOf, vueFiles) {
  const items = collectSubtreeTexts(nodeId, index, childrenOf).filter(
    (i) => i.text.length >= MIN_SIG_LEN,
  );
  if (items.length === 0) return null;
  const scored = items
    .map((i) => ({
      ...i,
      hostCount: vueFiles.filter((f) => f.renderedText.includes(i.text)).length,
    }))
    .filter((i) => i.hostCount >= 1); // 未在任何组件渲染的文本无法作为定位签名
  if (scored.length === 0) return null;
  scored.sort(
    (a, b) =>
      a.hostCount - b.hostCount || // 独特者优先
      b.text.length - a.text.length, // 更长者优先
  );
  return scored[0].text;
}

/** 递归收集 plan.effectiveSections 的所有 section */
function collectSections(sections, out = []) {
  for (const s of sections || []) {
    if (!s) continue;
    out.push(s);
    if (Array.isArray(s.children)) collectSections(s.children, out);
  }
  return out;
}

/**
 * 校验产物内容映射。
 *
 * @param {object} params
 * @param {Array<{path:string, content:string}>} params.files 产物文件（只分析 package/components/*.vue）
 * @param {object} params.plan subComponentPlan（含 effectiveSections）
 * @param {object} params.figmaRoot figmaNodeData（document 树）
 * @returns {{memberOrderIssues: Array, duplicateTextIssues: Array}}
 */
export function checkSectionContent({ files, plan, figmaRoot }) {
  const result = { memberOrderIssues: [], duplicateTextIssues: [] };
  if (!Array.isArray(files) || files.length === 0) return result;
  if (!plan || !Array.isArray(plan.effectiveSections)) return result;

  const index = indexFigmaNodes(figmaRoot);
  if (index.size === 0) return result;
  const childrenOf = buildChildrenMap(index);

  const vueFiles = files
    .filter(
      (f) =>
        typeof f?.path === 'string' &&
        /package\/components\/[^/]+\.vue$/.test(f.path) &&
        typeof f.content === 'string',
    )
    .map((f) => ({
      ...f,
      // 🛡️ R5-dup：预提取「渲染文本」（剥离 HTML 注释/标签/插值），供下方 includes 判定。
      // 裸 f.content.includes(text) 会把注释（`<!-- 当日总流量区域背景 -->`）误判为渲染 → 假阳性。
      renderedText: extractRenderedText(f.content),
    }));
  if (vueFiles.length === 0) return result;

  const sections = collectSections(plan.effectiveSections);

  // ── ① inline-row 成员序校验（DOM 序 must == Figma x 序）──
  for (const sec of sections) {
    if (sec?.body?.layout !== 'horizontal') continue;
    const ids = Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : [];
    const memberIds = ids.filter((id) => String(id) !== String(sec.id));
    if (memberIds.length < 2) continue;

    const entries = memberIds
      .map((id) => {
        const box = index.get(String(id))?.bbox;
        return {
          id: String(id),
          x: typeof box?.x === 'number' ? box.x : null,
          sig: signatureText(String(id), index, childrenOf, vueFiles),
        };
      })
      .filter((e) => e.x !== null && e.sig);
    if (entries.length < 2) continue;

    // 签名互为子串时跳过（indexOf 定位会互相污染，保守不判）
    const sigs = entries.map((e) => e.sig);
    if (sigs.some((a, i) => sigs.some((b, j) => i !== j && a.includes(b)))) continue;

    const expected = [...entries].sort((a, b) => a.x - b.x); // 视觉左→右
    const hostFiles = vueFiles.filter((f) =>
      expected.every((e) => f.renderedText.includes(e.sig)),
    );
    if (hostFiles.length === 0) continue; // 找不到同载体的宿主文件 → 无法判定

    const allWrong = hostFiles.every((f) => {
      // 🛡️ 2026-09-15（真机 mc-1789464855419 实锤）：序判定必须用 renderedText（剥离标签后），
      //   与宿主判定同口径。旧实现用 `f.content.indexOf(e.sig)`（原始文本），而 sig 是归一化后
      //   的纯文本（如「南北接线设备」），产物里却是「南北接线<br/>设备」（被 <br/> 断开）
      //   → indexOf 返回 -1 → 被误判为「序反」（假阳性）。两处口径不一致是根因。
      const idx = (e) => f.renderedText.indexOf(e.sig);
      let prev = -1;
      for (const e of expected) {
        const cur = idx(e);
        if (cur < prev) return true; // 期望靠左者的文本反而在后面
        prev = cur;
      }
      return false;
    });
    if (allWrong) {
      result.memberOrderIssues.push({
        sectionId: sec.id,
        sectionTitle: sec.title || '',
        expectedLeftToRight: expected.map((e) => e.sig),
        hostFiles: hostFiles.map((f) => f.path),
      });
    }
  }

  // ── ② 唯一归属文本跨组件重复校验（Figma 子树 = 归属真值）──
  // 🛡️ P2-10 对齐（2026-10-01）：容器 section（isLayoutContainer）是**空间包裹**，不单独
  //   生成 .vue，不可能是「内容 owner」。此前容器恒 `sourceNodeIds=[]`（planner 容器分支
  //   漏字段）⇒ 天然不进本表；P2-10 补齐后若不跳过，容器会经 collectSubtreeTexts 认领
  //   整棵子树文本 ⇒ 每个叶子文本多出一个祖先 owner ⇒ `owners.size !== 1` 一律跳过
  //   ⇒ 本规则整段失明（假阴性）。与下方借用判定的「最小归属 isProperSubset」同语义：
  //   容器永不是最小归属。
  const textOwners = new Map(); // text -> Set(sectionId)
  const sectionTexts = new Map(); // sectionId -> Set(text)
  for (const sec of sections) {
    if (isLayoutContainerSection(sec)) {
      sectionTexts.set(String(sec.id), new Set());
      continue;
    }
    const ids = Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : [];
    const own = new Set();
    for (const id of ids) {
      for (const item of collectSubtreeTexts(String(id), index, childrenOf)) {
        const t = item.text;
        if (t.length < MIN_DUP_LEN) continue;
        own.add(t);
        if (!textOwners.has(t)) textOwners.set(t, new Set());
        textOwners.get(t).add(String(sec.id));
      }
    }
    sectionTexts.set(String(sec.id), own);
  }

  for (const [text, owners] of textOwners) {
    if (owners.size !== 1) continue; // 多 section 共有（图例类）→ 合法重复
    const ownerSection = [...owners][0];
    const hostFiles = vueFiles.filter((f) => f.renderedText.includes(text));
    if (hostFiles.length >= 2) {
      result.duplicateTextIssues.push({
        text,
        ownerSection,
        renderedIn: hostFiles.map((f) => f.path),
        hint: `文本仅归属 section ${ownerSection}（Figma 子树真值），却被 ${hostFiles.length} 个组件渲染`,
      });
    }
  }

  return result;
}

/**
 * 取「错误签名」集合：剥离 `path:line:col ` 前缀后的错误消息集合。
 *
 * 🛡️ 2026-09-29 治本（流量监测 mc-max-1790657317082-67u1cdxz 实锤）：
 * `validateVueSfc` 校验的是 SFC `<style>` 的**孤立文本**，**不解析 `@import`**，
 * 因此凡直接用主题槽位变量的文件（`border: 1px solid @color-border-light`）一律被报
 * `variable @color-border-light is undefined` → `valid:false`，尽管该槽位在
 * `resources/styles/themes/theme-vars.less`（:28/:36/:48/:56/:68）里有定义。
 * 旧判据「valid 才通过」于是把这类文件**所有**待删文本一并否决 →
 * 本任务 5 条重复文本只自愈 3 条，漏掉用户最直观看到的「当日总流量」「24小时」。
 * 实测铁证：删除前后错误集**完全一致**（见 __replay-validate.js）⇒ 是文件**预先存在**的问题。
 * 传 `validateSfc` 判 true 时集合为空。
 */
function errorSignatures(validateSfc, content, filePath) {
  try {
    const r = validateSfc(content, filePath)
    if (!r || r.valid) return new Set()
    return new Set(
      (r.errors || []).map((e) =>
        String(e)
          // 去掉 `path:line:col ` 前缀：删除会改变行号，直接比对会把既有错误误判为新增
          .replace(/^\S*?:\d+:\d+\s*/, '')
          .trim(),
      ),
    )
  } catch {
    return new Set(['__validate_threw__'])
  }
}

/**
 * 差分判据：删除是否**引入新错误**。
 * 只把「本次删除新增的错误」视为改坏 —— 既拦住真改坏（原本 valid → 变 invalid 时为新增），
 * 又不再被文件**预先存在**的（含 validateVueSfc 对 @import 不感知造成的误报）问题误伤。
 */
function introducesNewErrors(validateSfc, before, after, filePath) {
  const b = errorSignatures(validateSfc, before, filePath)
  for (const sig of errorSignatures(validateSfc, after, filePath)) {
    if (!b.has(sig)) return true
  }
  return false
}

/**
 * 🛡️ 阶段 C（2026-09-15 · 序 5）：内容守卫分级——高置信自愈。
 *
 * 从 checkSectionContent 的 duplicateTextIssues 里挑「高置信」条目做确定性自愈：
 *   · 唯一归属文本（Figma 子树真值）却渲染在 ≥2 组件 → 从**非 owner 组件**删除该文本的
 *     模板静态文本节点（如 `<span>24小时</span>`）。
 *   · owner 组件 = ownerSection 经 assignSectionComponentNames 得到的组件名；
 *     renderedIn 里除 owner 组件外的其余文件 = 错装文件。
 *
 * 铁律（与 checkSectionContent 一致，验证优先于自愈）：
 *   - 只在「模板里找到该文本的**独立静态文本节点**」时删除（`>…text…<` 且无其它语义文本），
 *     绝不裸 split/join 字符串（会误删 script 数据字段、chart 配置、注释）。
 *   - owner 组件不在 renderedIn 里（无法确定谁是错装）→ 跳过，不猜。
 *   - 🛡️ 2026-09-29 修订：SFC 校验改为**差分判据**（只拦「删除引入的新错误」）。
 *     旧判据是整体 `valid`，会被文件预先存在的问题（尤其 validateVueSfc 对 `@import`
 *     不感知造成的 `@color-* is undefined` 误报）整体否决 ⇒ 自愈静默失效。
 *
 * @param {object} params
 * @param {Array<{path:string, content:string}>} params.files 产物文件（package/components/*.vue）
 * @param {object} params.plan subComponentPlan（含 effectiveSections）
 * @param {object} params.figmaRoot figmaNodeData（document 树）
 * @param {Function} [params.validateSfc] 可选 SFC 语法校验（content, path）=> {valid, errors}
 * @returns {{files:Array, healed:Array<{text:string, removedFrom:Array<string>}>}}
 */
export function healDuplicateTextIssues({ files, plan, figmaRoot, validateSfc }) {
  if (!Array.isArray(files) || files.length === 0) return { files, healed: [] };
  if (!plan || !Array.isArray(plan.effectiveSections)) return { files, healed: [] };

  const { duplicateTextIssues } = checkSectionContent({ files, plan, figmaRoot });
  if (duplicateTextIssues.length === 0) return { files, healed: [] };

  // section id → 组件名（owner 组件定位）
  let nameOf;
  try {
    nameOf = assignSectionComponentNames(plan.effectiveSections);
  } catch {
    return { files, healed: [] };
  }

  const byPath = new Map(files.map((f) => [f.path, f]));
  const healed = [];

  for (const issue of duplicateTextIssues) {
    const ownerName = nameOf.get(String(issue.ownerSection));
    if (!ownerName) continue; // 无法确定 owner 组件 → 不猜
    const ownerFile = `package/components/${ownerName}.vue`;
    const renderedIn = Array.isArray(issue.renderedIn) ? issue.renderedIn : [];
    // 🛡️ 2026-09-30 落地本函数 docblock 已写明、但代码从未实现的规则：
    //   「owner 组件不在 renderedIn 里（无法确定谁是错装）→ 跳过，不猜」。
    //
    // 为什么必须补：`assignSectionComponentNames` 是**确定性命名**，而 LLM 实际写盘的文件名
    // 常与之不同 ⇒ `ownerFile` 可能根本不存在。旧代码只做 `filter(p => p !== ownerFile)`，
    // 此时**一个都过滤不掉** ⇒ `wrongFiles` 退化为「全部 renderedIn」⇒ 对**合法归属**的组件
    // 也照删。真机实锤（`c-traffic-monitor-5nxelujp-1a29a03f` / `-71jd0k1q-dc6aaa0d` /
    // `-yb6mcxbx-3df87ac9` / `-zpikb3zg-d1a940f2`，四个变体）：
    //   · `当日总流量` owner=§88:32→`HeaderSub`（**无此文件**），renderedIn =
    //     [DailyTotalStats, HeaderSection, SubHeaderDaily] ⇒ 三个全删，其中前/后者很可能正是
    //     该卡片的真实宿主；
    //   · `22350`/`16270`/`66109` owner=§2:3438→`ContentVehicleDist`（**无此文件**），renderedIn =
    //     [VehicleTypeDistribution, VehicleTypeSlot] ⇒ 两个全删 —— 而 `VehicleTypeDistribution`
    //     按语义就是车型分布卡本体。
    //
    // 判据（两条同时成立才处置，宁漏不误伤）：
    //   ① owner 组件文件**确实产出**（否则「非 owner」无从定义）；
    //   ② owner 组件**确实渲染该文本**（否则删掉其余位置 = 该文本彻底消失，属**另一种**未经验证的
    //      「补写」，不是本函数的职责；且这正是 `checkSectionContent` 用 renderedIn 的语义前提）。
    if (!byPath.has(ownerFile)) continue;
    if (!renderedIn.includes(ownerFile)) continue;
    // 错装文件 = renderedIn 里除 owner 组件外的其余文件
    const wrongFiles = renderedIn.filter((p) => p !== ownerFile);
    if (wrongFiles.length === 0) continue;

    const removedFrom = [];
    for (const wrongPath of wrongFiles) {
      const rec = byPath.get(wrongPath);
      if (!rec || typeof rec.content !== 'string') continue;
      const text = String(issue.text);
      const cleaned = removeStaticTextNode(rec.content, text);
      if (cleaned === null) continue; // 未找到可安全删除的静态文本节点
      if (validateSfc && introducesNewErrors(validateSfc, rec.content, cleaned, wrongPath)) {
        continue; // 删除**引入新错误** → 回退（预先存在的问题不再否决）
      }
      rec.content = cleaned;
      removedFrom.push(wrongPath);
    }
    if (removedFrom.length > 0) {
      healed.push({ text: issue.text, removedFrom });
    }
  }

  return { files: [...byPath.values()], healed };
}

/**
 * 🎯 2026-09-30 治本：借用证据的**确定性处置**（`borrowedTextIssues` / `borrowedAssetIssues`）。
 *
 * 为什么必须做：这两个 issue 自 2026-09-14 起就**算得出、只写 meta、零处置**
 * （全语料 `borrowedText` 48 + `borrowedAsset` 26 = 74 个组件，占 14.4%）。
 * 真机最刺眼的两个视觉缺陷正出自此处：
 *   · `c-e1f141-e1f141a5`：「交通事故/车辆故障/施工养护」owner = `287:5-left`，却被
 *     `ChartSection.vue` + `StatsLeft.vue` 双渲染 ⇒ 两侧列表错。
 *   · `c-traffic-monitor-6d7082a1`：`ContentSection.vue`（section `2:3680`，Figma 真值
 *     `fills: []` 本无背景）却 `:style` 里挂了 `bg-_m-35.png`（node `88:35`，owner `2:3496`
 *     = 车型分布卡）⇒ 「当日总流量的总统计数据出现车型分布的背景图」。
 *
 * 处置口径（**与 `healDuplicateTextIssues` 同族：保守删 + `validateSfc` 回退 + 不猜**）：
 *   · 借用文本 ⇒ 从**非归属组件**删掉该静态文本节点（复用 `removeStaticTextNode`，只认
 *     「标签之间纯文本」形态，子串/复合节点一律不删）；
 *   · 借用资源 ⇒ 删**非归属组件**里引用该资源变量的绑定（`:style` 对象里的顶层属性 /
 *     `:attr="var"` 整属性），随后**立即**对该文件跑 `pruneUnmounted`（同一实现
 *     `pruneUnmountedResourceImports`）剪掉因此未挂载的 import。
 *
 * ⚠️ **次序铁律**：删引用与剪 import 必须在**同一处**完成。若只删引用不剪 import，会留下
 *    「已 import 但零引用」⇒ 撞 CODE-022 硬闸（fail-closed）⇒ 重试耗尽。故本函数把
 *    `pruneUnmounted` 作为参数**内置调用**，而不是依赖别处的前置剪枝。
 *
 * 不判/不猜：
 *   · 拿不到资源变量名（mapping 里无 `assignedVarName`/`semanticVarName`）⇒ 跳过；
 *   · 引用形态不认识（非对象字面量 `:style`、非「表达式恰为变量」的直接绑定）⇒ 跳过；
 *   · 删除会**引入新错误** ⇒ 回退（预先存在的问题不否决）。
 *
 * @param {object} params
 * @param {Array<{path:string, content:string}>} params.files 产物文件（**会被原地改写**）
 * @param {object} params.plan subComponentPlan（含 effectiveSections）
 * @param {object} params.figmaRoot figmaNodeData（document 树）
 * @param {Array} [params.resourceDomMapping] 资源-DOM 映射
 * @param {Function} [params.validateSfc] (content, path) => { valid, errors }
 * @param {Function} [params.pruneUnmounted] (content, mapping) => { content, changed, pruned }
 * @returns {{files: Array, healed: {text: Array, asset: Array}}}
 */
export function healBorrowedEvidence({
  files,
  plan,
  figmaRoot,
  resourceDomMapping,
  validateSfc,
  pruneUnmounted,
} = {}) {
  const none = { files, healed: { text: [], asset: [] } };
  if (!Array.isArray(files) || files.length === 0) return none;
  if (!plan || !Array.isArray(plan.effectiveSections)) return none;

  const check = checkSectionExclusiveEvidence({ files, plan, figmaRoot, resourceDomMapping });
  if (
    check.borrowedTextIssues.length === 0 &&
    check.borrowedAssetIssues.length === 0
  ) {
    return none;
  }

  // byPath 持有**同一批对象引用** ⇒ 原地改 content，调用方拿到的 files 已同步
  const byPath = new Map(files.map((f) => [f.path, f]));
  const healedText = [];
  const healedAsset = [];

  // 资源 basename → 资源变量名（二者在 mapping 里是同一行的事实）
  const varByName = new Map();
  for (const m of Array.isArray(resourceDomMapping) ? resourceDomMapping : []) {
    const file = m?.resourceFile || m?.fileName || m?.filename;
    const v = m?.assignedVarName || m?.semanticVarName;
    if (!file || !v) continue;
    const base = String(file).split('/').pop();
    if (base && !varByName.has(base)) varByName.set(base, String(v));
  }

  // ── ① 借用文本：从非归属组件删除该静态文本节点 ──
  for (const issue of check.borrowedTextIssues) {
    const rec = byPath.get(issue.file);
    if (!rec || typeof rec.content !== 'string') continue;
    const cleaned = removeStaticTextNode(rec.content, String(issue.text));
    if (cleaned === null) continue; // 找不到可安全删除的静态节点 → 不猜
    if (validateSfc && introducesNewErrors(validateSfc, rec.content, cleaned, issue.file)) {
      continue;
    }
    rec.content = cleaned;
    healedText.push({
      text: issue.text,
      removedFrom: issue.file,
      ownerSection: issue.ownerSection,
    });
  }

  // ── ② 借用资源：删非归属组件的引用 + 就地剪掉未挂载 import ──
  const touched = new Set();
  for (const issue of check.borrowedAssetIssues) {
    const rec = byPath.get(issue.file);
    if (!rec || typeof rec.content !== 'string') continue;
    const varName = varByName.get(String(issue.resource));
    if (!varName) continue; // 拿不到变量名 → 不猜
    const cleaned = removeResourceRefs(rec.content, varName);
    if (cleaned === null) continue; // 引用形态不认识 → 不猜
    if (validateSfc && introducesNewErrors(validateSfc, rec.content, cleaned, issue.file)) {
      continue;
    }
    rec.content = cleaned;
    touched.add(issue.file);
    healedAsset.push({
      resource: issue.resource,
      var: varName,
      removedFrom: issue.file,
      ownerNodeIds: issue.ownerNodeIds,
    });
  }
  if (typeof pruneUnmounted === 'function') {
    for (const p of touched) {
      const rec = byPath.get(p);
      if (!rec || typeof rec.content !== 'string') continue;
      try {
        const pr = pruneUnmounted(rec.content, resourceDomMapping);
        if (pr && pr.changed) rec.content = pr.content;
      } catch {
        /* 剪枝失败不阻断：引用已删，import 残留仅是噪声 */
      }
    }
  }

  return { files: [...byPath.values()], healed: { text: healedText, asset: healedAsset } };
}

/**
 * 删除「引用某资源变量的绑定」，返回新内容；认不出形态返回 null（不猜）。
 *
 * 只处理两种**可确定性定位**的形态：
 *   ① `:style="{ … backgroundImage: 'url(' + bg3 + ')' … }"` —— 对象字面量里的**顶层属性**
 *      （值的表达式引用该变量）⇒ 删该属性（含相邻逗号），保留其余属性原格式；
 *   ② `:attr="bg3"` —— 绑定表达式**恰为该变量本身** ⇒ 删整个属性。
 */
function removeResourceRefs(content, varName) {
  if (typeof content !== 'string' || !content || !varName) return null;
  const esc = String(varName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const refRe = new RegExp(`\\b${esc}\\b`);
  let out = removeStylePropsReferencing(content, refRe);
  out = removeExactBindings(out, varName);
  return out === content ? null : out;
}

/** ① 删 `:style` 对象字面量里引用 refRe 的顶层属性；`:style` 因此变空则删整个属性。 */
function removeStylePropsReferencing(content, refRe) {
  const rx = /(:style|v-bind:style)\s*=\s*(["'])([\s\S]*?)\2/g;
  const edits = [];
  let m;
  while ((m = rx.exec(content)) !== null) {
    const raw = m[3];
    const braceStart = raw.indexOf('{');
    const braceEnd = raw.lastIndexOf('}');
    if (braceStart < 0 || braceEnd <= braceStart) continue; // 非对象字面量 → 不动
    const body = raw.slice(braceStart + 1, braceEnd);
    const parts = splitTopLevelObjectProps(body);
    if (parts.length === 0) continue;
    const removed = parts.map((p) => refRe.test(p.text));
    if (!removed.some(Boolean)) continue;

    // 计算删除区段（按 body 坐标；末段连前导逗号一起删，避免留悬挂逗号）
    const delRanges = [];
    let i = 0;
    while (i < parts.length) {
      if (!removed[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < parts.length && removed[j + 1]) j++;
      let s = parts[i].start;
      let e;
      if (j + 1 < parts.length) {
        e = parts[j + 1].start; // 含尾随逗号
      } else {
        e = body.length;
        if (i > 0) s = parts[i - 1].end; // 末段：连前导逗号
      }
      delRanges.push([s, e]);
      i = j + 1;
    }
    let newBody = body;
    for (let k = delRanges.length - 1; k >= 0; k--) {
      newBody = newBody.slice(0, delRanges[k][0]) + newBody.slice(delRanges[k][1]);
    }
    const newRaw = raw.slice(0, braceStart + 1) + newBody + raw.slice(braceEnd);
    if (newBody.trim() === '') {
      // `:style` 空了 → 整个属性删掉（含其前导空白）
      edits.push({ start: m.index, end: m.index + m[0].length, text: '' });
    } else {
      edits.push({ start: m.index, end: m.index + m[0].length, text: `${m[1]}=${m[2]}${newRaw}${m[2]}` });
    }
  }
  return applyEdits(content, edits);
}

/** ② 删绑定表达式恰为 `varName` 的属性（`:src="bg3"` / `:icon='bg3'`）。 */
function removeExactBindings(content, varName) {
  const esc = String(varName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(
    `[ \\t]+:([a-zA-Z][\\w:-]*)\\s*=\\s*(["'])\\s*${esc}\\s*\\2`,
    'g',
  );
  const edits = [];
  let m;
  while ((m = rx.exec(content)) !== null) {
    edits.push({ start: m.index, end: m.index + m[0].length, text: '' });
  }
  return applyEdits(content, edits);
}

/** 取 `{…}` 体内**顶层**属性切分（跳过引号与括号嵌套），返回 body 坐标下的区间。 */
function splitTopLevelObjectProps(body) {
  const ranges = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      ranges.push([start, i]);
      start = i + 1;
    }
  }
  ranges.push([start, body.length]);
  return ranges
    .map(([s, e]) => ({ start: s, end: e, text: body.slice(s, e) }))
    .filter((p) => p.text.trim() !== '');
}

/** 从后往前应用区间编辑（避免 offset 漂移）。 */
function applyEdits(content, edits) {
  if (edits.length === 0) return content;
  let out = content;
  for (let i = edits.length - 1; i >= 0; i--) {
    out = out.slice(0, edits[i].start) + edits[i].text + out.slice(edits[i].end);
  }
  return out;
}

/**
 * 从 SFC 模板里删除「text 作为独立静态文本节点」的出现，返回新内容；
 * 找不到可安全删除的节点时返回 null（不裸删字符串）。
 *
 * 仅匹配 `>…text…<`（标签之间纯文本，可含空白）这一种形态，且该节点内除 text 外
 * 无其它中文字符（避免把 `<span>24小时趋势</span>` 里的「24小时」误删成「趋势」）。
 */
function removeStaticTextNode(content, text) {
  const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 静态文本节点：标签闭合后、下一个 < 之前，纯 text（含空白），且无其它中文
  const rx = new RegExp(
    `>[\\s]*${esc}[\\s]*<(?![^>]*${esc})`,
    'g',
  );
  const matches = [...content.matchAll(rx)];
  if (matches.length === 0) return null;
  let out = content;
  // 从后往前替换，避免 offset 漂移
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    // 仅当该文本片段左右无其它中文才删（避免子串误删）
    const before = content.slice(Math.max(0, m.index - 12), m.index);
    const after = content.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const hasOtherCJK = /[\u4e00-\u9fa5]/.test(before + after);
    if (hasOtherCJK) continue;
    // 删除整个文本片段（含包裹空白），保留空标签
    out = out.slice(0, m.index) + '><' + out.slice(m.index + m[0].length);
  }
  return out === content ? null : out;
}

/**
 * 收集 section 子树内的全部 figma 节点 id（含 sourceNodeIds 自身）。
 * 与 collectSubtreeTexts 同源遍历（同一 childrenOf / index），保证口径一致。
 */
function collectSubtreeNodeIds(section, index, childrenOf) {
  const out = new Set();
  const walk = (id) => {
    const key = String(id);
    if (out.has(key)) return;
    if (!index.has(key)) return;
    out.add(key);
    for (const c of childrenOf?.get(key) || []) walk(c);
  };
  for (const id of Array.isArray(section?.sourceNodeIds) ? section.sourceNodeIds : []) {
    walk(id);
  }
  return out;
}

function intersects(a, b) {
  if (!a || !b || a.size === 0 || b.size === 0) return false;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) if (large.has(v)) return true;
  return false;
}

/** small 是否为 large 的真子集（用于甄别「容器归属 ⊃ 叶子归属」）。 */
function isProperSubset(small, large) {
  if (!small || !large) return false;
  if (small.size >= large.size) return false;
  for (const v of small) if (!large.has(v)) return false;
  return true;
}

/** 仅取 `package/components/*.vue` 产物文件（守卫/真值覆盖/自愈共用同一过滤口径）。 */
function vueComponentFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.filter(
    (f) =>
      typeof f?.path === 'string' &&
      /package\/components\/[^/]+\.vue$/.test(f.path) &&
      typeof f.content === 'string',
  );
}

/**
 * 剥离注释后的全文语料（供真值覆盖判定使用）。
 *
 * ⚠️ 为什么不用 `extractRenderedText`：它只收「模板静态文本 + script 里 `label|name|text|title:`
 * 对象字段」，**不收 `data: [...]` 数组元素**。真机实锤（c-traffic-monitor-141b6689 的
 * `ChartCharts.vue`）：图表自己的轴标签写在 `xAxis.data: ['2小时前', …]`（收不到 → 判「真值 0 命中」），
 * 而 `series.name: '实际流量'`（收得到）恰好属邻居 section → 被判「装了别人的」⇒ 假 BLOCK。
 *
 * 因此本函数按「**真值命中放宽、外来取证收紧**」的不对称口径：
 *   · 真值命中：用全文（剥注释）——尽量承认「内容确实在文件里」，避免误阻断；
 *   · 外来证据：仍用 `extractRenderedText`（会渲染到界面者）——避免注释里的邻居名字造成误阻断。
 * 两侧都朝「少阻断」方向偏，宁可漏判也不误杀。
 */
function stripCommentCorpus(content) {
  return String(content || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/[^\n]*/gm, ' ');
}

/**
 * 🎯 2026-09-29 治本·单一事实源：section 证据上下文。
 *
 * 供 `checkSectionExclusiveEvidence` / `checkSectionTruthCoverage`
 * 两处共用。本仓已知缺陷模式「同一事实两处各自计算 → 后置门禁只修一侧必失配」，故只算一次。
 *
 * @returns {null | {
 *   index: Map, childrenOf: Map, sections: Array,
 *   subIds: Map<string, Set<string>>,          // sectionId → 子树节点 id 集合
 *   subTexts: Map<string, Set<string>>,        // sectionId → 子树文本集合
 *   textOwner: Map<string, string>,            // 文本 → 唯一归属 sectionId（**最小**归属）
 *   sectionByComponent: Map<string, string>,   // 组件名 → sectionId
 * }}
 */
function buildSectionEvidenceCtx({ plan, figmaRoot }) {
  if (!plan || !Array.isArray(plan.effectiveSections)) return null;
  const index = indexFigmaNodes(figmaRoot);
  if (index.size === 0) return null;
  const childrenOf = buildChildrenMap(index);
  const sections = collectSections(plan.effectiveSections);

  // section id → 子树节点 id 集合 / 子树文本集合（单次遍历，供各规则共用）
  // ⚠️ 借用判据用 MIN_SIG_LEN（=2）而非 MIN_DUP_LEN（=4）：「客车」这类 2 字标签正是
  //    真机被搬走的证据，4 字门限会漏。误伤由「唯一归属 + 子树无交叠」两道约束压制。
  const subIds = new Map();
  const subTexts = new Map();
  for (const sec of sections) {
    const sid = String(sec.id);
    subIds.set(sid, collectSubtreeNodeIds(sec, index, childrenOf));
    const texts = new Set();
    for (const id of Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : []) {
      for (const item of collectSubtreeTexts(String(id), index, childrenOf)) {
        if (item.text.length >= MIN_SIG_LEN) texts.add(item.text);
      }
    }
    subTexts.set(sid, texts);
  }

  // 文本 → 唯一归属 section。
  // ⚠️ 必须取**最小归属**：容器 section 的子树天然包含其叶子 section 的子树，同一文本会同时
  //    出现在容器与叶子的 subTexts 里。若按「>1 即歧义」处理，几乎所有业务文本都会被误判为
  //    共有而漏报（真机实锤：`客车` 同时属 2:3438 容器与 2:3444 叶子 → 旧逻辑直接丢弃）。
  //    正解：丢弃「子树真包含另一个归属」的容器，只留最小者；仍有 ≥2 个极小归属才是真共有（图例类）。
  const ownersByText = new Map(); // text -> Set<sid>
  for (const sec of sections) {
    const sid = String(sec.id);
    for (const t of subTexts.get(sid)) {
      if (!ownersByText.has(t)) ownersByText.set(t, new Set());
      ownersByText.get(t).add(sid);
    }
  }
  const textOwner = new Map();
  for (const [t, owners] of ownersByText) {
    if (owners.size === 1) {
      textOwner.set(t, [...owners][0]);
      continue;
    }
    const arr = [...owners];
    const minimal = arr.filter(
      (a) => !arr.some((b) => b !== a && isProperSubset(subIds.get(b), subIds.get(a))),
    );
    if (minimal.length === 1) textOwner.set(t, minimal[0]);
  }

  // 组件名 → section（assignSectionComponentNames 只给叶子 section 命名）
  let nameOf;
  try {
    nameOf = assignSectionComponentNames(plan.effectiveSections);
  } catch {
    return null;
  }
  const sectionByComponent = new Map();
  for (const [sid, name] of nameOf) {
    if (name) sectionByComponent.set(String(name), String(sid));
  }
  if (sectionByComponent.size === 0) return null;

  return { index, childrenOf, sections, subIds, subTexts, textOwner, sectionByComponent };
}

/**
 * 某文本是否可作为「真值文案」参与覆盖判定。
 *
 * 排除 Figma 图层名泄漏产生的纯 ASCII 单字母噪声（真机实锤：section `2:3446` 的真值集合是
 * `t、d、江阴靖江长江隧道`，其中 `t`/`d` 是图层名不是文案）。必须排除：否则 `t` 会命中
 * 产物里任意 `text`/`title` 字样 → 让「本该阻断」的组件误判为「已有真值文案」。
 * 判据：含中文，或含数字（`82,379` / `24小时`）。
 */
function isMeaningfulTruthText(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  return /[\u4e00-\u9fa5]/.test(t) || /[0-9]/.test(t);
}

/**
 * 🎯 2026-09-29 治本·阶段 D：section 证据独占性守卫 —— 「借邻居内容」的完整形态。
 *
 * 背景（用户质问：同一结果多处输出却不一致、布局与样式本应固定、不该由 LLM 自由发挥）：
 * 已有 checkSectionContent 的 ② 只能抓「唯一归属文本被渲染在 ≥2 个组件」的**复制**形态；
 * **搬迁**形态（只出现 1 次，但搬进了不属于它的组件）完全隐形 —— 而这正是真机最刺眼的缺陷。
 *
 * 真机实锤（c-traffic-monitor / mc-max-1790657317082-67u1cdxz）：
 *   `2:3660` 是横向行，两个成员 `2:3680`（江阴大桥 / 82,379）、`2:3683`（34,620 /
 *   江阴靖江长江隧道）在 Figma 里是**纯数字块**；但产物 `ContentSection.vue` 渲染了
 *   `2:3438` 的车型分布卡 —— 背景图 `bg-_m-36.png`（其 figmaNodeId 属 2:3438 子树）、
 *   `客车/22350`、echarts 环形图，**没有一项是 2:3680 子树的证据**。
 *
 * 判据（保守：只报「独占取证」的借用，宁漏不误伤）：
 *   · 文本：文本 T 在**全部 section 子树**里只属于某一个 section O，O 与当前组件所属
 *     section S 的子树**无交叠**（排除祖孙/兄弟重叠导致的合法共用），而 S 的组件却渲染了 T。
 *   · 资源：组件 import 的 `resources/images/*` 能在 resourceDomMapping 解析到 figmaNodeId，
 *     且该节点不在 S 子树内。
 *
 * 不判（无法确定性取证，判必误伤）：echarts 幻影图表 —— 本任务 visualAnalysis.charts 为空，
 * 缺 per-section 图表证据；样式与布局由各自的独立轨负责。
 *
 * @param {object} params
 * @param {Array<{path:string, content:string}>} params.files 产物文件（只分析 package/components/*.vue）
 * @param {object} params.plan subComponentPlan（含 effectiveSections）
 * @param {object} params.figmaRoot figmaNodeData（document 树）
 * @param {Array} [params.resourceDomMapping] 资源-DOM 映射（含 figmaNodeId / resourceFile）
 * @returns {{borrowedTextIssues: Array, borrowedAssetIssues: Array}}
 */
export function checkSectionExclusiveEvidence({ files, plan, figmaRoot, resourceDomMapping }) {
  const result = { borrowedTextIssues: [], borrowedAssetIssues: [] };
  if (!Array.isArray(files) || files.length === 0) return result;
  if (!plan || !Array.isArray(plan.effectiveSections)) return result;

  const index = indexFigmaNodes(figmaRoot);
  if (index.size === 0) return result;

  const vueFiles = vueComponentFiles(files);
  if (vueFiles.length === 0) return result;

  const ctx = buildSectionEvidenceCtx({ plan, figmaRoot });
  if (!ctx) return result;
  const { subIds, subTexts, textOwner, sectionByComponent } = ctx;

  // 资源文件名 → figmaNodeId 集合
  // ⚠️ 必须收**多节点**：去重复用（deduplicatedFrom）会让同一个图片文件同时挂在多个 Figma
  //    节点上（真机实锤：`icon-3561.png` 同时是 2:3561 与 2:3441 的图标）。若首命中定归属，
  //    属于 2:3441 的组件会被误判为借用 2:3561。判定改为「任一归属节点在 S 子树内即合法」。
  const assetNodesByName = new Map();
  // 🛡️ 刀 44（2026-10-22 · mc-1792638154357-8a1a0d96 实锤「R24 刚补的图标被本守卫删掉」）：
  //   资源文件名 → **声明归属 section**（`ownerSectionId`）。
  //
  //   为什么必须有这条：`assetNodesByName` 收的是资源的 `figmaNodeId`（**资源节点自身**，
  //   如 `38:3208`），而 `own` 是 section 的**子树节点集**。二者是不同层级的 id ——
  //   一旦 section 的 `sourceNodeIds` 没能闭包到资源节点（合成 section / 浅层展开），
  //   `own.has('38:3208')` 恒 false ⇒ 该 section **自己名下的**图标被判「借用」并删除。
  //   而 mapping 里 `ownerSectionId: '38:3206'` 就是「这个资源挂在哪个 section」的**权威声明**，
  //   与 R24（`resource-img-src-healer`）、resource-mount-plan 用的是同一字段。
  //   ⇒ 归属判定必须同时认三条：资源自身节点 ∈ S 子树 / `ownerSectionId === S` / S 是它的派生子 id。
  //   不认这条的后果：R24 与资源挂载的一切正确成果都会被本守卫当场抹掉（真机三轮零进展的真因）。
  const assetOwnerSectionsByName = new Map();
  for (const m of Array.isArray(resourceDomMapping) ? resourceDomMapping : []) {
    const file = m?.resourceFile || m?.fileName || m?.filename;
    if (!file) continue;
    const base = String(file).split('/').pop();
    if (!base) continue;
    const ownerSection = m?.ownerSectionId;
    if (ownerSection) {
      if (!assetOwnerSectionsByName.has(base)) {
        assetOwnerSectionsByName.set(base, new Set());
      }
      assetOwnerSectionsByName.get(base).add(String(ownerSection).trim());
    }
    const nodeId = m?.figmaNodeId || m?.nodeId;
    if (!nodeId) continue;
    if (!assetNodesByName.has(base)) assetNodesByName.set(base, new Set());
    assetNodesByName.get(base).add(String(nodeId));
  }

  for (const f of vueFiles) {
    const name = f.path.slice(f.path.lastIndexOf('/') + 1, -'.vue'.length);
    const sid = sectionByComponent.get(name);
    if (!sid) continue;
    const own = subIds.get(sid);
    if (!own) continue;
    // 🛡️ 2026-09-30 兜底：**未被 Figma 锚定的 section 一律不判借用**。
    //   真机实锤（`c-traffic-monitor-65bedc2d`）：`section-vehicle-type` 这类合成 section 的
    //   `sourceNodeIds = []`（占位，无真实 Figma 节点）⇒ 子树节点集合为空 ⇒
    //   ① `ownTexts` 恒空（「自己也有」的豁免永远不成立）；
    //   ② `intersects(∅, ownerSub)` 因 `a.size === 0` 恒为 false（祖孙重叠豁免永远不成立）。
    //   两道豁免同时失效 ⇒ 该组件渲染的**任何**「他处唯一归属」文本、以及**任何**资源，
    //   都会被判成借用 → 群体误删。归属判定的前提是「S 的子树已知」，未知即不可判 ⇒ 跳过。
    //   口径与模块铁律一致：宁漏不误伤、不猜。
    if (own.size === 0) continue;
    const ownTexts = subTexts.get(sid) || new Set();
    const renderedText = extractRenderedText(f.content);

    // ── ① 借用文本 ──
    for (const [text, ownerId] of textOwner) {
      if (ownerId === sid) continue;
      if (ownTexts.has(text)) continue; // S 子树自己也有 → 合法
      if (!renderedText.includes(text)) continue;
      const ownerSub = subIds.get(ownerId);
      if (intersects(own, ownerSub)) continue; // 祖孙/兄弟重叠 → 合法共用
      result.borrowedTextIssues.push({
        file: f.path,
        sectionId: sid,
        text,
        ownerSection: ownerId,
        hint: `文本「${text}」只归属 section ${ownerId}（Figma 子树真值），却被 ${sid} 的组件渲染`,
      });
    }

    // ── ② 借用资源 ──
    const refs = new Set();
    const rx = /resources\/images\/([^'"\s)]+)/g;
    let m;
    while ((m = rx.exec(f.content)) !== null) refs.add(m[1]);
    for (const base of refs) {
      // 🛡️ 刀 44：先用 mapping 的**声明归属**判一次 —— `ownerSectionId === S`（或 S 是它的
      //   派生子 id，如 `38:3206-tail-text`）就是 S 自己的资源，与 `figmaNodeId ∈ 子树` 等价。
      const declaredOwners = assetOwnerSectionsByName.get(base);
      if (declaredOwners && declaredOwners.size > 0) {
        const owned = [...declaredOwners].some(
          (o) => o === sid || sid.startsWith(`${o}-`),
        );
        if (owned) continue;
      }
      const nodeIds = assetNodesByName.get(base);
      if (!nodeIds || nodeIds.size === 0) continue; // 不可解析归属 → 不判
      const nodeList = [...nodeIds];
      if (nodeList.some((id) => own.has(id))) continue; // 任一归属节点在本 section 子树 → 合法
      result.borrowedAssetIssues.push({
        file: f.path,
        sectionId: sid,
        resource: base,
        resourceNodeId: nodeList[0],
        ownerNodeIds: nodeList,
        ownerSectionIds: declaredOwners ? [...declaredOwners] : [],
        hint: `资源「${base}」（Figma 节点 ${nodeList.join(' / ')}${declaredOwners ? `，声明归属 section ${[...declaredOwners].join('/')}` : ''}）不属于 section ${sid} 的子树，属借用`,
      });
    }
  }

  return result;
}

/**
 * 🎯 2026-09-29 治本·A：section 真值文案覆盖守卫（缺失即阻断）。
 *
 * 与 `checkSectionExclusiveEvidence`（管「多渲染了别人的」）互补，本函数管
 * **「自己的一个都没渲染」**——真机最刺眼的形态是「组件骨架挂对了 section，内容却整段搬了邻居」，
 * B-1 把邻居的内容删干净之后，这个组件就彻底空了；此时**必须阻断**，否则发布出去是个空白模块。
 *
 * 真机实锤（c-traffic-monitor / mc-max-1790657317082-67u1cdxz）：
 *   `HeaderSection.vue` 骨架挂在 section `2:3550`（真值 = `流量监测`、`*数据实时更新`），
 *   实际渲染的却是 `88:32` 的 `当日总流量`、`24小时`（与 `HeaderSub.vue` 重复）——
 *   自己 section 的真值文案 **0 个命中**，外来文案 2 个。
 *
 * 判据（三道全中才报，宁漏不误伤）：
 *   ① 组件名经 `assignSectionComponentNames` 确定性绑定到 section S；
 *   ② S 的**有意义**真值文案集合非空（见 isMeaningfulTruthText），且在产物**全文**（剥注释）中
 *      **无一**出现 —— 真值命中放宽到全文，是为了承认图表把轴标签写在 `data: [...]` 里；
 *   ③ 该组件同时渲染了 ≥1 个**只属于别的 section** 的文案（按「会渲染到界面」的 `extractRenderedText`
 *      取证，不看注释）——即「装错了」而非「内容不全」。
 *
 * 为什么必须加条件③：不加就变成「内容不完整就阻断」——与本函数要治的缺陷不是一件事，
 * 且会与既有覆盖类门禁（COMP-001 / TEXT-TRUTH）重叠、把重试预算烧在不可达成的条件上。
 *
 * 修复方式（不做自动补齐，危险）：交由调用方 BLOCK + 重试，让模型按 C 贴进 prompt 的
 *   「本节真值文案」重写内容。缺失内容**绝不由本模块猜测落点硬插**。
 *
 * @returns {Array<{
 *   file:string, sectionId:string, truthTexts:string[], foreignTexts:string[]
 * }>}
 */
export function checkSectionTruthCoverage({ files, plan, figmaRoot }) {
  const issues = [];
  if (!Array.isArray(files) || files.length === 0) return issues;
  if (!plan || !Array.isArray(plan.effectiveSections)) return issues;

  const ctx = buildSectionEvidenceCtx({ plan, figmaRoot });
  if (!ctx) return issues;
  const { subIds, subTexts, textOwner, sectionByComponent } = ctx;

  for (const f of vueComponentFiles(files)) {
    const name = f.path.slice(f.path.lastIndexOf('/') + 1, -'.vue'.length);
    const sid = sectionByComponent.get(name);
    if (!sid) continue;
    const own = subIds.get(sid);
    if (!own) continue;

    const truthTexts = [...(subTexts.get(sid) || new Set())].filter(isMeaningfulTruthText);
    if (truthTexts.length === 0) continue; // 该 section 本就无文案真值 → 不判

    // 真值命中：放宽到「剥注释后的全文」（含 script 的 data 数组），避免图表类假 BLOCK
    const truthCorpus = stripCommentCorpus(f.content);
    if (truthTexts.some((t) => truthCorpus.includes(t))) continue; // 自己的内容在

    // 外来证据：收紧到「会渲染到界面的文本」（模板静态文本 + script 对象字段值），
    // 且**按渲染片段精确相等**匹配（不用 includes）——
    // 真机实锤的两类子串假阳性：`设备监控` 命中邻居的 `监控`（实为 TEXT-TRUTH 的 OCR 错字问题）、
    // `34,620` 命中邻居的 `20`（数值子串）。都不是「装错内容」，不该由本规则阻断。
    const renderedSegments = new Set(
      extractRenderedText(f.content).split(/\s+/).filter(Boolean),
    );
    const ownTexts = subTexts.get(sid) || new Set();
    const foreignTexts = [];
    for (const [text, ownerId] of textOwner) {
      if (ownerId === sid) continue;
      if (ownTexts.has(text)) continue;
      if (!renderedSegments.has(text)) continue;
      if (intersects(own, subIds.get(ownerId))) continue;
      foreignTexts.push(text);
    }
    if (foreignTexts.length === 0) continue; // 只是内容不全 → 交给覆盖类门禁，不在此阻断

    issues.push({
      file: f.path,
      sectionId: sid,
      truthTexts,
      foreignTexts,
    });
  }

  return issues;
}

/**
 * 🎯 2026-09-14 治本·阶段1：构建 per-section 内容归属契约（prompt 预防层）。
 *
 * 事实源 = Figma 子树文本 + bbox（geometry）+ 文本样式（fontSize/fontWeight）——
 * **零图层名参与**（2026-09-30 起，见 `collectSubtreeTexts` 的命名无关契约）。
 * 给每个 section 列出「只属于它自己的文本 + 坐标」，注入 prompt 后从源头防两类 LLM 段错误：
 *   ① 左右镜像（横向 section 内成员按 x 排序的事实直接给到）；
 *   ② 借邻居内容（每个 section 只渲染自己子树内的文本）。
 * 与 checkSectionContent 共用同一套 normalize/collectSubtreeTexts 事实源（单点）。
 *
 * @param {object} plan subComponentPlan（含 effectiveSections）
 * @param {object} figmaRoot figmaNodeData（document 树）
 * @returns {Array<{id:string, title:string, direction:string,
 *   texts?:Array<{text:string,x:number|null}>,
 *   members?:Array<{title:string|null,value:string|null,texts?:string[]|null,x:number|null}>}>}
 */
export function buildSectionContentContract(plan, figmaRoot) {
  const contract = [];
  if (!plan || !Array.isArray(plan.effectiveSections) || !figmaRoot) return contract;
  const index = indexFigmaNodes(figmaRoot);
  if (index.size === 0) return contract;
  const childrenOf = buildChildrenMap(index);

  const walk = (sections) => {
    for (const sec of sections || []) {
      if (!sec) continue;
      const ids = Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : [];
      const isHorizontal = sec.body?.layout === 'horizontal';

      if (isHorizontal) {
        // 🎯 阶段 B（2026-09-15）：先尝试「高置信确定性装配」。
        // 铁律：仅当 assessStatRowConfidence 判 high（成员唯一、x 可解析且严格递增、
        //       每成员恰好 2 个文本且**样式**可分出标题/数值、无重复归属、无资源冲突）才确定性配对；
        //       否则整节回退既有 LLM 路径（成员级配对，非确定性），不产生半确定性混合。
        const assembly = assessStatRowConfidence(sec, figmaRoot);
        if (assembly.verdict === 'high') {
          contract.push({
            id: String(sec.id),
            title: sec.title || '',
            direction: 'row',
            deterministic: true,
            members: assembly.members.map((m) => ({
              title: m.title,
              value: m.value,
              x: Math.round(m.x),
              figmaNodeId: m.figmaNodeId,
            })),
          });
        } else {
          // 回退 LLM：输出「成员级配对」——每个成员的标题↔数值成对 + 按 x 从左到右。
          // 实锤（2:3660 统计行）：LLM 不仅左右反，还把卡片 2 内部的标题/数值也写反；
          // 扁平文本列表治不了「配对错乱」，必须按成员配对给到（仍作预防，非确定性）。
          // 🔴 命名无关（2026-09-30）：角色只能由**样式真值**判定（`splitTitleValueByStyle`）。
          //   样式分不出角色时**不臆造** —— 只给该成员的文本（按视觉序），由 LLM 按
          //   prompt 铁律「标题=位置小字、数值=大字」自行判断。
          //   （旧实现按 `t-` 图层名判角色：全语料 93% 的成员拿不到 title ⇒ prompt 里
          //    出现 `标题「」数值「设备类型」` 这类**把标题当数值**的错误真值。）
          const memberIds = ids.filter((id) => String(id) !== String(sec.id));
          const members = memberIds
            .map((id) => {
              const items = collectSubtreeTexts(String(id), index, childrenOf);
              const roles = splitTitleValueByStyle(items);
              const bbox = index.get(String(id))?.bbox;
              const x = typeof bbox?.x === 'number' ? Math.round(bbox.x) : null;
              if (roles) {
                return { title: roles.title, value: roles.value, texts: null, x };
              }
              const texts = [...items]
                .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
                .map((i) => i.text);
              return { title: null, value: null, texts, x };
            })
            .filter((m) => m.title != null || (m.texts && m.texts.length > 0))
            .sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
          if (members.length > 0) {
            contract.push({
              id: String(sec.id),
              title: sec.title || '',
              direction: 'row',
              deterministic: false,
              members,
            });
          }
        }
      } else {
        const merged = new Map();
        for (const id of ids) {
          for (const item of collectSubtreeTexts(String(id), index, childrenOf)) {
            if (merged.has(item.text)) continue;
            merged.set(item.text, {
              text: item.text,
              x: item.x,
            });
          }
        }
        if (merged.size > 0) {
          contract.push({
            id: String(sec.id),
            title: sec.title || '',
            direction:
              sec.layoutMetadata?.direction ||
              (sec.body?.layout === 'horizontal' ? 'row' : 'column'),
            texts: [...merged.values()],
          });
        }
      }
      if (Array.isArray(sec.children)) walk(sec.children);
    }
  };
  walk(plan.effectiveSections);
  return contract;
}

/**
 * 🎯 2026-10-03 治本：techstack 契约-产物一致性检测（per-section 粒度）。
 *
 * 真机实锤（mc-max-1791035072047-65808cdd）：210:45499 保存按钮契约
 * （a-button 60×40 #3965ff 白字，离线重放证明规划层/渲染层均正确产出）
 * 被 LLM 执行层用 `<img alt="关闭">` 静态资源顶替。既有防线为何全漏：
 *   ① corpus 级 `ElementCoverageValidator`（「全产物任何地方出现过 <a-button」即 covered）
 *      在管线中**零接线**（死代码）；② 即使接线，corpus 粒度也定位不了
 *      「哪个 section 的契约没落地」——别处出现一次 a-button 就能掩盖本 section 的 img 顶替。
 *
 * 本函数按 plan.effectiveSections 的 techStack 契约逐 section 断言：
 *   - 收集 techStack.tag 非空的叶子（tag 非空 = 契约抽取成功，fail-open 口径，
 *     图表库/未知库/契约失败本就不挂 tag ⇒ 不判）；
 *   - 按 `data-section-id="<id>"` 定位宿主产物文件（先剥 HTML 注释，注释里的 sid 不算落地）；
 *   - 宿主文件内必须出现契约标签 —— 判据**单一来源**复用
 *     element-coverage-validator#techStackRequiredPatterns（kebab `<a-button` /
 *     前缀 Pascal `<AButton` / 裸 Pascal `<Button` 三态，刻意不加 `i`）。
 *
 * 两种违规形态：
 *   - kind=missing：无任何产物文件挂 `data-section-id="<id>"`；
 *   - kind=wrong-tag：宿主文件存在但无契约标签（img/图标顶替形态，65808cdd 实锤）。
 *
 * 🛡️ 防群体误杀：若产物**整体**连一个 data-section-id 都没有（锚点机制未启用，
 *    已知 vue3 产物线立项项），判定域为空 ⇒ 整体 fail-open 直接返回。
 *
 * @returns {{checked:number, violations:Array<{kind:'missing'|'wrong-tag', sectionId:string, tag:string, text:string, file?:string, hint:string}>}}
 */
export function checkTechStackContractTags({ files, plan }) {
  const result = { checked: 0, violations: [] };
  if (!Array.isArray(files) || files.length === 0) return result;
  if (!plan || !Array.isArray(plan.effectiveSections)) return result;

  const sections = collectSections(plan.effectiveSections).filter(
    (s) => s?.techStack?.tag,
  );
  if (sections.length === 0) return result;

  const vueFiles = files.filter(
    (f) =>
      typeof f?.path === 'string' &&
      /^package\/(components\/[^/]+\.vue|index\.vue)$/.test(f.path) &&
      typeof f.content === 'string',
  );
  if (vueFiles.length === 0) return result;

  // 剥 HTML 注释后再做 sid 定位与标签断言（注释里出现 sid/<a-button 不算落地）
  const locating = vueFiles.map((f) => ({
    path: f.path,
    content: f.content.replace(/<!--[\s\S]*?-->/g, ''),
  }));

  // 🛡️ 锚点机制未启用（全产物 0 个 data-section-id）⇒ 判定域为空，fail-open
  const anchorRx = /data-section-id=["'][^"']+["']/;
  if (!locating.some((f) => anchorRx.test(f.content))) return result;

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const sec of sections) {
    const ts = sec.techStack;
    result.checked += 1;
    const sid = String(sec.id);
    const sidRe = new RegExp(`data-section-id=["']${escapeRe(sid)}["']`);
    const hosts = locating.filter((f) => sidRe.test(f.content));
    const text = ts.contract?.text || ts.nodeName || '';
    if (hosts.length === 0) {
      result.violations.push({
        kind: 'missing',
        sectionId: sid,
        tag: ts.tag,
        text,
        hint: `techstack 契约 section ${sid}（${ts.library}/${ts.component} → <${ts.tag}>）在产物中无 data-section-id 落点`,
      });
      continue;
    }
    // 判据单一来源：techStackRequiredPatterns 三态正则（未知库返回 null ⇒ fail-open）
    const patterns = techStackRequiredPatterns({
      library: ts.library,
      component: ts.component,
    });
    if (!patterns) continue;
    const landed = hosts.some((f) => patterns.some((re) => re.test(f.content)));
    if (!landed) {
      result.violations.push({
        kind: 'wrong-tag',
        sectionId: sid,
        tag: ts.tag,
        text,
        file: hosts.map((f) => f.path).join(', '),
        hint: `section ${sid} 的 techstack 契约要求 <${ts.tag}>（文案「${text}」必须作为直接内容），宿主 ${hosts
          .map((f) => f.path)
          .join(', ')} 未出现契约标签（疑似被 img/图标/手绘元素顶替）`,
      });
    }
  }
  return result;
}

export default checkSectionContent;
