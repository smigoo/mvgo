import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 选中要新增的接口（method + path 二元组，与 catalog function 同一键） */
export class McpApiKeyDto {
  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsNotEmpty()
  path: string;
}

export class McpAddApifoxDto {
  /** 目标目录 ID（必填，产物 ZIP 以它为准做增量替换） */
  @IsString()
  @IsNotEmpty()
  catalogId: string;

  /** Apifox 项目 ID */
  @IsString()
  @IsNotEmpty()
  apifoxProjectId: string;

  /** 要更新的模块名（tag / 路径首段 camelCase），与 catalog 中 moduleName 一致 */
  @IsString()
  @IsNotEmpty()
  moduleName: string;

  /**
   * Apifox Access Token。
   * 🔴 必填：apifox-mcp-server 启动即校验令牌，缺失会直接退出（表现为
   * `MCP error -32000: Connection closed`）。省略时回退后端环境变量
   * APIFOX_ACCESS_TOKEN；两者都为空则接口返回 400 中文提示。
   */
  @IsOptional()
  @IsString()
  apifoxToken?: string;

  /** 是否先强制刷新 Apifox 文档缓存（默认 false，读本地缓存） */
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;

  /**
   * 用户本次勾选要新增的接口键（method + path）。
   * 省略 = 以最新文档为准整模块重建；提供时会校验至少一个存在于最新文档。
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => McpApiKeyDto)
  keys?: McpApiKeyDto[];

  /** 归属用户（控制器会用 SessionGuard 的 userId 覆盖，此处仅兜底） */
  @IsOptional()
  @IsString()
  ownerId?: string;
}
