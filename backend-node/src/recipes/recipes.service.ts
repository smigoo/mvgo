import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { configDir } from '../config/backend-root';
import { BUILTIN_RECIPES } from './builtin-recipes';

const recipesDir = join(configDir, 'recipes');
const NAME_RE = /^[a-z][a-z0-9-]{2,31}$/;

export interface RecipeSaveDto {
  name: string;
  label: string;
  description?: string;
  scenario?: string;
  workflow: {
    entryNode: string;
    nodes: any[];
    edges: any[];
  };
}

@Injectable()
export class RecipesService {
  private readonly logger = new Logger(RecipesService.name);

  constructor() {
    if (!existsSync(recipesDir)) mkdirSync(recipesDir, { recursive: true });
  }

  /** 配方列表：内置 + 用户/派生（config/recipes/*.json） */
  async list(): Promise<any[]> {
    const out = BUILTIN_RECIPES.map((r) => this.pick(r));
    try {
      const files = await fs.readdir(recipesDir);
      for (const f of files.filter((x) => x.endsWith('.json'))) {
        try {
          const rec = JSON.parse(await fs.readFile(join(recipesDir, f), 'utf-8'));
          if (rec?.name) out.push(this.pick(rec));
        } catch { /* skip */ }
      }
    } catch { /* dir missing */ }
    return out;
  }

  /** 列表精简视图（不含完整拓扑，减少传输） */
  private pick(r: any) {
    return {
      name: r.name,
      label: r.label,
      description: r.description || '',
      scenario: r.scenario || '通用',
      source: r.source || 'user',
      author: r.author,
      version: r.version || 1,
      nodeCount: r.workflow?.nodes?.length || 0,
    };
  }

  /** 配方详情（含完整拓扑） */
  async get(name: string): Promise<any> {
    const builtin = BUILTIN_RECIPES.find((r) => r.name === name);
    if (builtin) return builtin;
    try {
      const rec = JSON.parse(
        await fs.readFile(join(recipesDir, `${name}.json`), 'utf-8'),
      );
      if (rec?.name) return rec;
    } catch { /* fallthrough */ }
    throw new NotFoundException(`配方不存在: ${name}`);
  }

  /** 另存为模板：从当前管线拓扑保存为用户配方 */
  async saveRecipe(dto: RecipeSaveDto, userId?: string) {
    if (!NAME_RE.test(dto.name)) {
      throw new BadRequestException(
        `配方标识不合法: "${dto.name}"，要求小写字母开头、a-z0-9-、3~32 位`,
      );
    }
    if (BUILTIN_RECIPES.some((r) => r.name === dto.name)) {
      throw new BadRequestException(`配方 "${dto.name}" 为内置配方，不可覆盖，请换一个标识`);
    }
    if (!dto.workflow?.nodes?.length) {
      throw new BadRequestException('配方需要包含节点拓扑');
    }
    const record = {
      name: dto.name,
      label: (dto.label || dto.name).slice(0, 40),
      description: (dto.description || '').slice(0, 200),
      scenario: (dto.scenario || '通用').slice(0, 20),
      source: 'user',
      author: userId || 'anonymous',
      workflow: dto.workflow,
      version: 1,
      createdAt: Date.now(),
    };
    await fs.writeFile(
      join(recipesDir, `${dto.name}.json`),
      JSON.stringify(record, null, 2),
      'utf-8',
    );
    this.logger.log(`📦 配方另存为模板: ${dto.name} (${record.workflow.nodes.length} 节点)`);
    return { success: true, data: this.pick(record) };
  }

  /** 删除配方（仅用户配方） */
  async remove(name: string, userId?: string) {
    if (BUILTIN_RECIPES.some((r) => r.name === name)) {
      throw new BadRequestException('内置配方不可删除');
    }
    try {
      const rec = JSON.parse(
        await fs.readFile(join(recipesDir, `${name}.json`), 'utf-8'),
      );
      if (rec.author && rec.author !== 'anonymous' && userId && rec.author !== userId) {
        throw new BadRequestException('只能删除自己保存的配方');
      }
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new NotFoundException(`配方不存在: ${name}`);
    }
    await fs.unlink(join(recipesDir, `${name}.json`)).catch(() => {});
    return { success: true };
  }
}
