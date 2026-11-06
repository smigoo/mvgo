import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { MeetingDevOnlyGuard } from './meeting-dev-only.guard';
import { MeetingService } from './meeting.service';
import {
  AttachAudioDto,
  ComposeDto,
  ConsentDecisionsDto,
  CreateRunDto,
  DeclareConsentDto,
  PatchFieldDto,
  PurgeRetentionDto,
  SetRetentionDto,
  WithdrawConsentDto,
} from './dto/meeting.dto';

/**
 * 会议纪要管线控制器（契约 E-01~E-18，路径逐字对齐
 * `frontend/src/views/meeting/contracts/api-contract.js#BACKEND_ENDPOINTS`，
 * 由 `meeting-contract-parity.spec.ts` 双向钉住）。
 *
 * 🔴 归属（ownerId）**只来自会话身份**：控制器从 `req.session.userId` 取，绝不从 body/query 取。
 *    根因见 dto/meeting.dto.ts 顶部注释（全局 ValidationPipe whitelist 会静默剥离 DTO 未声明字段，
 *    apifox ownerId 丢失事故即源于「归属走 body」）。
 *
 * 🔴 双闸守卫（两道都要，缺一即漏）：
 *    1. `MeetingDevOnlyGuard` —— 暴露开关。与 app.module.ts 的条件注册**同调 isMeetingExposed()**，
 *       避免「已注册但守卫 404 / 已守卫但模块没注册」的静默失效。
 *    2. `SessionGuard` —— 身份闸。缺 token 直接 401，保证下面的 userId 一定非空。
 *    ⚠️ 但 SessionGuard 第 0 步有 `raw=1` 逃生舱（为静态图片新标签页直开设计，对所有挂载它的
 *       路由生效）⇒ 一次 `?raw=1` 即可匿名打到写端点。所以服务层还有第三道 `requireOwner`
 *       （身份缺失一律 401，绝不落库），三道叠起来才闭合。
 *
 * ⚠️ 本控制器**不得**新增契约 18 条之外的 HTTP 路由（含内部 seam `ingestDraft`，它只以
 *    服务方法存在，供 spec / 未来管线调用）。新增路由会让 parity spec 双向比对立刻红。
 */
@Controller('meeting')
@UseGuards(MeetingDevOnlyGuard, SessionGuard)
export class MeetingController {
  constructor(private readonly service: MeetingService) {}

  // ── E-01 创建 RunVersion ────────────────────────────────────────────────────
  @Post('runs')
  createRun(@Body() dto: CreateRunDto, @Req() req: any) {
    return this.service.createRun(dto, req?.session?.userId ?? undefined);
  }

  // ── E-02 音频上传（服务端二次校验同意门禁；T-013/SEC-05 未就绪 → 503）──────────
  @Post('runs/:id/audio')
  attachAudio(@Param('id') id: string, @Body() dto: AttachAudioDto, @Req() req: any) {
    return this.service.attachAudio(id, dto, req?.session?.userId ?? undefined);
  }

  // ── E-03 轮询阶段状态 ───────────────────────────────────────────────────────
  @Get('runs/:id')
  getRun(@Param('id') id: string, @Req() req: any) {
    return this.service.getRun(id, req?.session?.userId ?? undefined);
  }

  // ── E-04 断点续跑（D-01/T-013 未就绪 → 503）─────────────────────────────────
  @Post('runs/:id/retry')
  retryRun(@Param('id') id: string, @Req() req: any) {
    return this.service.retryRun(id, req?.session?.userId ?? undefined);
  }

  // ── E-05 读 draft_ai + field_overlay 合并结果 ───────────────────────────────
  @Get('runs/:id/draft')
  getDraft(@Param('id') id: string, @Req() req: any) {
    return this.service.getDraft(id, req?.session?.userId ?? undefined);
  }

  // ── E-06 编辑 / 确认 / 驳回，写 field_overlay ───────────────────────────────
  @Patch('runs/:id/draft/fields/:fieldId')
  patchField(
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: PatchFieldDto,
    @Req() req: any,
  ) {
    return this.service.patchField(id, fieldId, dto, req?.session?.userId ?? undefined);
  }

  // ── E-07 定稿冻结快照（前置同意门禁 + 状态机）───────────────────────────────
  @Post('runs/:id/publish')
  publishRun(@Param('id') id: string, @Req() req: any) {
    return this.service.publishRun(id, req?.session?.userId ?? undefined);
  }

  // ── E-08 导出（过 FR-11 发布门禁；docx/pdf 未就绪 → 503）─────────────────────
  @Get('runs/:id/export')
  exportRun(@Param('id') id: string, @Query('format') format: string, @Req() req: any) {
    return this.service.exportRun(id, format, req?.session?.userId ?? undefined);
  }

  // ── E-09 整合稿件合成（云 LLM 未就绪 → 503）─────────────────────────────────
  @Post('runs/:id/compose')
  composeRun(@Param('id') id: string, @Body() dto: ComposeDto, @Req() req: any) {
    return this.service.composeRun(id, dto, req?.session?.userId ?? undefined);
  }

  // ── E-10 发起告知 ──────────────────────────────────────────────────────────
  @Post('runs/:id/consent/disclosure')
  declareConsent(@Param('id') id: string, @Body() dto: DeclareConsentDto, @Req() req: any) {
    return this.service.declareConsent(id, dto, req?.session?.userId ?? undefined);
  }

  // ── E-11 提交逐人同意 / 拒绝 ────────────────────────────────────────────────
  @Post('runs/:id/consent/decisions')
  submitConsentDecisions(
    @Param('id') id: string,
    @Body() dto: ConsentDecisionsDto,
    @Req() req: any,
  ) {
    return this.service.submitConsentDecisions(id, dto, req?.session?.userId ?? undefined);
  }

  // ── E-12 查询权威门禁状态 ───────────────────────────────────────────────────
  @Get('runs/:id/consent')
  getConsent(@Param('id') id: string, @Req() req: any) {
    return this.service.getConsent(id, req?.session?.userId ?? undefined);
  }

  // ── E-13 撤回同意 ──────────────────────────────────────────────────────────
  @Post('runs/:id/consent/withdraw')
  withdrawConsent(@Param('id') id: string, @Body() dto: WithdrawConsentDto, @Req() req: any) {
    return this.service.withdrawConsent(id, dto, req?.session?.userId ?? undefined);
  }

  // ── E-14 逐人同意留痕 ──────────────────────────────────────────────────────
  @Get('runs/:id/consent/audit')
  getConsentAudit(@Param('id') id: string, @Req() req: any) {
    return this.service.getConsentAudit(id, req?.session?.userId ?? undefined);
  }

  // ── E-15 读留存策略（全局策略，不按 owner 过滤，但仍要求已登录）──────────────
  @Get('retention/policy')
  getRetentionPolicy() {
    return this.service.getRetentionPolicy();
  }

  // ── E-16 写留存天数（1~3650）───────────────────────────────────────────────
  @Put('retention/policy')
  setRetentionPolicy(@Body() dto: SetRetentionDto, @Req() req: any) {
    return this.service.setRetentionPolicy(dto, req?.session?.userId ?? undefined);
  }

  // ── E-17 到期清理（只清调用方自己名下；runIds 也必须落在自己名下）─────────────
  @Post('retention/purge')
  purgeRetention(@Body() dto: PurgeRetentionDto, @Req() req: any) {
    return this.service.purgeRetention(dto, req?.session?.userId ?? undefined);
  }

  // ── E-18 删除审计（只返回调用方自己触发的清理记录）─────────────────────────
  @Get('retention/audit')
  getRetentionAudit(@Req() req: any) {
    return this.service.getRetentionAudit(req?.session?.userId ?? undefined);
  }
}
