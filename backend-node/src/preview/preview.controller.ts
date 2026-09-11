import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { join, resolve, sep } from 'path';
import { existsSync } from 'fs';
import { resolveComponentDirStrict } from '../ai-engine/utils/component-resolver.js';
import { readdir, stat } from 'fs/promises';
import {
  workspaceRoot,
  customComponentsDir,
  vue3ComponentsDir,
  resolveFrontendWorkspacePath,
  tempComponentsDir,
} from '../config/backend-root';

/**
 * 查找组件的候选根目录集合。
 * 🆕 S5（2026-09-10）：`customComponentsDir` 已统一为 backend-node/workspace/custom-components，
 * 与发布器写入路径（workspaceRoot）、解析搜索根（componentSearchRoots）完全一致 —— 读写不再分叉。
 * 前端 workspace 保留为镜像副本（dev/生产前端要读它）。
 */
function collectComponentRoots(): string[] {
  const roots: string[] = [
    customComponentsDir, // = backend-node/workspace/custom-components（发布器写入路径）
    join(resolveFrontendWorkspacePath(), 'custom-components'),
  ];
  return [...new Set(roots)];
}

/**
 * 查找页面骨架的候选根目录集合。
 * 与组件类似，优先 backend-node/workspace，再兼容前端 workspace。
 */
function collectPageRoots(): string[] {
  const roots: string[] = [
    join(workspaceRoot, 'vue3-pages'),
    join(resolveFrontendWorkspacePath(), 'vue3-pages'),
  ];
  return [...new Set(roots)];
}

@Controller('preview')
export class PreviewController {
  // ── 页面骨架预览：放在组件通配路由之前，避免 `:groupId` 把 `page` 段吞掉 ──
  @Get('page/:groupId/:pageId/*path')
  async servePageFile(
    @Param('groupId') groupId: string,
    @Param('pageId') pageId: string,
    @Param('path') filePath: string,
    @Query('exists') exists: string,
    @Res() res: Response,
  ) {
    if (filePath) {
      filePath = filePath.replace(/,/g, '/');
    }

    const pageRoots = collectPageRoots();
    let pageDir: string | null = null;
    for (const root of pageRoots) {
      const candidate = join(root, groupId, pageId);
      if (existsSync(candidate)) {
        pageDir = candidate;
        break;
      }
    }

    if (!pageDir || !existsSync(pageDir)) {
      throw new NotFoundException('页面不存在');
    }

    const resolvedPageDir = resolve(pageDir);
    const fullPath = resolve(resolvedPageDir, filePath || 'index.vue');
    if (
      fullPath !== resolvedPageDir &&
      !fullPath.startsWith(`${resolvedPageDir}${sep}`)
    ) {
      throw new ForbiddenException('非法的文件路径');
    }

    const isExistsCheck = exists === '1';
    const fileExists = existsSync(fullPath);
    if (isExistsCheck) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ exists: fileExists });
    }

    if (!fileExists) {
      throw new NotFoundException('文件不存在');
    }

    setPreviewCsp(res);
    res.sendFile(fullPath);
  }

  // 预览组件文件（免登录，只读静态资源）
  @Get(':groupId/:componentId/*path')
  async serveComponentFile(
    @Param('groupId') groupId: string,
    @Param('componentId') componentId: string,
    @Param('path') filePath: string,
    @Query('exists') exists: string,
    @Res() res: Response,
  ) {
    // 预览为只读静态资源，且组件 id 带随机后缀不可猜，允许匿名访问（免登录预览）
    // NestJS通配符参数会将路径段用逗号连接，需要转换回斜杠
    // 例如：'resources,images,mc-preview.png' -> 'resources/images/mc-preview.png'
    if (filePath) {
      filePath = filePath.replace(/,/g, '/');
    }

    // 统一目录：DEV 和 PROD 模式均从 custom-components 读取
    // 目录结构：workspace/custom-components/{componentId}/
    // groupId 保留在路由参数中用于向前兼容，但不影响文件路径
    // 发布器可能写入 backend-node/workspace 或前端 workspace，需遍历所有候选根
    const basePaths = collectComponentRoots();

    // 🎯 优先走统一严格解析：与 AI 修复写入 / 规范检查 / 下载打包同一事实源。
    // 背景：collectComponentRoots() 的第一个根是 backend-node/workspace（历史副本），
    // 而组件解析（写入/打包）用的是 /mvgo/workspace 与 /mvgo/frontend/workspace，
    // 两者不是同一份 → AI 修复改了 B 副本、预览读 A 副本，表现为「改了预览不变」。
    // 这里先按统一解析取目录，只有该文件在解析结果里不存在时才回退旧的遍历。
    let componentDir: string | null = null;
    const strictDir = await resolveComponentDirStrict(componentId);
    if (strictDir && existsSync(join(strictDir, filePath || ''))) {
      componentDir = strictDir;
    }

    if (!componentDir) {
      for (const basePath of basePaths) {
        try {
          const dirs = await readdir(basePath);
          // 优先精确匹配，然后匹配前缀
          const matchedDir =
            dirs.find((dir) => dir === componentId) ||
            dirs.find((dir) => dir.startsWith(`${componentId}-`));
          if (matchedDir) {
            componentDir = join(basePath, matchedDir);
            break;
          }
        } catch (error) {
          // 该 custom-components 目录不存在，继续尝试下一个候选
        }
      }
    }

    // 如果 custom-components 中未找到，先在路由指定的 groupId 下查找 Vue3 组件；
    // 找不到则兜底扫描该根下所有群组目录（与微码 custom-components 的跨根兜底对齐），
    // 避免前端漏传 / 错传 groupId 时整组件 404 空白。
    if (!componentDir) {
      // 🆕 S5：vue3ComponentsDir 已统一为 backend-node/workspace/vue3-components（= 发布器写入路径）
      const vue3Roots = [
        vue3ComponentsDir,
        join(resolveFrontendWorkspacePath(), 'vue3-components'),
      ];
      for (const root of [...new Set(vue3Roots)]) {
        // 第一步：优先指定 groupId（精确匹配）
        const groupPath = join(root, groupId);
        try {
          const compDirs = await readdir(groupPath);
          const matchedDir =
            compDirs.find((dir) => dir === componentId) ||
            compDirs.find((dir) => dir.startsWith(`${componentId}-`));
          if (matchedDir) {
            componentDir = join(groupPath, matchedDir);
            break;
          }
        } catch {
          // 指定群组下不存在该组件，继续兜底
        }
        // 第二步：兜底扫描该根下所有群组目录（groupId 可能缺失 / 错传）
        if (!componentDir) {
          try {
            const groupDirs = await readdir(root);
          for (const g of groupDirs) {
            if (g === groupId) continue; // 已查过
            const candidate = join(root, g);
            let st;
            try {
              st = await stat(candidate);
            } catch {
              continue;
            }
            if (!st.isDirectory()) continue;
            const compDirs = await readdir(candidate);
            const matchedDir =
              compDirs.find((dir) => dir === componentId) ||
              compDirs.find((dir) => dir.startsWith(`${componentId}-`));
            if (matchedDir) {
              componentDir = join(candidate, matchedDir);
              break;
            }
          }
          if (componentDir) break;
          } catch {
            // 该根无法列举群组，跳过
          }
        }
      }
    }

    // 🆕 治本（2026-09-10）：公共池组件若从未被 publishQualityPreview 提升到 custom-components
    // （publishComponent 仅翻 DB 标志、不复制文件；或生成期发布根与预览根不一致），
    // 其产物仍驻留在 temp-components/{groupId}/{componentId}。预览为只读静态资源、
    // 组件 id 带随机后缀不可猜，允许匿名兜底读取，避免公共池组件 404 空白。
    if (!componentDir) {
      for (const root of [tempComponentsDir]) {
        // 第一步：路由指定的 groupId 下精确查找
        const groupPath = join(root, groupId);
        try {
          const compDirs = await readdir(groupPath);
          const matchedDir =
            compDirs.find((dir) => dir === componentId) ||
            compDirs.find((dir) => dir.startsWith(`${componentId}-`));
          if (matchedDir) {
            componentDir = join(groupPath, matchedDir);
            break;
          }
        } catch {
          // 指定群组下不存在，继续兜底
        }
        // 第二步：兜底扫描 temp-components 下所有群组目录（groupId 缺失/错传）
        try {
          const groupDirs = await readdir(root);
          for (const g of groupDirs) {
            if (g === groupId) continue;
            const candidate = join(root, g);
            let st;
            try {
              st = await stat(candidate);
            } catch {
              continue;
            }
            if (!st.isDirectory()) continue;
            const compDirs = await readdir(candidate);
            const matchedDir =
              compDirs.find((dir) => dir === componentId) ||
              compDirs.find((dir) => dir.startsWith(`${componentId}-`));
            if (matchedDir) {
              componentDir = join(candidate, matchedDir);
              break;
            }
          }
          if (componentDir) break;
        } catch {
          // temp-components 根无法列举，跳过
        }
      }
    }

    if (!componentDir || !existsSync(componentDir)) {
      throw new NotFoundException('组件不存在');
    }

    // 构造完整文件路径，并使用 path segment 边界防止前缀目录绕过。
    const resolvedComponentDir = resolve(componentDir);
    const fullPath = resolve(resolvedComponentDir, filePath || 'index.html');
    if (
      fullPath !== resolvedComponentDir &&
      !fullPath.startsWith(`${resolvedComponentDir}${sep}`)
    ) {
      throw new ForbiddenException('非法的文件路径');
    }

    // 探测模式：返回 200 + JSON，避免在浏览器控制台留下 404 噪音
    const isExistsCheck = exists === '1';
    const fileExists = existsSync(fullPath);
    if (isExistsCheck) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ exists: fileExists });
    }

    // 检查文件是否存在
    if (!fileExists) {
      throw new NotFoundException('文件不存在');
    }

    // 设置 CSP 响应头，限制预览 iframe 可加载的资源来源
    // Phase 2 安全增强：防止 XSS 注入攻击
    setPreviewCsp(res);

    // 返回文件
    res.sendFile(fullPath);
  }

}

function setPreviewCsp(res: Response) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // 允许 'unsafe-eval' 支持 vue3-sfc-loader 运行时编译
      // 允许 blob: 支持动态创建的 worker script
      "script-src 'self' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'self'", // 只允许同源页面嵌套此 iframe
      "base-uri 'self'",
      "form-action 'none'", // 禁止表单提交
    ].join('; '),
  );
}
