import {
  IsString,
  IsOptional,
  IsIn,
  IsObject,
  IsNotEmpty,
  IsNumber,
  Min,
  ValidateIf,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 🆕🆕 2026-10-12 N 主题：一个主题对应一份设计稿（Lite 管线）。
 *
 * 与 phase2 的 `ThemeNodeDto` 同构（同一份 `multi-theme.js` 规范化逻辑）。
 * ⚠️ Lite 的主题机制与 phase2 **不同**（2026-10-12 摸底结论）：
 *   - phase2：`style-tokens.js` 确定性注入三核心（css-vars.js + theme-vars.less）；
 *   - Lite：LLM 按**固定槽位名**产出 `.theme-light()/.theme-dark()`，平台只补缺失变量。
 *   ⇒ N 主题在 Lite 的实现是「**槽位名不变、套数从 2 扩到 N**」，
 *     色值从各稿 Figma 真值确定性注入（不再由 LLM 决定）。
 */
export class ThemeNodeDto {
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @IsString()
  @IsNotEmpty()
  nodeId: string;

  /** 主题显示名（用户自填，如「黄昏模式」）；省略则由服务端补默认名 */
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * 🔴 2026-10-12 该主题的**预览图 URL**（方案 A：传 URL 而非 base64）。
   *
   * 来源与语义：
   * - 前端在「填 Figma URL」阶段就**强制预览并要求用户确认**（见
   *   `component.vue` 的 `confirmThemeRow`），确认后才允许生成。
   * - 用户确认过的那张图**直接复用为最终产物的主题预览图**，
   *   因此生成阶段**不需要再调 Figma exportImage**（省限流，见
   *   `mc-component-graph-phase2.js:378`「只 getNode，不 exportImage」）。
   *
   * ⚠️ 与主稿的关系：主稿走 `confirmPreview`（`figma-connector.js:362`）+ tokenhash 缓存，
   *   本字段是同一条链路的副主题版本。
   * ⚠️ `dark` 系统占位主题**没有**此字段 —— 它复用主稿的 `mc-preview.png`。
   *
   * 缺省时的行为：该项目不导图，主题预览图留空（**不阻断**，因为色板真值才是关键）；
   *   但前端已保证「未确认 ⇒ 不允许生成」，所以正常路径下不会有缺省。
   */
  @IsOptional()
  @IsString()
  previewImageUrl?: string;

  /**
   * 🔴 2026-10-19：用户为该主题**自选的深浅配色**（与稿子自动判定解耦）。
   *   phase2 的 ThemeNodeDto 早已有此字段；本 DTO 此前漏加 ⇒ whitelist 校验
   *   会把前端传的 brightness 静默剥离 ⇒ Lite 管线用户的深浅选择被丢弃。
   *   省略则按稿子实测明暗兜底。
   */
  @IsOptional()
  @IsIn(['light', 'dark'])
  brightness?: 'light' | 'dark';

  /**
   * 🔴 2026-10-19：用户为该主题**自选的面板**（与深浅解耦）。
   *   组件壳取 themeNodes[0]（主稿）的面板；其余主题透传进
   *   declare.json `themeConfig.list[].panelType`。
   */
  @IsOptional()
  @IsIn(['default-panel', 'model-panels', 'aio-panel', 'empty'])
  panelType?: string;
}

/**
 * 轻量生成请求体（Phase 4：截图 / Figma → 组件）
 *
 * 输入来源三选一：
 * - imageBase64：base64 截图 → 强制 Lite 档位
 * - figmaUrl：Figma 链接 → 默认 Max 档位，可降级为 Lite
 * - htmlContent：自包含 HTML 文本 → 安全渲染后强制 Lite 档位
 *
 * 首批采用 base64 JSON 输入而非 multipart，避免引入 multer 依赖。
 */
export class GenerateLiteDto {
  /**
   * 截图内容：raw base64 或 data URL（data:image/png;base64,...）
   * 与 figmaUrl 二选一；当 figmaUrl 未提供时必填。
   */
  @ValidateIf((o: GenerateLiteDto) => !o.figmaUrl && !o.htmlContent)
  @IsString()
  @IsNotEmpty()
  imageBase64?: string;

  /**
   * Figma 设计链接（如 https://www.figma.com/file/xxx?node-id=1-2）
   * 与 imageBase64 二选一；后端从中解析 fileKey + nodeId 并导出截图。
   */
  @IsOptional()
  @IsString()
  figmaUrl?: string;

  /** 自包含 HTML 文本；脚本与外部资源不会在服务端渲染时执行或加载 */
  @IsOptional()
  @IsString()
  htmlContent?: string;

  /** HTML 原文件名，仅用于任务记录和缓存命名 */
  @IsOptional()
  @IsString()
  htmlFileName?: string;

  /** 可选 MIME，缺失时尝试从 data URL 或文件头推断 */
  @IsOptional()
  @IsString()
  imageMime?: string;

  /** 组件英文名，缺省由服务生成 */
  @IsOptional()
  @IsString()
  componentName?: string;

  /** 业务组 ID；缺省使用 default-group */
  @IsOptional()
  @IsString()
  groupId?: string;

  /** 目标组件类型；vue3 / microcode */
  @IsOptional()
  @IsIn(['vue3', 'microcode'])
  componentType?: 'vue3' | 'microcode';

  /**
   * 生成档位：lite / max
   * - 截图来源时忽略此字段，强制 lite
   * - Figma 来源时默认 max，可降级为 lite
   */
  @IsOptional()
  @IsIn(['lite', 'max'])
  generationTier?: 'lite' | 'max';

  /**
   * 已确认的 Figma 预览图缓存 token。
   * 前端确认预览图后回传，Max 管线据此复用本地图片，避免再次请求 Figma Images API。
   */
  @IsOptional()
  @IsString()
  previewToken?: string;

  /** 已确认的 Figma 节点逻辑宽度（CSS px，不是 scale=1 导出图像素） */
  @IsOptional()
  @IsNumber()
  @Min(1)
  previewWidth?: number;

  /** 已确认的 Figma 节点逻辑高度（CSS px，不是 scale=1 导出图像素） */
  @IsOptional()
  @IsNumber()
  @Min(1)
  previewHeight?: number;

  /** AI 配置覆盖（vision apiKey/baseURL/model 等），缺省走服务端默认 */
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  /** 可选需求文档，Lite 阶段仅作为生成提示，不强约束 */
  @IsOptional()
  @IsString()
  requirementDoc?: string;

  /** 可选补充说明 */
  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * 微码面板类型（仅当 componentType 为 microcode 时生效）
   * 可选值：default-panel / model-panels / aio-panel / empty
   * 决定组件在面板系统中的集成方式
   */
  @IsOptional()
  @IsString()
  @IsIn(['default-panel', 'model-panels', 'aio-panel', 'empty'])
  panelType?: 'default-panel' | 'model-panels' | 'aio-panel' | 'empty';

  /**
   * 演示面板背景明暗（仅当 componentType 为 microcode 时生效）
   * 'light' → 浅色主题，'dark' → 深色主题
   * 前端工作台演示主题切换时传入，决定生成组件的默认主题
   */
  @IsOptional()
  @IsString()
  @IsIn(['light', 'dark'])
  backgroundBrightness?: 'light' | 'dark';

  /**
   * 🆕🆕 2026-10-12 N 主题设计稿列表（Lite 管线）。
   *
   * - 不传 / 空数组 = 单稿模式（themeConfig 仍是硬编码的亮/深两主题，**零回归**）
   * - 传 N 项 = 每项一套主题，色值取自该项 Figma 稿的**确定性真值**（不采信 LLM）
   * - 第 1 项即主稿（决定结构/几何/文案），与前端「第一行即主稿」一致
   * - 上限 8（`MAX_THEMES`）：每主题一套 Less mixin，再多会拖垮编译
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: 'themeNodes 最多 8 项（每主题一套 mixin）' })
  @ValidateNested({ each: true })
  @Type(() => ThemeNodeDto)
  themeNodes?: ThemeNodeDto[];

  /**
   * 🆕 高级选项 P0（2026-10-09）：用户指定组件 ID（可选）
   * 规范形态 c-<kebab>（无随机尾段），declare.json/workspace 目录/class 前缀全链路恒定。
   * 非法/保留字由服务端 normalizeUserComponentId 静默回退自动生成（不报错）。
   * 前置唯一性校验走 GET /api/component/check-id。
   */
  @IsOptional()
  @IsString()
  userComponentId?: string;

  /** 🆕 高级选项 P0：用户补充提示词（可选，≤4000 字，超出截断） */
  @IsOptional()
  @IsString()
  extraPrompt?: string;

  /** 🆕 高级选项 P0：需求文档文本（可选，前端读文件后传纯文本，≤20000 字） */
  @IsOptional()
  @IsString()
  requirementDocText?: string;
}
