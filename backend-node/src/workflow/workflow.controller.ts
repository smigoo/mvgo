import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  /**
   * GET /api/workflows/meta/handlers
   * 获取handlers和节点类型（内置注册表 + Agent Builder 动态注册合并）
   */
  @Get('meta/handlers')
  async getMetaHandlers() {
    const handlers = this.workflowService.getHandlers();
    const nodeTypes = this.workflowService.getNodeTypes();

    // 🆕 合并 Agent Builder 动态注册的智能体（config/agents/*.json）
    // 前端 fetchWorkflowMeta 期望扁平 Record<string, HandlerInfo>，故直接平铺。
    const { listDynamicAgentDefs } = await import(
      '../agent-builder/dynamic-loader.js'
    );
    const dynamicDefs = await listDynamicAgentDefs();
    const dynamicEntries: Record<string, any> = {};
    for (const def of dynamicDefs) {
      if (!def || !def.name) continue;
      dynamicEntries[def.name] = {
        label: def.label || def.name,
        description: def.description || '',
        category: def.category || '自定义',
        configSchema: {},
        logicType: def.logicType || 'tool',
        templateId: def.templateId || '',
        author: def.author,
        isDynamic: true,
        // 🆕 数据契约（连线字段提示用）：动态节点定义里有 inputs/outputs
        inputs: (def.inputs || []).map((i: any) => i.key),
        outputs: (def.outputs || []).map((o: any) => o.key),
      };
    }
    const builtinMap = (handlers as any).handlers || handlers;
    const merged: Record<string, any> = {
      ...builtinMap,
      ...dynamicEntries,
    };

    return {
      success: true,
      data: {
        handlers: merged,
        nodeTypes,
      },
    };
  }

  /**
   * GET /api/workflows/graph/:type
   * 获取原始图管线拓扑（phase2 | vue3 | page-generation | apifox-generation）
   * 始终返回代码中定义的原始拓扑，不可被前端覆盖或删除
   */
  @Get('graph/:type')
  getGraphTopology(@Param('type') type: string) {
    return this.workflowService.getGraphTopology(type);
  }

  /**
   * GET /api/workflows
   * 列出所有workflows（含原始拓扑）
   */
  @Get()
  async listWorkflows() {
    return this.workflowService.list();
  }

  /**
   * GET /api/workflows/:sessionId/nodes
   * 节点运行快照（可观测性）：返回某次运行各节点的输入/输出
   */
  @Get(':sessionId/nodes')
  getNodeSnapshots(@Param('sessionId') sessionId: string) {
    return this.workflowService.getNodeSnapshots(sessionId);
  }

  /**
   * GET /api/workflows/:name
   * 获取单个workflow详情（支持原始拓扑名）
   */
  @Get(':name')
  async getWorkflow(@Param('name') name: string) {
    return this.workflowService.get(name);
  }

  /**
   * POST /api/workflows/save
   * 保存workflow（原始拓扑名被拒绝）
   */
  @Post('save')
  async saveWorkflow(@Body() workflow: any) {
    return this.workflowService.save(workflow);
  }

  /**
   * POST /api/workflows/load
   * 加载workflow
   */
  @Post('load')
  async loadWorkflow(@Body() body: { name: string }) {
    return this.workflowService.get(body.name);
  }

  /**
   * POST /api/workflows/:name/delete
   * 删除workflow（原始拓扑不可删除）
   */
  @Post(':name/delete')
  async deleteWorkflow(@Param('name') name: string) {
    return this.workflowService.delete(name);
  }

  /**
   * POST /api/workflows/:name/run
   * 运行工作流——加载 JSON → 构建 Graph → 异步执行 → SSE 推送进度
   * 前端通过 GET /api/progress/:sessionId 获取实时进度
   */
  @Post(':name/run')
  async runWorkflow(
    @Param('name') name: string,
    @Body() params: {
      componentName: string;
      fileKey: string;
      nodeId: string;
      config?: Record<string, any>;
    },
    @Req() req: any,
  ) {
    const userId = req.session?.userId;
    return this.workflowService.run(name, params, userId);
  }
}
