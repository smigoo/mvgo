/**
 * sfc-script-anchor.js 的 TypeScript 类型声明
 *
 * 背景：tsconfig.json 未开 `allowJs`，TS 侧无法直接对同名 `.js` 实现取类型。
 * 本文件与 `chat-url.d.ts` 同模式——**只声明类型、不含任何判据逻辑**，
 * 正则与实现唯一落在 `sfc-script-anchor.js`（唯一事实源）。
 *
 * 运行时：`nest-cli.json` 的 assets（`include: "**\/*.js"`）把同名 `.js` 复制进 dist/，
 * 与既有 ts→ESM 资产静态引用（`post-process.js` / `chat-url.js` 等）走同一条链路，
 * 编译产物为 `require("../ai-engine/utils/sfc-script-anchor.js")`。
 *
 * ⚠️ 修改判据只改 `.js`；本文件仅在导出签名变化时同步。
 */

/** `findScriptSetupOpen` / `findScriptOpen` 的命中结果 */
export interface ScriptOpenHit {
  /** 开标签在源串中的起始偏移 */
  index: number;
  /** 开标签原文（含全部属性，逐字保留） */
  tag: string;
}

/** `findScriptOpen` 命中结果（含 setup 优先，回退首个 `<script>`） */
export interface ScriptOpenHitWithSetup extends ScriptOpenHit {
  /** 是否为「带 setup」的开标签 */
  isSetup: boolean;
}

/** `findScriptBlock` 命中结果：开标签 + 内容区间 */
export interface ScriptBlock extends ScriptOpenHitWithSetup {
  /** 开标签结束偏移 = `index + tag.length` */
  start: number;
  /** `</script` 起始偏移；缺失闭合时为 `code.length` */
  end: number;
  /** `start`~`end` 之间的文本 */
  inner: string;
}

/** `findScriptSetupBlock` 命中结果：**仅**带 setup 的脚本段（不回退） */
export interface ScriptSetupBlock {
  /** 开标签起始偏移 */
  index: number;
  /** 开标签原文（含全部属性） */
  openTag: string;
  /** 开标签结束偏移 */
  start: number;
  /** `</script` 起始偏移；缺失闭合时为 `code.length` */
  end: number;
  /** `start`~`end` 之间的文本 */
  inner: string;
  /** `</script` 起始偏移；缺失闭合时为 `-1` */
  closeIndex: number;
}

/** 带 setup 的 `<script>` 开标签（属性顺序无关，须为独立单词 setup） */
export declare const SCRIPT_SETUP_OPEN_RX: RegExp;

/** 任意 `<script>` 开标签 */
export declare const SCRIPT_OPEN_RX: RegExp;

/** 定位带 setup 的 `<script>` 开标签；找不到返回 null（不回退） */
export declare function findScriptSetupOpen(code: string): ScriptOpenHit | null;

/** 定位「应作为脚本段使用」的开标签：含 setup 优先，回退首个 `<script>` */
export declare function findScriptOpen(code: string): ScriptOpenHitWithSetup | null;

/** 取脚本段的内容区间（含 setup 优先、回退首个 script） */
export declare function findScriptBlock(code: string): ScriptBlock | null;

/** 取**带 setup** 的脚本段（最严格口径，不回退） */
export declare function findScriptSetupBlock(code: string): ScriptSetupBlock | null;

/** 在脚本段开标签正下方注入文本（保留原始开标签）；找不到脚本段则原样返回 */
export declare function injectIntoScript(
  code: string,
  inject: string,
): { code: string; injected: boolean };

/** 替换带 setup 脚本段的内部内容，逐字保留原开标签 */
export declare function replaceScriptInner(
  code: string,
  newInner: string,
): { code: string; replaced: boolean };
