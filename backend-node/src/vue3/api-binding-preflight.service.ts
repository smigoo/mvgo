import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { extname, join, relative, sep } from 'path';
import ts from 'typescript';

const ALLOWED_BARE_MODULES = new Set(['vue', 'echarts', 'microvideo-request']);

@Injectable()
export class ApiBindingPreflightService {
  validate(componentDir: string): void {
    const entryPath = this.resolveEntryPath(componentDir);
    if (!entryPath) {
      throw new BadRequestException({
        code: 'API_BINDING_PREFLIGHT_FAILED',
        message: 'API 绑定发布前检查失败',
        errors: [`${componentDir}: 缺少 package/index.vue 或 index.vue`],
      });
    }
    const sfc = readFileSync(entryPath, 'utf-8');
    const errors: string[] = [];

    this.validateSfc(componentDir, entryPath, sfc, errors);

    const apiDir = this.resolveApiDir(entryPath);
    if (existsSync(apiDir)) {
      this.walk(apiDir, (filePath) => {
        if (!['.js', '.mjs'].includes(extname(filePath))) return;
        const source = readFileSync(filePath, 'utf-8');
        this.validateModule(componentDir, filePath, source, errors);
      });
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        code: 'API_BINDING_PREFLIGHT_FAILED',
        message: 'API 绑定发布前检查失败',
        errors,
      });
    }
  }

  private resolveEntryPath(componentDir: string): string | null {
    const candidates = [join(componentDir, 'package', 'index.vue'), join(componentDir, 'index.vue')];
    return candidates.find((candidate) => existsSync(candidate)) || null;
  }

  private resolveApiDir(entryPath: string): string {
    return join(entryPath, '..', 'api');
  }

  private validateSfc(
    componentDir: string,
    entryPath: string,
    sfc: string,
    errors: string[],
  ): void {
    const hasTemplate = /<template(?:\s|>)[\s\S]*<\/template>/i.test(sfc);
    const scriptMatch = sfc.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/i);

    if (!hasTemplate) errors.push(`${entryPath}: 缺少完整的 <template>`);
    if (!scriptMatch) {
      errors.push(`${entryPath}: 缺少 <script setup>`);
      return;
    }

    const parseResult = ts.transpileModule(scriptMatch[1], {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        allowJs: true,
      },
      fileName: entryPath,
      reportDiagnostics: true,
    });
    for (const diagnostic of parseResult.diagnostics || []) {
      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        errors.push(`${entryPath}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
      }
    }

    this.validateImports(entryPath, scriptMatch[1], errors, componentDir);
  }

  private validateModule(
    componentDir: string,
    filePath: string,
    source: string,
    errors: string[],
  ): void {
    const parseResult = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        allowJs: true,
      },
      fileName: filePath,
      reportDiagnostics: true,
    });
    for (const diagnostic of parseResult.diagnostics || []) {
      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        errors.push(`${filePath}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
      }
    }
    this.validateImports(filePath, source, errors, componentDir);
  }

  private validateImports(
    filePath: string,
    source: string,
    errors: string[],
    componentDir?: string,
  ): void {
    const importPattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(source)) !== null) {
      const specifier = match[1];
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        if (!ALLOWED_BARE_MODULES.has(specifier)) {
          errors.push(`${filePath}: 不允许导入裸模块 "${specifier}"`);
        }
        continue;
      }
      if (specifier.startsWith('/')) {
        errors.push(`${filePath}: 不允许使用绝对导入 "${specifier}"`);
        continue;
      }
      const resolved = join(filePath, '..', specifier.split('?')[0].split('#')[0]);
      if (componentDir) {
        const rel = relative(componentDir, resolved);
        if (rel === '..' || rel.startsWith(`..${sep}`)) {
          errors.push(`${filePath}: 相对导入越过组件目录 "${specifier}"`);
        }
      }
      if (!this.moduleExists(resolved)) {
        errors.push(`${filePath}: 导入文件不存在 "${specifier}"`);
      }
    }
  }

  private moduleExists(basePath: string): boolean {
    return [basePath, `${basePath}.mjs`, `${basePath}.js`, `${basePath}.json`]
      .some((candidate) => {
        try {
          return statSync(candidate).isFile();
        } catch {
          return false;
        }
      });
  }

  private walk(dir: string, visit: (filePath: string) => void): void {
    for (const name of readdirSync(dir)) {
      const filePath = join(dir, name);
      const stat = statSync(filePath);
      if (stat.isDirectory()) this.walk(filePath, visit);
      else visit(filePath);
    }
  }
}

export { ALLOWED_BARE_MODULES };
