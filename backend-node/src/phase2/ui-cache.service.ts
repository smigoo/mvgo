import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * UI 分析缓存服务（S14 — 路径B核心）
 * 职责：再生成时复用 Figma 拉取/视觉分析结果，避免重复调用 Figma API 与 Vision AI
 * 缓存位置（与 mc-gen 工具链同构）：
 *   {componentDir}/.mc-gen/cache/figma-node-data.json   ← Figma 节点数据
 *   {componentDir}/.mc-gen/config/preview-analysis.json ← 视觉分析产物
 * 实测修正 C1：figma-node-data.json 可能是 { fileKey, nodeId, document } 包装或裸节点 → 多结构兼容加载
 */

export interface UiCacheHit {
  hit: boolean;
  figmaNodeData?: any;
  previewAnalysis?: any;
  figmaAssets?: any;
  resourceDomMapping?: any;
  source: 'cache' | 'none';
  staleReason?: string;
}

export interface UiCacheSaveInput {
  figmaNodeData: any;
  previewAnalysis?: any;
  assets?: any;
  resourceDomMapping?: any;
  fileKey?: string;
  nodeId?: string;
}

@Injectable()
export class UiCacheService {
  private readonly logger = new Logger(UiCacheService.name);

  /** 多结构兼容加载（C1：{document} 包装 || 裸节点） */
  private loadFigmaRoot(data: any): any {
    if (!data) return null;
    return data.document || data;
  }

  /**
   * 缓存命中检测
   * @param componentDir 组件目录
   * @param expected 期望的 fileKey+nodeId（不一致 → stale）
   */
  check(componentDir: string, expected?: { fileKey?: string; nodeId?: string }): UiCacheHit {
    const figmaCachePath = join(componentDir, '.mc-gen', 'cache', 'figma-node-data.json');
    const previewPath = join(componentDir, '.mc-gen', 'config', 'preview-analysis.json');

    if (!existsSync(figmaCachePath)) {
      return { hit: false, source: 'none', staleReason: 'figma 缓存不存在' };
    }

    try {
      const figmaRaw = JSON.parse(readFileSync(figmaCachePath, 'utf-8'));
      const figmaNodeData = this.loadFigmaRoot(figmaRaw);

      // 🆕 TTL 校验：cachedAt 超过 24h 视为过期（Figma 设计稿可能已变更）
      const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24h
      if (figmaRaw.cachedAt) {
        const cachedAtTime = new Date(figmaRaw.cachedAt).getTime();
        if (!isNaN(cachedAtTime) && Date.now() - cachedAtTime > MAX_CACHE_AGE_MS) {
          return {
            hit: false,
            source: 'none',
            staleReason: `缓存已过期（cachedAt ${figmaRaw.cachedAt} 超过 24h）`,
          };
        }
      }

      // fileKey/nodeId 一致性检查（换了 Figma 节点 → 缓存失效）
      if (expected?.fileKey && figmaRaw.fileKey && figmaRaw.fileKey !== expected.fileKey) {
        return { hit: false, source: 'none', staleReason: `fileKey 不匹配（缓存 ${figmaRaw.fileKey} ≠ 期望 ${expected.fileKey}）` };
      }
      if (expected?.nodeId && figmaRaw.nodeId && figmaRaw.nodeId !== expected.nodeId) {
        return { hit: false, source: 'none', staleReason: `nodeId 不匹配（缓存 ${figmaRaw.nodeId} ≠ 期望 ${expected.nodeId}）` };
      }

      // 🆕 视觉分析结果新鲜度校验：preview-analysis.json 的 generatedAt 超过 24h → stale
      if (existsSync(previewPath)) {
        try {
          const previewRaw = JSON.parse(readFileSync(previewPath, 'utf-8'));
          const ls = previewRaw?.layoutStructure || previewRaw || {};
          const generatedAt = ls.generatedAt;
          if (generatedAt) {
            const genTime = new Date(generatedAt).getTime();
            if (!isNaN(genTime) && Date.now() - genTime > MAX_CACHE_AGE_MS) {
              return {
                hit: false,
                source: 'none',
                staleReason: `视觉分析结果过期（generatedAt ${generatedAt} 超过 24h）`,
              };
            }
          }
        } catch {
          // 解析失败不阻断（后续仍会尝试加载）
        }
      }

      const previewAnalysis = existsSync(previewPath)
        ? JSON.parse(readFileSync(previewPath, 'utf-8'))
        : null;

      // 附加资源（资产映射若存在一并返回）
      const domMappingPath = join(componentDir, '.mc-gen', 'resource-dom-mapping.json');
      const resourceDomMapping = existsSync(domMappingPath)
        ? JSON.parse(readFileSync(domMappingPath, 'utf-8'))
        : null;

      this.logger.log(
        `🗃️ UI 缓存命中: ${componentDir.split('/').pop()}（figma ✓${previewAnalysis ? ' preview ✓' : ' preview ✗'}${resourceDomMapping ? ' mapping ✓' : ''}）`,
      );

      return {
        hit: true,
        figmaNodeData,
        previewAnalysis,
        resourceDomMapping,
        source: 'cache',
      };
    } catch (e) {
      this.logger.warn(`🗃️ UI 缓存读取失败: ${e.message}`);
      return { hit: false, source: 'none', staleReason: `缓存损坏: ${e.message}` };
    }
  }

  /** 写入缓存（生成完成后回写，供下次命中） */
  save(componentDir: string, input: UiCacheSaveInput): void {
    try {
      const cacheDir = join(componentDir, '.mc-gen', 'cache');
      const configDir = join(componentDir, '.mc-gen', 'config');
      mkdirSync(cacheDir, { recursive: true });
      mkdirSync(configDir, { recursive: true });

      // 保持与 mc-gen 工具链一致的包装结构
      writeFileSync(
        join(cacheDir, 'figma-node-data.json'),
        JSON.stringify(
          {
            fileKey: input.fileKey || null,
            nodeId: input.nodeId || null,
            cachedAt: new Date().toISOString(),
            document: input.figmaNodeData,
          },
          null,
          2,
        ),
        'utf-8',
      );

      if (input.previewAnalysis) {
        writeFileSync(
          join(configDir, 'preview-analysis.json'),
          JSON.stringify(input.previewAnalysis, null, 2),
          'utf-8',
        );
      }

      if (input.resourceDomMapping) {
        writeFileSync(
          join(componentDir, '.mc-gen', 'resource-dom-mapping.json'),
          JSON.stringify(input.resourceDomMapping, null, 2),
          'utf-8',
        );
      }

      this.logger.log(`🗃️ UI 缓存已写入: ${componentDir.split('/').pop()}`);
    } catch (e) {
      this.logger.warn(`🗃️ UI 缓存写入失败（非阻塞）: ${e.message}`);
    }
  }
}
