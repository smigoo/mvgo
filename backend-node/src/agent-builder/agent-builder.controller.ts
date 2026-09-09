import { Controller, Post, Get, Delete, Body, Param, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AgentBuilderService } from './agent-builder.service';
import { TOOL_TEMPLATES } from './templates/tool-templates.js';
import { LLM_TEMPLATES } from './templates/llm-templates.js';

@Controller('agent-builder')
export class AgentBuilderController {
  constructor(private readonly agentBuilderService: AgentBuilderService) {}

  /** 上传参考资源（文档/图片/schema，multipart 字段名 file）→ 返回文件元信息供 create 引用 */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: any) {
    return this.agentBuilderService.uploadResource(file);
  }

  /** 创建智能体（渲染 → 写文件 → 动态注册 → 冒烟测试） */
  @Post('create')
  create(@Body() dto: any, @Query('userId') userId?: string) {
    return this.agentBuilderService.create(dto, userId);
  }

  /** 能力缺口反馈：用户搜不到模板时提交需求，落 config/agent-feedback/ 供评估加模板 */
  @Post('feedback')
  feedback(@Body() body: any, @Query('userId') userId?: string) {
    return this.agentBuilderService.submitFeedback(body, userId);
  }

  /** 单节点试跑（工具节点立即返回结果；LLM 节点依赖环境 Key） */
  @Post('test')
  test(@Body() body: any) {
    return this.agentBuilderService.testAgent(body?.name, body?.input);
  }

  /** 动态智能体列表 */
  @Get('list')
  list() {
    return this.agentBuilderService.list();
  }

  /** 可用模板目录（工具 + AI，含资源清单） */
  @Get('templates')
  templates() {
    const pick = (t: Record<string, any>) =>
      Object.values(t).map((x: any) => ({
        id: x.id,
        label: x.label,
        description: x.description,
        resources: x.resources || null,
      }));
    return {
      success: true,
      data: {
        tool: pick(TOOL_TEMPLATES),
        llm: pick(LLM_TEMPLATES),
      },
    };
  }

  /** 删除动态智能体 */
  @Post(':name/delete')
  remove(@Param('name') name: string, @Query('userId') userId?: string) {
    return this.agentBuilderService.remove(name, userId);
  }
}
