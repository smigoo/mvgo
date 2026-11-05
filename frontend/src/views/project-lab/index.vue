<template>
  <div class="unified-generate gen-v4 project-lab">
    <div class="lab">
      <!-- ══════════════════════ 页头 ══════════════════════ -->
      <header class="lab-head">
        <div class="head-main">
          <h1 class="page-title">项目级管线实验台<span class="ver">v3</span></h1>
          <p class="page-sub">
            选一个本机项目目录 → S0 扫出事实（只读，一个字节不改）→ 人裁决冲突 → S2 冻结「前后端需求唯一源 +
            本地契约」。
          </p>
          <p class="page-sub-extra">
            /project-lab · 后端 /api/v3/project（仅非生产环境可达；生产环境模块不注册，统一 404）
          </p>
        </div>
        <div class="head-actions">
          <button class="btn ghost" :disabled="healthLoading" @click="loadHealth">引擎自检</button>
          <button class="btn ghost" :disabled="runsLoading" @click="loadRuns">刷新历史</button>
        </div>
      </header>

      <!-- ══════════════════════ 引擎自检条 ══════════════════════ -->
      <div v-if="health" class="health" :class="health.ok ? 'is-ok' : 'is-bad'">
        <span class="dot"></span>
        <span class="h-txt">
          <b>{{ health.ok ? '引擎就绪' : '引擎异常' }}</b>
          <span class="sep">·</span>
          {{ health.milestone }}
        </span>
        <span class="h-meta mono">
          扫描器 md5 {{ shortMd5 }}
          <em :class="health.scanner.md5Match ? 'ok' : 'bad'">{{
            health.scanner.md5Match ? '与已验证版本一致' : '与已验证版本不一致'
          }}</em>
        </span>
        <span class="h-meta mono">运行根 {{ health.runsRoot }}</span>
        <span v-if="health.runsRootError" class="h-meta bad">{{ health.runsRootError }}</span>
      </div>
      <div v-else-if="healthErr" class="health is-bad">
        <span class="dot"></span>
        <span class="h-txt">引擎自检失败：{{ healthErr }}</span>
      </div>

      <!-- ══════════════════════ 状态条 ══════════════════════ -->
      <div class="statusbar">
        <div class="sb">
          <span class="sb-k">运行</span>
          <span class="sb-v mono">{{ run ? run.runId : '—' }}</span>
        </div>
        <div class="sb grow">
          <span class="sb-k">目录</span>
          <span class="sb-v mono ellipsis">{{ run ? run.projectDir : projectDir || '—' }}</span>
        </div>
        <div class="sb">
          <span class="sb-k">S0</span>
          <span class="sb-v" :class="gateClass">{{ (run && run.s0 && run.s0.gate) || '—' }}</span>
        </div>
        <div class="sb">
          <span class="sb-k">未决</span>
          <span class="sb-v" :class="{ warn: pendingCount > 0 }">{{ pendingCount }}</span>
        </div>
        <div class="sb">
          <span class="sb-k">契约</span>
          <span class="sb-v" :class="{ ok: frozenOk }">{{ frozenOk ? '已冻结' : '未冻结' }}</span>
        </div>
        <div class="sb">
          <span class="sb-k">只读自证</span>
          <span class="sb-v" :class="readonlyClass">{{ readonlyText }}</span>
        </div>
      </div>

      <!-- ══════════════════════ STEP 1 · 选目录 ══════════════════════ -->
      <section class="card">
        <div class="card-head">
          <span class="no" :class="{ done: !!run }">1</span>
          <h2>选择项目目录</h2>
          <span class="hint">
            点「选择文件夹」直接开系统的目录窗口；后端读的是<strong>运行后端那台机器</strong>上的绝对路径
          </span>
        </div>

        <div class="path-row">
          <button
            class="btn pick"
            :disabled="picking"
            title="打开系统的「选择文件夹」窗口"
            @click="pickDirectory"
          >
            <span class="ico">📁</span>
            {{ picking ? '等待系统窗口…' : '选择文件夹' }}
          </button>
          <input
            v-model="projectDir"
            class="path-input mono"
            type="text"
            spellcheck="false"
            placeholder="也可以直接粘贴绝对路径，例如 /Users/you/work/your-project"
            @keyup.enter="doInspect"
          />
          <button class="btn" :disabled="inspecting || !projectDir.trim()" @click="doInspect">
            {{ inspecting ? '体检中…' : '体检' }}
          </button>
          <button class="btn primary" :disabled="scanning || !projectDir.trim()" @click="doScan">
            {{ scanning ? '扫描中…' : '开始扫描 · S0' }}
          </button>
          <!-- 🔴 扫描中显示已耗时：让用户区分「8s 的正常等待」与「真的卡死」，并为超时提供可观测性 -->
          <span v-if="scanning" class="scan-elapsed">已耗时 {{ scanElapsed }}s</span>
        </div>

        <div class="path-side">
          <span v-if="pickHint" class="pick-hint" :class="{ bad: pickHintIsError }">{{ pickHint }}</span>
          <button class="link" @click="openBrowser(projectDir.trim())">在页面内浏览本机目录 →</button>
        </div>

        <p v-if="inspectErr" class="err">{{ inspectErr }}</p>
        <p v-if="scanErr" class="err">{{ scanErr }}</p>

        <div v-if="inspect" class="inspect-box">
          <div class="kv-grid">
            <div class="kv">
              <span class="k">存在</span>
              <span class="v" :class="inspect.exists ? 'ok' : 'bad'">{{
                inspect.exists ? '是' : '否'
              }}</span>
            </div>
            <div class="kv">
              <span class="k">是目录</span>
              <span class="v" :class="inspect.isDirectory ? 'ok' : 'bad'">{{
                inspect.isDirectory ? '是' : '否'
              }}</span>
            </div>
            <div class="kv">
              <span class="k">可读</span>
              <span class="v" :class="inspect.readable ? 'ok' : 'bad'">{{
                inspect.readable ? '是' : '否'
              }}</span>
            </div>
            <div class="kv">
              <span class="k">文件（深度≤3）</span><span class="v">{{ inspect.totalFiles }}</span>
            </div>
            <div class="kv">
              <span class="k">体量</span><span class="v">{{ fmtBytes(inspect.totalBytes) }}</span>
            </div>
            <div class="kv">
              <span class="k">扩展名种类</span><span class="v">{{ inspect.byExt.length }}</span>
            </div>
          </div>

          <p class="hint-line">{{ inspect.hint }}</p>

          <div v-if="inspect.topLevel.length" class="chips-row">
            <span class="chips-label">顶层</span>
            <span
              v-for="t in inspect.topLevel"
              :key="t.name"
              class="chip"
              :class="t.type === 'dir' ? 'is-dir' : 'is-file'"
            >
              {{ t.name }}<em v-if="t.type === 'dir'">/{{ t.childCount }}</em>
            </span>
          </div>

          <div v-if="inspect.byExt.length" class="ext-row">
            <span v-for="e in inspect.byExt" :key="e.ext" class="ext" :title="fmtBytes(e.bytes)">
              <b>{{ e.ext }}</b><em>{{ e.count }}</em>
            </span>
          </div>
        </div>
      </section>

      <!-- ══════════════════════ STEP 2 · 扫描结果 ══════════════════════ -->
      <section v-if="run" class="card">
        <div class="card-head">
          <span class="no" :class="{ done: true }">2</span>
          <h2>S0 扫描事实</h2>
          <span class="hint mono">
            {{ run.runId }} · exit={{ run.exitCode ?? '—' }} · 后端耗时 {{ run.durationMs ?? '—' }}ms ·
            扫描器自报 {{ run.elapsedMs ?? '—' }}ms
          </span>
        </div>

        <!-- ── 项目简介：S0 事实派生的人读摘要（确定性，不调模型） ── -->
        <div v-if="run.briefing" class="brief">
          <div class="brief-head">
            <span class="brief-title">{{ run.briefing.title }}</span>
            <span class="brief-tag">自动生成 · 来自 S0 扫描事实</span>
          </div>
          <p class="brief-desc">{{ run.briefing.desc }}</p>
          <div class="brief-rows">
            <div class="brief-row">
              <span class="brief-k">前端</span>
              <span class="brief-v mono">{{ run.briefing.frontend }}</span>
            </div>
            <div class="brief-row">
              <span class="brief-k">后端</span>
              <span class="brief-v mono">{{ run.briefing.backend }}</span>
            </div>
          </div>
          <div v-if="run.briefing.features && run.briefing.features.length" class="chips-row">
            <span class="chips-label">要实现的功能</span>
            <button
              v-for="f in run.briefing.features"
              :key="f"
              class="chip is-dir"
              type="button"
              title="点击查看功能 / 接口 / 页面开发需求"
              @click="openFeature(f)"
            >
              {{ f }}
            </button>
            <span class="brief-src">{{ run.briefing.featuresFrom }}</span>
          </div>
        </div>

        <div class="slots">
          <div v-for="s in slots" :key="s.key" class="slot" :class="s.found ? 'found' : 'miss'">
            <span class="slot-name">{{ s.key }}</span>
            <span class="slot-state">{{ s.found ? '✓' : '✕' }}</span>
          </div>
        </div>

        <div class="two-col">
          <div class="col">
            <h3 class="sub-h">
              端点（{{ run.endpoints.total }} 条 · 前缀 {{ run.endpoints.declaredPrefix || '未声明' }}）
            </h3>
            <div class="conf-bar">
              <span v-for="(v, k) in run.endpoints.byConfidence" :key="k" class="conf" :class="'conf-' + k">
                {{ k }} <b>{{ v }}</b>
              </span>
            </div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>方法</th>
                    <th>路径</th>
                    <th>置信</th>
                    <th>来源</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(e, i) in run.endpoints.list" :key="i">
                    <td class="mono">{{ e.verb }}</td>
                    <td class="mono ellipsis" :title="e.path">{{ e.path }}</td>
                    <td><span class="conf" :class="'conf-' + e.confidence">{{ e.confidence }}</span></td>
                    <td class="src">{{ (e.sources || []).join(' / ') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="col">
            <h3 class="sub-h">产物（{{ existArtifacts.length }}/{{ run.artifacts.length }} 已生成）</h3>
            <ul class="art-list">
              <li v-for="a in run.artifacts" :key="a.name" :class="{ miss: !a.exists }">
                <button class="art-btn mono" :disabled="!a.exists" @click="openArtifact(a.name)">
                  {{ a.name }}
                </button>
                <span class="art-size">{{ a.exists ? fmtBytes(a.bytes) : '未生成' }}</span>
              </li>
            </ul>

            <h3 class="sub-h">S1 抽源对齐</h3>
            <div class="kv-grid tight">
              <div v-for="(v, k) in sourceStats" :key="k" class="kv">
                <span class="k">{{ k }}</span><span class="v">{{ v }}</span>
              </div>
            </div>
            <div class="env-line">
              <span class="k">响应信封</span>
              <span class="mono env-v">{{ envelopeText }}</span>
              <span
                class="tag"
                :class="envelopeConfirmed ? 'tag-ok' : 'tag-warn'"
              >{{ envelopeConfirmed ? '已声明证实' : '未证实' }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ══════════════════════ STEP 3 · 裁决 ══════════════════════ -->
      <section v-if="run && blocks.length" class="card">
        <div class="card-head">
          <span class="no" :class="{ done: pendingCount === 0 }">3</span>
          <h2>冲突与缺口裁决</h2>
          <span class="hint">
            裁决追加写进 <code>spec/decisions.md</code>（扫描器只读不写，重跑不丢）；同 id 再裁以最后一条为准
          </span>
        </div>

        <div class="dec-summary">
          <span class="pill">共 {{ blocks.length }} 项</span>
          <span v-if="pendingCount" class="pill warn">未决 {{ pendingCount }}</span>
          <span v-else class="pill ok">全部已裁</span>
          <button class="btn ghost sm" :disabled="loadingConflicts" @click="loadConflictsDoc(run.runId)">
            {{ loadingConflicts ? '…' : '重新解析 conflicts.md' }}
          </button>
        </div>

        <div class="block-list">
          <article
            v-for="b in blocks"
            :key="b.id || b.title"
            class="block"
            :class="[b.kind, decisionOf(b.id) ? 'is-decided' : '']"
          >
            <header class="block-head">
              <span class="bkind" :class="b.kind">{{ b.kind === 'gap' ? '缺口' : '冲突' }}</span>
              <h3 class="btitle">{{ b.title }}</h3>
              <span v-if="b.id" class="bid mono">{{ b.id }}</span>
              <span v-if="b.severity" class="sev" :class="'sev-' + b.severity">{{ b.severity }}</span>
              <span v-if="decisionOf(b.id)" class="decided-tag">已裁决 · {{ decisionOf(b.id).choice }}</span>
            </header>

            <div class="block-body">
              <template v-for="(s, i) in b.segs" :key="i">
                <p v-if="s.kind === 'text'" class="seg-text">{{ s.text }}</p>
                <p v-else-if="s.kind === 'label'" class="seg-label">{{ s.text }}</p>
                <p v-else-if="s.kind === 'ask'" class="seg-ask">{{ s.text }}</p>
                <p v-else class="seg-bullet">
                  <span v-if="s.letter" class="opt-letter">{{ s.letter }}</span>{{ s.text }}
                </p>
              </template>
            </div>

            <div v-if="b.id" class="dec-form">
              <div v-if="b.options.length" class="opt-picks">
                <button
                  v-for="o in b.options"
                  :key="o.letter"
                  class="pick"
                  :class="{ active: formOf(b.id).choice === o.letter }"
                  :title="o.text"
                  @click="pickOption(b.id, o.letter)"
                >
                  {{ o.letter }} · {{ o.short }}
                </button>
              </div>
              <input
                v-model="formOf(b.id).choice"
                class="dec-input"
                type="text"
                :placeholder="
                  b.options.length
                    ? '选一个选项，或直接写你的裁决'
                    : '写下你的裁决（例：追认 code/message/data，successCode=200）'
                "
              />
              <input
                v-model="formOf(b.id).note"
                class="dec-input dec-note"
                type="text"
                placeholder="备注（可选）：为什么这么定"
              />
              <button
                class="btn sm"
                :disabled="savingId === b.id || !formOf(b.id).choice.trim()"
                @click="submitDecision(b)"
              >
                {{ savingId === b.id ? '提交中…' : '提交裁决' }}
              </button>
            </div>
            <p v-else class="no-id-note">该条没有机器 id，无法单独裁决 —— 请在 conflicts.md 里补 id 后重扫。</p>
          </article>
        </div>

        <p v-if="decisionErr" class="err">{{ decisionErr }}</p>
      </section>

      <!-- ══════════════════════ STEP 4 · 冻结 ══════════════════════ -->
      <section v-if="run" class="card">
        <div class="card-head">
          <span class="no" :class="{ done: frozenOk }">4</span>
          <h2>S2 契约冻结</h2>
          <span class="hint">
            纯格式转换，不调模型 ⇒ 同输入必得同输出；产出 <code>spec/openapi.local.yaml</code> 与
            <code>doc/REQUIREMENTS.md</code>
          </span>
        </div>

        <div class="freeze-row">
          <button class="btn primary" :disabled="freezing" @click="doFreeze">
            {{ freezing ? '冻结中…' : frozenOk ? '重新冻结' : '冻结契约 · S2' }}
          </button>
          <span v-if="pendingCount" class="warn-line">
            还有 {{ pendingCount }} 项未决 —— 仍可冻结，未决项会列进附录 Z.3，不会替你选
          </span>
        </div>

        <p v-if="freezeErr" class="err">{{ freezeErr }}</p>

        <div v-if="freezeResult" class="freeze-box">
          <div class="checks">
            <div v-for="c in freezeResult.checks" :key="c.id" class="check" :class="c.ok ? 'ok' : 'bad'">
              <span class="ck">{{ c.ok ? '✓' : '✕' }}</span>
              <span class="cid mono">{{ c.id }}</span>
              <span class="cdetail">{{ c.detail }}</span>
            </div>
          </div>

          <div class="kv-grid">
            <div class="kv">
              <span class="k">path</span><span class="v">{{ freezeResult.openapi.pathCount }}</span>
            </div>
            <div class="kv">
              <span class="k">operation</span
              ><span class="v">{{ freezeResult.openapi.operationCount }}</span>
            </div>
            <div class="kv">
              <span class="k">方法已声明</span
              ><span class="v">{{ freezeResult.openapi.verbDeclared }}</span>
            </div>
            <div class="kv">
              <span class="k">方法占位(GET)</span
              ><span class="v warn">{{ freezeResult.openapi.verbDefaulted }}</span>
            </div>
            <div class="kv">
              <span class="k">跳过</span
              ><span class="v" :class="{ bad: freezeResult.openapi.skipped }">{{
                freezeResult.openapi.skipped
              }}</span>
            </div>
            <div class="kv">
              <span class="k">契约体量</span
              ><span class="v">{{ fmtBytes(freezeResult.openapi.bytes) }}</span>
            </div>
            <div class="kv">
              <span class="k">sha256</span
              ><span class="v mono">{{ freezeResult.openapi.sha256 }}</span>
            </div>
            <div class="kv">
              <span class="k">envelope.confirmed</span
              ><span class="v">{{ String(freezeResult.envelope.confirmed) }}</span>
            </div>
          </div>

          <div class="digests">
            <span class="d-h">制品指纹</span>
            <span v-for="(v, k) in freezeResult.digests" :key="k" class="dg mono">
              {{ k }}<em>{{ v }}</em>
            </span>
          </div>

          <div v-if="pendingItems.length" class="pending">
            <span class="d-h">未决（{{ pendingItems.length }}）</span>
            <span v-for="p in pendingItems" :key="p.id" class="pd" :class="{ 'is-gap': p.isGap }">
              {{ p.id }}<template v-if="p.isGap">（{{ p.severity }}）</template>
            </span>
          </div>
        </div>
      </section>

      <!-- ══════════════════════ STEP 5 · 代码生成 ══════════════════════ -->
      <section v-if="run && frozenOk" class="card">
        <div class="card-head">
          <span class="no" :class="{ done: !!genResult }">5</span>
          <h2>S3 代码生成（前后端骨架）</h2>
          <span class="hint">
            确定性、零 LLM ⇒ 同契约必得同代码；产出 <code>generated/</code> 后端骨架 + 前端客户端库
          </span>
        </div>

        <div class="freeze-row">
          <button class="btn primary" :disabled="genLoading" @click="doGenerate">
            {{ genLoading ? '生成中…' : genResult ? '重新生成' : '生成前后端骨架 · S3' }}
          </button>
          <span v-if="!frozenOk" class="warn-line">需先冻结契约（S2）才能生成代码</span>
        </div>

        <p v-if="genErr" class="err">{{ genErr }}</p>

        <div v-if="genResult" class="gen-box">
          <div class="gen-dl-row">
            <button class="btn ghost sm" :disabled="genLoading" @click="downloadGeneratedZip(run.runId)">
              ↓ 打包下载全部（zip）
            </button>
            <span class="hint">把 generated/ 整个目录打成 zip 下载（后端 StreamableFile 流出，不走信封）</span>
          </div>
          <div class="kv-grid">
            <div class="kv"><span class="k">端点</span><span class="v">{{ genResult.summary.endpointTotal }}</span></div>
            <div class="kv"><span class="k">后端控制器</span><span class="v">{{ genResult.summary.backendControllers }}</span></div>
            <div class="kv"><span class="k">前端 API</span><span class="v">{{ genResult.summary.frontendApis }}</span></div>
            <div class="kv"><span class="k">方法占位(GET)</span><span class="v warn">{{ genResult.summary.verbDefaultedCount }}</span></div>
            <div class="kv"><span class="k">越界前缀</span><span class="v" :class="{ bad: genResult.summary.outsidePrefixCount }">{{ genResult.summary.outsidePrefixCount }}</span></div>
          </div>

          <div class="gen-groups">
            <div class="gen-group">
              <div class="gen-g-h">后端骨架（generated/backend）</div>
              <button
                v-for="rel in genResult.files.backend"
                :key="rel"
                class="gen-file mono"
                :title="'预览 ' + rel"
                @click="openArtifact('generated/' + rel)"
              >
                {{ rel }}
              </button>
            </div>
            <div class="gen-group">
              <div class="gen-g-h">前端客户端库（generated/frontend）</div>
              <button
                v-for="rel in genResult.files.frontend"
                :key="rel"
                class="gen-file mono"
                :title="'预览 ' + rel"
                @click="openArtifact('generated/' + rel)"
              >
                {{ rel }}
              </button>
            </div>
            <div class="gen-group">
              <div class="gen-g-h">清单 / 说明</div>
              <button
                v-for="rel in (genResult.files.meta && genResult.files.meta.length ? genResult.files.meta : ['manifest.json', 'README.md'])"
                :key="rel"
                class="gen-file mono"
                :title="'预览 ' + rel"
                @click="openArtifact('generated/' + rel)"
              >
                {{ rel }}
              </button>
            </div>
          </div>

          <div class="gen-notes">
            <span class="d-h">说明 / 待回填</span>
            <div v-for="(n, i) in genResult.notes" :key="i" class="gn">{{ n }}</div>
          </div>
          <p class="hint">点上面的文件名可在下方「产物」查看器内预览，并支持单文件下载。</p>
        </div>
      </section>

      <!-- ══════════════════════ STEP 6 · S4 真·Vue 页面 ══════════════════════ -->
      <section v-if="run && frozenOk" class="card">
        <div class="card-head">
          <span class="no" :class="{ done: genVueFiles.length }">6</span>
          <h2>S4 真·Vue 页面预览</h2>
          <span class="hint">
            运行时编译 S4 生成的 GenViewNN.vue（含 @/components 依赖），在浏览器内真渲染
          </span>
        </div>

        <div class="freeze-row">
          <button class="btn primary" :disabled="genVueLoading" @click="loadGenVueList">
            {{ genVueLoading ? '列举中…' : genVueFiles.length ? '刷新页面清单' : '列举 S4 页面' }}
          </button>
          <span v-if="!genVueFiles.length && !genVueLoading && !genVueErr" class="hint">
            需先跑过 S4（生成 Vue 页面）
          </span>
        </div>

        <p v-if="genVueErr" class="err">{{ genVueErr }}</p>

        <div v-if="genVueFiles.length" class="gen-groups">
          <div class="gen-group">
            <div class="gen-g-h">生成页面（generated/frontend/src/views）</div>
            <button
              v-for="f in genVueFiles"
              :key="f.rel"
              class="gen-file mono"
              :title="'预览 ' + f.rel"
              @click="openGenVuePreview(f.rel)"
            >
              {{ f.name }}
            </button>
          </div>
        </div>
      </section>

      <!-- ══════════════════════ 产物查看器 ══════════════════════ -->
      <section v-if="run" class="card">
        <div class="card-head">
          <span class="no ghost">▤</span>
          <h2>产物</h2>
          <span class="hint">只读预览（白名单 + 4MB 截断），真值始终是磁盘上的文件</span>
        </div>

        <div v-if="openableArtifacts.length" class="tabs">
          <button
            v-for="a in openableArtifacts"
            :key="a.name"
            class="tab"
            :class="{ active: artName === a.name }"
            @click="openArtifact(a.name)"
          >
            {{ a.name.split('/').pop() }}
          </button>
        </div>

        <div v-if="artLoading" class="art-loading">读取中…</div>
        <p v-else-if="artErr" class="err">{{ artErr }}</p>
        <div v-else-if="artifact" class="art-view">
          <div class="art-meta mono">
            {{ artifact.name }} · {{ fmtBytes(artifact.bytes) }} · {{ artifact.lines }} 行
            <span v-if="artifact.truncated" class="bad">（已截断）</span>
            <span class="mtime">{{ artifact.mtime }}</span>
            <button
              v-if="!artifact.isImage"
              class="art-dl"
              title="下载当前文件"
              @click="downloadArtifact"
            >
              ↓ 下载
            </button>
          </div>
          <pre v-if="!artifact.isImage" class="art-code">{{ artifact.content }}</pre>
          <img v-else :src="artifact.dataUrl" class="art-img" alt="artifact" />
        </div>
        <p v-else class="muted">点上面的文件名查看内容。</p>
      </section>

      <!-- ══════════════════════ 运行历史 ══════════════════════ -->
      <section class="card">
        <div class="card-head">
          <span class="no ghost">⟲</span>
          <h2>运行历史</h2>
          <span class="hint mono">{{ health ? health.runsRoot : '' }}</span>
        </div>
        <p v-if="runsErr" class="err">{{ runsErr }}</p>
        <p v-else-if="!runs.length" class="muted">还没有运行记录。</p>
        <ul v-else class="runs">
          <li
            v-for="r in runs"
            :key="r.runId"
            :class="{ active: run && run.runId === r.runId }"
            @click="selectRun(r.runId)"
          >
            <span class="r-id mono">{{ r.runId }}</span>
            <span class="r-state" :class="{ ok: r.frozen }">{{ r.frozen ? '已冻结' : '未冻结' }}</span>
            <span class="r-dir mono ellipsis" :title="r.projectDir || ''">{{ r.projectDir || '—' }}</span>
            <span class="r-time mono">{{ fmtTime(r.createdAt) }}</span>
            <button
              class="r-del"
              title="删除这条运行（含全部历史记录与产物）"
              @click.stop="askDeleteRun(r)"
            >
              删除
            </button>
          </li>
        </ul>
      </section>
    </div>

    <!-- ══════════════════════ 内置目录浏览器（系统窗口的兜底） ══════════════════════ -->
    <div v-if="browser.open" class="browser-mask" @click.self="closeBrowser">
      <div class="browser" role="dialog" aria-label="选择项目目录">
        <div class="browser-head">
          <h3>选择项目目录</h3>
          <span class="browser-sub">
            列的是<strong>后端那台机器</strong>上的目录；这里只读，不动任何文件
          </span>
          <button class="x" title="关闭" @click="closeBrowser">✕</button>
        </div>

        <div class="browser-nav">
          <button
            class="btn sm"
            :disabled="!browser.parent || browser.loading"
            title="上一级"
            @click="browseTo(browser.parent)"
          >
            ↑ 上一级
          </button>
          <button class="btn sm" :disabled="browser.loading" @click="browseTo('')">
            ⌂ 起始位置
          </button>
          <span class="cur mono ellipsis" :title="browser.path">{{ browser.path || '起始位置' }}</span>
        </div>

        <div class="browser-meta">
          <span v-if="browser.loading" class="muted">读取中…</span>
          <template v-else-if="browser.data">
            <span class="tag" :class="{ on: browser.data.isGitRepo }">git</span>
            <span class="tag" :class="{ on: browser.data.hasProjectJson }">mvgo.project.json</span>
            <span class="muted">
              子目录 {{ browser.data.totalEntries }} · 本层文件 {{ browser.data.fileCountAtThisLevel }}
              <template v-if="browser.data.skippedDirs">
                · 已折叠 {{ browser.data.skippedDirs }} 个噪音目录
              </template>
            </span>
          </template>
        </div>

        <p v-if="browser.err" class="err">{{ browser.err }}</p>

        <ul class="browser-list">
          <li v-for="e in browserEntries" :key="e.path">
            <button class="dir" :class="{ 'is-git': e.isGitRepo }" @click="browseTo(e.path)">
              <span class="ico">{{ e.isGitRepo ? '📦' : '📁' }}</span>
              <span class="nm">{{ e.name }}</span>
              <span class="cnt mono">{{ e.childDirs }} 目录 / {{ e.childFiles }} 文件</span>
            </button>
          </li>
          <li v-if="!browser.loading && browser.data && !browserEntries.length" class="empty">
            这一层没有可进入的子目录 —— 如果这就是你要的项目根，直接点「就用这个目录」。
          </li>
        </ul>

        <div class="browser-foot">
          <span class="pick-target mono ellipsis" :title="browser.path">
            将选中：{{ browser.path || '—' }}
          </span>
          <button class="btn" @click="closeBrowser">取消</button>
          <button class="btn primary" :disabled="!browser.path" @click="confirmBrowser">
            就用这个目录
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════ 删除运行 · 二次确认 ══════════════════════ -->
    <!-- 🔴 破坏性操作：绝不点一下直接删。这里是唯一能触发删除的入口， -->
    <!--    确认后才调 DELETE /runs/:runId（整条运行目录＝历史记录＋全部产物）。 -->
    <div v-if="delTarget" class="browser-mask" @click.self="closeDeleteConfirm">
      <div class="browser confirm" role="dialog" aria-label="确认删除运行">
        <div class="browser-head">
          <h3>确认删除这条运行？</h3>
          <span class="browser-sub">
            删的是<strong>整条运行</strong>：历史记录 + 全部产物（run.json、spec/、doc/）
          </span>
          <button class="x" title="关闭" @click="closeDeleteConfirm">✕</button>
        </div>

        <div class="confirm-body">
          <div class="confirm-kv">
            <span class="k">运行</span>
            <span class="v mono">{{ delTarget.runId }}</span>
          </div>
          <div class="confirm-kv">
            <span class="k">项目目录</span>
            <span class="v mono ellipsis" :title="delTarget.projectDir || ''">
              {{ delTarget.projectDir || '—' }}
            </span>
          </div>
          <div class="confirm-kv">
            <span class="k">时间</span>
            <span class="v mono">{{ fmtTime(delTarget.createdAt) }}</span>
          </div>
          <p class="confirm-warn">磁盘上不留任何备份，删除后不可恢复。</p>
          <p v-if="delErr" class="err">{{ delErr }}</p>
        </div>

        <div class="browser-foot">
          <span class="pick-target mono ellipsis">
            {{ delBusy ? '正在删除…' : '该运行下的所有产物文件会一并删除' }}
          </span>
          <button class="btn" :disabled="delBusy" @click="closeDeleteConfirm">取消</button>
          <button class="btn danger" :disabled="delBusy" @click="confirmDeleteRun">
            {{ delBusy ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 功能 tag 详情：功能简介 / 相关接口 / 页面开发需求 -->
    <div v-if="featDetail" class="browser-mask" @click.self="closeFeature">
      <div class="browser feat" role="dialog" aria-label="功能详情">
        <div class="browser-head">
          <h3>{{ featDetail.feature }}</h3>
          <span class="browser-sub">要实现的功能 · 点击 tag 展开的详情</span>
          <button class="x" title="关闭" @click="closeFeature">✕</button>
        </div>

        <div class="feat-body">
          <section class="feat-sec">
            <h4 class="feat-h">功能简介</h4>
            <p class="feat-desc">{{ featDetail.description }}</p>
          </section>

          <section class="feat-sec">
            <h4 class="feat-h">
              具体功能点<span class="feat-note">需求文档下该功能模块的子项</span>
            </h4>
            <ul v-if="featDetail.featurePoints && featDetail.featurePoints.length" class="feat-points">
              <li v-for="(pt, i) in featDetail.featurePoints" :key="i">{{ pt }}</li>
            </ul>
            <p v-else class="feat-empty">文档未给出该功能的具体功能点细分。</p>
          </section>

          <section class="feat-sec">
            <h4 class="feat-h">
              相关接口<span class="feat-note">已扫描到的匹配接口</span>
            </h4>
            <div v-if="featDetail.relatedEndpoints && featDetail.relatedEndpoints.length" class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr><th>方法</th><th>路径</th><th>置信</th><th>位置</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(e, i) in featDetail.relatedEndpoints" :key="i">
                    <td class="mono">{{ e.verb }}</td>
                    <td class="mono ellipsis" :title="e.path">{{ e.path }}</td>
                    <td><span class="conf" :class="'conf-' + e.confidence">{{ e.confidence }}</span></td>
                    <td class="loc-col">
                      <template v-if="e.locations && e.locations.length">
                        <span
                          v-for="(loc, li) in e.locations"
                          :key="li"
                          class="loc-chip"
                          :class="'loc-' + loc.elementType"
                          :title="loc.page + ' · ' + loc.selector"
                          >{{ loc.hint }}<template v-if="loc.text">：{{ loc.text }}</template></span
                        >
                      </template>
                      <span v-else-if="e.visionBox" class="loc-chip loc-vision">视觉定位（见截图框）</span>
                      <span v-else class="loc-none">原型页未检测到对应 UI 元素</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="feat-empty">暂无已扫描到匹配的接口。</p>
          </section>

          <section class="feat-sec">
            <h4 class="feat-h">
              建议新增接口<span class="feat-note warn">由功能描述推导（候选 · 待人工确认）</span>
            </h4>
            <div v-if="featDetail.suggestedEndpoints && featDetail.suggestedEndpoints.length" class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr><th>方法</th><th>路径</th><th>说明</th><th>位置</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(e, i) in featDetail.suggestedEndpoints" :key="i">
                    <td class="mono">{{ e.verb }}</td>
                    <td class="mono ellipsis" :title="e.path">{{ e.path }}</td>
                    <td class="src">{{ e.note }}</td>
                    <td class="loc-col">
                      <template v-if="e.locations && e.locations.length">
                        <span
                          v-for="(loc, li) in e.locations"
                          :key="li"
                          class="loc-chip"
                          :class="'loc-' + loc.elementType"
                          :title="loc.page + ' · ' + loc.selector"
                          >{{ loc.hint }}<template v-if="loc.text">：{{ loc.text }}</template></span
                        >
                      </template>
                      <span v-else-if="e.visionBox" class="loc-chip loc-vision">视觉定位（见截图框）</span>
                      <span v-else class="loc-none">原型页未检测到对应 UI 元素</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="feat-empty">暂无建议新增接口：该功能已匹配到真实接口，或文档未给出功能描述；如需 AI 自动推导请在「设置」中配置文本模型后重新扫描。</p>
          </section>

          <section class="feat-sec">
            <h4 class="feat-h">
              页面开发需求简介<span class="feat-note">相关原型页面 + 开发提示</span>
            </h4>
            <ul v-if="featDetail.relatedPages && featDetail.relatedPages.length" class="feat-pages">
              <li v-for="(p, i) in featDetail.relatedPages" :key="i" class="mono ellipsis" :title="p">{{ p }}</li>
            </ul>
            <p v-if="featDetail.pageDevNote" class="feat-desc">{{ featDetail.pageDevNote }}</p>
            <p v-if="!(featDetail.relatedPages && featDetail.relatedPages.length) && !featDetail.pageDevNote" class="feat-empty">
              暂无相关页面信息。
            </p>
          </section>

          <section class="feat-sec">
            <h4 class="feat-h">
              原型截图<span class="feat-note">HTML 原型无头渲染（puppeteer）</span>
            </h4>
            <div v-if="featShots && featShots.length" class="feat-shots">
              <div v-for="(s, i) in featShots" :key="i" class="shot-wrap">
                <img v-if="s.status === 'ok'" :src="s.url" class="feat-shot" alt="原型截图" loading="lazy" />
                <div v-else-if="s.status === 'loading'" class="shot-ph">截图加载中…</div>
                <div v-else class="shot-ph shot-err">截图加载失败（接口 404 或网络错误，见控制台）</div>
                <template v-for="(b, bi) in featVisionBoxes" :key="'b' + bi">
                  <div
                    class="shot-box"
                    :class="'box-' + b.action"
                    :style="{
                      left: b.x * 100 + '%',
                      top: b.y * 100 + '%',
                      width: b.w * 100 + '%',
                      height: b.h * 100 + '%',
                    }"
                  >
                    <span class="shot-box-label">{{ b.label }}</span>
                  </div>
                </template>
              </div>
            </div>
            <p v-else class="feat-empty">暂无原型截图（未扫描到相关页面，或本地无 Chromium 渲染失败已降级）。</p>
          </section>

          <section class="feat-sec">
            <h4 class="feat-h">
              覆盖比对<span
                class="feat-note"
                :class="featDetail.coverage && featDetail.coverage.byVision ? 'ok' : 'warn'"
                >{{ featDetail.coverage && featDetail.coverage.byVision ? '原型 vs 需求（视觉比对 · 接入视觉模型）' : '原型 vs 需求（确定性基线）' }}</span
              >
            </h4>
            <p v-if="featDetail.coverage && featDetail.coverage.summary" class="feat-desc">
              {{ featDetail.coverage.summary }}
            </p>
            <ul v-if="featDetail.coverage && featDetail.coverage.points && featDetail.coverage.points.length" class="feat-cov">
              <li v-for="(c, i) in featDetail.coverage.points" :key="i" :class="'cov-' + c.status">
                <span class="cov-dot"></span>{{ c.text }}
                <span class="cov-st">{{ covLabel(c.status) }}</span>
              </li>
            </ul>
            <p v-else-if="featDetail.coverage && featDetail.coverage.summary" class="feat-empty">
              {{ featDetail.coverage.summary }}
            </p>
          </section>
        </div>

        <div class="browser-foot">
          <span class="pick-target mono ellipsis">建议新增接口为候选态，确认后才会纳入契约</span>
          <button class="btn" @click="closeFeature">关闭</button>
        </div>
      </div>
    </div>

    <!-- S4 真·Vue 页面渲染弹窗 -->
    <div v-if="previewTarget" class="genvue-mask" @click.self="closeGenVuePreview">
      <div class="genvue-modal">
        <div class="genvue-head">
          <span class="genvue-title mono">{{ previewTarget.rel }}</span>
          <div class="genvue-head-actions">
            <button class="btn text" @click="openEmbedPanel">插入组件</button>
            <button class="btn text" @click="openS4Binding">对接接口</button>
            <button class="btn text" aria-label="关闭" @click="closeGenVuePreview">✕</button>
          </div>
        </div>
        <div class="genvue-body" :data-preview-scope="previewScopeKey">
          <div v-if="previewLoading" class="genvue-state">编译渲染中…</div>
          <div v-else-if="previewErr" class="genvue-state err">{{ previewErr }}</div>
          <component v-else :is="previewComp" />
        </div>
      </div>
    </div>

    <!-- S4 组件嵌入面板：把已发布 workspace 组件插入 S4 页面 -->
    <div v-if="embedPanelOpen" class="embed-mask" @click.self="closeEmbedPanel">
      <div class="embed-modal">
        <div class="embed-head">
          <span class="embed-title">插入 workspace 组件</span>
          <button class="btn text" aria-label="关闭" @click="closeEmbedPanel">✕</button>
        </div>
        <div class="embed-body">
          <div class="embed-cols">
            <div class="embed-col embed-col-list">
              <div class="embed-col-title">候选组件（workspace）</div>
              <div v-if="embedLoading" class="embed-state">加载中…</div>
              <div v-else-if="embedErr && !embedComponents.length" class="embed-state err">{{ embedErr }}</div>
              <div v-else class="embed-list">
                <div
                  v-for="c in embedComponents"
                  :key="c.componentId"
                  class="embed-item"
                  :class="{ active: embedSelected && embedSelected.componentId === c.componentId }"
                  @click="selectEmbedComponent(c)"
                >
                  <span class="embed-item-name">{{ c.name }}</span>
                  <span class="embed-item-id mono">{{ c.componentId }}</span>
                </div>
                <div v-if="!embedComponents.length" class="embed-empty">暂无可选组件</div>
              </div>
            </div>
            <div class="embed-col embed-col-cfg">
              <div class="embed-col-title">配置</div>
              <label class="embed-field">
                <span>目标视图</span>
                <select v-model="embedTargetView" class="embed-select" @change="onEmbedViewChange">
                  <option v-for="v in embedViews" :key="v.viewName" :value="v.viewName">
                    {{ v.viewName }}（{{ v.pageName }}）
                  </option>
                </select>
              </label>
              <label class="embed-field">
                <span>插入位置</span>
                <select v-model="embedTargetPos" class="embed-select">
                  <option v-for="o in embedPosOptions()" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </option>
                </select>
              </label>
              <button class="btn primary" :disabled="!embedSelected || embedSaving" @click="addEmbed">
                添加到视图
              </button>
              <div class="embed-col-title" style="margin-top:14px;">已嵌入</div>
              <div v-if="!embedCurrent.length" class="embed-empty">尚未嵌入任何组件</div>
              <div v-else class="embed-cur">
                <div v-for="(e, i) in embedCurrent" :key="e.slotKey" class="embed-cur-item">
                  <span class="mono">{{ e.componentId }}</span>
                  <span class="embed-cur-view">→ {{ e.view }} · {{ embedPosLabel(e) }}</span>
                  <button class="btn text danger" @click="removeEmbed(i)">移除</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="embed-foot">
          <button class="btn" @click="closeEmbedPanel">取消</button>
          <button class="btn primary" :disabled="embedSaving" @click="saveEmbeds">
            {{ embedSaving ? '保存中…' : '保存并重新生成' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, getCurrentInstance } from 'vue'
import { message } from 'ant-design-vue'
import { getAuthToken } from '@/utils/api-token'
import { loadGeneratedVue, applyScopeToPreviewStyles } from '@/utils/loadGeneratedVue'
import { loadVue3FromWorkspace } from '@/utils/loadVue3Runtime.js'
import { API_BINDING_REFRESH_EVENT } from '@/composables/useApiBindingBridge'

// 捕获当前组件实例（用于把 workspace 组件全局注册到预览 app 的组件表）
const vm = getCurrentInstance()

/**
 * 项目级管线实验台（v3 / M1 = S0 扫描 + S2 契约冻结）
 *
 * 🔴 本页刻意不挂任何导航入口（与 /pipeline-lab、/generator/components-test 同做法）。
 *    后端 /api/v3/project 由 ProjectDevOnlyGuard 把控；模块在 app.module.ts 里
 *    按 isV3ProjectExposed() 条件注册 —— 生产环境连路由都不存在。
 *
 * 🔴 裸 fetch 必须显式带 Token：后端 `req.session` 只由守卫（SessionGuard /
 *    OptionalSessionGuard）从 `headers['token']` 建立，本仓没有全局 session 中间件。
 */
const apiBase = '/api/v3/project'
const LS_KEY = 'mvgo.projectLab.dir'

function authHeaders(extra = {}) {
  const headers = { ...extra }
  const token = getAuthToken()
  if (token) headers.Token = token
  return headers
}

/**
 * 🔴 护栏：后端挂住时裸 fetch 会永久 pending，页面表现为「按钮一直灰着但毫无反馈」。
 *    用 AbortController + 定时器兜底；默认 180s（宽松，避免误杀本来就慢的正常请求），
 *    可用 opts.timeoutMs 逐调用覆盖；opts.signal 允许调用方自行取消。
 *    第 4 个参数为可选，所有旧调用点不传即保持原行为（向后兼容）。
 *    超时抛出的 Error 带 code === 'TIMEOUT'，调用方可据此区分「卡住」与后端明确报错。
 */
async function request(method, url, body, opts = {}) {
  const timeoutMs = opts.timeoutMs === undefined ? 180000 : opts.timeoutMs
  const init = { method, headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}) }
  if (body) init.body = JSON.stringify(body)

  const controller = new AbortController()
  const extSignal = opts.signal
  const onExtAbort = () => controller.abort()
  if (extSignal) {
    if (extSignal.aborted) controller.abort()
    else extSignal.addEventListener('abort', onExtAbort, { once: true })
  }
  init.signal = controller.signal

  let timedOut = false
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
      : null

  try {
    const res = await fetch(apiBase + url, init)
    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { message: text }
    }
    if (!res.ok) {
      const raw = data && (data.message || data.error)
      const msg = Array.isArray(raw) ? raw.join('；') : String(raw || `HTTP ${res.status}`)
      throw new Error(msg)
    }
    // 🔴 全局 ResponseEnvelopeInterceptor（src/common/response-envelope.interceptor.ts）会把
    //    controller 的返回值**再包一层**：
    //      { success, code, message, data: <controller 返回值>, source: 'node' }
    //    而 controller 自己也返回了 { success:true, ...payload } —— 所以真正的业务字段在
    //    `外层.data` 里。不剥这一层，r.inspect / r.runs / r.run / r.artifact / r.freeze
    //    全部是 undefined（页面表现为接口成功但一片空白，且没有任何报错）。
    //    三个特征同时成立才剥（success+code+data+source 是信封独有形），避免误剥业务自带的 data 字段。
    if (data && typeof data === 'object' && 'data' in data && 'code' in data && 'source' in data) {
      return data.data
    }
    return data
  } catch (e) {
    if (timedOut) {
      const err = new Error(
        `请求超时（${Math.round(timeoutMs / 1000)}s）：${method} ${url} —— 后端可能仍在处理或已挂起`
      )
      err.code = 'TIMEOUT'
      throw err
    }
    throw e
  } finally {
    if (timer) clearTimeout(timer)
    if (extSignal) extSignal.removeEventListener('abort', onExtAbort)
  }
}

/* ═══════════════════ 状态 ═══════════════════ */
const projectDir = ref(localStorage.getItem(LS_KEY) || '')
const health = ref(null)
const healthErr = ref('')
const healthLoading = ref(false)

const inspect = ref(null)
const inspectErr = ref('')
const inspecting = ref(false)

const run = ref(null)
const scanErr = ref('')
const scanning = ref(false)
// 扫描已耗时（秒），scanning 为真时在按钮旁展示，供用户判断「正常等待 / 卡死」
const scanElapsed = ref(0)
let scanTimer = null
function startScanTimer() {
  stopScanTimer()
  scanElapsed.value = 0
  const t0 = Date.now()
  scanTimer = setInterval(() => {
    scanElapsed.value = Math.floor((Date.now() - t0) / 1000)
  }, 1000)
}
function stopScanTimer() {
  if (scanTimer) {
    clearInterval(scanTimer)
    scanTimer = null
  }
}

const blocks = ref([])
const loadingConflicts = ref(false)

const decisionForm = ref({}) // id -> { choice, note }
const EMPTY_FORM = { choice: '', note: '' }
const savingId = ref('')
const decisionErr = ref('')

const freezeResult = ref(null)
const freezeErr = ref('')
const freezing = ref(false)

/* S3 代码生成 */
const genResult = ref(null)
const genErr = ref('')
const genLoading = ref(false)

const artifact = ref(null)
const artName = ref('')
const artErr = ref('')
const artLoading = ref(false)

const runs = ref([])
const runsErr = ref('')
const runsLoading = ref(false)

/* 删除运行（破坏性 → 必须二次确认；delTarget 非空 = 确认框开着） */
const delTarget = ref(null)
const delBusy = ref(false)
const delErr = ref('')

/* 选目录：系统对话框 + 内置目录浏览器（兜底） */
const picking = ref(false)
const pickHint = ref('')
const pickHintIsError = ref(false)
const EMPTY_BROWSER = { open: false, loading: false, path: '', parent: null, data: null, err: '' }
const browser = ref({ ...EMPTY_BROWSER })

/* S4 真·Vue 页面预览（运行时编译渲染，非源码查看） */
const genVueFiles = ref([]) // [{ rel, name }]
const genVueLoading = ref(false)
const genVueErr = ref('')
const previewTarget = ref(null) // { runId, rel }
const previewComp = ref(null)
const previewErr = ref('')
const previewLoading = ref(false)
const previewScopeKey = ref('')

/* S4 组件嵌入（把已发布 workspace 组件插入 S4 页面，复用 vcf 扫描的组件清单） */
const embedPanelOpen = ref(false)
const embedLoading = ref(false)
const embedSaving = ref(false)
const embedErr = ref('')
const embedComponents = ref([]) // 候选 workspace 组件（来自 /api/component/list）
const embedViews = ref([]) // [{ viewName, pageName }]
const embedCurrent = ref([]) // 本运行已嵌入项 [{ view, componentId, groupId, slotKey }]
const embedSelected = ref(null) // 选中的待插入组件 { componentId, groupId, name }
const embedTargetView = ref('')
const embedTargetPos = ref(null) // 插入位置：第 pos 个区块之前；= 区块数 表示末尾

/** 目标视图可插入区块（来自 s4-meta 的 blocks）→ 下拉选项；末尾为区块数 */
function embedPosOptions() {
  const v = embedViews.value.find((x) => x.viewName === embedTargetView.value)
  const blocks = (v && v.blocks) || []
  const opts = blocks.map((b, i) => ({
    value: i,
    label: `在「${b.hint || b.tag}」之前`,
  }))
  opts.push({ value: blocks.length, label: '末尾（最后一个区块之后）' })
  return opts
}

/** 已嵌入项的位置可读标签 */
function embedPosLabel(e) {
  const v = embedViews.value.find((x) => x.viewName === e.view)
  const blocks = (v && v.blocks) || []
  const n = blocks.length
  if (typeof e.pos !== 'number' || e.pos >= n) return '末尾'
  const b = blocks[e.pos]
  return b ? `在「${b.hint || b.tag}」之前` : '末尾'
}

/** 切换目标视图时，插入位置回落到末尾 */
function onEmbedViewChange() {
  const v = embedViews.value.find((x) => x.viewName === embedTargetView.value)
  const n = (v && v.blocks ? v.blocks.length : 0)
  embedTargetPos.value = n
}

/* ═══════════════════ 计算 ═══════════════════ */
const shortMd5 = computed(() => (health.value?.scanner?.md5 || '').slice(0, 8) || '缺失')

const gateClass = computed(() => {
  const g = run.value?.s0?.gate
  return g === 'PASS' ? 'ok' : g ? 'bad' : ''
})

const frozenOk = computed(() => run.value?.frozen === true)

const readonlyText = computed(() => {
  const r = run.value?.s0?.readOnly
  if (!r) return '—'
  return r.changed === 0 ? 'changed=0' : `changed=${r.changed}`
})

const readonlyClass = computed(() => {
  const r = run.value?.s0?.readOnly
  if (!r) return ''
  return r.changed === 0 ? 'ok' : 'bad'
})

const slots = computed(() => {
  const s0 = run.value?.s0
  if (!s0) return []
  return [
    { key: 'docs', found: !!s0.docs?.found },
    { key: 'html', found: !!s0.html?.found },
    { key: 'frontend', found: !!s0.frontend?.found },
    { key: 'backend', found: !!s0.backend?.found },
    { key: 'projectJson', found: !!s0.projectJson?.found },
    { key: 'git', found: !!s0.git?.found }
  ]
})

const existArtifacts = computed(() => (run.value?.artifacts || []).filter((a) => a.exists))
const openableArtifacts = computed(() => existArtifacts.value)

const sourceStats = computed(() => {
  const src = run.value?.s1?.sources
  if (!src) return {}
  const out = {}
  for (const [k, v] of Object.entries(src)) {
    if (!v || typeof v !== 'object') continue
    if (typeof v.endpoints === 'number') out[k] = `${v.endpoints} 端点`
    else if (Array.isArray(v.files)) out[k] = `${v.files.length} 文件`
  }
  return out
})

const envelopeConfirmed = computed(() => run.value?.s1?.envelope?.confirmed === true)

const envelopeText = computed(() => {
  const e = run.value?.s1?.envelope
  if (!e) return '—'
  const keys = (e.keys || []).join(' / ') || '未探测到'
  return `${keys}　来源 ${e.source || '—'}　successCode ${e.successCode ?? '未定'}`
})

const decidedMap = computed(() => {
  const m = {}
  for (const d of run.value?.decisions || []) m[d.conflictId] = d
  return m
})

const allIds = computed(() => {
  if (!run.value) return []
  const ids = []
  for (const c of run.value.conflicts || []) if (c.id) ids.push(c.id)
  for (const g of run.value.gaps || []) if (g.id) ids.push(g.id)
  return [...new Set(ids)]
})

const pendingCount = computed(() => {
  const decided = decidedMap.value
  return allIds.value.filter((id) => !decided[id]).length
})

const pendingItems = computed(() => {
  const f = freezeResult.value
  if (!f || !f.pending) return []
  const out = []
  for (const c of f.pending.conflicts || []) out.push({ id: c.id, isGap: false })
  for (const g of f.pending.gaps || []) out.push({ id: g.id, isGap: true, severity: g.severity })
  return out
})

/** 内置目录浏览器当前层要渲染的条目（起始位置那一层是「候选入口」，形状一致） */
const browserEntries = computed(() => browser.value.data?.entries || [])

/* ═══════════════════ 工具 ═══════════════════ */
function fmtBytes(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / 1024 / 1024).toFixed(2)} MB`
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const p = (x) => String(x).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function formOf(id) {
  return decisionForm.value[id] || EMPTY_FORM
}

function decisionOf(id) {
  if (!id) return null
  return decidedMap.value[id] || null
}

function pickOption(id, letter) {
  const f = decisionForm.value[id]
  if (f) f.choice = letter
}

/* ═══════════════════ conflicts.md 解析 ═══════════════════ */
/**
 * 把 conflicts.md 里某个条目的原始行解析成「段」。
 *
 * 🔴 归一顺序是唯一判据来源（旧实现踩过的坑）：
 *   s0 扫描器写出的是「列表项 + 加粗标签」形态 —— `- **选项**：` / `- **现象**：`，
 *   而旧实现第一步就 `if (/^-\s+/)  → bullet → continue`，于是：
 *     ① 选项区开关 `/^选项[:：]/` 永远不命中（行首是 `- ` 和 `**`）
 *     ② 「现象/影响/证据」也永远不会渲染成标签
 *     ③ 生成器明确给出的 A/B/C 选项在 UI 上**完全消失**，裁决退化成瞎写输入框。
 *   ⇒ 正确顺序是：先剥「列表前缀 + 强调」得到语义行，再做分类。
 *   （`证据：` 这类无加粗、无前缀的写法同样要认，故标签判据作用在去强调后的整行上。）
 */
function parseSegs(lines) {
  const segs = []
  let inOptions = false
  const strip = (s) => String(s).replace(/`/g, '')
  for (const raw of lines) {
    const line = String(raw).replace(/\s+$/, '')
    if (!line.trim()) continue

    const bm = /^\s*-\s+(.*)$/.exec(line)
    const isItem = !!bm
    const item = (bm ? bm[1] : line).replace(/\*\*/g, '').trim()
    const lm = /^(选项|要你定|证据|现象|影响|未决项)\s*[:：]\s*(.*)$/.exec(item)

    // ① 选项区开关（`- **选项**：` 与裸 `选项：` 都认）
    if (lm && lm[1] === '选项') {
      inOptions = true
      segs.push({ kind: 'label', text: '选项' })
      continue
    }

    // ② 选项行：`A 文本` / `A. 文本` / `A、文本` / `A：文本`；只在选项区内、且必须是列表项
    if (inOptions && isItem) {
      const om = /^([A-Z])[\s.、:：]+(.+)$/.exec(item)
      if (om) {
        segs.push({ kind: 'option', letter: om[1], text: strip(om[2]).trim() })
        continue
      }
    }

    // ③ 任何其他标签行（选项以外）都终止选项区，避免把普通列表项误当选项
    if (lm) inOptions = false

    // ④ 「要你定」提问行；冲突条目把选项写在行内（`请选 A（…）/ B（…）/ C（…）`）也一并抽出
    if (lm && lm[1] === '要你定') {
      segs.push({ kind: 'ask', text: strip(lm[2]) })
      const inline = /([A-Z])[（(]([^）)]+)[）)]/g
      let im
      while ((im = inline.exec(item))) {
        segs.push({ kind: 'option', letter: im[1], text: im[2].trim() })
      }
      continue
    }

    if (lm) {
      segs.push({ kind: 'label', text: strip(item) })
      continue
    }

    segs.push({ kind: isItem ? 'bullet' : 'text', text: strip(item) })
  }
  return segs
}

function parseBlocks(md) {
  const lines = String(md || '').split('\n')
  const out = []
  let cur = null
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      cur = null
      continue
    }
    const gap = /^###\s+(GAP-[A-Z0-9-]+)\s*（(blocker|major|warn|info)）\s*(.*)$/.exec(line)
    if (gap) {
      cur = { kind: 'gap', id: gap[1], severity: gap[2], title: gap[3].trim() || gap[1], raw: [] }
      out.push(cur)
      continue
    }
    const cf = /^###\s+(\d+)\.\s+(.*?)`(CF-[A-Z0-9-]+)`\s*$/.exec(line)
    if (cf) {
      cur = { kind: 'conflict', id: cf[3], index: Number(cf[1]), title: cf[2].trim(), raw: [] }
      out.push(cur)
      continue
    }
    const c2 = /^###\s+(\d+)\.\s+(.*)$/.exec(line)
    if (c2) {
      // 没有反引号 id 的条目：id 留空，绝不编造
      cur = { kind: 'conflict', id: '', index: Number(c2[1]), title: c2[2].trim(), raw: [] }
      out.push(cur)
      continue
    }
    if (cur) cur.raw.push(line)
  }
  return out.map((b) => {
    const segs = parseSegs(b.raw)
    const options = segs
      .filter((s) => s.kind === 'option')
      .map((s) => ({ letter: s.letter, text: s.text, short: s.text.slice(0, 18) }))
    return {
      kind: b.kind,
      id: b.id,
      index: b.index,
      severity: b.severity || '',
      title: b.title,
      segs,
      options
    }
  })
}

/* ═══════════════════ 动作 ═══════════════════ */
async function loadHealth() {
  healthLoading.value = true
  healthErr.value = ''
  try {
    health.value = await request('GET', '/health')
  } catch (e) {
    healthErr.value = e.message
    health.value = null
  } finally {
    healthLoading.value = false
  }
}

async function loadRuns() {
  runsLoading.value = true
  runsErr.value = ''
  try {
    const r = await request('GET', '/runs')
    runs.value = r.runs || []
  } catch (e) {
    runsErr.value = e.message
  } finally {
    runsLoading.value = false
  }
}

/* ═══════════════════ 删除运行（二次确认） ═══════════════════ */

/** 第一步只「打开确认框」，绝不直接删 —— 破坏性操作必须先过二次确认 */
function askDeleteRun(r) {
  delTarget.value = r
  delErr.value = ''
}

function closeDeleteConfirm() {
  if (delBusy.value) return
  delTarget.value = null
  delErr.value = ''
}

/**
 * 第二步：确认后才真删。删除范围 = 该运行的整个运行目录（历史记录 + 全部产物）。
 * 删完刷新列表；若删的正是当前查看的运行，详情区一并清空，避免读到已不存在的产物。
 */
async function confirmDeleteRun() {
  if (!delTarget.value || delBusy.value) return
  const runId = delTarget.value.runId
  delBusy.value = true
  delErr.value = ''
  try {
    const r = await request('DELETE', `/runs/${encodeURIComponent(runId)}`)
    message.success(`已删除 ${runId}${r && r.bytes ? `，释放 ${fmtBytes(r.bytes)}` : ''}`)
    if (run.value && run.value.runId === runId) {
      run.value = null
      blocks.value = []
      decisionForm.value = {}
      artifact.value = null
      artName.value = ''
      freezeResult.value = null
      featTarget.value = null
    }
    delTarget.value = null
    await loadRuns()
  } catch (e) {
    delErr.value = `删除失败：${e.message}`
  } finally {
    delBusy.value = false
  }
}

/* 功能 tag 详情（点击简介卡片里的功能 chip → 展开 功能简介/相关接口/页面开发需求/原型截图/覆盖比对） */
const featTarget = ref(null)
const featDetail = computed(() => {
  if (!featTarget.value || !run.value?.featureDetails) return null
  return run.value.featureDetails[featTarget.value] || null
})
// 截图 dataUrl 缓存（按产物名 → base64），跨功能复用，避免重复拉取
const shotUrls = ref({})
// 🔴 不再静默吞错：分别记录「加载中 / 失败」，让界面能区分「无图 / 加载中 / 加载失败」
const shotLoading = ref({})
const shotErrors = ref({})
const featShots = computed(() => {
  const d = featDetail.value
  if (!d?.shots || !d.shots.length) return []
  return d.shots.map((s) => ({
    name: s,
    url: shotUrls.value[s] || '',
    status: shotErrors.value[s] ? 'error' : shotUrls.value[s] ? 'ok' : 'loading',
  }))
})
// 收集当前功能下所有接口（真实 + 建议）的视觉定位框（L2），供截图叠加画框
const featVisionBoxes = computed(() => {
  const d = featDetail.value
  if (!d) return []
  const eps = [...(d.relatedEndpoints || []), ...(d.suggestedEndpoints || [])]
  const seen = new Set()
  const out = []
  for (const e of eps) {
    if (e?.visionBox && !seen.has(e.visionBox.action)) {
      seen.add(e.visionBox.action)
      out.push(e.visionBox)
    }
  }
  return out
})
function covLabel(status) {
  if (status === 'covered') return '已覆盖'
  if (status === 'partial') return '部分命中'
  if (status === 'missing') return '疑似缺失'
  return status
}
async function loadShotsForFeature(d) {
  if (!d?.shots || !d.shots.length || !run.value?.runId) return
  const runId = run.value.runId
  for (const name of d.shots) {
    // 已成功 / 已失败 / 加载中 → 跳过，避免重复请求
    if (shotUrls.value[name] || shotErrors.value[name] || shotLoading.value[name]) continue
    shotLoading.value = { ...shotLoading.value, [name]: true }
    try {
      const r = await request('GET', `/runs/${encodeURIComponent(runId)}/artifact?name=${encodeURIComponent(name)}`)
      const url = r?.artifact?.dataUrl
      if (url) {
        shotUrls.value = { ...shotUrls.value, [name]: url }
      } else {
        // 接口返回成功但无 dataUrl（异常）→ 记为失败，界面提示而非静默消失
        shotErrors.value = { ...shotErrors.value, [name]: true }
      }
    } catch (err) {
      // 🔴 不再吞错：404 / 网络错误明确标记，并打印日志便于排查
      shotErrors.value = { ...shotErrors.value, [name]: true }
      console.warn('[project-lab] 原型截图加载失败：', name, err)
    } finally {
      const next = { ...shotLoading.value }
      delete next[name]
      shotLoading.value = next
    }
  }
}
function openFeature(f) {
  featTarget.value = f
  const d = run.value?.featureDetails?.[f]
  if (d) loadShotsForFeature(d)
}
function closeFeature() {
  featTarget.value = null
}

/* ═══════════════════ 选目录（系统对话框 + 内置浏览器） ═══════════════════ */

/**
 * 打开**系统原生**「选择文件夹」窗口（由后端进程拉起，所以拿到的是本机绝对路径）。
 *
 * 🔴 三级退路，任何一步都不该让用户落到「只能手输路径」：
 *   ① ok        → 填进输入框 + 存 localStorage + 自动体检
 *   ② cancelled → 静默（用户自己点的取消，不该弹提示打扰）
 *   ③ 其它      → 说明原因 + **自动**切到内置目录浏览器，流程不断
 *   （浏览器拿不到本机绝对路径：File System Access API 只给句柄不给路径，
 *     而扫描器是按路径读盘的 —— 所以「在电脑里选」只能由后端拉系统窗口实现。）
 */
async function pickDirectory() {
  if (picking.value) return
  picking.value = true
  pickHint.value = ''
  pickHintIsError.value = false
  try {
    const r = await request('POST', '/pick-dir', {
      projectDir: projectDir.value.trim() || undefined,
    })
    if (r.ok && r.path) {
      projectDir.value = r.path
      localStorage.setItem(LS_KEY, r.path)
      pickHint.value = `已选中：${r.path}`
      message.success('目录已选中')
      await doInspect()
      return
    }
    if (r.cancelled) {
      pickHint.value = '已取消选择。'
      return
    }
    pickHintIsError.value = true
    pickHint.value = `${r.reason || '系统目录窗口不可用'} —— 已切到内置目录浏览器。`
    await openBrowser(projectDir.value.trim())
  } catch (e) {
    pickHintIsError.value = true
    pickHint.value = `拉起系统目录窗口失败：${e.message} —— 已切到内置目录浏览器。`
    await openBrowser(projectDir.value.trim())
  } finally {
    picking.value = false
  }
}

/** 打开内置目录浏览器。startPath 无效时自动退回「起始位置」 */
async function openBrowser(startPath) {
  const start = String(startPath || '').trim()
  browser.value = { ...EMPTY_BROWSER, open: true, loading: true }
  if (start) {
    await browseTo(start)
    if (!browser.value.err) return
  }
  await browseTo('')
}

/** 进入某层目录；p 为空 → 回到「起始位置」候选 */
async function browseTo(p) {
  browser.value = { ...browser.value, open: true, loading: true, err: '' }
  try {
    const r = await request('GET', `/browse-dir?path=${encodeURIComponent(p || '')}`)
    browser.value = {
      open: true,
      loading: false,
      path: r.browse.path || '',
      parent: r.browse.parent || null,
      data: r.browse,
      err: '',
    }
  } catch (e) {
    browser.value = { ...browser.value, loading: false, err: e.message }
  }
}

function closeBrowser() {
  browser.value = { ...EMPTY_BROWSER }
}

async function confirmBrowser() {
  const p = browser.value.path
  if (!p) return
  projectDir.value = p
  localStorage.setItem(LS_KEY, p)
  closeBrowser()
  pickHint.value = `已选中：${p}`
  pickHintIsError.value = false
  await doInspect()
}

async function doInspect() {
  const dir = projectDir.value.trim()
  if (!dir) return
  inspecting.value = true
  inspectErr.value = ''
  scanErr.value = ''
  try {
    localStorage.setItem(LS_KEY, dir)
    const r = await request('POST', '/inspect', { projectDir: dir })
    inspect.value = r.inspect
  } catch (e) {
    inspect.value = null
    inspectErr.value = e.message
  } finally {
    inspecting.value = false
  }
}

async function doScan() {
  // 🔴 重入守卫：按钮 disabled 要等 Vue flush 才生效，快速连点会触发并发扫描，
  //    而后端每个请求都新建 runId 跑完整重算，会成倍拖慢（与 pickDirectory 写法一致）。
  if (scanning.value) return
  const dir = projectDir.value.trim()
  if (!dir) return
  scanning.value = true
  scanErr.value = ''
  inspectErr.value = ''
  startScanTimer()
  try {
    localStorage.setItem(LS_KEY, dir)
    const resp = await request('POST', '/scan', { projectDir: dir })
    run.value = resp
    freezeResult.value = null
    freezeErr.value = ''
    artifact.value = null
    artName.value = ''
    decisionErr.value = ''
    message.success(
      `S0 完成：${resp.endpoints.total} 端点 / ${resp.conflicts.length} 冲突 / ${resp.gaps.length} 缺口`
    )
    await loadConflictsDoc(resp.runId)
    await loadRuns()
  } catch (e) {
    // 超时场景明确提示可能是后端仍在处理/已挂起，按钮恢复可点即可重试
    scanErr.value =
      e.code === 'TIMEOUT'
        ? `${e.message}。可点击「开始扫描」重试。`
        : e.message
  } finally {
    stopScanTimer()
    scanning.value = false
  }
}

/** 读 conflicts.md 并切成可裁决的块（缺口 / 冲突各一类） */
async function loadConflictsDoc(runId) {
  if (!runId) return
  loadingConflicts.value = true
  decisionErr.value = ''
  try {
    const r = await request(
      'GET',
      `/runs/${runId}/artifact?name=${encodeURIComponent('spec/conflicts.md')}`
    )
    blocks.value = parseBlocks(r.artifact.content)
    const decided = decidedMap.value
    const form = {}
    for (const b of blocks.value) {
      if (!b.id) continue
      const d = decided[b.id]
      form[b.id] = d ? { choice: d.choice, note: d.note || '' } : { choice: '', note: '' }
    }
    decisionForm.value = form
  } catch (e) {
    decisionErr.value = `conflicts.md 读取失败：${e.message}`
  } finally {
    loadingConflicts.value = false
  }
}

/** 重新拉单次运行视图（裁决/冻结后刷新统计），再重建裁决表单 */
async function refreshRun(runId) {
  if (!runId) return
  const r = await request('GET', `/runs/${runId}`)
  run.value = r.run
  await loadConflictsDoc(runId)
}

async function submitDecision(b) {
  if (!run.value || !b.id) return
  const f = formOf(b.id)
  const choice = f.choice.trim()
  if (!choice) return
  savingId.value = b.id
  decisionErr.value = ''
  try {
    await request('POST', '/decisions', {
      runId: run.value.runId,
      entries: [{ conflictId: b.id, choice, note: f.note.trim() }]
    })
    message.success(`已记录裁决 ${b.id} = ${choice}`)
    await refreshRun(run.value.runId)
  } catch (e) {
    decisionErr.value = e.message
  } finally {
    savingId.value = ''
  }
}

async function doFreeze() {
  if (!run.value) return
  freezing.value = true
  freezeErr.value = ''
  try {
    const r = await request('POST', '/freeze', { runId: run.value.runId })
    freezeResult.value = r.freeze
    if (r.freeze.allChecksOk) {
      message.success(
        `S2 冻结完成：${r.freeze.openapi.pathCount} path / ${r.freeze.openapi.operationCount} operation`
      )
    } else {
      message.warning('S2 已产出，但有判据未通过 —— 见下方检查清单')
    }
    await refreshRun(run.value.runId)
    await openArtifact('spec/openapi.local.yaml')
    await loadRuns()
  } catch (e) {
    freezeErr.value = e.message
  } finally {
    freezing.value = false
  }
}

async function openArtifact(name) {
  if (!run.value || !name) return
  artName.value = name
  artLoading.value = true
  artErr.value = ''
  try {
    const r = await request(
      'GET',
      `/runs/${run.value.runId}/artifact?name=${encodeURIComponent(name)}`
    )
    artifact.value = r.artifact
  } catch (e) {
    artifact.value = null
    artErr.value = e.message
  } finally {
    artLoading.value = false
  }
}

/** 下载当前查看的文本产物（含 generated/ 下的生成文件） */
function downloadArtifact() {
  if (!artifact.value || artifact.value.isImage) return
  const content = artifact.value.content || ''
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (artifact.value.name || 'artifact').split('/').pop() || 'artifact.txt'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}

/** S3 代码生成：调用后端确定性生成前后端骨架 */
async function doGenerate() {
  if (!run.value) return
  genLoading.value = true
  genErr.value = ''
  try {
    const r = await request('POST', '/generate', { runId: run.value.runId })
    genResult.value = r.generate
    message.success(
      `S3 生成完成：${r.generate.summary.backendControllers} 控制器 / ${r.generate.summary.frontendApis} API`
    )
    await refreshRun(run.value.runId)
  } catch (e) {
    genErr.value = e.message
  } finally {
    genLoading.value = false
  }
}

/** S4 真·Vue 页面重新生成（把接口绑定侧车烘焙进 GenView 产物） */
async function doGenerateVue() {
  if (!run.value) return
  genVueLoading.value = true
  try {
    const r = await request('POST', '/generate-vue', { runId: run.value.runId })
    const pages = (r.generateVue && r.generateVue.summary && r.generateVue.summary.pages) || 0
    message.success(`S4 页面重新生成完成：${pages} 个页面`)
    await refreshRun(run.value.runId)
  } catch (e) {
    message.error('S4 重新生成失败：' + e.message)
  } finally {
    genVueLoading.value = false
  }
}

/** 监听全局「接口对接完成」事件：S4 绑定保存后，重新生成并刷新预览 */
async function onApiBindingRefresh() {
  if (!previewTarget.value) return
  const rel = previewTarget.value.rel
  await doGenerateVue()
  await openGenVuePreview(rel)
}

/** 打包下载 generated/ 全部文件（zip） */
async function downloadGeneratedZip(runId) {
  try {
    const url = `${apiBase}/runs/${encodeURIComponent(runId)}/generated-zip`
    const res = await fetch(url, { method: 'GET', credentials: 'include' })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const t = await res.text()
        if (t) msg = t
      } catch {
        /* keep */
      }
      throw new Error(msg)
    }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `generated-${runId}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
    message.success('已打包下载 generated.zip')
  } catch (e) {
    message.error('打包下载失败：' + e.message)
  }
}

/** S4：列出某 run 的 generated/frontend/src/views/*.vue 页面清单 */
async function loadGenVueList() {
  if (!run.value) return
  genVueLoading.value = true
  genVueErr.value = ''
  try {
    const r = await request('GET', `/runs/${run.value.runId}/generated-files`)
    const files = (r.files || []).filter((f) => /^frontend\/src\/views\/.*\.vue$/.test(f))
    genVueFiles.value = files.map((f) => ({
      rel: f.replace(/^frontend\/src\/views\//, ''),
      name: f.split('/').pop(),
    }))
  } catch (e) {
    genVueErr.value = e.message
  } finally {
    genVueLoading.value = false
  }
}

/**
 * S4 组件嵌入：在挂载 S4 页面前，把本视图嵌入的 workspace 组件编译并全局注册到预览 app。
 * 这样 S4 沙箱模板里的 <componentId /> 能通过 resolveComponent 解析到真实组件
 * （vue3-sfc-loader 编译的组件在宿主 app 上下文里渲染，全局注册即生效）。
 */
async function resolveEmbedComponents(runId, rel) {
  const viewName = (rel.match(/([A-Za-z0-9_]+)\.vue$/) || [])[1] || ''
  const app = vm?.appContext?.app
  if (!app) return
  let embeds = []
  try {
    const r = await request('GET', `/runs/${runId}/embeds`)
    embeds = (r && r.embeds) || []
  } catch {
    embeds = []
  }
  const forView = embeds.filter((e) => e.view === viewName)
  for (const e of forView) {
    const name = e.componentId
    if (!name) continue
    if (app.component(name)) continue // 已注册则跳过（幂等，避免重复编译）
    try {
      const def = await loadVue3FromWorkspace(name, {
        instance: app,
        explicitGroupId: e.groupId || null,
      })
      app.component(name, def)
    } catch (err) {
      console.warn(`[S4-Embed] 加载 workspace 组件失败 ${name}:`, err?.message || err)
      embedErr.value = `组件「${name}」加载失败（可能本地无源码或 groupId 不匹配）：` + (err?.message || err)
    }
  }
}

/** S4：运行时编译并渲染一个 GenView 页面（弹窗内挂载） */
async function openGenVuePreview(rel) {
  if (!run.value) return
  previewTarget.value = { runId: run.value.runId, rel }
  previewComp.value = null
  previewErr.value = ''
  previewLoading.value = true
  previewScopeKey.value = 'genvue-' + Math.random().toString(36).slice(2, 9)
  try {
    // 先解析并全局注册本视图嵌入的 workspace 组件，再编译 S4 页面
    await resolveEmbedComponents(run.value.runId, rel)
    const comp = await loadGeneratedVue(run.value.runId, rel, { scopeKey: previewScopeKey.value })
    previewComp.value = comp
    // 组件挂载后补做样式作用域化（与外层容器 data-preview-scope 配合，避免全局泄漏）
    await nextTick()
    applyScopeToPreviewStyles(previewScopeKey.value)
  } catch (e) {
    previewErr.value = e && e.message ? e.message : String(e)
  } finally {
    previewLoading.value = false
  }
}

/** S4 接口绑定：从当前预览页取视图名 + 数据槽，打开全局 ApiBindingWizard（s4 模式） */
async function openS4Binding() {
  if (!previewTarget.value) return
  const runId = previewTarget.value.runId
  const rel = previewTarget.value.rel || ''
  const viewName = (rel.match(/([A-Za-z0-9_]+)\.vue$/) || [])[1] || ''
  if (!viewName) {
    message.warning('无法识别当前页面视图名')
    return
  }
  // 取该视图可绑定的数据槽 + 确定性自动接线（来自 generated/frontend/s4-meta.json）
  let dataRefs = []
  let autoBindings = []
  try {
    const meta = await request(
      'GET',
      `/runs/${runId}/artifact?name=${encodeURIComponent('generated/frontend/s4-meta.json')}`,
    )
    const content = meta && meta.artifact && meta.artifact.content
    if (content) {
      const parsed = JSON.parse(content)
      const v = (parsed.views || []).find((x) => x.viewName === viewName)
      dataRefs = (v && v.dataRefs) || []
      autoBindings = (v && v.autoBindings) || []
    }
  } catch (e) {
    // 容错：取不到 meta 也能打开向导（向导会从服务端兜底取 dataRefs）
  }
  // 复用全局向导（App 根级挂载），靠 postMessage 拉起；合成 componentId 含 runId + 视图名
  window.postMessage(
    {
      type: 'MVGO_OPEN_API_BINDING',
      componentId: `__s4__::${runId}::${viewName}`,
      groupId: '__s4__',
      componentName: viewName,
      mode: 's4',
      slots: dataRefs,
      autoBindings,
    },
    window.location.origin,
  )
}

/** S4 组件嵌入面板：拉取候选组件 + 当前嵌入项 + 视图清单 */
async function openEmbedPanel() {
  if (!previewTarget.value) return
  const runId = previewTarget.value.runId
  embedErr.value = ''
  embedPanelOpen.value = true
  embedLoading.value = true
  embedSelected.value = null
  embedTargetView.value = ''
  try {
    const [compRes, embRes] = await Promise.all([
      request('GET', '/api/component/list?scope=all&limit=200'),
      request('GET', `/runs/${runId}/embeds`),
    ])
    // component/list 经全局信封解包后得到 { success, data: [...] }
    const compData = compRes && compRes.data ? compRes.data : []
    embedComponents.value = (compData || []).map((c) => ({
      componentId: c.componentId,
      name: c.name || c.componentId,
      groupId: c.groupId,
    }))
    embedCurrent.value = (embRes && embRes.embeds) || []
    embedViews.value = (embRes && embRes.views) || []
    if (embedViews.value.length && !embedTargetView.value) {
      embedTargetView.value = embedViews.value[0].viewName
    }
    // 插入位置默认落到末尾（= 该视图区块数）
    const v0 = embedViews.value.find((x) => x.viewName === embedTargetView.value)
    embedTargetPos.value = v0 && v0.blocks ? v0.blocks.length : 0
  } catch (e) {
    embedErr.value = e.message
  } finally {
    embedLoading.value = false
  }
}

function selectEmbedComponent(c) {
  embedSelected.value = c
}

function addEmbed() {
  if (!embedSelected.value || !embedTargetView.value) {
    message.warning('请选择组件与目标视图')
    return
  }
  const sel = embedSelected.value
  const exists = embedCurrent.value.find(
    (e) => e.componentId === sel.componentId && e.view === embedTargetView.value,
  )
  if (exists) {
    message.info('该组件已嵌入此视图')
    return
  }
  embedCurrent.value.push({
    view: embedTargetView.value,
    componentId: sel.componentId,
    groupId: sel.groupId,
    slotKey: `embed-${sel.componentId}-${embedCurrent.value.length + 1}`,
    pos: typeof embedTargetPos.value === 'number' ? embedTargetPos.value : undefined,
  })
  embedSelected.value = null
}

function removeEmbed(idx) {
  embedCurrent.value.splice(idx, 1)
}

async function saveEmbeds() {
  if (!previewTarget.value) return
  const runId = previewTarget.value.runId
  embedSaving.value = true
  embedErr.value = ''
  try {
    await request('POST', `/runs/${runId}/embeds`, { embeds: embedCurrent.value })
    message.success(`已保存 ${embedCurrent.value.length} 个组件嵌入`)
    embedPanelOpen.value = false
    // 重新烘焙 S4 产物并刷新预览（openGenVuePreview 会重新解析并注册嵌入组件）
    await doGenerateVue()
    await openGenVuePreview(previewTarget.value.rel)
  } catch (e) {
    embedErr.value = e.message
  } finally {
    embedSaving.value = false
  }
}

function closeEmbedPanel() {
  embedPanelOpen.value = false
}

/** 关闭 S4 预览弹窗并清理注入的预览样式 */
function closeGenVuePreview() {
  previewTarget.value = null
  previewComp.value = null
  if (previewScopeKey.value) {
    document
      .querySelectorAll(`style[data-preview-style-scope="${previewScopeKey.value}"]`)
      .forEach((el) => el.remove())
    previewScopeKey.value = ''
  }
}

async function selectRun(runId) {
  if (!runId) return
  scanErr.value = ''
  freezeErr.value = ''
  freezeResult.value = null
  artifact.value = null
  artName.value = ''
  featTarget.value = null
  try {
    const r = await request('GET', `/runs/${runId}`)
    run.value = r.run
    if (r.run.projectDir) projectDir.value = r.run.projectDir
    await loadConflictsDoc(runId)
  } catch (e) {
    scanErr.value = e.message
  }
}

onMounted(() => {
  loadHealth()
  loadRuns()
  window.addEventListener(API_BINDING_REFRESH_EVENT, onApiBindingRefresh)
})

onUnmounted(() => {
  window.removeEventListener(API_BINDING_REFRESH_EVENT, onApiBindingRefresh)
  // 🔴 清理扫描计时器：防止组件卸载后 setInterval 继续跑（泄漏 + 卸载后 setState 警告）
  stopScanTimer()
})
</script>

<style scoped>
/* ══════════════════════════════════════════════════
   token 与 gen-v4 外壳同源（scoped 下变量挂在根元素上）
   ══════════════════════════════════════════════════ */
.unified-generate.gen-v4.project-lab {
  --c-primary: #2563eb;
  --c-primary-soft: #eff6ff;
  --c-danger: #dc2626;
  --c-warn: #d97706;
  --c-ok: #059669;
  --bg: #f5f7fa;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --surface-3: #f1f5f9;
  --border: #e5e7eb;
  --txt-1: #0f172a;
  --txt-2: #475569;
  --txt-3: #94a3b8;
  --r-sm: 6px;
  --r-md: 8px;
  --r-lg: 12px;
  --r-pill: 9999px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei',
    system-ui, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.08);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);

  box-sizing: border-box;
  min-height: 100%;
  padding: 20px 24px 56px;
  background: var(--bg);
  color: var(--txt-1);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.55;
}
.unified-generate.gen-v4.project-lab input {
  -webkit-user-select: text;
  user-select: text;
}
.lab {
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── 页头 ── */
.lab-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 2px 4px;
}
.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.2px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ver {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-primary);
  background: var(--c-primary-soft);
  border: 1px solid #bfdbfe;
  border-radius: var(--r-pill);
  padding: 1px 7px;
}
.page-sub {
  margin: 0 0 2px;
  color: var(--txt-2);
  font-size: 13.5px;
}
.page-sub-extra {
  margin: 0;
  color: var(--txt-3);
  font-size: 12px;
  font-family: var(--mono);
}
.head-actions {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
}

/* ── 按钮 ── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--txt-1);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.1s;
  white-space: nowrap;
}
.btn:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: #cbd5e1;
}
.btn:active:not(:disabled) {
  transform: translateY(1px);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.primary {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: #fff;
}
.btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}
.btn.ghost {
  background: transparent;
}
.btn.sm {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.btn.danger {
  border-color: var(--c-danger);
  color: var(--c-danger);
  background: var(--surface);
}
.btn.danger:hover:not(:disabled) {
  background: var(--c-danger);
  border-color: var(--c-danger);
  color: #fff;
}

/* ── 自检条 ── */
.health {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 9px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 12.5px;
}
.health.is-ok {
  border-color: #a7f3d0;
  background: #ecfdf5;
}
.health.is-bad {
  border-color: #fecaca;
  background: #fef2f2;
}
.health .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-ok);
  flex: 0 0 auto;
}
.health.is-bad .dot {
  background: var(--c-danger);
}
.h-txt {
  color: var(--txt-2);
}
.h-txt b {
  color: var(--txt-1);
}
.h-txt .sep {
  margin: 0 4px;
  color: var(--txt-3);
}
.h-meta {
  color: var(--txt-2);
  font-size: 11.5px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
}
.h-meta em {
  font-style: normal;
  margin-left: 4px;
}

/* ── 状态条 ── */
.statusbar {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.sb {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.sb.grow {
  flex: 1 1 auto;
}
.sb-k {
  font-size: 11px;
  color: var(--txt-3);
  white-space: nowrap;
}
.sb-v {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--txt-1);
  white-space: nowrap;
}

/* ── 卡片 ── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 16px 18px 18px;
  box-shadow: var(--shadow-sm);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.card-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.no {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #94a3b8;
}
.no.done {
  background: var(--c-ok);
}
.no.ghost {
  background: var(--surface-3);
  color: var(--txt-2);
}
.hint {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--txt-3);
  text-align: right;
  max-width: 62%;
}
.hint code {
  font-family: var(--mono);
  background: var(--surface-3);
  padding: 1px 4px;
  border-radius: 3px;
}

/* ── 项目简介（S0 派生的人读摘要，显示在 STEP 2 顶部） ── */
.brief {
  margin-bottom: 16px;
  padding: 13px 16px 14px;
  border: 1px solid var(--border);
  border-left: 3px solid #2563eb;
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.brief-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.brief-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--txt-1);
  letter-spacing: 0.2px;
}
.brief-tag {
  padding: 2px 9px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--txt-3);
  font-size: 10.5px;
  white-space: nowrap;
}
.brief-desc {
  margin: 7px 0 0;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--txt-3);
}
.brief-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}
.brief-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.brief-k {
  flex: 0 0 32px;
  font-size: 11.5px;
  color: var(--txt-3);
}
.brief-v {
  font-size: 12.5px;
  color: var(--txt-1);
  word-break: break-all;
}
.brief-src {
  margin-left: 4px;
  font-size: 10.5px;
  color: var(--txt-3);
}

/* ── 路径输入 ── */
.path-row {
  display: flex;
  gap: 8px;
}
.path-input {
  flex: 1 1 auto;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
  font-size: 12.5px;
  color: var(--txt-1);
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.path-input:focus {
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  background: #fff;
}

/* 主入口：优先「点」，粘贴路径只是补充 */
.btn.pick {
  background: var(--c-primary-soft);
  border-color: #bfdbfe;
  color: #1d4ed8;
  padding: 0 16px;
}
.btn.pick:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #93c5fd;
}
.btn.pick .ico {
  font-size: 14px;
  line-height: 1;
}

/* 提示行 + 「在页面内浏览」入口 */
.path-side {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
  min-height: 18px;
}
.pick-hint {
  font-size: 12px;
  color: var(--txt-2);
  min-width: 0;
  overflow-wrap: anywhere;
}
.pick-hint.bad {
  color: #b45309;
}
.scan-elapsed {
  font-size: 12px;
  color: var(--txt-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.link {
  border: 0;
  border-bottom: 1px dashed currentColor;
  background: none;
  padding: 0;
  font-size: 12px;
  color: var(--c-primary);
  cursor: pointer;
}
.link:hover {
  color: #1d4ed8;
}

/* ── 内置目录浏览器（系统窗口不可用时的兜底） ── */
.browser-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
}
.browser {
  display: flex;
  flex-direction: column;
  width: min(680px, 100%);
  max-height: min(78vh, 720px);
  background: var(--surface);
  border-radius: var(--r-lg);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.22);
  overflow: hidden;
}
.browser-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 11px;
  border-bottom: 1px solid var(--surface-3);
}
.browser-head h3 {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  color: var(--txt-1);
  white-space: nowrap;
}
.browser-sub {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11.5px;
  color: var(--txt-3);
}
.browser-head .x {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--txt-3);
  font-size: 13px;
  cursor: pointer;
}
.browser-head .x:hover {
  background: var(--surface-3);
  color: var(--txt-1);
}
.browser-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.browser-nav .cur {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--txt-2);
  text-align: right;
}
.browser-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 16px;
  border-bottom: 1px solid var(--surface-3);
  font-size: 11.5px;
  color: var(--txt-3);
}
.browser-meta .tag {
  padding: 1px 8px;
  border-radius: var(--r-pill);
  background: var(--surface-3);
  color: var(--txt-3);
  font-family: var(--mono);
  font-size: 10.5px;
}
.browser-meta .tag.on {
  background: #dcfce7;
  color: #047857;
}
.browser-list {
  flex: 1 1 auto;
  min-height: 180px;
  margin: 0;
  padding: 6px 8px;
  list-style: none;
  overflow: auto;
}
.dir {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--txt-1);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.dir:hover {
  background: var(--c-primary-soft);
}
.dir .nm {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
}
.dir .cnt {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: var(--txt-3);
}
.browser-list .empty {
  padding: 22px 12px;
  color: var(--txt-3);
  font-size: 12px;
  text-align: center;
}
.browser-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
.browser-foot .pick-target {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11.5px;
  color: var(--txt-2);
}
.browser > .err {
  margin: 10px 16px 0;
}

/* ── 删除运行的二次确认（复用 .browser 遮罩骨架，收窄成确认卡） ── */
.browser.confirm {
  width: min(460px, 100%);
}
.confirm-body {
  padding: 14px 16px 6px;
}
.confirm-kv {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  padding: 5px 0;
  font-size: 12px;
}
.confirm-kv .k {
  color: var(--txt-3);
}
.confirm-kv .v {
  color: var(--txt-1);
  word-break: break-all;
}
.confirm-warn {
  margin: 10px 0 0;
  padding: 8px 10px;
  border: 1px solid #fecaca;
  border-radius: var(--r-sm);
  background: #fef2f2;
  color: #b91c1c;
  font-size: 12px;
}
.confirm-body .err {
  margin-top: 10px;
}

/* ── 体检结果 ── */
.inspect-box {
  margin-top: 14px;
}
.kv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.kv-grid.tight {
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}
.kv {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 10px;
  background: var(--surface-2);
  border: 1px solid #eef2f7;
  border-radius: var(--r-sm);
  min-width: 0;
}
.kv .k {
  font-size: 11px;
  color: var(--txt-3);
}
.kv .v {
  font-size: 13px;
  font-weight: 600;
  color: var(--txt-1);
  overflow: hidden;
  text-overflow: ellipsis;
}
.hint-line {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--txt-3);
}
.chips-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.chips-label {
  font-size: 11px;
  color: var(--txt-3);
  margin-right: 2px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  font-size: 11.5px;
  font-family: var(--mono);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--txt-2);
  cursor: pointer;
  margin: 0;
  line-height: 1.2;
}
.chip.is-dir {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}
.chip.is-dir:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}
.chip em {
  font-style: normal;
  color: var(--txt-3);
  font-size: 10.5px;
}

/* ── 功能 tag 详情弹层（功能简介 / 相关接口 / 页面开发需求） ── */
.browser.feat {
  width: min(740px, 100%);
  max-height: 82vh;
}
.feat-body {
  padding: 6px 16px 12px;
  overflow: auto;
}
.feat-sec {
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.feat-sec:last-child {
  border-bottom: none;
}
.feat-h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--txt-1);
}
.feat-note {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--txt-3);
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
}
.feat-note.warn {
  color: #b45309;
  border-color: #fde68a;
  background: #fffbeb;
}
.feat-note.ok {
  color: #047857;
  border-color: #a7f3d0;
  background: #ecfdf5;
}
.feat-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--txt-2);
}
.feat-empty {
  margin: 0;
  font-size: 12px;
  color: var(--txt-3);
}
.feat-pages {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.feat-pages li {
  font-size: 11.5px;
  color: var(--txt-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
}
.feat-points {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.feat-points li {
  font-size: 12px;
  color: var(--txt-1);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent, #4c8bf5);
  border-radius: 6px;
  padding: 5px 9px;
}
.feat-shots {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 46vh;
  overflow: auto;
}
.feat-shot {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
}
.shot-wrap {
  position: relative;
  display: block;
}
.shot-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: #fafafa;
  color: #888;
  font-size: 13px;
}
.shot-err {
  border-color: #f87171;
  background: #fef2f2;
  color: #dc2626;
}
.shot-box {
  position: absolute;
  border: 2px solid #2563eb;
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
  pointer-events: none;
}
.box-list { border-color: #2563eb; }
.box-create { border-color: #d97706; }
.box-detail { border-color: #7c3aed; }
.box-update { border-color: #0891b2; }
.box-delete { border-color: #dc2626; }
.box-other { border-color: #64748b; }
.shot-box-label {
  position: absolute;
  top: -18px;
  left: 0;
  font-size: 10px;
  line-height: 15px;
  padding: 0 5px;
  border-radius: 3px;
  color: #fff;
  background: rgba(37, 99, 235, 0.92);
  white-space: nowrap;
}
.box-create .shot-box-label { background: rgba(217, 119, 6, 0.92); }
.box-detail .shot-box-label { background: rgba(124, 58, 237, 0.92); }
.box-update .shot-box-label { background: rgba(8, 145, 178, 0.92); }
.box-delete .shot-box-label { background: rgba(220, 38, 38, 0.92); }
.box-other .shot-box-label { background: rgba(100, 116, 139, 0.92); }

/* 接口位置列 */
.loc-col {
  vertical-align: top;
}
.loc-chip {
  display: inline-block;
  font-size: 11px;
  line-height: 1.4;
  padding: 1px 7px;
  margin: 1px 3px 1px 0;
  border-radius: 9999px;
  border: 1px solid var(--border);
  color: var(--txt-2);
  background: var(--bg-card);
}
.loc-vision {
  color: #7c3aed;
  border-color: #ddd6fe;
  background: #f5f3ff;
}
.loc-none {
  font-size: 11px;
  color: var(--txt-3);
}
.feat-cov {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.feat-cov li {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--txt-1);
}
.cov-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--txt-3);
}
.cov-covered { color: var(--ok, #2e9e5b); }
.cov-covered .cov-dot { background: var(--ok, #2e9e5b); }
.cov-partial { color: #c79100; }
.cov-partial .cov-dot { background: #c79100; }
.cov-missing { color: var(--bad, #d9534f); }
.cov-missing .cov-dot { background: var(--bad, #d9534f); }
.cov-st {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.85;
}
.ext-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}
.ext {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px 7px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--txt-2);
}
.ext b {
  font-weight: 600;
}
.ext em {
  font-style: normal;
  color: var(--txt-3);
}

/* ── 坑位 ── */
.slots {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.slot {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  font-size: 11.5px;
  font-family: var(--mono);
  border: 1px solid var(--border);
}
.slot.found {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #047857;
}
.slot.miss {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
.slot-state {
  font-weight: 700;
}

/* ── 两栏 ── */
.two-col {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  gap: 16px;
}
@media (max-width: 1100px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}
.sub-h {
  margin: 0 0 8px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--txt-2);
}

/* ── 端点表 ── */
.conf-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}
.conf {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: var(--r-pill);
  font-size: 10.5px;
  font-family: var(--mono);
  background: var(--surface-3);
  color: var(--txt-2);
  border: 1px solid transparent;
}
.conf b {
  color: var(--txt-1);
}
.conf-high,
.conf-declared {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}
.conf-partial {
  background: #fffbeb;
  color: #b45309;
  border-color: #fde68a;
}
.conf-candidate {
  background: #f8fafc;
  color: #64748b;
  border-color: #e2e8f0;
}
.tbl-wrap {
  max-height: 340px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
.tbl th {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  font-weight: 600;
  color: var(--txt-3);
  background: var(--surface-2);
  padding: 6px 9px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.tbl td {
  padding: 5px 9px;
  border-bottom: 1px solid #f1f5f9;
  color: var(--txt-1);
  max-width: 260px;
}
.tbl tr:last-child td {
  border-bottom: none;
}
.tbl .src {
  color: var(--txt-3);
  font-size: 10.5px;
}

/* ── 产物清单 ── */
.art-list {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.art-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
}
.art-list li.miss {
  opacity: 0.45;
}
.art-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 11.5px;
  color: var(--c-primary);
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.art-btn:hover:not(:disabled) {
  text-decoration: underline;
}
.art-btn:disabled {
  color: var(--txt-3);
  cursor: default;
}
.art-size {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: var(--txt-3);
  font-family: var(--mono);
}
.env-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding: 7px 10px;
  background: var(--surface-2);
  border: 1px solid #eef2f7;
  border-radius: var(--r-sm);
  font-size: 11px;
}
.env-line .k {
  color: var(--txt-3);
}
.env-v {
  font-size: 11px;
  color: var(--txt-2);
  overflow-wrap: anywhere;
}
.tag {
  padding: 1px 7px;
  border-radius: var(--r-pill);
  font-size: 10.5px;
  font-weight: 600;
}
.tag-ok {
  background: #ecfdf5;
  color: #047857;
}
.tag-warn {
  background: #fffbeb;
  color: #b45309;
}

/* ── 裁决 ── */
.dec-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.pill {
  padding: 2px 9px;
  border-radius: var(--r-pill);
  font-size: 11.5px;
  background: var(--surface-3);
  color: var(--txt-2);
}
.pill.warn {
  background: #fffbeb;
  color: #b45309;
}
.pill.ok {
  background: #ecfdf5;
  color: #047857;
}
.block-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.block {
  border: 1px solid var(--border);
  border-left: 3px solid #f59e0b;
  border-radius: var(--r-md);
  padding: 12px 14px;
  background: var(--surface-2);
}
.block.conflict {
  border-left-color: #f59e0b;
}
.block.gap {
  border-left-color: var(--c-danger);
  background: #fffbfb;
}
.block.is-decided {
  border-left-color: var(--c-ok);
  background: #fbfefc;
}
.block-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 8px;
}
.bkind {
  padding: 1px 7px;
  border-radius: var(--r-pill);
  font-size: 10.5px;
  font-weight: 700;
}
.bkind.gap {
  background: #fef2f2;
  color: #b91c1c;
}
.bkind.conflict {
  background: #fffbeb;
  color: #b45309;
}
.btitle {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--txt-1);
}
.bid {
  font-size: 10.5px;
  color: var(--txt-3);
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: 4px;
}
.sev {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  text-transform: uppercase;
}
.sev-blocker {
  background: #fef2f2;
  color: #b91c1c;
}
.sev-major {
  background: #fff7ed;
  color: #c2410c;
}
.sev-warn,
.sev-info {
  background: var(--surface-3);
  color: var(--txt-2);
}
.decided-tag {
  margin-left: auto;
  font-size: 10.5px;
  font-weight: 600;
  color: #047857;
  background: #ecfdf5;
  padding: 1px 8px;
  border-radius: var(--r-pill);
}
.block-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12.5px;
  color: var(--txt-2);
}
.seg-text {
  margin: 0;
}
.seg-label {
  margin: 2px 0 0;
  font-weight: 700;
  color: var(--txt-1);
  font-size: 12px;
}
.seg-bullet {
  margin: 0;
  padding-left: 12px;
  position: relative;
  overflow-wrap: anywhere;
}
.seg-bullet::before {
  content: '·';
  position: absolute;
  left: 2px;
  color: var(--txt-3);
}
.opt-letter {
  display: inline-block;
  min-width: 16px;
  font-weight: 700;
  color: var(--c-primary);
  font-family: var(--mono);
}
.seg-ask {
  margin: 4px 0 0;
  padding: 8px 11px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: var(--r-sm);
  color: #92400e;
  font-weight: 500;
}
.no-id-note {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--txt-3);
}

/* ── 裁决表单 ── */
.dec-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px dashed var(--border);
}
.opt-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
}
.pick {
  padding: 3px 10px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 11.5px;
  color: var(--txt-2);
  cursor: pointer;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick:hover {
  border-color: #cbd5e1;
  background: var(--surface-3);
}
.pick.active {
  background: var(--c-primary-soft);
  border-color: var(--c-primary);
  color: #1d4ed8;
  font-weight: 600;
}
.dec-input {
  flex: 1 1 260px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  font-size: 12.5px;
  color: var(--txt-1);
  outline: none;
}
.dec-input:focus {
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.13);
}
.dec-note {
  flex: 1 1 180px;
}

/* ── 冻结 ── */
.freeze-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.warn-line {
  font-size: 11.5px;
  color: #b45309;
}
.freeze-box {
  margin-top: 14px;
}
.checks {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
}
.check {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  font-size: 11.5px;
  background: var(--surface-2);
  border: 1px solid #eef2f7;
}
.check.ok {
  border-color: #d1fae5;
  background: #f6fefb;
}
.check.bad {
  border-color: #fecaca;
  background: #fef2f2;
}
.ck {
  font-weight: 700;
  color: var(--c-ok);
}
.check.bad .ck {
  color: var(--c-danger);
}
.cid {
  font-size: 11px;
  font-weight: 600;
  color: var(--txt-1);
}
.cdetail {
  color: var(--txt-3);
  overflow-wrap: anywhere;
}
.digests,
.pending {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}
.d-h {
  font-size: 11px;
  font-weight: 700;
  color: var(--txt-2);
  margin-right: 2px;
}
.dg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  font-size: 10.5px;
  color: var(--txt-2);
}
.dg em {
  font-style: normal;
  color: var(--txt-1);
  font-weight: 600;
}
.pd {
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: #fffbeb;
  color: #b45309;
  font-size: 10.5px;
  font-family: var(--mono);
}
.pd.is-gap {
  background: #fef2f2;
  color: #b91c1c;
}

/* ── 产物查看器 ── */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}
.tab {
  padding: 4px 11px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 11.5px;
  font-family: var(--mono);
  color: var(--txt-2);
  cursor: pointer;
}
.tab:hover {
  background: var(--surface-3);
}
.tab.active {
  background: var(--c-primary-soft);
  border-color: var(--c-primary);
  color: #1d4ed8;
  font-weight: 600;
}
.art-view {
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
}
.art-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 11px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  font-size: 10.5px;
  color: var(--txt-2);
}
.art-meta .mtime {
  margin-left: auto;
  color: var(--txt-3);
}
.art-code {
  margin: 0;
  padding: 12px 14px;
  max-height: 520px;
  overflow: auto;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.6;
  color: #1e293b;
  background: #fbfdff;
  white-space: pre;
  tab-size: 2;
  -webkit-user-select: text;
  user-select: text;
}
.art-loading,
.muted {
  font-size: 12px;
  color: var(--txt-3);
  padding: 8px 2px;
}
.art-dl {
  margin-left: 10px;
  border: 1px solid var(--border-2, #e2e8f0);
  background: var(--bg-elevated, #fff);
  color: var(--brand, #2563eb);
  border-radius: 6px;
  padding: 1px 8px;
  font-size: 11px;
  cursor: pointer;
}
.art-dl:hover {
  border-color: var(--brand, #2563eb);
}
.art-img {
  max-width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border-2, #e2e8f0);
}

/* ── S3 代码生成 ── */
.gen-box {
  margin-top: 14px;
}
.gen-dl-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.gen-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  margin: 14px 0;
}
.gen-group {
  border: 1px solid var(--border-2, #e2e8f0);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-elevated, #fff);
}
.gen-g-h {
  font-size: 12px;
  font-weight: 600;
  color: var(--txt-2);
  margin-bottom: 8px;
}
.gen-file {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--brand, #2563eb);
  font-size: 11.5px;
  line-height: 1.9;
  cursor: pointer;
  padding: 1px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gen-file:hover {
  text-decoration: underline;
}
.gen-notes {
  margin-top: 6px;
  border-top: 1px dashed var(--border-2, #e2e8f0);
  padding-top: 10px;
}
.gen-notes .d-h {
  font-size: 12px;
  font-weight: 600;
  color: var(--txt-2);
}
.gn {
  font-size: 11.5px;
  color: var(--txt-3);
  line-height: 1.7;
  margin-top: 4px;
}

/* ── 运行历史 ── */
.runs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.runs li {
  display: grid;
  grid-template-columns: 190px 70px minmax(0, 1fr) 110px 56px;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 11.5px;
}
.runs li:hover {
  background: var(--surface-2);
  border-color: var(--border);
}
.runs li.active {
  background: var(--c-primary-soft);
  border-color: #bfdbfe;
}
.r-id {
  color: var(--txt-1);
  font-weight: 600;
}
.r-state {
  color: var(--txt-3);
}
.r-state.ok {
  color: #047857;
  font-weight: 600;
}
.r-dir {
  color: var(--txt-3);
  font-size: 11px;
}
.r-time {
  color: var(--txt-3);
  font-size: 10.5px;
  text-align: right;
}
.r-del {
  justify-self: end;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--txt-3);
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s,
    background 0.15s;
}
.r-del:hover {
  color: var(--c-danger);
  border-color: #fecaca;
  background: #fef2f2;
}

/* ── 通用色/工具 ── */
.mono {
  font-family: var(--mono);
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  min-width: 0;
}
.ok {
  color: #047857;
}
.bad {
  color: var(--c-danger);
}
.warn {
  color: #b45309;
}
.err {
  margin: 10px 0 0;
  padding: 8px 11px;
  border-radius: var(--r-sm);
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 12px;
  -webkit-user-select: text;
  user-select: text;
}
.hint-line + .err,
.path-row + .err {
  margin-top: 10px;
}

/* ══════════════════════ S4 真·Vue 页面渲染弹窗 ══════════════════════ */
.genvue-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}
.genvue-modal {
  width: min(1100px, 96vw);
  height: min(82vh, 900px);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.genvue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #eef1f6;
  flex: 0 0 auto;
}
.genvue-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.genvue-title {
  font-size: 13px;
  color: #406;
  font-weight: 600;
}
.genvue-body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 18px;
  background: #f7f9fc;
}
.genvue-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #8a93a6;
  font-size: 14px;
}
.genvue-state.err {
  color: #e5484d;
  white-space: pre-wrap;
  text-align: left;
  align-items: flex-start;
  padding: 16px;
}

/* ─── S4 组件嵌入面板 ─── */
.embed-mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}
.embed-modal {
  width: min(720px, 94vw);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.embed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #eef1f6;
  flex: 0 0 auto;
}
.embed-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}
.embed-body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 16px;
}
.embed-cols {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
}
.embed-col-title {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
  margin-bottom: 8px;
}
.embed-list {
  max-height: 360px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px;
}
.embed-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.embed-item:hover {
  background: #f1f5f9;
}
.embed-item.active {
  background: #eff6ff;
  box-shadow: inset 0 0 0 1px #2563eb;
}
.embed-item-name {
  font-size: 13px;
  color: #0f172a;
  font-weight: 500;
}
.embed-item-id {
  font-size: 11px;
  color: #94a3b8;
}
.embed-empty {
  font-size: 12px;
  color: #94a3b8;
  padding: 8px;
}
.embed-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #475569;
  margin-bottom: 10px;
}
.embed-select {
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 13px;
}
.embed-cur {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.embed-cur-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
}
.embed-cur-view {
  color: #64748b;
}
.embed-state {
  font-size: 13px;
  color: #8a93a6;
}
.embed-state.err {
  color: #e5484d;
}
.embed-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #eef1f6;
  flex: 0 0 auto;
}
</style>
