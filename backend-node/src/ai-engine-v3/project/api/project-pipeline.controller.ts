import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { OptionalSessionGuard } from '../../../auth/optional-session.guard';
import { SessionGuard } from '../../../auth/session.guard';
import { ProjectDevOnlyGuard } from './project-dev-only.guard';
import {
  FreezeProjectDto,
  GenerateProjectDto,
  InspectProjectDto,
  PickProjectDto,
  SaveDecisionsDto,
  ScanProjectDto,
} from './dto/project-pipeline.dto';
import { ProjectPipelineService } from '../project-pipeline.service';

/**
 * 项目级管线控制器（M1 · dev 专用）
 *
 * 全量挂在 /api/v3/project 下：
 *   GET  health              引擎自检（扫描器在不在 + md5 是否等于已验证版本 + 运行根可写）
 *   POST pick-dir            拉起**系统原生**「选择文件夹」对话框，回传用户点选的绝对路径
 *   GET  browse-dir          内置目录浏览器（只读；系统对话框不可用/被拦时的兜底）
 *   POST inspect             目录体检（只读，不做坑位判定）
 *   POST scan                S0：跑扫描器，产出 runId；同步返回全部事实
 *   POST freeze              S2：契约冻结，产出 openapi.local.yaml + REQUIREMENTS.md
 *   POST decisions           人裁决落盘（追加式，永不覆盖）
 *   GET  runs                最近运行列表
 *   GET  runs/:runId         单次运行完整视图
 *   GET  runs/:runId/units   单元拆分预览（按需构建 + 分隔级缓存；?refresh=true 强制重算）
 *   GET  runs/:runId/artifact?name=spec/conflicts.md   读产物全文（白名单）
 *   DELETE runs/:runId       删除单次运行（整个运行目录 = 历史记录 + 全部产物，不可恢复）
 *
 * 与 v2 的差异（刻意为之）：
 *   · **同步**，不建异步任务。S0 在本样本上 60~100ms，S2 是纯格式转换。
 *     不引入 sessionId + SSE + 任务卡片，故障面小一个数量级；
 *     将来遇到大仓扫不动再改异步，接口形状不用变（把返回值换成 sessionId）。
 *
 * 🔴 守卫与归属（2026-11-06 用户裁决「项目级生成要 ownerId，每个人独立」后改写）：
 *   · 原设计（M1 初版）**全类不挂 SessionGuard**，理由是「不消耗模型额度、不落用户资产」。
 *     该理由在 S3/S4（生成代码）与 ownerId 隔离落地后已不成立 —— 运行目录里就是用户资产，
 *     而「不知道调用者是谁」就**不可能**做隔离（无身份的过滤等价于不过滤）。
 *   · 现行口径：**写端点一律 SessionGuard**（scan / freeze / generate / generate-vue /
 *     decisions / set-binding / set-embeds / delete），保证每条新运行都带得走一个真实
 *     ownerId（`run.json.ownerId`）；**读端点保持 OptionalSessionGuard**，只解析身份不阻断，
 *     由 service 按归属过滤（`resolveRunDir` / `listRuns`）。
 *   · DevOnly 开关与本层归属是**两件事**：开关管「这个环境暴露不暴露」，归属管「暴露后谁能看
 *     谁的」。前者在生产关掉只说明现在摸不到，一旦有人为上线打开开关，后者才是唯一防线。
 */
@Controller('v3/project')
@UseGuards(ProjectDevOnlyGuard, OptionalSessionGuard)
export class ProjectPipelineController {
  private readonly logger = new Logger(ProjectPipelineController.name);

  constructor(private readonly service: ProjectPipelineService) {}

  @Get('health')
  health() {
    try {
      return { success: true, ...this.service.health() };
    } catch (e: any) {
      throw new HttpException(
        { code: 'HEALTH_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 系统「选择文件夹」对话框。
   *
   * 刻意**不**抛异常表示「用户取消 / 该平台不支持」—— 那两种都是正常业务结果，
   * 前端要据此切到内置目录浏览器；抛 500 会把正常路径伪装成故障，还会污染错误日志。
   */
  @Post('pick-dir')
  async pickDir(@Body() dto: PickProjectDto) {
    return { success: true, ...(await this.service.pickDirectory(dto?.projectDir)) };
  }

  /** 内置目录浏览器（只读）。path 为空 → 返回「起始位置」候选 */
  @Get('browse-dir')
  browseDir(@Query('path') dirPath: string) {
    return { success: true, browse: this.service.browseDirectory(dirPath) };
  }

  @Post('inspect')
  inspect(@Body() dto: InspectProjectDto) {
    return { success: true, inspect: this.service.inspect(dto.projectDir) };
  }

  @Post('scan')
  @UseGuards(SessionGuard)
  async scan(@Body() dto: ScanProjectDto, @Req() req: any) {
    try {
      return {
        success: true,
        ...(await this.service.scan(dto.projectDir, dto.note, req?.session?.userId ?? undefined, {
          vision: dto.vision === true,
          // 默认 defer：确定性结果秒回，文本 LLM 增强转后台（见 run.featureEnrich）
          enrich: dto.enrich === 'sync' ? 'sync' : 'defer',
        })),
      };
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'S0_SCAN_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('runs')
  runs(@Req() req: any) {
    return { success: true, ...this.service.listRuns(req?.session?.userId ?? undefined) };
  }

  @Get('runs/:runId')
  async run(@Param('runId') runId: string, @Req() req: any) {
    return {
      success: true,
      run: await this.service.inspectRun(runId, req?.session?.userId ?? undefined),
    };
  }

  /**
   * 单元拆分预览（P0 契约 · P1/P2 的 Figma 分支）。
   *
   * 🔴 **按需构建，刻意不挂进 `POST scan`**：拆单元要联网取 Figma 节点树，
   *    塞进同步扫描链路会把 `/scan` 重新拖成长时间 pending（这正是长期被投诉的那个问题）。
   *    命中缓存（`spec/components.json`）时零网络；`?refresh=true` 强制重算。
   * 🔴 偶发降级（Figma 限流/网络）**不落盘**，所以刷新一次就能自愈，不会被钉死。
   */
  @Get('runs/:runId/units')
  async units(
    @Param('runId') runId: string,
    @Query('refresh') refresh: string,
    @Req() req: any,
  ) {
    try {
      return {
        success: true,
        units: await this.service.getUnits(runId, req?.session?.userId ?? undefined, {
          refresh: refresh === 'true' || refresh === '1',
        }),
      };
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'UNITS_BUILD_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('runs/:runId/artifact')
  async artifact(@Param('runId') runId: string, @Query('name') name: string, @Req() req: any) {
    // readArtifact 对 `spec/shots/*.png` 缺失时会**按需生成**（有超时上界），故是 async
    return {
      success: true,
      artifact: await this.service.readArtifact(runId, name, req?.session?.userId ?? undefined),
    };
  }

  @Get('runs/:runId/generated-files')
  generatedFiles(@Param('runId') runId: string, @Req() req: any) {
    return {
      success: true,
      files: this.service.listGeneratedFiles(runId, req?.session?.userId ?? undefined),
    };
  }

  /**
   * 删除单次运行（历史记录 + 全部产物 = 整个运行目录）。
   *
   * 🔴 破坏性且不可恢复：前端必须先弹**二次确认**，确认后才允许调这里。
   *    删完前端自行刷新列表；若被删的正是当前查看的运行，详情区一并清空。
   */
  @Delete('runs/:runId')
  @UseGuards(SessionGuard)
  deleteRun(@Param('runId') runId: string, @Req() req: any) {
    try {
      return { success: true, ...this.service.deleteRun(runId, req?.session?.userId ?? undefined) };
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'RUN_DELETE_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('decisions')
  @UseGuards(SessionGuard)
  decisions(@Body() dto: SaveDecisionsDto, @Req() req: any) {
    return {
      success: true,
      ...this.service.saveDecisions(dto.runId, dto.entries ?? [], req?.session?.userId ?? undefined),
    };
  }

  @Post('freeze')
  @UseGuards(SessionGuard)
  async freeze(@Body() dto: FreezeProjectDto, @Req() req: any) {
    try {
      return {
        success: true,
        freeze: await this.service.freeze(dto.runId, req?.session?.userId ?? undefined),
      };
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'S2_FREEZE_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * S3 代码生成：读取 S2 冻结契约，确定性产出「前后端骨架」到运行目录 generated/。
   * 零 LLM、可重入（再次调用会覆盖 generated/）。
   */
  @Post('generate')
  @UseGuards(SessionGuard)
  async generate(@Body() dto: GenerateProjectDto, @Req() req: any) {
    try {
      return {
        success: true,
        generate: await this.service.generate(dto.runId, req?.session?.userId ?? undefined),
      };
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'S3_GENERATE_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * S4 真·Vue 页面生成：读取 S2 冻结契约的 projectRoot（原型工程根），
   * 从原型 HTML 页抽取结构/文案/样式，确定性生成真实 Vue3 SFC 到运行目录 generated/frontend/。
   * 零 LLM、可重入。
   */
  @Post('generate-vue')
  @UseGuards(SessionGuard)
  async generateVue(@Body() dto: GenerateProjectDto, @Req() req: any) {
    try {
      return {
        success: true,
        generateVue: await this.service.generateVue(dto.runId, req?.session?.userId ?? undefined),
      };
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'S4_GENERATE_VUE_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 读取 S4 接口绑定上下文（当前绑定 + 可选 api 模块 + 各视图数据槽），
   * 供前端「对接接口」向导填充下拉。
   */
  @Get('runs/:runId/binding')
  getBinding(@Param('runId') runId: string, @Req() req: any) {
    try {
      return this.service.getBinding(runId, req?.session?.userId ?? undefined);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'S4_GET_BINDING_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 写入 S4 接口绑定侧车（binding.json）。仅持久化，不触碰 bind-api；
   * 写完后前端应再调一次 generate-vue 把绑定烘焙进 GenView 产物。
   */
  @Post('runs/:runId/binding')
  @UseGuards(SessionGuard)
  setBinding(@Param('runId') runId: string, @Body() dto: any, @Req() req: any) {
    try {
      return this.service.setBinding(runId, dto, req?.session?.userId ?? undefined);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'S4_SET_BINDING_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 读取 S4 组件嵌入上下文（当前嵌入侧车 + 各视图），供前端「插入组件」面板填充视图下拉。
   */
  @Get('runs/:runId/embeds')
  getEmbeds(@Param('runId') runId: string, @Req() req: any) {
    try {
      return this.service.getEmbeds(runId, req?.session?.userId ?? undefined);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'S4_GET_EMBEDS_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 写入 S4 组件嵌入侧车（embeds.json）。仅持久化，不触碰 bind-api；
   * 写完后前端应再调一次 generate-vue 把组件烘焙进 GenView 产物。
   */
  @Post('runs/:runId/embeds')
  @UseGuards(SessionGuard)
  setEmbeds(@Param('runId') runId: string, @Body() dto: any, @Req() req: any) {
    try {
      return this.service.setEmbeds(runId, dto, req?.session?.userId ?? undefined);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'S4_SET_EMBEDS_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * S3 打包下载：把运行目录下的 generated/ 打成 zip 流出。
   * 以 StreamableFile 返回，全局信封拦截器对其直接透传（不包信封）。
   */
  @Get('runs/:runId/generated-zip')
  async generatedZip(@Param('runId') runId: string, @Req() req: any) {
    try {
      const { buffer, filename } = await this.service.generateZip(
        runId,
        req?.session?.userId ?? undefined,
      );
      return new StreamableFile(buffer, {
        type: 'application/zip',
        disposition: `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      });
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        { code: 'S3_ZIP_FAILED', message: e.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
