import { IsString, IsOptional, IsNotEmpty, IsBoolean } from 'class-validator';

export class McpListApifoxDto {
  /** Apifox 项目 ID */
  @IsString()
  @IsNotEmpty()
  apifoxProjectId: string;

  /**
   * Apifox Access Token。
   * 🔴 必填：apifox-mcp-server 启动即校验令牌，缺失会直接退出（表现为
   * `MCP error -32000: Connection closed`）。省略时回退后端环境变量
   * APIFOX_ACCESS_TOKEN；两者都为空则接口返回 400 中文提示。
   */
  @IsOptional()
  @IsString()
  apifoxToken?: string;

  /** 只看某个模块（tag / 路径首段 camelCase），省略则返回全部 */
  @IsOptional()
  @IsString()
  moduleName?: string;

  /** 基准目录 ID：传入后会标出相对该目录「新增」的接口 */
  @IsOptional()
  @IsString()
  catalogId?: string;

  /** 是否先强制刷新 Apifox 文档缓存（默认 false，读本地缓存） */
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}
