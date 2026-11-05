/* ============================================================================
 * project-pipeline.service.ts — 项目级管线 M1（S0 扫描 + S2 契约冻结）
 * ----------------------------------------------------------------------------
 * 定位：与 ai-engine-v2（组件级、可配管线）**并列**的项目级管线。
 *      仅注册 dev（AppModule 里 `...(isV3ProjectExposed() ? [Module] : [])`）。
 *
 * 阶段与真值来源：
 *   S0 归一/扫描 —— 调用 scanner/s0-scan.js（零依赖、只读输入目录），
 *                    产物 = spec/{project.manifest.json,endpoints.json,conflicts.md}
 *                           + doc/{REQUIREMENTS,FRONTEND-DESIGN,BACKEND-DESIGN}.draft.md
 *   S1 对齐      —— 扫描器内完成（四源交叉），本服务只读结论，不重算
 *   S2 冻结      —— stages/s2-contract-freezer.ts 确定性生成
 *                    spec/openapi.local.yaml + doc/REQUIREMENTS.md + spec/freeze-report.json
 *
 * 🔴 产物落点：`backend-node/data/project-runs/<runId>/`
 *    刻意**不写进用户项目目录** —— 样本/用户目录默认只读（硬约束），
 *    扫描器的「只读自证」也以此为前提。要写回项目目录属于另一次授权。
 *
 * 🔴 人裁决留痕 `spec/decisions.md` 只由本服务 append，永不覆盖；
 *    扫描器只读它的存在性，冻结器只做交叉引用。
 * ==========================================================================*/

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
const { ZipArchive } = require('archiver');
import { buildOpenApi, freezeRequirements } from './stages/s2-contract-freezer';
import type { DecisionRecord } from './stages/s2-contract-freezer';
import { buildCodeGen } from './stages/s3-codegen';
import { buildVueGen, verifyVueGen, readApiModules } from './stages/s4-vuegen';
import { AiConfigService } from '../../config/config.service';

// 扫描器与 src 同构放置，nest-cli 的 assets 规则（**/*.js）会把它拷进 dist
const SCANNER_PATH = path.resolve(__dirname, 'scanner/s0-scan.js');
/** 已验证引擎的 md5 —— 篡改即自检红，防止「本地改好了线上还是旧的」 */
const SCANNER_MD5 = '52b7788b33e800c3d1a19b291c6b8e9d';

// 「建议新增接口」位置定位：接口动作 → 关联原型页 UI 区域类型（L1 确定性 DOM 定位）
const ACTION_LABEL: Record<string, string> = {
  list: '查询/列表',
  create: '新增/创建',
  detail: '详情/编辑',
  update: '更新',
  delete: '删除',
  other: '其他',
};
const ACTION_REGION_MAP: Record<string, string[]> = {
  list: ['table', 'list'],
  detail: ['detailLink', 'link'],
  create: ['createButton', 'button', 'form'],
  update: ['detailLink', 'link', 'form'],
  delete: ['createButton', 'button', 'link'],
  other: ['table', 'list', 'createButton', 'button', 'detailLink', 'link', 'form'],
};

/** 运行根：dist/ai-engine-v3/project → ../../../data（与 src 同构，两态都成立） */
const RUNS_ROOT = process.env.PROJECT_RUNS_ROOT
  ? path.resolve(process.env.PROJECT_RUNS_ROOT)
  : path.resolve(__dirname, '../../../data/project-runs');

const RUN_ID_RX = /^pj-\d{8}-\d{6}-[a-f0-9]{6}$/;
const SCAN_TIMEOUT_MS = 180_000;
const STDOUT_CAP = 1_000_000;

/* ── 原型截图硬预算 ────────────────────────────────────────────────────────
 * 🔴 每一项都必须有显式上界：任何一项超时都走「降级为无截图」，
 *    **绝不**抛到接口、**绝不**让请求无限 pending（原实现 screenshot 无 timeout
 *    + browser.close() 只 `.catch` 接 reject，接不住「挂起不返回」⇒ 可 ∞）。 */
/** puppeteer.launch 上限（原实现未设 ⇒ 可挂起） */
const SHOT_LAUNCH_TIMEOUT_MS = 15_000;
/** 单页 goto 上限（原 20s 每页固定吃满，本地 file:// 页 load 通常 < 300ms） */
const SHOT_GOTO_TIMEOUT_MS = 8_000;
/** 单页 screenshot 上限（原实现**没有** timeout） */
const SHOT_SCREENSHOT_TIMEOUT_MS = 8_000;
/** browser.close() 上限（超时后 SIGKILL 兜底） */
const SHOT_CLOSE_TIMEOUT_MS = 3_000;
/** 单次 captureShots 总预算：到点即停，用已完成的部分 */
const SHOT_TOTAL_BUDGET_MS = 20_000;
/** 「内容就绪」判定的最大等待（代替原硬编码 600ms 盲等） */
const SHOT_READY_TIMEOUT_MS = 1_500;
/** 图表入场动画「收敛」判定的最大等待（echarts 默认入场动画 ~1s，就绪判定管不到） */
const SHOT_SETTLE_TIMEOUT_MS = 1_500;

/**
 * 单次 buildFeatureDetails 调用内的按页访问器（**局部缓存，不跨请求**）。
 * 同一原型页被多个 feature 命中时，读文件 / toLowerCase / JSDOM 解析各只做一次。
 */
type PageAccessor = {
  /** 整页原文（读不到 → ''，与改造前 fs.readFileSync 的 catch 语义一致） */
  text: (rel: string) => string;
  /** 整页原文小写（缓存，避免每 feature 重复整页 toLowerCase） */
  lower: (rel: string) => string;
  /** 该页抽出的 UI 区域（缓存，避免每 feature 重复 `new JSDOM`） */
  regions: (rel: string) => any[];
};

/** 系统目录对话框的等待上限（用户可能慢慢翻文件夹） */
const PICK_TIMEOUT_MS = 300_000;
/** 内置目录浏览器单层最多返回多少个子目录 */
const BROWSE_MAX_ENTRIES = 500;
/** 内置浏览器默认折叠的噪音目录（仍可手动改路径进入） */
const BROWSE_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.venv',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
]);

/** 允许通过接口读取的产物（白名单，杜绝任意路径读取） */
const ARTIFACT_WHITELIST = [
  'spec/project.manifest.json',
  'spec/endpoints.json',
  'spec/conflicts.md',
  'spec/decisions.md',
  'spec/freeze-report.json',
  'spec/openapi.local.yaml',
  'doc/REQUIREMENTS.draft.md',
  'doc/FRONTEND-DESIGN.draft.md',
  'doc/BACKEND-DESIGN.draft.md',
  'doc/REQUIREMENTS.md',
  'spec/feature-details.json',
  'generated/**',
  'spec/shots/**',
];

export interface DecisionEntry {
  conflictId: string;
  choice: string;
  note?: string;
}

@Injectable()
export class ProjectPipelineService {
  private readonly logger = new Logger(ProjectPipelineService.name);

  /** 按需截图去重：同一 run+页的并发 GET 只截一次（task 完成即删，不跨请求缓存） */
  private readonly shotInflight = new Map<string, Promise<boolean>>();

  constructor(private readonly aiConfig: AiConfigService) {}

  /* ------------------------------------------------------------ health --- */

  health() {
    const scannerExists = fs.existsSync(SCANNER_PATH);
    let scannerMd5: string | null = null;
    if (scannerExists) {
      scannerMd5 = crypto
        .createHash('md5')
        .update(fs.readFileSync(SCANNER_PATH))
        .digest('hex');
    }
    let runsRootWritable = false;
    let runsRootError: string | null = null;
    let probeCleanupError: string | null = null;
    try {
      fs.mkdirSync(RUNS_ROOT, { recursive: true });
      // 🔴 写探针的判据是「能不能落文件 + 读回来一模一样」，
      //    刻意**不**把 `unlink` 当可写判据 —— 删除是破坏性操作，在受限环境
      //    （沙箱态继承启动的进程 / 带 safe-delete 守卫的环境）里会被拦成
      //    EPERM，而本服务真正的写路径（S0 写 spec+doc、S2 写契约、裁决 append）
      //    **从不删文件**（全模块仅此处一处 unlink）。拿它判红 = 「引擎异常」假警报。
      //    清理失败只回报，不影响 ok。
      const probe = path.join(RUNS_ROOT, '.write-probe');
      const stamp = `${process.pid}:${Date.now()}`;
      fs.writeFileSync(probe, stamp);
      const back = fs.readFileSync(probe, 'utf8');
      if (back !== stamp) throw new Error('写回读不一致（目录不可写或磁盘异常）');
      runsRootWritable = true;
      try {
        fs.unlinkSync(probe);
      } catch (e: any) {
        probeCleanupError = e.message;
      }
    } catch (e: any) {
      runsRootError = e.message;
    }
    return {
      engine: 'ai-engine-v3/project',
      milestone: 'M1（S0 扫描 + S2 契约冻结）',
      node: process.execPath,
      runsRoot: RUNS_ROOT,
      scanner: {
        path: SCANNER_PATH,
        exists: scannerExists,
        md5: scannerMd5,
        expectedMd5: SCANNER_MD5,
        md5Match: scannerMd5 === SCANNER_MD5,
      },
      runsRootWritable,
      runsRootError,
      probeCleanupError,
      ok: scannerExists && scannerMd5 === SCANNER_MD5 && runsRootWritable,
      note: '扫描器与 outputs/s0-scan.cjs 逐字节一致（md5 相同）；不一致说明引擎被改过，需重新验证。',
    };
  }

  /* ----------------------------------------------------------- inspect --- */

  /**
   * 目录体检（**不做坑位判定**）。
   *
   * 坑位（docs/html/frontend/backend/git/声明层）的认定只有 S0 扫描器一处实现，
   * 这里再算一遍就是第二真值。故本方法只回答「这个路径能不能被读」。
   */
  inspect(projectDir: string) {
    const raw = String(projectDir ?? '').trim();
    if (!raw) throw new BadRequestException('projectDir 不能为空');
    if (!path.isAbsolute(raw)) {
      throw new BadRequestException(
        `必须传绝对路径（当前收到 "${raw}"）。后端按本机文件系统读取，` +
          '相对路径会落到服务进程的 cwd 上，不可控。',
      );
    }
    const resolved = path.resolve(raw);
    const exists = fs.existsSync(resolved);
    const isDirectory = exists && fs.statSync(resolved).isDirectory();

    if (!exists) {
      return {
        projectDir: raw,
        resolvedPath: resolved,
        exists: false,
        isDirectory: false,
        readable: false,
        totalFiles: 0,
        totalBytes: 0,
        topLevel: [],
        byExt: [],
        hint: '路径不存在。请确认填的是**运行后端那台机器**上的绝对路径。',
      };
    }
    if (!isDirectory) {
      return {
        projectDir: raw,
        resolvedPath: resolved,
        exists: true,
        isDirectory: false,
        readable: false,
        totalFiles: 0,
        totalBytes: 0,
        topLevel: [],
        byExt: [],
        hint: '这是一个文件而不是目录。请填项目根目录。',
      };
    }

    let readable = true;
    let readError: string | null = null;
    try {
      fs.readdirSync(resolved);
    } catch (e: any) {
      readable = false;
      readError = e.message;
    }

    const topLevel = readable
      ? fs
          .readdirSync(resolved, { withFileTypes: true })
          .slice(0, 200)
          .map((d) => {
            const full = path.join(resolved, d.name);
            let size = 0;
            let childCount = 0;
            try {
              if (d.isDirectory()) childCount = fs.readdirSync(full).length;
              else size = fs.statSync(full).size;
            } catch {
              /* 权限不足的条目按 0 计，不阻断体检 */
            }
            return {
              name: d.name,
              type: d.isDirectory() ? 'dir' : 'file',
              size,
              childCount,
            };
          })
      : [];

    // 浅层统计（深度 ≤ 3，跳过重目录），只用于给人一个体量印象
    const byExtMap = new Map<string, { count: number; bytes: number }>();
    let totalFiles = 0;
    let totalBytes = 0;
    const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '.DS_Store']);
    const walk = (dir: string, depth: number) => {
      if (depth > 3 || totalFiles > 20000) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const d of entries) {
        if (SKIP.has(d.name)) continue;
        const full = path.join(dir, d.name);
        if (d.isDirectory()) {
          walk(full, depth + 1);
        } else {
          totalFiles++;
          let size = 0;
          try {
            size = fs.statSync(full).size;
          } catch {
            /* ignore */
          }
          totalBytes += size;
          const ext = (path.extname(d.name) || '(无扩展名)').toLowerCase();
          const cur = byExtMap.get(ext) ?? { count: 0, bytes: 0 };
          cur.count++;
          cur.bytes += size;
          byExtMap.set(ext, cur);
        }
      }
    };
    if (readable) walk(resolved, 1);

    const byExt = [...byExtMap.entries()]
      .map(([ext, v]) => ({ ext, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      projectDir: raw,
      resolvedPath: resolved,
      exists: true,
      isDirectory: true,
      readable,
      readError,
      totalFiles,
      totalBytes,
      topLevel,
      byExt,
      hint: readable
        ? '体量统计深度 ≤ 3 且跳过 .git / node_modules / dist，仅作印象用；坑位识别请跑 S0。'
        : '目录不可读（权限问题），S0 扫描同样会失败。',
    };
  }

  /* ---------------------------------------------- pick-dir / browse-dir --- */

  /**
   * 拉起**操作系统原生**的「选择文件夹」对话框，把用户点选的绝对路径回传。
   *
   * 为什么必须放在后端（不是「顺手用浏览器 API」）：
   *   · 浏览器拿不到本机绝对路径 —— File System Access API 只给句柄不给路径，
   *     而 S0 扫描器是按**路径**读盘的；
   *   · 本地 dev 场景下后端与用户在同一台机器上，由后端进程拉起系统对话框，
   *     是唯一能真正「在电脑里点文件夹」的实现。
   *
   * 调用方必须把「用户取消」当正常结果，不当异常：
   *   { ok: true,  path, platform }                        ← 选好了
   *   { ok: false, cancelled: true, platform }             ← 用户点了取消
   *   { ok: false, unsupported: true, platform, reason }    ← 该平台没有可用对话框
   *   { ok: false, timedOut: true, platform, reason }       ← 超时（对话框被切后台/权限弹窗拦下）
   *   { ok: false, platform, reason }                       ← 其它失败（stderr 原文）
   * 任何非 ok 都**不是**服务端错误 —— 前端据此退回内置目录浏览器。
   */
  async pickDirectory(defaultDir?: string): Promise<Record<string, any>> {
    const platform = process.platform;
    const start = this.pickStartDir(defaultDir);

    let cmd: string;
    let args: string[];
    if (platform === 'darwin') {
      // AppleScript 字符串用 " 包裹，\" 与 \\ 转义 —— 与 JSON.stringify 同一套规则
      const prompt = '选择项目目录（后端会按此路径只读扫描）';
      const loc = start ? ` default location (POSIX file ${JSON.stringify(start)})` : '';
      cmd = 'osascript';
      args = ['-e', `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)}${loc})`];
    } else if (platform === 'win32') {
      cmd = 'powershell.exe';
      args = [
        '-NoProfile',
        '-STA',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms | Out-Null;' +
          '$d = New-Object System.Windows.Forms.FolderBrowserDialog;' +
          "$d.Description = '选择项目目录'; $d.ShowNewFolderButton = $true;" +
          "if ($d.ShowDialog() -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
      ];
    } else if (this.hasBin('zenity')) {
      cmd = 'zenity';
      args = ['--file-selection', '--directory', '--title=选择项目目录'];
      if (start) args.push(`--filename=${start}${path.sep}`);
    } else if (this.hasBin('kdialog')) {
      cmd = 'kdialog';
      args = ['--getexistingdirectory', start || os.homedir()];
    } else {
      return {
        ok: false,
        unsupported: true,
        platform,
        reason: '本机没有 osascript / powershell / zenity / kdialog，无法拉起系统目录对话框。',
      };
    }

    return await new Promise<Record<string, any>>((resolve) => {
      let out = '';
      let err = '';
      let settled = false;
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e: any) {
        resolve({ ok: false, unsupported: true, platform, reason: e.message });
        return;
      }
      const done = (payload: Record<string, any>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(payload);
      };
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        done({
          ok: false,
          timedOut: true,
          platform,
          reason: `系统对话框 ${PICK_TIMEOUT_MS / 1000}s 内没有返回（可能被切到后台，或系统拦下了弹窗权限）。`,
        });
      }, PICK_TIMEOUT_MS);

      child.stdout?.on('data', (d) => {
        if (out.length < 8192) out += d.toString();
      });
      child.stderr?.on('data', (d) => {
        if (err.length < 8192) err += d.toString();
      });
      child.on('error', (e: any) => {
        done({ ok: false, unsupported: true, platform, reason: e.message });
      });
      child.on('close', (code) => {
        const picked = out.trim();
        if (code === 0 && picked) {
          done({ ok: true, path: path.resolve(picked), platform });
          return;
        }
        // macOS 取消：osascript 退出码 1 + stderr "User canceled. (-128)"
        if (/-128/.test(err) || /cancel/i.test(err)) {
          done({ ok: false, cancelled: true, platform });
          return;
        }
        done({ ok: false, platform, reason: (err.trim() || `exit code ${code}`).slice(0, 400) });
      });
    });
  }

  /**
   * 内置目录浏览器（**只读**）：系统对话框不可用 / 被拦时的兜底，也供「上一级」用。
   *
   *   path 为空        → 返回「起始位置」候选（主目录、桌面、卷、最近用过的项目目录…）
   *   path 是绝对路径  → 返回该目录下的子目录（带子目录/文件计数，便于判断挑对了没）
   *
   * 不列文件的正文，只数个数 —— 这个接口的用途是「找到目录」，不是「浏览内容」。
   */
  browseDirectory(rawPath?: string) {
    const raw = String(rawPath ?? '').trim();
    if (!raw) return this.listBrowseRoots();
    if (!path.isAbsolute(raw)) {
      throw new BadRequestException(`必须传绝对路径（收到 "${raw}"）。`);
    }
    const resolved = path.resolve(raw);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      throw new BadRequestException(`路径不存在：${resolved}`);
    }
    if (!stat.isDirectory()) throw new BadRequestException(`这不是一个目录：${resolved}`);

    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(resolved, { withFileTypes: true });
    } catch (e: any) {
      throw new BadRequestException(`目录读不出来（权限？）：${e.message}`);
    }

    const entries: Array<Record<string, any>> = [];
    let fileCount = 0;
    let skipped = 0;
    for (const d of dirents) {
      if (!d.isDirectory()) {
        fileCount++;
        continue;
      }
      if (BROWSE_SKIP_DIRS.has(d.name)) {
        skipped++;
        continue;
      }
      const full = path.join(resolved, d.name);
      let childDirs = 0;
      let childFiles = 0;
      try {
        for (const c of fs.readdirSync(full, { withFileTypes: true })) {
          if (c.isDirectory()) childDirs++;
          else childFiles++;
        }
      } catch {
        /* 权限不足 → 计 0，不阻断浏览 */
      }
      entries.push({
        name: d.name,
        path: full,
        hidden: d.name.startsWith('.'),
        isGitRepo: fs.existsSync(path.join(full, '.git')),
        hasProjectJson: fs.existsSync(path.join(full, 'mvgo.project.json')),
        childDirs,
        childFiles,
      });
    }
    entries.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const parent = path.dirname(resolved);
    return {
      path: resolved,
      name: path.basename(resolved) || resolved,
      parent: parent === resolved ? null : parent,
      parentName: parent === resolved ? null : path.basename(parent),
      isGitRepo: fs.existsSync(path.join(resolved, '.git')),
      hasProjectJson: fs.existsSync(path.join(resolved, 'mvgo.project.json')),
      fileCountAtThisLevel: fileCount,
      skippedDirs: skipped,
      truncated: entries.length > BROWSE_MAX_ENTRIES,
      totalEntries: entries.length,
      entries: entries.slice(0, BROWSE_MAX_ENTRIES),
    };
  }

  /** 「起始位置」候选：真实存在的常用入口 + 最近用过的项目目录（最贴心的一条） */
  private listBrowseRoots() {
    const home = os.homedir();
    const roots: Array<Record<string, any>> = [];
    const push = (name: string, p: string, tag?: string) => {
      try {
        if (fs.statSync(p).isDirectory()) roots.push({ name, path: p, tag });
      } catch {
        /* 不存在就跳过 */
      }
    };

    for (const p of this.recentProjectDirs()) {
      push(path.basename(p) || p, p, '最近用过');
    }
    push('主目录', home);
    push('桌面', path.join(home, 'Desktop'));
    push('文档', path.join(home, 'Documents'));
    push('下载', path.join(home, 'Downloads'));
    if (process.platform === 'darwin') {
      push('用户目录', '/Users');
      push('外接卷 / 挂载点', '/Volumes');
    } else if (process.platform === 'win32') {
      for (const L of 'CDEFGHIJ') push(`${L}:\\`, `${L}:\\`);
    } else {
      push('根目录', '/');
      push('用户目录', '/home');
      push('挂载点', '/mnt');
    }
    push('后端所在目录', process.cwd(), '后端');
    push('临时目录', os.tmpdir());

    // 去重（最近用过的目录可能和上面某个候选重复）
    const seen = new Set<string>();
    const uniq = roots.filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true)));
    return { path: '', name: '起始位置', parent: null, roots: true, entries: uniq };
  }

  /** 最近用过的项目目录（从运行历史里取，去重）—— 让用户一键回到上次那个项目 */
  private recentProjectDirs(): string[] {
    try {
      const dirs = this.listRuns()
        .runs.map((r) => r.projectDir)
        .filter((p): p is string => typeof p === 'string' && path.isAbsolute(p));
      return [...new Set(dirs)].slice(0, 5);
    } catch {
      return [];
    }
  }

  /** 对话框的默认起始位置：只有真实存在的绝对目录才传，否则交给系统默认 */
  private pickStartDir(defaultDir?: string): string | null {
    const raw = String(defaultDir ?? '').trim();
    if (raw && path.isAbsolute(raw)) {
      try {
        if (fs.statSync(raw).isDirectory()) return raw;
      } catch {
        /* 无效就退回没有默认位置 */
      }
    }
    return null;
  }

  /** 该可执行文件在不在 PATH 上（linux 选 zenity / kdialog 用） */
  private hasBin(bin: string): boolean {
    const dirs = String(process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
    for (const d of dirs) {
      try {
        fs.accessSync(path.join(d, bin), fs.constants.X_OK);
        return true;
      } catch {
        /* 继续找 */
      }
    }
    return false;
  }

  /* -------------------------------------------------------------- scan --- */

  /** S0：跑扫描器（只读输入目录），产物落到新的 runId 目录 */
  async scan(projectDir: string, note?: string, userId?: string) {
    const info = this.inspect(projectDir);
    if (!info.exists) throw new BadRequestException(`项目目录不存在：${info.resolvedPath}`);
    if (!info.isDirectory) throw new BadRequestException(`不是目录：${info.resolvedPath}`);
    if (!info.readable) {
      throw new BadRequestException(`目录不可读：${info.readError ?? ''}`);
    }
    if (!fs.existsSync(SCANNER_PATH)) {
      throw new BadRequestException(`扫描器缺失：${SCANNER_PATH}（dist 未拷 assets？）`);
    }

    const runId = this.newRunId();
    const outDir = path.join(RUNS_ROOT, runId);
    fs.mkdirSync(outDir, { recursive: true });

    const t0 = Date.now();
    const res = await this.runScanner(info.resolvedPath, outDir);
    const durationMs = Date.now() - t0;

    // 退出码语义（扫描器定义）：0 = 无 blocker；1 = 有 blocker 但产物已写完；2 = 用法/目录错误
    if (res.code === 2) {
      throw new BadRequestException(
        `扫描器拒绝该目录：${(res.stderr || res.stdout).trim()}`,
      );
    }
    if (!fs.existsSync(path.join(outDir, 'spec', 'project.manifest.json'))) {
      throw new BadRequestException(
        `扫描未产出 manifest（exit=${res.code}）：${(res.stderr || res.stdout).slice(0, 800)}`,
      );
    }

    fs.writeFileSync(
      path.join(outDir, 'run.json'),
      JSON.stringify(
        {
          runId,
          projectDir: info.resolvedPath,
          note: note ?? null,
          createdAt: new Date().toISOString(),
          durationMs,
          exitCode: res.code,
          scannerMd5: SCANNER_MD5,
          stdoutTail: res.stdout.slice(-4000),
        },
        null,
        2,
      ) + '\n',
    );

    this.logger.log(
      `[S0] runId=${runId} dir=${info.resolvedPath} exit=${res.code} ${durationMs}ms`,
    );

    return {
      durationMs,
      exitCode: res.code,
      stdout: res.stdout,
      // inspectRun 已带 runId / manifest / 端点 / 冲突 / 产物清单
      ...(await this.inspectRun(runId, userId)),
    };
  }

  private runScanner(
    projectDir: string,
    outDir: string,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      // 清掉 NODE_OPTIONS：宿主可能注入了 --require shim（沙箱 / 语言服务），
      // 传给纯 node 子进程会让它卡在启动阶段而不报错。
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env.NODE_OPTIONS;

      const child = spawn(
        process.execPath,
        [SCANNER_PATH, projectDir, '--out', outDir],
        { cwd: RUNS_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (code: number, extra?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          code,
          stdout: stdout.slice(0, STDOUT_CAP),
          stderr: extra ? extra + (stderr ? '\n' + stderr : '') : stderr.slice(0, STDOUT_CAP),
        });
      };
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        finish(-1, `扫描超时（${SCAN_TIMEOUT_MS}ms）`);
      }, SCAN_TIMEOUT_MS);

      child.stdout?.on('data', (b: Buffer) => {
        if (stdout.length < STDOUT_CAP) stdout += b.toString('utf8');
      });
      child.stderr?.on('data', (b: Buffer) => {
        if (stderr.length < STDOUT_CAP) stderr += b.toString('utf8');
      });
      child.on('error', (e) => finish(-1, e.message));
      child.on('close', (code) => finish(code ?? -1));
    });
  }

  private newRunId(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp =
      d.getFullYear() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      '-' +
      p(d.getHours()) +
      p(d.getMinutes()) +
      p(d.getSeconds());
    return `pj-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
  }

  private assertRunId(runId: string) {
    if (!RUN_ID_RX.test(String(runId ?? ''))) {
      throw new BadRequestException(`非法 runId：${JSON.stringify(runId)}`);
    }
  }

  /* -------------------------------------------------------------- runs --- */

  listRuns() {
    fs.mkdirSync(RUNS_ROOT, { recursive: true });
    const runs = fs
      .readdirSync(RUNS_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && RUN_ID_RX.test(d.name))
      .map((d) => {
        const full = path.join(RUNS_ROOT, d.name);
        let createdAt: string | null = null;
        let projectDir: string | null = null;
        let note: string | null = null;
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(full, 'run.json'), 'utf8'));
          createdAt = meta.createdAt ?? null;
          projectDir = meta.projectDir ?? null;
          note = meta.note ?? null;
        } catch {
          /* 老目录无 run.json，按 mtime 排 */
        }
        const st = fs.statSync(full);
        return {
          runId: d.name,
          createdAt: createdAt ?? st.mtime.toISOString(),
          projectDir,
          note,
          frozen: fs.existsSync(path.join(full, 'spec', 'openapi.local.yaml')),
        };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 30);
    return { runsRoot: RUNS_ROOT, total: runs.length, runs };
  }

  /**
   * 删除单次运行 —— 整个运行目录（run.json + spec/ + doc/）一并移除。
   *
   * 「历史记录」与「产物」在磁盘上就是同一棵树，所以一次 rm 同时满足两件事：
   *   ① 列表里不再出现这个 runId（listRuns 是按目录扫的）
   *   ② 产物查看器再读不到它的任何白名单文件（白名单只约束相对路径，目录没了就全没了）
   *
   * 🔴 破坏性且不可恢复 —— 调用方（前端）必须先二次确认，确认后才允许打这个接口。
   * 🔴 先过 assertRunId（^pj-YYYYMMDD-HHMMSS-6hex$）再拼路径：否则 runId 传 `../..`
   *    就能删到运行根外面去（路径穿越）。
   */
  deleteRun(runId: string): { deleted: string; bytes: number; dir: string } {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);
    const bytes = this.measureDir(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    if (fs.existsSync(dir)) {
      throw new Error(`删除后目录仍存在：${dir}（权限不足或文件被占用？）`);
    }
    this.logger.warn(`已删除运行 ${runId}（${bytes} 字节）：${dir}`);
    return { deleted: runId, bytes, dir };
  }

  /** 目录占用字节数 —— 只用于「释放了多少」的回执；统计失败按 0 算，绝不因此中断删除 */
  private measureDir(dir: string): number {
    let total = 0;
    const walk = (d: string) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const full = path.join(d, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.isFile()) {
          try {
            total += fs.statSync(full).size;
          } catch {
            /* 并发写导致文件瞬时消失：忽略 */
          }
        }
      }
    };
    walk(dir);
    return total;
  }

  /** 单次运行的完整视图（manifest + 端点 + 冲突 + 产物清单 + 冻结状态） */
  async inspectRun(runId: string, userId?: string) {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);

    const readJson = (rel: string): any => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
      } catch {
        return null;
      }
    };
    const readText = (rel: string): string | null => {
      try {
        return fs.readFileSync(path.join(dir, rel), 'utf8');
      } catch {
        return null;
      }
    };

    const manifest = readJson('spec/project.manifest.json');
    const endpoints = readJson('spec/endpoints.json');
    const conflictsMd = readText('spec/conflicts.md') ?? '';
    const parsed = this.parseConflictsMd(conflictsMd);
    const decisions = this.readDecisions(runId);

    const artifacts = ARTIFACT_WHITELIST.map((rel) => {
      const full = path.join(dir, rel);
      try {
        const st = fs.statSync(full);
        return { name: rel, exists: true, bytes: st.size, mtime: st.mtime.toISOString() };
      } catch {
        return { name: rel, exists: false, bytes: 0, mtime: null };
      }
    });

    const s0 = manifest?.S0 ?? null;
    const s1 = manifest?.S1 ?? null;

    return {
      runId,
      dir,
      projectDir: manifest?.projectRoot ?? null,
      scannedAt: manifest?.scannedAt ?? null,
      elapsedMs: manifest?.elapsedMs ?? null,
      s0: s0
        ? {
            docs: s0.docs,
            html: s0.html,
            frontend: s0.frontend,
            backend: s0.backend,
            projectJson: s0.projectJson,
            git: s0.git,
            missing: s0.missing,
            gate: s0.gate,
            readOnly: s0.readOnly,
          }
        : null,
      s1: s1
        ? {
            sources: s1.sources,
            alignment: s1.alignment,
            envelopeShapes: s1.envelopeShapes,
            envelope: s1.envelope,
            sourceHashes: s1.sourceHashes,
            gaps: s1.gaps,
            gate: s1.gate,
          }
        : null,
      endpoints: {
        total: endpoints?.total ?? 0,
        declaredPrefix: endpoints?.declaredPrefix ?? null,
        byConfidence: endpoints?.byConfidence ?? {},
        list: (endpoints?.endpoints ?? []).map((e: any) => ({
          path: e.path,
          verb: e.verb,
          sources: e.sources,
          confidence: e.confidence,
          flags: e.flags,
        })),
      },
      featureDetails: await this.loadOrBuildFeatureDetails(
        dir,
        s0,
        s1,
        endpoints,
        manifest?.projectRoot ?? null,
        userId,
      ),
      conflicts: parsed.conflicts,
      gaps: parsed.gaps,
      missing: manifest?.missing ?? [],
      decisions,
      artifacts,
      frozen: artifacts.find((a) => a.name === 'spec/openapi.local.yaml')?.exists === true,
      // 「项目简介」：纯确定性派生。scan() 是 `...inspectRun(runId)` 展开的，
      // 所以放这里 = 扫描响应与历史运行两条路径同时生效（老 run 无需重扫）。
      briefing: this.buildBriefing(s0, s1, endpoints, manifest?.projectRoot ?? null),
    };
  }

  /* ---------------------------------------------------------- briefing --- */

  /**
   * 「项目简介」—— 给前台读的一段人话摘要（**零 LLM**，纯确定性派生）。
   *
   * 只从已落盘的 S0/S1 事实里取，缺什么就少说什么，绝不猜：
   *   title    ← 需求文档文件名：`<项目名>_<文档类型>_<版本>` 取第一段
   *              （沿江监控运维子系统_需求规格说明书_V1.1.docx → 沿江监控运维子系统）
   *   frontend ← S0.frontend.bases[0]（name + vite）
   *   backend  ← S0.backend.bases[0]（artifactId + springBoot + javaVersion）
   *   features ← S1.sources.doc.headings 里「二级小节 + 标题含"模块"」的章节名
   *              （4.2 云资源监测模块 → 云资源监测）；文档无模块章节时退化取 S0.html.pages 文件名
   *   desc     ← 文档数 / 原型页面数 / 端点总数
   *
   * 刻意在**读取时**派生而不是扫描时写盘：产物白名单和 run 目录结构都不动，
   * 老 run 重开也立刻有简介。
   */
  private buildBriefing(
    s0: any,
    s1: any,
    endpoints: any,
    projectRoot: string | null,
  ) {
    // ── 项目名 ──────────────────────────────────────────────────────────
    const docPath: string | null = s0?.docs?.files?.[0]?.path ?? null;
    const docStem = docPath ? path.basename(docPath).replace(/\.[^./\\]+$/, '') : '';
    const title =
      docStem.split('_')[0]?.trim() ||
      (projectRoot ? path.basename(projectRoot) : '') ||
      '未命名项目';

    // ── 前端 / 后端基座 ─────────────────────────────────────────────────
    const feBase = Array.isArray(s0?.frontend?.bases) ? s0.frontend.bases[0] : null;
    const feParts: string[] = [feBase?.name ?? feBase?.dir ?? ''];
    if (feBase?.vite) feParts.push('Vite');
    const frontend = feParts.filter(Boolean).join(' · ') || '未识别前端基座';

    const beBase = Array.isArray(s0?.backend?.bases) ? s0.backend.bases[0] : null;
    const beParts: string[] = [beBase?.artifactId ?? beBase?.dir ?? ''];
    if (beBase?.springBoot) beParts.push('Spring Boot');
    if (beBase?.javaVersion) beParts.push(`Java ${beBase.javaVersion}`);
    const backend = beParts.filter(Boolean).join(' · ') || '未识别后端基座';

    // ── 需要实现的功能 ──────────────────────────────────────────────────
    const { features, featuresFrom } = this.extractFeatures(s1, s0);

    // ── 一句话体量 ──────────────────────────────────────────────────────
    const descBits: string[] = [];
    const docCount = Array.isArray(s0?.docs?.files) ? s0.docs.files.length : 0;
    const pageCount = Array.isArray(s0?.html?.pages) ? s0.html.pages.length : 0;
    if (docCount) descBits.push(`${docCount} 份需求文档`);
    if (pageCount) descBits.push(`${pageCount} 个原型页面`);
    descBits.push(`${Number(endpoints?.total ?? 0)} 个 API 端点`);

    return {
      title,
      desc: descBits.join(' · '),
      frontend,
      backend,
      features,
      featuresFrom,
    };
  }

  /* ------------------------------------------------ feature details --- */

  /**
   * 每个「要实现的功能」tag 点击后展开的详情：功能简介 / 相关接口 / 页面开发需求。
   *
   * 落盘 `spec/feature-details.json`（首次算、之后复用）—— 老 run 重开也会按需生成。
   * 🔴 LLM 仅作**增强**：未配置模型 / 调用失败 → 确定性降级（简介较薄、相关接口/页面靠
   *    关键词粗匹配），**绝不**因 LLM 不可用而让接口报错或变慢到不可用。
   * 🔴 推导出来的接口一律 `confidence:'candidate'` + `sources:['doc-inferred']` +
   *    `inferred:true`，**绝不**进 frozen 契约、也**绝不**被误判成 `declared` 真值。
   */
  private async loadOrBuildFeatureDetails(
    dir: string,
    s0: any,
    s1: any,
    endpoints: any,
    projectRoot: string | null,
    userId?: string,
  ): Promise<Record<string, any>> {
    const file = path.join(dir, 'spec', 'feature-details.json');
    try {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (cached && typeof cached === 'object') {
        // 🔴 缓存自愈：缓存里所有 feature 的 shots 都为空，但磁盘 spec/shots/ 实际已有 PNG
        //    → 说明当初构建时 Chromium 降级、缓存被钉死为空，强制重建（captureShots 幂等，已截页不重截）。
        const feats = Object.values(cached) as any[];
        const anyShot = feats.some((f) => Array.isArray(f?.shots) && f.shots.length);
        if (anyShot || !this.shotsDirHasPng(dir)) return cached;
        this.logger.warn('feature-details 缓存命中但截图缺失，且磁盘已有 PNG → 强制重建（自愈）');
      }
    } catch {
      /* 不存在或损坏 → 重新算 */
    }
    const built = await this.buildFeatureDetails(dir, s0, s1, endpoints, projectRoot, userId);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(built, null, 2) + '\n');
    } catch {
      /* 写盘失败不影响返回（下次再算） */
    }
    return built;
  }

  private async buildFeatureDetails(
    dir: string,
    s0: any,
    s1: any,
    endpoints: any,
    projectRoot: string | null,
    userId?: string,
  ): Promise<Record<string, any>> {
    const { features, featurePoints } = this.extractFeatures(s1, s0);
    const epList: any[] = Array.isArray(endpoints?.endpoints) ? endpoints.endpoints : [];
    const pages: string[] = (s0?.html?.pages ?? []).map((p: any) => String(p?.path ?? ''));
    const htmlPages: any[] = Array.isArray(s0?.html?.pages) ? s0.html.pages : [];

    const declaredPrefix =
      (endpoints?.declaredPrefix && String(endpoints.declaredPrefix).trim()) || '/api';
    const cfg = await this.resolveTextConfigSafe(userId);
    const aiEnabled = !!cfg;
    // 视觉模型配置（可选；未配置则覆盖比对走确定性基线，不报错）
    const visionCfg = await this.resolveVisionConfigSafe(userId);

    // P2：本次调用内按页共用缓存（读文件 / 小写文本 / JSDOM 解析各只做一次）
    const pageAcc = this.createPageAccessor(projectRoot, htmlPages);

    const details: Record<string, any> = {};
    for (const f of features) {
      const related = this.matchEndpoints(f, epList);
      details[f] = {
        feature: f,
        description: `「${f}」是需求文档中定义的功能模块，需在前后端协同实现。`,
        featurePoints: featurePoints[f] || [],
        relatedEndpoints: related,
        // 🔴 没有匹配到任何真实接口路径时，确定性兜底按 REST 约定推导候选（始终在线，不依赖 AI）；
        //    配了 AI 则在下方被 LLM 的更精准命名覆盖。这是「没有接口路径时自动生成」的根因实现。
        suggestedEndpoints: related.length
          ? []
          : this.deriveSuggestedEndpoints(f, declaredPrefix, aiEnabled),
        relatedPages: this.matchPages(f, pages),
        pageDevNote: '',
      };
    }

    // 🔴 截图策略（P0-1）：
    //   · 未配置视觉模型 → 扫描同步路径**不启动 puppeteer**，只填「期望路径清单」
    //     （确定性、零 puppeteer；真正的 PNG 由 readArtifact 按需生成，见 P0-2）。
    //     形状不变：`d.shots` 仍是 string[]（`spec/shots/<shotName(rel)>`），前端零改动。
    //   · 配了视觉模型 → 视觉覆盖比对（下方）与视觉接口定位真的要用图，
    //     保持原来的急生成顺序（captureShots 本身已加超时护栏，见 P1）。
    const shotMap = visionCfg
      ? await this.captureShots(dir, projectRoot, htmlPages)
      : this.planShotPaths(projectRoot, htmlPages);
    for (const f of features) {
      const d = details[f];
      d.shots = (d.relatedPages || []).map((p: string) => shotMap[p]).filter(Boolean);
      // 比对：原型 vs 需求覆盖（确定性基线；配置 vision 模型则升级为视觉比对）
      d.coverage = this.computeCoverage(
        f,
        d.featurePoints || [],
        d.relatedPages || [],
        projectRoot,
        htmlPages,
        pageAcc,
      );
    }

    // 🔴 视觉比对升级：配了视觉模型 → 用截图 + 功能点判定覆盖，覆盖确定性基线（更准）
    if (visionCfg) {
      for (const f of features) {
        const d = details[f];
        if (!Array.isArray(d.featurePoints) || !d.featurePoints.length || !d.shots?.length) continue;
        const shotAbs = d.shots.map((s: string) => path.join(dir, s)).filter((p: string) => fs.existsSync(p));
        try {
          const visionVerdicts = await this.enrichCoverageWithVision(f, d.featurePoints, shotAbs, visionCfg);
          if (visionVerdicts && visionVerdicts.length) {
            const covered = visionVerdicts.filter((v) => v.status === 'covered').length;
            const missing = visionVerdicts.filter((v) => v.status === 'missing').length;
            d.coverage = {
              points: visionVerdicts,
              summary:
                missing > 0
                  ? `${covered}/${visionVerdicts.length} 功能点视觉命中原型，${missing} 个疑似缺失`
                  : `${covered}/${visionVerdicts.length} 功能点视觉命中原型`,
              byVision: true,
            };
          }
        } catch (err: any) {
          this.logger.warn(`视觉覆盖比对失败，沿用确定性基线：${err?.message ?? err}`);
        }
      }
    }

    // LLM 增强（可选、可降级）
    if (cfg) {
      try {
        const enriched = await this.enrichFeaturesWithLLM(features, epList, pages, cfg);
        for (const f of features) {
          const e = enriched?.[f];
          if (!e || typeof e !== 'object') continue;
          const d = details[f];
          if (e.description) d.description = String(e.description);
          if (Array.isArray(e.relatedEndpointPaths)) {
            d.relatedEndpoints = this.matchEndpointsByPaths(e.relatedEndpointPaths, epList);
          }
          if (Array.isArray(e.suggestedEndpoints) && e.suggestedEndpoints.length) {
            // LLM 给出建议 → 覆盖确定性兜底（AI 命名更精准）
            d.suggestedEndpoints = [];
            for (const s of e.suggestedEndpoints) {
              if (!s || !s.path) continue;
              d.suggestedEndpoints.push({
                path: String(s.path),
                verb: String(s.verb || 'GET').toUpperCase(),
                confidence: 'candidate',
                sources: ['doc-inferred'],
                inferred: true,
                note: s.note || '由功能描述 AI 推导，待人工确认',
              });
            }
          }
          if (Array.isArray(e.relatedPagePaths)) {
            d.relatedPages = e.relatedPagePaths.map((p: any) => String(p)).filter(Boolean);
          }
          if (e.pageDevNote) d.pageDevNote = String(e.pageDevNote);
        }
      } catch (err: any) {
        this.logger.warn(`LLM 派生功能详情失败，沿用确定性结果：${err?.message ?? err}`);
      }
    }

    // 🔴 L1：把接口（真实 + 建议）绑定到关联原型页的具体 UI 区域（确定性 DOM 定位，无需模型）。
    //    —— 让「建议新增接口」能精确告知用在网页的哪个位置（表格/新增按钮/详情链接/表单），
    //       关联页为空 → 接口 locations=[]（前端提示「原型页未检测到对应 UI 元素」）。
    for (const f of features) {
      const d = details[f];
      const eps = [...(d.relatedEndpoints || []), ...(d.suggestedEndpoints || [])];
      if (!eps.length || !(d.relatedPages || []).length) continue;
      const locMap = await this.locateEndpointsInPages(
        eps,
        htmlPages,
        d.relatedPages,
        projectRoot,
        pageAcc,
      );
      const attach = (list: any[]) =>
        (list || []).map((e) => ({ ...e, locations: locMap[this.epKey(e)] || [] }));
      d.relatedEndpoints = attach(d.relatedEndpoints);
      d.suggestedEndpoints = attach(d.suggestedEndpoints);
    }

    // 🔴 L2：配了视觉模型 → 对 L1 仍未定位到的接口，送截图让模型指出对应区域（归一化 bounding box），
    //    失败/无图/无 box → 优雅降级，沿用 L1 文字定位。
    if (visionCfg) {
      for (const f of features) {
        const d = details[f];
        const eps = [...(d.relatedEndpoints || []), ...(d.suggestedEndpoints || [])].filter(
          (e) => !(e.locations && e.locations.length),
        );
        if (!eps.length || !d.shots?.length) continue;
        const shotAbs = d.shots.map((s: string) => path.join(dir, s)).filter((p: string) => fs.existsSync(p));
        if (!shotAbs.length) continue;
        try {
          const boxes = await this.enrichEndpointLocationsWithVision(eps, shotAbs, visionCfg);
          if (boxes && Object.keys(boxes).length) {
            const apply = (list: any[]) =>
              (list || []).map((e) => {
                const b = boxes[this.endpointAction(e)];
                return b ? { ...e, visionBox: b } : e;
              });
            d.relatedEndpoints = apply(d.relatedEndpoints);
            d.suggestedEndpoints = apply(d.suggestedEndpoints);
          }
        } catch (err: any) {
          this.logger.warn(`视觉接口定位失败，沿用 L1 文字定位：${err?.message ?? err}`);
        }
      }
    }

    return details;
  }

  /** 功能提取（buildBriefing 与功能详情共用，单一事实来源） */
  private extractFeatures(s1: any, s0: any): {
    features: string[];
    featuresFrom: string;
    featurePoints: Record<string, string[]>;
  } {
    const FEATURE_CAP = 8;
    const features: string[] = [];
    const featurePoints: Record<string, string[]> = {};
    let featuresFrom = '';
    const headings: any[] = Array.isArray(s1?.sources?.doc?.headings)
      ? s1.sources.doc.headings
      : [];
    let currentModule = '';
    for (const h of headings) {
      const no = String(h?.no ?? '').trim();
      const raw = String(h?.title ?? '').trim();
      if (/^\d+\.\d+$/.test(no)) {
        // 二级小节：含「模块」→ 功能模块（普通二级不切换 currentModule）
        if (raw.includes('模块')) {
          const name = raw
            .replace(/^\s*[\d.]+\s*/, '')
            .replace(/模块\s*$/, '')
            .trim();
          if (name && !features.includes(name)) features.push(name);
          if (name) {
            currentModule = name;
            featurePoints[name] = featurePoints[name] || [];
          }
          if (features.length >= FEATURE_CAP) break;
        }
      } else if (/^\d+\.\d+\.\d+$/.test(no) && currentModule) {
        // 三级小节 = 该功能模块下的具体功能点（页面流/功能点）
        const pt = raw.replace(/^\s*[\d.]+\s*/, '').trim();
        if (pt) (featurePoints[currentModule] = featurePoints[currentModule] || []).push(pt);
      }
    }
    if (features.length) {
      featuresFrom = '需求文档 · 模块章节';
    } else {
      for (const p of s0?.html?.pages ?? []) {
        const name = path
          .basename(String(p?.path ?? ''))
          .replace(/\.[^./\\]+$/, '')
          .trim();
        if (!name) continue;
        if (/^(index|main|home|login|app)$/i.test(name)) continue;
        if (!features.includes(name)) features.push(name);
        if (features.length >= FEATURE_CAP) break;
      }
      if (features.length) featuresFrom = '原型页面';
    }
    return { features, featuresFrom, featurePoints };
  }

  /** 关键词粗匹配：功能名（多为中文）与英文接口路径基本对不上 → 通常返回空，靠 LLM 补 */
  private matchEndpoints(feature: string, epList: any[]): any[] {
    const tokens = this.featureTokens(feature);
    const out: any[] = [];
    for (const e of epList) {
      const p = String(e?.path ?? '').toLowerCase();
      if (tokens.some((t) => t && p.includes(t))) {
        out.push({ path: e.path, verb: e.verb, confidence: e.confidence, sources: e.sources });
      }
    }
    return out;
  }

  private matchEndpointsByPaths(paths: any[], epList: any[]): any[] {
    const set = new Set(paths.map((p) => String(p).toLowerCase()));
    const out: any[] = [];
    for (const e of epList) {
      if (set.has(String(e?.path ?? '').toLowerCase())) {
        out.push({ path: e.path, verb: e.verb, confidence: e.confidence, sources: e.sources });
      }
    }
    return out;
  }

  private matchPages(feature: string, pages: string[]): string[] {
    const tokens = this.featureTokens(feature);
    const fLow = feature.toLowerCase();
    return pages.filter((p) => {
      const lower = p.toLowerCase();
      if (tokens.some((t) => t && lower.includes(t))) return true;
      // 中文子串匹配：原型页面路径常直接以模块名命名（html/模块1/云资源监测.html）
      if (feature && lower.includes(fLow)) return true;
      const base = path.basename(p).toLowerCase();
      const baseNoExt = base.replace(/\.[^.]+$/, '');
      if (baseNoExt.includes(fLow) || fLow.includes(baseNoExt)) return true;
      return false;
    });
  }

  // ===== 「建议新增接口」精确位置定位（L1 确定性 DOM 定位 + L2 视觉画框）=====

  /** 接口 → 动作分类：决定它对应原型页的哪类 UI 区域 */
  private endpointAction(e: any): string {
    const verb = String(e?.verb || '').toUpperCase();
    const p = String(e?.path || '').toLowerCase();
    if (verb === 'GET' && p.includes('/:id')) return 'detail';
    if (verb === 'GET') return 'list';
    if (verb === 'POST') return 'create';
    if (verb === 'PUT' || verb === 'PATCH') return 'update';
    if (verb === 'DELETE') return 'delete';
    return 'other';
  }

  /** 接口唯一键（真实 + 建议端点共用，匹配 locations/visionBox 回填） */
  private epKey(e: any): string {
    return `${String(e?.verb || '').toUpperCase()}|${String(e?.path || '')}`;
  }

  /**
   * 抽取单个原型页里的 UI 区域（表格/列表/新增按钮/详情链接/表单），供接口动作反向匹配。
   * 用 jsdom 解析（已装依赖），失败/无 DOM 库 → 返回空数组，绝不阻断扫描。
   */
  private detectUiRegions(
    html: string,
    pageRel: string,
  ): Array<{ elementType: string; text: string; selector: string; hint: string; page: string }> {
    const out: any[] = [];
    let doc: any;
    try {
      // 🔴 懒 require：避免启动即加载 jsdom（体积大），仅扫描用到时加载
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      doc = dom.window.document;
    } catch {
      return out;
    }
    const near = (el: any): string => {
      // 优先取元素自身可见文案；太短则取前序标题（h1~h6）作为区块名
      let t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (t.length >= 2) return t;
      let h = el;
      for (let i = 0; i < 5 && h; i++) {
        h = h.previousElementSibling;
        if (h && /^(H1|H2|H3|H4|H5|H6)$/.test(h.tagName)) {
          const ht = (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
          if (ht) return ht;
        }
      }
      return t;
    };
    const sel = (el: any): string => {
      const id = el.id ? '#' + el.id : '';
      const cls =
        el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
          : '';
      return el.tagName.toLowerCase() + (id || cls);
    };
    const CREATE_RX = /(新增|新建|创建|添加|add|create|new)/i;
    const DETAIL_RX = /(详情|查看|编辑|修改|detail|edit|view)/i;

    doc.querySelectorAll('table').forEach((el: any) => {
      out.push({ elementType: 'table', text: near(el), selector: sel(el), hint: '表格(列表区)', page: pageRel });
    });
    doc.querySelectorAll('ul,ol').forEach((el: any) => {
      if ((el.querySelectorAll('li') || []).length >= 3) {
        out.push({ elementType: 'list', text: near(el), selector: sel(el), hint: '列表', page: pageRel });
      }
    });
    doc.querySelectorAll('button,a,[role="button"],.btn,span.btn,div.btn').forEach((el: any) => {
      const txt = (
        (el.textContent || '') +
        ' ' +
        (el.getAttribute('title') || '') +
        ' ' +
        (el.getAttribute('aria-label') || '')
      )
        .replace(/\s+/g, ' ')
        .trim();
      if (CREATE_RX.test(txt)) {
        out.push({ elementType: 'createButton', text: txt.slice(0, 40), selector: sel(el), hint: '新增/创建按钮', page: pageRel });
      } else if (DETAIL_RX.test(txt)) {
        out.push({ elementType: 'detailLink', text: txt.slice(0, 40), selector: sel(el), hint: '详情/编辑入口', page: pageRel });
      } else if (el.tagName === 'A') {
        out.push({ elementType: 'link', text: txt.slice(0, 40), selector: sel(el), hint: '链接', page: pageRel });
      }
    });
    doc.querySelectorAll('form').forEach((el: any) => {
      out.push({ elementType: 'form', text: near(el), selector: sel(el), hint: '表单', page: pageRel });
    });
    return out;
  }

  /**
   * 单次调用内的按页访问器（P2）：把「读文件 + 小写 + detectUiRegions(JSDOM)」按 rel 记忆化。
   * 🔴 刻意做成**局部对象**（不是模块级全局缓存）：避免内存泄漏与陈旧数据。
   *    多个 feature 指向同一页时，该页只被解析一次，结果与改造前逐字段一致。
   */
  private createPageAccessor(projectRoot: string | null, htmlPages: any[]): PageAccessor {
    const textCache = new Map<string, string>();
    const lowerCache = new Map<string, string>();
    const regionCache = new Map<string, any[]>();
    const abs = (rel: string): string => {
      const hit = (htmlPages || []).find((h) => String(h?.path ?? h) === rel);
      return path.join(projectRoot || '', String(hit?.path ?? rel));
    };
    const text = (rel: string): string => {
      let v = textCache.get(rel);
      if (v === undefined) {
        try {
          v = fs.readFileSync(abs(rel), 'utf8');
        } catch {
          v = '';
        }
        textCache.set(rel, v);
      }
      return v;
    };
    const lower = (rel: string): string => {
      let v = lowerCache.get(rel);
      if (v === undefined) {
        v = text(rel).toLowerCase();
        lowerCache.set(rel, v);
      }
      return v;
    };
    const regions = (rel: string): any[] => {
      let v = regionCache.get(rel);
      if (v === undefined) {
        const html = text(rel);
        v = html ? this.detectUiRegions(html, rel) : [];
        regionCache.set(rel, v);
      }
      return v;
    };
    return { text, lower, regions };
  }

  /**
   * 把接口列表绑定到关联原型页的具体 UI 区域（L1，确定性）。
   * 返回 Record<epKey, Location[]>；关联页为空/读不到 → 对应接口 locations=[]（前端提示「未检测到」）。
   * `pages` 传入时复用调用方的按页缓存（同一页不重复 `new JSDOM`）。
   */
  private async locateEndpointsInPages(
    endpoints: any[],
    htmlPages: any[],
    relatedPages: string[],
    projectRoot: string | null,
    pages?: PageAccessor,
  ): Promise<Record<string, any[]>> {
    const result: Record<string, any[]> = {};
    for (const e of endpoints) result[this.epKey(e)] = [];
    if (
      !projectRoot ||
      !Array.isArray(htmlPages) ||
      !htmlPages.length ||
      !Array.isArray(relatedPages) ||
      !relatedPages.length
    ) {
      return result;
    }
    const acc = pages ?? this.createPageAccessor(projectRoot, htmlPages);
    const regions: any[] = [];
    for (const rp of relatedPages) regions.push(...acc.regions(rp));
    for (const e of endpoints) {
      const wanted = ACTION_REGION_MAP[this.endpointAction(e)] || ACTION_REGION_MAP.other;
      result[this.epKey(e)] = regions.filter((r) => wanted.includes(r.elementType));
    }
    return result;
  }

  /**
   * 视觉接口定位（L2）：对 L1 仍未定位到的接口，送截图 + 接口动作给视觉模型，返回归一化 bounding box。
   * 失败/无图/无 box → 返回 null（调用方回退 L1 文字定位）。绝不硬编码模型。
   */
  private async enrichEndpointLocationsWithVision(
    endpoints: any[],
    shotAbsPaths: string[],
    cfg: { model: string; apiKey: string; baseURL: string; providerType?: string },
  ): Promise<Record<string, any> | null> {
    const images: string[] = [];
    for (const p of shotAbsPaths.slice(0, 2)) {
      try {
        const b = fs.readFileSync(p);
        images.push('data:image/png;base64,' + b.toString('base64'));
      } catch {
        /* 跳过读不到的图 */
      }
    }
    if (!images.length || !endpoints.length) return null;
    const actions = [...new Set(endpoints.map((e) => this.endpointAction(e)))].map((a) => ({
      action: a,
      label: ACTION_LABEL[a] || a,
    }));
    const sys =
      '你是 UI 接口定位助手。给定一张产品原型截图和一组接口操作（list=查询/列表区, create=新增/创建按钮, ' +
      'detail=详情/编辑入口），判断每个操作在截图里对应的 UI 控件，返回其归一化 bounding box（x,y,w,h 均为 0~1，' +
      '以图片左上角为原点）。只输出 JSON：{boxes:[{action:string,x:number,y:number,w:number,h:number}]}。无法定位则忽略该 action。';
    const user = '操作列表：\n' + actions.map((a) => `- ${a.action} (${a.label})`).join('\n');
    const raw = await this.callVisionJson(sys, user, images, cfg).catch(() => null);
    const arr = raw?.boxes;
    if (!Array.isArray(arr)) return null;
    const out: Record<string, any> = {};
    for (const b of arr) {
      if (!b || !b.action) continue;
      const x = Number(b.x);
      const y = Number(b.y);
      const w = Number(b.w);
      const h = Number(b.h);
      if ([x, y, w, h].some((n) => !isFinite(n) || n < 0 || n > 1)) continue;
      out[String(b.action)] = {
        action: b.action,
        label: ACTION_LABEL[b.action] || b.action,
        x,
        y,
        w,
        h,
      };
    }
    return Object.keys(out).length ? out : null;
  }

  private featureTokens(feature: string): string[] {
    // 取功能名里的 ASCII 片段（模块名若带英文/数字），中文段无法与英文路径对齐 → 留空
    const ascii = String(feature)
      .split(/[^a-zA-Z0-9]+/)
      .map((s) => s.toLowerCase())
      .filter((s) => s.length >= 2);
    return ascii;
  }

  /** 把功能名压成 REST 资源 slug：只保留 ASCII 词段（中文无法确定性翻译，回退占位 resource） */
  private featureSlug(feature: string): string {
    const parts = String(feature)
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((s) => s.trim())
      .filter((s) => /^[a-z0-9]+$/i.test(s) && s.length >= 1);
    const slug = parts.join('-');
    return slug || 'resource';
  }

  /**
   * 确定性兜底：功能没匹配到任何真实接口路径时，按 REST 资源约定推导候选接口。
   * 不冒充真实路径（confidence=candidate / sources=['doc-inferred'] / inferred=true），待人工确认。
   * 这是「没有接口路径时自动生成」的始终在线实现；若配置了 AI 模型，enrichFeaturesWithLLM
   * 会用更精准的命名覆盖它（中文功能名需 AI 才能翻成英文资源名）。
   */
  private deriveSuggestedEndpoints(
    feature: string,
    declaredPrefix: string,
    aiEnabled: boolean,
  ): any[] {
    const slug = this.featureSlug(feature);
    const prefix = declaredPrefix && declaredPrefix.trim() ? declaredPrefix.trim() : '/api';
    const aiTag = aiEnabled ? 'AI 已参与命名' : '未配置 AI 模型，按 REST 约定占位';
    const tpls: Array<{ verb: string; suffix: string; action: string }> = [
      { verb: 'GET', suffix: '', action: '查询/列表' },
      { verb: 'GET', suffix: '/:id', action: '详情' },
      { verb: 'POST', suffix: '', action: '创建' },
    ];
    return tpls.map((t) => ({
      path: `${prefix}/${slug}${t.suffix}`,
      verb: t.verb,
      confidence: 'candidate',
      sources: ['doc-inferred'],
      inferred: true,
      note: `由功能「${feature}」推导（${t.action}）· ${aiTag}，待人工确认资源名与路径`,
    }));
  }

  /** 截图文件名：html/模块1/云资源监测.html → 模块1_云资源监测.png（去斜杠/扩展名，保留可读） */
  private shotName(rel: string): string {
    return (
      String(rel)
        .replace(/\.[^./\\]+$/, '')
        .replace(/[\\/]+/g, '_')
        .replace(/[^\w一-龥.\-]+/g, '_') + '.png'
    );
  }

  /** 磁盘 spec/shots/ 是否已有 PNG（用于缓存自愈判定，只读不写） */
  private shotsDirHasPng(dir: string): boolean {
    const shotsDir = path.join(dir, 'spec', 'shots');
    if (!fs.existsSync(shotsDir)) return false;
    try {
      return fs.readdirSync(shotsDir).some((f) => /\.png$/i.test(f));
    } catch {
      return false;
    }
  }

  /**
   * 期望截图路径清单（P0-1，**零 puppeteer、纯确定性**）：
   * relatedPages 里在 projectRoot 下**真实存在**的页 → `spec/shots/<shotName(rel)>`。
   *
   * 与 captureShots 的键名/文件名规则完全一致 ⇒ 前端消费者拿到的形状与旧路径完全相同；
   * 真正的 PNG 由 `readArtifact` 在用户点开功能点时才按需生成（P0-2）。
   * 🔴 顺带的效果：`d.shots.length` 恒 > 0（页面存在时）⇒ loadOrBuildFeatureDetails 的
   *    「所有 shots 为空」自愈条件不再成立，**不会**再触发全量重建。
   */
  private planShotPaths(projectRoot: string | null, htmlPages: any[]): Record<string, string> {
    const map: Record<string, string> = {};
    if (!projectRoot || !Array.isArray(htmlPages)) return map;
    for (const p of htmlPages) {
      const rel = String(p?.path ?? p ?? '');
      if (!rel) continue;
      if (!fs.existsSync(path.join(projectRoot, rel))) continue;
      map[rel] = `spec/shots/${this.shotName(rel)}`;
    }
    return map;
  }

  /**
   * 等待「内容真的渲染出来」（P1-2，代替原硬编码 600ms 盲等）：
   *   ① 文档已到 interactive/complete；
   *   ② 若页面存在图表挂载点（[data-chart] / [class*=chart]）：
   *      必须有**至少一个**挂载点已量到尺寸（隐藏挂载点不计），
   *      且 echarts 默认 canvas 渲染器已真的把 canvas 注入（否则可能是空壳 div）；
   *   ③ 图表**入场动画**（echarts 默认 ~1s）不改布局尺寸 ⇒ 就绪判定过了仍可能截到动画中间帧，
   *      故再用 canvas 像素签名「连续 3 帧不变」判定动画收敛；
   *   ④ 最后补 2 帧 requestAnimationFrame 让最后一拍布局/绘制落地。
   * 每一步都有上界：①②≤SHOT_READY_TIMEOUT_MS，③≤SHOT_SETTLE_TIMEOUT_MS，
   * 到点即放行（绝不无限等）——宁可截一张可能不完整的图，也绝不挂起。
   */
  private async waitForPaint(page: any, budgetLeftMs: number): Promise<void> {
    const cap = Math.max(200, Math.min(SHOT_READY_TIMEOUT_MS, budgetLeftMs));
    await page
      .waitForFunction(
        () => {
          const rs = document.readyState;
          if (rs !== 'complete' && rs !== 'interactive') return false;
          const chartMounts = document.querySelectorAll('[data-chart],[class*="chart"]');
          if (chartMounts.length) {
            let sized = false;
            for (const el of Array.from(chartMounts) as any[]) {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                sized = true;
                break;
              }
            }
            if (!sized) return false;
            if (!document.querySelector('canvas')) return false;
          }
          return true;
        },
        { timeout: cap, polling: 100 },
      )
      .catch(() => {
        /* 到点放行 */
      });
    // ③ 图表动画收敛：canvas 像素签名连续 3 帧不变（无 canvas 的页立即返回）
    const settleCap = Math.max(100, Math.min(SHOT_SETTLE_TIMEOUT_MS, budgetLeftMs));
    await page
      .evaluate((maxMs: number) => {
        const canvases = Array.from(document.querySelectorAll('canvas')) as any[];
        if (!canvases.length) return true;
        const sig = () =>
          canvases
            .map((c) => {
              try {
                return c.toDataURL('image/png').length;
              } catch {
                return -1;
              }
            })
            .join(',');
        return new Promise<boolean>((resolve) => {
          const start = Date.now();
          let last = sig();
          let same = 0;
          const tick = () => {
            const cur = sig();
            if (cur === last) same++;
            else same = 0;
            last = cur;
            if (same >= 3) return resolve(true);
            if (Date.now() - start >= maxMs) return resolve(false);
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }, settleCap)
      .catch(() => {
        /* 到点放行 */
      });
    // ④ 最后两帧 rAF：让最后一拍布局/绘制落地
    await page
      .evaluate(
        () =>
          new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          ),
      )
      .catch(() => {});
  }

  /**
   * 关浏览器并保证有上界（P1）：`browser.close()` 可能**挂起不返回**，
   * 只 `.catch` 接不住 ⇒ 用 Promise.race 封顶，超时后 SIGKILL 兜底；全程不抛。
   */
  private async closeBrowserSafely(browser: any): Promise<void> {
    try {
      await Promise.race([
        Promise.resolve(browser.close()).catch(() => {}),
        new Promise((r) => setTimeout(r, SHOT_CLOSE_TIMEOUT_MS)),
      ]);
    } catch {
      /* ignore */
    }
    try {
      const proc = typeof browser.process === 'function' ? browser.process() : null;
      if (proc && proc.exitCode === null && !proc.killed) proc.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }

  /**
   * 原型截图：用 puppeteer 无头渲染 HTML 原型页，整页截 PNG 落 spec/shots/。
   * 🔴 纯增强、绝不阻断扫描：chromium 缺失/启动失败/单页失败 → 返回空 map（降级为无截图）。
   * 🔴 幂等：已截过的页直接复用，不重复启动浏览器。截图只写 run 目录，绝不碰用户项目目录。
   * 🔴 P1：launch / goto / screenshot / close 全部带显式超时 + 单次总预算，
   *    任何外部调用出问题都只降级，单次调用耗时**有确定上界**。
   */
  private async captureShots(
    dir: string,
    projectRoot: string | null,
    htmlPages: any[],
  ): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    if (!projectRoot || !Array.isArray(htmlPages) || !htmlPages.length) return map;
    const shotsDir = path.join(dir, 'spec', 'shots');
    fs.mkdirSync(shotsDir, { recursive: true });

    // 已截过则直接复用
    let have = 0;
    for (const p of htmlPages) {
      const rel = String(p?.path ?? p);
      const safe = this.shotName(rel);
      if (fs.existsSync(path.join(shotsDir, safe))) {
        map[rel] = `spec/shots/${safe}`;
        have++;
      }
    }
    if (have >= Math.min(htmlPages.length, 12)) return map;

    const deadline = Date.now() + SHOT_TOTAL_BUDGET_MS;
    let browser: any;
    try {
      // 懒加载，避免模块加载期就拉起 puppeteer
      const puppeteer = require('puppeteer');
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        timeout: SHOT_LAUNCH_TIMEOUT_MS,
        // 单个 CDP 协议调用也不可能无限等
        protocolTimeout: SHOT_GOTO_TIMEOUT_MS + SHOT_SCREENSHOT_TIMEOUT_MS,
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
      const CAP = 12;
      let n = 0;
      for (const p of htmlPages) {
        if (n >= CAP) break;
        // 总预算到点 → 用已完成的部分直接收尾
        const budgetLeft = deadline - Date.now();
        if (budgetLeft <= 0) break;
        const rel = String(p?.path ?? p);
        const safe = this.shotName(rel);
        if (map[rel]) {
          n++;
          continue;
        }
        const abs = path.join(projectRoot, rel);
        const out = path.join(shotsDir, safe);
        try {
          if (!fs.existsSync(abs)) continue;
          // 本地 file:// 页 → load 即可（networkidle2 每页白等 500ms 空闲判定）
          await page
            .goto('file://' + abs, {
              waitUntil: 'load',
              timeout: Math.max(1000, Math.min(SHOT_GOTO_TIMEOUT_MS, budgetLeft)),
            })
            .catch(() => {});
          // 内容就绪判定 + 2 帧 rAF（代替原固定 600ms 盲等）
          await this.waitForPaint(page, deadline - Date.now());
          await page
            .screenshot({
              path: out,
              fullPage: true,
              timeout: Math.max(1000, Math.min(SHOT_SCREENSHOT_TIMEOUT_MS, budgetLeft)),
            })
            .catch(() => {});
          if (fs.existsSync(out)) map[rel] = `spec/shots/${safe}`;
        } catch {
          /* 单页失败不阻断其他页 */
        }
        n++;
      }
    } catch (e: any) {
      this.logger.warn(`原型截图失败（降级为无截图）：${e?.message ?? e}`);
    } finally {
      if (browser) await this.closeBrowserSafely(browser);
    }
    return map;
  }

  /**
   * 比对（确定性基线）：原型 vs 需求覆盖。
   * 把功能点拆成 token，看是否出现在相关原型页的 HTML 文本里 → covered / partial / missing。
   * 🔴 配置 AI/vision 时可升级为视觉比对；这里不依赖任何模型，永远可用。
   */
  private computeCoverage(
    _feature: string,
    points: string[],
    relatedPages: string[],
    projectRoot: string | null,
    htmlPages: any[],
    pages?: PageAccessor,
  ): {
    points: Array<{ text: string; status: string }>;
    summary: string;
    byVision: boolean;
  } {
    if (!Array.isArray(points) || !points.length) {
      return { points: [], summary: '该功能无细分功能点', byVision: false };
    }
    // 收集相关原型页文本（按 rel 路径定位绝对文件；同页跨 feature 复用缓存）
    const acc = pages ?? this.createPageAccessor(projectRoot, htmlPages);
    const blob = (relatedPages || []).map((rp: string) => acc.lower(rp)).join('\n');

    const result = points.map((pt) => {
      const tokens = String(pt)
        .toLowerCase()
        .split(/[^一-龥a-z0-9]+/i)
        .filter((t) => t.length >= 2);
      let hits = 0;
      for (const t of tokens) if (blob.includes(t)) hits++;
      let status = 'partial';
      if (tokens.length === 0) status = 'partial';
      else if (hits === 0) status = 'missing';
      else if (hits >= Math.ceil(tokens.length / 2)) status = 'covered';
      return { text: pt, status };
    });
    const covered = result.filter((r) => r.status === 'covered').length;
    const missing = result.filter((r) => r.status === 'missing').length;
    return {
      points: result,
      summary:
        missing > 0
          ? `${covered}/${result.length} 功能点命中原型，${missing} 个疑似缺失`
          : `${covered}/${result.length} 功能点命中原型`,
      byVision: false,
    };
  }

  /**
   * 取文本模型配置（不硬编码、按用户配置）。任何异常 → 返回 null（走确定性降级）。
   * 🔴 resolveTextConfig 的「无 key 抛错」会被这里吞掉，保证 LLM 不可用只是降级而非报错。
   */
  private async resolveTextConfigSafe(userId?: string): Promise<{
    model: string;
    apiKey: string;
    baseURL: string;
    providerType?: string;
  } | null> {
    try {
      const merged: any = await this.aiConfig.getMergedAiConfig(userId);
      const mode = merged?.modelMode === 'unified' ? 'unified' : 'text';
      const model =
        merged?.[`${mode}Model`] || merged?.unifiedModel || merged?.textModel;
      const apiKey =
        merged?.[`${mode}ApiKey`] || merged?.unifiedApiKey || merged?.textApiKey;
      const baseURL =
        merged?.[`${mode}BaseURL`] || merged?.unifiedBaseURL || merged?.textBaseURL;
      const providerType =
        merged?.[`${mode}ProviderType`] || merged?.unifiedProviderType || undefined;
      if (!model || !apiKey) return null;
      return {
        model: String(model),
        apiKey: String(apiKey),
        baseURL: baseURL ? String(baseURL) : '',
        providerType: providerType ? String(providerType) : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * 取视觉模型配置（不硬编码、按用户配置）。优先专用 vision 字段，否则回退到文本/统一模型
   * （多数现代模型多模态）。任何异常 → 返回 null（走确定性降级，绝不报错）。
   */
  private async resolveVisionConfigSafe(userId?: string): Promise<{
    model: string;
    apiKey: string;
    baseURL: string;
    providerType?: string;
  } | null> {
    try {
      const merged: any = await this.aiConfig.getMergedAiConfig(userId);
      const mode = merged?.modelMode === 'unified' ? 'unified' : 'text';
      const model =
        merged?.visionModel ||
        merged?.[`${mode}Model`] ||
        merged?.unifiedModel ||
        merged?.textModel;
      const apiKey =
        merged?.visionApiKey ||
        merged?.[`${mode}ApiKey`] ||
        merged?.unifiedApiKey ||
        merged?.textApiKey;
      const baseURL =
        merged?.visionBaseURL ||
        merged?.[`${mode}BaseURL`] ||
        merged?.unifiedBaseURL ||
        merged?.textBaseURL;
      const providerType =
        merged?.visionProviderType || merged?.[`${mode}ProviderType`] || undefined;
      if (!model || !apiKey) return null;
      return {
        model: String(model),
        apiKey: String(apiKey),
        baseURL: baseURL ? String(baseURL) : '',
        providerType: providerType ? String(providerType) : undefined,
      };
    } catch {
      return null;
    }
  }

  /** 调 OpenAI 兼容视觉 chat/completions（带 image_url），超时 + 单次重试，稳健抽 JSON */
  private async callVisionJson(
    system: string,
    textPrompt: string,
    imageDataUrls: string[],
    cfg: { model: string; apiKey: string; baseURL: string; providerType?: string },
  ): Promise<any> {
    const base = (cfg.baseURL || '').replace(/\/+$/, '');
    const url = `${base}/chat/completions`;
    if (!/^https?:\/\//.test(url)) throw new Error('baseURL 无效，无法调用视觉模型');
    const content: any[] = [{ type: 'text', text: textPrompt }];
    for (const d of imageDataUrls.slice(0, 4)) {
      content.push({ type: 'image_url', image_url: { url: d } });
    }
    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      temperature: 0.2,
      stream: false,
    };
    const attempt = async (): Promise<any> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Vision HTTP ${res.status}`);
        const j = (await res.json()) as any;
        const c: string = j?.choices?.[0]?.message?.content ?? '';
        return this.extractJson(c);
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      return await attempt();
    } catch (e) {
      return await attempt(); // 单次重试（覆盖瞬时 429/网络抖动）
    }
  }

  /**
   * 视觉覆盖比对：把功能点 + 原型截图送视觉模型，判定每个功能点在截图里的实现状态。
   * 失败/模型不可用 → 返回 null（由调用方回退确定性基线）。绝不硬编码模型。
   */
  private async enrichCoverageWithVision(
    feature: string,
    points: string[],
    shotAbsPaths: string[],
    cfg: { model: string; apiKey: string; baseURL: string; providerType?: string },
  ): Promise<Array<{ text: string; status: string; reason: string }> | null> {
    const images: string[] = [];
    for (const p of shotAbsPaths.slice(0, 3)) {
      try {
        const b = fs.readFileSync(p);
        images.push('data:image/png;base64,' + b.toString('base64'));
      } catch {
        /* 跳过读不到的图 */
      }
    }
    if (!images.length || !points.length) return null;
    const sys =
      '你是 UI 覆盖审查助手。给定一张产品原型截图和该功能的功能点列表，判断每个功能点是否在截图中' +
      '可见/被实现。只输出 JSON：{verdicts:[{point:string,status:"covered"|"partial"|"missing",reason:string}]}。' +
      'covered=清晰可见已实现；partial=部分/疑似；missing=未发现。';
    const user =
      `功能：${feature}\n功能点：\n` + points.map((p, i) => `${i + 1}. ${p}`).join('\n');
    const raw = await this.callVisionJson(sys, user, images, cfg).catch(() => null);
    const arr = raw?.verdicts;
    if (!Array.isArray(arr)) return null;
    const map: Record<string, any> = {};
    for (const v of arr) {
      if (v && v.point) map[String(v.point)] = v;
    }
    const out = points
      .map((pt) => {
        const m = map[String(pt)];
        if (!m) return null;
        const st =
          m.status === 'covered' || m.status === 'partial' || m.status === 'missing'
            ? m.status
            : 'partial';
        return { text: pt, status: st, reason: m.reason || '' };
      })
      .filter((x): x is { text: string; status: string; reason: string } => Boolean(x));
    return out.length ? out : null;
  }

  /** 调 OpenAI 兼容 chat/completions，超时 + 单次重试，从返回里稳健抽取 JSON */
  private async enrichFeaturesWithLLM(
    features: string[],
    epList: any[],
    pages: string[],
    cfg: { model: string; apiKey: string; baseURL: string; providerType?: string },
  ): Promise<Record<string, any>> {
    const sys =
      '你是接口与页面需求分析助手。根据项目的功能模块列表、已扫描到的接口、原型页面，' +
      '为每个功能模块推断：功能简介、相关接口（在给定接口里挑）、建议新增接口（若文档只讲了功能没给路径）、' +
      '相关页面、页面开发需求简介。只输出 JSON，键为功能名，值为对象：' +
      '{description:string, relatedEndpointPaths:string[], ' +
      'suggestedEndpoints:[{path:string,verb:string,note:string}], ' +
      'relatedPagePaths:string[], pageDevNote:string}。path 用 REST 风格（如 /api/xxx），' +
      'verb 取 GET/POST/PUT/DELETE。未扫描到接口时 relatedEndpointPaths 可为空。';
    const user = JSON.stringify({
      features,
      endpoints: epList.map((e) => ({ path: e.path, verb: e.verb })),
      pages,
    });
    const raw = await this.callChatJson(sys, user, cfg);
    return raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  }

  private async callChatJson(
    system: string,
    user: string,
    cfg: { model: string; apiKey: string; baseURL: string; providerType?: string },
  ): Promise<any> {
    const base = (cfg.baseURL || '').replace(/\/+$/, '');
    const url = `${base}/chat/completions`;
    if (!/^https?:\/\//.test(url)) throw new Error('baseURL 无效，无法调用 LLM');
    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      stream: false,
    };
    const attempt = async (): Promise<any> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
        const j = (await res.json()) as any;
        const content: string = j?.choices?.[0]?.message?.content ?? '';
        return this.extractJson(content);
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      return await attempt();
    } catch (e) {
      return await attempt(); // 单次重试（覆盖瞬时 429/网络抖动）
    }
  }

  private extractJson(s: string): any {
    if (!s) return null;
    let t = s.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    return JSON.parse(t);
  }

  /* --------------------------------------------------------- conflicts --- */

  /**
   * 解析 conflicts.md → { gaps, conflicts }。
   *
   * conflicts.md 是唯一真值，本方法只产出**派生视图**（id 原样照抄，不改写措辞）。
   * 格式由扫描器钉死：
   *   缺口  `### GAP-XXX（blocker）`
   *   冲突  `### 1. 标题　`CF-XXX``
   */
  private parseConflictsMd(md: string) {
    const gaps: { id: string; severity: string; title: string }[] = [];
    const conflicts: { id: string; title: string; index: number }[] = [];
    for (const line of md.split('\n')) {
      const g = /^###\s+(GAP-[A-Z0-9-]+)\s*（(blocker|major|warn|info)）\s*(.*)$/.exec(line);
      if (g) {
        gaps.push({ id: g[1], severity: g[2], title: (g[3] || '').trim() });
        continue;
      }
      const c = /^###\s+(\d+)\.\s+(.*?)\s*`(CF-[A-Z0-9-]+)`\s*$/.exec(line);
      if (c) {
        conflicts.push({ index: Number(c[1]), id: c[3], title: c[2].trim() });
        continue;
      }
      const c2 = /^###\s+(\d+)\.\s+(.*)$/.exec(line);
      if (c2) {
        // 个别冲突没有反引号 id —— 用空 id 兜底，绝不编造
        conflicts.push({ index: Number(c2[1]), id: '', title: c2[2].trim() });
      }
    }
    return { gaps, conflicts };
  }

  /* --------------------------------------------------------- decisions --- */

  /**
   * 人裁决留痕。追加式：同 id 多次出现时**最后一条生效**（裁决可推翻，但推翻要留痕）。
   */
  saveDecisions(runId: string, entries: DecisionEntry[]) {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);
    if (!Array.isArray(entries) || !entries.length) {
      throw new BadRequestException('entries 不能为空');
    }
    for (const e of entries) {
      if (!e || !/^[A-Z0-9-]{3,64}$/.test(String(e.conflictId ?? ''))) {
        throw new BadRequestException(`非法 conflictId：${JSON.stringify(e?.conflictId)}`);
      }
      if (!String(e.choice ?? '').trim()) {
        throw new BadRequestException(`冲突 ${e.conflictId} 缺少 choice`);
      }
    }

    const file = path.join(dir, 'spec', 'decisions.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        [
          '# S2 人裁决留痕（decisions.md）',
          '',
          '> 本文件由**人**产生：`s0-scan.cjs` 只读它的存在性，`s2-contract-freezer` 只做交叉引用，',
          '> 二者都不生成、不覆盖。追加式记录 —— 同一冲突多次裁决时**最后一条生效**，',
          '> 历史保留（推翻也要留痕）。',
          '',
        ].join('\n'),
      );
    }

    const block: string[] = ['', '## ' + now + ' · runId `' + runId + '`', ''];
    for (const e of entries) {
      block.push(`- \`${String(e.conflictId).trim()}\` → **${String(e.choice).trim()}**`);
      const note = String(e.note ?? '').trim();
      if (note) for (const l of note.split('\n')) block.push('  > ' + l);
    }
    fs.appendFileSync(file, block.join('\n') + '\n');

    const decisions = this.readDecisions(runId);
    this.logger.log(
      `[S2] decisions 追加 ${entries.length} 条 → runId=${runId} 共 ${decisions.length} 条`,
    );
    return {
      saved: entries.length,
      decisions,
      bytes: fs.statSync(file).size,
      path: file,
    };
  }

  readDecisions(runId: string): DecisionRecord[] {
    this.assertRunId(runId);
    const file = path.join(RUNS_ROOT, runId, 'spec', 'decisions.md');
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return [];
    }
    const out = new Map<string, DecisionRecord>();
    let sectionAt: string | null = null;
    for (const line of text.split('\n')) {
      const h = /^##\s+(\S+)\s+·\s+runId/.exec(line);
      if (h) {
        sectionAt = h[1];
        continue;
      }
      const m = /^-\s+`([A-Z0-9-]+)`\s+→\s+\*\*(.+?)\*\*\s*$/.exec(line);
      if (m) {
        out.set(m[1], { conflictId: m[1], choice: m[2], decidedAt: sectionAt ?? undefined });
      }
    }
    return [...out.values()];
  }

  /* ------------------------------------------------------------ freeze --- */

  /** S2：契约冻结（确定性，无 LLM） */
  async freeze(runId: string, userId?: string) {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);

    const manifestPath = path.join(dir, 'spec', 'project.manifest.json');
    const endpointsPath = path.join(dir, 'spec', 'endpoints.json');
    const draftPath = path.join(dir, 'doc', 'REQUIREMENTS.draft.md');
    const required: [string, string][] = [
      [manifestPath, 'project.manifest.json'],
      [endpointsPath, 'endpoints.json'],
      [draftPath, 'REQUIREMENTS.draft.md'],
    ];
    for (const [p, label] of required) {
      if (!fs.existsSync(p)) {
        throw new BadRequestException(`缺少 S0 产物 ${label}，请先跑 S0 扫描`);
      }
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const endpointsJson = JSON.parse(fs.readFileSync(endpointsPath, 'utf8'));
    const draft = fs.readFileSync(draftPath, 'utf8');
    const conflictsMd = (() => {
      try {
        return fs.readFileSync(path.join(dir, 'spec', 'conflicts.md'), 'utf8');
      } catch {
        return '';
      }
    })();
    const parsed = this.parseConflictsMd(conflictsMd);
    const decisions = this.readDecisions(runId);
    const frozenAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    const decidedIds = new Set(decisions.map((d) => d.conflictId));
    const pendingConflicts = parsed.conflicts
      .filter((c) => c.id && !decidedIds.has(c.id))
      .map((c) => ({ id: c.id, title: c.title }));
    const pendingGaps = parsed.gaps
      .filter((g) => !decidedIds.has(g.id))
      .map((g) => ({ id: g.id, severity: g.severity, title: g.title }));
    const pendingBlockers = pendingGaps.filter((g) => g.severity === 'blocker');

    const openapi = buildOpenApi({
      runId,
      projectRoot: manifest.projectRoot ?? '',
      envelope: manifest?.S1?.envelope,
      endpoints: endpointsJson.endpoints ?? [],
      declaredPrefix: endpointsJson.declaredPrefix ?? null,
      decisions,
      pendingConflictIds: pendingConflicts.map((c) => c.id),
      blockerGapIds: pendingBlockers.map((g) => g.id),
      frozenAt,
    });

    const specDir = path.join(dir, 'spec');
    const docDir = path.join(dir, 'doc');
    fs.mkdirSync(specDir, { recursive: true });
    fs.mkdirSync(docDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'openapi.local.yaml'), openapi.yaml);

    // 制品指纹：S0 产物 + 契约（decisions.md 刻意不纳入，见附录 Z 说明）
    const digests: Record<string, string> = {};
    for (const rel of [
      'spec/project.manifest.json',
      'spec/endpoints.json',
      'spec/conflicts.md',
      'doc/REQUIREMENTS.draft.md',
      'spec/openapi.local.yaml',
    ]) {
      const full = path.join(dir, rel);
      if (!fs.existsSync(full)) continue;
      digests[rel] = crypto
        .createHash('sha256')
        .update(fs.readFileSync(full))
        .digest('hex')
        .slice(0, 16);
    }

    const requirementsMd = freezeRequirements({
      draft,
      runId,
      frozenAt,
      openapiStats: openapi.stats,
      decisions,
      pendingConflicts,
      blockerGaps: pendingBlockers,
      artifactDigests: digests,
    });
    fs.writeFileSync(path.join(docDir, 'REQUIREMENTS.md'), requirementsMd);

    const uniquePaths = new Set((endpointsJson.endpoints ?? []).map((e: any) => e.path));
    const checks = [
      {
        id: 'path-count-matches-endpoints',
        ok: openapi.stats.pathCount === uniquePaths.size,
        detail: `契约 ${openapi.stats.pathCount} 个 path = endpoints.json 去重后 ${uniquePaths.size} 条`,
      },
      {
        id: 'no-skipped-operations',
        ok: openapi.stats.skipped === 0,
        detail: `skipped=${openapi.stats.skipped}（path 为空的端点会被跳过，正常应为 0）`,
      },
      {
        id: 'verb-defaulting-flagged',
        ok:
          openapi.stats.verbDefaulted === 0 || openapi.yaml.includes('x-mvgo-verb-inferred: true'),
        detail:
          `verbDefaulted=${openapi.stats.verbDefaulted}；` +
          (openapi.stats.verbDefaulted === 0
            ? '无占位方法，本条无适用对象'
            : '契约内必须出现 x-mvgo-verb-inferred: true'),
      },
      {
        id: 'envelope-honestly-flagged',
        ok: openapi.yaml.includes('x-mvgo-envelope-confirmed: ' + String(openapi.stats.envelopeConfirmed)),
        detail: `envelope.confirmed=${openapi.stats.envelopeConfirmed}，契约内标记必须与之一致`,
      },
      {
        id: 'decisions-cross-referenced',
        ok:
          decisions.length === 0 ||
          (openapi.yaml.includes('x-mvgo-decisions:') &&
            requirementsMd.includes('### Z.2 已裁决交叉引用')),
        detail: `已裁决 ${decisions.length} 条；契约与需求源都必须有交叉引用段`,
      },
      {
        id: 'no-truth-duplication',
        ok: !/^\|.*\bCF-[A-Z0-9-]+\b.*\|$/m.test(requirementsMd) || requirementsMd.includes('唯一真值是 `spec/decisions.md`'),
        detail: '需求源里的裁决表只能是索引，且必须声明唯一真值在 decisions.md',
      },
    ];

    const report = {
      runId,
      frozenAt,
      projectRoot: manifest.projectRoot ?? null,
      generator: 's2-contract-freezer.ts',
      openapi: {
        pathCount: openapi.stats.pathCount,
        operationCount: openapi.stats.operationCount,
        verbDeclared: openapi.stats.verbDeclared,
        verbDefaulted: openapi.stats.verbDefaulted,
        skipped: openapi.stats.skipped,
        byConfidence: openapi.stats.byConfidence,
        sha256: openapi.stats.sha256,
        bytes: openapi.stats.bytes,
      },
      envelope: {
        source: openapi.stats.envelopeSource,
        confirmed: openapi.stats.envelopeConfirmed,
        keys: Array.isArray(manifest?.S1?.envelope?.keys) ? manifest.S1.envelope.keys : [],
        successCode: manifest?.S1?.envelope?.successCode ?? null,
      },
      decisions: { total: decisions.length, ids: decisions.map((d) => d.conflictId) },
      pending: { conflicts: pendingConflicts, gaps: pendingGaps },
      // 🔴 字段名必须是 digests：`artifacts` 留给「产物文件清单」（与 inspectRun 同形），
      // 两者混用会让调用方拿到 Array 却按 Map 取，指纹校验静默恒假。
      digests,
      checks,
      allChecksOk: checks.every((c) => c.ok),
    };
    fs.writeFileSync(
      path.join(specDir, 'freeze-report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );

    this.logger.log(
      `[S2] 冻结完成 runId=${runId} path=${report.openapi.pathCount} ` +
        `verbDefaulted=${report.openapi.verbDefaulted} decisions=${decisions.length} ` +
        `allChecksOk=${report.allChecksOk}`,
    );

    return { ...report, artifacts: (await this.inspectRun(runId, userId)).artifacts };
  }

  /**
   * S3 代码生成：读取 S2 冻结的 OpenAPI 契约，确定性产出「前后端骨架」文件集合。
   *
   * 落点：`data/project-runs/<runId>/generated/`（与 S2 同根，绝不写用户项目目录）。
   * 类型降级为 any：S2 当前不吐字段级 components/schemas/*，真正类型化是未来增强。
   */
  async generate(runId: string, userId?: string) {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);

    const yamlPath = path.join(dir, 'spec', 'openapi.local.yaml');
    if (!fs.existsSync(yamlPath)) {
      throw new BadRequestException('尚未冻结契约，请先跑 S2 冻结（spec/openapi.local.yaml 不存在）');
    }

    const yamlText = fs.readFileSync(yamlPath, 'utf8');
    let contract: any;
    try {
      contract = yaml.load(yamlText);
    } catch (e: any) {
      throw new BadRequestException(`契约解析失败：${e.message}`);
    }
    if (!contract || typeof contract !== 'object' || !contract.paths) {
      throw new BadRequestException('契约内容异常：缺少 paths');
    }

    const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const result = buildCodeGen(contract, {
      runId,
      projectRoot: contract?.['x-mvgo-freeze']?.projectRoot ?? undefined,
      generatedAt,
    });

    const genDir = path.join(dir, 'generated');
    fs.mkdirSync(genDir, { recursive: true });
    for (const f of result.files) {
      const full = path.join(genDir, f.rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, f.content);
    }

    this.logger.log(
      `[S3] 代码生成完成 runId=${runId} backendControllers=${result.summary.backendControllers} ` +
        `frontendApis=${result.summary.frontendApis} files=${result.files.length}`,
    );

    return {
      generatedAt,
      runId,
      summary: result.summary,
      notes: result.notes,
      files: {
        backend: result.files.filter((f) => f.rel.startsWith('backend/')).map((f) => f.rel),
        frontend: result.files.filter((f) => f.rel.startsWith('frontend/')).map((f) => f.rel),
        meta: result.files
          .filter((f) => f.rel === 'manifest.json' || f.rel === 'README.md')
          .map((f) => f.rel),
      },
      artifacts: (await this.inspectRun(runId, userId)).artifacts,
    };
  }

  /**
   * S4 真·Vue 页面生成：读取 S2 冻结契约拿 projectRoot（原型 HTML 工程根），
   * 从原型页抽取结构/文案/样式，确定性生成真实 Vue3 SFC 到 generated/frontend/。
   *
   * 与 S3 同根：产物落 data/project-runs/<runId>/generated/，绝不写用户项目目录。
   * 零 LLM、可重入（再次调用覆盖 generated/frontend/ 下 S4 产出的文件）。
   */
  async generateVue(runId: string, userId?: string) {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);

    const yamlPath = path.join(dir, 'spec', 'openapi.local.yaml');
    if (!fs.existsSync(yamlPath)) {
      throw new BadRequestException('尚未冻结契约，请先跑 S2 冻结（spec/openapi.local.yaml 不存在）');
    }
    const contract: any = yaml.load(fs.readFileSync(yamlPath, 'utf8')) || {};
    const projectRoot: string | undefined = contract?.['x-mvgo-freeze']?.projectRoot ?? undefined;
    if (!projectRoot) {
      throw new BadRequestException('冻结契约缺少 projectRoot，无法定位原型工程根目录');
    }

    const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const genDir = path.join(dir, 'generated');
    // 读取 S4 接口绑定侧车（来自本运行目录 binding.json），烘焙进产物
    const bindingPath = path.join(dir, 'binding.json');
    let binding: any;
    if (fs.existsSync(bindingPath)) {
      try {
        const raw = fs.readFileSync(bindingPath, 'utf8');
        binding = raw.trim() ? JSON.parse(raw) : undefined;
      } catch {
        binding = undefined;
      }
    }
    // 读取 S4 组件嵌入侧车（来自本运行目录 embeds.json），烘焙进产物
    const embedsPath = path.join(dir, 'embeds.json');
    let embeds: any[] | undefined;
    if (fs.existsSync(embedsPath)) {
      try {
        const raw = fs.readFileSync(embedsPath, 'utf8');
        const parsed = raw.trim() ? JSON.parse(raw) : [];
        embeds = Array.isArray(parsed) ? parsed : parsed.embeds || [];
      } catch {
        embeds = undefined;
      }
    }
    const result = buildVueGen({ runId, projectRoot, generatedAt, generatedRoot: genDir, binding, embeds });

    const written: string[] = [];
    if (result.files.length) {
      for (const f of result.files) {
        const full = path.join(genDir, f.rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, f.content);
        written.push(f.rel);
      }
    }

    // 确定性 TEXT-TRUTH 轻量门禁：抽取文案/标题必须进产物
    const builtFiles: Record<string, string> = {};
    for (const f of result.files) builtFiles[f.rel] = f.content;
    const gate = verifyVueGen(result, builtFiles);

    this.logger.log(
      `[S4] 真·Vue 页面生成完成 runId=${runId} projectRoot=${projectRoot} ` +
        `pages=${result.extracts.length} files=${result.files.length} ` +
        `gatePass=${gate.pass}`,
    );

    return {
      generatedAt,
      runId,
      projectRoot,
      summary: {
        pages: result.extracts.length,
        files: result.files.length,
        components: result.files.filter((f) => f.rel.includes('/components/')).length,
      },
      gate: { pass: gate.pass, missingText: gate.missingText, missingHeadings: gate.missingHeadings },
      notes: result.notes,
      files: written,
      artifacts: (await this.inspectRun(runId, userId)).artifacts,
    };
  }

  /**
   * 读取 S4 接口绑定上下文：当前绑定侧车 + 可选 API 模块（tag→导出函数）+ 各视图数据槽。
   * 供前端 project-lab 在「对接接口」向导里填充下拉选项。
   */
  getBinding(runId: string) {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);
    const bindingPath = path.join(dir, 'binding.json');
    let binding: any;
    if (fs.existsSync(bindingPath)) {
      try {
        const raw = fs.readFileSync(bindingPath, 'utf8');
        binding = raw.trim() ? JSON.parse(raw) : null;
      } catch {
        binding = null;
      }
    }
    const genDir = path.join(dir, 'generated');
    const apiTags = this.readApiExports(genDir);
    let dataRefs: string[] = [];
    const metaPath = path.join(genDir, 'frontend', 's4-meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        // 默认取第一个视图的数据槽；多视图时前端按视图再细化
        dataRefs = (meta.views && meta.views[0] && meta.views[0].dataRefs) || [];
      } catch {
        dataRefs = [];
      }
    }
    return { success: true, runId, binding, apiTags, dataRefs };
  }

  /**
   * 写入 S4 接口绑定侧车（binding.json）。仅持久化，不触碰 bind-api 的
   * workspace/vue3-components 逻辑；写完后调用方应再跑一次 generate-vue 烘焙进产物。
   * 校验：tag 必须落在已生成的 api 模块、target 必须落在某视图数据槽。
   */
  setBinding(runId: string, dto: { tag: string; fn: string; params?: Record<string, any>; target: string }) {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);
    if (!dto || !dto.tag || !dto.fn || !dto.target) {
      throw new BadRequestException('绑定缺少必要字段：tag / fn / target');
    }
    const genDir = path.join(dir, 'generated');
    const apiTags = this.readApiExports(genDir);
    const matched = apiTags.find((t) => t.tag === dto.tag);
    if (!matched) {
      throw new BadRequestException(`绑定 tag 不存在于已生成 api 模块：${dto.tag}`);
    }
    if (!matched.functions.includes(dto.fn)) {
      throw new BadRequestException(`绑定 fn 不在该 tag 的导出函数中：${dto.tag}.${dto.fn}`);
    }
    let dataRefs: string[] = [];
    const metaPath = path.join(genDir, 'frontend', 's4-meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        for (const v of meta.views || []) dataRefs.push(...(v.dataRefs || []));
      } catch {
        /* ignore */
      }
    }
    if (!dataRefs.includes(dto.target)) {
      throw new BadRequestException(`绑定 target 不是任何视图的数据槽：${dto.target}`);
    }
    const binding = {
      tag: dto.tag,
      fn: dto.fn,
      params: dto.params || {},
      target: dto.target,
    };
    fs.writeFileSync(path.join(dir, 'binding.json'), JSON.stringify(binding, null, 2) + '\n', 'utf-8');
    this.logger.log(`[S4] 写入接口绑定侧车 runId=${runId} ${dto.tag}.${dto.fn} → ${dto.target}`);
    return { success: true, runId, binding };
  }

  /**
   * 读取 S4 组件嵌入上下文：当前嵌入侧车 + 各视图（供前端「插入组件」面板填充视图下拉）。
   */
  getEmbeds(runId: string) {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);
    const embedsPath = path.join(dir, 'embeds.json');
    let embeds: any[] = [];
    if (fs.existsSync(embedsPath)) {
      try {
        const raw = fs.readFileSync(embedsPath, 'utf8');
        const parsed = raw.trim() ? JSON.parse(raw) : [];
        embeds = Array.isArray(parsed) ? parsed : parsed.embeds || [];
      } catch {
        embeds = [];
      }
    }
    const genDir = path.join(dir, 'generated');
    let views: { viewName: string; pageName: string; dataRefs: string[]; blocks?: { index: number; tag: string; hint: string }[] }[] = [];
    const metaPath = path.join(genDir, 'frontend', 's4-meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        views = meta.views || [];
      } catch {
        views = [];
      }
    }
    return { success: true, runId, embeds, views };
  }

  /**
   * 写入 S4 组件嵌入侧车（embeds.json）。仅持久化，不触碰 bind-api 的
   * workspace/vue3-components 逻辑；写完后调用方应再跑一次 generate-vue 烘焙进产物。
   * 校验：每个嵌入项的 view 必须落在 s4-meta.json 的 views（若已生成）。
   */
  setEmbeds(runId: string, dto: { embeds?: any[] }) {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);
    const incoming = Array.isArray(dto?.embeds) ? dto.embeds : [];
    const genDir = path.join(dir, 'generated');
    let views: string[] = [];
    // view → 可插入区块数（用于校验 pos 越界）
    const blocksByView: Record<string, number> = {};
    const metaPath = path.join(genDir, 'frontend', 's4-meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        for (const v of meta.views || []) {
          views.push(v.viewName);
          blocksByView[v.viewName] = Array.isArray(v.blocks) ? v.blocks.length : 0;
        }
      } catch {
        /* ignore */
      }
    }
    const cleaned: any[] = [];
    for (const e of incoming) {
      if (!e || !e.componentId || !e.view) {
        throw new BadRequestException('嵌入项缺少必要字段：componentId / view');
      }
      if (views.length && !views.includes(e.view)) {
        throw new BadRequestException(`嵌入项的 view 不在已生成视图中：${e.view}`);
      }
      if (typeof e.pos === 'number') {
        const count = blocksByView[e.view];
        if (count !== undefined && (e.pos < 0 || e.pos > count)) {
          throw new BadRequestException(
            `嵌入项的 pos 越界（view=${e.view} 区块数=${count}）：${e.pos}`,
          );
        }
      }
      cleaned.push({
        view: String(e.view),
        componentId: String(e.componentId),
        groupId: e.groupId ? String(e.groupId) : undefined,
        slotKey: e.slotKey ? String(e.slotKey) : `embed-${cleaned.length + 1}`,
        pos: typeof e.pos === 'number' && Number.isFinite(e.pos) ? e.pos : undefined,
      });
    }
    fs.writeFileSync(path.join(dir, 'embeds.json'), JSON.stringify(cleaned, null, 2) + '\n', 'utf-8');
    this.logger.log(`[S4] 写入组件嵌入侧车 runId=${runId} count=${cleaned.length}`);
    return { success: true, runId, embeds: cleaned };
  }

  /**
   * 读取 generated/frontend/src/api/*.ts 的 tag 与其导出的函数名。
   * 🔴 判据单一来源：由 s4-vuegen#readApiModules（S4 默认自动接线同一解析器）派生，
   * 避免「绑定向导看得到、自动接线看不到」两处正则漂移。
   */
  private readApiExports(genDir: string): { tag: string; functions: string[] }[] {
    return readApiModules(genDir).map((m) => ({
      tag: m.tag,
      functions: m.functions.map((f) => f.name),
    }));
  }

  /**
   * S3 打包下载：把运行目录下的 generated/ 打成 zip（内存）返回。
   * 返回 Buffer + 文件名，由控制器以 StreamableFile 流出，避开全局信封拦截器。
   */
  async generateZip(runId: string, userId?: string): Promise<{ buffer: Buffer; filename: string }> {
    this.assertRunId(runId);
    const dir = path.join(RUNS_ROOT, runId);
    if (!fs.existsSync(dir)) throw new NotFoundException(`运行不存在：${runId}`);
    const genDir = path.join(dir, 'generated');
    if (!fs.existsSync(genDir)) {
      throw new BadRequestException('尚未生成代码（generated/ 不存在），请先跑 S3 生成');
    }
    const buffer = await this.zipDirectory(genDir);
    return { buffer, filename: `generated-${runId}.zip` };
  }

  /** 把目录打成 zip（内存 Buffer），zip 内根目录名为 generated */
  private zipDirectory(dir: string): Promise<Buffer> {
    const { PassThrough } = require('stream');
    return new Promise((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      const pt = new PassThrough();
      archive.on('error', reject);
      archive.on('warning', (e: { code?: string } & Error) => {
        if (e.code !== 'ENOENT') reject(e);
      });
      archive.pipe(pt);
      pt.on('data', (c: Buffer) => chunks.push(c));
      pt.on('end', () => resolve(Buffer.concat(chunks)));
      archive.directory(dir, 'generated');
      archive.finalize();
    });
  }

  /* ---------------------------------------------------------- artifact --- */

  /**
   * 按需生成单页截图（P0-2）。返回「目标 PNG 现在是否存在」。
   *
   * 扫描时**不再**预生成截图（那是接口 95.9% 的耗时来源），改为前端点开功能点时
   * 逐个 GET 这张 PNG 时才截这一页 —— 复用前端已有的懒加载链路，前端零改动。
   *
   * 🔴 有确定上界：内部 captureShots 的 launch/goto/screenshot/close 全部带显式超时 +
   *    单次总预算，任何失败都只返回 false（调用方维持原有 404 语义），
   *    **绝不**把一次 GET 变成新的 pending 路径。
   * 🔴 只截这一页（`captureShots` 已幂等：已存在的 PNG 跳过）；同页并发只截一次。
   */
  private async ensureShot(runId: string, rel: string): Promise<boolean> {
    const dir = path.join(RUNS_ROOT, runId);
    const full = path.join(dir, rel);
    if (fs.existsSync(full)) return true;
    const safe = rel.slice('spec/shots/'.length);
    const key = `${runId}/${safe}`;
    const running = this.shotInflight.get(key);
    if (running) return running;
    const task = (async (): Promise<boolean> => {
      try {
        let manifest: any = null;
        try {
          manifest = JSON.parse(
            fs.readFileSync(path.join(dir, 'spec', 'project.manifest.json'), 'utf8'),
          );
        } catch {
          return false;
        }
        const projectRoot: string | null = manifest?.projectRoot ?? null;
        const pages: any[] = Array.isArray(manifest?.S0?.html?.pages)
          ? manifest.S0.html.pages
          : [];
        if (!projectRoot || !pages.length) return false;
        // 由 `spec/shots/<safe>.png` 反查源页：用**同一个** shotName() 归一后比对
        // （与写入端 rule 完全一致，不做第二套命名）
        const hit = pages.find((p) => this.shotName(String(p?.path ?? p)) === safe);
        if (!hit) return false;
        const pageRel = String(hit?.path ?? hit);
        const map = await this.captureShots(dir, projectRoot, [{ path: pageRel }]);
        return Boolean(map[pageRel]) && fs.existsSync(full);
      } catch {
        return false;
      }
    })();
    this.shotInflight.set(key, task);
    try {
      return await task;
    } finally {
      this.shotInflight.delete(key);
    }
  }

  /** 读单个产物全文（白名单 + 大小上限）；截图不存在时**先按需生成再返回**（P0-2） */
  async readArtifact(runId: string, name: string) {
    this.assertRunId(runId);
    const rel = String(name ?? '').replace(/^\/+/, '');
    if (rel.includes('..')) {
      throw new BadRequestException(`路径不合法（含 .. 穿越）：${rel}`);
    }
    // 🔴 截图走独立前缀放行（精确白名单不含动态文件名）：仅允许 spec/shots/*.png，禁止 `..` 穿越
    const isShot = rel.startsWith('spec/shots/');
    const whitelisted = ARTIFACT_WHITELIST.some((w) => {
      if (w === rel) return true;
      // 支持末尾 /** 的目录级放行（如 generated/**）
      if (w.endsWith('/**')) return rel.startsWith(w.slice(0, -3));
      return false;
    });
    if (!isShot && !whitelisted) {
      throw new BadRequestException(
        `不允许读取 ${rel}；白名单：${ARTIFACT_WHITELIST.join(' / ')}`,
      );
    }
    if (isShot && (rel.includes('..') || !/^spec\/shots\/[A-Za-z0-9_一-龥.\-]+\.png$/i.test(rel))) {
      throw new BadRequestException(`截图路径不合法：${rel}`);
    }
    const full = path.join(RUNS_ROOT, runId, rel);
    // 🔴 懒生成：截图不在磁盘上 → 只截这一页（有超时上界），生成后照常返回；
    //    生成失败保持原有 404 语义。
    if (isShot && !fs.existsSync(full)) {
      await this.ensureShot(runId, rel).catch(() => false);
    }
    let buf: Buffer;
    try {
      buf = fs.readFileSync(full);
    } catch {
      throw new NotFoundException(`产物不存在：${runId}/${rel}（可能尚未跑到该阶段）`);
    }
    if (/\.png$/i.test(rel)) {
      // 截图：直接返回 base64 dataUrl，前端 <img> 直渲（避开文本解码与信封体积问题）
      return {
        runId,
        name: rel,
        bytes: buf.length,
        isImage: true,
        dataUrl: 'data:image/png;base64,' + buf.toString('base64'),
      };
    }

    const MAX = 4 * 1024 * 1024;
    const truncated = buf.length > MAX;
    const text = buf.subarray(0, MAX).toString('utf8');
    return {
      runId,
      name: rel,
      bytes: buf.length,
      truncated,
      mtime: fs.statSync(full).mtime.toISOString(),
      content: text,
      lines: text.split('\n').length,
    };
  }

  /** 列出某 run 的 generated/ 下全部产物文件（只读，供前端 S4/S3 文件清单展示） */
  listGeneratedFiles(runId: string): string[] {
    this.assertRunId(runId);
    const genDir = path.join(RUNS_ROOT, runId, 'generated');
    if (!fs.existsSync(genDir)) return [];
    const out: string[] = [];
    const walk = (dir: string, base: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = base ? `${base}/${e.name}` : e.name;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, rel);
        else out.push(rel);
      }
    };
    walk(genDir, '');
    return out.sort();
  }
}
