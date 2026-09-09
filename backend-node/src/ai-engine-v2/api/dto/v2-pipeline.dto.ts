import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

/**
 * v2 可配管线请求体
 *
 * 与旧 Lite/Phase2 接口的关键区别：
 *   旧：componentType(vue3|microcode) + generationTier(lite|max) → 落到两套 graph 文件
 *   新：spec(任意规范 id，含用户上传的规范包) × tier(档位) × modelOverrides(节点级模型)
 *       三个正交维度喂给同一个引擎
 *
 * spec 不做 IsIn 白名单校验 —— 规范是可上传扩展的，
 * 合法性由 SpecRegistry 在解析时判定，能给出「有哪些可用规范」的准确报错。
 */
export class PreviewV2Dto {
  /** 代码规范 id：microcode / vue3-js / 用户上传包 id */
  @IsOptional()
  @IsString()
  spec?: string;

  /** 档位：lite（6 节点 2 次 LLM）/ max（13 节点 8 次 LLM） */
  @IsOptional()
  @IsString()
  tier?: string;

  /** 输入来源 */
  @IsOptional()
  @IsIn(['screenshot', 'figma'])
  sourceType?: 'screenshot' | 'figma';

  /** 请求级规范字段覆盖（最高优先级，覆盖规范包自身声明） */
  @IsOptional()
  @IsObject()
  specOverrides?: Record<string, any>;

  /** 请求级档位覆盖（如临时把 maxRevisions 调成 1） */
  @IsOptional()
  @IsObject()
  tierOverrides?: Record<string, any>;

  /** 节点级模型覆盖：{ 'code-engineer': 'claude-opus-4-8' } */
  @IsOptional()
  @IsObject()
  modelOverrides?: Record<string, string>;

  /** AI 凭证覆盖（visionApiKey/textModel 等），缺省走用户配置与服务端配置 */
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class GenerateV2Dto extends PreviewV2Dto {
  /** 截图：raw base64 或 data URL；sourceType=screenshot 时必填 */
  @ValidateIf((o: GenerateV2Dto) => o.sourceType !== 'figma')
  @IsString()
  @IsNotEmpty()
  imageBase64?: string;

  /** Figma 链接（需带 node-id）；sourceType=figma 时必填 */
  @ValidateIf((o: GenerateV2Dto) => o.sourceType === 'figma')
  @IsString()
  @IsNotEmpty()
  figmaUrl?: string;

  /** 组件英文名，缺省用 sessionId */
  @IsOptional()
  @IsString()
  componentName?: string;

  /** 业务组 id，缺省 default-group */
  @IsOptional()
  @IsString()
  groupId?: string;

  /**
   * prompt 注入模式
   * replace：规范文档整体替换角色默认参考文档（默认）
   * append：追加在默认文档之后
   */
  @IsOptional()
  @IsIn(['replace', 'append'])
  promptInjectionMode?: 'replace' | 'append';
}
