// 2026-11-06 源文件丢失后由 dist 编译产物（dist/feedback/feedback.service.js + .d.ts）机械重建，
// 逻辑与 dist 产物逐行对应。
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { isValidObjectId, Model } from 'mongoose'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { TasksService } from '../tasks/tasks.service'
import { UserAiConfigService } from '../config/user-ai-config.service'
import { feedbackAttachmentsDir } from '../config/backend-root'
import { TaskFeedback, TaskFeedbackDocument, FeedbackStatus, FeedbackCategory } from './feedback.schema'
import { redactTextSecrets, sanitizeDescription, truncateLogText } from './feedback-redact.util'
import { FIGMA_CREDENTIAL_FP_FIELD, figmaCredentialFpFromConfig } from '../config/figma-credential'
import { assessFigmaCredentialDrift } from '../config/figma-credential-ref'

const DEDUP_WINDOW_MS = 10 * 60 * 1000
const DAILY_LIMIT = 20
export const FEEDBACK_MAX_FILE_BYTES = 8 * 1024 * 1024

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
}
const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const ALLOWED_INCLUDES = ['logs', 'models', 'figmaUrl', 'token']

export interface CreateFeedbackParams {
  sessionId: string
  userId: string
  username?: string
  category?: string
  description?: string
  includes?: string[] | string
  logsText?: string
  pageUrl?: string
  userAgent?: string
  file?: {
    buffer: Buffer
    originalname?: string
    mimetype?: string
    size?: number
  }
}

export interface CreateFeedbackResult {
  success: boolean
  message?: string
  duplicate?: boolean
  feedback?: Record<string, any>
}

export interface ListFeedbackQuery {
  page?: number
  pageSize?: number
  status?: string
  category?: string
  sessionId?: string
  keyword?: string
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name)

  constructor(
    @InjectModel(TaskFeedback.name) private readonly feedbackModel: Model<TaskFeedbackDocument>,
    private readonly tasksService: TasksService,
    private readonly userAiConfigService: UserAiConfigService,
  ) {}

  async create(params: CreateFeedbackParams): Promise<CreateFeedbackResult> {
    const { sessionId, userId } = params
    if (!sessionId) throw new BadRequestException('缺少 sessionId')
    const status: any = this.tasksService.getTaskStatus(sessionId, userId)
    if (!status.success || !status.task) {
      const msg: string = status.error || '任务不存在'
      if (msg === '无权访问此任务') throw new ForbiddenException(msg)
      throw new NotFoundException(msg)
    }
    const task = status.task
    const now = Date.now()
    const recent = await this.feedbackModel
      .findOne({ sessionId, userId, createdAt: { $gte: new Date(now - DEDUP_WINDOW_MS) } })
      .select('_id status createdAt')
      .lean()
    if (recent) {
      return {
        success: false,
        duplicate: true,
        message: '该任务 10 分钟内已提交过反馈，管理员处理中；如需补充请直接在处置备注中沟通',
        feedback: { id: String((recent as any)._id), status: (recent as any).status },
      }
    }
    const todayCount = await this.feedbackModel.countDocuments({
      userId,
      createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) },
    })
    if (todayCount >= DAILY_LIMIT) {
      return { success: false, message: `反馈提交过于频繁（24 小时内上限 ${DAILY_LIMIT} 条）` }
    }
    const includes = this.parseIncludes(params.includes)
    const snapshot = await this.buildSnapshot({ task, userId, includes, logsText: params.logsText, pageUrl: params.pageUrl })
    // 🔴 2026-11-06：输入图 / 输出效果图自动随附（不受 includes 勾选控制——管理员定位
    //   「生成质量」类问题没有这两张图基本盲猜）。**不复制文件**：两张图按任务产物目录
    //   落盘，快照只记相对引用；管理端经 GET /api/component/:cid/file?path=...&raw=1
    //   直出（SessionGuard + 归属校验都在该接口内）。图丢失时 resolveTaskImages 返回
    //   undefined，前端不渲染缩略图，不报错。
    snapshot.taskImages = this.resolveTaskImages(task)
    const attachment = params.file ? this.saveAttachment(sessionId, params.file) : null
    const description = sanitizeDescription(params.description)
    if (!description) throw new BadRequestException('请填写反馈描述')
    const doc = await this.feedbackModel.create({
      sessionId,
      userId,
      username: params.username,
      category: this.normalizeCategory(params.category),
      description,
      status: 'pending',
      snapshot,
      attachment,
      source: 'task-detail',
      userAgent: params.userAgent?.slice(0, 300),
    })
    this.logger.log(
      `反馈已提交: id=${(doc as any)._id} sessionId=${sessionId} user=${userId} ` +
        `includes=[${includes.join(',')}] logBytes=${(snapshot as any).logBytes ?? 0} attachment=${attachment ? 'yes' : 'no'}`,
    )
    return {
      success: true,
      feedback: {
        id: String((doc as any)._id),
        sessionId,
        status: 'pending',
        createdAt: (doc as any).createdAt,
      },
    }
  }

  private normalizeCategory(raw?: string): FeedbackCategory {
    const allowed = ['bug', 'quality', 'suggestion', 'other']
    return raw && allowed.includes(raw) ? (raw as FeedbackCategory) : 'bug'
  }

  private parseIncludes(raw?: string[] | string): string[] {
    let list: string[] | string | undefined = raw
    if (typeof raw === 'string') {
      const t = raw.trim()
      if (!t) return []
      try {
        list = JSON.parse(t)
      } catch {
        list = t.split(',').map((s) => s.trim())
      }
    }
    if (!Array.isArray(list)) return []
    const set = new Set<string>()
    list.forEach((v) => {
      const key = String(v || '').trim()
      if (ALLOWED_INCLUDES.includes(key)) set.add(key)
    })
    return ALLOWED_INCLUDES.filter((k) => set.has(k))
  }

  private async buildSnapshot(args: {
    task: any
    userId: string
    includes: string[]
    logsText?: string
    pageUrl?: string
  }): Promise<Record<string, any>> {
    const { task, userId, includes, logsText, pageUrl } = args
    const snapshot: Record<string, any> = {
      taskStatus: task.status,
      target: task.target,
      componentId: task.componentId,
      componentName: task.displayName || task.componentName,
      taskError: task.error ? redactTextSecrets(String(task.error)).slice(0, 4000) : undefined,
      included: includes,
      pageUrl: pageUrl?.slice(0, 500),
    }
    if (includes.includes('models')) {
      snapshot.modelsUsed = this.resolveModelsUsed(task)
    }
    if (includes.includes('figmaUrl')) {
      snapshot.figmaUrl = this.buildFigmaUrl(task)
    }
    if (includes.includes('token')) {
      const credential = await this.resolveCredentialFingerprint(task, userId)
      snapshot.tokenFingerprint = credential.taskFingerprint
      snapshot.tokenFingerprintSource = credential.source
      snapshot.tokenFingerprintCurrent = credential.currentFingerprint
      snapshot.tokenFingerprintChanged = credential.changed
      // 判定依据（`no-ref` / `fingerprint-unusable` / `matched` / `not-found` / `slot-overwritten` / `no-slots`）：
      // `changed===undefined` 有两种成因，光看布尔分不出来，落地后客服/排障才能一句话说清
      snapshot.tokenFingerprintDrift = credential.driftReason
    }
    if (includes.includes('logs') && typeof logsText === 'string' && logsText.trim()) {
      const cleaned = redactTextSecrets(logsText)
      const truncated = truncateLogText(cleaned)
      snapshot.logExcerpt = truncated.text
      snapshot.logBytes = truncated.bytes
      snapshot.logOriginalBytes = truncated.originalBytes
      snapshot.logTruncated = truncated.truncated
    }
    return snapshot
  }

  private resolveModelsUsed(task: any): string[] {
    const used = new Set<string>()
    const cm = task?.completionModels
    const split = (s: unknown) =>
      String(s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    if (cm) {
      split(cm.visionModel).forEach((m) => used.add(m))
      split(cm.textModel).forEach((m) => used.add(m))
      if (used.size > 0) return Array.from(used).slice(0, 10)
    }
    const s = task?.configSnapshot
    if (!s) return []
    if (s.unifiedModel && s.modelMode === 'unified') {
      used.add(s.unifiedModel)
    } else {
      if (s.visionModel) used.add(s.visionModel)
      if (s.textModel) used.add(s.textModel)
    }
    return Array.from(used).slice(0, 10)
  }

  private buildFigmaUrl(task: any): string | undefined {
    const fileKey = task?.fileKey
    const nodeId = task?.nodeId
    if (!fileKey || !nodeId) return undefined
    const name = encodeURIComponent(task?.componentName || 'design')
    return `https://www.figma.com/design/${fileKey}/${name}?node-id=${String(nodeId).replace(/:/g, '-')}`
  }

  /**
   * 🔴 2026-11-06 自动随附的两张图（引用，不复制）：
   * - input：Figma 输入图 = 产物目录 resources/images/mc-preview.png
   *   （figma-connector.downloadPreviewImage 阶段1b 落盘；截图来源任务同名文件）
   * - output：产物渲染截图 = .mc-gen/screenshots/<sessionId>-rendered.png
   *   （screenshot-renderer 生成后落盘；失败任务可能没有）
   * 路径校验只认白名单内两个固定文件名，不拼用户输入，无穿越面。
   * 展示 URL 由前端按 componentId 拼 /api/component/:cid/file?path=...&raw=1
   * （该接口已有 SessionGuard + 归属校验，管理员看他人产物走 admin 通道）。
   */
  private resolveTaskImages(task: any): { input?: string; output?: string } | undefined {
    const images: { input?: string; output?: string } = {}
    // 🔴 2026-11-06 修：此前只按「应该存在」的固定文件名返回路径，文件实际缺失时
    //   前端/管理端会渲染成破图（生产实测：output 截图绝大多数任务根本没有——截图器
    //   依赖真实预览页，预览不可达即不产出）。改为**按产物目录实际存在性过滤**，
    //   不存在就不返回该键，UI 自然不渲染，也不会给管理员一个打不开的链接。
    const baseDir = typeof task?.outputPath === 'string' && task.outputPath ? resolve(task.outputPath) : ''
    const existsRel = (rel: string): boolean => {
      if (!baseDir) return false
      try {
        return existsSync(join(baseDir, rel))
      } catch {
        return false
      }
    }
    if (baseDir) {
      const input = 'resources/images/mc-preview.png'
      if (existsRel(input)) images.input = input
      if (task?.sessionId) {
        const output = `.mc-gen/screenshots/${String(task.sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')}-rendered.png`
        if (existsRel(output)) images.output = output
      }
    }
    return Object.keys(images).length ? images : undefined
  }

  private async resolveCredentialFingerprint(task: any, userId: string) {
    const pipelineFp =
      typeof task?.figmaCredentialFp === 'string' && task.figmaCredentialFp.trim()
        ? (task.figmaCredentialFp.trim() as string)
        : ''
    const createFp =
      typeof task?.configSnapshot?.[FIGMA_CREDENTIAL_FP_FIELD] === 'string'
        ? String(task.configSnapshot[FIGMA_CREDENTIAL_FP_FIELD]).trim()
        : ''
    const taskFingerprint: string | undefined = pipelineFp || createFp || undefined
    const source: 'pipeline' | 'create' | undefined = pipelineFp ? 'pipeline' : createFp ? 'create' : undefined
    const cfg = await this.readUserFigmaConfig(userId)
    const currentFingerprint = cfg ? figmaCredentialFpFromConfig(cfg) ?? undefined : undefined
    // 🔴 2026-11-09（诉求五 #16-②）：`changed` **不再**由两个指纹相减得出。
    //    原口径 `taskFingerprint !== currentFingerprint` 里的 current 只是**当前 active 槽位**，
    //    而方案 A 落地后「历史任务沿用当时那个 token」是**正常语义**（它常常不是 active 槽），
    //    相减会把每一次正常沿用都误报成「凭证已变」——正是这次要消灭的那类噪声。
    //    改为问「当时那个凭证现在还能不能按引用找回」，判据单一来源
    //    `assessFigmaCredentialDrift`（与执行期 `resolveFigmaTokenByRef` 同源）。
    const drift = assessFigmaCredentialDrift(task, cfg)
    return {
      taskFingerprint,
      source,
      currentFingerprint,
      changed: drift.changed,
      driftReason: drift.reason,
    }
  }

  /** 读用户**原始**配置（不合并、不投影）；读失败只降级为「无从对照」，绝不阻断反馈提交。 */
  private async readUserFigmaConfig(userId: string): Promise<Record<string, any> | null> {
    try {
      return await this.userAiConfigService.getUserConfig(userId)
    } catch (error: any) {
      this.logger.warn(`读取用户 Figma 凭证指纹失败: user=${userId} ${error?.message}`)
      return null
    }
  }

  private saveAttachment(sessionId: string, file: NonNullable<CreateFeedbackParams['file']>) {
    if (!file.buffer?.length) throw new BadRequestException('截图内容为空')
    if (file.buffer.length > FEEDBACK_MAX_FILE_BYTES) {
      throw new BadRequestException(`截图超过 ${Math.round(FEEDBACK_MAX_FILE_BYTES / 1024 / 1024)}MB`)
    }
    const mime = String(file.mimetype || '').toLowerCase()
    const byMime = IMAGE_EXT_BY_MIME[mime]
    const byName = extname(String(file.originalname || '')).toLowerCase()
    const ext = byMime || (ALLOWED_IMAGE_EXTS.has(byName) ? byName : '')
    if (!ext) {
      throw new BadRequestException('截图仅支持 PNG / JPG / WebP')
    }
    const safeSession = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'unknown'
    const dir = join(feedbackAttachmentsDir, safeSession)
    mkdirSync(dir, { recursive: true })
    const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`
    writeFileSync(join(dir, storedName), file.buffer)
    return {
      filename: String(file.originalname || storedName).slice(0, 200),
      storedName,
      relativePath: join(safeSession, storedName),
      size: file.buffer.length,
      mimeType: mime || 'application/octet-stream',
    }
  }

  async list(query: ListFeedbackQuery): Promise<{ list: any[]; total: number; counts: Record<string, number> }> {
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
    const filter: Record<string, any> = {}
    if (query.status && query.status !== 'all') filter.status = query.status
    if (query.category && query.category !== 'all') filter.category = query.category
    if (query.sessionId) filter.sessionId = String(query.sessionId).trim()
    if (query.keyword) {
      const kw = String(query.keyword).trim()
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [
        { description: { $regex: escaped, $options: 'i' } },
        { sessionId: { $regex: escaped, $options: 'i' } },
        { username: { $regex: escaped, $options: 'i' } },
        { 'snapshot.componentName': { $regex: escaped, $options: 'i' } },
      ]
    }
    const [list, total, pending, processing, resolved, rejected] = await Promise.all([
      this.feedbackModel
        .find(filter)
        .select('-snapshot.logExcerpt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.feedbackModel.countDocuments(filter),
      this.feedbackModel.countDocuments({ status: 'pending' }),
      this.feedbackModel.countDocuments({ status: 'processing' }),
      this.feedbackModel.countDocuments({ status: 'resolved' }),
      this.feedbackModel.countDocuments({ status: 'rejected' }),
    ])
    return {
      list,
      total,
      counts: { pending, processing, resolved, rejected, all: pending + processing + resolved + rejected },
    }
  }

  async detail(id: string): Promise<any> {
    this.assertObjectId(id)
    const doc = await this.feedbackModel.findById(id).lean()
    if (!doc) throw new NotFoundException('反馈不存在')
    return doc
  }

  async updateStatus(
    id: string,
    params: { status: FeedbackStatus; adminNote?: string; adminId: string; adminName?: string },
  ): Promise<any> {
    this.assertObjectId(id)
    const { status, adminNote, adminId, adminName } = params
    const allowed = ['pending', 'processing', 'resolved', 'rejected']
    if (!allowed.includes(status)) throw new BadRequestException(`非法状态: ${status}`)
    const patch: Record<string, any> = {
      status,
      handledBy: adminId,
      handledByName: adminName,
    }
    if (typeof adminNote === 'string') patch.adminNote = sanitizeDescription(adminNote)
    if (status === 'pending') {
      patch.handledAt = null
      patch.handledBy = null
      patch.handledByName = null
    } else {
      patch.handledAt = new Date()
    }
    const updated = await this.feedbackModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean()
    if (!updated) throw new NotFoundException('反馈不存在')
    this.logger.log(`反馈状态更新: id=${id} -> ${status} by=${adminId}`)
    return updated
  }

  async remove(id: string): Promise<{ success: boolean }> {
    this.assertObjectId(id)
    const doc = await this.feedbackModel.findByIdAndDelete(id).lean()
    if (!doc) throw new NotFoundException('反馈不存在')
    return { success: true }
  }

  async resolveAttachment(id: string): Promise<{ absPath: string; filename: string; mimeType: string }> {
    this.assertObjectId(id)
    const doc = await this.feedbackModel.findById(id).select('attachment').lean()
    if (!doc) throw new NotFoundException('反馈不存在')
    const att = (doc as any).attachment
    if (!att?.relativePath) throw new NotFoundException('该反馈没有附件')
    const root = resolve(feedbackAttachmentsDir)
    const absPath = resolve(root, att.relativePath)
    if (absPath !== root && !absPath.startsWith(root + sep)) {
      throw new ForbiddenException('附件路径非法')
    }
    if (!existsSync(absPath)) throw new NotFoundException('附件文件已丢失')
    return { absPath, filename: att.filename || att.storedName, mimeType: att.mimeType || 'application/octet-stream' }
  }

  private assertObjectId(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('反馈 ID 格式非法')
  }
}
