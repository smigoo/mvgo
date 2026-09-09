import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { pathToFileURL } from 'url';
import { existsSync, mkdirSync, statSync } from 'fs';
import { configDir } from '../config/backend-root';
import { TOOL_TEMPLATES } from './templates/tool-templates.js';
import { LLM_TEMPLATES } from './templates/llm-templates.js';

// 动态生成角色目录：
// - customRolesDir（运行时）= dist/ai-engine/roles/custom——模板 import 路径基于此位置（../../agents/base-agent.js）
// - persistRolesDir（持久备份）= config/dynamic-roles——nest build 会清空 dist，备份用于自愈恢复
const customRolesDir = join(__dirname, '..', 'ai-engine', 'roles', 'custom');
const persistRolesDir = join(configDir, 'dynamic-roles');
const agentsDir = join(configDir, 'agents');
// 上传参考资源目录（文档/图片/schema），供 llm 节点注入 Prompt 参考
const resourcesDir = join(configDir, 'agent-resources');

const NAME_RE = /^[a-z][a-z0-9-]{2,31}$/;
// 允许上传的资源类型（文档/规范/图片/代码片段）
const ALLOWED_EXT = new Set([
  'md', 'txt', 'json', 'yaml', 'yml', 'csv', 'less', 'vue', 'js', 'ts',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** busboy 对 multipart filename 默认 latin1 解码，中文文件名会乱码 → latin1→utf8 修复 */
function fixLatin1ToUtf8(s: string): string {
  try {
    if (/[\u0080-\u00ff]/.test(s)) {
      const fixed = Buffer.from(s, 'latin1').toString('utf8');
      if (!fixed.includes('\uFFFD')) return fixed;
    }
  } catch { /* keep original */ }
  return s;
}

export interface AgentReferenceFile {
  name: string;
  url: string;    // 绝对路径（生成代码 fs.readFileSync 用）
  type: string;   // 扩展名
  size: number;
}

export interface AgentCreateDto {
  name: string;          // 标识（kebab-case，唯一）
  label: string;         // 显示名称
  description?: string;
  category?: string;
  logicType: 'tool' | 'llm';
  templateId: string;    // TOOL_TEMPLATES / LLM_TEMPLATES 的 id
  inputs?: Array<{ key: string; type: string; required?: boolean }>;
  outputs?: Array<{ key: string; type: string }>;
  params?: Record<string, any>;
  model?: string;        // llm 类：模型
  referenceFiles?: AgentReferenceFile[]; // 上传的参考资源（llm 节点注入 Prompt）
}

@Injectable()
export class AgentBuilderService {
  private readonly logger = new Logger(AgentBuilderService.name);

  constructor() {
    for (const dir of [agentsDir, customRolesDir, persistRolesDir, resourcesDir]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    // 自愈：build 清空或文件异常时，从 config/agents 定义重新渲染缺失的角色代码
    this.rebuildMissingRoles().catch(() => {});
  }

  /** 自愈：遍历动态定义，运行时代码文件缺失时用模板重新渲染（写运行时目录 + 持久备份） */
  private async rebuildMissingRoles() {
    try {
      const files = await fs.readdir(agentsDir);
      let rebuilt = 0;
      for (const f of files.filter((x) => x.endsWith('.json'))) {
        try {
          const def = JSON.parse(await fs.readFile(join(agentsDir, f), 'utf-8'));
          if (!def?.name || !def?.templateId) continue;
          const target = join(customRolesDir, `${def.name}.js`);
          if (!existsSync(target)) {
            const code = this.renderCode(def);
            await fs.writeFile(target, code, 'utf-8');
            await fs.writeFile(join(persistRolesDir, `${def.name}.js`), code, 'utf-8');
            rebuilt++;
          }
        } catch { /* skip broken def */ }
      }
      if (rebuilt > 0) {
        this.logger.log(`♻️ 自愈重建 ${rebuilt} 个动态角色代码（定义存在但代码缺失）`);
      }
    } catch { /* ignore */ }
  }

  /** 上传参考资源：校验类型/大小 → 落盘 config/agent-resources/ → 返回文件元信息 */
  async uploadResource(file: any): Promise<{ success: boolean; data?: AgentReferenceFile; error?: string }> {
    if (!file || !file.originalname || !file.buffer) {
      return { success: false, error: '未收到文件（字段名应为 file）' };
    }
    const rawName = fixLatin1ToUtf8(String(file.originalname || 'file'));
    const ext = rawName.includes('.') ? rawName.split('.').pop()!.toLowerCase() : '';
    if (!ALLOWED_EXT.has(ext)) {
      return { success: false, error: `不支持的文件类型 .${ext || '(无扩展名)'}，允许: ${[...ALLOWED_EXT].join(' / ')}` };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: `文件超过 10MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）` };
    }
    // 文件名安全化：去路径分隔符/控制字符/双点，保留原扩展名
    const base = rawName
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:\*\?"<>|\x00-\x1f]/g, '_')
      .slice(0, 60) || 'resource';
    const safeName = `${base}.${ext}`;
    const target = join(resourcesDir, safeName);
    // 同名覆盖（同资源目录内），无需时间戳——用户可重新上传覆盖
    await fs.writeFile(target, file.buffer);
    this.logger.log(`📎 上传参考资源: ${safeName} (${file.size}B)`);
    return {
      success: true,
      data: {
        name: safeName,
        url: target,
        type: ext,
        size: file.size,
      },
    };
  }

  /** 校验定义，返回规范化后的 def */
  private validateDef(dto: AgentCreateDto) {
    if (!NAME_RE.test(dto.name)) {
      throw new BadRequestException(
        `标识不合法: "${dto.name}"，要求小写字母开头、a-z0-9-、3~32 位`,
      );
    }
    const templates = dto.logicType === 'llm' ? LLM_TEMPLATES : TOOL_TEMPLATES;
    const tpl = templates[dto.templateId];
    if (!tpl) {
      throw new BadRequestException(
        `未知模板: ${dto.templateId}，可用: ${Object.keys(templates).join(', ')}`,
      );
    }
    const inputs = (dto.inputs || [])
      .filter((i) => i && i.key)
      .map((i) => ({ key: String(i.key).trim().replace(/[^a-zA-Z0-9_]/g, '_'), type: i.type || 'string', required: !!i.required }))
      .filter((i) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(i.key));
    const outputs = (dto.outputs || [])
      .filter((o) => o && o.key)
      .map((o) => ({ key: String(o.key).trim().replace(/[^a-zA-Z0-9_]/g, '_'), type: o.type || 'any' }))
      .filter((o) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(o.key));
    return {
      name: dto.name,
      label: (dto.label || dto.name).slice(0, 40),
      description: (dto.description || '').slice(0, 200),
      category: (dto.category || '自定义').slice(0, 20),
      logicType: dto.logicType,
      templateId: dto.templateId,
      inputs,
      outputs,
      params: dto.params || {},
      model: dto.model || null,
      referenceFiles: (dto.referenceFiles || [])
        .filter((r) => r && r.name && r.url)
        .map((r) => ({
          name: String(r.name).slice(0, 100),
          url: String(r.url).slice(0, 600),
          type: String(r.type || '').slice(0, 10),
          size: Number(r.size) || 0,
        })),
    };
  }

  /** 渲染生成代码 */
  renderCode(def: any): string {
    const templates = def.logicType === 'llm' ? LLM_TEMPLATES : TOOL_TEMPLATES;
    const tpl = templates[def.templateId];
    return tpl.render(def);
  }

  /**
   * 创建智能体：渲染 → 写 roles/custom/{name}.js → 写 config/agents/{name}.json →
   * vm 语法校验 → 冒烟测试（实例化 + mock 空跑）→ 返回。
   */
  async create(dto: AgentCreateDto, userId?: string) {
    // 内置/已存在冲突检查
    if (await this.getDefinition(dto.name)) {
      throw new BadRequestException(`智能体 "${dto.name}" 已存在`);
    }
    const def = this.validateDef(dto);
    const code = this.renderCode(def);

    // 1. vm 语法校验
    const syntaxOk = await this.validateSyntax(code);
    if (!syntaxOk.ok) {
      throw new BadRequestException(`生成代码语法校验失败: ${syntaxOk.error}`);
    }

    // 2. 写文件（运行时目录 + 持久备份目录，build 清空 dist 后自愈可恢复）
    const modulePath = `roles/custom/${def.name}.js`;
    await fs.writeFile(join(customRolesDir, `${def.name}.js`), code, 'utf-8');
    await fs.writeFile(join(persistRolesDir, `${def.name}.js`), code, 'utf-8');

    // 3. 写动态注册定义
    const vision =
      def.logicType === 'llm' &&
      (def.params?.vision === true ||
        def.inputs.some((i) => String(i.type || '').includes('image')));
    const record = {
      ...def,
      author: userId || 'anonymous',
      className: 'DynamicAgent',
      modulePath,
      requires: { vision },
      createdAt: Date.now(),
    };
    await fs.writeFile(
      join(agentsDir, `${def.name}.json`),
      JSON.stringify(record, null, 2),
      'utf-8',
    );

    // 4. 冒烟测试（实例化 + mock 空跑，不真正调 LLM）
    const smoke = await this.smokeTest(def);
    if (!smoke.ok) {
      this.logger.warn(`冒烟测试失败（保留创建，警告）: ${smoke.error}`);
    }

    this.logger.log(`✅ Agent Builder 创建智能体: ${def.name} (${def.logicType}/${def.templateId})`);
    return {
      success: true,
      data: {
        name: def.name,
        label: def.label,
        logicType: def.logicType,
        modulePath,
        smoke: smoke.ok ? 'passed' : 'warning',
        smokeDetail: smoke,
      },
    };
  }

  /** 列出全部动态智能体 */
  async list(): Promise<any[]> {
    try {
      const files = await fs.readdir(agentsDir);
      const out: any[] = [];
      for (const f of files.filter((x) => x.endsWith('.json'))) {
        try {
          const rec = JSON.parse(await fs.readFile(join(agentsDir, f), 'utf-8'));
          out.push({
            name: rec.name,
            label: rec.label,
            description: rec.description,
            category: rec.category,
            logicType: rec.logicType,
            templateId: rec.templateId,
            author: rec.author,
            createdAt: rec.createdAt,
          });
        } catch (e) { /* skip */ }
      }
      return out;
    } catch {
      return [];
    }
  }

  /** 读取单个定义 */
  async getDefinition(name: string) {
    try {
      const raw = await fs.readFile(join(agentsDir, `${name}.json`), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** 删除（仅动态） */
  async remove(name: string, userId?: string) {
    const def = await this.getDefinition(name);
    if (!def) throw new NotFoundException(`动态智能体不存在: ${name}`);
    if (def.author && def.author !== 'anonymous' && userId && def.author !== userId) {
      throw new BadRequestException('只能删除自己创建的智能体');
    }
    await fs.unlink(join(agentsDir, `${name}.json`)).catch(() => {});
    await fs.unlink(join(customRolesDir, `${name}.js`)).catch(() => {});
    await fs.unlink(join(persistRolesDir, `${name}.js`)).catch(() => {});
    return { success: true };
  }

  /** 语法校验（acorn 纯解析，无 --experimental-vm-modules 依赖；ESM 语法 sourceType:'module'） */
  private async validateSyntax(code: string) {
    try {
      const acornMod: any = await import('acorn');
      const acorn = acornMod.default || acornMod;
      acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  /** 冒烟测试：实例化 + mock 输入空跑（工具节点直接跑 _run 验证逻辑） */
  async smokeTest(def: any): Promise<{ ok: boolean; error?: string; output?: any }> {
    try {
      if (def.logicType === 'llm') {
        // LLM 节点不真正调用（需要 key/额度），仅验证能构造
        const { DynamicAgent } = await this.importDynamic(def.name);
        return { ok: !!DynamicAgent, output: { note: 'llm 节点跳过真实调用' } };
      }
      const { DynamicAgent } = await this.importDynamic(def.name);
      const inst = new DynamicAgent({
        apiKey: 'smoke',
        baseURL: 'http://localhost:9/v1',
        providerType: 'openai-compatible',
        greeting: 'Smoke',
      });
      const mockInput = {};
      for (const i of def.inputs) {
        mockInput[i.key] = i.type === 'number' ? 42 : `smoke-${i.key}`;
      }
      const out = await inst.execute(mockInput);
      return { ok: true, output: out };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  /** 单节点试跑：实例化动态智能体 + 用户提供的 mock 输入执行（工具节点立即返回；LLM 节点依赖环境 Key） */
  async testAgent(name: string, input: Record<string, any> = {}): Promise<{ ok: boolean; data?: any; error?: string }> {
    const def = await this.getDefinition(name);
    if (!def) throw new NotFoundException(`动态智能体不存在: ${name}`);
    try {
      const { DynamicAgent } = await this.importDynamic(name);
      const inst = new DynamicAgent({
        model: def.model || undefined,
        // 工具节点 skipLLM 无碍；LLM 节点走 BaseAgent 环境回退（TEXT_API_KEY 等）
      });
      const out = await inst.execute({ ...(input || {}), onProgress: () => {} });
      return { ok: true, data: out };
    } catch (e: any) {
      const msg = String(e?.message || e);
      const friendly = /api[_-]?key|apiKey|credential/i.test(msg)
        ? 'AI 节点试跑需要配置模型 Key（当前环境未配置），请拖入画布在管线运行中调用'
        : msg;
      return { ok: false, error: friendly };
    }
  }

  /** 能力缺口反馈：追加到 config/agent-feedback/feedback-YYYY-MM.json（按月聚合，供评估加模板） */
  async submitFeedback(body: any, userId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const need = String(body?.need || '').trim();
    if (!need) return { success: false, error: '请描述你需要的能力' };
    const feedbackDir = join(configDir, 'agent-feedback');
    if (!existsSync(feedbackDir)) mkdirSync(feedbackDir, { recursive: true });
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const filePath = join(feedbackDir, `feedback-${monthKey}.json`);
    let list: any[] = [];
    try {
      list = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      if (!Array.isArray(list)) list = [];
    } catch { /* first entry */ }
    list.push({
      need,
      query: String(body?.query || '').slice(0, 100),
      author: userId || 'anonymous',
      ts: Date.now(),
    });
    await fs.writeFile(filePath, JSON.stringify(list, null, 2), 'utf-8');
    this.logger.log(`💡 能力缺口反馈 #${list.length}: ${need.slice(0, 60)}`);
    return { success: true, data: { total: list.length } };
  }

  /** 动态 import 生成的角色（带 mtime 时间戳打破 ESM 缓存，编辑/重建即热加载） */
  async importDynamic(name: string): Promise<any> {
    const filePath = join(customRolesDir, `${name}.js`);
    let ts = 0;
    try {
      ts = statSync(filePath).mtimeMs;
    } catch { /* file missing */ }
    const url = `${pathToFileURL(filePath).href}?t=${Math.round(ts)}`;
    const mod = await import(url);
    return mod;
  }
}
