import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { resolveComponentDirStrict } from '../ai-engine/utils/component-resolver.js';

/** 自定义 skill 标识：小写字母/数字开头，允许 - 与 _（防目录穿越与大小写歧义） */
const SKILL_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** 上传 zip 大小上限（multer 层也限制，这里再兜一层） */
const MAX_ZIP_BYTES = 10 * 1024 * 1024;
/** 条目数上限（防极端碎片化 zip） */
const MAX_ZIP_ENTRIES = 500;
/** 解压后总大小上限（防 zip bomb） */
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
/** 解压后单文件大小上限 */
const MAX_SINGLE_FILE_BYTES = 8 * 1024 * 1024;

export interface McSpecSkillMeta {
  id: string;
  name: string;
  builtin: boolean;
  available: boolean;
  /** SKILL.md frontmatter 中的 description（可选） */
  description?: string;
  /** SKILL.md frontmatter 中的 version（可选） */
  version?: string;
  /** 自定义 skill 的安装时间（ISO，可选） */
  uploadedAt?: string;
}

export interface McSpecItem {
  id: string;
  name: string;
  level: string;
  passed: boolean;
  message: string;
}

export interface McSpecCheckResult {
  specVersion: string;
  checkedAt: string;
  componentId: string;
  dirName: string;
  passCount: number;
  failCount: number;
  warningCount: number;
  canRelease: boolean;
  items: McSpecItem[];
  errors: McSpecItem[];
  warnings: McSpecItem[];
  reportUrl?: string;
  skillId: string;
}

/**
 * 微码组件规范检查执行器（2026-09-10）
 *
 * 设计要点：
 * - 调用外部 skill 的 `scripts/mc-check.cjs`（当前内置 `frontend-mc-check` v1.0.20）；
 * - 使用 `--component-path` 单组件模式：该模式下脚本直接用给定路径，
 *   不依赖 `ROOT` 推导，因此 skill 可以放在任意位置（无需复制到项目 aidocs/skills 下）；
 * - 同步执行（单组件约 1s），带 60s 超时与输出上限，失败返回明确错误。
 */
@Injectable()
export class McSpecService {
  private readonly logger = new Logger('McSpecService');

  /** 内置 skill（随代码发布，位于 backend-node/skills/）——可用 MC_SPEC_BUILTIN_SKILLS_DIR 覆盖 */
  private readonly builtinSkillsDir = process.env.MC_SPEC_BUILTIN_SKILLS_DIR
    ? path.resolve(process.env.MC_SPEC_BUILTIN_SKILLS_DIR)
    : path.resolve(__dirname, '../../skills');
  /** 用户上传 skill（backend-node/data/skills/）——可用 MC_SPEC_USER_SKILLS_DIR 覆盖 */
  private readonly userSkillsDir = process.env.MC_SPEC_USER_SKILLS_DIR
    ? path.resolve(process.env.MC_SPEC_USER_SKILLS_DIR)
    : path.resolve(__dirname, '../../data/skills');
  /** 检查报告输出根目录——可用 MC_SPEC_REPORTS_DIR 覆盖 */
  private readonly reportsDir = process.env.MC_SPEC_REPORTS_DIR
    ? path.resolve(process.env.MC_SPEC_REPORTS_DIR)
    : path.resolve(__dirname, '../../data/mc-spec-reports');

  /** 约定：所有 skill 的入口都必须是 scripts/mc-check.cjs */
  private static readonly ENTRY_REL = path.join('scripts', 'mc-check.cjs');

  private entryOf(skillDir: string): string {
    return path.join(skillDir, McSpecService.ENTRY_REL);
  }

  /** 解析 skill 目录；未指定 skillId 时用内置默认 frontend-mc-check */
  private resolveSkillDir(skillId?: string): { skillId: string; dir: string; entry: string } {
    const id = String(skillId || '').trim();
    if (!id || id === 'frontend-mc-check') {
      const dir = path.join(this.builtinSkillsDir, 'frontend-mc-check');
      return { skillId: 'frontend-mc-check', dir, entry: this.entryOf(dir) };
    }
    // 自定义 skill（data/skills/<skillId>/，P2 上传后启用）
    const dir = path.join(this.userSkillsDir, id);
    return { skillId: id, dir, entry: this.entryOf(dir) };
  }

  /** 可用 skill 列表（内置 + 已注册的自定义） */
  listSkills(): McSpecSkillMeta[] {
    const out: McSpecSkillMeta[] = [];
    const builtin = this.resolveSkillDir('frontend-mc-check');
    out.push({
      id: 'frontend-mc-check',
      name: '微码组件规范检查（内置）',
      builtin: true,
      available: fs.existsSync(builtin.entry),
      ...this.readSkillMeta(builtin.dir),
    });
    try {
      if (fs.existsSync(this.userSkillsDir)) {
        for (const name of fs.readdirSync(this.userSkillsDir)) {
          // 跳过安装中间态目录（.tmp-* / .trash-*）
          if (!SKILL_ID_RE.test(name)) continue;
          const dir = path.join(this.userSkillsDir, name);
          if (!fs.statSync(dir).isDirectory()) continue;
          out.push({
            id: name,
            name,
            builtin: false,
            available: fs.existsSync(this.entryOf(dir)),
            ...this.readSkillMeta(dir),
            ...this.readInstalledAt(dir),
          });
        }
      }
    } catch (e: any) {
      this.logger.warn(`读取自定义 skill 目录失败: ${e?.message || e}`);
    }
    return out;
  }

  /**
   * 读取 SKILL.md frontmatter 里的 name / description / version（轻量解析，失败返回 {}）。
   * 只读前 40 行，避免大文件开销。
   */
  private readSkillMeta(dir: string): { name?: string; description?: string; version?: string } {
    try {
      const md = path.join(dir, 'SKILL.md');
      if (!fs.existsSync(md)) return {};
      const head = fs.readFileSync(md, 'utf-8').split(/\r?\n/).slice(0, 40);
      const out: any = {};
      if (!/^---\s*$/.test(String(head[0] || ''))) return {};
      for (const line of head.slice(1)) {
        if (/^---\s*$/.test(line)) break;
        const m = /^(name|description|version)\s*:\s*(.+)$/.exec(line.trim());
        if (!m) continue;
        const value = m[2].trim().replace(/^["']|["']$/g, '');
        if (value) out[m[1]] = value;
      }
      return out;
    } catch {
      return {};
    }
  }

  /** 自定义 skill 的安装时间（用目录 mtime，避免额外落一个元数据文件） */
  private readInstalledAt(dir: string): { uploadedAt?: string } {
    try {
      return { uploadedAt: new Date(fs.statSync(dir).mtimeMs).toISOString() };
    } catch {
      return {};
    }
  }

  /**
   * 校验 zip 内单条目的路径安全（防 zip-slip / 绝对路径 / 盘符 / 空字节）。
   * @returns 归一化后的相对路径段数组；不安全返回 null
   */
  private safeEntryParts(rawName: string): string[] | null {
    const raw = String(rawName || '');
    if (!raw || raw.includes('\0')) return null;
    // 反斜杠统一按分隔符处理（部分工具打出的 zip 用 \）
    const normalized = raw.replace(/\\/g, '/');
    if (normalized.startsWith('/')) return null; // 绝对路径
    if (/^[a-zA-Z]:/.test(normalized)) return null; // Windows 盘符
    const parts = normalized.split('/').filter((p) => p !== '' && p !== '.');
    if (!parts.length) return null;
    if (parts.includes('..')) return null; // 上跳
    return parts;
  }

  /**
   * 安装自定义规范检查 skill（管理员上传 zip）。
   *
   * 安全约束：
   * - 条目路径逐条校验（zip-slip / 绝对路径 / 盘符 / `..` / 空字节），拒绝符号链接；
   * - 条目数、单文件大小、解压总量三重上限（防 zip bomb）；
   * - skillId 白名单正则，且**只能落在 data/skills 之下**；
   * - 先解到 `.tmp-<随机>` 目录校验入口文件，再原子 rename 落位，失败不留半成品。
   *
   * @param buffer zip 二进制
   * @param opts.skillId 期望的 skill id（留空则取 zip 顶层目录名 / 文件名）
   * @param opts.overwrite 目标已存在时是否覆盖
   * @param opts.fileName 原始文件名（用于兜底推导 id）
   */
  async installSkillFromZip(
    buffer: Buffer,
    opts: { skillId?: string; overwrite?: boolean; fileName?: string } = {},
  ): Promise<McSpecSkillMeta> {
    if (!buffer || !buffer.length) throw new BadRequestException('上传内容为空');
    if (buffer.length > MAX_ZIP_BYTES) {
      throw new BadRequestException(`zip 过大（${buffer.length} 字节，上限 ${MAX_ZIP_BYTES}）`);
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch (e: any) {
      throw new BadRequestException(`zip 解析失败: ${e?.message || e}`);
    }

    const entries = zip.getEntries();
    if (!entries.length) throw new BadRequestException('zip 内没有任何文件');
    if (entries.length > MAX_ZIP_ENTRIES) {
      throw new BadRequestException(`zip 条目过多（${entries.length}，上限 ${MAX_ZIP_ENTRIES}）`);
    }

    // ── 逐条校验 + 计算解压总量 ──
    const files: Array<{ parts: string[]; entry: AdmZip.IZipEntry }> = [];
    let totalBytes = 0;
    for (const entry of entries) {
      // 符号链接：S_IFLNK（高 16 位 0o120000）—— 可指向包外，直接拒绝
      const mode = (entry.header.attr >>> 16) & 0o170000;
      if (mode === 0o120000) {
        throw new BadRequestException(`zip 内含符号链接，已拒绝：${entry.entryName}`);
      }
      const parts = this.safeEntryParts(entry.entryName);
      if (!parts) {
        throw new BadRequestException(`zip 内含不安全路径，已拒绝：${entry.entryName}`);
      }
      if (entry.isDirectory) continue;
      const size = entry.header.size || 0;
      if (size > MAX_SINGLE_FILE_BYTES) {
        throw new BadRequestException(`单文件过大：${entry.entryName}（${size} 字节）`);
      }
      totalBytes += size;
      if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new BadRequestException(`解压后总大小超限（上限 ${MAX_UNCOMPRESSED_BYTES} 字节）`);
      }
      files.push({ parts, entry });
    }
    if (!files.length) throw new BadRequestException('zip 内没有任何文件');

    // ── 统一剥离顶层目录（支持「把 skill 目录打包成 zip」，也支持直接打包目录内容）──
    const firstSeg = files[0].parts[0];
    const allUnderSameRoot = files.every((f) => f.parts.length > 1 && f.parts[0] === firstSeg);
    const stripTop = allUnderSameRoot;

    // ── 推导 skillId ──
    const fromZipRoot = stripTop ? firstSeg : '';
    const fromFileName = String(opts.fileName || '').replace(/\.zip$/i, '');
    const candidateId = String(opts.skillId || fromZipRoot || fromFileName || '').trim().toLowerCase();
    if (!SKILL_ID_RE.test(candidateId)) {
      throw new BadRequestException(
        `无法确定合法的 skill 标识「${candidateId || '(空)'}」：只允许小写字母/数字/-/_，需以字母或数字开头`,
      );
    }

    const targetDir = path.join(this.userSkillsDir, candidateId);
    // 双保险：拼接后必须仍在 userSkillsDir 之内
    if (!path.resolve(targetDir).startsWith(path.resolve(this.userSkillsDir) + path.sep)) {
      throw new BadRequestException('非法的 skill 目录');
    }
    const existed = fs.existsSync(targetDir);
    if (existed && !opts.overwrite) {
      throw new ConflictException(`skill「${candidateId}」已存在，如需覆盖请勾选覆盖`);
    }

    // ── 解压到临时目录（先校验再落位）──
    fs.mkdirSync(this.userSkillsDir, { recursive: true });
    const tmpDir = path.join(this.userSkillsDir, `.tmp-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      for (const f of files) {
        const rel = f.parts.slice(stripTop ? 1 : 0);
        if (!rel.length) continue;
        const dest = path.join(tmpDir, ...rel);
        // 每个文件写盘前再确认目标在 tmpDir 内
        if (!path.resolve(dest).startsWith(path.resolve(tmpDir) + path.sep)) {
          throw new BadRequestException(`条目路径越界：${f.entry.entryName}`);
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, f.entry.getData());
      }

      // 约定入口校验：没有 scripts/mc-check.cjs 的包对检查器无用，直接拒绝
      const entryRel = path.join('scripts', 'mc-check.cjs');
      if (!fs.existsSync(path.join(tmpDir, entryRel))) {
        throw new BadRequestException(
          `skill 包缺少约定入口 ${path.join('scripts', 'mc-check.cjs')}，无法作为规范检查 skill 使用`,
        );
      }

      // 原子落位：旧目录先挪走，避免「删到一半失败」造成 skill 丢失
      if (existed) {
        const trashDir = path.join(this.userSkillsDir, `.trash-${crypto.randomBytes(6).toString('hex')}`);
        fs.renameSync(targetDir, trashDir);
        fs.rmSync(trashDir, { recursive: true, force: true });
      }
      fs.renameSync(tmpDir, targetDir);
    } catch (e) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw e;
    }

    this.logger.log(
      `自定义 skill 已安装: ${candidateId}（${files.length} 个文件，${totalBytes} 字节，覆盖=${existed}）`,
    );

    return {
      id: candidateId,
      name: candidateId,
      builtin: false,
      available: fs.existsSync(this.entryOf(targetDir)),
      ...this.readSkillMeta(targetDir),
      ...this.readInstalledAt(targetDir),
    };
  }

  /** 卸载自定义 skill（内置不可删） */
  removeSkill(skillId: string): { removed: boolean; skillId: string } {
    const id = String(skillId || '').trim().toLowerCase();
    if (!SKILL_ID_RE.test(id)) {
      throw new BadRequestException(`非法的 skill 标识：${skillId}`);
    }
    if (id === 'frontend-mc-check') {
      throw new BadRequestException('内置 skill 不可删除');
    }
    const dir = path.join(this.userSkillsDir, id);
    if (!path.resolve(dir).startsWith(path.resolve(this.userSkillsDir) + path.sep)) {
      throw new BadRequestException('非法的 skill 目录');
    }
    if (!fs.existsSync(dir)) {
      throw new NotFoundException(`skill 不存在：${id}`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    this.logger.log(`自定义 skill 已卸载: ${id}`);
    return { removed: true, skillId: id };
  }


  /** 对单个组件执行规范检查 */
  async checkComponent(componentId: string, skillId?: string): Promise<McSpecCheckResult> {
    const id = String(componentId || '').trim();
    if (!id) throw new BadRequestException('缺少 componentId');

    // 与 Playground AI 修改器（playground-tools）共用同一套解析，
    // 确保「检查的目录」与「AI 修复写入的目录」是同一个，避免修完重查仍失败。
    const componentDir = await resolveComponentDirStrict(id);
    if (!componentDir) {
      throw new NotFoundException(
        `未找到该组件的产物目录: ${id}（未找到含 package/index.vue 的候选目录）`,
      );
    }
    if (!fs.existsSync(path.join(componentDir, 'package', 'index.vue'))) {
      throw new NotFoundException(
        `组件产物不完整: ${componentDir} 缺少 package/index.vue（规范检查无法进行）`,
      );
    }

    const skill = this.resolveSkillDir(skillId);
    if (!fs.existsSync(skill.entry)) {
      throw new BadRequestException(
        `规范检查 skill 入口不存在: ${skill.entry}（约定入口为 scripts/mc-check.cjs）`,
      );
    }

    const outDir = path.join(this.reportsDir, id);
    fs.mkdirSync(outDir, { recursive: true });

    this.logger.log(`规范检查: component=${id} skill=${skill.skillId}`);
    const started = Date.now();
    const ret = spawnSync(
      process.execPath,
      [skill.entry, '--component-path', componentDir, '--output-dir', outDir],
      { timeout: 60_000, encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );
    const costMs = Date.now() - started;

    if (ret.error) {
      throw new BadRequestException(`规范检查执行失败: ${ret.error.message}`);
    }
    if (ret.status !== 0) {
      const tail = String(ret.stderr || ret.stdout || '').slice(-500);
      this.logger.error(`规范检查脚本异常退出 status=${ret.status}: ${tail}`);
      throw new BadRequestException(`规范检查脚本执行失败（status=${ret.status}）: ${tail}`);
    }

    // 脚本输出落在 <outDir>/<YYYY-MM-DD_HH-mm>/check-result.json，取最新一次
    const stamped = fs
      .readdirSync(outDir)
      .filter((n) => fs.statSync(path.join(outDir, n)).isDirectory())
      .sort();
    if (!stamped.length) {
      throw new BadRequestException('规范检查未产出报告目录');
    }
    const resultPath = path.join(outDir, stamped[stamped.length - 1], 'check-result.json');
    if (!fs.existsSync(resultPath)) {
      throw new BadRequestException(`检查结果文件缺失: ${resultPath}`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    } catch (e: any) {
      throw new BadRequestException(`检查结果解析失败: ${e?.message || e}`);
    }

    const comp = (parsed?.components || [])[0] || {};
    const rawItems: any[] = Array.isArray(comp.results) ? comp.results : [];
    const items: McSpecItem[] = rawItems.map((r: any) => ({
      id: String(r?.id || ''),
      name: String(r?.name || ''),
      level: String(r?.level || (r?.passed ? 'pass' : 'error')),
      passed: r?.passed !== false,
      message: String(r?.message || ''),
    }));

    this.logger.log(
      `规范检查完成: ${id} canRelease=${!!comp.canRelease} 通过=${comp.passCount ?? 0} 失败=${comp.failCount ?? 0} 耗时=${costMs}ms`,
    );

    return {
      specVersion: String(parsed?.specVersion || ''),
      checkedAt: String(parsed?.checkedAt || new Date().toISOString()),
      componentId: id,
      dirName: String(comp.dirName || id),
      passCount: Number(comp.passCount ?? items.filter((i) => i.passed).length),
      failCount: Number(comp.failCount ?? items.filter((i) => !i.passed && i.level === 'error').length),
      warningCount: Number(
        comp.warningCount ?? items.filter((i) => !i.passed && i.level === 'warning').length,
      ),
      canRelease: comp.canRelease !== false,
      items,
      errors: items.filter((i) => !i.passed && i.level !== 'warning'),
      warnings: items.filter((i) => !i.passed && i.level === 'warning'),
      reportUrl: `/api/mc-spec/report/${encodeURIComponent(id)}/${encodeURIComponent(stamped[stamped.length - 1])}`,
      skillId: skill.skillId,
    };
  }

  /** 返回报告 HTML 绝对路径（不存在则返回 null） */
  resolveReportPath(componentId: string, stamp: string): string | null {
    // 仅允许 [0-9_\-] 字符，防目录穿越
    if (!/^[\w-]+$/.test(componentId) || !/^[\d_-]+$/.test(stamp)) return null;
    const p = path.join(this.reportsDir, componentId, stamp, 'mc-report.html');
    return fs.existsSync(p) ? p : null;
  }
}
