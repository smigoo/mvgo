/**
 * 离线端到端重放：用**真机 Figma 节点数据**跑本轮改动涉及的全部管线函数，
 * 产出与真机同构的产物文件，再交给 mc-check 判定。
 *
 * 为什么这样做（2026-10-12）：Figma token 为空 ⇒ 真机生成在第一步
 *   `fetchThemeNodes` 就会 fail-closed 阻断。而本轮改动
 *   （A1 覆盖层 / A5 cssVariableConfig / A6 fontSize / A7 prompt）**全部在
 *   token 之后的确定性段**，用真机数据离线重放能验证同样的代码路径。
 *
 * 输入：c-aiot-dpjh-bsjd-5831962c 的 `.mc-gen/cache/figma-node-data.json`
 *   （237KB 真机 Figma 主稿节点）+ 同产物的 declare.json（提供 N 主题形状）
 */
import fs from "node:fs";
import path from "node:path";

const REPO = "/Users/smigoo/工作/mvgo/backend-node";
const SRC = path.join(
  REPO,
  "workspace/custom-components/c-aiot-dpjh-bsjd-5831962c",
);
const OUT = "/tmp/dualtruth-bak/replay/c-aiot-dpjh-bsjd";

const { buildStyleTokens, renderMicrocodeThemeVarsLess } = await import(
  path.join(REPO, "dist/ai-engine/utils/style-tokens.js")
);
const { buildCssVarsFile } = await import(
  path.join(REPO, "dist/ai-engine/roles/microcode/file-writer.js")
);
const M = await import(path.join(REPO, "dist/ai-engine/roles/microcode-engineer.js"));

const self = {
  _deriveClassPrefix: () => "c-aiot-dpjh-bsjd",
  _collectNThemeKeys: M.MicrocodeEngineer.prototype._collectNThemeKeys,
  _buildThemeWrapperLess: M.MicrocodeEngineer.prototype._buildThemeWrapperLess,
  _buildIndexLessTemplate: M.MicrocodeEngineer.prototype._buildIndexLessTemplate,
};
const eng = Object.create(M.MicrocodeEngineer.prototype);

// ── 输入：真机 Figma 主稿节点 + N 主题声明（复刻真机 themeMeta 形状）──
const figmaNodeData = JSON.parse(
  fs.readFileSync(path.join(SRC, ".mc-gen/cache/figma-node-data.json"), "utf8"),
);
const srcDeclare = JSON.parse(fs.readFileSync(path.join(SRC, "declare.json"), "utf8"));
// 源产物是**双主题**（light/dark）⇒ 这里**自行构造 N 主题元数据**来覆盖多主题代码路径。
// key 用历史命名（theme_1/2/3）；新命名规则（light 占用 / dark 占位 / 其余自定义）
// 已由 multi-theme.js 的单测覆盖，与本轮 A1/A2/A5/A6 的验证无关。
const themeMeta = [
  { key: "theme_1", name: "浅色", brightness: "light" },
  { key: "theme_2", name: "深色", brightness: "dark" },
  { key: "theme_3", name: "黄昏模式", brightness: "light" },
];
// 🔴 2026-10-12 实测：这份真机节点数据 `extractFigmaColorPalette` **提不出 colorPrimary**
//   （实测返回 6 键、无 colorPrimary）⇒ `dualReady=false` ⇒ 任何多主题分支都进不去。
//   原因：该产物是**浅色稿**（白底），没有可识别的主色块。
//   ⇒ 深色主题改喂**合成节点**（带明确主色矩形），保证色板可提取。
//   验证目标：本轮改动的**代码路径**（覆盖层生成 / dark 枚举 / fontSize / 变量声明），
//   不是色值保真度 —— 后者需真机 Figma 才能验。
const SYNTHETIC_DARK = {
  id: "replay-dark", name: "replay-dark", type: "FRAME",
  absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
  fills: [{ type: "SOLID", color: { r: 0.043, g: 0.055, b: 0.11 } }],
  children: [
    {
      id: "brand-block", name: "brand", type: "RECTANGLE",
      absoluteBoundingBox: { x: 40, y: 40, width: 200, height: 120 },
      fills: [{ type: "SOLID", color: { r: 1, g: 0.55, b: 0.26 } }],
    },
    {
      id: "text-block", name: "text", type: "TEXT",
      absoluteBoundingBox: { x: 40, y: 200, width: 400, height: 40 },
      fills: [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.96 } }],
    },
  ],
};

const dualTruth = {
  enabled: true,
  themes: themeMeta.map((t) => ({
    key: t.key,
    name: t.name,
    brightness: t.brightness,
    nodeData: t.brightness === "dark" ? SYNTHETIC_DARK : figmaNodeData,
    fileKey: "REPLAY",
    nodeId: "REPLAY",
    previewImageName: null,
  })),
  primaryTheme: { key: themeMeta[0].key },
  lightSource: "figma-extract",
  darkSource: "figma-extract",
};

console.log("════ 离线重放：真机 Figma 数据 + N 主题 ════");
console.log("  Figma 节点:", figmaNodeData?.name || "(匿名)", "|文档名:", figmaNodeData?.document?.name || "-");
console.log("  主题:", themeMeta.map((t) => `${t.key}(${t.brightness})`).join(", "));

// ① styleTokens（与管线内同参）
const styleTokens = buildStyleTokens(
  { figmaNodeData, backgroundBrightness: "light", dualTruth },
  { logger: { info() {}, warn() {}, error() {} } },
);
console.log("  themeMeta 出参:", (styleTokens.themeMeta || []).map((t) => t.key).join(", ") || "(空)");

// ② A6：@fontSize 必须保持 var()
const less = renderMicrocodeThemeVarsLess(styleTokens, "");
const fontSizeInLess = /@fontSize\s*:\s*([^;]+)/.exec(less)?.[1]?.trim();
console.log("  A6 @fontSize:", fontSizeInLess, fontSizeInLess?.startsWith("var(") ? "✅（过 M5-6）" : "❌");

// ③ A2：dark 三核心必须落枚举
const cssVars = buildCssVarsFile({ styleTokens });
const darkBody = /const dark = \{([\s\S]*?)\n\}/.exec(cssVars)?.[1] || "";
const core = {};
for (const k of ["colorTextBase", "colorPrimary", "colorPrimaryBg"]) {
  core[k] = new RegExp(`${k}:\\s*'([^']+)'`).exec(darkBody)?.[1];
}
const M4_10 = { colorTextBase: ["#ffffff", "#F0F0F0"], colorPrimary: ["#44E4FF"], colorPrimaryBg: ["#414141", "#454545", "#474747"] };
const m4pass = Object.entries(core).every(([k, v]) => M4_10[k].some((a) => a.toLowerCase() === String(v).toLowerCase()));
console.log("  A2 dark 三核心:", JSON.stringify(core), m4pass ? "✅（过 M4-10）" : "❌");

// ④ A1：覆盖层逐 key 生成
const wrappers = eng._buildThemeWrapperLess;
const keys = self._collectNThemeKeys(styleTokens.themeMeta);
const themeFiles = {};
for (const k of keys) themeFiles[`resources/styles/themes/${k}.less`] = wrappers.call(self, k);
const idx = self._buildIndexLessTemplate.call(self, "light", styleTokens.themeMeta);
console.log("  A1 覆盖层:", keys.length, "份 →", keys.join(", "));
console.log("     index.less import 数:", idx.split("\n").filter((l) => l.includes("themes/") && l.includes(".less")).length);

// ⑤ A5：cssVariableConfig 声明
const decl = JSON.parse(JSON.stringify(srcDeclare));
decl.componentId = "c-aiot-dpjh-bsjd";   // M1-1：必须与目录名一致
decl.cssVariableConfig = [];
decl.businessEvents = { "c-aiot-dpjh-bsjd-onload": { eventId: "c-aiot-dpjh-bsjd-onload", eventName: "组件加载完成", eventDataSchema: {} } };
decl.themeConfig = { default: themeMeta[0].key, list: themeMeta.map((t) => ({ name: t.name, key: t.key, brightness: t.brightness })) };
decl.themeConfig.list.push({ name: "深色", key: "dark" });
eng.normalizeDeclareJson(decl, { styleTokens });
console.log("  A5 cssVariableConfig:", decl.cssVariableConfig.length, "条");

// ── 落盘成可被 mc-check 判定的产物 ──
fs.rmSync(OUT, { recursive: true, force: true });
const mk = (p) => fs.mkdirSync(p, { recursive: true });
[path.join(OUT, "resources/config"), path.join(OUT, "resources/styles/themes"), path.join(OUT, "resources/images"), path.join(OUT, "package")].forEach(mk);
fs.writeFileSync(path.join(OUT, "resources/styles/themes/theme-vars.less"), less);
fs.writeFileSync(path.join(OUT, "resources/styles/index.less"), idx);
fs.writeFileSync(path.join(OUT, "resources/config/css-vars.js"), cssVars);
for (const [rel, content] of Object.entries(themeFiles)) {
  fs.writeFileSync(path.join(OUT, rel), content);
}
fs.writeFileSync(path.join(OUT, "declare.json"), JSON.stringify(decl, null, 2));
fs.writeFileSync(path.join(OUT, "declare.js"), `import declareConfig from './declare.json'\nimport cssVars from './resources/config/css-vars.js'\nlet declareInfo = $createMcDeclare({ metaUrl: import.meta.url, declareConfig, cssVars })\nexport default declareInfo\n`);
fs.writeFileSync(path.join(OUT, "component.js"), `import component from './package/index.vue'\nexport default component\n`);
// common.less：官方 demo 写法（直接用 @fontSize，A7 的推荐形式）
fs.writeFileSync(path.join(OUT, "resources/styles/common.less"), `.replay-box {\n  color: @color-text-base;\n  background: @color-primary-bg;\n  font-size: @fontSize;\n  padding: calc(@fontSize * 0.5);\n}\n`);
fs.writeFileSync(path.join(OUT, "package/index.vue"), `<template><base-panel componentName="离线重放"><div class="replay-box">hi</div></base-panel></template>\n<script setup>\nimport '../../resources/styles/index.less'\nconst { runtimeBuilder } = $mcComponentBuilder()\nruntimeBuilder.publishEvent('c-aiot-dpjh-bsjd-onload', { componentId: 'c-aiot-dpjh-bsjd', timestamp: Date.now() })\n</script>\n`);
fs.copyFileSync(path.join(SRC, "resources/images/mc-preview.png"), path.join(OUT, "resources/images/mc-preview.png"));

console.log("\n产物目录:", OUT);