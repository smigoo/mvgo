import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CONFIRM_STATES, TEMPLATE_SCHEMAS } from '../meeting-state';

/**
 * meeting 管线 DTO
 *
 * 🔴 本仓 main.ts 挂了全局 `ValidationPipe({ whitelist: true, transform: true })`
 *    ⇒ **DTO 未声明的 body 字段会被静默剥离**（不报错、不打日志）。apifox `ownerId`
 *    丢失事故的根因就是这个。
 *    本模块的归属**不来自 body**（只来自会话身份 `req.session.userId`），所以这里
 *    刻意不声明 `ownerId`/`userId` —— 声明了反而给了「body 伪造归属」的假通路。
 *    契约测试 `meeting-contract-parity.spec.ts` 用真实 ValidationPipe 复现剥离行为，
 *    断言伪造的 ownerId 传不进服务层。
 */

const MEETING_TYPES = Object.keys(TEMPLATE_SCHEMAS);

export class CreateRunDto {
  /** 会议类型：progress_review | requirement_review | other（缺省 other） */
  @IsOptional()
  @IsIn(MEETING_TYPES)
  meetingType?: string;

  @IsOptional()
  @IsString()
  title?: string;

  /** 输出语种（缺省 zh） */
  @IsOptional()
  @IsString()
  outputLanguage?: string;

  /** 待表态参会人清单（同意门禁 FR-03 的判定对象） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participants?: string[];

  /** 三路输入（录音 / 背景资料 / 产出要求）的引用，v1 仅登记不解析 */
  @IsOptional()
  @IsObject()
  inputs?: Record<string, any>;
}

export class AttachAudioDto {
  /** 音频引用（对象存储 key / 本地临时 ref） */
  @IsOptional()
  @IsString()
  audioRef?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participants?: string[];
}

export class PatchFieldDto {
  /** 编辑后的字段值 */
  @IsOptional()
  value?: any;

  /** 确认态：未确认 | 编辑中 | 已确认 | 已驳回 */
  @IsOptional()
  @IsIn(CONFIRM_STATES as unknown as string[])
  confirmState?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** 驳回理由 */
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ConsentDecisionDto {
  @IsString()
  @IsNotEmpty()
  participantId!: string;

  @IsIn(['accepted', 'declined'])
  decision!: 'accepted' | 'declined';
}

export class DeclareConsentDto {
  /** 待表态参会人清单（覆盖/补齐 run 上的 participants） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participants?: string[];

  /** 告知文案版本（缺失时用服务端默认 v1） */
  @IsOptional()
  @IsString()
  disclosureVersion?: string;

  @IsOptional()
  @IsString()
  summary?: string;
}

export class ConsentDecisionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsentDecisionDto)
  decisions!: ConsentDecisionDto[];

  @IsOptional()
  @IsString()
  disclosureVersion?: string;
}

export class WithdrawConsentDto {
  /** 撤回的参会人（缺省表示整场撤回） */
  @IsOptional()
  @IsString()
  participantId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ComposeDto {
  @IsOptional()
  @IsString()
  outputLanguage?: string;

  /** 篇幅目标（软约束白名单） */
  @IsOptional()
  @IsString()
  lengthTarget?: string;
}

export class SetRetentionDto {
  /** 留存天数，合法区间 1~3650（与契约 E-16 一致） */
  @IsInt()
  @Min(1)
  @Max(3650)
  days!: number;
}

export class PurgeRetentionDto {
  /** 指定 runId（缺省按策略过期清理） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  runIds?: string[];

  /** 只统计不删除 */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
