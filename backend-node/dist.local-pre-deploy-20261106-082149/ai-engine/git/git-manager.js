/**
 * Git 管理器
 * 提供 Git 操作的统一接口（基于 child_process 调用本地 git 命令行）
 *
 * 安全说明：
 * - 所有命令通过 execFileSync('git', args) 执行，不经过 shell，天然避免命令注入
 * - 文件路径参数统一使用 `git add -- <files>` 的 `--` 分隔符，防止文件名被当作选项解析
 * - 分支/标签/提交引用做基础白名单校验，拒绝空白开头或含非法字符的引用
 */

import { execFileSync } from 'child_process';
import { join } from 'path';
import { dataDir } from '../../config/backend-root.js';

export class GitManager {
  constructor(options = {}) {
    this.repoPath = options.repoPath || join(dataDir, 'ai-repos');
    this.defaultBranch = options.defaultBranch || 'main';
    this.remote = options.remote || 'origin';
    this.author = options.author || {
      name: 'LangGraph Server',
      email: 'langgraph@example.com',
    };
  }

  /**
   * 执行 git 命令并返回 stdout（utf-8 字符串）
   * @private
   */
  _run(args, opts = {}) {
    try {
      const out = execFileSync('git', args, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 50 * 1024 * 1024,
        ...opts,
      });
      return typeof out === 'string' ? out : '';
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : '';
      const stdout = err.stdout ? err.stdout.toString() : '';
      const msg = (stderr || stdout || err.message || '').trim();
      throw new Error(`git ${args.join(' ')} 执行失败: ${msg}`);
    }
  }

  /**
   * 校验引用名（分支/标签/提交）是否安全
   * @private
   */
  _assertSafeRef(ref, label = '引用') {
    if (typeof ref !== 'string' || ref.length === 0) {
      throw new Error(`${label}不能为空`);
    }
    if (/^\s/.test(ref) || /\s/.test(ref)) {
      throw new Error(`${label}不能包含空白字符: ${ref}`);
    }
    if (ref.startsWith('-')) {
      throw new Error(`${label}不能以 "-" 开头: ${ref}`);
    }
  }

  /**
   * 检查是否是 Git 仓库
   * @returns {Promise<boolean>}
   */
  async isGitRepo() {
    try {
      const out = this._run(['rev-parse', '--is-inside-work-tree']);
      return out.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * 初始化 Git 仓库
   * @returns {Promise<void>}
   */
  async init() {
    this._run(['init']);
  }

  /**
   * 获取当前分支
   * @returns {Promise<string>}
   */
  async getCurrentBranch() {
    try {
      const out = this._run(['branch', '--show-current']).trim();
      return out || this.defaultBranch;
    } catch {
      return this.defaultBranch;
    }
  }

  /**
   * 创建新分支
   * @param {string} branchName - 分支名称
   * @param {string} [baseBranch] - 基础分支
   * @returns {Promise<void>}
   */
  async createBranch(branchName, baseBranch = null) {
    this._assertSafeRef(branchName, '分支名');
    if (baseBranch) this._assertSafeRef(baseBranch, '基础分支');
    const args = baseBranch
      ? ['branch', branchName, baseBranch]
      : ['branch', branchName];
    this._run(args);
  }

  /**
   * 切换分支
   * @param {string} branchName
   * @returns {Promise<void>}
   */
  async checkout(branchName) {
    this._assertSafeRef(branchName, '分支名');
    this._run(['checkout', branchName]);
  }

  /**
   * 添加文件到暂存区
   * @param {string|string[]} files
   * @returns {Promise<void>}
   */
  async add(files) {
    const list = Array.isArray(files) ? files : [files];
    const cleaned = list
      .map((f) => (f || '').toString().trim())
      .filter((f) => f.length > 0);
    if (cleaned.length === 0) return;
    // `--` 防止文件名被当成选项解析
    this._run(['add', '--', ...cleaned]);
  }

  /**
   * 提交更改
   * @param {string} message
   * @param {Object} [options]
   * @returns {Promise<string>} 提交 SHA
   */
  async commit(message, options = {}) {
    if (!message || !message.trim()) {
      throw new Error('提交信息不能为空');
    }
    const args = ['commit', '-m', message];
    if (options.author) args.push('--author', options.author);
    if (options.amend) args.push('--amend');
    if (options.noVerify) args.push('--no-verify');
    this._run(args);
    // 返回最新提交 SHA
    return this._run(['rev-parse', 'HEAD']).trim();
  }

  /**
   * 推送到远程仓库
   * @param {string} [branch]
   * @param {Object} [options]
   * @returns {Promise<void>}
   */
  async push(branch = null, options = {}) {
    const args = ['push'];
    if (options.force) args.push('--force');
    if (branch) {
      this._assertSafeRef(branch, '分支名');
      if (options.setUpstream) args.push('-u');
      args.push(this.remote, branch);
    } else if (options.setUpstream) {
      args.push('-u');
    }
    this._run(args);
  }

  /**
   * 拉取远程更改
   * @param {string} [branch]
   * @returns {Promise<void>}
   */
  async pull(branch = null) {
    const args = ['pull'];
    if (branch) {
      this._assertSafeRef(branch, '分支名');
      args.push(this.remote, branch);
    }
    this._run(args);
  }

  /**
   * 获取状态
   * @returns {Promise<Object>}
   */
  async status() {
    const out = this._run(['status', '--porcelain']).trim();
    const result = {
      modified: [],
      added: [],
      deleted: [],
      untracked: [],
      renamed: [],
    };
    if (!out) return result;
    for (const line of out.split('\n')) {
      if (!line) continue;
      const code = line.slice(0, 2);
      const file = line.slice(3);
      if (code.includes('?')) {
        result.untracked.push(file);
      } else {
        if (code[0] === 'M' || code[1] === 'M') result.modified.push(file);
        if (code[0] === 'A' || code[1] === 'A') result.added.push(file);
        if (code[0] === 'D' || code[1] === 'D') result.deleted.push(file);
        if (code.includes('R')) result.renamed.push(file);
      }
    }
    return result;
  }

  /**
   * 获取提交历史
   * @param {number} [limit=10]
   * @returns {Promise<Array>}
   */
  async log(limit = 10) {
    const max = Math.max(1, parseInt(limit, 10) || 10);
    const format = '%H%x1f%an%x1f%ae%x1f%ad%x1f%s';
    const out = this._run([
      'log',
      `--max-count=${max}`,
      `--pretty=format:${format}`,
      '--date=iso',
    ]).trim();
    if (!out) return [];
    return out.split('\n').map((line) => {
      const idx = line.split('\x1f');
      const [sha, author, email, date, ...rest] = idx;
      return {
        sha: sha || '',
        author: author || '',
        email: email || '',
        date: date || '',
        message: rest.join('\x1f'),
      };
    });
  }

  /**
   * 检查是否有未提交的更改
   * @returns {Promise<boolean>}
   */
  async hasUncommittedChanges() {
    const out = this._run(['status', '--porcelain']).trim();
    return out.length > 0;
  }

  /**
   * 暂存更改
   * @param {string} [message]
   * @returns {Promise<void>}
   */
  async stash(message = null) {
    const args = ['stash', 'push'];
    if (message) args.push('-m', message);
    this._run(args);
  }

  /**
   * 恢复暂存的更改
   * @returns {Promise<void>}
   */
  async stashPop() {
    this._run(['stash', 'pop']);
  }

  /**
   * 创建标签
   * @param {string} tagName
   * @param {string} [message]
   * @returns {Promise<void>}
   */
  async createTag(tagName, message = null) {
    this._assertSafeRef(tagName, '标签名');
    const args = ['tag', '-a', tagName, '-m', message || tagName];
    this._run(args);
  }

  /**
   * 推送标签
   * @param {string} tagName
   * @returns {Promise<void>}
   */
  async pushTag(tagName) {
    this._assertSafeRef(tagName, '标签名');
    this._run(['push', this.remote, tagName]);
  }

  /**
   * 合并分支
   * @param {string} branchName
   * @param {Object} [options]
   * @returns {Promise<void>}
   */
  async merge(branchName, options = {}) {
    this._assertSafeRef(branchName, '分支名');
    const args = ['merge'];
    if (options.noFf) args.push('--no-ff');
    if (options.squash) args.push('--squash');
    args.push(branchName);
    this._run(args);
  }

  /**
   * 重置到指定提交
   * @param {string} commit
   * @param {string} [mode=soft|mixed|hard]
   * @returns {Promise<void>}
   */
  async reset(commit, mode = 'mixed') {
    const allowed = ['soft', 'mixed', 'hard', 'merge', 'keep'];
    const m = allowed.includes(mode) ? mode : 'mixed';
    this._run(['reset', `--${m}`, commit]);
  }

  /**
   * 获取差异
   * @param {string} [from]
   * @param {string} [to]
   * @returns {Promise<string>}
   */
  async diff(from = null, to = null) {
    const args = ['diff'];
    if (from && to) args.push(`${from}..${to}`);
    else if (from) args.push(from);
    return this._run(args).trim();
  }

  /**
   * 一键提交并推送
   * 便捷方法：add + commit + push
   * @param {string|string[]} files - 要提交的文件
   * @param {string} message - 提交消息
   * @param {Object} options - 选项
   * @returns {Promise<string>} 提交 SHA
   */
  async commitAndPush(files, message, options = {}) {
    const { branch = null, createBranch = false, branchName = null } = options;

    try {
      // 如果需要创建分支
      if (createBranch && branchName) {
        await this.createBranch(branchName);
        await this.checkout(branchName);
      }

      // 添加文件
      await this.add(files);

      // 提交
      const sha = await this.commit(message);

      // 推送（转发 options 以保留 setUpstream / force 等选项）
      const targetBranch = branch || branchName || (await this.getCurrentBranch());
      await this.push(targetBranch, options);

      return sha;
    } catch (error) {
      throw new Error(`Commit and push failed: ${error.message}`);
    }
  }
}

// 默认 Git 管理器实例
let defaultGitManager = null;

/**
 * 获取默认 Git 管理器
 * @returns {GitManager}
 */
export function getDefaultGitManager() {
  if (!defaultGitManager) {
    defaultGitManager = new GitManager();
  }
  return defaultGitManager;
}

/**
 * 创建新的 Git 管理器实例
 * @param {Object} options - 配置选项
 * @returns {GitManager}
 */
export function createGitManager(options) {
  return new GitManager(options);
}
