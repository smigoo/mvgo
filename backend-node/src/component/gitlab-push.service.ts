/**
 * GitLab 推送服务 — 将生成的组件产物推送到公司 GitLab 仓库指定分支
 *
 * 实现方式：GitLab Repository Files + Commits REST API（无需 git 客户端、无需服务器 SSH 凭证），
 * Access Token 由前端弹窗传入（PRIVATE-TOKEN 头）。
 *
 * 支持的仓库地址形式（公司实例 + 通用 GitLab）：
 *   - ssh://git@scm.microvideo.cn:8022/group/repo.git
 *   - git@scm.microvideo.cn:group/repo.git
 *   - https://scm.microvideo.cn/gitlab/group/repo.git
 *   - https://gitlab.example.com/group/repo.git
 *
 * 组件产物目录定位与 phase2.packageComponent 保持一致（根 workspace 优先，
 * 兼容 frontend/workspace 双目录），推送内容为组件目录全量（跳过 .checkpoint/.mc-gen/.cache
 * 等内部目录与质量备份），仓库内以 {componentId}/ 为前缀存放。
 */
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { readdir, readFile, stat } from 'fs/promises';
import { extname, join } from 'path';
import { ComponentService } from './component.service';
import {
  customComponentsDir,
  vue3ComponentsDir,
  frontendCustomComponentsDir,
  frontendVue3ComponentsDir,
  tempComponentsDir,
} from '../config/backend-root';
import { existsSync } from 'fs';

/** 提交信息类型枚举（与公司提交规范一致） */
export type CommitType = 'feat' | 'fix' | 'refactor' | 'test' | 'word' | 'conf';

/** 结构化提交信息（拼接成公司规范格式） */
export interface GitCommitInfo {
  code: string;
  reqcode: string;
  type: CommitType;
  note: string;
  aiCoding?: boolean;
}

export interface PushToGitLabOptions {
  /** 组件标识：Mongo _id / componentId / taskId 均可（复用组件服务解析） */
  identifier: string;
  userId: string;
  repoUrl: string;
  branch: string;
  accessToken: string;
  /** 向后兼容：旧的 commitMessage 字符串 */
  commitMessage?: string;
  /** 新的结构化提交信息（优先于 commitMessage） */
  commit?: GitCommitInfo;
}

/** 拼接公司提交规范格式的 commit message */
function buildCommitMessage(commit: GitCommitInfo): string {
  const lines = [
    `#code#${commit.code || '0'}`,
    `#reqcode#${commit.reqcode || '0'}`,
    `#note#[${commit.type}] ${commit.note || ''}`,
    commit.aiCoding ? '#ai-coding#' : '',
  ].filter(Boolean);
  return lines.join('\n');
}

/** 跳过推送的内部目录（点开头目录统一跳过，此处冗余兜底） */
const SKIP_DIRS = new Set(['.checkpoint', '.mc-gen', '.cache', '.git', 'node_modules']);

/** 二进制文件扩展名 → base64 编码推送；其余按 utf-8 文本推送 */
const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.pdf', '.mp4', '.mp3', '.docx', '.xlsx', '.pptx',
]);

/** GitLab API 每次分页条数 */
const TREE_PAGE_SIZE = 100;

@Injectable()
export class GitlabPushService {
  private readonly logger = new Logger(GitlabPushService.name);
  private readonly http: AxiosInstance;

  constructor(private readonly componentService: ComponentService) {
    // proxy: false — 显式禁用环境代理，避免系统代理干扰内网/公司 GitLab 请求
    this.http = axios.create({ timeout: 30_000, proxy: false });
  }

  /**
   * 推送组件到 GitLab
   */
  async pushComponent(options: PushToGitLabOptions) {
    const { identifier, userId, repoUrl, branch, accessToken, commitMessage } = options;

    if (!repoUrl?.trim() || !branch?.trim() || !accessToken?.trim()) {
      throw new HttpException('仓库URL、分支名称、Access Token 均为必填项', HttpStatus.BAD_REQUEST);
    }

    // 1. 鉴权 + 解析组件（复用组件服务，与下载/预览同一套授权规则）
    const authorized = await this.componentService.authorizeWorkspaceComponent(
      identifier,
      userId,
      'read',
    );
    const { componentId, groupId, target } = authorized;

    // 2. 定位产物目录（根 workspace 优先，frontend/workspace 兜底）
    const workspacePath = await this.resolveComponentDir(componentId, groupId, target);
    if (!workspacePath) {
      throw new HttpException(`组件产物目录不存在: ${componentId}`, HttpStatus.NOT_FOUND);
    }

    // 3. 收集发布文件
    const files = await this.collectFiles(workspacePath);
    if (files.length === 0) {
      throw new HttpException('组件目录为空，无文件可推送', HttpStatus.BAD_REQUEST);
    }

    // 4. 解析仓库地址 → API 基址 + 项目路径
    const { apiBase, projectPath } = this.parseRepoUrl(repoUrl);
    const headers = { 'PRIVATE-TOKEN': accessToken.trim() };

    // 5. 解析项目 ID（快路径用 URL 编码路径；公司实例对 %2F 编码路径查询 404 时，
    //    兜底走「父组内按名称搜索 + path_with_namespace 精确匹配」拿数字 ID）
    const projectId = await this.resolveProjectId(apiBase, projectPath, headers);
    const encodedProject = String(projectId);
    const projectInfo = await this.gitlabGet<{ default_branch?: string; web_url?: string }>(
      `${apiBase}/projects/${encodedProject}`,
      headers,
    );
    const defaultBranch = projectInfo?.default_branch || 'main';
    const targetBranch = branch.trim() || defaultBranch;

    // 6. 目标分支不存在则从默认分支自动创建
    const branchExists = await this.branchExists(apiBase, encodedProject, targetBranch, headers);
    if (!branchExists) {
      await this.createBranch(apiBase, encodedProject, targetBranch, defaultBranch, headers);
      this.logger.log(`自动创建分支 ${projectPath}#${targetBranch}（基于 ${defaultBranch}）`);
    }

    // 7. 拉取分支已有文件列表，决定 create / update
    const existingFiles = new Set(
      await this.listTree(apiBase, encodedProject, targetBranch, headers),
    );

    // 8. 构造 commits actions（仓库内以 {componentId}/ 为前缀）
    const actions: Record<string, string>[] = [];
    for (const file of files) {
      const filePath = `${componentId}/${file.relative}`;
      const buf = await readFile(file.fullPath);
      const isBinary = BINARY_EXTS.has(extname(file.fullPath).toLowerCase());
      actions.push({
        action: existingFiles.has(filePath) ? 'update' : 'create',
        file_path: filePath,
        ...(isBinary
          ? { content: buf.toString('base64'), encoding: 'base64' }
          : { content: buf.toString('utf-8') }),
      });
    }

    // 9. 提交
    let resolvedCommitMessage: string;
    if (options.commit) {
      // 新版：结构化提交信息 → 拼接公司规范格式
      resolvedCommitMessage = buildCommitMessage(options.commit);
    } else {
      // 旧版：直接字符串（向后兼容）
      resolvedCommitMessage = commitMessage?.trim() || `feat: 新增组件 ${componentId}\n\n#code#0\n#reqcode#0\n#note#[feat] 新增组件 ${componentId}\n#ai-coding#`;
    }
    let commit: { id?: string; title?: string; web_url?: string };
    try {
      commit = await this.gitlabPost(
        `${apiBase}/projects/${encodedProject}/repository/commits`,
        headers,
        {
          branch: targetBranch,
          commit_message: resolvedCommitMessage,
          actions,
        },
      );
    } catch (error) {
      const message = error instanceof HttpException ? error.message : String(error);
      throw new HttpException(
        `GitLab 提交失败: ${message}（若提示请求体过大，请压缩组件资源或改用本地 git 推送）`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    this.logger.log(`组件 ${componentId} 已推送到 ${projectPath}#${targetBranch}，共 ${files.length} 个文件`);

    return {
      success: true,
      message: `已推送到 ${projectPath}#${targetBranch}（${files.length} 个文件）`,
      data: {
        projectPath,
        branch: targetBranch,
        componentId,
        files: files.length,
        commitId: commit?.id ? commit.id.slice(0, 8) : '',
        commitMessage: commit?.title || resolvedCommitMessage,
        webUrl: commit?.web_url || projectInfo?.web_url || '',
      },
    };
  }

  /**
   * 定位组件产物目录：与 phase2.packageComponent 同规则，根 workspace 优先，前端 workspace 兜底，
   * 失败任务的产物可能在 temp-components 目录（按 groupId/componentId 或前缀匹配）
   */
  private async resolveComponentDir(
    componentId: string,
    groupId?: string,
    target?: string,
  ): Promise<string | null> {
    const bases =
      target === 'vue3' && groupId
        ? [
            join(vue3ComponentsDir, groupId, componentId),
            join(frontendVue3ComponentsDir(), groupId, componentId),
          ]
        : [
            join(customComponentsDir, componentId),
            join(frontendCustomComponentsDir(), componentId),
          ];

    for (const base of bases) {
      try {
        if ((await stat(base)).isDirectory()) return base;
      } catch {
        /* 目录不存在，继续下一候选 */
      }
    }

    // 失败任务的产物可能在 temp-components 目录
    if (existsSync(tempComponentsDir)) {
      const groupIds = groupId ? [groupId] : await this._listTempGroupIds();
      for (const gid of groupIds) {
        const tempDir = await this._findTempComponentDir(tempComponentsDir, gid, componentId);
        if (tempDir) return tempDir;
      }
    }

    return null;
  }

  /**
   * 列出 temp-components 下的所有 groupId 目录
   */
  private async _listTempGroupIds(): Promise<string[]> {
    try {
      const entries = await readdir(tempComponentsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_shared-cache')
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  /**
   * 在 temp-components/{groupId}/ 下查找 componentId 目录（支持精确匹配或前缀匹配）
   */
  private async _findTempComponentDir(
    baseTemp: string,
    groupId: string,
    componentId: string,
  ): Promise<string | null> {
    const groupDir = join(baseTemp, groupId);
    const exact = join(groupDir, componentId);
    if (existsSync(exact)) return exact;
    // 前缀匹配（失败任务的目录名可能是 componentId-xxx）
    try {
      const entries = await readdir(groupDir, { withFileTypes: true });
      const match = entries.find(
        (entry) => entry.isDirectory() && entry.name.startsWith(`${componentId}-`),
      );
      return match ? join(groupDir, match.name) : null;
    } catch {
      return null;
    }
  }

  /**
   * 递归收集组件目录下所有发布文件
   * 跳过：点开头目录（.checkpoint/.mc-gen/.cache 等）、quality-backup 质量备份、_figma-size.json 内部元数据
   */
  private async collectFiles(
    root: string,
  ): Promise<{ relative: string; fullPath: string }[]> {
    const out: { relative: string; fullPath: string }[] = [];

    const walk = async (dir: string, rel: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.includes('quality-backup')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, rel ? `${rel}/${entry.name}` : entry.name);
        } else {
          if (entry.name === '_figma-size.json') continue;
          out.push({
            relative: rel ? `${rel}/${entry.name}` : entry.name,
            fullPath: full,
          });
        }
      }
    };

    await walk(root, '');
    return out.sort((a, b) => a.relative.localeCompare(b.relative));
  }

  /**
   * 解析仓库地址 → { apiBase, projectPath }
   * 支持 ssh:// / https:// / scp-like(git@host:path) 三种形式
   */
  private parseRepoUrl(repoUrl: string): { apiBase: string; projectPath: string } {
    const trimmed = repoUrl.trim();
    let host = '';
    let path = '';
    let m: RegExpMatchArray | null;

    // ssh://git@host:8022/group/repo.git
    if ((m = trimmed.match(/^ssh:\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+?)(?:\.git)?$/))) {
      host = m[1];
      path = m[2];
    }
    // https://host/gitlab/group/repo.git 或 https://host/group/repo.git
    else if (
      (m = trimmed.match(/^https?:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?$/))
    ) {
      host = m[1];
      path = m[2];
    }
    // git@host:group/repo.git（scp-like）
    else if ((m = trimmed.match(/^(?:[^@/]+@)?([^/:]+):(.+?)(?:\.git)?$/))) {
      host = m[1];
      path = m[2];
    } else {
      throw new HttpException(
        `无法解析仓库地址: ${repoUrl}（支持 ssh://、https://、git@host:path 三种格式）`,
        HttpStatus.BAD_REQUEST,
      );
    }

    path = path.replace(/\/+$/, '');
    if (!path || !path.includes('/')) {
      throw new HttpException(
        `仓库地址缺少项目路径（需含组，如 opensource/mvgo/components）: ${repoUrl}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // API 基址推导：公司实例固定 /gitlab/api/v4；通用 https 地址若 path 带 gitlab/ 前缀则保留
    let apiBase: string;
    if (host === 'scm.microvideo.cn') {
      apiBase = `https://scm.microvideo.cn/gitlab/api/v4`;
      if (path.startsWith('gitlab/')) path = path.slice('gitlab/'.length);
    } else if (path.startsWith('gitlab/')) {
      apiBase = `https://${host}/gitlab/api/v4`;
      path = path.slice('gitlab/'.length);
    } else {
      apiBase = `https://${host}/api/v4`;
    }

    return { apiBase, projectPath: path };
  }

  /**
   * 解析 GitLab 项目数字 ID
   * 快路径：GET /projects/{url-encoded-path}（标准 GitLab 均支持）
   * 兜底：部分自建实例（如 scm.microvideo.cn）对 %2F 编码的多级路径统一 404，
   *       改用 search 链：/groups?search={组名} → 组 id → /groups/{id}/projects?search={仓库名} → 项目 id
   */
  private async resolveProjectId(
    apiBase: string,
    projectPath: string,
    headers: Record<string, string>,
  ): Promise<number> {
    try {
      const info = await this.gitlabGet<{ id: number }>(
        `${apiBase}/projects/${encodeURIComponent(projectPath)}`,
        headers,
      );
      return info.id;
    } catch (error) {
      if (!(error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND)) {
        throw error;
      }
    }

    const idx = projectPath.lastIndexOf('/');
    if (idx > 0) {
      const groupPath = projectPath.slice(0, idx);
      const repoName = projectPath.slice(idx + 1);
      const groupName = groupPath.slice(groupPath.lastIndexOf('/') + 1);

      // 1) 解析父组 id（search 按组 path 匹配，再精确比对 full_path）
      const groups = await this.gitlabGet<
        { id: number; full_path?: string }[]
      >(
        `${apiBase}/groups?search=${encodeURIComponent(groupName)}&per_page=50`,
        headers,
      );
      const group = (groups || []).find((g) => g.full_path === groupPath);
      if (group?.id) {
        // 2) 组内按仓库名搜索，精确匹配 path_with_namespace
        const items = await this.gitlabGet<
          { id: number; path_with_namespace?: string }[]
        >(
          `${apiBase}/groups/${group.id}/projects?search=${encodeURIComponent(
            repoName,
          )}&simple=true&per_page=50`,
          headers,
        );
        const hit = (items || []).find((p) => p.path_with_namespace === projectPath);
        if (hit) return hit.id;
      }
    }

    throw new HttpException(
      `GitLab 项目不存在或无访问权限: ${projectPath}（请检查 Token 与仓库路径）`,
      HttpStatus.BAD_REQUEST,
    );
  }

  private async gitlabGet<T = any>(
    url: string,
    headers: Record<string, string>,
  ): Promise<T> {
    try {
      const res = await this.http.get<T>(url, { headers });
      return res.data;
    } catch (error: any) {
      this.throwGitlabError(error, url);
    }
  }

  private async gitlabPost<T = any>(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<T> {
    try {
      const res = await this.http.post<T>(url, body, { headers });
      return res.data;
    } catch (error: any) {
      this.throwGitlabError(error, url);
    }
  }

  private throwGitlabError(error: any, url: string): never {
    const status = error?.response?.status;
    const detail =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      '未知错误';
    const message = Array.isArray(detail) ? detail.join('; ') : detail;
    if (status === 404) {
      throw new HttpException(`GitLab 资源不存在(404): ${url}`, HttpStatus.NOT_FOUND);
    }
    if (status === 401 || status === 403) {
      throw new HttpException(
        `GitLab 鉴权失败(${status}): Token 无效或无权限，${message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    throw new HttpException(
      `GitLab 请求失败(${status || '网络'}): ${message}`,
      status ? HttpStatus.BAD_GATEWAY : HttpStatus.GATEWAY_TIMEOUT,
    );
  }

  /**
   * 判断分支是否存在
   * 用 repository/branches?search= 查询参数判断（query 值无 %2F 路径编码问题，
   * 兼容分支名含斜杠如 feat/xxx 与公司实例对 %2F 编码路径 404 的情况），再精确比对 name
   */
  private async branchExists(
    apiBase: string,
    encodedProject: string,
    branch: string,
    headers: Record<string, string>,
  ): Promise<boolean> {
    const items = await this.gitlabGet<{ name?: string }[]>(
      `${apiBase}/projects/${encodedProject}/repository/branches?search=${encodeURIComponent(
        branch,
      )}&per_page=100`,
      headers,
    );
    return (items || []).some((b) => b.name === branch);
  }

  private async createBranch(
    apiBase: string,
    encodedProject: string,
    branch: string,
    ref: string,
    headers: Record<string, string>,
  ): Promise<void> {
    try {
      await this.gitlabPost(
        `${apiBase}/projects/${encodedProject}/repository/branches`,
        headers,
        { branch, ref },
      );
    } catch (error) {
      // 并发场景下分支可能已被创建，幂等重查
      if (await this.branchExists(apiBase, encodedProject, branch, headers)) return;
      throw error;
    }
  }

  /**
   * 代理 GitLab API GET 请求（用于前端动态加载项目列表等场景）
   */
  async proxyGitLabGet(accessToken: string, endpoint: string) {
    if (!accessToken?.trim() || !endpoint?.trim()) {
      throw new HttpException('Access Token 和 endpoint 必填', HttpStatus.BAD_REQUEST);
    }
    const headers = { 'PRIVATE-TOKEN': accessToken.trim() };
    // 公司实例固定 apiBase
    const apiBase = 'https://scm.microvideo.cn/gitlab/api/v4';
    return await this.gitlabGet(`${apiBase}${endpoint}`, headers);
  }

  /**
   * 列出当前 Token 用户参与的项目（供前端下拉选择）
   */
  async listProjects(accessToken: string) {
    if (!accessToken?.trim()) {
      throw new HttpException('Access Token 必填', HttpStatus.BAD_REQUEST);
    }
    const headers = { 'PRIVATE-TOKEN': accessToken.trim() };
    // 公司实例固定 apiBase
    const apiBase = 'https://scm.microvideo.cn/gitlab/api/v4';
    const projects = await this.gitlabGet<
      { id: number; name: string; path_with_namespace: string; http_url_to_repo: string }[]
    >(`${apiBase}/projects?membership=true&per_page=100&order_by=last_activity_at`, headers);
    return (projects || []).map((p) => ({
      id: p.id,
      name: p.name,
      pathWithNamespace: p.path_with_namespace,
      httpUrlToRepo: p.http_url_to_repo,
    }));
  }

  /**
   * 列出指定项目的分支（供前端下拉选择）
   */
  async listBranches(accessToken: string, repoUrl: string) {
    if (!accessToken?.trim() || !repoUrl?.trim()) {
      throw new HttpException('Access Token 和 项目 URL 必填', HttpStatus.BAD_REQUEST);
    }
    const { apiBase, projectPath } = this.parseRepoUrl(repoUrl);
    const headers = { 'PRIVATE-TOKEN': accessToken.trim() };
    // 先解析项目 ID
    const projectId = await this.resolveProjectId(apiBase, projectPath, headers);
    const branches = await this.gitlabGet<{ name: string; default?: boolean }[]>(
      `${apiBase}/projects/${projectId}/repository/branches?per_page=100`,
      headers,
    );
    return (branches || []).map((b) => ({
      name: b.name,
      isDefault: !!b.default,
    }));
  }

  /**
   * 递归拉取分支文件路径列表（分页），用于 create/update 判定
   */
  private async listTree(
    apiBase: string,
    encodedProject: string,
    branch: string,
    headers: Record<string, string>,
  ): Promise<string[]> {
    const paths: string[] = [];
    let page = 1;
    for (;;) {
      const url = `${apiBase}/projects/${encodedProject}/repository/tree?ref=${encodeURIComponent(
        branch,
      )}&recursive=true&per_page=${TREE_PAGE_SIZE}&page=${page}`;
      const items: { path?: string }[] = await this.gitlabGet(url, headers);
      for (const item of items) {
        if (item?.path) paths.push(item.path);
      }
      if (items.length < TREE_PAGE_SIZE) break;
      page += 1;
    }
    return paths;
  }
}
