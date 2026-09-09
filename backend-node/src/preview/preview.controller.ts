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
import { readdir, stat } from 'fs/promises';
import {
  backendRoot,
  customComponentsDir,
  vue3ComponentsDir,
  resolveFrontendWorkspacePath,
} from '../config/backend-root';

/**
 * 查找组件的候选根目录集合。
 * 发布器 (workspace-preview-publisher) 将产物写入 backend-node/workspace 与前端 workspace，
 * 而旧部署将产物写入 projectRoot/workspace，因此需要兼容多处查找。
 */
function collectComponentRoots(): string[] {
  const roots: string[] = [
    // 发布器主路径：backend-node/workspace
    join(backendRoot, 'workspace', 'custom-components'),
    // 旧路径：projectRoot/workspace
    customComponentsDir,
    // 前端 workspace（发布器同步目标之一）
    join(resolveFrontendWorkspacePath(), 'custom-components'),
  ];
  return [...new Set(roots)];
}

/**
 * 查找页面骨架的候选根目录集合。
 * 与组件类似，优先 backend-node/workspace，再兼容前端 workspace 与旧路径。
 */
function collectPageRoots(): string[] {
  const roots: string[] = [
    join(backendRoot, 'workspace', 'vue3-pages'),
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

    // 查找匹配的组件目录（因为目录名可能是 componentId 或 componentId-componentName 格式）
    let componentDir: string | null = null;
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

    // 如果 custom-components 中未找到，先在路由指定的 groupId 下查找 Vue3 组件；
    // 找不到则兜底扫描该根下所有群组目录（与微码 custom-components 的跨根兜底对齐），
    // 避免前端漏传 / 错传 groupId 时整组件 404 空白。
    if (!componentDir) {
      // 同样遍历多个候选根：发布器主路径 backend-node/workspace、旧路径 projectRoot/workspace、前端 workspace
      const vue3Roots = [
        join(backendRoot, 'workspace', 'vue3-components'),
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
