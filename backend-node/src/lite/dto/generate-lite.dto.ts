import {
  IsString,
  IsOptional,
  IsIn,
  IsObject,
  IsNotEmpty,
  IsNumber,
  Min,
  ValidateIf,
} from 'class-validator';

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

  /** 已确认的 Figma 节点逻辑宽度（CSS px，不是 scale=2 导出图像素） */
  @IsOptional()
  @IsNumber()
  @Min(1)
  previewWidth?: number;

  /** 已确认的 Figma 节点逻辑高度（CSS px，不是 scale=2 导出图像素） */
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
}
