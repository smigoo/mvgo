/**
 * Figma API 客户端
 * 封装 Figma REST API 调用，处理认证、错误、重试
 */

import https from 'https';
import { getFigmaRateLimiter } from '../../utils/figma-rate-limiter.js';

export class FigmaClient {
  constructor(config = {}) {
    // 🔒 强制用户配置：不再回退到环境变量
    if (!config.token) {
      throw new Error(
        'FigmaClient: 缺少 Figma Token 配置，请在用户配置中设置 Figma 访问令牌',
      );
    }
    this.token = config.token;
    this.baseUrl = 'https://api.figma.com/v1';
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;

    // 限流器：优先用调用方传入的实例（如预览专用宽松限流器），否则用全局单例
    this._rateLimiter = config.rateLimiter || getFigmaRateLimiter();
  }

  /**
   * 获取 Figma 节点数据
   * @param {string} fileKey - Figma 文件 Key
   * @param {string} nodeId - 节点 ID
   * @param {Object} [options] - 可选参数
   * @param {number} [options.depth] - 节点树深度（不传=Figma 默认返回完整子树；传 1 只返回目标节点自身属性，适合只需 name/bbox 的预览场景）
   * @returns {Promise<Object>} 节点数据
   */
  async getNode(fileKey, nodeId, options = {}) {
    const url = `${this.baseUrl}/files/${fileKey}/nodes?ids=${nodeId}${options.depth ? `&depth=${options.depth}` : ''}`;

    try {
      const response = await this.request(url);

      if (response.err) {
        throw new Error(`Figma API 错误: ${response.err}`);
      }

      const nodeData = response.nodes[nodeId];
      if (!nodeData) {
        throw new Error(`节点不存在: ${nodeId}`);
      }

      return nodeData.document;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * 获取文件信息
   * @param {string} fileKey - Figma 文件 Key
   * @returns {Promise<Object>} 文件数据
   */
  async getFile(fileKey) {
    const url = `${this.baseUrl}/files/${fileKey}`;
    return await this.request(url);
  }

  /**
   * 导出图片
   * @param {string} fileKey - Figma 文件 Key
   * @param {string} nodeId - 节点 ID
   * @param {Object} options - 导出选项
   * @returns {Promise<string>} 图片 URL
   */
  async exportImage(fileKey, nodeId, options = {}) {
    const format = options.format || 'png';
    const scale = options.scale || 1;

    const url = `${this.baseUrl}/images/${fileKey}?ids=${nodeId}&format=${format}&scale=${scale}`;

    try {
      const response = await this.request(url);

      if (response.err) {
        throw new Error(`Figma API 错误: ${response.err}`);
      }

      if (!response.images || !response.images[nodeId]) {
        throw new Error(`无法导出图片，节点 ID: ${nodeId}`);
      }

      return response.images[nodeId];
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * 执行 HTTP 请求（限流 + 429 全局冷却 + 长退避重试）
   *接入全局速率限制器：发送前 acquire（最小间隔 + 并发上限 + 429 冷却），
   *    429 时触发全局冷却（尊重 Retry-After，默认 30s 起封顶 120s）后长退避重试。
   * @private
   */
  async request(url, attempt = 1) {
    // 🎯 生成管线专用限流等待预算：并行任务共享单并发槽（间隔 7s + 单请求最长 30s 持槽），
    // 20s 默认超时是 preview 接口防 nginx 504 的设计，对后台生成任务必超时
    // （用户实测报「限流器等待超时（冷却剩余 0s，活跃 1/1）」即排队被砍）。
    const acquireTimeoutMs = Number(
      process.env.FIGMA_ACQUIRE_TIMEOUT_MS ?? 120000,
    );
    const release = await this._rateLimiter.acquire(acquireTimeoutMs);
    let json, requestError;
    try {
      json = await this._requestOnce(url);
    } catch (error) {
      requestError = error;
    } finally {
      // 🛑 必须在进入重试等待前释放并发槽：原实现递归 request() 在持槽状态下
      // 重新 acquire（外层 finally 要等递归返回才释放），会自己等自己的槽 →
      // 「限流器等待超时（活跃 N/N）」自锁。先释放再重试，避免任何并发度下死锁。
      release();
    }
    if (!requestError) return json;

    const is429 = requestError.statusCode === 429;
    const isNetwork =
      requestError.code === 'ECONNRESET' ||
      requestError.code === 'ETIMEDOUT' ||
      requestError.code === 'ENOTFOUND' ||
      requestError.message === 'Request timeout';
    if ((is429 || isNetwork) && attempt < this.retries) {
      if (is429) {
        //触发全局冷却，避免其他请求继续打 Figma 触发更久的限流
        this._rateLimiter.noteRateLimited(this._parseRetryAfter(requestError));
      }
      // 429：尊重 Retry-After，否则阶梯 30s/60s/120s；network/timeout：短退避
      // （此时已释放并发槽，递归重新 acquire 不会自锁；冷却等待在槽外进行）
      const waitSec = is429
        ? Math.min(
            this._parseRetryAfter(requestError) ||
              Math.min(30 * Math.pow(2, attempt - 1), 120),
            120,
          )
        : (this.retryDelay * attempt) / 1000;
      await this.sleep(waitSec * 1000);
      return this.request(url, attempt + 1);
    }
    throw requestError;
  }

  /**
   * 单次 HTTP 请求（不含重试/限流），返回解析后的 JSON
   * @private
   */
  _requestOnce(url) {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: { 'X-Figma-Token': this.token },
          timeout: this.timeout,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (res.statusCode >= 400) {
                const error = new Error(json.err || `HTTP ${res.statusCode}`);
                error.statusCode = res.statusCode;
                //带上 Retry-After 供限流器使用
                error.retryAfter =
                  res.headers?.['retry-after'] || res.headers?.['Retry-After'];
                reject(error);
                return;
              }
              resolve(json);
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error.message}`));
            }
          });
        },
      );
      req.on('error', (error) => reject(error));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 从错误对象解析 Figma 的 Retry-After（秒）
   * @private
   */
  _parseRetryAfter(error) {
    const ra = error?.retryAfter;
    if (!ra) return null;
    const sec = parseInt(ra, 10);
    if (!isNaN(sec)) return sec;
    const d = new Date(ra);
    if (!isNaN(d.getTime()))
      return Math.max(1, Math.ceil((d.getTime() - Date.now()) / 1000));
    return null;
  }

  /**
   * 错误处理
   * @private
   */
  handleError(error) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      throw new Error('Figma Token 无效或权限不足，请检查 FIGMA_ACCESS_TOKEN');
    }
    if (error.statusCode === 404) {
      throw new Error('Figma 文件或节点不存在');
    }
    throw error;
  }

  /**
   * 延迟函数
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
