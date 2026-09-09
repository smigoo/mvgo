import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { dirname as posixDirname, join as posixJoin, normalize as posixNormalize } from 'path/posix';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { LessCompileGate } from '../ai-engine/validators/less-compile-gate.js';
import { validateVueScriptSemantics } from '../ai-engine/utils/sfc-semantics.js';
import {
  TaskCodeSnapshotService,
  TaskCodeSnapshotManifest,
  TaskCodeSnapshotValidation,
} from './task-code-snapshot.service';
import { TasksService } from './tasks.service';

export type QualitySeverity = 'BLOCK' | 'WARN' | 'INFO';

/**
 * 逐文件质量诊断项。字段与生成管线的 LESS 门禁诊断（less-compile-gate.js）
 * 保持一致，前端可直接复用「定位到行列 + 展示代码片段」的交互。
 */
export interface QualityIssue {
  id: string;
  severity: QualitySeverity;
  sourceType: 'shared-less' | 'standalone-less' | 'sfc-style' | 'sfc-semantics' | 'structure';
  file: string;
  line: number;
  column: number;
  message: string;
  extract?: string[];
  /**
   * 出错行上下文。line 是**整个文件**的行号（与 issue.line 同基准），
   * 由 buildSourceSnippet 依据源文件内容生成 —— 门禁自带的 snippet 以 style 块为基准，
   * 与 issue.line 不一致，不能直接透传。
   */
  snippet?: Array<{ line?: number; code: string; current?: boolean }>;
  hint?: { suggestion?: string };
  healApplied?: boolean;
}

export interface SnapshotQualityResult {
  success: true;
  sessionId: string;
  revision: string;
  pass: boolean;
  blockCount: number;
  issues: QualityIssue[];
  validation: TaskCodeSnapshotValidation;
  /** 本次校验发现并已自动对账的快照索引漂移（磁盘内容为准回写 manifest） */
  integrityDrifted?: string[];
  checkedAt: string;
}

const TEXT_FILE_LIMIT = 512 * 1024;

/**
 * 快照离线质量校验服务。
 *
 * 背景（用户反馈）：任务详情页只报「N 个文件存在问题」，且错误明细是从日志里用文件名做
 * 字符串包含匹配拼出来的 —— 既没有行号列号，也没有错误码和代码片段，用户「定位过去也
 * 不知道错在哪」。更糟的是，用户手动改完文件后没有任何「重新校验 + 刷新预览」的入口，
 * 导致失败任务只能靠肉眼猜。
 *
 * 本服务把生成管线的两个硬门禁（LESS 真实编译 + SFC 语义）抽出来，做成可对任意
 * 快照 revision 重复调用的幂等校验，支撑「手改 → 保存 → 重新校验 → 刷新预览」闭环。
 *
 * 设计约束：
 *  1. 只读快照、不改快照内容。LESS 自愈只发生在临时目录副本上，不回写用户正在编辑的 revision。
 *  2. 不读 preview 回退版。必须用 exportRevisionFiles 原样读取用户编辑的那个 revision。
 *  3. 校验失败不抛业务异常，只把结论返回给前端；只有 revision 不存在/参数非法才是异常。
 */
@Injectable()
export class SnapshotQualityService {
  private readonly logger = new Logger('SnapshotQualityService');

  constructor(
    private readonly snapshotService: TaskCodeSnapshotService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * 对指定 revision 重跑质量门禁。
   * @param persist 是否把结论写回 task.result（供任务详情页直接读取）
   */
  async validateRevision(
    sessionId: string,
    revision: string,
    options: { persist?: boolean } = {},
  ): Promise<SnapshotQualityResult> {
    const manifest = this.snapshotService.getManifest(sessionId, revision);
    const integrityDrifted = this.snapshotService.reconcileRevisionIntegrity(sessionId, revision);
    const files = this.snapshotService.exportRevisionFiles(sessionId, revision);
    const issues: QualityIssue[] = [];

    const workDir = this.materialize(sessionId, revision, files);
    try {
      issues.push(...(await this.runLessGate(workDir, files)));
    } finally {
      // 校验结束即清理：临时目录只服务于本次 less.render，不留存中间产物。
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch (err: any) {
        this.logger.warn(`清理校验临时目录失败（非致命）：${err?.message || err}`);
      }
    }

    issues.push(...this.runSfcSemantics(files));
    issues.push(...this.runStructureCheck(manifest, files));
    this.collapseMissingImportDuplicates(issues);

    const blockCount = issues.filter((issue) => issue.severity === 'BLOCK').length;
    const validation: TaskCodeSnapshotValidation = {
      less: this.deriveValidation(issues, ['shared-less', 'standalone-less', 'sfc-style']),
      semantics: this.deriveValidation(issues, ['sfc-semantics']),
      sfc: this.deriveValidation(issues, ['sfc-semantics']),
      runtime: 'pending',
    };

    const result: SnapshotQualityResult = {
      success: true,
      sessionId,
      revision,
      pass: blockCount === 0,
      blockCount,
      issues,
      validation,
      integrityDrifted: integrityDrifted.length > 0 ? integrityDrifted : undefined,
      checkedAt: new Date().toISOString(),
    };

    // 回写快照 manifest：让「文件树状态点」与「校验结论」保持一致。
    this.snapshotService.updateValidation(
      sessionId,
      revision,
      validation,
      blockCount > 0 ? `${blockCount} 个阻断问题` : undefined,
    );

    if (options.persist !== false) this.persistToTask(sessionId, result);

    return result;
  }

  /** 把校验结论写入 task.result，前端任务详情页直接消费，无需再从日志猜。 */
  private persistToTask(sessionId: string, result: SnapshotQualityResult): void {
    try {
      const task = this.tasksService.getTask(sessionId);
      if (!task) return;
      this.tasksService.updateTask(sessionId, {
        result: {
          ...((task as any).result || {}),
          codeValidationResult: {
            pass: result.pass,
            blockCount: result.blockCount,
            issues: result.issues,
            revision: result.revision,
            checkedAt: result.checkedAt,
          },
          lessCompileGate: {
            pass: result.validation.less !== 'blocked',
            blockCount: result.issues.filter(
              (i) => i.severity === 'BLOCK' && i.sourceType !== 'sfc-semantics' && i.sourceType !== 'structure',
            ).length,
            diagnostics: result.issues.filter((i) => i.sourceType !== 'sfc-semantics' && i.sourceType !== 'structure'),
          },
        },
      } as any);
    } catch (err: any) {
      // 持久化失败不能影响「校验结论已产出」这一事实，只留痕。
      this.logger.warn(`写入 task.result 失败（非致命）：${err?.message || err}`);
    }
  }

  /** 把快照文件物化到临时目录，供 LessCompileGate.validateDirectory 走真实磁盘 import 链。 */
  private materialize(
    sessionId: string,
    revision: string,
    files: Record<string, string>,
  ): string {
    const safeSession = String(sessionId || 'unknown').replace(/[^\w.-]/g, '_').slice(0, 80);
    const safeRevision = String(revision || 'unknown').replace(/[^\w.-]/g, '_').slice(0, 80);
    const workDir = resolve(tmpdir(), 'mvgo-snapshot-validate', `${safeSession}-${safeRevision}-${randomUUID()}`);
    mkdirSync(workDir, { recursive: true });
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = resolve(workDir, ...relativePath.split('/'));
      const contained = `${absolutePath}/`.startsWith(`${workDir}/`);
      if (!contained) continue; // 防御：快照路径理论上已归一化，越界项直接跳过
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, content, 'utf-8');
    }
    return workDir;
  }

  /** LESS 真实编译门禁：与生成管线同源，输出带 file/line/column/snippet 的结构化诊断。 */
  private async runLessGate(
    workDir: string,
    files: Record<string, string>,
  ): Promise<QualityIssue[]> {
    if (!existsSync(workDir)) return [];
    try {
      const result = await LessCompileGate.validateDirectory(workDir);
      const mapped = (result?.diagnostics || []).map((item: any) => {
        const issue: QualityIssue = {
          id: String(item?.id || 'LESS-COMPILE-001'),
          severity: (item?.severity === 'BLOCK' ? 'BLOCK' : 'INFO') as QualitySeverity,
          sourceType: (item?.sourceType || 'shared-less') as QualityIssue['sourceType'],
          file: String(item?.file || '').replace(/\\/g, '/'),
          line: Number(item?.line) || 1,
          column: Number(item?.column) || 1,
          message: String(item?.message || ''),
          hint: this.pickLessHint(item),
          healApplied: item?.healApplied === true,
        };
        // extract 里可能有 null（less 的 error.extract 末尾补位），直接透传会让前端渲染出空行。
        const extract = Array.isArray(item?.extract)
          ? item.extract.filter((line: unknown) => typeof line === 'string')
          : [];
        if (extract.length > 0) issue.extract = extract as string[];
        // 门禁自带的 snippet 以「style 块」为行号基准（SFC 里 @import 在第 2 行），
        // 而 issue.line 是**整个文件**的行号（实测 AlertCards.vue 的 @import 在第 48 行）。
        // 两者不一致会让前端「跳到第 48 行、却高亮第 1 行」，必须统一到文件基准。
        issue.snippet = this.buildSourceSnippet(files[issue.file], issue.line)
          ?? (Array.isArray(item?.snippet) ? item.snippet : undefined);
        return issue;
      });
      return mapped;
    } catch (err: any) {
      // 门禁自身异常不能静默：返回一条 BLOCK，避免前端误判为「已通过」。
      return [{
        id: 'QUALITY-GATE-000',
        severity: 'BLOCK',
        sourceType: 'structure',
        file: '',
        line: 1,
        column: 1,
        message: `LESS 编译门禁执行异常：${err?.message || err}`,
      }];
    }
  }

  /**
   * 为 LESS 诊断补一条可执行的修复建议。
   * 门禁只报「无法加载 LESS 依赖：xxx」，不说明这通常是「被引用文件还没生成」
   * 而不是「这一行写错了」，用户据此无从下手。
   */
  private pickLessHint(item: any): { suggestion?: string } | undefined {
    if (item?.hint?.suggestion) return { suggestion: String(item.hint.suggestion) };
    const message = String(item?.message || '');
    const missingMatch = message.match(/无法加载 LESS 依赖：(.+)$/);
    if (missingMatch) {
      return {
        suggestion: `被引用的 ${missingMatch[1].trim()} 不存在于当前快照。它不是本文件的语法错误，而是共享样式文件缺失/尚未生成 —— 补齐该文件，或移除这条 @import。`,
      };
    }
    const varMatch = message.match(/variable @([\w-]+) is undefined/);
    if (varMatch) {
      return {
        suggestion: `变量 @${varMatch[1]} 未定义。若它来自主题变量文件，请在文件顶部补 @import './theme-vars.less';（按实际相对路径调整），不要直接删除变量引用。`,
      };
    }
    return undefined;
  }

  /**
   * 按「整个文件」的行号基准截取上下文片段（当前行 ±2）。
   *
   * 这是为前端「点击问题 → 跳到出错行 → 高亮该行」服务的：snippet 的行号必须与
   * issue.line 同一基准，否则会出现跳到 A 行却高亮 B 行的错位。
   * 源文件不存在（如 STRUCT-003 指向的缺失文件）时返回 null，由调用方决定兜底。
   */
  private buildSourceSnippet(
    content: string | undefined,
    line: number,
  ): QualityIssue['snippet'] | null {
    if (typeof content !== 'string' || !content) return null;
    const lines = content.split('\n');
    const target = Math.min(Math.max(Number(line) || 1, 1), lines.length);
    const from = Math.max(1, target - 2);
    const to = Math.min(lines.length, target + 2);
    const snippet: NonNullable<QualityIssue['snippet']> = [];
    for (let i = from; i <= to; i++) {
      snippet.push({ line: i, code: lines[i - 1] ?? '', current: i === target });
    }
    return snippet;
  }

  /** SFC 语义门禁：模板引用未声明、重复声明、TDZ、自由变量等。 */
  private runSfcSemantics(files: Record<string, string>): QualityIssue[] {
    const issues: QualityIssue[] = [];
    for (const [path, content] of Object.entries(files)) {
      if (!path.endsWith('.vue')) continue;
      if (Buffer.byteLength(content, 'utf-8') > TEXT_FILE_LIMIT) continue;
      try {
        const result = validateVueScriptSemantics(content, path, {
          requireScriptTag: path === 'package/index.vue',
          // 自由变量检测依赖管线传入的隐式声明清单（资源变量/子组件标签），
          // 离线校验拿不到这份清单，误报率极高，故跳过；该项由 LESS 门禁与真实预览兜底。
          skipFreeVariableCheck: true,
        });
        for (const raw of result?.issues || []) {
          const line = this.extractIssueLine(raw, content);
          issues.push({
            id: 'SFC-SEMANTIC-001',
            severity: 'BLOCK',
            sourceType: 'sfc-semantics',
            file: path,
            line,
            column: 1,
            message: String(raw).replace(/^[^:]*:\s*/, ''),
            snippet: this.buildSourceSnippet(content, line) ?? undefined,
          });
        }
      } catch (err: any) {
        issues.push({
          id: 'SFC-SEMANTIC-000',
          severity: 'WARN',
          sourceType: 'sfc-semantics',
          file: path,
          line: 1,
          column: 1,
          message: `SFC 语义校验异常：${err?.message || err}`,
        });
      }
    }
    return issues;
  }

  /**
   * 从 SFC 语义问题串里尽力提取行号。
   * sfc-semantics 目前只产出「path: 描述」文本，没有行列；这里对最常见的
   * 「重复声明 foo / 自由变量 bar」做一次源码符号定位，把用户精确带到出问题的行。
   */
  private extractIssueLine(rawIssue: string, content: string): number {
    const text = String(rawIssue || '');
    const symbolMatch =
      text.match(/（([^（）]+?)）/) ||
      text.match(/\(([^()]+?)\)/);
    const rawSymbols = symbolMatch ? symbolMatch[1] : '';
    const symbols = rawSymbols
      .split(/[、;；,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
    for (const symbol of symbols) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const re = new RegExp(`\\b${symbol.replace(/\$/g, '\\$')}\\b`);
        if (re.test(lines[i])) return i + 1;
      }
    }
    return 1;
  }

  /** 结构完整性：入口文件缺失比任何语法错误都更致命，必须单独成条。 */
  private runStructureCheck(
    manifest: TaskCodeSnapshotManifest,
    files: Record<string, string>,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const existing = new Set(Object.keys(files));
    if (!existing.has('package/index.vue')) {
      issues.push({
        id: 'STRUCT-001',
        severity: 'BLOCK',
        sourceType: 'structure',
        file: 'package/index.vue',
        line: 1,
        column: 1,
        message: '缺少组件入口文件 package/index.vue，预览无法渲染。',
        hint: { suggestion: '补齐入口文件，或在 Playground 中从子组件手动组装入口。' },
      });
    }
    if (manifest.target !== 'vue3' && !existing.has('declare.json')) {
      issues.push({
        id: 'STRUCT-002',
        severity: 'BLOCK',
        sourceType: 'structure',
        file: 'declare.json',
        line: 1,
        column: 1,
        message: '微码组件缺少 declare.json，无法在组件库注册。',
        hint: { suggestion: '补齐 declare.json（组件标识、名称、默认尺寸等声明）。' },
      });
    }
    issues.push(...this.findMissingStyleImports(files, existing));
    return issues;
  }

  /**
   * 共享样式入口缺失的根因定位。
   *
   * 现象（mc-max-1788086817483-4e4799ad 实锤）：快照里只有图片资源与 .vue，
   * 完全没有 resources/styles/ 目录，但每个 .vue 都写了
   * `@import '../../resources/styles/index.less'`。LESS 门禁只能在**每个引用它的文件上**
   * 各报一条「无法加载 LESS 依赖」，前端因此显示「4 个文件存在问题」——
   * 四条其实是同一个根因。这里把它收敛成一条指向缺失文件本身的问题，
   * 让用户一眼看到「缺的是 resources/styles/index.less」，而不是四个互不相干的文件报错。
   */
  private findMissingStyleImports(
    files: Record<string, string>,
    existing: Set<string>,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const missingTargets = new Map<string, Set<string>>();
    const importRe = /@import\s+(?:\([^)]*\)\s*)?['"]([^'"]+)['"]/g;

    for (const [path, content] of Object.entries(files)) {
      if (!path.endsWith('.vue') && !path.endsWith('.less')) continue;
      if (Buffer.byteLength(content, 'utf-8') > TEXT_FILE_LIMIT) continue;
      let match: RegExpExecArray | null;
      importRe.lastIndex = 0;
      while ((match = importRe.exec(content)) !== null) {
        const spec = match[1];
        if (!/\.(less|css)$/i.test(spec)) continue;
        const target = posixNormalize(posixJoin(posixDirname(path), spec));
        if (existing.has(target)) continue;
        if (!missingTargets.has(target)) missingTargets.set(target, new Set());
        missingTargets.get(target)!.add(path);
      }
    }

    for (const [target, referrers] of missingTargets) {
      issues.push({
        id: 'STRUCT-003',
        severity: 'BLOCK',
        sourceType: 'structure',
        file: target,
        line: 1,
        column: 1,
        message: `缺少被引用的样式文件：${referrers.size} 个文件 @import 了它，但快照中不存在。`,
        hint: {
          suggestion: `补齐 ${target}（共享样式入口），或移除 ${[...referrers].slice(0, 3).join('、')} 中的对应 @import。`,
        },
      });
    }
    return issues;
  }

  /**
   * 把「同一个缺失文件引发的 N 条重复报错」收敛为 1 条根因 + N 条受影响提示。
   *
   * 不做这步的话，mc-max-1788086817483-4e4799ad 会在 4 个 .vue 上各报一条
   * 「无法加载 LESS 依赖」，加上根因就是 5 个 BLOCK —— 用户看到的是"5 个文件都有问题"，
   * 实际只缺 1 个文件。收敛后：1 个 BLOCK（根因，指向缺失文件本身）+ 4 个 WARN（受影响文件）。
   */
  private collapseMissingImportDuplicates(issues: QualityIssue[]): void {
    const missingTargets = new Set(
      issues.filter((issue) => issue.id === 'STRUCT-003').map((issue) => issue.file),
    );
    if (missingTargets.size === 0) return;
    for (const issue of issues) {
      if (issue.id !== 'LESS-COMPILE-001') continue;
      const spec = String(issue.message || '').match(/无法加载 LESS 依赖：(.+)$/)?.[1]?.trim();
      if (!spec) continue;
      const resolved = posixNormalize(posixJoin(posixDirname(issue.file), spec));
      if (!missingTargets.has(resolved)) continue;
      issue.severity = 'WARN';
      issue.message = `${issue.message}（根因：共享样式文件 ${resolved} 缺失，见 STRUCT-003）`;
    }
  }

  private deriveValidation(
    issues: QualityIssue[],
    sourceTypes: QualityIssue['sourceType'][],
  ): TaskCodeSnapshotValidation[keyof TaskCodeSnapshotValidation] {
    const matched = issues.filter((issue) => sourceTypes.includes(issue.sourceType));
    if (matched.length === 0) return 'passed';
    if (matched.some((issue) => issue.severity === 'BLOCK')) return 'blocked';
    return 'warning';
  }
}
