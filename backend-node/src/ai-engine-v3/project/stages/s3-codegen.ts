/* ============================================================================
 * s3-codegen.ts — S3 代码生成（路线图 S3/S4 级 · MVP）
 * ----------------------------------------------------------------------------
 * 输入：S2 冻结产出的 OpenAPI 契约（spec/openapi.local.yaml，由 service 用 js-yaml 解析后传入）
 * 输出：确定性、零 LLM 的「前后端骨架」文件集合 + manifest。
 *
 * 本阶段定位（MVP）：
 *   · 后端骨架：NestJS @Controller + 各方法装饰器 + 信封占位返回 + 命名数据载荷类型占位。
 *   · 前端客户端库：按 tag 分组的 api 函数，复用宿主项目的 @/core/http。
 *   · 就绪态类型化：S2 已为每个端点确立命名数据载荷类型（response.data 的命名 any 占位，
 *     写入 components/schemas/* 与 operation 的 x-mvgo-response-data），路径参数从路径模板
 *     抽取并类型化（in:path / required / string 占位）。字段级 properties 仍占位，
 *     待 S0 抽取字段级 schema 后由 S2 回填，S3 同一套生成器自动升级为强类型，无需改形状。
 *
 * 🔴 与 S2 一致的真值边界：
 *   · verb=ANY 在 OAS 里按 GET 占位并标 x-mvgo-verb-inferred:true ——
 *     生成的骨架方法也按 GET 生成，并打 ⚠️ 注释，不构成方法结论。
 *   · confidence=candidate 的端点未经交叉验证，生成时打 ⚠️ 注释。
 *   · 不在声明前缀内的端点（outsideDeclaredPrefix）单独计数并注释。
 *
 * 本模块是纯函数（不碰文件系统），由 service.generate() 负责写盘，便于单测。
 * ==========================================================================*/

export interface GenFile {
  rel: string;
  content: string;
}

export interface CodeGenOptions {
  runId: string;
  projectRoot?: string;
  generatedAt: string;
}

export interface CodeGenSummary {
  endpointTotal: number;
  backendControllers: number;
  frontendApis: number;
  tags: string[];
  byConfidence: Record<string, number>;
  verbDefaultedCount: number;
  outsidePrefixCount: number;
}

export interface CodeGenResult {
  files: GenFile[];
  summary: CodeGenSummary;
  notes: string[];
}

/* ─── 最小 OpenAPI 类型（只取本阶段用到的字段） ──────────────────────────── */
interface OasParam {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: { type?: string };
}
interface OasOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: OasParam[];
  'x-mvgo-response-data'?: string;
  'x-mvgo-confidence'?: string;
  'x-mvgo-sources'?: string[];
  'x-mvgo-verb-declared'?: string;
  'x-mvgo-verb-inferred'?: boolean;
  'x-mvgo-flags'?: string[];
}
interface OasPathItem {
  get?: OasOperation;
  post?: OasOperation;
  put?: OasOperation;
  delete?: OasOperation;
  patch?: OasOperation;
  options?: OasOperation;
  head?: OasOperation;
}
export interface OasContract {
  openapi?: string;
  info?: { title?: string; version?: string };
  servers?: { url: string }[];
  tags?: { name: string; description?: string }[];
  paths?: Record<string, OasPathItem>;
  components?: { schemas?: Record<string, unknown> };
  'x-mvgo-freeze'?: Record<string, unknown>;
}

/* ─── 工具函数（与 apifox-generator 保持同义，但本地化以避免跨模块耦合） ──── */
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

const METHOD_DECORATOR: Record<HttpMethod, string> = {
  get: 'Get',
  post: 'Post',
  put: 'Put',
  delete: 'Delete',
  patch: 'Patch',
  options: 'Options',
  head: 'Head',
}
const METHOD_PREFIX: Record<HttpMethod, string> = {
  get: 'get',
  post: 'post',
  put: 'update',
  delete: 'remove',
  patch: 'patch',
  options: 'options',
  head: 'head',
}

function toCamelCase(s: string): string {
  return s
    .replace(/[-_ ](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toLowerCase())
}
function toPascalCase(s: string): string {
  const c = toCamelCase(s)
  return c.charAt(0).toUpperCase() + c.slice(1)
}
function methodPrefix(m: HttpMethod): string {
  return METHOD_PREFIX[m] || m
}
/** 从路径 + 方法生成方法名（兜底，仅当 operationId 缺失时）：用全部段拼装，避免同名碰撞 */
function pathToFnName(p: string, m: HttpMethod): string {
  const base = p
    .split('/')
    .filter(Boolean)
    .map(toPascalCase)
    .join('')
  const safe = base.replace(/[^a-zA-Z0-9]/g, '') || 'Index'
  const pascal = safe.charAt(0).toUpperCase() + safe.slice(1)
  return methodPrefix(m) + pascal
}
/**
 * 生成函数名（优先 operationId，保证全局唯一）。
 * operationId 形如 apiBridgeTrafficQuery_get —— 去掉末尾 _<verb> 后复用，
 * 再按方法加前缀（get/post/...）。缺失 operationId 时退回 pathToFnName。
 */
function fnName(op: OasOperation, p: string, m: HttpMethod): string {
  let base: string
  if (op.operationId) {
    base = op.operationId.replace(/_[a-zA-Z]+$/, '')
  } else {
    base = pathToFnName(p, m).slice(methodPrefix(m).length)
  }
  base = base.replace(/[^a-zA-Z0-9]/g, '')
  if (!base) base = 'Index'
  if (!/^[a-zA-Z]/.test(base)) base = 'Api' + base
  const pascal = base.charAt(0).toUpperCase() + base.slice(1)
  return methodPrefix(m) + pascal
}
/** 后端路由：去掉声明前缀（如 /api），并把 {id} 转成 :id */
function toBackendRoute(p: string, serverPrefix: string): string {
  let s = p.replace(/^\/+/, '')
  const sp = serverPrefix.replace(/^\/+/, '').replace(/\/+$/, '')
  if (sp && s.startsWith(sp + '/')) s = s.slice(sp.length + 1)
  return s.replace(/\{([^}]+)\}/g, ':$1')
}
/** 前端路径：保留完整路径（含 /api），{id} 转 :id；宿主 http 以 / 开头的 url 原样透传 */
function toFrontendPath(p: string): string {
  const s = p.startsWith('/') ? p : '/' + p
  return s.replace(/\{([^}]+)\}/g, ':$1')
}
function serverPrefixOf(contract: OasContract): string {
  return contract.servers?.[0]?.url || ''
}

/* ─── 主构建函数 ────────────────────────────────────────────────────────── */
export function buildCodeGen(contract: OasContract, opts: CodeGenOptions): CodeGenResult {
  const files: GenFile[] = []
  const notes: string[] = []
  const prefix = serverPrefixOf(contract)
  const paths = contract.paths || {}
  /** 命名数据载荷类型（response.data）占位集合，全局收集后在 dto/types 文件统一声明 */
  const dataRefs = new Set<string>()

  interface OpItem {
    path: string;
    method: HttpMethod;
    op: OasOperation;
  }
  const byTag: Record<string, OpItem[]> = {}
  const tagOrder: string[] = []
  const tagDesc: Record<string, string> = {}
  for (const t of contract.tags || []) tagDesc[t.name] = t.description || ''

  let endpointTotal = 0
  let verbDefaulted = 0
  let outsidePrefix = 0
  const byConfidence: Record<string, number> = {}

  for (const [p, item] of Object.entries(paths)) {
    if (!item) continue
    for (const m of HTTP_METHODS) {
      const op = item[m]
      if (!op) continue
      endpointTotal++
      const tag = (op.tags && op.tags[0]) || 'misc'
      if (!byTag[tag]) {
        byTag[tag] = []
        tagOrder.push(tag)
      }
      byTag[tag].push({ path: p, method: m, op })
      const conf = op['x-mvgo-confidence'] || 'unknown'
      byConfidence[conf] = (byConfidence[conf] || 0) + 1
      if (op['x-mvgo-verb-inferred']) verbDefaulted++
      const norm = prefix.replace(/^\/+/, '').replace(/\/+$/, '')
      if (norm && !p.replace(/^\/+/, '').startsWith(norm + '/')) outsidePrefix++
    }
  }

  /* ── 后端骨架 ── */
  const controllerFiles: GenFile[] = []
  const controllerClasses: string[] = []
  for (const tag of tagOrder) {
    const ops = byTag[tag]
    const cls = toPascalCase(tag) + 'Controller'
    controllerClasses.push(cls)
    const L: string[] = []
    const ctrlDataRefs = new Set<string>()
    L.push("import { Controller, Get, Post, Put, Delete, Patch, Param, Query, Body } from '@nestjs/common';")
    L.push('')
    L.push('/**')
    L.push(' * 自动生成骨架（S3 · 确定性、零 LLM）')
    L.push(` * 来源契约：${opts.runId} / spec/openapi.local.yaml`)
    L.push(` * 标签：${tag}${tagDesc[tag] ? ' — ' + tagDesc[tag] : ''}`)
    L.push(' *')
    L.push(' * ⚠️ 本文件为骨架：出入参类型由 S2 命名占位（response.data 为命名 any 占位），字段级类型需 S0 抽取后由 S2 回填。')
    L.push(' */')
    L.push('@Controller()')
    L.push(`export class ${cls} {`)
    for (const { path, method, op } of ops) {
      const route = toBackendRoute(path, prefix)
      const fn = fnName(op, path, method)
      const conf = op['x-mvgo-confidence'] || 'unknown'
      const sources = (op['x-mvgo-sources'] || []).join(', ')
      const pathParams = [...route.matchAll(/:(\w+)/g)].map((m) => m[1])
      const dataRef = op['x-mvgo-response-data']
      if (dataRef) {
        ctrlDataRefs.add(dataRef)
        dataRefs.add(dataRef)
      }
      L.push('')
      L.push('  /**')
      L.push(`   * ${String(op.summary || method.toUpperCase() + ' ' + path)}`)
      L.push(`   * 置信度：${conf}${sources ? '（来源：' + sources + '）' : ''}`)
      if (op['x-mvgo-verb-inferred'])
        L.push('   * ⚠️ 方法由 S2 按 GET 占位推断，来源未声明方法，需人裁决后修正。')
      if (conf === 'candidate')
        L.push('   * ⚠️ 候选端点，未经交叉验证，开工前需人裁决确认。')
      L.push('   */')
      const args: string[] = []
      const pathParamDefs = (op.parameters || []).filter((p) => p && p.in === 'path' && p.name)
      if (pathParamDefs.length) {
        for (const pp of pathParamDefs) {
          const tsType = pp.schema?.type === 'number' ? 'number' : 'string'
          args.push(`@Param('${pp.name}') ${pp.name}: ${tsType}`)
        }
      } else if (pathParams.length) {
        args.push('@Param() params: any')
      }
      if (method === 'get' || method === 'delete') args.push('@Query() query: any')
      else args.push('@Body() body: any')
      const sig = args.length ? `(${args.join(', ')})` : '()'
      const retType = dataRef ? `ApiResponse<${dataRef}>` : 'ApiResponse<any>'
      L.push(`  @${METHOD_DECORATOR[method]}('${route}')`)
      L.push(`  ${fn}${sig}: ${retType} {`)
      L.push('    // TODO: 实现业务逻辑。当前为 S3 骨架，返回信封占位。')
      L.push("    return { code: '0', message: 'ok', data: null };")
      L.push('  }')
    }
    L.push('}')
    L.push('')
    const importLine =
      "import { ApiResponse" +
      (ctrlDataRefs.size ? ', ' + [...ctrlDataRefs].join(', ') : '') +
      " } from '../dto/api-response';"
    L.unshift(importLine)
    const rel = `backend/src/controllers/${cls}.ts`
    controllerFiles.push({ rel, content: L.join('\n') })
  }

  const placeholderTypes =
    [...dataRefs]
      .sort()
      .map(
        (name) =>
          `export type ${name} = any; // 占位：response.data 命名类型，字段级 schema 待 S0 抽取后由 S2 回填`,
      )
      .join('\n') + (dataRefs.size ? '\n' : '')
  const apiResponseDto =
    "export interface ApiResponse<T = any> {\n" +
    '  /** 业务状态码，约定 "0" 表示成功 */\n' +
    '  code: string;\n' +
    '  /** 提示信息 */\n' +
    '  message: string;\n' +
    '  /** 业务数据；骨架阶段为 null，待实现填充 */\n' +
    '  data: T | null;\n' +
    '  /** 可选扩展字段（错误明细等） */\n' +
    '  detail?: any;\n' +
    '}\n' +
    placeholderTypes
  controllerFiles.push({ rel: 'backend/src/dto/api-response.ts', content: apiResponseDto })

  const moduleImports = controllerClasses
    .map((c) => `import { ${c} } from './controllers/${c}';`)
    .join('\n')
  const moduleContent =
    moduleImports +
    '\n\n' +
    '/**\n' +
    ' * 自动生成的应用模块（S3 骨架）。\n' +
    ' * 注册全部按 tag 生成的 controller；provider 按需补充。\n' +
    ' */\n' +
    '@Module({\n' +
    `  controllers: [${controllerClasses.join(', ')}],\n` +
    '  providers: [],\n' +
    '})\n' +
    'export class AppModule {}\n'
  controllerFiles.push({ rel: 'backend/src/app.module.ts', content: moduleContent })

  const mainContent =
    "import { NestFactory } from '@nestjs/core';\n" +
    "import { AppModule } from './app.module';\n\n" +
    '/**\n' +
    ' * S3 骨架引导文件。\n' +
    ` * 全局前缀设为 "${prefix.replace(/^\/+/, '') || 'api'}" 以匹配契约声明的 servers 前缀。\n` +
    ' * 仅作落地起点，端口/跨域/鉴权请按宿主项目调整。\n' +
    ' */\n' +
    'async function bootstrap() {\n' +
    '  const app = await NestFactory.create(AppModule);\n' +
    `  app.setGlobalPrefix('${prefix.replace(/^\/+/, '') || 'api'}');\n` +
    '  await app.listen(3000);\n' +
    "  console.log('[mvgo-generated-backend] listening on :3000');\n" +
    '}\n' +
    'bootstrap();\n'
  controllerFiles.push({ rel: 'backend/src/main.ts', content: mainContent })

  const backendPkg = {
    name: 'mvgo-generated-backend',
    version: '0.1.0',
    private: true,
    description: '由工坊 S3 代码生成器产出的 NestJS 骨架（确定性、零 LLM）',
    scripts: { start: 'nest start', build: 'nest build', dev: 'nest start --watch' },
    dependencies: {
      '@nestjs/common': '^11.0.0',
      '@nestjs/core': '^11.0.0',
      '@nestjs/platform-express': '^11.0.0',
      'reflect-metadata': '^0.2.0',
      rxjs: '^7.8.0',
    },
    devDependencies: {
      '@nestjs/cli': '^11.0.0',
      '@nestjs/schematics': '^11.0.0',
      '@types/node': '^22.0.0',
      typescript: '^5.5.0',
    },
  }
  controllerFiles.push({
    rel: 'backend/package.json',
    content: JSON.stringify(backendPkg, null, 2) + '\n',
  })
  controllerFiles.push({
    rel: 'backend/tsconfig.json',
    content:
      JSON.stringify(
        {
          compilerOptions: {
            module: 'commonjs',
            declaration: true,
            removeComments: false,
            emitDecoratorMetadata: true,
            experimentalDecorators: true,
            allowSyntheticDefaultImports: true,
            target: 'ES2021',
            sourceMap: true,
            outDir: './dist',
            baseUrl: './',
            strict: false,
            skipLibCheck: true,
            esModuleInterop: true,
          },
          include: ['src/**/*'],
        },
        null,
        2,
      ) + '\n',
  })
  controllerFiles.push({
    rel: 'backend/nest-cli.json',
    content: JSON.stringify({ collection: '@nestjs/schematics', sourceRoot: 'src' }, null, 2) + '\n',
  })

  /* ── 前端客户端库 ── */
  const frontendFiles: GenFile[] = []
  const apiModules: string[] = []
  let frontendApiCount = 0
  for (const tag of tagOrder) {
    const ops = byTag[tag]
    const L: string[] = []
    const modDataRefs = new Set<string>()
    L.push("import { http } from '@/core/http';")
    L.push('')
    L.push('/**')
    L.push(` * 自动生成的 API 客户端（S3 骨架） · tag=${tag}`)
    L.push(' * 复用宿主项目的 @/core/http（fetch 封装，自动注入 Token / 携带 cookie）。')
    L.push(' * 出入参类型由 S2 命名占位（response.data 为命名 any 占位），字段级类型待 S0 抽取后回填。')
    L.push(' */')
    for (const { path, method, op } of ops) {
      const url = toFrontendPath(path)
      const fn = fnName(op, path, method)
      const conf = op['x-mvgo-confidence'] || 'unknown'
      const route = toBackendRoute(url, prefix) // 仅用于抽取 :param
      const pathParams = [...route.matchAll(/:(\w+)/g)].map((m) => m[1])
      const hasBody = method !== 'get' && method !== 'delete'
      const dataRef = op['x-mvgo-response-data']
      if (dataRef) {
        modDataRefs.add(dataRef)
        dataRefs.add(dataRef)
      }
      frontendApiCount++
      L.push('')
      L.push('/**')
      L.push(` * ${String(op.summary || method.toUpperCase() + ' ' + path)}`)
      L.push(` * 置信度：${conf}${(op['x-mvgo-sources'] || []).join(', ') ? '（来源：' + (op['x-mvgo-sources'] || []).join(', ') + '）' : ''}`)
      if (op['x-mvgo-verb-inferred'])
        L.push(' * ⚠️ 方法由 S2 按 GET 占位推断，来源未声明方法，需人裁决后修正。')
      L.push(' */')
      const params: string[] = []
      if (pathParams.length)
        params.push(`pathParams: { ${pathParams.map((p) => `${p}: string | number`).join('; ')} }`)
      if (hasBody) params.push('body?: any')
      if (method === 'get' || method === 'delete') params.push('params?: Record<string, any>')
      params.push('options?: any')
      const argList = params.join(', ')
      const retType = dataRef ? `ApiResponse<${dataRef}>` : 'ApiResponse<any>'
      L.push(
        `export function ${fn}(${argList}): Promise<${retType}> {`,
      )
      if (pathParams.length) {
        L.push(
          `  const url = '${url}'.replace(/:(\\w+)/g, (_, k) => encodeURIComponent(String(pathParams[k])));`,
        )
      } else {
        L.push(`  const url = '${url}';`)
      }
      const callArgs: string[] = ['url']
      if (hasBody) callArgs.push('body')
      if (method === 'get' || method === 'delete') callArgs.push('params')
      callArgs.push('options')
      L.push(`  return http.${method}<${retType}>(${callArgs.join(', ')});`)
      L.push('}')
    }
    L.push('')
    const importLine =
      "import { ApiResponse" +
      (modDataRefs.size ? ', ' + [...modDataRefs].join(', ') : '') +
      " } from '../types';"
    L.unshift(importLine)
    const rel = `frontend/src/api/${toCamelCase(tag)}.ts`
    frontendFiles.push({ rel, content: L.join('\n') })
    apiModules.push(rel)
  }

  const frontendPlaceholderTypes =
    [...dataRefs]
      .sort()
      .map(
        (name) =>
          `export type ${name} = any; // 占位：response.data 命名类型，字段级 schema 待 S0 抽取后由 S2 回填`,
      )
      .join('\n') + (dataRefs.size ? '\n' : '')
  frontendFiles.push({
    rel: 'frontend/src/types.ts',
    content:
      "export interface ApiResponse<T = any> {\n" +
      "  /** 业务状态码，约定 '0' 表示成功 */\n" +
      "  code: string;\n" +
      "  /** 提示信息 */\n" +
      "  message: string;\n" +
      "  /** 业务数据；骨架阶段为 null */\n" +
      '  data: T | null;\n' +
      '  /** 可选扩展字段 */\n' +
      '  detail?: any;\n' +
      '}\n' +
      frontendPlaceholderTypes,
  })

  const barrel =
    apiModules
      .map((rel) => {
        const mod = rel.split('/').pop()!.replace(/\.ts$/, '')
        return `export * from './api/${mod}';`
      })
      .join('\n') +
    "\nexport * from './types';\n"
  frontendFiles.push({ rel: 'frontend/src/index.ts', content: barrel })

  frontendFiles.push({
    rel: 'frontend/package.json',
    content:
      JSON.stringify(
        {
          name: 'mvgo-generated-frontend-client',
          version: '0.1.0',
          private: true,
          description:
            '由工坊 S3 代码生成器产出的前端 API 客户端库（确定性、零 LLM）；依赖宿主项目的 @/core/http',
        },
        null,
        2,
      ) + '\n',
  })

  /* ── 汇总文件 ── */
  if (verbDefaulted > 0)
    notes.push(
      `${verbDefaulted} 个端点方法为 S2 按 GET 占位推断（x-mvgo-verb-inferred），生成骨架按 GET 落地并打 ⚠️，需人裁决后修正方法。`,
    )
  if (outsidePrefix > 0)
    notes.push(
      `${outsidePrefix} 个端点不在声明前缀（${prefix || '未识别'}）内（outsideDeclaredPrefix），接入宿主网关/前缀时需对齐。`,
    )
  if (byConfidence.candidate)
    notes.push(
      `${byConfidence.candidate} 个候选端点（candidate）未经交叉验证，骨架已打 ⚠️，开工前需人裁决确认。`,
    )
  if (dataRefs.size > 0)
    notes.push(
      `就绪态类型化：S2 已为每个端点确立命名数据载荷类型（response.data 的命名 any 占位，共 ${dataRefs.size} 个），并写入 components/schemas/* 与 operation 的 x-mvgo-response-data。当前为 any 占位，S0 抽取字段级 schema 后由 S2 回填真实字段，S3 同一套生成器会自动产出强类型 DTO / 客户端，无需改生成器形状。`,
    )
  else
    notes.push(
      '字段级类型未生成：S2 当前未吐命名数据载荷 schema（端点无 x-mvgo-response-data），故 response.data 降级为 any；S0 抽取字段级 schema 后由 S2 补命名占位，S3 自动获得类型化客户端。',
    )
  notes.push(
    '路径参数类型化（就绪态）：S2 从路径模板 {param} 抽取路径参数并置 in:path / required:true / type:string 占位；S3 据此生成 @Param(\'id\') id: string 而非 @Param() params: any。已知 query 参数类型亦按来源精确化；未知则保持 any。',
  )
  notes.push(
    '后端骨架为独立可启动的 NestJS 工程（含 main.ts / app.module.ts / package.json），可直接 npm i && npm run start 起最小服务。',
  )
  notes.push(
    '前端客户端库复用宿主项目 @/core/http（fetch 封装）；将 frontend/src 整体拷入宿主工程的 src 即可按 tag 引用 api 函数。',
  )

  const manifest = {
    generator: 's3-codegen.ts',
    version: '0.1.0',
    generatedAt: opts.generatedAt,
    runId: opts.runId,
    projectRoot: opts.projectRoot || null,
    sourceContract: 'spec/openapi.local.yaml',
    summary: {
      endpointTotal,
      backendControllers: controllerClasses.length,
      frontendApis: frontendApiCount,
      tags: tagOrder,
      byConfidence,
      verbDefaultedCount: verbDefaulted,
      outsidePrefixCount: outsidePrefix,
    },
    files: {
      backend: controllerFiles.map((f) => f.rel),
      frontend: frontendFiles.map((f) => f.rel),
      meta: ['manifest.json', 'README.md'],
    },
    notes,
  }

  const readme = buildReadme(opts, manifest)
  const metaFiles: GenFile[] = [
    { rel: 'manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' },
    { rel: 'README.md', content: readme },
  ]

  files.push(...controllerFiles, ...frontendFiles, ...metaFiles)

  return {
    files,
    summary: manifest.summary,
    notes,
  }
}

/* ─── README 生成 ───────────────────────────────────────────────────────── */
function buildReadme(opts: CodeGenOptions, manifest: Record<string, any>): string {
  const s = manifest.summary as CodeGenSummary
  const lines: string[] = []
  lines.push('# S3 代码生成产物（确定性 · 零 LLM）')
  lines.push('')
  lines.push(`- 来源 run：${opts.runId}`)
  lines.push(`- 来源契约：\`spec/openapi.local.yaml\``)
  lines.push(`- 生成时间：${opts.generatedAt}`)
  lines.push(`- 端点总数：${s.endpointTotal}`)
  lines.push(`- 后端控制器：${s.backendControllers} 个`)
  lines.push(`- 前端 API 函数：${s.frontendApis} 个`)
  lines.push(`- 标签：${(s.tags || []).join(', ')}`)
  lines.push('')
  lines.push('## 重要说明（真值边界）')
  lines.push('')
  lines.push('1. **这是骨架，不是成品。** 每个端点已确立**命名数据载荷类型**（response.data 的命名 `any` 占位，写入 `components/schemas/*` 与 operation 的 `x-mvgo-response-data`），路径参数已类型化（in:path / required / string 占位）。')
  lines.push('   字段级 `properties` 仍占位：S0 抽取字段级 schema 后由 S2 回填真实字段，S3 同一套生成器会自动产出强类型 DTO 与客户端，无需改生成器形状。')
  if (s.verbDefaultedCount > 0)
    lines.push(
      `2. **${s.verbDefaultedCount} 个端点的方法是 S2 按 GET 占位推断的**（来源未声明方法）。生成的骨架按 GET 落地并打 ⚠️ 注释，需人裁决后再修正方法。`,
    )
  if (s.outsidePrefixCount > 0)
    lines.push(
      `3. **${s.outsidePrefixCount} 个端点不在声明前缀 \`${manifest.sourceContract ? '' : ''}\` 内**（outsideDeclaredPrefix）。接入宿主网关/前缀时需对齐路由。`,
    )
  if (s.byConfidence.candidate)
    lines.push(`4. **${s.byConfidence.candidate} 个候选端点（candidate）未经交叉验证**，骨架已打 ⚠️，开工前需人裁决确认。`)
  lines.push('')
  lines.push('## 目录结构')
  lines.push('')
  lines.push('```')
  lines.push('generated/')
  lines.push('├── backend/                # 独立可启动的 NestJS 骨架')
  lines.push('│   ├── src/main.ts')
  lines.push('│   ├── src/app.module.ts')
  lines.push('│   ├── src/dto/api-response.ts')
  lines.push('│   └── src/controllers/<Tag>.controller.ts')
  lines.push('├── frontend/               # 前端 API 客户端库（复用宿主 @/core/http）')
  lines.push('│   ├── src/types.ts')
  lines.push('│   ├── src/index.ts')
  lines.push('│   └── src/api/<tag>.ts')
  lines.push('├── manifest.json           # 本产物清单与统计')
  lines.push('└── README.md')
  lines.push('```')
  lines.push('')
  lines.push('## 如何使用')
  lines.push('')
  lines.push('### 后端骨架')
  lines.push('```bash')
  lines.push('cd generated/backend')
  lines.push('npm install')
  lines.push('npm run start   # 监听 :3000，全局前缀已设为声明前缀')
  lines.push('```')
  lines.push('每个 controller 方法当前返回信封占位 `{ code: "0", message: "ok", data: null }`，按业务逻辑填充即可。')
  lines.push('')
  lines.push('### 前端客户端库')
  lines.push('将 `generated/frontend/src` 整体拷入宿主工程的 `src`，即可：')
  lines.push('```ts')
  lines.push("import { getApiBridgeTrafficQuery } from '@/api/prototype';")
  lines.push('const res = await getApiBridgeTrafficQuery({ /* query */ });')
  lines.push('// res: ApiResponse<any> —— 真正对象在 res.data')
  lines.push('```')
  lines.push('')
  lines.push('## 待回填清单（confidence 相关）')
  lines.push('')
  for (const n of manifest.notes as string[]) lines.push(`- ${n}`)
  lines.push('')
  return lines.join('\n')
}
