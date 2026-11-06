// 2026-11-06 源文件丢失后由 dist 编译产物（dist/meeting-asr/meeting-asr.controller.js + .d.ts）机械重建，
// 逻辑与 dist 产物逐行对应。
import { Body, Controller, Get, HttpException, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { SessionGuard } from '../auth/session.guard'
import { describeMeetingAsrConfig } from './meeting-asr.config'
import { MeetingAsrError, MeetingAsrService, type MeetingAsrTranscribeResult } from './meeting-asr.service'

@Controller('meeting-asr')
@UseGuards(SessionGuard)
export class MeetingAsrController {
  constructor(private readonly svc: MeetingAsrService) {}

  @Get('status')
  status() {
    return describeMeetingAsrConfig()
  }

  /** 音频内存态接收（FileInterceptor，10MB 上限），不落盘 */
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async transcribe(
    @UploadedFile() file: any,
    @Body() body: Record<string, any>,
  ): Promise<MeetingAsrTranscribeResult> {
    if (!file?.buffer?.length) {
      throw new HttpException({ code: 'asr_bad_audio', message: '缺少上传文件 file（音频）' }, 400)
    }
    try {
      const result = await this.svc.transcribe(file.buffer, {
        mime: file.mimetype || 'audio/wav',
        language: String(body?.language || '').trim() || undefined,
        fileName: file.originalname,
      })
      return result
    } catch (err) {
      throw this.toHttpException(err)
    }
  }

  private toHttpException(err: unknown): HttpException {
    if (err instanceof MeetingAsrError) {
      return new HttpException({ code: err.code, message: err.message }, err.httpStatus)
    }
    const message = err instanceof Error ? err.message : String(err)
    return new HttpException({ code: 'asr_upstream_error', message }, 500)
  }
}
