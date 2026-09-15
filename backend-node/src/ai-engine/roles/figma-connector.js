/**
 * Figma Connector - Figma连接器
 * 职责：获取Figma数据和下载资源
 * 特点：非AI角色，纯数据获取
 */

import axios from 'axios';
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  readFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { createLogger } from '../logger/index.js';
import tunnel from 'tunnel';
import {
  getFigmaRateLimiter,
  getFigmaPreviewRateLimiter,
} from '../utils/figma-rate-limiter.js';
import { isPanelResource } from '../utils/resource-mapping-formatter.js';
import { isSemanticMountTarget } from '../utils/mount-target-scoring.js';
// 🛡️ 刀 4（2026-09-13）：视觉序编号纯函数（独立模块，零 import.meta 依赖，供 jest 单测共用）
import { assignVisualOrderVarNames } from '../utils/visual-order-assign.js';
import { generateContainerSignature } from '../utils/asset-signature.js';

const logger = createLogger({ name: 'figma-connector' });

/**
 * 归一化 Figma 文本节点 characters：
 * 去掉首尾连续的 markdown 装饰字符（* _ ` ~ # > - = 空白），保留中间内容。
 * 修复设计稿带装饰前缀/后缀的文本（如「*数据实时更新」「_说明_」「#标题#」）被原样照搬到 UI 的问题。
 */
function normalizeFigmaText(text) {
  if (text == null) return text;
  let s = String(text).trim();
  // 反复 trim：避免 "* * 数据实时更新 *" 这种多重装饰
  let prev;
  do {
    prev = s;
    s = s
      .replace(/^[*_`~#>=\-\s]+/, '')
      .replace(/[*_`~#>=\-\s]+$/, '')
      .trim();
  } while (s !== prev && s.length > 0);
  return s;
}

/**
 * 从代理 URL 解析出 host/port 并创建 tunnel agent
 * 使用 tunnel 包替代 https-proxy-agent：
 *   - https-proxy-agent@9.x ESM import 在大响应（Figma nodes ~68KB）上有 stream abort bug
 *   - tunnel 是纯 HTTP CONNECT 隧道实现，简单稳定，无 ESM/CJS 兼容问题
 */
function _createProxyAgent(proxyUrl) {
  try {
    const u = new URL(proxyUrl);
    const opts = {
      proxy: {
        host: u.hostname,
        port: parseInt(u.port) || (u.protocol === 'https:' ? 443 : 80),
      },
      // 大响应优化：keepAlive 避免每次建连、maxSockets 限制并发
      keepAlive: true,
      maxSockets: 5,
    };
    if (u.username) opts.proxy.proxyAuth = `${u.username}:${u.password || ''}`;
    return tunnel.httpsOverHttp(opts);
  } catch (e) {
    logger.warn('代理 URL 解析失败，将不使用代理', {
      proxyUrl,
      error: e.message,
    });
    return null;
  }
}

export class FigmaConnector {
  constructor(config = {}) {
    // 🔒 强制用户配置：不再回退到环境变量
    if (!config.figmaToken) {
      throw new Error(
        'FigmaConnector: 缺少 Figma Token 配置，请在用户配置中设置 Figma 访问令牌',
      );
    }
    this.figmaToken = config.figmaToken;
    this.cacheEnabled = config.cacheEnabled !== false;

    // 代理配置（Figma API 在某些网络环境下必须走代理）- 保留系统配置
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy;
    if (proxyUrl) {
      this.proxyAgent = _createProxyAgent(proxyUrl);
      if (this.proxyAgent) {
        logger.info('Figma Connector 已启用隧道代理', {
          proxyUrl: proxyUrl.replace(/\/\/.*@/, '//***@'),
        });
      }
    } else {
      this.proxyAgent = null;
    }

    logger.info('Figma Connector 已初始化', {
      cacheEnabled: this.cacheEnabled,
      proxyEnabled: !!this.proxyAgent,
    });

    //全局速率限制器（进程级单例，跨所有 FigmaConnector 实例共享）
    //    所有出站 Figma API 请求都经由此 limiter，防止并行生成多个组件时
    //    瞬间打出大量请求触发 429，以及 429 后各组件各自短退避重试放大请求量。
    this._rateLimiter = getFigmaRateLimiter();
  }

  /**
   *统一的 Figma API GET 请求（限流 + 429 全局冷却 + 长退避重试）
   * fetchNodeData / getImageUrl / batchGetImageUrls / downloadImageAsset 的 Figma API 调用统一走此方法。
   * 行为：
   *  - 发送前先过全局速率限制器（最小间隔 + 并发上限 + 429 冷却）
   *  - 429 → 触发全局冷却（尊重 Retry-After，默认 30s 起、封顶 120s），下次 acquire 自然排队等待
   *  - 5xx / 超时 → 标准指数退避重试
   *  - 4xx（非 429）→ 不重试，直接抛出（如 401/403 token 问题、404 节点不存在）
   * @param {string} url - 完整请求 URL
   * @param {object} options - { timeoutMs=90000, responseType, tag='figma-api', maxRetries=2 }
   * @returns {Promise<axios.Response>}
   */
  async _figmaApiGet(url, options = {}) {
    const {
      timeoutMs = 90000,
      responseType,
      tag = 'figma-api',
      maxRetries = 2,
      rateLimiter = this._rateLimiter,
    } = options;

    let lastError = null;
    // 🎯 生成管线限流等待预算：单请求持槽最长 timeoutMs(90s)，并行任务排队需覆盖
    // 「持槽 + 7s 间隔 + 429 冷却」最坏组合；20s 默认值对后台任务必超时。
    const acquireTimeoutMs = Number(
      process.env.FIGMA_ACQUIRE_TIMEOUT_MS ?? 120000,
    );

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const release = await rateLimiter.acquire(acquireTimeoutMs);

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        logger.warn(`${tag} 请求超时，强制中断`, { attempt, timeoutMs });
        controller.abort();
      }, timeoutMs);

      // 交替走/不走代理：attempt 1→代理，attempt 2→直连，attempt 3→代理
      const useProxy = this.proxyAgent && attempt % 2 === 1;
      const attemptAgent = useProxy ? this.proxyAgent : undefined;

      try {
        const response = await axios.get(url, {
          headers: { 'X-Figma-Token': this.figmaToken },
          timeout: timeoutMs,
          signal: controller.signal,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          maxRedirects: 5,
          ...(responseType && { responseType }),
          ...(attemptAgent && { httpsAgent: attemptAgent }),
        });
        clearTimeout(timeoutHandle);
        release();
        return response;
      } catch (error) {
        clearTimeout(timeoutHandle);
        release();

        const status = error?.response?.status;
        const isRetryable = !status || status === 429 || status >= 500;

        if (status === 429) {
          //429：触发全局冷却，由 limiter 在下次 acquire 时阻塞等待，不再在此额外 sleep 放大
          let retryAfter = null;
          const ra =
            error?.response?.headers?.['retry-after'] ||
            error?.response?.headers?.['Retry-After'];
          if (ra) {
            retryAfter = parseInt(ra, 10);
            if (isNaN(retryAfter)) {
              const d = new Date(ra);
              if (!isNaN(d.getTime()))
                retryAfter = Math.max(
                  1,
                  Math.ceil((d.getTime() - Date.now()) / 1000),
                );
            }
          }
          rateLimiter.noteRateLimited(retryAfter);
          logger.warn(
            `🔴 ${tag} 遭遇 429 限流，已触发全局冷却 (第 ${attempt}/${maxRetries} 次)`,
          );
          if (attempt < maxRetries) continue; // 回到循环顶部重新 acquire（会自动等待冷却结束）
          lastError = error;
          break;
        }

        if (attempt < maxRetries && isRetryable) {
          const delayMs = 2000 * attempt; // 5xx/超时：2s, 4s, 6s
          logger.warn(`${tag} 请求失败，${delayMs}ms 后重试`, {
            attempt,
            maxRetries,
            status: status || 'timeout',
            error: error.message,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        lastError = error;
        break;
      }
    }

    throw lastError;
  }

  /**
   *通用 Figma API 请求（带重试 + AbortController 强制超时 + 代理交替）
   * 所有 Figma API GET 调用统一走此方法，确保：
   *  - 超时强制中断（axios timeout 在 socket hang 时不一定触发）
   *  - 重试时交替走/不走代理（避免单一通道死锁）
   *  - 429 限流 / 5xx 服务端错误 / timeout → 重试；4xx 客户端错误 → 不重试
   * @param {string} url - 完整请求 URL
   * @param {object} options - { maxRetries=3, timeoutMs=90000, responseType, tag='' }
   * @returns {Promise<axios.Response>}
   */
  async _figmaRequestWithRetry(url, options = {}) {
    const {
      maxRetries = 3,
      timeoutMs = 90000,
      responseType,
      tag = 'figma-api',
    } = options;

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        logger.warn(`${tag} 请求超时，强制中断`, { attempt, timeoutMs });
        controller.abort();
      }, timeoutMs);

      // 交替走/不走代理：attempt 1→代理，attempt 2→直连，attempt 3→代理
      const useProxy = this.proxyAgent && attempt % 2 === 1;
      const attemptAgent = useProxy ? this.proxyAgent : undefined;

      try {
        const response = await axios.get(url, {
          headers: { 'X-Figma-Token': this.figmaToken },
          timeout: timeoutMs,
          signal: controller.signal,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          maxRedirects: 5,
          ...(responseType && { responseType }),
          ...(attemptAgent && { httpsAgent: attemptAgent }),
        });
        clearTimeout(timeoutHandle);
        return response;
      } catch (error) {
        clearTimeout(timeoutHandle);

        if (
          error.name === 'CanceledError' ||
          error.name === 'AbortError' ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ABORTED'
        ) {
          lastError = new Error(`${tag} 请求超时（${timeoutMs}ms）`);
        } else {
          lastError = error;
        }

        const status = error?.response?.status;
        const isRetryable = !status || status === 429 || status >= 500;

        if (attempt < maxRetries && isRetryable) {
          const delayMs = 2000 * attempt;
          logger.warn(`${tag} 请求失败，${delayMs}ms 后重试`, {
            attempt,
            maxRetries,
            status: status || 'timeout',
            error: lastError.message,
            viaProxy: !!attemptAgent,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * 获取Figma节点数据（带重试 + AbortController 强制超时）
   * @param {string} fileKey - Figma 文件 Key
   * @param {string} nodeId - 节点 ID
   * @param {number} maxRetries - 最大重试次数，默认 2（429 重试受全局冷却保护，1 次重试即够）
   * @returns {Promise<Object>} 节点 document 数据
   */
  async fetchNodeData(fileKey, nodeId, maxRetries = 2) {
    logger.info('获取Figma节点数据', { fileKey, nodeId });

    // 转换nodeId格式：2-8417 -> 2:8417
    const apiNodeId = nodeId.replace(/-/g, ':');
    const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${apiNodeId}`;
    const timeoutMs = 90000; // 90 秒超时（大组件节点树数据量大）

    try {
      //走统一限流出站方法（含 429 全局冷却 + 长退避重试）
      const response = await this._figmaApiGet(url, {
        timeoutMs,
        tag: 'fetchNodeData',
        maxRetries,
      });
      const nodeData = response.data.nodes[apiNodeId];
      if (!nodeData) {
        throw new Error(`Node ${nodeId} not found`);
      }
      logger.info('✅ Figma节点数据获取成功');
      return nodeData.document;
    } catch (error) {
      // 保留原有 401/403 友好提示
      const figStatus = error?.response?.status;
      const figBody = error?.response?.data;
      const figMsg = figBody?.message || figBody?.err || error?.message;
      logger.error('Figma节点数据获取失败', {
        status: figStatus,
        error: figMsg,
        body: JSON.stringify(figBody),
      });

      let userMsg;
      if (figStatus === 401 || figStatus === 403) {
        userMsg = `Figma Token 无效或已过期 (HTTP ${figStatus})，请前往 Figma → Settings → Personal Access Tokens 重新生成 Token，并在前端「设置」面板中更新`;
      } else {
        userMsg = `Figma API 错误 (HTTP ${figStatus || '?'}): ${figMsg}`;
      }
      const figErr = new Error(userMsg);
      figErr.figStatus = figStatus;
      throw figErr;
    }
  }

  /**
   * 确认预览图可用（优先复用已确认图片，缺失时才兜底下载）
   */
  async downloadPreviewImage(fileKey, nodeId, outputPath) {
    logger.info('确认预览图', { fileKey, nodeId, outputPath });

    //缓存短路：如果本地已有 mc-preview.png 且大小 > 0，直接复用，跳过 Figma Images API
    //    场景：重新生成同一组件时，Figma 渲染排队/限流会导致 300s 超时；
    //    预览图不变（设计稿未改），直接用本地缓存即可。
    try {
      if (existsSync(outputPath)) {
        const stat = statSync(outputPath);
        if (stat.size > 1000) {
          // > 1KB 认为有效（空文件/损坏文件 < 1KB）
          logger.info('✅ 预览图缓存命中，跳过 Figma Images API', {
            path: outputPath,
            sizeKB: Math.round(stat.size / 1024),
          });
          return outputPath;
        }
      }
    } catch (cacheErr) {
      logger.warn('预览图缓存检查失败，继续走 Figma API', {
        error: cacheErr.message,
      });
    }

    // 确保目录存在（提前创建，避免下载成功后 mkdir 失败）
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // 1. 获取预览图 URL（带重试）
    //    预览图下载用「预览专用宽松限流器」（500ms 间隔 + 并发 2），
    //    避免被全局 7s 硬间隔拖慢（预览图只需 1 次 Images API + 1 次 S3 下载）。
    const imageUrl = await this.getImageUrl(
      fileKey,
      nodeId,
      getFigmaPreviewRateLimiter(),
    );

    // 2. 下载图片（带重试 + 代理交替）
    //    Figma 的 S3 URL 不需要 X-Figma-Token，但走代理交替
    const response = await this._figmaRequestWithRetry(imageUrl, {
      maxRetries: 3,
      timeoutMs: 120000,
      responseType: 'arraybuffer',
      tag: 'downloadPreview',
    });

    // 3. 保存图片
    writeFileSync(outputPath, response.data);

    logger.info('✅ 预览图下载成功', {
      path: outputPath,
      sizeKB: Math.round(response.data.byteLength / 1024),
    });
    return outputPath;
  }

  /**
   * 获取图片URL（带重试 + 代理交替）
   * @param {string} fileKey
   * @param {string} nodeId
   * @param {object} [rateLimiter] 可选限流器（预览图下载用宽松限流器，避免被全局 7s 间隔拖慢）
   */
  async getImageUrl(fileKey, nodeId, rateLimiter = null) {
    const apiNodeId = nodeId.replace(/-/g, ':');
    const url = `https://api.figma.com/v1/images/${fileKey}?ids=${apiNodeId}&format=png&scale=1`;

    //走统一限流出站方法（含 429 全局冷却 + 长退避重试）
    const response = await this._figmaApiGet(url, {
      maxRetries: 2,
      timeoutMs: 120000,
      tag: 'getImageUrl',
      ...(rateLimiter && { rateLimiter }),
    });

    logger.debug('Figma Images API 响应', {
      status: response.status,
      nodeId,
      hasImage: !!response.data.images?.[apiNodeId],
    });

    const imageUrl = response.data.images?.[apiNodeId];
    if (!imageUrl) {
      logger.error('图片URL未找到', {
        availableKeys: Object.keys(response.data.images || {}),
        requestedNodeId: nodeId,
      });
      throw new Error('Image URL not found');
    }

    return imageUrl;
  }

  /**
   * 批量获取 Figma Images API 渲染 URL
   *优化：一次 API 调用获取多个节点的渲染 URL（减少网络往返）
   * @param {string} fileKey - Figma 文件 Key
   * @param {Array<string>} nodeIds - 节点 ID 数组
   * @param {Object} options - 选项 { format: 'png', scale: 1 }
   * @returns {Promise<Map<string, string>>} nodeId → renderUrl 映射
   */
  async batchGetImageUrls(fileKey, nodeIds, options = {}) {
    const { format = 'png', scale = 1 } = options;
    const urlMap = new Map();

    if (nodeIds.length === 0) return urlMap;

    logger.info(`📡 批量获取渲染 URL（${nodeIds.length} 个节点）`);

    // Figma Images API 支持逗号分隔的多个节点 ID
    // 分批处理，每批最多 50 个（避免 URL 过长或 API 限制）
    const batchSize = 50;
    for (let i = 0; i < nodeIds.length; i += batchSize) {
      const batch = nodeIds.slice(i, i + batchSize);
      const apiNodeIds = batch.map((id) => id.replace(/-/g, ':')).join(',');
      const imageUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${apiNodeIds}&format=${format}&scale=${scale}`;

      try {
        //走统一限流出站方法（含 429 全局冷却 + 长退避重试 + 代理交替）
        const response = await this._figmaApiGet(imageUrl, {
          maxRetries: 2,
          timeoutMs: 120000,
          tag: 'batchGetImageUrls',
        });

        const images = response.data?.images;
        if (!images) {
          logger.warn('批量获取渲染 URL 返回空 images');
          continue;
        }

        // 映射回原始 nodeId（API 返回的是冒号格式）
        for (const nodeId of batch) {
          const apiNodeId = nodeId.replace(/-/g, ':');
          const renderUrl = images[apiNodeId];
          if (renderUrl) {
            urlMap.set(nodeId, renderUrl);
          } else {
            logger.debug(`节点未返回渲染 URL: ${nodeId}`);
          }
        }

        logger.debug(
          `批次 ${Math.floor(i / batchSize) + 1} 获取到 ${Object.keys(images).length} 个 URL`,
        );
      } catch (error) {
        logger.error('批量获取渲染 URL 失败', {
          error: error.message,
          batchStart: i,
          batchSize: batch.length,
        });
        // 失败时继续下一批，不中断整个流程
      }
    }

    logger.info(`✅ 批量获取完成，共 ${urlMap.size}/${nodeIds.length} 个 URL`);
    return urlMap;
  }

  /**
   * 下载静态资源（背景图、图标等）
   *  CSS 可复现资源（纯色/渐变）跳过 PNG 下载，直接用 CSS background
   *  微小装饰元素（<8x8px 纯色）用 CSS 替代
   *  相同 fill 签名的资源去重，只下载首个
   *  批量获取渲染 URL + 并行下载（减少网络往返）
   * @param {string} fileKey - Figma 文件 Key
   * @param {object} nodeData - Figma 节点数据
   * @param {string} outputDir - 输出目录
   */
  async downloadAssets(fileKey, nodeData, outputDir) {
    logger.info('开始下载静态资源（并行优化版）', { outputDir });

    const assets = [];
    const startTime = Date.now();

    try {
      const resourceNodes = this.extractResourceNodes(nodeData);

      if (resourceNodes.length === 0) {
        logger.info('未发现需要下载的资源节点');
        return assets;
      }

      logger.info(`发现 ${resourceNodes.length} 个资源节点`);

      //分流：CSS 可复现 vs 需要下载图片
      const cssAssets = []; // CSS 可复现（不下载 PNG）
      const imageNodes = []; // 需要 PNG 下载（去重后，每个签名只下载首个）
      //去重：签名 → { firstNode, duplicates: [node, ...] }
      // 先在第一遍遍历中收集相同签名的节点，下载后统一复用
      const sigGroups = new Map();

      for (const node of resourceNodes) {
        // 1. 检查是否 CSS 可复现（纯色/渐变，无 IMAGE fill）
        const cssCheck = this._checkCssReproducible(node);
        if (cssCheck.reproducible) {
          cssAssets.push({
            name: node.name,
            ref: node.id,
            localPath: null,
            downloaded: false,
            cssInsteadOfImage: true,
            cssValue: cssCheck.css,
            reason: cssCheck.reason,
          });
          logger.info(`🎨 CSS 替代（跳过下载）: ${node.name}`, {
            nodeId: node.id,
            css: cssCheck.css.slice(0, 60),
          });
          continue;
        }

        // 2. 检查是否微小装饰元素（<8x8px 纯色）
        if (this._isTinyDecorative(node)) {
          const tinyCss = this._checkCssReproducible(node);
          if (tinyCss.reproducible) {
            cssAssets.push({
              name: node.name,
              ref: node.id,
              localPath: null,
              downloaded: false,
              cssInsteadOfImage: true,
              cssValue: tinyCss.css,
              reason: 'tiny-decorative',
            });
            logger.info(`🎨 微小装饰 CSS 替代: ${node.name}`, {
              nodeId: node.id,
              css: tinyCss.css,
            });
            continue;
          }
        }

        // 3. 去重分组：相同签名的节点归组，只下载首个
        // 🛡️ 容器节点走子树结构签名（2026-09-02，mc-max-1788280167414-49dfbe7d 实锤）：
        // GROUP/FRAME 类资源 fills 为空 → fill 签名返回 null → 旧逻辑不参与去重，
        // 列表项共享背景被按节点数重复渲染/下载/落盘（12 个 bg GROUP 产出 12 份同 MD5 文件）。
        // 有 children 的节点一律用子树签名（含自有 fills + 全部后代，比「只看自有 fills」
        // 更严格，可同时消除「同 fill 异子树」的误去重）；叶子节点保持原 fill 签名。
        const hasChildren =
          Array.isArray(node.children) && node.children.length > 0;
        const sig = hasChildren
          ? generateContainerSignature(node)
          : this._generateAssetSignature(node);
        if (sig) {
          if (sigGroups.has(sig)) {
            // 重复签名 → 加入 duplicates，不单独下载
            sigGroups.get(sig).duplicates.push(node);
            continue;
          }
          // 首次出现 → 记录并加入下载队列
          sigGroups.set(sig, { firstNode: node, duplicates: [] });
        }
        // 4. 需要 PNG 下载
        imageNodes.push({ node, signature: sig });
      }

      const dedupCount = [...sigGroups.values()].reduce(
        (sum, g) => sum + g.duplicates.length,
        0,
      );
      logger.info(
        `📊 资源分流: ${cssAssets.length} CSS替代 + ${imageNodes.length} 需下载 + ${dedupCount} 去重`,
      );

      //批量获取所有需要下载的图片的渲染 URL（减少 API 调用次数）
      const nodeIdsToDownload = imageNodes.map(({ node }) => node.id);
      const renderUrlMap = await this.batchGetImageUrls(
        fileKey,
        nodeIdsToDownload,
      );

      // 并行下载所有图片（限制并发数为 10）
      const downloadResults = new Map(); // signature → download result
      const concurrency = 10;
      const downloadPromises = [];

      for (let i = 0; i < imageNodes.length; i += concurrency) {
        const batch = imageNodes.slice(i, i + concurrency);
        const batchPromises = batch.map(async ({ node, signature }) => {
          const renderUrl = renderUrlMap.get(node.id);
          if (!renderUrl) {
            logger.warn(`未获取到渲染 URL，跳过: ${node.name}`, {
              nodeId: node.id,
            });
            return {
              name: node.name,
              ref: node.id,
              localPath: null,
              downloaded: false,
              reason: 'No render URL in batch response',
            };
          }

          // 直接下载图片（跳过 Figma Images API 调用）
          try {
            return await this._downloadImageFromUrl(
              renderUrl,
              node.id,
              node.name,
              outputDir,
            );
          } catch (error) {
            logger.warn(`资源下载失败: ${node.name}`, { error: error.message });
            return {
              name: node.name,
              ref: node.id,
              localPath: null,
              downloaded: false,
              error: error.message,
            };
          }
        });

        const results = await Promise.allSettled(batchPromises);

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const { node, signature } = batch[j];
          if (result.status === 'fulfilled') {
            assets.push(result.value);
            // 记录下载结果供去重复用
            if (signature) {
              downloadResults.set(signature, result.value);
            }
          } else {
            logger.warn(`资源下载失败: ${node.name}`, {
              error: result.reason?.message,
            });
          }
        }
      }

      //为去重节点创建复用资产条目
      for (const [sig, group] of sigGroups) {
        if (group.duplicates.length === 0) continue;
        const sourceResult = downloadResults.get(sig);
        if (!sourceResult) continue; // 首个下载也失败了，跳过

        for (const dupNode of group.duplicates) {
          cssAssets.push({
            name: dupNode.name,
            ref: dupNode.id,
            localPath: sourceResult.localPath,
            downloaded: sourceResult.downloaded,
            cssInsteadOfImage: false,
            deduplicatedFrom: sourceResult.ref,
            reason: 'deduplicated',
          });
          logger.info(
            `♻️ 去重复用: ${dupNode.name} → 复用 ${sourceResult.name}`,
            {
              nodeId: dupNode.id,
              sourceNodeId: sourceResult.ref,
            },
          );
        }
      }

      // 合并 CSS 资源和图片资源
      const allAssets = [...assets, ...cssAssets];

      logger.info('✅ 静态资源处理完成', {
        total: resourceNodes.length,
        imageDownloaded: assets.length,
        cssReplaced: cssAssets.filter((a) => a.cssInsteadOfImage).length,
        deduplicated: cssAssets.filter((a) => a.deduplicatedFrom).length,
        failed: resourceNodes.length - allAssets.length,
      });
      return allAssets;
    } catch (error) {
      logger.error('静态资源下载失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 提取需要下载的资源节点
   * 根据节点名称判断是否为bg/icon/img/image
   * 优化：找到资源节点后跳过其子节点（子节点通常是VECTOR等，不需要递归）
   */
  extractResourceNodes(node, collected = [], isRoot = true) {
    if (!node) return collected;

    // 🛡️ 透明底兜底（M6-3a/3b）：根元素（组件根容器）的背景图不下载
    //   组件内容不设置背景色，是透明底。根容器的背景图是多余的，跳过。
    if (isRoot) {
      const rootType = this._identifyNodeType(node.name, node);
      if (rootType === 'bg') {
        logger.info(`⏭️ 跳过根元素背景图（透明底要求）: ${node.name}`, { nodeId: node.id });
        // 不 push 根节点，但继续递归子节点（子节点可能是真正的业务资源）
        if (node.children && Array.isArray(node.children)) {
          for (const child of node.children) {
            this.extractResourceNodes(child, collected, false);
          }
        }
        return collected;
      }
    }

    //@技术栈 标记（@echarts / @antd / @ant / @element 等）→ 第三方组件区域：由对应组件渲染，
    // 不导出静态分片图，整体跳过其子节点。否则 @echarts 每个柱状分片组、@antd 每个 tab 图标
    // 装饰矢量都会被导出成 png 塞进资源清单，既浪费 token 又诱导模型堆图片，还会触发资源归属
    // validator 的「未使用」BLOCK 误伤（mc-max-1787821650008 实锤 156 个装饰矢量被误判必须使用）。
    // 用 /@[a-zA-Z]/ 而非 /@/：避免误伤「icon@2x」这类分辨率后缀（@ 后是数字）。
    if (node.name && /@[a-zA-Z]/.test(node.name)) {
      // 🛡️ R12（2026-08-30）：技术栈按「库类型」分流，不能再一刀切。
      //   - 图表库（@echarts/@chart…）：整棵子树是运行时渲染产物（柱/折线/图例/坐标轴
      //     都是 canvas 画出来的），下钻只会导出 3~4px 宽的柱子碎片。mc-max-1788067021808
      //     实锤：107 条资源映射里 96 条（89.7%）是 @echarts/bar 下的「柱-*」png。
      //   - UI 控件库（@antd/@element…）：控件内部常塞业务内容（@antd/tab → cons/ 下 12 个
      //     真实图标），必须下钻（P0-1，mc-max-1788003760938 实锤）。
      if (this._isChartStackLibrary(node.name)) {
        logger.info(
          `⏭️ 跳过 @图表库 区域（整棵子树，运行时渲染不导出静态图）: ${node.name}`,
          { nodeId: node.id },
        );
        return collected;
      }
      // 🛡️ P0-1（2026-08-30）：UI 控件库不整棵一刀切，改为下钻「业务内容」子节点、
      // 跳过「控件内部构件」子节点。@antd/tab → cons/（设备卡片区）→ 12 个真实图标。
      const kids = Array.isArray(node.children) ? node.children : [];
      let descended = 0;
      for (const k of kids) {
        if (this._isStackControlPart(k)) continue;
        descended++;
        this.extractResourceNodes(k, collected, false);
      }
      if (descended > 0) {
        logger.info(
          `🔀 @技术栈区域下钻业务内容: ${node.name}（${descended} 个内容子节点）`,
          { nodeId: node.id },
        );
      } else {
        logger.info(`跳过 @技术栈 区域资源: ${node.name}`, { nodeId: node.id });
      }
      return collected;
    }

    //使用增强的 _identifyNodeType 判断（命名+视觉属性）
    const nodeType = this._identifyNodeType(node.name, node);

    // 跳过面板 chrome 资源（header/title 装饰元素由 base-panel 提供）
    if (nodeType === 'chrome') {
      logger.info(`跳过面板 chrome 资源: ${node.name}`, { nodeId: node.id });
      return collected;
    }

    if (nodeType !== 'unknown') {
      // 🛡️ 命名级「整体 icon」：用户显式命名为 icon/图标/arrow/箭头的组合节点，
      // 整体导出 1 张图，不钻内部 VECTOR 碎片——否则子节点 <50px VECTOR 会被「小尺寸 VECTOR→icon」
      // 规则逐个识别，反向触发下方「资源容器拆分」(kidResourceCount>=2) 把整体拆成多张碎片图。
      // 例外：tabs-icon / *-list / *-group / icons（含多个并列独立 icon 按钮的容器）仍走下方拆分。
      if (this._isWholeResourceByName(node.name)) {
        logger.info(
          `📦 命名资源节点整体导出（不拆分子矢量碎片）: ${node.name}`,
          { nodeId: node.id },
        );
        collected.push(node);
        return collected;
      }

      // 🎯 2026-08-25：区分「原子资源节点」vs「含多个并列资源子节点的容器」。
      // 实锤：tabs-icon FRAME 含 2 个 24×24 icon 按钮，此前被整体导出成 1 张 104×48 合并图，
      // LLM 无法拆分只好用 CSS 画图标替代（违背"icon 是静态资源直接使用"的规范）。
      // 规则：FRAME/GROUP 且直接子节点中资源节点 ≥2 → 递归导出子节点（各自成图）；
      // 否则视为原子资源整体导出（不钻内部 Vector）。
      const kids = Array.isArray(node.children) ? node.children : [];
      const kidResourceCount = kids.filter((c) => {
        const t = this._identifyNodeType(c.name, c);
        return t !== 'unknown' && t !== 'chrome';
      }).length;
      const isResourceContainer =
        (node.type === 'FRAME' || node.type === 'GROUP') &&
        kidResourceCount >= 2;
      if (!isResourceContainer) {
        collected.push(node);
        // ✅ 原子资源节点：立即返回，跳过其内部 Vector 子节点
        return collected;
      }
      logger.info(
        `🔀 资源容器拆分导出: ${node.name}（含 ${kidResourceCount} 个子资源节点）`,
        { nodeId: node.id },
      );
      // 容器型：不整体 push，落到下方递归子节点分别导出
    }

    // 只有不是资源节点时才递归子节点
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        // 🛡️ 根容器背景跳过（2026-08-31，与挂载侧判定同口径）
        // 语义（M6-3a/3b 透明底要求）：组件内容不设背景色，根容器的背景图多余，无需还原。
        // 判定：根节点的「直接子 bg」（其 figmaPath 必为 2 段，如 `cp-环境监测/bg`），
        //   与挂载侧 figma-connector.js:2287-2291「段数 < 3 → skipMount = true」完全等价
        //   → 这类资源即使下载也注定不被挂载（mc-max-1788164636144 实锤白下一张 48KB 图，
        //     还占 mapping 清单、可能触发「资源未使用」校验误伤）。
        // ⚠️ 不可用面积比判定：嵌套的 tabs-list/bg 也完整覆盖其父容器（实测 areaRatio 1.000），
        //    按面积会误伤业务背景（2:7890 tabs-list 背景 / 2:7891 bg-tab-active）。
        //    因此这里必须用「根节点的直接子节点」这一结构信号。
        if (isRoot && this._identifyNodeType(child.name, child) === 'bg') {
          logger.info(
            `⏭️ 跳过根容器直接子背景图（透明底要求，挂载侧 skipMount 注定不用）: ${child.name}`,
            { nodeId: child.id },
          );
          // 仅跳过背景节点自身，仍下钻其子节点——避免背景层内裹着真实业务资源时被误删
          if (child.children && Array.isArray(child.children)) {
            for (const grandchild of child.children) {
              this.extractResourceNodes(grandchild, collected, false);
            }
          }
          continue;
        }
        this.extractResourceNodes(child, collected, false);
      }
    }

    return collected;
  }

  /**
   * 提取节点中的技术栈提示
   * 例如：@echarts/柱状图、@antd/table
   * 优化：找到技术栈标记后跳过其子节点（不会嵌套）
   * @param {Object} node - Figma 节点
   * @param {Array} collected - 收集的技术栈提示
   * @returns {Array} 技术栈提示列表
   */
  extractTechStackHints(node, collected = []) {
    if (!node) return collected;

    const name = node.name || '';

    // 匹配 @技术栈/组件 格式
    const match = name.match(/@([^/\s]+)(?:\/([^\s]+))?/);
    if (match) {
      collected.push({
        nodeId: node.id,
        nodeName: node.name,
        library: match[1], // 例如：echarts, antd
        component: match[2], // 例如：柱状图, table
        fullHint: match[0], // 例如：@echarts/柱状图
      });
      // ✅ 找到技术栈标记后立即返回，跳过其子节点（不会嵌套）
      return collected;
    }

    // 只有不是技术栈节点时才递归子节点
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        this.extractTechStackHints(child, collected);
      }
    }

    return collected;
  }

  /**
   * 优化 Figma 节点数据（改进方案）
   * 保留嵌套结构和关键视觉信息（颜色、渐变、字体），删除冗余字段
   * @param {Object} node - Figma 节点
   * @returns {Object} 优化后的节点数据
   */
  pruneRedundantFields(node) {
    if (!node) return null;

    // 🛡️ R5-visible（2026-09-15）：「*数据实时更新」泄漏实锤。设计师用「* 前缀 + visible:false」
    // 标注注释，隐藏节点在 Figma 界面不可见，但 Figma API 仍返回其 name/characters。旧过滤只清
    // characters 不清 name → extractFigmaHints 用 name 提取结构摘要 →「*数据实时更新」泄漏进
    // vision prompt → LLM 当 UI 文本照抄。治本：隐藏节点清 name+characters（保留 bbox 供布局）。
    const isHiddenNode = node.visible === false;

    const optimized = {
      id: node.id,
      name: isHiddenNode ? '' : node.name,
      type: node.type,
    };

    // 保留位置和尺寸信息（布局分析必需）
    if (node.absoluteBoundingBox) {
      optimized.absoluteBoundingBox = node.absoluteBoundingBox;
    }
    if (typeof node.x !== 'undefined') optimized.x = node.x;
    if (typeof node.y !== 'undefined') optimized.y = node.y;
    if (typeof node.width !== 'undefined') optimized.width = node.width;
    if (typeof node.height !== 'undefined') optimized.height = node.height;

    // ✅ 保留 Auto Layout 属性（布局分析必需 — vue3-engineer / microcode-engineer 均依赖此数据做 flex 映射）
    if (typeof node.layoutMode !== 'undefined')
      optimized.layoutMode = node.layoutMode;
    if (typeof node.primaryAxisAlignItems !== 'undefined')
      optimized.primaryAxisAlignItems = node.primaryAxisAlignItems;
    if (typeof node.counterAxisAlignItems !== 'undefined')
      optimized.counterAxisAlignItems = node.counterAxisAlignItems;
    if (typeof node.itemSpacing !== 'undefined')
      optimized.itemSpacing = node.itemSpacing;
    if (typeof node.paddingLeft !== 'undefined')
      optimized.paddingLeft = node.paddingLeft;
    if (typeof node.paddingRight !== 'undefined')
      optimized.paddingRight = node.paddingRight;
    if (typeof node.paddingTop !== 'undefined')
      optimized.paddingTop = node.paddingTop;
    if (typeof node.paddingBottom !== 'undefined')
      optimized.paddingBottom = node.paddingBottom;
    if (typeof node.layoutWrap !== 'undefined')
      optimized.layoutWrap = node.layoutWrap;
    if (typeof node.primaryAxisSizingMode !== 'undefined')
      optimized.primaryAxisSizingMode = node.primaryAxisSizingMode;
    if (typeof node.counterAxisSizingMode !== 'undefined')
      optimized.counterAxisSizingMode = node.counterAxisSizingMode;
    if (typeof node.clipsContent !== 'undefined')
      optimized.clipsContent = node.clipsContent;
    // ✅ 保留圆角和透明度（视觉样式必需）
    if (typeof node.cornerRadius !== 'undefined')
      optimized.cornerRadius = node.cornerRadius;
    if (typeof node.rectangleCornerRadii !== 'undefined')
      optimized.rectangleCornerRadii = node.rectangleCornerRadii;
    if (typeof node.opacity !== 'undefined' && node.opacity !== 1)
      optimized.opacity = node.opacity;

    // ✅ 保留填充��息（颜色、渐变 - 技术栈节点需要）
    if (node.fills && node.fills.length > 0) {
      optimized.fills = node.fills.map((fill) => {
        const simplified = {
          type: fill.type,
          visible: fill.visible !== false,
        };

        // 保留纯色颜色值
        if (fill.type === 'SOLID' && fill.color) {
          simplified.color = fill.color;
        }

        // ✅ 保留 IMAGE fill 的 imageRef（2026-09-02）：资源下载去重签名依赖它。
        // 缓存路径B 的节点树经本方法裁剪，缺 imageRef 时 fill 签名退化为
        // `IMAGE:true##尺寸` → 同尺寸异图有误去重隐患；imageRef 只是短哈希字符串，体积可忽略。
        if (fill.type === 'IMAGE' && fill.imageRef) {
          simplified.imageRef = fill.imageRef;
        }

        // 保留渐变信息
        if (
          (fill.type === 'GRADIENT_LINEAR' ||
            fill.type === 'GRADIENT_RADIAL' ||
            fill.type === 'GRADIENT_ANGULAR') &&
          fill.gradientStops
        ) {
          simplified.gradientStops = fill.gradientStops;
        }

        return simplified;
      });
    }

    // ✅ 保留描边信息（简化）
    if (node.strokes && node.strokes.length > 0) {
      optimized.strokes = node.strokes.map((stroke) => ({
        type: stroke.type,
        color: stroke.color,
        visible: stroke.visible !== false,
      }));
      if (typeof node.strokeWeight !== 'undefined') {
        optimized.strokeWeight = node.strokeWeight;
      }
    }

    // 保留完整的阴影/模糊效果数据（用于生成box-shadow）
    if (node.effects && node.effects.length > 0) {
      optimized.effects = node.effects.map((effect) => ({
        type: effect.type,
        visible: effect.visible !== false,
        radius: effect.radius,
        color: effect.color,
        offset: effect.offset,
        spread: effect.spread,
        blendMode: effect.blendMode,
      }));
      logger.debug(`🎨 提取到effects数据`, {
        nodeName: node.name,
        effectsCount: optimized.effects.length,
      });
    }

    // ✅ 保留文本样式（字体、大小 - 技术栈节点需要）
    if (node.style) {
      optimized.style = {
        fontSize: node.style.fontSize,
        fontFamily: node.style.fontFamily,
        fontWeight: node.style.fontWeight,
        textAlignHorizontal: node.style.textAlignHorizontal,
        textAlignVertical: node.style.textAlignVertical,
        lineHeightPx: node.style.lineHeightPx,
      };
    }

    // 保留文本内容（ 过滤设计师注释/标注文本）
    // 🛡️ R5-visible：隐藏节点（visible:false）不提取 characters（其 name 也已在函数头清空）。
    if (node.characters && !isHiddenNode) {
      const text = String(node.characters).trim();
      const fontSize = node.style?.fontSize;
      const isAnnotationPrefix =
        /^[*#]/.test(text) ||
        /^(注|备注|标注|TODO|FIXME|NOTE|HACK|TBD|待定|临时)/i.test(text);
      const isTinyFont = typeof fontSize === 'number' && fontSize < 10;
      const isRepeatSymbols = /^[*#\-=|]{3,}$/.test(text);
      // 注释文本：小字号 + 注释标记前缀，或纯重复符号
      if (
        (isAnnotationPrefix && isTinyFont) ||
        isRepeatSymbols ||
        (isAnnotationPrefix && text.length < 15)
      ) {
        // 保留节点结构但移除文本（防止注释被误认为 UI 内容）
        logger.debug(
          `🔇 过滤 Figma 注释文本: "${text.substring(0, 30)}" (font-size: ${fontSize})`,
        );
        // 不设置 characters，节点仅保留尺寸/位置用于布局
      } else {
        // 归一化：去掉首尾连续的 markdown 装饰字符（* _ ` ~ # 等），
        // 修复 Figma 文本节点 `*数据实时更新` / `_说明_` / `#标题#` 等带装饰符号被原样照搬到 UI 的问题
        optimized.characters = normalizeFigmaText(node.characters);
      }
    }

    // 保留样式引用
    if (node.styles) {
      optimized.styles = node.styles;
    }

    // 递归处理子节点（保留嵌套结构）
    if (node.children && Array.isArray(node.children)) {
      optimized.children = node.children
        .map((child) => this.pruneRedundantFields(child))
        .filter(Boolean);
    }

    return optimized;
  }

  /**
   * 下载单个图片资源
   * 通过 Figma Images API 将节点渲染为 PNG 并下载到本地
   * @param {string} fileKey - Figma 文件 Key
   * @param {string} nodeId - 节点 ID（如 "2:8417"）
   * @param {string} nodeName - 节点名称（用作文件名）
   * @param {string} outputDir - 输出目录
   * @param {object} options - 可选配置
   * @param {number} options.scale - 缩放比例，默认 1
   * @param {string} options.format - 图片格式，默认 'png'
   */
  async downloadImageAsset(fileKey, nodeId, nodeName, outputDir, options = {}) {
    const { scale = 1, format = 'png' } = options;

    //AbortController 强制超时（axios timeout 在 socket hang 时不一定会触发）
    const controller = new AbortController();
    const timeoutMs = 120000; //  60s → 120s
    const timeoutHandle = setTimeout(() => {
      logger.warn('下载图片资源超时，强制中断', {
        nodeId,
        nodeName,
        timeoutMs,
      });
      controller.abort();
    }, timeoutMs);

    try {
      // 1. 通过 Figma Images API 获取渲染 URL
      const apiNodeId = nodeId.replace(/-/g, ':');
      const imageApiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${apiNodeId}&format=${format}&scale=${scale}`;

      logger.debug('请求 Figma Images API', { nodeId: apiNodeId, nodeName });

      //走统一限流出站方法（含 429 全局冷却 + 长退避重试 + 代理交替）
      const imageApiResponse = await this._figmaApiGet(imageApiUrl, {
        timeoutMs,
        tag: 'downloadImageAsset',
        maxRetries: 2,
      });

      // 检查 API 响应状态
      const images = imageApiResponse.data?.images;
      if (!images) {
        throw new Error(
          `Figma Images API 返回异常: ${JSON.stringify(imageApiResponse.data)}`,
        );
      }

      // 检查是否有错误信息
      if (imageApiResponse.data?.err) {
        throw new Error(`Figma Images API 错误: ${imageApiResponse.data.err}`);
      }

      // 获取渲染后的图片 URL
      const renderUrl = images[apiNodeId];
      if (!renderUrl) {
        logger.warn('节点未返回渲染 URL（可能是空节点或无可见内容）', {
          nodeId: apiNodeId,
          nodeName,
          availableKeys: Object.keys(images),
        });
        // 返回未下载成功的记录
        return {
          name: nodeName,
          ref: nodeId,
          localPath: null,
          downloaded: false,
          reason: 'No render URL returned',
        };
      }

      logger.debug('获取到渲染 URL，开始下载图片', { nodeName });

      // 2. 下载图片二进制数据
      const imageResponse = await axios.get(renderUrl, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        signal: controller.signal,
        ...(this.proxyAgent && { httpsAgent: this.proxyAgent }),
      });

      // 验证下载成功
      if (!imageResponse.data || imageResponse.data.byteLength === 0) {
        throw new Error('下载的图片数据为空');
      }

      // 3. 生成安全的文件名（添加节点ID后缀避免同名文件覆盖）
      const safeName =
        this.sanitizeFilename(nodeName) ||
        `asset_${apiNodeId.replace(/:/g, '_')}`;
      const nodeIdSuffix = apiNodeId.split(':')[1] || apiNodeId; // 使用节点ID的后半部分
      const fileName = `${safeName}-${nodeIdSuffix}.${format}`;
      const localPath = join(outputDir, fileName);

      // 4. 确保目录存在
      const dir = dirname(localPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // 5. 保存文件
      writeFileSync(localPath, imageResponse.data);

      logger.info('✅ 图片资源下载成功', {
        nodeName,
        fileName,
        size: `${(imageResponse.data.byteLength / 1024).toFixed(1)}KB`,
      });

      return {
        name: nodeName,
        ref: nodeId,
        localPath,
        fileName,
        format,
        size: imageResponse.data.byteLength,
        downloaded: true,
      };
    } catch (error) {
      //区分超时（AbortController）和网络错误
      if (error.name === 'CanceledError' || error.code === 'ABORTED') {
        logger.error('下载图片资源超时被强制中断', {
          nodeId,
          nodeName,
          timeoutMs,
        });
        throw new Error(`下载图片资源超时（${timeoutMs}ms）`);
      }

      // 区分网络错误和 API 错误
      const isNetworkError =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('timeout');

      const errorInfo = {
        nodeName,
        nodeId,
        isNetworkError,
        errorType: isNetworkError ? 'network' : 'api',
        error: error.message,
      };

      if (isNetworkError) {
        logger.warn('图片下载网络错误（将跳过此资源）', errorInfo);
      } else {
        logger.error('图片资源下载失败', errorInfo);
      }

      // 返回失败记录而不中断整个流程
      return {
        name: nodeName,
        ref: nodeId,
        localPath: null,
        downloaded: false,
        error: error.message,
        isNetworkError,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * 从已有 URL 直接下载图片（跳过 Figma Images API 调用）
   *配合 batchGetImageUrls 使用，将 API 调用和图片下载分离
   * @param {string} imageUrl - 图片渲染 URL
   * @param {string} nodeId - 节点 ID
   * @param {string} nodeName - 节点名称
   * @param {string} outputDir - 输出目录
   * @param {Object} options - 选项 { format: 'png' }
   * @returns {Promise<Object>} 下载结果
   */
  async _downloadImageFromUrl(
    imageUrl,
    nodeId,
    nodeName,
    outputDir,
    options = {},
  ) {
    const { format = 'png' } = options;
    const controller = new AbortController();
    const timeoutMs = 120000;
    const timeoutHandle = setTimeout(() => {
      logger.warn('下载图片超时，强制中断', { nodeId, nodeName, timeoutMs });
      controller.abort();
    }, timeoutMs);

    try {
      logger.debug('开始下载图片', { nodeName, nodeId });

      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        signal: controller.signal,
        ...(this.proxyAgent && { httpsAgent: this.proxyAgent }),
      });

      if (!imageResponse.data || imageResponse.data.byteLength === 0) {
        throw new Error('下载的图片数据为空');
      }

      // 生成安全的文件名
      const safeName =
        this.sanitizeFilename(nodeName) || `asset_${nodeId.replace(/:/g, '_')}`;
      const apiNodeId = nodeId.replace(/-/g, ':');
      const nodeIdSuffix = apiNodeId.split(':')[1] || apiNodeId;
      const fileName = `${safeName}-${nodeIdSuffix}.${format}`;
      const localPath = join(outputDir, fileName);

      // 确保目录存在
      const dir = dirname(localPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // 保存文件
      writeFileSync(localPath, imageResponse.data);

      logger.info('✅ 图片下载成功', {
        nodeName,
        fileName,
        size: `${(imageResponse.data.byteLength / 1024).toFixed(1)}KB`,
      });

      return {
        name: nodeName,
        ref: nodeId,
        localPath,
        fileName,
        format,
        size: imageResponse.data.byteLength,
        downloaded: true,
      };
    } catch (error) {
      if (error.name === 'CanceledError' || error.code === 'ABORTED') {
        logger.error('下载图片超时被强制中断', { nodeId, nodeName, timeoutMs });
        throw new Error(`下载图片超时（${timeoutMs}ms）`);
      }

      const isNetworkError =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('timeout');

      if (isNetworkError) {
        logger.warn('图片下载网络错误（将跳过此资源）', {
          nodeName,
          nodeId,
          error: error.message,
        });
      } else {
        logger.error('图片下载失败', {
          nodeName,
          nodeId,
          error: error.message,
        });
      }

      return {
        name: nodeName,
        ref: nodeId,
        localPath: null,
        downloaded: false,
        error: error.message,
        isNetworkError,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * 安全化文件名（移除特殊字符）
   */
  sanitizeFilename(name) {
    if (!name) return '';

    return (
      name
        // 中文和英文保留，其他特殊字符替换为下划线
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '_')
        // 合并连续下划线
        .replace(/_+/g, '_')
        // 移除首尾下划线
        .replace(/^_|_$/g, '')
        // 截断过长文件名
        .substring(0, 100) || 'unnamed'
    );
  }

  /**
   * 执行完整的数据获取流程
   *并行化优化：
   *   - 预览图下载 + 节点数据获取 并行（互不依赖）
   *   - 预览图下载 + 静态资源下载 并行（静态资源只依赖 nodeData）
   */
  async execute(params) {
    const { fileKey, nodeId, outputPath } = params;

    logger.info('开始执行Figma数据获取（并行优化版）', { fileKey, nodeId });
    const executeStartTime = Date.now();

    try {
      // 1. 串行：先 fetchNodeData（拿到节点树），再确认预览图（可命中缓存短路）
      // 改动：原 Promise.all 并行 → 串行。原因：并行时 fetchNodeData 的 3×90s 重试
      // 会吃掉预览图确认的 300s 总超时；串行后各自独立重试，互不干扰。
      // 已确认图片会直接命中缓存，只有图片缺失时才兜底请求 Figma Images API。
      logger.info('⚡ 阶段1: fetchNodeData');

      // 🆕 节点树缓存短路：重新生成同一组件时，直接复用本地 figma-node-data.json，
      //    跳过 Figma 节点树 API（Tier1，占 10/min 硬额度），从源头消灭限流。
      let nodeData;
      const nodeCacheFile = join(
        outputPath,
        '.mc-gen/cache/figma-node-data.json',
      );
      if (existsSync(nodeCacheFile)) {
        try {
          const nodeCache = JSON.parse(readFileSync(nodeCacheFile, 'utf-8'));
          if (
            nodeCache.fileKey === fileKey &&
            nodeCache.nodeId === nodeId &&
            nodeCache.document
          ) {
            nodeData = nodeCache.document;
            logger.info('✅ 节点树缓存命中，跳过 Figma 节点树 API', {
              fileKey,
              nodeId,
            });
          }
        } catch (cacheErr) {
          logger.warn('节点树缓存读取失败，继续走 Figma API', {
            error: cacheErr.message,
          });
        }
      }
      if (!nodeData) {
        nodeData = await this.fetchNodeData(fileKey, nodeId);
      }
      const phase1aTime = ((Date.now() - executeStartTime) / 1000).toFixed(1);
      logger.info(`✅ 阶段1完成（${phase1aTime}s）`);

      logger.info('⚡ 阶段1b: confirmPreviewImage');
      const previewImagePath = await this.downloadPreviewImage(
        fileKey,
        nodeId,
        join(outputPath, 'resources/images/mc-preview.png'),
      );
      const phase1Time = ((Date.now() - executeStartTime) / 1000).toFixed(1);
      logger.info(`✅ 预览图获取完成（${phase1Time}s）`);

      // 1.1 缓存Figma节点数据（用于调试）— 不阻塞后续
      this._saveFigmaCache(nodeData, outputPath, fileKey, nodeId).catch((e) =>
        logger.warn('缓存保存失败（不影响生成）', { error: e.message }),
      );

      // 2. 下载静态资源（依赖 nodeData）
      logger.info('⚡ 阶段2: downloadAssets');
      const assets = await this.downloadAssets(
        fileKey,
        nodeData,
        join(outputPath, 'resources/images'),
      );
      const phase2Time = ((Date.now() - executeStartTime) / 1000).toFixed(1);
      logger.info(`✅ 阶段2完成（${phase2Time}s）`);

      // 3. 生成资源-DOM映射表
      const resourceDomMapping = this._buildResourceDomMapping(
        nodeData,
        assets,
      );

      // 3.0.1 资源文件存在性校验（阶段1-4）
      // downloadStatus='success' 但 resourceFile 对应的磁盘文件不存在时，降级为 missing
      const resourcesDir = join(outputPath, 'resources/images');
      let missingCount = 0;
      for (const m of resourceDomMapping) {
        if (m.downloadStatus !== 'success' || !m.resourceFile) continue;
        const fileName = m.resourceFile.split('/').pop();
        const realPath = join(resourcesDir, fileName);
        if (!existsSync(realPath)) {
          m.downloadStatus = 'missing';
          m.fallbackHint = `⚠️ 资源文件不存在(${fileName}), 请使用CSS替代方案`;
          missingCount++;
          logger.warn(`资源文件不存在: ${realPath}`, {
            figmaNodeId: m.figmaNodeId,
          });
        }
      }
      if (missingCount > 0) {
        logger.warn(
          `阶段1-4: ${missingCount} 个资源文件在磁盘上不存在，已降级为 missing`,
        );
      }

      // 3.1 保存资源-DOM映射表（供AI生成代码时使用）
      const mappingDir = join(outputPath, '.mc-gen');
      mkdirSync(mappingDir, { recursive: true });
      const mappingPath = join(mappingDir, 'resource-dom-mapping.json');
      writeFileSync(mappingPath, JSON.stringify(resourceDomMapping, null, 2));

      const result = {
        previewImage: previewImagePath,
        figmaNodeData: nodeData,
        assets,
        resourceDomMapping,
      };

      const totalTime = ((Date.now() - executeStartTime) / 1000).toFixed(1);
      logger.info('✅ Figma数据获取完成', {
        mappings: resourceDomMapping.length,
        totalTime: `${totalTime}s`,
      });
      return result;
    } catch (error) {
      //统一格式化 Figma API 的 401/403 为友好中文提示
      //    注意：execute() 是 getImageUrl / fetchNodeData / downloadAssets 的统一入口
      //    各自的 catch 可能直接 throw axios 原始 error（如 "Request failed with status code 403"）
      const figStatus =
        error?.response?.status ?? error?.figStatus ?? error?.statusCode;
      if (figStatus === 401 || figStatus === 403) {
        const friendlyErr = new Error(
          `Figma Token 无效或已过期 (HTTP ${figStatus})，请前往 Figma → Settings → Personal Access Tokens 重新生成 Token，并在前端「设置」面板中更新`,
        );
        friendlyErr.figStatus = figStatus;
        logger.error('Figma API 认证失败', {
          status: figStatus,
          originalError: error.message,
        });
        throw friendlyErr;
      }
      logger.error('Figma数据获取失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 保存Figma节点数据到缓存（用于调试）
   */
  async _saveFigmaCache(nodeData, outputPath, fileKey, nodeId) {
    try {
      const cacheDir = join(outputPath, '.mc-gen/cache');
      mkdirSync(cacheDir, { recursive: true });

      const cacheData = {
        fileKey,
        nodeId,
        cachedAt: new Date().toISOString(),
        document: nodeData,
      };

      const cachePath = join(cacheDir, 'figma-node-data.json');
      writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));

      logger.info('✅ Figma节点数据已缓存', { cachePath });
    } catch (error) {
      logger.warn('缓存保存失败（不影响生成）', { error: error.message });
    }
  }

  /**
   * 遍历Figma节点树
   * @param {Object} node - Figma节点
   * @param {Function} callback - 回调函数 (node) => void
   */
  traverseFigmaTree(node, callback) {
    if (!node) return;

    callback(node);

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => this.traverseFigmaTree(child, callback));
    }
  }

  /**
   * 查找面板标题节点
   * @param {Object} figmaNodeData - Figma节点树
   * @returns {Object|null} 标题节点
   */
  findPanelTitleNode(figmaNodeData) {
    let titleNode = null;

    // 优先匹配标记为title的TEXT节点
    this.traverseFigmaTree(figmaNodeData, (node) => {
      const name = node.name?.toLowerCase() || '';
      if (
        (name.includes('title') || name.includes('标题')) &&
        node.type === 'TEXT' &&
        !titleNode
      ) {
        titleNode = node;
      }
    });

    // 如果没找到，选择顶部区域（Y<100）的最大字号文字节点
    if (!titleNode) {
      const topTextNodes = [];
      this.traverseFigmaTree(figmaNodeData, (node) => {
        const bbox = node.absoluteBoundingBox;
        if (node.type === 'TEXT' && bbox && bbox.y < 100) {
          topTextNodes.push(node);
        }
      });

      // 按字号降序排序，选择最大的
      if (topTextNodes.length > 0) {
        titleNode = topTextNodes.sort((a, b) => {
          const sizeA = a.style?.fontSize || 0;
          const sizeB = b.style?.fontSize || 0;
          return sizeB - sizeA;
        })[0];
      }
    }

    // 第三级 fallback：设计稿用语义命名（header GROUP）而非 title 标记时，
    // 在 name 匹配 header 的 GROUP/FRAME 容器内找标题 TEXT。
    // 修复：cp-xxx > header(GROUP) 结构（标题+右侧数据卡）此前两级匹配全失败。
    // 标题判定：x 最靠左的文本（面板标题惯例居左，右侧是数据卡/控件——
    // 大屏设计中数值字号常大于标题，不能按最大字号取）。
    if (!titleNode) {
      let headerContainer = null;
      this.traverseFigmaTree(figmaNodeData, (node) => {
        if (headerContainer) return;
        const name = node.name?.toLowerCase() || '';
        if (
          (node.type === 'GROUP' || node.type === 'FRAME') &&
          (name === 'header' ||
            name.startsWith('header ') ||
            name.startsWith('header-') ||
            name.startsWith('panel-header'))
        ) {
          headerContainer = node;
        }
      });
      if (headerContainer) {
        const candidates = [];
        this.traverseFigmaTree(headerContainer, (node) => {
          if (node.type === 'TEXT') candidates.push(node);
        });
        if (candidates.length > 0) {
          titleNode = candidates.sort((a, b) => {
            const ax = a.absoluteBoundingBox?.x ?? 0,
              bx = b.absoluteBoundingBox?.x ?? 0;
            if (ax !== bx) return ax - bx;
            return (b.style?.fontSize || 0) - (a.style?.fontSize || 0);
          })[0];
        }
      }
    }

    return titleNode;
  }

  /**
   * 查找header容器节点
   * @param {Object} figmaNodeData - Figma节点树
   * @returns {Object|null} header容器节点
   */
  findHeaderContainer(figmaNodeData) {
    let headerContainer = null;

    this.traverseFigmaTree(figmaNodeData, (node) => {
      const name = node.name?.toLowerCase() || '';
      // 匹配包含header关键词的FRAME或GROUP节点
      if (
        (name.includes('header') || name.includes('头部')) &&
        (node.type === 'FRAME' || node.type === 'GROUP') &&
        !headerContainer
      ) {
        headerContainer = node;
      }
    });

    return headerContainer;
  }

  /**
   * 判断节点是否可能是插槽控件
   * @param {Object} node - Figma节点
   * @returns {boolean}
   */
  isLikelySlotControl(node) {
    if (!node || !node.name) return false;

    const name = node.name.toLowerCase();

    // 排除背景、容器等装饰性元素
    if (
      name.includes('bg') ||
      name.includes('background') ||
      name.includes('container') ||
      name.includes('wrapper')
    ) {
      return false;
    }

    // 匹配常见控件特征
    return (
      node.type === 'TEXT' ||
      node.type === 'COMPONENT' ||
      node.type === 'INSTANCE' ||
      name.includes('icon') ||
      name.includes('tab') ||
      name.includes('button') ||
      name.includes('switch') ||
      name.includes('badge') ||
      name.includes('tag')
    );
  }

  /**
   *判断节点的 fills 是否可以用 CSS 复现（纯色/渐变，无 IMAGE fill）
   * 如果可以，则不需要下载为 PNG，直接用 CSS background 即可
   * @param {Object} node - Figma 节点
   * @returns {{ reproducible: boolean, css: string|null, reason: string }}
   */
  _checkCssReproducible(node) {
    if (!node || !node.fills || node.fills.length === 0) {
      return { reproducible: false, css: null, reason: 'no-fills' };
    }

    const visibleFills = node.fills.filter((f) => f.visible !== false);
    if (visibleFills.length === 0) {
      return { reproducible: false, css: null, reason: 'no-visible-fills' };
    }

    // 如果有 IMAGE fill，必须下载图片
    if (visibleFills.some((f) => f.type === 'IMAGE')) {
      return { reproducible: false, css: null, reason: 'has-image-fill' };
    }

    // ️ VECTOR 类型节点有不规则矢量路径，CSS 渐变只能填充矩形/椭圆，无法复现不规则轮廓
    // 只有 RECTANGLE / ELLIPSE 的规则形状才允许 CSS 渐变替代
    if (node.type === 'VECTOR') {
      return {
        reproducible: false,
        css: null,
        reason: 'vector-irregular-shape',
      };
    }

    // 只处理 SOLID 和 GRADIENT 类型
    const cssParts = [];
    for (const fill of visibleFills) {
      if (fill.type === 'SOLID' && fill.color) {
        const hex = this._rgbaToHex(fill.color, fill.opacity ?? 1);
        cssParts.push(hex);
      } else if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops) {
        const stops = fill.gradientStops
          .sort((a, b) => a.position - b.position)
          .map((s) => {
            // stop 不透明度优先，其次填充级 opacity（否则半透明填充会输出成不透明）
            const hex = this._rgbaToHex(s.color, s.opacity ?? fill.opacity ?? 1);
            return `${hex} ${Math.round(s.position * 100)}%`;
          });
        // 方向由 gradientHandlePositions 推导（算法收口在 _gradientAngleDeg，避免多处各推一份）
        cssParts.push(`linear-gradient(${this._gradientAngleDeg(fill)}deg, ${stops.join(', ')})`);
      } else if (fill.type === 'GRADIENT_RADIAL' && fill.gradientStops) {
        const stops = fill.gradientStops
          .sort((a, b) => a.position - b.position)
          .map((s) => {
            const hex = this._rgbaToHex(s.color, s.opacity ?? fill.opacity ?? 1);
            return `${hex} ${Math.round(s.position * 100)}%`;
          });
        cssParts.push(`radial-gradient(circle, ${stops.join(', ')})`);
      } else {
        // 其他类型（VIDEO, etc.）→ 不可 CSS 复现
        return {
          reproducible: false,
          css: null,
          reason: `unsupported-fill: ${fill.type}`,
        };
      }
    }

    if (cssParts.length === 0) {
      return { reproducible: false, css: null, reason: 'no-css-parts' };
    }

    // 多层 fill 用逗号分隔（CSS 支持多层 background）
    const css = cssParts.join(', ');
    return { reproducible: true, css, reason: 'css-ok' };
  }

  /**
   *判断节点是否是微小装饰元素（可用 CSS 替代）
   * 尺寸 < 8x8px 的纯色/简单图形 → CSS 圆点/方块
   * @param {Object} node - Figma 节点
   * @returns {boolean}
   */
  _isTinyDecorative(node) {
    const bbox = node.absoluteBoundingBox;
    if (!bbox) return false;
    return bbox.width < 8 && bbox.height < 8;
  }

  /**
   * 判断节点名是否为「装饰矢量」（不应识别为 icon 资源）。
   * 这些是设计师画 UI 装饰（开关按钮 / tab 图标 / 分隔符 / 状态指示）时的矢量图层，
   * 由 Figma 设计工具自动命名，不承载业务语义。此前它们被 _identifyNodeType 的
   * 「VECTOR/COMPONENT <50px → icon」规则误识别为 icon，导致资源爆炸（单组件 156 个
   * 装饰矢量全被下载并塞进映射，validator 强制使用 → 生成必失败）。
   *
   * 覆盖三类：
   *   1. 中文几何名（含「拷贝/copy」副本后缀）：椭圆_4_拷贝_3-3 / 矩形_6-3 / 形状_10-3 ...
   *   2. Figma 自动编号：Group 2136638523 / Vector 2 / Rectangle 26 / Ellipse 3 / Frame 1280 ...
   *   3. 通用占位名（精确匹配，避免误伤 g-xxx 等真实命名）：g / circle / path / mask / shape ...
   *
   * 注意：不拦截「隧道 1」「extension-cord 1」「robotMan 1」等有语义名词，
   * 也不拦截第一优先级已识别的 icon/arrow/箭头/bg/背景 等命名惯例。
   * @param {string} name 节点名称
   * @returns {boolean}
   */
  _isDecorativeVectorName(name) {
    const n = (name || '').trim();
    if (!n) return true;
    // 1. 中文几何图形名（含拷贝/copy 副本后缀）
    if (
      /^(椭圆|矩形|形状|圆形|圆圈|圆角矩形|三角形|多边形|星形|五角星|菱形|梯形|扇形|弧线|曲线|直线|线段)/.test(
        n,
      )
    )
      return true;
    // 2. Figma 自动编号命名（英文）
    if (
      /^(group|vector|rectangle|ellipse|frame|line|polygon|star|slice|boolean)\b/i.test(
        n,
      )
    )
      return true;
    // 3. 通用占位名（精确匹配）
    if (/^(g|circle|path|mask|shape|oval|dot|ring)$/i.test(n)) return true;
    return false;
  }

  /**
   * 命名级「整体资源节点」判定 — 用户显式命名的组合资源（icon/img/bg 三类）应作为不可分割的整体导出。
   * 背景：用户把含多个 VECTOR/ELLIPSE/RECTANGLE 碎片的组合节点命名为 icon/img/bg（如 2:8817 命名 icon），
   * 期望整体导出 1 张图；但子节点是 <50px VECTOR 会被「小尺寸 VECTOR → icon」规则逐个识别，
   * 反向触发 extractResourceNodes 的「资源容器拆分」(kidResourceCount>=2)，把整体拆成多张碎片图，
   * 违背「整体资源」意图，且 LLM 无法用碎片拼图标。
   * 规则：命名含 icon/图标/arrow/箭头/img/image/图片/bg/背景/background 任一关键词，即视为整体资源（不钻子节点）。
   *   例外：tabs-icon / *-list / *-group / icons 这类「含多个并列独立 icon 按钮」的容器
   *   仍走拆分（历史实锤：tabs-icon FRAME 含 2 个 24×24 独立 icon 按钮）。
   * @param {string} nodeName - 节点名称
   * @returns {boolean} 是否命名级整体资源节点
   */
  _isWholeResourceByName(nodeName) {
    const n = (nodeName || '').toLowerCase();
    const named =
      n.includes('icon') ||
      n.includes('图标') ||
      n.includes('arrow') ||
      n.includes('箭头') ||
      n.includes('img') ||
      n.includes('image') ||
      n.includes('图片') ||
      n.includes('bg') ||
      n.includes('背景') ||
      n.includes('background');
    if (!named) return false;
    // 🛡️ P1-2（2026-08-30）：`/(^|[-_])icons$/`，不是 `/icons?$/`。
    //    后者 `s?` 让 s 变可选，实际同时匹配 icon 与 icons —— 于是 btn-icon / tab-icon
    //    这些「单个图标」也被当成多图标容器走拆分，被拆成 VECTOR 碎片，
    //    违背「icon 整体导出、不钻内部碎片」的原则（用户四原则①）。
    const isMultiContainer =
      n.startsWith('tabs-') ||
      /-list$/.test(n) ||
      /(^|[-_])icons$/.test(n) ||
      /-group$/.test(n);
    return !isMultiContainer;
  }

  /**
   *生成资源去重签名（基于 fill 内容）
   * 相同颜色/渐变的节点复用同一张图片，避免重复下载
   * @param {Object} node - Figma 节点
   * @returns {string|null} 签名
   */
  _generateAssetSignature(node) {
    if (!node || !node.fills) return null;
    const visibleFills = node.fills.filter((f) => f.visible !== false);
    if (visibleFills.length === 0) return null;

    const parts = visibleFills.map((f) => {
      if (f.type === 'SOLID' && f.color) {
        return `SOLID:${this._rgbaToHex(f.color, f.opacity ?? 1)}`;
      }
      if (f.type === 'IMAGE' && f.imageRef) {
        return `IMAGE:${f.imageRef}`;
      }
      if (f.type.startsWith('GRADIENT_') && f.gradientStops) {
        const stops = f.gradientStops
          .sort((a, b) => a.position - b.position)
          .map(
            (s) => `${this._rgbaToHex(s.color, s.opacity ?? 1)}@${s.position}`,
          );
        return `${f.type}:${stops.join('|')}`;
      }
      return `${f.type}:${f.visible ?? true}`;
    });

    // 加上尺寸信息（同色但不同尺寸仍需分开）
    const bbox = node.absoluteBoundingBox;
    const sizeKey = bbox
      ? `${Math.round(bbox.width)}x${Math.round(bbox.height)}`
      : 'unknown';
    return `${parts.join('||')}##${sizeKey}`;
  }

  /**
   * 识别节点类型（bg/icon/image/chrome）
   *  双识别策略 — 命名惯例 + 视觉属性推断
   *  增加 chrome 检测（面板 header/title 装饰资源）+ GROUP/FRAME 容器识别
   * @param {string} nodeName - 节点名称
   * @param {Object} node - Figma 节点（可选，用于视觉属性推断）
   */
  _identifyNodeType(nodeName, node = null) {
    if (!nodeName) return 'unknown';

    const nameLower = nodeName.toLowerCase();

    // === 第零优先级：面板 chrome 检测 ===
    // 这些资源属于 base-panel 的标题栏/头部装饰，不应下载到组件目录
    if (
      nameLower.startsWith('点背景') ||
      nameLower.includes('title-logo') ||
      nameLower.includes('title-icon') ||
      nameLower.includes('logo-title') ||
      nameLower.startsWith('bg-header') ||
      nameLower.startsWith('header-bg') ||
      nameLower.startsWith('bg-title') ||
      nameLower.startsWith('title-bg') ||
      nameLower.startsWith('header-deco') ||
      nameLower.startsWith('deco-header')
    ) {
      return 'chrome';
    }

    // === 第一优先级：命名惯例 ===
    // bg 相关
    if (
      nameLower === 'bg' ||
      nameLower.startsWith('bg-') ||
      nameLower.startsWith('bg ') ||
      nameLower.includes('背景') ||
      nameLower.includes('background')
    ) {
      return 'bg';
    }
    // icon 相关
    if (
      nameLower.includes('icon') ||
      nameLower.includes('图标') ||
      nameLower.includes('icon-') ||
      nameLower.includes('arrow') ||
      nameLower.includes('箭头')
    ) {
      return 'icon';
    }
    // img/image 相关
    if (
      nameLower === 'img' ||
      nameLower === 'image' ||
      nameLower.startsWith('img-') ||
      nameLower.startsWith('image-') ||
      nameLower.includes('图片')
    ) {
      return 'image';
    }

    // === 第二优先级：视觉属性推断（需要 node 数据） ===
    if (node) {
      // 1. IMAGE fill 优先：有图片填充的节点是真正的资源（bg 背景图 / icon 图标）。
      //    ⚠️ bg 不一定是 VECTOR，可能是 FRAME / RECTANGLE 类型，甚至用 Figma 默认名
      //    （Frame / Group 数字 / Rectangle 26）。只要带背景图就必须按资源处理，
      //    绝不能因「名字像装饰」跳过——否则会漏用整块背景图。
      if (
        node.fills &&
        node.fills.some((f) => f.type === 'IMAGE' && f.visible !== false)
      ) {
        const bbox = node.absoluteBoundingBox;
        if (bbox) {
          if (bbox.width > 200 || bbox.height > 200) return 'bg';
          return 'icon';
        }
        // 无 bbox 信息 → 默认为 image
        return 'image';
      }

      // 2. 装饰矢量识别（仅针对无 IMAGE fill 的纯色/渐变矢量）：
      //    中文几何名（椭圆/矩形/形状等）、Figma 自动编号（Group/Vector/Rectangle/Frame）、
      //    占位名（g/circle/path）都是 UI 装饰矢量（开关/tab 图标/分隔符），不承载业务语义。
      //    它们返回 unknown（不下载、不进映射、不被 validator 强制使用），
      //    否则会像 mc-max-1787821650008-a53109f6 那样资源爆炸 + L0-B 误伤 156 个 BLOCK。
      if (this._isDecorativeVectorName(nodeName)) {
        return 'unknown';
      }

      // 3. GROUP/FRAME 容器识别：如果子节点全是 VECTOR/LINE/ELLIPSE 等矢量图形，
      //    将整个容器视为单个 icon 资源（避免子节点被分别下载）
      if (
        (node.type === 'GROUP' || node.type === 'FRAME') &&
        node.children &&
        node.children.length > 0 &&
        node.children.every(
          (c) =>
            c.type === 'VECTOR' ||
            c.type === 'LINE' ||
            c.type === 'ELLIPSE' ||
            c.type === 'RECTANGLE' ||
            c.type === 'BOOLEAN_OPERATION' ||
            c.type === 'STAR' ||
            c.type === 'POLYGON' ||
            c.type === 'BOOLEAN',
        )
      ) {
        logger.info(`📦 GROUP/FRAME 矢量组识别为单个 icon: ${nodeName}`, {
          nodeId: node.id,
          childCount: node.children.length,
        });
        return 'icon';
      }

      // 4. 小尺寸 VECTOR/COMPONENT 且无文字 → 疑似 icon
      if (node.type === 'VECTOR' || node.type === 'COMPONENT') {
        const bbox = node.absoluteBoundingBox;
        if (bbox && bbox.width < 50 && bbox.height < 50) {
          return 'icon';
        }
      }
    }

    return 'unknown';
  }

  /**
   * 推断DOM选择器
   */
  _inferDomSelector(node) {
    const name = node.name
      .toLowerCase()
      .replace(/^(bg-|img-|icon-)/, '')
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');

    return `.${name}-container`;
  }

  /**
   * 🛡️ 语义祖先提取（2026-09-03，mc-max-1788373427334 背景乱用实锤）。
   *
   * bg 资源的语义 = 「它直接父元素的背景」，而资源节点自己的 name 常是自动命名
   * （bg-[m] / bg / Rectangle）或无效序号，据此生成的 hint（'[m]区域'）语义区分度为零，
   * 三个 [m] 子片段（汇总卡背景 / 车型分布左图 / 车型分布右图）hint 全一样 → LLM 乱用背景。
   *
   * 从祖先名链（path，近→远）找最近一个「有语义」的祖先：
   *   - 排除自动命名（Group/Frame/Rectangle/Vector/Ellipse/Line/Polygon/Star + 数字）；
   *   - 排除资源节点名（bg-/img-/icon- 前缀）；
   *   - 保留中文名与 slot-* 等业务命名（如 slot-当日总流量 / slot-车型分布）。
   * 找不到则返回 ''（调用方回退 node.name 保持原行为）。
   * @param {string[]} path 祖先节点名链（不含当前节点）
   * @returns {string} 语义祖先名，找不到返回 ''
   */
  _semanticAncestor(path = []) {
    if (!Array.isArray(path)) return '';
    for (let i = path.length - 1; i >= 0; i--) {
      const name = String(path[i] || '').trim();
      if (!name) continue;
      if (/^(Group|Frame|Rectangle|Vector|Ellipse|Line|Polygon|Star)\b/i.test(name)) continue;
      if (/^\d+$/.test(name)) continue;
      if (/^(bg|img|icon)-/i.test(name)) continue;
      if (/^@[a-zA-Z]/.test(name)) continue; // 技术栈标记
      return name;
    }
    return '';
  }

  /**
   * 生成使用提示
   */
  _inferDomHint(node, path = []) {
    const semantic = this._semanticAncestor(path);
    const name = (semantic || node.name)
      .replace(/^(bg-|img-|icon-)/, '')
      .replace(/^slot-/, '');
    return `${name}区域`;
  }

  /**
   * 🛡️ R12（2026-08-30）：判断 @技术栈 标记属于「图表库」还是「UI 控件库」。
   *
   * 两者语义完全相反，必须分流：
   *  - 图表库（@echarts / @chart / @chartjs / @plotly / @g2 / @antv / @d3 …）：
   *    子树里的柱/折线/饼块/图例/坐标轴全部是运行时 canvas 渲染产物，不是设计素材。
   *    下钻只会导出 3~4px 宽的柱子碎片（mc-max-1788067021808 实锤：107 条资源映射里
   *    96 条 = 89.7% 是 @echarts/bar 下的「柱-*」png）。
   *  - UI 控件库（@antd / @element / @arco / @vant …）：控件内部常被塞入业务内容
   *    （@antd/tab → cons/ → 12 个真实图标），必须下钻，否则业务资源全丢
   *    （mc-max-1788003760938 实锤）。
   *
   * @param {string} name 节点名（含 @ 标记）
   * @returns {boolean} true=图表库（整棵子树跳过）；false=UI 控件库或其它（走下钻）
   */
  _isChartStackLibrary(name) {
    const mark = String(name || '')
      .toLowerCase()
      .match(/@([a-z]+)/);
    if (!mark) return false;
    return /^(echarts?|chartjs|charts?|plotly|g2|g2plot|antv|d3|highcharts|bizcharts|vchart)$/.test(
      mark[1],
    );
  }

  /**
   * 🛡️ P0-1（2026-08-30）：判断 @xxx 技术栈节点的直接子节点是否为「控件内部构件」。
   *
   * 设计稿常把业务内容塞在 @antd/tab 的 FRAME 下（如 cons/ 设备卡片区含 12 个真实图标），
   * 旧逻辑整棵子树一刀切跳过 → 12 图标全部丢失（mc-max-1788003760938 实锤）。
   * 治本：@xxx 节点不再整体跳过，而是下钻「业务内容」子节点、跳过「控件内部构件」子节点。
   *
   * 判定：名字含 @（嵌套技术栈），或命中控件通用构件名（tabs/tab/pane/item/... 等）
   * → 控件构件，跳过；否则（cons/card/device 等业务命名）→ 业务内容，继续下钻。
   *
   * 🛡️ R12 补充：图表构件名（bar/柱/legend/axis/grid/label/series/tooltip…）一并纳入，
   * 即便图表节点嵌在非 @ 节点下也不会被当成业务资源下钻。
   */
  _isStackControlPart(node) {
    const name = String(node?.name || '').toLowerCase();
    if (/@[a-zA-Z]/.test(name)) return true;
    const CONTROL_PART_RE =
      /^(tabs?|tab-|pane|panel|content|body|header|footer|list|item|option|menu|dropdown|trigger|handle|thumb|track|rail|dot|line|arrow|chevron|caret|close|clear|spin|loader|empty|placeholder|tooltip|popover|mask|overlay|separator|divider|scrollbar|resize-handle|柱|柱-?\d+|bar|bars?|柱-?状图|折线|折线图|饼图|legend|图例|axis|坐标轴|grid|label|series|line-?chart|bar-?chart)$/i;
    return CONTROL_PART_RE.test(name);
  }

  /**
   * 构建资源-DOM映射表
   *  支持 CSS 替代资源（cssInsteadOfImage）和去重资源（deduplicatedFrom）
   */
  _buildResourceDomMapping(nodeData, downloadedImages) {
    const mappings = [];

    const traverse = (node, path = [], parentBox = null) => {
      if (!node) return;

      // 🛡️ 技术栈标记子树跳过（与 extractResourceNodes 下载阶段保持一致）：
      // @antd/@echarts 等第三方组件区域由组件渲染，不导出静态资源，也不进映射。
      // 否则 mapping 阶段会重新遍历 @antd/tab 整棵子树，把 tab 图标装饰矢量、卡片背景
      // 全部塞进资源映射，触发 validator「未使用」BLOCK 误伤。
      // 🛡️ P0-1（2026-08-30）：不再整棵跳过，下钻业务内容、跳过控件构件（与下载阶段同口径）。
      if (node.name && /@[a-zA-Z]/.test(node.name)) {
        // 与下载阶段同口径（R12）：图表库整棵跳过，UI 控件库下钻业务内容
        if (this._isChartStackLibrary(node.name)) return;
        const kids = Array.isArray(node.children) ? node.children : [];
        for (const k of kids) {
          if (this._isStackControlPart(k)) continue;
          traverse(k, [...path, node.name], node.absoluteBoundingBox);
        }
        return;
      }

      const nodeType = this._identifyNodeType(node.name, node);

      // 跳过 chrome 资源和 unknown 节点
      if (nodeType !== 'unknown' && nodeType !== 'chrome') {
        //先匹配已下载的资源（无论成功或失败）
        let matchedAsset = null;
        if (downloadedImages && Array.isArray(downloadedImages)) {
          matchedAsset = downloadedImages.find(
            (asset) => asset.ref === node.id,
          );
        }

        //  判断资源类型 — CSS 替代 / 去重复用 / 正常下载 / 缺失
        let downloadStatus;
        let cssValue = null;
        let deduplicatedFrom = null;

        if (matchedAsset?.cssInsteadOfImage) {
          // CSS 替代资源
          downloadStatus = 'css';
          cssValue = matchedAsset.cssValue;
        } else if (matchedAsset?.deduplicatedFrom) {
          // 去重复用资源
          downloadStatus = 'deduplicated';
          deduplicatedFrom = matchedAsset.deduplicatedFrom;
          if (matchedAsset.localPath) {
            downloadStatus = 'success';
          }
        } else if (matchedAsset?.downloaded && matchedAsset?.localPath) {
          downloadStatus = 'success';
        } else if (matchedAsset?.isNetworkError) {
          downloadStatus = 'network_error';
        } else {
          downloadStatus = 'missing';
        }

        //语义变量名：基于节点名称生成可读变量名，不再纯靠位置编号
        // 🛡️ #1a（mc-max-1787927914106 实锤，2026-08-29）：CSS 替代资源（downloadStatus='css'，
        // 无 resourceFile、纯色值）**不分配语义变量名**。否则 `bg-[m]` 的语义名 `bgm` 会进入
        // 语义名空间，模型在模板里写 `url(${bgm})`，但 buildVarToMapping 只收 success 条目 →
        // bgm 既不被 import 注入、也不被语义门禁视为已声明 → 语义校验 fail-closed 死循环。
        const semanticVarName =
          downloadStatus === 'css' ? null : this._deriveSemanticVarName(node.name, nodeType);

        //装饰性微小图标识别：≤12px 的 icon 通常是圆点/短线/分隔符等纯装饰元素，
        // 不是承载语义的业务图标。此前它们与真实图标混在同一列表中，LLM 无从区分，
        // 容易把 8×8 的蓝色圆点当作面板主图标使用（渲染出来几乎不可见）。
        const DECORATION_MAX_SIZE = 12;
        const _box = node.absoluteBoundingBox;
        const isTinyDecoration =
          nodeType === 'icon' &&
          !!_box &&
          _box.width <= DECORATION_MAX_SIZE &&
          _box.height <= DECORATION_MAX_SIZE;

        //视觉元数据：fills/effects/尺寸摘要
        const visualMeta = this._extractVisualMeta(node);

        //推荐使用模式：基于节点属性推断最佳用法
        const recommendedUsage = this._inferRecommendedUsage(node, nodeType);

        //  根据 CSS/图片类型生成不同的 usage 和 fallbackHint
        let usageHint;
        let fallbackHint = null;

        if (downloadStatus === 'css' && cssValue) {
          // CSS 替代资源：直接给出 CSS 值
          usageHint = `:style="{ background: '${cssValue}' }"`;
          fallbackHint = `✅ CSS 替代（无需图片）: background: ${cssValue};`;
        } else if (nodeType === 'bg') {
          usageHint = ':style="{ backgroundImage: `url(\${bgX})` }"';
          if (downloadStatus !== 'success') {
            fallbackHint = `⚠️ 资源下载失败(${downloadStatus}), 请使用CSS替代方案（CSS background 渐变/纯色）`;
          }
        } else {
          usageHint = '<img :src="iconX">';
          if (downloadStatus !== 'success') {
            fallbackHint = `⚠️ 资源下载失败(${downloadStatus}), 请使用CSS替代方案（CSS 绘制图标样式）`;
          }
        }

        const mapping = {
          resourceFile: null,
          figmaNodeId: node.id,
          figmaPath: [...path, node.name].join('/'),
          name: node.name,
          figmaBox: node.absoluteBoundingBox,
          // 🎯 父容器 box（2026-08-25 背景精确还原）：用于计算背景相对偏移 + 判断是否平铺
          parentBox,
          usage: usageHint,
          targetDomSelector: this._inferDomSelector(node),
          targetDomHint: this._inferDomHint(node, path),
          previewAnalysisRole: nodeType,
          hint: `${this._semanticAncestor(path) || node.name} → ${this._inferDomHint(node, path)}`,
          //下载状态（不再靠 resourceFile === null 判断）
          downloadStatus,
          //  CSS 替代值（downloadStatus='css' 时有值）
          cssValue,
          //  去重来源
          deduplicatedFrom,
          //不可用资源时给 LLM 的替代提示
          fallbackHint,
          //语义变量名（替代纯位置编号 bg1/icon1）
          semanticVarName,
          //视觉元数据
          visualMeta,
          //推荐使用模式
          recommendedUsage,
          //装饰性微小图标标记（≤12px 圆点/短线等），供 prompt 单独分组降权
          isTinyDecoration,
        };

        //关联实际下载的资源文件名（仅成功下载的）
        if (matchedAsset?.downloaded && matchedAsset?.localPath) {
          const fileName = matchedAsset.localPath.split('/').pop();
          mapping.resourceFile = `../resources/images/${fileName}`;
        }

        //  去重复用时也关联源文件
        if (deduplicatedFrom && matchedAsset?.localPath) {
          const fileName = matchedAsset.localPath.split('/').pop();
          mapping.resourceFile = `../resources/images/${fileName}`;
        }

        mappings.push(mapping);

        // 🛡️ 命名级整体资源节点（icon/img/bg）：整体进映射后不再钻子节点，
        // 避免内部 VECTOR 碎片被「小尺寸 VECTOR→icon」识别为独立资源重复进映射。
        // 例外：tabs-icon / *-list / *-group / icons 等多 icon 容器仍继续递归子节点。
        if (this._isWholeResourceByName(node.name)) {
          return;
        }
      }

      if (node.children) {
        node.children.forEach((child) =>
          traverse(child, [...path, node.name], node.absoluteBoundingBox),
        );
      }
    };

    traverse(nodeData);

    //语义变量名去重：同名 Figma 节点（如多张 "Group 2136638523" 实例）会推导出
    // 完全相同的 semanticVarName，导致下游 injectResourceImports 中后者覆盖前者，
    // 所有引用都指向同一张（最后一张）图片，造成「编号错位/指向错图」。
    // 这里在映射表层面保证 semanticVarName 全局唯一：首次出现保留原名，后续冲突追加
    // _2 / _3 …（与 _formatResourceMapping / injectResourceImports 的命名口径保持一致）。
    const _seenSemantic = new Map();
    for (const m of mappings) {
      const name = m.semanticVarName;
      if (!name) continue;
      const prev = _seenSemantic.get(name);
      if (prev === undefined) {
        _seenSemantic.set(name, 1);
      } else {
        const n = prev + 1;
        _seenSemantic.set(name, n);
        m.semanticVarName = `${name}_${n}`;
      }
    }

    // ── 变量名单一事实源固化 ──────────────────────────────────────────
    // 背景：此前 bg1/icon1/img1 这类「位置编号」在 prompt 侧（formatResourceMapping，
    // 微码 filterPanelResources:true 先过滤面板资源再编号）与注入侧（buildVarToMapping，
    // 不过滤直接编号）各自重新计算，两边过滤口径不一致 → 同一个 bg1 指向不同图片，
    // 导致「静态图放错位置」。
    //
    // 根治：在 mapping 生成阶段一次性固化 assignedVarName，并显式标记 isPanelResource，
    // 下游（prompt 侧 + 注入侧）只读 assignedVarName，不再各自推导编号。
    //
    // 关键设计：编号对「全部 success 资源」（不过滤面板资源）按 traverse 稳定顺序分配，
    // 「是否面板资源」仅作标记（isPanelResource），由下游按各自模式决定是否过滤
    // （微码 filterPanelResources:true 过滤，Vue3 :false 保留）。编号与过滤彻底解耦，
    // 保证：同一个资源在微码/Vue3 两种模式下 assignedVarName 恒一致，永不漂移。
    const roleIndex = { bg: 0, icon: 0, img: 0 };
    const successMappings = [];
    for (const m of mappings) {
      // 复用单一事实源 isPanelResource（与 filterPanelResources 同源）
      m.isPanelResource = isPanelResource(m);

      // ── bg→父容器挂载目标（2026-08-25 用户规则）──
      // bg = 父元素的背景图或背景样式；icon、img = 静态资源，不做容器挂载。
      // 面板根直接子 bg（2 段路径，如 cp-xxx/bg）不需要还原 → skipMount。
      // 嵌套容器内 bg（≥3 段，如 cp-xxx/.../tabs-list/bg）→ mountTarget = 父容器名。
      // 注意：对所有 bg 条目计算（含下载失败需 CSS 样式兜底者），故须在下方 continue 之前。
      if (m.previewAnalysisRole === 'bg') {
        const segs = String(m.figmaPath || '')
          .split('/')
          .filter(Boolean);
        if (segs.length >= 3) {
          m.mountTarget = segs[segs.length - 2];
          // ── F3：无语义 mountTarget 过滤（2026-09-01，mc-max-1788252098143-12469472 实锤）──
          // 单字符（'t'）/ 纯「类型+编号」（Group 2136636802 / Frame 1280）等 Figma 作者随手命名
          // → 清空挂载目标，不参与 CODE-016 强制挂载（匹配过宽/不可执行，RESOURCE-003 误报根源）。
          // 注意：不能置 skipMount —— N4 根容器注入（vue3-engineer.js:1470 / microcode-engineer.js:5078）
          // 用 .find(skipMount bg) 选「面板整体背景」，置 skipMount 会被误选铺到根容器。
          if (!isSemanticMountTarget(m.mountTarget)) {
            m.mountTarget = null;
          }
        } else {
          m.skipMount = true;
        }
        // ── bgRole 几何推导（2026-08-25，不依赖节点命名）──
        // 面积比 + bbox IoU 双信号判定：整块背景（container，覆盖父容器）vs 局部/状态背景（sub-state）。
        // 实锤：tabs-list/bg 295×27=父容器（ratio 1.0）；tabs-list/bg-tab-active 78×21（ratio 0.21）。
        const fw = m.figmaBox?.width || 0;
        const fh = m.figmaBox?.height || 0;
        const pw = m.parentBox?.width || 0;
        const ph = m.parentBox?.height || 0;
        if (fw > 0 && fh > 0 && pw > 0 && ph > 0) {
          const areaRatio = (fw * fh) / (pw * ph);
          const bx = m.figmaBox?.x || 0,
            by = m.figmaBox?.y || 0;
          const px = m.parentBox?.x || 0,
            py = m.parentBox?.y || 0;
          const ix = Math.max(0, Math.min(bx + fw, px + pw) - Math.max(bx, px));
          const iy = Math.max(0, Math.min(by + fh, py + ph) - Math.max(by, py));
          const interArea = ix * iy;
          const unionArea = fw * fh + pw * ph - interArea;
          const ioU = unionArea > 0 ? interArea / unionArea : 0;
          m.bgRole = areaRatio >= 0.8 && ioU >= 0.8 ? 'container' : 'sub-state';
        } else {
          // 无几何信息时保守按整块处理（维持原有挂载行为）
          m.bgRole = 'container';
        }
      }

      if (m.downloadStatus !== 'success') {
        continue;
      }
      const role =
        m.previewAnalysisRole === 'image' ? 'img' : m.previewAnalysisRole;
      if (!Object.prototype.hasOwnProperty.call(roleIndex, role)) {
        continue;
      }
      // 统一用固化位置编号（bg1/bg2/icon1/icon2...）。semanticVarName 仅作语义描述（供
      // prompt 的 hint/targetDomSelector 说明用途），绝不作为变量名——否则语义名（如
      // bgtabActive）会被 injectResourceImports 当作 import 变量注入，与模型手写的
      // `const bgtabActive = bg1` 别名映射冲突，产生重复声明（2026-08-16 事故）。
      // 语义名与编号彻底解耦。此处只收集，编号统一移到循环后的「视觉序」阶段。
      successMappings.push({ m, role });
    }

    // 视觉序编号（刀 4，2026-09-13）：见下方 assignVisualOrderVarNames 纯函数。
    assignVisualOrderVarNames(successMappings);

    return mappings;
  }

  /**
   *从节点名称推导语义变量名
   * 例: "bg-decoration" → "bgDecoration", "icon-arrow" → "iconArrow"
   */
  _deriveSemanticVarName(nodeName, nodeType) {
    if (!nodeName) return null;

    const prefix =
      nodeType === 'bg' ? 'bg' : nodeType === 'icon' ? 'icon' : 'img';

    // 去掉类型前缀（bg-/icon-/img-/image-），取剩余部分作为语义名
    let semanticPart = nodeName
      .replace(/^(bg|icon|img|image)[-_\s]/i, '')
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    // 如果去掉前缀后为空或与原名相同（如节点名就叫 "bg"），用位置编号
    if (!semanticPart || semanticPart === nodeName) {
      return null; // fallback 到位置编号
    }

    // 长语义名截断
    if (semanticPart.length > 20) {
      semanticPart = semanticPart.substring(0, 20);
    }

    // 驼峰化：bg_decoration → bgDecoration
    const camelized =
      prefix +
      semanticPart
        .split('_')
        .filter(Boolean)
        .map((s, i) =>
          i === 0
            ? s.toLowerCase()
            : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
        )
        .join('');

    return camelized;
  }

  /**
   *提取节点的视觉元数据摘要
   * 供 LLM 了解资源的外观特征（渐变方向、色值、尺寸比例等）
   */
  _extractVisualMeta(node) {
    if (!node) return null;

    const meta = {};

    // 绝对尺寸
    const bbox = node.absoluteBoundingBox;
    if (bbox) {
      meta.width = Math.round(bbox.width);
      meta.height = Math.round(bbox.height);
    }

    // Fills 摘要（颜色/渐变）
    if (node.fills && node.fills.length > 0) {
      const visibleFills = node.fills.filter((f) => f.visible !== false);

      // SOLID fills → 提取颜色值
      const solids = visibleFills.filter((f) => f.type === 'SOLID' && f.color);
      if (solids.length > 0) {
        meta.fillsSummary = solids
          .map((f) => this._rgbaToHex(f.color, f.opacity))
          .join(', ');
      }

      // GRADIENT fills → 提取渐变色值
      const gradients = visibleFills.filter(
        (f) => f.type.startsWith('GRADIENT_') && f.gradientStops,
      );
      if (gradients.length > 0) {
        meta.fillsSummary = gradients
          .map((g) => {
            // 🛡️ 2026-09-15（mc-max-1789452271404-7e0e19d2 实锤）：渐变必须带上**填充级透明度**
            // 与**方向**，否则这段摘要作为 CSS 兜底/参考时是错的：
            //   · 只取 `s.opacity`（每个 stop 的不透明度，Figma 里通常缺省）→ 丢掉 `g.opacity`
            //     （本例 tabs-list 底图 = 0.6 半透明），输出**不透明**渐变 → 遮挡下层；
            //   · 不带角度 → 模型只能自己编（实机产物出现 `linear-gradient(180deg, …)`，
            //     而真值方向需从 gradientHandlePositions 推）。
            // 与路径 A（_build…CssFromFills）同口径：stop 不透明度优先，其次填充级，最后 1。
            const stops = g.gradientStops
              .sort((a, b) => a.position - b.position)
              .map(
                (s) =>
                  `${this._rgbaToHex(s.color, s.opacity ?? g.opacity ?? 1)} ${Math.round(s.position * 100)}%`,
              );
            const kind =
              g.type === 'GRADIENT_LINEAR'
                ? 'linear'
                : g.type === 'GRADIENT_RADIAL'
                  ? 'radial'
                  : 'angular';
            // linear 带方向；radial/angular 无角度语义（与路径 A 同口径，角度算法收口在 _gradientAngleDeg）
            const angle = kind === 'linear' ? `${this._gradientAngleDeg(g)}deg, ` : '';
            return `${kind}-gradient(${angle}${stops.join(', ')})`;
          })
          .join('; ');
      }
    }

    // Effects 摘要（阴影/模糊）
    if (node.effects && node.effects.length > 0) {
      const visibleEffects = node.effects.filter((e) => e.visible !== false);
      if (visibleEffects.length > 0) {
        meta.effectsSummary = visibleEffects
          .map((e) => {
            if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
              const color = this._rgbaToHex(e.color, e.opacity ?? 1);
              return `${e.type === 'DROP_SHADOW' ? 'box-shadow' : 'inner-shadow'}: ${Math.round(e.offset?.x || 0)}px ${Math.round(e.offset?.y || 0)}px ${Math.round(e.radius)}px ${color}`;
            }
            if (e.type === 'BLUR') {
              return `blur: ${Math.round(e.radius)}px`;
            }
            return `${e.type}`;
          })
          .join('; ');
      }
    }

    // Opacity
    if (typeof node.opacity === 'number' && node.opacity !== 1) {
      meta.opacity = node.opacity;
    }

    return Object.keys(meta).length > 0 ? meta : null;
  }

  /**
   *推断资源最佳使用模式
   * bg: 大面积 → backgroundStyle绑定, 小面积 → backgroundBlock
   * icon: 小尺寸 → imgSrc, 大尺寸 → decorativeBlock
   * img: 通用 → imgSrc
   */
  _inferRecommendedUsage(node, nodeType) {
    const bbox = node.absoluteBoundingBox;

    if (nodeType === 'bg') {
      if (!bbox) return 'backgroundStyle';
      // 🛡️ 修复：判断整体背景需「宽高都较大且宽高比均衡」，避免横幅装饰被误判
      // 原逻辑 bbox.width>200 || bbox.height>200 会把 425×91 的装饰横幅（TotalTraffic 内
      // 汽车图标条）判为 backgroundStyle，导致模型把它贴到根容器当全组件背景。
      const w = bbox.width;
      const h = bbox.height;
      const ratio = w / Math.max(h, 1);
      // 横幅/竖幅装饰（宽高比极端）→ 局部装饰块
      const isExtremeRatio = ratio > 2.5 || ratio < 0.4;
      // 真正的整体背景：宽高都 > 120px、至少一边 > 200px、且宽高比不极端
      if (!isExtremeRatio && (w > 200 || h > 200) && w > 120 && h > 120)
        return 'backgroundStyle';
      return 'backgroundBlock';
    }

    if (nodeType === 'icon') {
      if (!bbox) return 'imgSrc';
      // 小 icon (<50px) → img :src
      if (bbox.width < 50 && bbox.height < 50) return 'imgSrc';
      // 大 → 装饰元素
      return 'decorativeBlock';
    }

    if (nodeType === 'image') return 'imgSrc';

    return 'imgSrc';
  }

  /**
   *Figma RGBA → CSS hex 颜色
   * Figma color: { r: 0-1, g: 0-1, b: 0-1 } → #rrggbb
   */
  _rgbaToHex(color, opacity = 1) {
    if (!color) return '#000000';
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    if (opacity < 1) {
      const a = Math.round(opacity * 255);
      return hex + a.toString(16).padStart(2, '0');
    }
    return hex;
  }

  /**
   * 线性渐变方向（CSS 角度，0deg = 向上、顺时针）。
   *
   * 🛡️ 单一事实源（2026-09-15）：原先只有「可复现 CSS」那条路径内联推导角度，
   * `visualMeta.fillsSummary` 那条不带方向 → 模型只能自己编角度（实机产物出现
   * `linear-gradient(180deg, …)`）。两处收口到本方法，口径一致。
   *
   * Figma 的 y 轴向下为正，故取 `atan2(dx, -dy)`；无 handle 时回退 180（从上到下）。
   */
  _gradientAngleDeg(fill) {
    const handles = fill && fill.gradientHandlePositions;
    if (!Array.isArray(handles) || handles.length < 2) return 180;
    const p0 = handles[0];
    const p1 = handles[1];
    if (!p0 || !p1) return 180;
    const dx = (p1.x ?? 0) - (p0.x ?? 0);
    const dy = (p1.y ?? 0) - (p0.y ?? 0);
    let angle = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
    if (angle < 0) angle += 360;
    return angle;
  }

  /**
   * 6-A · 构建 nodeId→fills 颜色索引（确定性事实源）
   *
   * 遍历 Figma 节点树，为每个有 fills 的节点建立颜色映射。
   * 文本节点的颜色归为 textColor，容器/形状节点的颜色归为 bgColor。
   *
   * 返回：Map<nodeId, { fillsSummary, textColor?, bgColor?, nodeType }>
   * - fillsSummary: 原始 fills 摘要（复用 _extractVisualMeta 的口径）
   * - textColor: 文本节点的文字颜色（hex）
   * - bgColor: 容器/形状节点的背景颜色（hex 或 gradient CSS）
   * - nodeType: 'text' | 'container' | 'resource'
   *
   * 用途：供 6-B 颜色确定性装配消费，按 nodeId 绑定颜色真值。
   */
  buildNodeColorIndex(figmaNodeData) {
    const index = new Map();
    if (!figmaNodeData) return index;

    this.traverseFigmaTree(figmaNodeData, (node) => {
      if (!node || !node.id) return;

      // 提取 fills 摘要（复用 _extractVisualMeta 的颜色算法）
      const visualMeta = this._extractVisualMeta(node);
      if (!visualMeta || !visualMeta.fillsSummary) return;

      const entry = {
        fillsSummary: visualMeta.fillsSummary,
        nodeType: 'container',
      };

      // 文本节点：颜色归为 textColor
      if (node.type === 'TEXT') {
        entry.nodeType = 'text';
        entry.textColor = visualMeta.fillsSummary;
      } else {
        // 容器/形状节点：颜色归为 bgColor
        // 资源节点（bg/icon/image）在资源映射里已处理，这里只索引业务节点
        const isResource =
          node.type === 'RECTANGLE' &&
          node.absoluteBoundingBox &&
          (node.absoluteBoundingBox.width > 100 || node.absoluteBoundingBox.height > 100);
        if (isResource) {
          entry.nodeType = 'resource';
        }
        entry.bgColor = visualMeta.fillsSummary;
      }

      index.set(node.id, entry);
    });

    return index;
  }
}
