<template>
  <div class="mm-page">
    <header class="mm-header">
      <div class="mm-title">
        <span v-if="debugMode" class="mm-badge-dev">DEV ONLY</span>
        <h1>{{ debugMode ? '会议纪要 · 开发工作台' : '需求会议智能纪要 · 工作台' }}</h1>
      </div>
      <div v-if="debugMode" class="mm-header-note">
        <span>路由 /meeting</span>
        <span>无导航入口</span>
        <span>生产构建不包含本页</span>
        <span>Mock 全链路已贯通</span>
        <span class="mm-theme-light">主题 · 浅色（跟随系统）</span>
        <span class="mm-theme-dark">主题 · 深色（跟随系统）</span>
      </div>
      <div v-else class="mm-header-note">
        <span>AI 产出为内部草稿，需人工确认后定稿</span>
        <span>本地演示：音频不上传、不调用云端识别</span>
        <span class="mm-theme-light">主题 · 浅色（跟随系统）</span>
        <span class="mm-theme-dark">主题 · 深色（跟随系统）</span>
      </div>
    </header>

    <section v-if="debugMode" class="mm-status">
      <span class="mm-status-key">TTR-LOOP</span>
      <span>Task: <b>{{ state.currentTask }}</b></span>
      <span>Phase: <b>{{ state.phase }}</b></span>
      <span>Iter: <b>{{ state.iteration }}</b></span>
      <span>{{ passed }}/{{ checkList.length }}
        <i v-for="item in checkList" :key="item[0]" :class="['mm-dot', item[1] ? 'ok' : 'todo']" :title="item[0]" />
      </span>
      <span :class="pending.length ? 'mm-need' : 'mm-need ok'">
        NEED: {{ pending.length ? pending.join(', ') : '-' }}
      </span>
    </section>

    <section v-if="debugMode" class="mm-runbar">
      <span v-if="debugMode" class="mm-runbar-key">MOCK PIPELINE</span>
      <label class="mm-runbar-field">
        <span>{{ debugMode ? '离线转写稿' : '选择会议' }}</span>
        <select v-model="selectedFixture" @change="onFixtureChange">
          <option v-for="opt in fixtureOptions" :key="opt.key" :value="opt.key">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <button type="button" :disabled="running" @click="startRun">
        {{ debugMode ? '运行 Mock 全链路' : '生成纪要草稿' }}
      </button>
      <button v-if="debugMode" type="button" class="mm-btn-ghost" :disabled="running" @click="startRetryDemo">
        故障注入 + 断点续跑演示
      </button>
      <span :class="['mm-runbar-state', runStatusClass]">{{ runStateText }}</span>
      <span v-if="debugMode && runMode" class="mm-runbar-mode">{{ runMode }}</span>
    </section>

    <!-- 实际使用的工作台：项目 / 主题 → 实时记录 + 人工记录 → AI 分析 → 会议总结 -->
    <section class="mm-live-top">
      <div class="mm-live-top-main">
        <label class="mm-live-field mm-live-field-project">
          <span>项目</span>
          <select :value="live.projectId" @change="onLiveProject">
            <option v-for="p in LIVE_PROJECTS" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="mm-live-field mm-live-field-topic">
          <span>主题</span>
          <input v-model="live.topic" type="text" placeholder="例如：周会 · 进度对齐" />
        </label>
        <label class="mm-live-field">
          <span>会议类型</span>
          <select v-model="config.meetingType">
            <option value="progress_review">工作进度会</option>
            <option value="requirement_review">需求方案会</option>
            <option value="other">其他会议</option>
          </select>
        </label>
        <div class="mm-live-clock">
          <span :class="['mm-live-state', live.status]">{{ LIVE_STATE_LABELS[live.status] }}</span>
          <b>{{ liveClock }}</b>
          <small>已记录</small>
        </div>
      </div>

      <div class="mm-live-top-sub">
        <!-- 示例稿推流是 DEV 演示路径：默认工作台不再露出，避免示例稿被当成真实记录 -->
        <label v-if="debugMode" class="mm-live-field">
          <span>离线转写稿（DEV）</span>
          <select v-model="selectedFixture" @change="onFixtureChange">
            <option v-for="opt in fixtureOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
          </select>
        </label>
        <div class="mm-actions">
          <button
            v-if="debugMode"
            type="button"
            class="mm-btn-ghost"
            :disabled="live.status === 'recording' || live.status === 'paused' || running"
            @click="beginLive"
          >推演示例稿（DEV）</button>
          <button v-if="live.status === 'recording'" type="button" class="mm-btn-ghost" @click="pauseLive">暂停</button>
          <button v-if="live.status === 'paused'" type="button" class="mm-btn-ghost" @click="resumeLive">继续</button>
          <button type="button" class="mm-btn-ghost" :disabled="live.status === 'idle'" @click="endLive">
            结束并生成总结
          </button>
          <button v-if="debugMode" type="button" class="mm-btn-ghost" @click="resetLive">重置会话</button>
        </div>
        <div class="mm-live-progress">
          <div class="mm-live-progress-bar" :style="{ width: liveProgress + '%' }" />
          <span>{{ liveProgressText }}</span>
        </div>
      </div>

      <div v-if="micRows.length || micListError" class="mm-live-mic-pick">
        <div class="mm-live-mic-head">
          <b>音频输入</b>
          <span>{{ micSelectionText }}</span>
          <button type="button" class="mm-btn-ghost" @click="refreshAudioInputs">刷新设备</button>
        </div>
        <div class="mm-live-mic-list">
          <label
            v-for="d in micRows"
            :key="d.deviceId"
            :class="['mm-live-mic-item', { active: d.active }]"
          >
            <input
              type="checkbox"
              :checked="d.active"
              :disabled="recState === 'recording'"
              @change="toggleMicDevice(d.deviceId)"
            />
            <span class="mm-live-mic-name">{{ d.label }}</span>
            <span v-if="recState === 'recording' && d.active" class="mm-live-mic-meter">
              <i :style="{ width: d.levelPct + '%' }" />
            </span>
          </label>
        </div>
        <div class="mm-live-mic-note">
          勾选 2 路以上才按「设备轨」标注说话人：一人一麦时谁的能量占主导就取谁那一路
          （共用一只麦仍会合并成同一个人）。依据是设备、不是声纹，不产生也不留存任何声纹特征。
        </div>
        <div v-if="!micPermGranted" class="mm-live-mic-note">
          浏览器未授权前列不出设备名。首次录音成功后点「刷新设备」即可看到完整清单。
        </div>
        <div v-if="micListError" class="mm-audio-error">{{ micListError }}</div>
      </div>

      <div class="mm-live-rec-bar" :class="'is-' + recState">
        <div class="mm-live-rec-main">
          <span class="mm-live-rec-dot" />
          <b>{{ recStateText }}</b>
          <span class="mm-live-rec-time">{{ recClock }}</span>
          <span class="mm-live-rec-meter"><i :style="{ width: recLevelPct + '%' }" /></span>
          <span class="mm-live-rec-level">{{ recLevelPct }}%</span>
        </div>
        <div class="mm-actions">
          <button
            type="button"
            :disabled="recState === 'recording' || live.status === 'recording' || live.status === 'paused' || running"
            @click="startRealRecording"
          >开始真实录音</button>
          <button
            type="button"
            class="mm-btn-ghost"
            :disabled="recState !== 'recording'"
            @click="stopRealRecording"
          >停止录音并生成总结</button>
          <a
            v-if="recResult"
            class="mm-btn-ghost mm-live-rec-save"
            :href="recWavUrl"
            :download="recWavName"
          >保存音频 WAV</a>
        </div>
      </div>
      <div v-if="recState === 'unsupported'" class="mm-audio-error">
        当前环境无法录音：麦克风采集需要 HTTPS 或 localhost，且需浏览器授权。
        <template v-if="debugMode">（DEV）可先用「推演示例稿」跑通后续链路。</template>
        <template v-else>请用 HTTPS 或 localhost 打开本页后重试。</template>
      </div>
      <div v-if="recState !== 'unsupported'" class="mm-live-asr-bar" :class="{ 'is-error': Boolean(asrError) }">
        <div class="mm-live-asr-main">
          <b>本机离线转写</b>
          <span class="mm-live-asr-state">{{ asrPhaseText }}</span>
          <span v-if="asrBusy" class="mm-live-asr-spin">处理中</span>
          <span class="mm-live-asr-status">{{ asrStatusText }}</span>
        </div>
        <div class="mm-live-asr-sub">
          <span>{{ asrModelLabel }}</span>
          <span v-if="asrLoadedText" class="mm-live-asr-dl">已下载 {{ asrLoadedText }}</span>
          <span class="mm-live-tag-plain">PCM 只在本页内存推理 · 不上传、不调用云端识别</span>
        </div>
        <div v-if="asrPercent > 0 && asrPhase === ASR_PHASES.loading" class="mm-live-asr-progress">
          <i :style="{ width: asrPercent + '%' }" />
          <span>模型权重下载 {{ asrPercent }}%</span>
        </div>
      </div>
      <div v-if="asrErrorHint" class="mm-live-asr-hint">{{ asrErrorHint }}</div>
      <div v-if="recError" class="mm-audio-error">{{ recError }}</div>
      <div v-if="recResult" class="mm-live-rec-stats">
        <span>真实时长 {{ (recResult.durationMs / 1000).toFixed(1) }}s</span>
        <span>{{ recResult.sourceRate }}Hz → 16k mono</span>
        <span>WAV {{ (recResult.wav.byteLength / 1024).toFixed(1) }}KB</span>
        <span>静音分段后 {{ recResult.segments.length }} 段语音</span>
        <span>{{ recResult.trackCount }} 路输入 → 按能量主导合成 1 路</span>
        <span class="mm-live-tag-plain">真实音频数据 · 只存本地、不上传</span>
      </div>

      <div v-if="recAttribution" class="mm-live-track-stats">
        <div v-for="t in recAttribution.trackStats" :key="t.index" class="mm-live-track-row">
          <span class="mm-live-track-name">{{ t.label }}</span>
          <span>发声 {{ (t.voicedMs / 1000).toFixed(1) }}s · 占比 {{ Math.round(t.voicedRatio * 100) }}%</span>
          <span class="mm-live-tag-plain">峰值 {{ t.peakRms.toFixed(3) }}</span>
        </div>
        <div class="mm-live-track-row">
          <span>静音 {{ (recAttribution.silenceMs / 1000).toFixed(1) }}s</span>
          <span>抢话 / 串音 {{ (recAttribution.overlapMs / 1000).toFixed(1) }}s</span>
          <span v-if="recAttribution.driftSamples > 0" class="mm-live-tag-warn">
            轨长差 {{ recAttribution.driftSamples }} 采样（取最短公共长度）
          </span>
          <span class="mm-live-tag-plain">归属依据：{{ recAttribution.basis === 'device_track' ? '设备轨' : recAttribution.basis }} · 非声纹</span>
        </div>
        <div class="mm-live-track-row">
          <span v-if="recResult && recResult.trackCount < 2" class="mm-live-tag-warn">
            本次仅 1 路输入：分不出谁在说，行内保持「说话人未区分」
          </span>
          <span v-else-if="recAttribution.trackStats.length >= 2" class="mm-live-tag-plain">
            {{ recAttribution.trackStats.length }} 路设备轨：谁能量主导取谁那一路，共用一只麦仍会合并
          </span>
        </div>
      </div>

      <div v-if="recResult && recResult.failed && recResult.failed.length" class="mm-audio-error">
        以下音频输入未打开（已跳过，其余轨照常采集）：
        {{ recResult.failed.map((f) => f.reason).join('；') }}
      </div>

      <div class="mm-live-note">
        录音为本地多轨麦克风真实采集：每路输入各采一轨，按帧取能量主导那一路合成为 1 路
        （时间轴与原音一致，增量转写 / 重叠去重 / 证据回跳全部复用）。
        产出真实时长、各轨电平与 WAV 音频文件，可下载留档。
        逐句文字由本机离线 Whisper 模型转写，<b>音频不出本机、不调用云端识别</b>；
        首次使用需下载模型权重到浏览器缓存。
      </div>

      <div class="mm-live-note">
        本地边界：说话人标注依据是<b>设备轨</b>（哪只麦能量占主导），<b>不是声纹分离</b>——
        不产生、不留存任何声纹特征；单轨或抢话时无法归属，行内如实标「说话人未区分」，不编造「男A/女A」。
        逐句置信度模型不返回，显示为「—」。AI 分析为本地规则抽取，未调用云端大模型。
      </div>
    </section>

    <div class="mm-live-bands">
      <section class="mm-live-pane">
        <header class="mm-live-pane-head">
          <b>实时记录</b>
          <span>{{ liveStats.utteranceCount }} 句 · {{ formatDuration(liveStats.durationMs) }} · {{ liveSpeakerText }}</span>
          <span v-if="isRealLive" class="mm-live-tag-plain">本机离线转写 · 音频不出本机</span>
          <span v-else-if="live.utterances.length" class="mm-live-tag-warn">示例稿推演 · 非真实录制</span>
          <span v-if="live.status === 'recording'" class="mm-live-rec">记录中</span>
        </header>
        <div ref="streamEl" class="mm-live-stream">
          <div v-if="!live.utterances.length" class="mm-live-empty">
            <!-- 「0 句」必须分性质说：引擎挂了 / 没采到音频 / 真没语音 / 有语音没转出字，
                 四种情况性质不同，笼统写一句「暂无内容」会把故障说成会议室太安静 -->
            <template v-if="liveEmptyInfo">
              <b :class="['mm-empty-title', 'is-' + liveEmptyInfo.tone]">{{ liveEmptyInfo.title }}</b>
              <span>{{ liveEmptyInfo.detail }}</span>
            </template>
            <!-- 「正在转写」只在真的还在录时才是实话，录完了再说这句就是假状态 -->
            <template v-else-if="isRealLive && live.status === 'recording'">
              正在用本机离线模型转写麦克风音频，识别出内容会逐句出现在这里；
              音频不出本机，不调用云端识别。
            </template>
            <template v-else-if="isRealLive">
              本机离线转写已就绪，但这段录音没有产出句子；本次音频的真实时长与语音段数在下方的录音区。
            </template>
            <template v-else-if="debugMode">
              （DEV）点「推演示例稿」把示例会议的句子逐句推流进来——这条路径不采集麦克风，不是真实录制。
            </template>
            <template v-else>
              点上方「开始真实录音」后，本机麦克风音频由离线 Whisper 模型逐句转写显示在这里；
              音频不出本机、不调用云端识别，首次使用需先把模型权重下载到浏览器缓存。
            </template>
          </div>
          <div
            v-for="row in live.utterances"
            :id="'ev-' + row.id"
            :key="row.id"
            :class="['mm-live-row', { active: activeEvidence === row.id }]"
          >
            <span class="mm-live-ts">{{ formatDuration(row.startMs) }}</span>
            <span :class="['mm-live-spk', { 'is-unknown': row.speakerDiarized === false }]">{{ describeSpeaker(row) }}</span>
            <span class="mm-live-text">{{ row.text }}</span>
            <span v-if="hitMap[row.id]" class="mm-live-hit">{{ hitMap[row.id] }}</span>
          </div>
        </div>
      </section>

      <section class="mm-live-pane">
        <header class="mm-live-pane-head">
          <b>人工记录</b>
          <span>{{ live.manualNotes.length }} 条</span>
          <span class="mm-live-tag-plain">只留痕，不参与 AI 抽取</span>
        </header>
        <div class="mm-live-manual-form">
          <div class="mm-live-kinds">
            <button
              v-for="k in MANUAL_KINDS"
              :key="k.id"
              type="button"
              :class="['mm-live-kind', { active: manualKind === k.id }]"
              @click="manualKind = k.id"
            >{{ k.label }}</button>
          </div>
          <textarea v-model="manualText" rows="3" placeholder="记录人工判断、口头补充、未入会的结论……" />
          <div class="mm-actions">
            <button type="button" @click="submitManual">添加记录</button>
            <span v-if="manualError" class="mm-audio-error">{{ manualError }}</span>
          </div>
        </div>
        <div class="mm-live-manual-list">
          <div v-for="note in live.manualNotes" :key="note.id" class="mm-live-note-row">
            <span :class="['mm-live-kind-tag', note.kind]">{{ note.kindLabel }}</span>
            <span class="mm-live-text">{{ note.text }}</span>
            <button type="button" class="mm-live-del" @click="removeManual(note.id)">删除</button>
          </div>
          <div v-if="!live.manualNotes.length" class="mm-live-empty">
            会中口头补充、没人复述的决定，先记在这里，不进 AI 抽取结果。
          </div>
        </div>
      </section>
    </div>

    <section class="mm-live-pane mm-live-ai">
      <header class="mm-live-pane-head">
        <b>AI 分析</b>
        <span>{{ liveStats.insightCount }} 条结构化洞察 · 随记录实时更新</span>
        <span class="mm-live-tag-plain">本地规则抽取，未调用云端大模型</span>
      </header>
      <div class="mm-live-insight-grid">
        <div v-for="kind in INSIGHT_KINDS" :key="kind.id" class="mm-live-insight-col">
          <div class="mm-live-insight-head">
            <b>{{ kind.label }}</b>
            <span>{{ (live.insights[kind.id] || []).length }}</span>
            <i>{{ kind.hint }}</i>
          </div>
          <div v-if="!(live.insights[kind.id] || []).length" class="mm-live-empty-sm">暂无</div>
          <div v-for="item in live.insights[kind.id]" :key="item.id" class="mm-live-insight">
            <p>{{ item.text }}</p>
            <div class="mm-live-insight-foot">
              <span>{{ item.speaker }}</span>
              <span>{{ formatDuration(item.atMs) }}</span>
              <button
                v-for="ref in item.evidenceRefs"
                :key="ref"
                type="button"
                class="mm-ev-link"
                @click="jumpTo(ref)"
              >{{ ref }}</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="mm-live-pane mm-live-summary">
      <header class="mm-live-pane-head">
        <b>会议总结</b>
        <span>{{ summaryStateText }}</span>
        <span v-if="live.manualNotes.length" class="mm-live-tag-plain">{{ live.manualNotes.length }} 条人工记录一并留档</span>
      </header>

      <div class="mm-live-summary-grid">
        <div class="mm-live-summary-main">
          <pre v-if="article" class="mm-article">{{ article.markdown }}</pre>

          <template v-else-if="draft">
            <div class="mm-live-sum-list">
              <div v-for="field in displayFields" :key="field.fieldId" class="mm-live-sum-row">
                <div class="mm-live-sum-head">
                  <b>{{ field.label }}</b>
                  <span :class="['mm-source', field.sourceState]">{{ sourceLabels[field.sourceState] }}</span>
                  <span v-if="field.humanEdited" class="mm-edited-tag">人工已改</span>
                </div>
                <div :class="['mm-live-sum-value', { empty: !field.value }]">
                  {{ field.value || '未确认，待人工核实' }}
                </div>
              </div>
            </div>
          </template>

          <div v-else class="mm-live-empty">
            <!-- 真实录音的 0 句要先讲清成因：引擎故障 / 没采到音频 / 真没语音 / 有语音没转出字。
                 讲清了才不会出现两种事故：把故障当「会议室太安静」，或者以为必须退回示例稿才有内容 -->
            <template v-if="liveEmptyInfo">
              <b :class="['mm-empty-title', 'is-' + liveEmptyInfo.tone]">{{ liveEmptyInfo.title }}</b>
              <span>{{ liveEmptyInfo.detail }}</span>
              <span class="mm-empty-next">
                仍可点「生成总结」：会生成一份字段全部留空的草稿，逐项标「未确认，待人工核实」，
                再用右侧人工记录补齐；不会拿示例稿顶替。
              </span>
            </template>
            <!-- 上传音频只做格式解码与统计、还没接入逐句转写；这里必须说清楚，
                 否则「生成为什么点不了」会被当成故障，或者又退回拿示例稿充数 -->
            <template v-else-if="fileResult">
              已解码「{{ fileResult.fileName }}」（{{ fileResult.durationMs }}ms · {{ fileResult.segments }} 段语音），
              但这一步只做格式解码与统计，逐句转写尚未接入，所以还生成不出基于这段音频的总结。
              要看真实总结请用「开始真实录音」→ 记录 →「结束会议」。
            </template>
            <template v-else>
              结束记录后点「生成总结」，这里会出现按{{ config.meetingType === 'requirement_review' ? '需求方案会' : config.meetingType === 'progress_review' ? '进度会' : '会议' }}模板整理的纪要；也可以先看右侧 AI 分析结果。
            </template>
          </div>

          <div v-if="live.manualNotes.length" class="mm-live-sum-manual">
            <b>人工记录 {{ live.manualNotes.length }} 条（不参与 AI 抽取）</b>
            <div v-for="note in live.manualNotes" :key="note.id" class="mm-live-note-row">
              <span :class="['mm-live-kind-tag', note.kind]">{{ note.kindLabel }}</span>
              <span class="mm-live-text">{{ note.text }}</span>
            </div>
          </div>
        </div>

        <div class="mm-live-summary-side">
          <div class="mm-actions">
            <!-- 必须走 generateSummary：它会把真实转写句子（含 0 句空数组）传下去，
                 直接绑 startRun 等于不传参 → createRun 判定「无真实内容」→ 换回示例稿 → 总结是硬编码 -->
            <button
              type="button"
              :disabled="running || live.status !== 'finished'"
              @click="generateSummary"
            >
              {{ draft ? '重新生成总结' : '生成总结' }}
            </button>
            <button type="button" class="mm-btn-ghost" :disabled="!draft" @click="doCompose">
              {{ article ? '重新整合稿件' : '合成输出稿件' }}
            </button>
            <button type="button" class="mm-btn-ghost" :disabled="!canExportArticle" @click="copyArticle">
              {{ articleCopied ? '已复制' : '复制稿件' }}
            </button>
          </div>

          <div class="mm-kv"><b>状态</b><span>{{ isFrozen ? '已定稿 · 可导出' : '内部草稿 · 未定稿' }}</span></div>
          <div class="mm-kv"><b>内容</b><span>{{ displayFields.length }} 项 · 已修订 {{ overlayCount }} 项</span></div>
          <div v-if="article" class="mm-kv"><b>稿件</b><span>{{ articleStale ? '已过期，需重新整合' : '与当前草稿一致' }} · {{ article.stats.evidenceRefCount }} 处证据</span></div>

          <div class="mm-actions mm-live-publish">
            <button type="button" :disabled="!draft || isFrozen" @click="doPublish">确认定稿</button>
            <button type="button" class="mm-btn-ghost" :disabled="!draft" @click="doSave">保存草稿</button>
            <button type="button" class="mm-btn-ghost" :disabled="!draft" @click="doLoad">载入草稿</button>
          </div>
          <div v-if="publishBlockers.length" class="mm-warning">
            定稿还需完成 {{ publishBlockers.length }} 项：<code v-for="(b, i) in publishBlockers" :key="i">{{ b }}</code>
          </div>
          <div v-if="savedNotice" class="mm-store-notice">{{ savedNotice }}</div>
          <div v-if="storeError" class="mm-audio-error">{{ storeError }}</div>

          <!-- FR-14 数据生命周期（SEC-07）：留存期限 / 到期清理 / 主动删除 / 导出不含音频 -->
          <div class="mm-live-sub-head">数据留存<small>到期自动清理</small></div>
          <div class="mm-kv"><b>留存期限</b><span>{{ retentionDays }} 天 · {{ retentionSourceText }}</span></div>
          <div class="mm-kv"><b>清理计划</b><span>{{ retentionSummary }}</span></div>
          <div class="mm-actions mm-retention-ops">
            <input
              v-model.number="retentionDaysDraft"
              type="number"
              :min="RETENTION_DAYS_MIN"
              :max="RETENTION_DAYS_MAX"
              aria-label="留存天数"
            />
            <button type="button" class="mm-btn-ghost" @click="applyRetentionDays">应用期限</button>
            <button type="button" class="mm-btn-ghost" @click="previewRetentionSweep">查看待清理</button>
            <button type="button" class="mm-btn-ghost" @click="runRetentionSweep">清理到期数据</button>
            <button type="button" class="mm-btn-ghost" :disabled="!draft" @click="deleteSavedDraft()">
              删除本场草稿
            </button>
          </div>
          <div class="mm-kv">
            <b>删除审计</b>
            <span>{{ retentionAudit.length }} 条 · 最近：{{ retentionAudit[0] ? `${retentionAudit[0].action} ${retentionAudit[0].runVersion}` : '—' }}</span>
          </div>
          <div class="mm-live-note">
            到期清理删除 {{ PURGE_ARTIFACTS.join(' / ') }}，仅保留 {{ PURGE_KEEPS.join(' / ') }}；
            剩余 {{ EXPIRING_SOON_DAYS }} 天内到期标为临期。导出内容不含原始音频（导出前强制校验）。
          </div>
          <div v-if="retentionNotice" class="mm-store-notice">{{ retentionNotice }}</div>

          <div class="mm-live-sub-head">导出<small>仅已定稿可导出</small></div>
          <div class="mm-export-row">
            <label
              v-for="s in EXPORT_SCOPES"
              :key="s.id"
              :class="['mm-format-chip', { active: exportScope === s.id }]"
            >
              <input v-model="exportScope" type="radio" name="mm-live-export-scope" :value="s.id" />
              {{ s.label }}
            </label>
          </div>
          <div class="mm-live-format-grid">
            <button
              v-for="f in EXPORT_FORMATS"
              :key="f.id"
              type="button"
              class="mm-live-format"
              :disabled="!canExportFormats"
              @click="doExportFormat(f.id)"
            >
              <b>{{ f.label }}</b>
              <span>{{ f.mode === 'download' ? '下载文件' : '打印另存' }}</span>
            </button>
          </div>
          <div v-if="exportError" class="mm-audio-error">{{ exportError }}</div>

          <details v-if="draft" class="mm-live-confirm">
            <summary>逐项确认与修订（{{ displayFields.length }} 项）</summary>
            <div v-for="field in displayFields" :key="'c-' + field.fieldId" class="mm-live-confirm-row">
              <div class="mm-live-sum-head">
                <b>{{ field.label }}</b>
                <span :class="['mm-source', field.sourceState]">{{ sourceLabels[field.sourceState] }}</span>
                <span>{{ field.confirmState }}</span>
              </div>
              <textarea
                v-model="editInputs[field.fieldId]"
                rows="2"
                :disabled="isFrozen"
                placeholder="修订后的内容（AI 原值保留可对照）"
              />
              <div class="mm-actions">
                <button type="button" :disabled="isFrozen" @click="doEdit(field.fieldId)">保存修改</button>
                <button type="button" class="mm-btn-ghost" :disabled="isFrozen" @click="doConfirm(field.fieldId)">确认</button>
                <button type="button" class="mm-btn-ghost" :disabled="isFrozen" @click="doResetField(field.fieldId)">还原</button>
                <input v-model="rejectInputs[field.fieldId]" :disabled="isFrozen" placeholder="驳回原因（必填）" />
                <button type="button" class="mm-btn-ghost" :disabled="isFrozen" @click="doReject(field.fieldId)">驳回</button>
              </div>
            </div>
          </details>

          <div class="mm-audio-note">
            所有产出均为内部草稿，须人工确认定稿后方可导出；导出物带来源标注与证据编号，不得作为正式纪要对外流转。
          </div>
        </div>
      </div>
    </section>

    <main v-if="debugMode" class="mm-grid mm-grid-debug">
      <section v-if="debugMode" class="mm-col">
        <h2>WBS 任务清单 <small>{{ tasks.length }} 项 · 已完成 {{ completed.size }}</small></h2>
        <div class="mm-scroll">
          <div v-for="group in grouped" :key="group.phase" class="mm-group">
            <h3>{{ phaseLabels[group.phase] || group.phase }}</h3>
            <div
              v-for="task in group.items"
              :key="task.id"
              :class="['mm-task', { done: isDone(task.id), current: task.id === state.currentTask }]"
            >
              <span class="mm-task-mark">{{ isDone(task.id) ? 'x' : task.id === state.currentTask ? '>' : '-' }}</span>
              <span class="mm-task-id">{{ task.id }}</span>
              <span class="mm-task-name">{{ task.title }}</span>
              <span class="mm-task-est">{{ task.estimate == null ? '—' : task.estimate + 'd' }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="mm-col">
        <h2>会前设置 <small>会议类型 · 语种 · 背景资料 · 产出要求</small></h2>

        <label class="mm-field">
          <span>会议类型（必选）</span>
          <select v-model="config.meetingType">
            <option value="progress_review">工作进度会</option>
            <option value="requirement_review">需求方案会</option>
            <option value="other">其他会议</option>
          </select>
        </label>

        <div class="mm-row">
          <label class="mm-field">
            <span>主语种</span>
            <select v-model="config.primaryLanguage">
              <option value="zh-CN">中文普通话</option>
              <option value="en-US">English</option>
              <option value="mix:zh-en">中英混说</option>
            </select>
          </label>
          <label class="mm-field">
            <span>产出语言</span>
            <select v-model="config.outputLanguage">
              <option value="meeting_primary">同主语种</option>
              <option value="zh-CN">统一中文</option>
            </select>
          </label>
        </div>

        <label class="mm-field">
          <span>会议背景资料（仅用于名词消歧，不作为结论来源）</span>
          <textarea v-model="config.background" rows="3" placeholder="可粘贴项目名、术语、既有计划……例如：原计划 12 月上线" />
        </label>

        <label class="mm-field">
          <span>产出要求（可写篇幅、重点，必填内容与来源标注不会被省略）</span>
          <textarea v-model="config.instruction" rows="2" placeholder="例如：精简版，突出遗留问题" />
        </label>

        <div class="mm-actions">
          <button v-if="debugMode" type="button" @click="copyConfig">{{ copied ? '已复制' : '复制配置 JSON' }}</button>
          <button type="button" class="mm-btn-ghost" @click="resetConfig">重置</button>
        </div>
        <pre v-if="debugMode" class="mm-json">{{ configJson }}</pre>

        <div class="mm-placeholder">
          <b>音频输入</b>
          <p>可现场录音，或上传本地音频文件。音频仅在浏览器内处理，不上传、不落盘。</p>
          <p>当前为本地演示环境：草稿由所选示例会议的转写稿生成，录音与上传文件不参与云端转写。</p>
          <p>使用提示：结论只取会议发言，背景资料仅用于名词消歧；AI 产出为内部草稿，须人工确认后定稿。</p>
        </div>

        <div class="mm-audio">
          <div class="mm-audio-head">
            <b>现场录音</b>
            <span :class="['mm-audio-state', audioState]">{{ audioStatusText }}</span>
          </div>
          <p class="mm-audio-desc">
            录制后在浏览器内完成音频归一化与静音分段。
            <b>不上传、不调用云端识别</b>。
          </p>
          <div class="mm-actions">
            <button type="button" :disabled="capturing" @click="beginCapture">开始录音</button>
            <button type="button" class="mm-btn-ghost" :disabled="!capturing" @click="endCapture">停止录音</button>
          </div>
          <div class="mm-audio-meter"><div :style="{ width: levelPct + '%' }" /></div>
          <div v-if="audioError" class="mm-audio-error">{{ audioError }}</div>
          <div v-if="audioResult" class="mm-audio-stats">
            <span v-if="debugMode">源 {{ audioResult.sourceRate }}Hz</span>
            <span v-if="debugMode">16k mono</span>
            <span>时长 {{ audioResult.durationMs }}ms</span>
            <span>{{ debugMode ? 'WAV ' : '音频 ' }}{{ (audioResult.wav.byteLength / 1024).toFixed(1) }}KB</span>
            <span>{{ debugMode ? 'VAD ' : '语音 ' }}{{ audioResult.segments.length }} 段</span>
          </div>
          <div v-if="debugMode && audioResult && audioResult.segments.length" class="mm-audio-segs">
            <code v-for="(seg, i) in audioResult.segments" :key="i">{{ seg.startMs }}–{{ seg.endMs }}ms</code>
          </div>
          <div v-if="debugMode" class="mm-audio-deps">
            <b>云端依赖就绪度</b>
            <div v-for="d in cloudDeps" :key="d.id" class="mm-audio-dep">
              <span :class="['mm-dep-level', d.ready ? 'ok' : d.level === '阻塞' ? 'bad' : 'warn']">{{ d.level }}</span>
              <span class="mm-dep-name">{{ d.name }}</span>
              <span>{{ d.ready ? '就绪' : '未就绪' }}</span>
            </div>
            <div class="mm-audio-note">
              当前 adapter_mode = {{ cloudMode }}；未就绪时 CloudAudioAdapter 调用抛 NOT_CONNECTED，不伪造转写结果。
            </div>
          </div>
        </div>

        <div class="mm-audio mm-file">
          <div class="mm-audio-head">
            <b>上传录音文件</b>
            <span :class="['mm-audio-state', fileState]">
              {{ { idle: '待选择', decoding: '解码中', done: '处理完成', error: '失败' }[fileState] }}
            </span>
          </div>
          <p class="mm-audio-desc">
            支持 {{ SUPPORTED_EXTENSIONS.join(' / ') }}，文件在本地解码为统一格式。
            <b v-if="debugMode">wav 走纯函数解析；压缩格式走 AudioContext.decodeAudioData，全部本地完成</b>。
          </p>
          <input type="file" :accept="fileAccept" :disabled="fileState === 'decoding'" @change="onAudioFile" />
          <div v-if="fileError" class="mm-audio-error">{{ fileError }}</div>
          <div v-if="fileResult" class="mm-audio-stats">
            <span>{{ fileResult.fileName }}</span>
            <span v-if="debugMode">源 {{ fileResult.sourceRate }}Hz · {{ fileResult.format }}</span>
            <span v-if="debugMode">16k mono</span>
            <span>时长 {{ fileResult.durationMs }}ms</span>
            <span>{{ debugMode ? 'WAV ' : '音频 ' }}{{ fileResult.wavKB }}KB</span>
            <span>{{ debugMode ? 'VAD ' : '语音 ' }}{{ fileResult.segments }} 段</span>
            <span v-if="debugMode">解码 {{ fileResult.decodeVia }}</span>
          </div>
          <div v-if="fileResult && fileResult.formatWarning" class="mm-audio-warn">
            {{ fileResult.formatWarning }}
          </div>
          <div class="mm-audio-note">文件仅在浏览器内处理，不上传、不落盘。</div>
        </div>
      </section>

      <section class="mm-col">
        <h2>纪要草稿 <small>AI 生成 · 待人工确认</small></h2>

        <div v-if="!draft" class="mm-empty">
          <p>尚未生成草稿。选择会议后点击上方「生成纪要草稿」。</p>
          <div class="mm-kv"><b>本模板必填内容</b></div>
          <div class="mm-inline-list">
            <code v-for="key in (debugMode ? requiredFields : requiredFieldLabels)" :key="key">{{ key }}</code>
          </div>
        </div>

        <template v-else>
          <div class="mm-meta">
            <span v-if="debugMode">{{ draft.template.id }} / {{ draft.template.version }}</span>
            <span v-if="debugMode">{{ draft.runVersion }}</span>
            <span>产出语言 {{ draft.outputLanguage }}</span>
            <span v-if="debugMode">截断 {{ Math.round(draft.truncatedRatio * 100) }}%</span>
          </div>
          <div class="mm-langs">
            <span v-for="lang in draft.detectedLanguages" :key="lang.lang">
              {{ lang.lang }} {{ Math.round(lang.share * 100) }}%<template v-if="debugMode"> ({{ lang.confidence }})</template>
            </span>
          </div>
          <div v-for="warning in draft.warnings" :key="warning" class="mm-warning">{{ warning }}</div>
          <div v-if="draft.injectionEvents.length && !debugMode" class="mm-warning">
            已忽略 {{ draft.injectionEvents.length }} 条越权指令，必填内容与来源标注保持不变
          </div>
          <div v-if="debugMode && draft.injectionEvents.length" class="mm-warning">
            注入痕迹 {{ draft.injectionEvents.length }} 条：
            <code v-for="e in draft.injectionEvents" :key="e.id + e.source">{{ e.id }}/{{ e.source }}</code>
            （已忽略，硬约束未关闭）
          </div>

          <!-- 固定高度 + 区域内 Y 滚动：字段再多也不把整页顶长，定稿按钮始终可见 -->
          <div class="mm-scroll-bar">
            <span>{{ displayFields.length }} 项草稿内容</span>
            <span class="mm-scroll-bar-tip">
              区域内滚动查看<template v-if="debugMode"> · max-height min(56vh, 540px)</template>
            </span>
          </div>
          <div class="mm-scroll-body">
            <div v-for="field in displayFields" :key="field.fieldId" class="mm-card">
              <div class="mm-card-head">
                <b>{{ field.label }}</b>
                <span :class="['mm-source', field.sourceState]">{{ sourceLabels[field.sourceState] }}</span>
                <span v-if="field.humanEdited" class="mm-edited-tag">人工已改</span>
              </div>
              <div :class="['mm-card-value', { empty: !field.value }]">
                {{ field.value || '（待确认 / 值保持 null）' }}
              </div>
              <div class="mm-card-foot">
                <span v-if="debugMode">{{ field.key }}</span>
                <span>{{ field.confirmState }}</span>
                <span v-if="debugMode">conf {{ field.confidence }}</span>
                <span v-if="debugMode && field.reason">{{ field.reason }}</span>
                <span v-if="field.rejectReason">驳回：{{ field.rejectReason }}</span>
              </div>
              <div v-if="field.evidenceRefs.length" class="mm-evidence">
                证据：
                <button
                  v-for="ref in field.evidenceRefs"
                  :key="ref"
                  type="button"
                  class="mm-ev-link"
                  @click="jumpTo(ref)"
                >{{ ref }}</button>
              </div>
              <div v-if="field.candidates && field.candidates.length" class="mm-candidates">
                <div v-for="(candidate, index) in field.candidates" :key="index" class="mm-candidate">
                  <span>{{ index === 0 ? '会议说法' : '资料说法' }}</span>
                  <span>{{ candidate.text }}</span>
                  <button
                    v-for="ref in candidate.evidenceRefs"
                    :key="ref"
                    type="button"
                    class="mm-ev-link"
                    @click="jumpTo(ref)"
                  >{{ ref }}</button>
                </div>
              </div>
              <div v-if="debugMode && field.note" class="mm-note">{{ field.note }}</div>
              <div v-if="field.humanEdited && field.aiValue !== field.value" class="mm-note">
                AI 原值：{{ field.aiValue ?? 'null' }} ｜ 编辑于 {{ field.editedAt }}
              </div>
              <div class="mm-editor">
                <textarea
                  v-model="editInputs[field.fieldId]"
                  rows="2"
                  :disabled="isFrozen"
                  :placeholder="debugMode ? '人工修订值（写入 field_overlay，不改动 AI 原草稿）' : '输入修订后的内容（AI 原值会保留可对照）'"
                />
                <div class="mm-actions mm-editor-actions">
                  <button type="button" :disabled="isFrozen" @click="doEdit(field.fieldId)">保存修改</button>
                  <button type="button" class="mm-btn-ghost" :disabled="isFrozen" @click="doConfirm(field.fieldId)">确认</button>
                  <button type="button" class="mm-btn-ghost" :disabled="isFrozen" @click="doResetField(field.fieldId)">还原 AI 值</button>
                </div>
                <div class="mm-reject">
                  <input
                    v-model="rejectInputs[field.fieldId]"
                    :disabled="isFrozen"
                    placeholder="驳回原因（必填）"
                  />
                  <button type="button" class="mm-btn-ghost" :disabled="isFrozen" @click="doReject(field.fieldId)">驳回</button>
                </div>
              </div>
            </div>
          </div>

          <div class="mm-store">
            <div class="mm-store-head">
              <b>{{ debugMode ? 'S5 编辑保存 / 定稿冻结' : '编辑与定稿' }}</b>
              <span :class="['mm-store-state', isFrozen ? 'frozen' : 'draft']">
                {{ isFrozen ? '已定稿' : '内部草稿 · 未定稿' }}
              </span>
            </div>
            <div class="mm-actions">
              <button type="button" :disabled="!draft" @click="doSave">{{ debugMode ? '保存到本地' : '保存草稿' }}</button>
              <button type="button" class="mm-btn-ghost" :disabled="!draft" @click="doLoad">{{ debugMode ? '载入已保存' : '载入草稿' }}</button>
              <button type="button" class="mm-btn-ghost" :disabled="!draft || isFrozen" @click="doClear">清除本地草稿</button>
              <button type="button" :disabled="!draft || isFrozen" @click="doPublish">{{ debugMode ? '定稿冻结' : '确认定稿' }}</button>
            </div>
            <div class="mm-note">导出格式请在下方「导出」区选择；草稿态所有导出均不可用。</div>
            <div v-if="debugMode" class="mm-kv"><b>保存键</b><span><code>{{ storeKey }}</code></span></div>
            <div v-if="debugMode" class="mm-kv"><b>索引键</b><span><code>{{ INDEX_KEY }}</code> · 已存 {{ savedIndex.length }} 个版本</span></div>
            <div class="mm-kv"><b>已修订</b><span>{{ overlayCount }} 个字段 · {{ savedAt ? '最后更新 ' + savedAt : '尚未保存' }}</span></div>
            <div v-if="debugMode" class="mm-kv"><b>当前版本</b><span><code>{{ draft?.runVersion }}</code> · r{{ runSeq }}</span></div>
            <div v-if="savedIndex.length" class="mm-history">
              <b>历史版本 {{ savedIndex.length }} 个（旧版编辑不会被覆盖）</b>
              <div
                v-for="(item, idx) in savedIndex"
                :key="item.runVersion"
                :class="['mm-history-row', { current: item.runVersion === draft?.runVersion }]"
              >
                <code v-if="debugMode">{{ item.runVersion }}</code>
                <span v-else>版本 {{ savedIndex.length - idx }}</span>
                <span>{{ item.updatedAt || '未保存' }}</span>
                <span v-if="item.runVersion === draft?.runVersion" class="mm-history-tag">当前</span>
              </div>
            </div>
            <div v-if="!debugMode" class="mm-kv"><b>操作记录</b><span>{{ auditCount }} 条修改已留痕，随草稿一并保存</span></div>
            <div v-if="debugMode" class="mm-history">
              <b>字段级审计 FR-13（{{ auditCount }} 条 · 最近 5 条，含改前/改后值与 RunVersion）</b>
              <div v-for="e in auditRows" :key="e.seq" class="mm-history-row mm-audit-row">
                <code>#{{ e.seq }} {{ e.action }} {{ e.fieldId || '' }}</code>
                <span>{{ e.at }}</span>
                <span>{{ e.before?.value ?? '—' }} → {{ e.after?.value ?? '—' }}</span>
              </div>
              <div v-if="!auditCount" class="mm-note">尚无字段修改记录。</div>
            </div>
            <div v-if="publishBlockers.length" class="mm-warning">
              定稿还需完成 {{ publishBlockers.length }} 项：
              <code v-for="(b, i) in publishBlockers" :key="i">{{ b }}</code>
            </div>
            <div v-if="publishedSnapshot" class="mm-note">
              定稿时间 {{ publishedSnapshot.publishedAt }} · {{ publishedSnapshot.fields.length }} 项内容<template v-if="debugMode"> · frozen={{ String(publishedSnapshot.frozen) }}</template>
            </div>
            <div v-if="savedNotice" class="mm-store-notice">{{ savedNotice }}</div>
            <div v-if="storeError" class="mm-audio-error">{{ storeError }}</div>
            <div class="mm-audio-note">
              <b>仅已定稿版本可导出<template v-if="debugMode">（FR-11）</template></b>；草稿态导出会被拒绝。导出内容含来源标注与证据引用，仅供内部参考、不得对外流转。
              文件保存在<b>浏览器下载目录</b><template v-if="debugMode">（meeting-draft-&lt;runVersion&gt;.md / .csv / .json）</template>。
            </div>
          </div>
        </template>
      </section>

      <!-- P5：草稿预览之后，把结构化字段 + 发言记录 + 来源标注 + 证据引用整合成一篇可读稿件 -->
      <section class="mm-col mm-span-2">
        <h2>
          {{ debugMode ? 'P5 整合输出稿件 · CompositionAdapter' : '整合输出稿件' }}
          <small>{{ debugMode ? '草稿 → 成稿 · 本地确定性整合 / 云合成骨架' : '把草稿与会议记录整理成一篇可读稿件' }}</small>
        </h2>

        <div v-if="!draft" class="mm-empty">
          <p>生成纪要草稿后，可在这里把草稿内容、发言记录与证据整合成一篇输出稿件。</p>
        </div>

        <template v-else>
          <div class="mm-actions">
            <button type="button" @click="doCompose">
              {{ article ? '重新整合' : (debugMode ? '运行本地整合' : '合成输出稿件') }}
            </button>
            <button type="button" class="mm-btn-ghost" :disabled="!canExportArticle" @click="copyArticle">
              {{ articleCopied ? '已复制' : '复制稿件' }}
            </button>
            <span
              v-if="article"
              :class="['mm-verdict', articleStale || !articleCheck?.passed ? 'bad' : 'ok']"
            >
              {{ articleStale ? '草稿已变更 · 稿件需重新整合' : (articleCheck?.passed ? '稿件校验通过' : '稿件校验未通过') }}
            </span>
          </div>

          <div class="mm-article-note">
            稿件按模板字段、人工修订、发言记录与证据原文整理成文，不改写原文、不补写结论；<b>本地生成，未调用云端大模型</b>。
            云端智能合成接入后可在不改动流程的情况下切换。稿件仍是内部草稿，须人工确认定稿后方可复制 / 导出。
          </div>

          <div v-if="!article" class="mm-empty">
            <p>尚未整合。点击「{{ debugMode ? '运行本地整合' : '合成输出稿件' }}」生成一篇带来源标注与证据索引的稿件。</p>
          </div>

          <div v-else class="mm-article-grid">
            <pre class="mm-article">{{ article.markdown }}</pre>
            <div class="mm-article-side">
              <div class="mm-kv"><b>合成方式</b><span>{{ debugMode ? article.adapterId + ' / ' + article.adapterMode : '本地整合（未调用云 LLM）' }}</span></div>
              <div class="mm-kv"><b>稿件状态</b><span>{{ articleStale ? '已过期（草稿字段已变更）' : '与当前草稿一致' }}</span></div>
              <div v-if="debugMode" class="mm-kv"><b>稿件 ID</b><span><code>{{ article.articleId }}</code></span></div>
              <div v-if="debugMode" class="mm-kv"><b>输入指纹</b><span><code>{{ article.fingerprint }}</code></span></div>
              <div class="mm-kv"><b>结构</b><span>{{ article.stats.sectionCount }} 段 · {{ article.stats.fieldCount }} 个字段 · {{ article.stats.paragraphCount }} 个条目</span></div>
              <div class="mm-kv"><b>证据</b><span>{{ article.stats.evidenceRefCount }} 处引用 · {{ article.stats.utteranceCount }} 条发言 · {{ article.stats.backgroundSpanCount }} 条背景</span></div>
              <div class="mm-kv"><b>来源分布</b><span>来自会议 {{ article.sourceSummary.from_meeting }} · 来自背景 {{ article.sourceSummary.from_background }} · 未确认 {{ article.sourceSummary.unconfirmed }}</span></div>
              <div class="mm-kv"><b>待确认 / 人工</b><span>{{ article.stats.unconfirmedCount }} 项待确认 · {{ article.stats.humanEditedCount }} 处人工修订</span></div>
              <div class="mm-kv"><b>稿件校验</b><span>{{ articleCheck?.results.filter(r => r.passed).length || 0 }}/{{ articleCheck?.results.length || 0 }} 通过<template v-if="debugMode">（A-1~A-8）</template></span></div>
              <div class="mm-kv"><b>导出</b><span>{{ canExportArticle ? '已定稿 · 可复制 / 导出' : (isFrozen ? (articleStale ? '稿件已过期' : '稿件校验未通过') : '仅已定稿版本可导出') }}</span></div>

              <div v-if="debugMode" class="mm-article-debug">
                <b>稿件层校验 A-1~A-8</b>
                <div
                  v-for="r in articleCheck?.results || []"
                  :key="r.id"
                  :class="['mm-article-check-row', r.passed ? 'ok' : 'bad']"
                >
                  <code>{{ r.id }}</code><span>{{ r.name }}</span><span>{{ r.passed ? 'PASS' : 'FAIL' }}</span>
                </div>
              </div>
              <div v-if="debugMode" class="mm-article-debug">
                <b>CloudCompositionAdapter 就绪度</b>
                <div class="mm-kv"><b>状态</b><span>{{ compReadiness.ready ? '就绪' : '未就绪' }} · adapter_mode={{ compReadiness.adapterMode }}</span></div>
                <div v-for="d in compReadiness.missing" :key="d.id" class="mm-note"><code>{{ d.id }}</code> {{ d.name }} · {{ d.level }}</div>
                <div class="mm-kv"><b>契约同构</b><span>{{ compContractCheck.ok ? 'PASS' : 'FAIL' }} · {{ compContractCheck.methods.join(' / ') }}</span></div>
                <div class="mm-note">未就绪时调用抛 NOT_CONNECTED，不伪造云合成结果。</div>
              </div>
              <div v-if="debugMode && article.warnings.length" class="mm-article-debug">
                <b>合成告警 {{ article.warnings.length }} 条</b>
                <div v-for="(w, i) in article.warnings" :key="i" class="mm-note">{{ w }}</div>
              </div>
            </div>
          </div>
          <div v-if="articleError" class="mm-audio-error">{{ articleError }}</div>
        </template>
      </section>

      <section v-if="debugMode" class="mm-col mm-span-2">
        <h2>阶段时间线 <small>Worker 轮询 · partial_artifacts · 断点续跑</small></h2>
        <div class="mm-progress">
          <div class="mm-progress-bar" :style="{ width: progressPct + '%' }" />
          <span>{{ progressPct }}%</span>
        </div>
        <div v-if="!stages.length" class="mm-empty"><p>未运行。</p></div>
        <div v-for="stage in stages" :key="stage.id" :class="['mm-stage', stage.state]">
          <span class="mm-stage-pct">{{ stage.pct }}%</span>
          <span :class="['mm-stage-state', stage.state]">{{ stageLabel(stage.state) }}</span>
          <span class="mm-stage-name">{{ stage.label }}</span>
          <span class="mm-stage-meta">x{{ stage.attempts }}</span>
          <span class="mm-stage-meta">{{ stageDuration(stage) }}</span>
        </div>
      </section>

      <section v-if="debugMode" class="mm-col">
        <h2>运行事件日志 <small>{{ events.length }} 条</small></h2>
        <div v-if="!events.length" class="mm-empty"><p>未运行。</p></div>
        <div class="mm-log">
          <div v-for="e in events" :key="e.seq" :class="['mm-log-row', e.type]">
            <span class="mm-log-seq">{{ String(e.seq).padStart(2, '0') }}</span>
            <span class="mm-log-type">{{ e.type }}</span>
            <span class="mm-log-msg">{{ e.message }}</span>
          </div>
        </div>
      </section>

      <section v-if="debugMode" class="mm-col">
        <h2>输出校验器 <small>V-1 ~ V-6 · 不可关闭</small></h2>
        <div v-if="!validation" class="mm-empty"><p>未运行。</p></div>
        <template v-else>
          <div :class="['mm-verdict', validation.passed ? 'ok' : 'bad']">
            {{ validation.passed ? 'PASS' : 'FAIL' }} · {{ validationPassed }}/{{ validation.results.length }}
            · 自动修复 {{ validation.repairs.length }} 处
          </div>
          <div v-for="r in validation.results" :key="r.id" class="mm-vrow">
            <span :class="['mm-vtag', r.passed ? 'ok' : 'bad']">{{ r.id }}</span>
            <span class="mm-vname">{{ r.name }}</span>
            <span class="mm-vdetail">{{ r.detail }}</span>
          </div>
          <div v-if="validation.repairs.length" class="mm-note">
            修复记录：<code v-for="(rep, i) in validation.repairs" :key="i">{{ rep.fieldId }}/{{ rep.reason }}</code>
          </div>
        </template>
      </section>

      <section v-if="debugMode" class="mm-col">
        <h2>约束合成产物 <small>GenerationContract</small></h2>
        <div v-if="!contractArtifact" class="mm-empty"><p>未运行。</p></div>
        <template v-else>
          <div class="mm-kv"><b>优先级</b><span>{{ contractArtifact.priorityRule }}</span></div>
          <div class="mm-kv"><b>硬约束</b><span>{{ contractArtifact.hardConstraints.join(' / ') }}</span></div>
          <div class="mm-kv"><b>必填字段</b><span>{{ contractArtifact.requiredFields.join(', ') }}</span></div>
          <div class="mm-kv"><b>背景 span</b><span>{{ contractArtifact.backgroundSpanCount }} 个 · 仅消歧</span></div>
          <div class="mm-kv"><b>上下文</b><span>{{ contractArtifact.contextChars }} 字 · 裁剪 {{ Math.round(contractArtifact.truncatedRatio * 100) }}%</span></div>
          <div class="mm-kv"><b>产出语言</b><span>{{ contractArtifact.outputLanguage }}</span></div>
          <div :class="['mm-kv', { 'mm-kv-alert': contractArtifact.injectionEvents.length }]">
            <b>越权指令</b>
            <span>{{ contractArtifact.injectionEvents.length }} 条（已忽略）</span>
          </div>
        </template>
      </section>

      <section :class="['mm-col', { 'mm-span-2': !debugMode }]">
        <h2>会议转写稿 <small>点击草稿中的证据编号可定位到对应发言</small></h2>
        <div v-if="!evidenceRows.length" class="mm-empty"><p>生成草稿后，这里会列出会议发言与背景资料片段，供核对证据。</p></div>
        <div class="mm-ev-table">
          <div
            v-for="row in evidenceRows"
            :key="row.refId"
            :id="'ev-' + row.refId"
            :class="['mm-ev-row', { active: activeEvidence === row.refId, background: row.kind === 'background' }]"
          >
            <code class="mm-ev-id">{{ row.refId }}</code>
            <span class="mm-ev-lang">{{ row.lang }}</span>
            <span class="mm-ev-speaker">{{ row.speaker }}</span>
            <span class="mm-ev-text">{{ row.text }}</span>
            <span class="mm-ev-conf">{{ row.confidence == null ? '—' : row.confidence }}</span>
          </div>
        </div>
      </section>

      <!-- Q-13：统一导出区。草稿区与整合稿件区里重复的导出按钮已收敛到这里 -->
      <section :class="['mm-col', { 'mm-span-2': !debugMode }]">
        <h2>导出 <small>{{ debugMode ? 'Q-13 · 统一导出内容模型 / FR-11 发布门禁' : '选内容与格式，导出已定稿的纪要' }}</small></h2>

        <div v-if="!draft" class="mm-empty">
          <p>生成纪要草稿并确认定稿后，可在这里选择导出内容与格式。</p>
        </div>

        <template v-else>
          <div class="mm-export-row">
            <b>导出内容</b>
            <label
              v-for="s in EXPORT_SCOPES"
              :key="s.id"
              :class="['mm-format-chip', { active: exportScope === s.id }]"
            >
              <input v-model="exportScope" type="radio" name="mm-export-scope" :value="s.id" />
              {{ s.label }}
            </label>
          </div>
          <div class="mm-export-note">{{ currentScopeNote }}</div>

          <div class="mm-format-grid">
            <div v-for="f in EXPORT_FORMATS" :key="f.id" class="mm-format-card">
              <div class="mm-format-head">
                <b>{{ f.label }}</b>
                <code v-if="debugMode">{{ f.ext ? '.' + f.ext : 'print' }}</code>
                <span :class="['mm-store-state', f.mode === 'download' ? 'frozen' : 'draft']">
                  {{ f.mode === 'download' ? '下载文件' : '打印另存' }}
                </span>
              </div>
              <p>{{ f.note }}</p>
              <button type="button" :disabled="!canExportFormats" @click="doExportFormat(f.id)">
                {{ f.id === 'pdf' ? '打印 / 另存为 PDF' : '导出 ' + f.label }}
              </button>
            </div>
          </div>

          <div class="mm-kv"><b>导出条件</b><span>{{ exportGateText }}</span></div>
          <div class="mm-audio-note">
            所有格式都带内部定稿件声明、内容来源标注、证据编号与版本号；仅已定稿版本可导出，导出物不得作为正式纪要对外流转。
          </div>

          <template v-if="debugMode">
            <div class="mm-store-head mm-gap"><b>格式契约（Q-13）</b><span class="mm-store-state draft">dev 降级路径</span></div>
            <div class="mm-ep-list">
              <div v-for="f in EXPORT_FORMATS" :key="f.id" class="mm-ep-row mm-export-ep">
                <code>{{ f.id }}</code><code>{{ f.mime }}</code><span>{{ f.mode }} · {{ f.note }}</span>
              </div>
            </div>
            <div class="mm-kv"><b>跨格式约束</b><span>{{ outputTargets.dev.exportFile.hardConstraints.join(' / ') }}</span></div>
            <div class="mm-kv"><b>Word 降级</b><span>{{ outputTargets.dev.exportFile.degraded.word }}</span></div>
            <div class="mm-kv"><b>PDF 降级</b><span>{{ outputTargets.dev.exportFile.degraded.pdf }}</span></div>
            <div class="mm-kv"><b>生产阻塞</b><span>{{ outputTargets.production.exportFile.blockers.join(' / ') }}</span></div>
            <div class="mm-actions">
              <button type="button" class="mm-btn-ghost" :disabled="!draft || !isFrozen" @click="doExport('md')">字段稿 MD</button>
              <button type="button" class="mm-btn-ghost" :disabled="!draft || !isFrozen" @click="doExport('csv')">CSV</button>
              <button type="button" class="mm-btn-ghost" :disabled="!draft || !isFrozen" @click="doExport('json')">JSON</button>
              <button type="button" class="mm-btn-ghost" @click="copyDraft">{{ draftCopied ? '已复制' : '复制草稿 JSON' }}</button>
            </div>
          </template>
          <div v-if="exportError" class="mm-audio-error">{{ exportError }}</div>
        </template>
      </section>

      <section :class="['mm-col', { 'mm-span-2': !debugMode }]">
        <h2>{{ debugMode ? '最后的产出在哪里' : '产出与保存' }} <small>{{ debugMode ? 'S5 · 持久化落点' : '草稿 / 定稿 / 导出' }}</small></h2>
        <template v-if="!debugMode">
          <div class="mm-kv"><b>草稿</b><span>自动保存在本浏览器，刷新后可继续编辑；重新生成会建立新版本，旧版本编辑保留</span></div>
          <div class="mm-kv"><b>定稿</b><span>确认全部必填内容后冻结，定稿后不可回退为草稿</span></div>
          <div class="mm-kv"><b>导出</b><span>仅已定稿版本可导出，支持 Markdown / HTML / Word / PDF（打印另存）；在上方「导出」区选择内容与格式</span></div>
          <div class="mm-kv"><b>整合稿件</b><span>草稿预览后可把内容、发言与证据整理成一篇稿件；同样仅已定稿版本可复制 / 导出</span></div>
          <div class="mm-kv"><b>音频</b><span>仅在浏览器内处理，不上传、不落盘</span></div>
          <div class="mm-audio-note">当前为本地演示环境，使用示例会议转写稿；导出内容仅供内部参考，不得作为正式纪要对外流转。</div>
        </template>
        <template v-else>
          <div class="mm-verdict ok">dev 态：{{ outputTargets.dev.status }}</div>
          <div class="mm-kv"><b>编辑覆盖</b><span>{{ outputTargets.dev.draftOverlay.type }} · <code>{{ outputTargets.dev.draftOverlay.keyPattern }}</code></span></div>
          <div class="mm-kv"><b>版本索引</b><span><code>{{ outputTargets.dev.draftOverlay.indexKey }}</code></span></div>
          <div class="mm-kv"><b>冻结快照</b><span>{{ outputTargets.dev.frozenSnapshot.type }}</span></div>
          <div class="mm-kv"><b>音频</b><span>{{ outputTargets.dev.audio.type }} · {{ outputTargets.dev.audio.note }}</span></div>
          <div class="mm-kv"><b>导出文件</b><span>{{ outputTargets.dev.exportFile.type }} · {{ outputTargets.dev.exportFile.formats.join(' / ') }}</span></div>
          <div class="mm-kv"><b>合成稿件</b><span>{{ outputTargets.dev.composition.type }}</span></div>
          <div class="mm-kv"><b>稿件落点</b><span>{{ outputTargets.dev.composition.storage }} · {{ outputTargets.dev.composition.output }}</span></div>
          <div class="mm-kv"><b>AI 原稿</b><span>不可变；人工改动只写 overlay，重跑新版本不覆盖</span></div>
          <div class="mm-store-head mm-gap"><b>生产态（未实现）</b><span class="mm-store-state draft">{{ outputTargets.production.status }}</span></div>
          <div class="mm-kv"><b>编辑覆盖</b><span>{{ outputTargets.production.draftOverlay.type }}</span></div>
          <div class="mm-kv"><b>冻结快照</b><span>{{ outputTargets.production.frozenSnapshot.type }}</span></div>
          <div class="mm-kv"><b>音频</b><span>{{ outputTargets.production.audio.type }}</span></div>
          <div class="mm-audio-note">{{ backend.note }}</div>
        </template>
      </section>

      <section v-if="debugMode" class="mm-col">
        <h2>S3 契约层 / S4 后端契约 <small>{{ CONTRACT_VERSION }} · 未实现服务端</small></h2>
        <div :class="['mm-verdict', contractCheck && contractCheck.ok ? 'ok' : 'bad']">
          draft_schema_v1 {{ contractCheck ? (contractCheck.ok ? 'PASS' : 'FAIL') : '待运行' }}
        </div>
        <div v-if="contractCheck && !contractCheck.ok" class="mm-warning">
          <code v-for="(e, i) in contractCheck.errors" :key="i">{{ e }}</code>
        </div>
        <div class="mm-kv"><b>契约版本</b><span>{{ CONTRACT_VERSION }} · 三态来源 / 四态确认 / 必填字段门禁</span></div>
        <div class="mm-kv"><b>模板</b><span>progress_review · requirement_review · other</span></div>
        <div class="mm-kv"><b>接口</b><span>{{ BACKEND_ENDPOINTS.length }} 个 · 已实现 {{ backend.implementedCount }} 个</span></div>
        <div class="mm-kv"><b>数据表</b><span>{{ DB_TABLES.length }} 张 · DB 状态机 + 单 Worker 轮询</span></div>
        <div class="mm-kv"><b>状态机</b><span>{{ RUN_STATUS.join(' → ') }}（已定稿为终态）</span></div>
        <div class="mm-kv"><b>同意状态机</b><span>{{ CONSENT_STATUS.join(' → ') }}（任一人拒绝即阻断 · 已撤回不可直接回已通过）</span></div>
        <div :class="['mm-kv', consentContractCheck.ok ? '' : 'mm-kv-alert']">
          <b>合规契约</b>
          <span>
            FR-03 / FR-14 {{ consentContractCheck.ok ? 'PASS' : 'FAIL' }} ·
            同意接口 {{ consentContractCheck.consentEndpointIds.length }} + 留存接口 {{ consentContractCheck.retentionEndpointIds.length }} ·
            SEC-01 {{ sec01Dependency && sec01Dependency.ready ? '已审定' : '未审定（阻塞）' }} ·
            Q-04 {{ q04Dependency && q04Dependency.ready ? '已确认' : '待确认（默认 90 天为估算值）' }}
          </span>
        </div>
        <div v-if="!consentContractCheck.ok" class="mm-warning">
          <code v-for="(e, i) in consentContractCheck.errors" :key="i">{{ e }}</code>
        </div>
        <div class="mm-kv"><b>就绪度</b><span>{{ backend.ready ? '就绪' : '未就绪' }} · adapter_mode={{ backend.adapterMode }}</span></div>
        <div class="mm-kv"><b>生成侧</b><span>CloudGenerationAdapter {{ genReadiness.ready ? '就绪' : '未就绪' }} · 同构 {{ genContractCheck.ok ? 'PASS' : 'FAIL' }} · 缺 {{ genReadiness.missing.length }} 项</span></div>
        <div class="mm-audio-note">T-047 生成侧骨架已固化：JSON mode + schema 约束 / 2 次重试 / E-11 部分字段降级未实现，调用抛 NOT_CONNECTED。</div>
        <div class="mm-ep-list">
          <div v-for="ep in BACKEND_ENDPOINTS" :key="ep.id" class="mm-ep-row">
            <code>{{ ep.method }}</code><code>{{ ep.path }}</code><span>{{ ep.purpose }}</span>
          </div>
        </div>
        <div class="mm-audio-note">仅固化契约与状态机，不实现服务端、不起服务、不连数据库、不部署。</div>
      </section>

      <section v-if="debugMode" class="mm-col">
        <h2>语种门禁 E-18 <small>Q-07 默认假设 · L1 only</small></h2>
        <div v-if="!langGate" class="mm-empty"><p>运行后可看到语种路由与拦截结果。</p></div>
        <template v-else>
          <div :class="['mm-verdict', langGate.supported ? 'ok' : 'bad']">
            {{ langGate.supported ? '全部语种在清单内' : '存在未支持语种' }} · allowed {{ langGate.allowed.join(' / ') }}
          </div>
          <div class="mm-kv"><b>可路由</b><span>{{ langGate.routeable.map(l => l.lang).join(', ') || '—' }}</span></div>
          <div class="mm-kv"><b>未支持</b><span>{{ langGate.unsupported.map(l => l.lang).join(', ') || '—' }}</span></div>
          <div class="mm-kv"><b>转写片段</b><span>保留 {{ langGate.utterances.kept.length }} · 拦截 {{ langGate.utterances.blocked.length }}</span></div>
          <div v-for="(e, i) in langGate.utterances.events" :key="i" class="mm-warning">
            {{ e.code }} · {{ e.utteranceId }} · {{ e.lang }} 未进入 transcribe
          </div>
          <div class="mm-audio-note">L2 = []（v1 不验收、不排期）；新增语种需标注样本 + PRD 14.3 变更评估。</div>
        </template>
      </section>

      <section v-if="debugMode" class="mm-col mm-span-2">
        <h2>S6 评测与注入回归 <small>C-1~C-8 · 25 条注入用例 · 真实跑批</small></h2>
        <div class="mm-actions">
          <button type="button" @click="runEvalNow">重新跑批</button>
          <span :class="['mm-verdict', evalResult && evalResult.ok ? 'ok' : 'bad']">
            {{ evalResult ? (evalResult.ok ? 'PASS' : 'FAIL') : '未运行' }} ·
            C-1~C-8 {{ evalResult?.evalSuite.passed }}/{{ evalResult?.evalSuite.total }} ·
            注入 {{ evalResult?.injectionSuite.passed }}/{{ evalResult?.injectionSuite.total }} ·
            攻击命中 {{ evalResult?.injectionSuite.attackHit }} · 良性误伤 {{ evalResult?.injectionSuite.benignFalsePositive }}
          </span>
        </div>
        <div v-if="evalResult" class="mm-eval-grid">
          <div>
            <b>评测样本 C-1~C-8</b>
            <div v-for="row in evalResult.evalSuite.rows" :key="row.id" :class="['mm-eval-row', row.passed ? 'ok' : 'bad']">
              <code>{{ row.id }}</code><span>{{ row.name }}</span><span class="mm-eval-detail">{{ row.detail }}</span>
            </div>
          </div>
          <div>
            <b>注入用例 ATK-01~17 / BEN-01~08</b>
            <div class="mm-note">攻击用例必须命中，正常产出要求不得误伤；仅列出未通过项。</div>
            <div v-for="row in evalResult.injectionSuite.rows.filter(r => !r.passed)" :key="row.id" class="mm-eval-row bad">
              <code>{{ row.id }}</code><span>{{ row.text }}</span>
            </div>
            <div v-if="!evalResult.injectionSuite.failed" class="mm-verdict ok">25/25 全部符合预期</div>
          </div>
        </div>
      </section>
    </main>

    <footer v-if="debugMode" class="mm-footer">
      <div>
        <b>loop 推进</b>
        <code>node .dev-loop/mock-smoke.mjs</code>
        <code>node .dev-loop/ttr-loop.mjs status</code>
        <code>check &lt;gate&gt;</code>
        <code>gate</code>
        <code>advance</code>
      </div>
      <div>刷新页面读取最新 loop 状态（loop-state.json 为单一事实源）。本页不含部署动作。</div>
    </footer>
    <footer v-else class="mm-footer">
      <div>本地演示环境：使用示例会议转写稿，音频不上传、不调用云端识别。</div>
      <div>AI 产出为内部草稿，须人工确认后定稿；未定稿版本不可导出。</div>
    </footer>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, triggerRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { pxRem } from '@/utils/rem'
import loopState from './loop-state.json'
import { tasks, phaseLabels, sourceLabels } from './dev-data'
import { fixtures, createRun, REQUIRED_FIELDS, mockGenerationAdapter } from './mock/index.js'
import {
  isCaptureSupported,
  startCapture,
  stopCapture
} from './mock/real-audio-capture.js'
import {
  MULTI_TRACK_LIMITS,
  isMultiTrackSupported,
  listAudioInputs,
  startMultiTrackCapture,
  collectMultiTrackSnapshot,
  stopMultiTrackCapture,
  speakerAt
} from './mock/multi-track-capture.js'
import { CLOUD_DEPENDENCIES, cloudReadiness } from './mock/cloud-audio-adapter.js'
import {
  cloudGenerationReadiness,
  generationAdapterContractCheck
} from './mock/cloud-generation-adapter.js'
import { createDraftStore, listSaved, STORAGE_PREFIX, INDEX_KEY } from './mock/draft-store.js'
import {
  DEFAULT_RETENTION_DAYS,
  EXPIRING_SOON_DAYS,
  RETENTION_DAYS_MAX,
  RETENTION_DAYS_MIN,
  PURGE_ARTIFACTS,
  PURGE_KEEPS,
  assertNoRawAudio,
  buildPurgePlan,
  deleteDraftByVersion,
  listRetentionAudit,
  purgeExpired,
  readRetentionPolicy,
  writeRetentionPolicy
} from './mock/retention.js'
import { decodeAudioFile, SUPPORTED_EXTENSIONS } from './mock/audio-file.js'
import { L1_LANGUAGES, checkLanguageSupport, gateUtterances } from './mock/language-gate.js'
import { runAllChecks } from './mock/eval-runner.js'
import {
  composeArticle,
  validateArticle,
  isCompositionCurrent,
  localCompositionAdapter,
  cloudCompositionReadiness,
  compositionAdapterContractCheck
} from './mock/composition-adapter.js'
import {
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  exportDocument
} from './mock/export-formats.js'
import {
  LIVE_PROJECTS,
  LIVE_STATE_LABELS,
  MANUAL_KINDS,
  INSIGHT_KINDS,
  classifyUtterance,
  createLiveSession,
  setSessionProject,
  startSession,
  pauseSession,
  resumeSession,
  finishSession,
  pushNextUtterance,
  loadUtterances,
  addManualNote,
  removeManualNote,
  deriveInsights,
  summarizeSession,
  formatDuration
} from './mock/live-session.js'
import {
  LOCAL_ASR_MODELS,
  LOCAL_ASR_DEFAULT_MODEL,
  ASR_PHASES,
  createLocalAsr,
  describeSpeaker,
  describeAsrFailure,
  describeAsrNoAudio
} from './mock/local-asr.js'
import { resampleTo16k } from './mock/audio-dsp.js'
import {
  CONTRACT_VERSION,
  OUTPUT_TARGETS,
  BACKEND_ENDPOINTS,
  DB_TABLES,
  BACKEND_DEPENDENCIES,
  RUN_STATUS,
  CONSENT_STATUS,
  backendReadiness,
  consentRetentionContractCheck,
  validateDraftShape,
  schemaOf
} from './contracts/index.js'

// 视图分层：默认只呈现实际使用的工作台；?debug=1 才展开 TTR / WBS / 契约 / 评测等开发视图。
// 页面本身仍是 dev-only 路由（生产构建不包含），开发信息只是默认隐藏，不删除、不留假开关。
const route = useRoute()
const debugMode = computed(() => route.query.debug === '1')

const state = reactive({ ...loopState })
const checkList = Object.entries(state.checks)
const passed = checkList.filter(([, value]) => value).length
const pending = checkList.filter(([, value]) => !value).map(([key]) => key)
const completed = new Set(state.completedTasks)
const isDone = (id) => completed.has(id)

const grouped = computed(() => {
  const map = new Map()
  tasks.forEach((task) => {
    if (!map.has(task.phase)) map.set(task.phase, [])
    map.get(task.phase).push(task)
  })
  return [...map.entries()].map(([phase, items]) => ({ phase, items }))
})

const fixtureOptions = Object.entries(fixtures).map(([key, fx]) => ({
  key,
  label: fx.label,
  meetingType: fx.meetingType,
  primaryLanguage: fx.primaryLanguage
}))

const defaults = {
  meetingType: 'progress_review',
  primaryLanguage: 'zh-CN',
  outputLanguage: 'meeting_primary',
  background: '',
  instruction: ''
}
const config = reactive({ ...defaults })
const copied = ref(false)
const draftCopied = ref(false)

const configJson = computed(() =>
  JSON.stringify(
    {
      meeting_type: config.meetingType,
      language_config: { primary: config.primaryLanguage },
      output_language: config.outputLanguage,
      background_text: config.background,
      instruction: config.instruction
    },
    null,
    2
  )
)

const requiredFields = computed(() => REQUIRED_FIELDS[config.meetingType] || REQUIRED_FIELDS.other)

const FIELD_LABELS = {
  topic_context: '议题背景',
  progress_summary: '项目进展',
  milestone_status: '里程碑',
  open_issues: '遗留问题',
  options: '方案对比',
  conclusion: '讨论结论',
  open_questions: '待决问题'
}
const requiredFieldLabels = computed(() =>
  requiredFields.value.map((key) => FIELD_LABELS[key] || key)
)

// ---- Mock 全链路 ----
const selectedFixture = ref('progress')
const runner = shallowRef(null)
const run = shallowRef(null)
const running = ref(false)
const runMode = ref('')
const activeEvidence = ref('')
const runSeq = ref(0)
let timer = null
const STEP_DELAY = 200

const draft = computed(() => run.value?.draft || null)
const validation = computed(() => run.value?.validation || null)
const validationPassed = computed(() => validation.value?.results.filter((r) => r.passed).length || 0)
const stages = computed(() => run.value?.stages || [])
const events = computed(() => run.value?.events || [])
const contractArtifact = computed(() => run.value?.artifacts?.contract || null)
const evidenceRows = computed(() => {
  const rows = (run.value?.artifacts?.transcript?.utterances || []).map((u) => ({
    refId: u.utteranceId,
    lang: u.lang,
    speaker: u.speakerLabel,
    text: u.text,
    confidence: u.asrConfidence,
    kind: 'utterance'
  }))
  const spans = contractArtifact.value?.backgroundSpans || []
  return [
    ...rows,
    ...spans.map((s) => ({
      refId: s.spanId,
      lang: 'background',
      speaker: '背景资料',
      text: s.text,
      confidence: null,
      kind: 'background'
    }))
  ]
})

const progressPct = computed(() => {
  const done = [...stages.value].reverse().find((s) => s.state === 'done')
  return done ? done.pct : 0
})

const runStateText = computed(() => {
  const s = run.value
  if (!s) return debugMode.value ? '未运行' : '尚未生成草稿'
  if (s.status === 'running') {
    return debugMode.value ? `运行中 · ${s.stages[s.stageIndex]?.label || ''}` : '正在生成草稿…'
  }
  if (s.status === 'failed') {
    return debugMode.value ? `失败 · ${s.error?.stageId} · 等待断点续跑` : '生成失败，请重试'
  }
  return debugMode.value
    ? `完成 · ${s.runVersion} · 校验器 ${s.validation?.results.filter((r) => r.passed).length}/6`
    : '草稿已生成 · 待人工确认'
})

const runStatusClass = computed(() => {
  const s = run.value
  if (!s) return ''
  if (s.status === 'done') return 'ok'
  if (s.status === 'failed') return 'bad'
  return 'busy'
})

function stopTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

// FR-12：已有人工作业时，重跑前显式确认「新建版本、旧版本保留」
function confirmRerun() {
  if (!overlayCount.value || isFrozen.value) return true
  return window.confirm(
    `当前版本有 ${overlayCount.value} 处人工修改。\n` +
      '重新生成会建立一个新版本，旧版本及其修改会保留，不会被覆盖。\n是否继续？'
  )
}

// utterances 有值 = 用本机真实转写内容跑链路；audio 有值 = 归一化报真实采集时长。
// 两者都不传 = 示例会议稿（演示路径）。
//
// 「有值」看的是**是否显式传入数组**，不是看长度：真实会议转写 0 句也是真实结果，
// 链路要跑出全空草稿待人工确认，不能因为 0 句就换了来源。
function startRun({ utterances = null, audio = null } = {}) {
  if (!confirmRerun()) return
  stopTimer()
  runSeq.value += 1
  runMode.value = Array.isArray(utterances) ? '标准链路 · 本地转写' : '标准链路'
  activeEvidence.value = ''
  const r = createRun(
    selectedFixture.value,
    { ...config },
    { runSeq: runSeq.value, utterances, audio }
  )
  runner.value = r
  run.value = r.state
  running.value = true
  timer = setTimeout(tick, STEP_DELAY)
}

function startRetryDemo() {
  if (!confirmRerun()) return
  stopTimer()
  runSeq.value += 1
  runMode.value = '故障注入演示'
  activeEvidence.value = ''
  const r = createRun(selectedFixture.value, { ...config }, { runSeq: runSeq.value })
  r.injectFailure('transcribe')
  runner.value = r
  run.value = r.state
  running.value = true
  timer = setTimeout(tickWithRetry, STEP_DELAY)
}

function tick() {
  if (!runner.value) return
  runner.value.step()
  triggerRef(run)
  if (runner.value.state.status === 'running') {
    timer = setTimeout(tick, STEP_DELAY)
  } else {
    running.value = false
  }
}

function tickWithRetry() {
  if (!runner.value) return
  runner.value.step()
  triggerRef(run)
  const s = runner.value.state
  if (s.status === 'failed') {
    timer = setTimeout(() => {
      runner.value.retryFrom('transcribe')
      triggerRef(run)
      timer = setTimeout(tick, STEP_DELAY)
    }, 700)
    return
  }
  if (s.status === 'running') {
    timer = setTimeout(tickWithRetry, STEP_DELAY)
  } else {
    running.value = false
  }
}

function onFixtureChange() {
  const fx = fixtures[selectedFixture.value]
  if (!fx) return
  config.meetingType = fx.meetingType
  config.primaryLanguage = fx.primaryLanguage
  // 真实转写会议不受示例稿切换影响：换示例稿不该清掉本机的真实记录
  if (isRealLive.value) return
  // 演示转写源换了：实时会话的推流必须清空，否则会把两场会议的句子混进同一次记录
  resetLiveStream({ keepManual: false, keepTopic: true })
  if (run.value) startRun()
}

function jumpTo(refId) {
  activeEvidence.value = refId
  nextTick(() => {
    const el = document.getElementById(`ev-${refId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function stageLabel(stateName) {
  return { pending: '待执行', running: '执行中', done: '完成', failed: '失败' }[stateName] || stateName
}

function stageDuration(stage) {
  if (!stage.startedAt || !stage.finishedAt) return '—'
  return `${stage.finishedAt - stage.startedAt}ms`
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function copyConfig() {
  copied.value = await writeClipboard(configJson.value)
  setTimeout(() => (copied.value = false), 1500)
}

async function copyDraft() {
  if (!draft.value) return
  draftCopied.value = await writeClipboard(JSON.stringify(draft.value, null, 2))
  setTimeout(() => (draftCopied.value = false), 1500)
}

function resetConfig() {
  Object.assign(config, defaults)
}

// ---- 实时会议工作台：项目 / 主题 → 实时记录 + 人工记录 → AI 分析 → 会议总结 ----
// 全程本地：转写稿按示例会议逐句推流，音频不上传、不调云端识别；「AI 分析」= live-session.js 的
// 本地规则抽取，未调用云端大模型（页面须保留该声明）。人工记录只留痕、不参与抽取，
// 避免把人工判断包装成「AI 从会议里听出来的结论」。
const live = reactive(
  createLiveSession({
    projectId: LIVE_PROJECTS[0].id,
    meetingType: config.meetingType
  })
)
const streamEl = ref(null)
const manualKind = ref('note')
const manualText = ref('')
const manualError = ref('')
const liveElapsedMs = ref(0)
let livePumpTimer = null
let liveClockTimer = null
// 推流节奏：演示用（比真实会议快），只影响呈现速度，不参与任何业务判定
const LIVE_STEP_MS = 1400

// FR-03 告知同意（SEC-01）门禁已按产品要求从工作台移除：不再登记参会人、录音前不再校验同意。
// 领域逻辑 mock/consent.js 与服务端契约自检（consentRetentionContractCheck）保留，供接入服务端时复用；
// 但本页「真实录音」与「音频文件解码」已无前置同意校验 —— 采前告知改由线下流程保证。

// ---- 真实录音（本地多轨麦克风采集）：本地采集 + 本地离线转写，音频全程不出本机 ----
// 边界：录音只做本地采集 + 16k mono 归一化 + 静音分段，产出真实 WAV（可下载留档）；
// 逐句文本由本机离线 Whisper 模型转写（见下方「本地 Whisper 离线转写」段），不再取自示例转写稿。
// 说话人归属按「设备轨」：一人一麦时谁的能量占主导就取谁那一路，归属依据是设备、不是声纹，
// 故不产生、不留存任何声纹 embedding；单轨（或未命中）时一律「说话人未区分」，不硬标人名。
// 仍未做：声纹分离（不编人名）、逐句置信度（模型不返回，显示「—」）。
const recState = ref('idle') // idle | recording | done | error | unsupported
const recError = ref('')
const recResult = shallowRef(null)
const recElapsedMs = ref(0)
const recLevel = ref(0)
const recWavUrl = ref('')
const REC_STATE_LABELS = {
  idle: '未开始录音',
  recording: '采集中 · 本地麦克风',
  done: '已停止 · 音频留在本地',
  error: '录音失败',
  unsupported: '环境不支持'
}
const recStateText = computed(() => REC_STATE_LABELS[recState.value] || '—')
const recClock = computed(() => formatDuration(recElapsedMs.value))
const recLevelPct = computed(() => Math.min(100, Math.round(recLevel.value * 400)))
const recWavName = computed(() => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')
  return `meeting-recording-${stamp}.wav`
})
let recHandle = null
let recClockTimer = null
let recStartedAt = 0

// ---- 多轨采集状态（T-030「A. 多轨采集」）：设备清单 / 选中设备 / 各轨电平 / 本次归属结果 ----
// 归属依据写死为「设备轨」（snapshot.basis = 'device_track'），页面与导出都不得说成声纹分离。
const micDevices = ref([])
const micDeviceIds = ref([])
const micPermGranted = ref(false)
const micListError = ref('')
const micPicked = ref(false)
const recTracks = shallowRef([])
const recAttribution = shallowRef(null)
const recLevels = reactive({})
// 少于 2 路就谈不上归属：一只麦分不出谁在说，硬标说话人就是造假
const recMultiTrack = computed(() => (recTracks.value?.length || 0) >= 2)
const micSelectionText = computed(() => {
  if (!micDevices.value.length) return '未列出设备 · 将用系统默认输入（单轨）'
  const n = micDeviceIds.value.length
  if (!n) return '未勾选 · 将用系统默认输入（单轨，不标说话人）'
  return n >= MULTI_TRACK_LIMITS.maxTracks
    ? `已选 ${n} 路（单次上限 ${MULTI_TRACK_LIMITS.maxTracks} 路）`
    : `已选 ${n} 路`
})

// 设备清单 ↔ 采集轨序（勾选顺序就是轨序），用于把每只麦的电平对回它自己那一行
const micRows = computed(() =>
  micDevices.value.map((d) => {
    const trackIndex = micDeviceIds.value.indexOf(d.deviceId)
    return {
      ...d,
      trackIndex,
      active: trackIndex >= 0,
      levelPct: trackIndex >= 0 ? Math.min(100, Math.round((recLevels[trackIndex] || 0) * 400)) : 0
    }
  })
)

async function refreshAudioInputs() {
  micListError.value = ''
  try {
    const list = await listAudioInputs()
    // 未授权时 enumerateDevices 拿不到真 deviceId（是空串），这类条目直接丢掉，不做假选项
    const named = list.filter((d) => d.deviceId)
    micDevices.value = named
    micPermGranted.value = list.some((d) => d.labelKnown)
    // 设备热插拔后旧 id 会失效：只保留仍在清单里的选择
    const alive = new Set(named.map((d) => d.deviceId))
    micDeviceIds.value = micDeviceIds.value.filter((id) => alive.has(id))
  } catch (e) {
    micListError.value = `无法读取音频输入设备：${e.message}`
  }
}

function toggleMicDevice(deviceId) {
  micPicked.value = true
  const set = new Set(micDeviceIds.value)
  if (set.has(deviceId)) {
    set.delete(deviceId)
  } else if (set.size >= MULTI_TRACK_LIMITS.maxTracks) {
    micListError.value = `单次最多选 ${MULTI_TRACK_LIMITS.maxTracks} 路音频输入`
    return
  } else {
    set.add(deviceId)
  }
  micListError.value = ''
  micDeviceIds.value = [...set]
}

// 按「设备轨」给一句话打归属：依据是能量主导的那一路设备，不是声纹。
// 单轨 / 时间点落在静音 run / 传不进 runs 时返回 null，调用方保持「说话人未区分」。
function trackSpeakerFields(runs, trackCount, startMs) {
  if (!Array.isArray(runs) || trackCount < 2) return null
  const run = speakerAt(runs, startMs)
  if (!run || run.trackIndex < 0) return null
  return {
    speaker: `track${run.trackIndex + 1}`,
    speakerLabel: `设备轨 ${run.trackIndex + 1}${run.trackLabel ? ` · ${run.trackLabel}` : ''}`,
    speakerDiarized: true,
    speakerBasis: 'device_track'
  }
}

// 用完整录音的 runs 重算一次全量归属：录制中的增量快照是局部的（末段 run 还在桥接），
// 停录后以最终结果为准，避免同一次会议前后标签不一致。
function applyFinalAttribution(result) {
  recAttribution.value = result?.attribution || null
  recTracks.value = result?.tracks || []
  const runs = result?.attribution?.runs
  const trackCount = result?.trackCount || 0
  if (!Array.isArray(runs) || trackCount < 2) return
  let changed = false
  for (const row of live.utterances) {
    const hit = trackSpeakerFields(runs, trackCount, row.startMs)
    if (!hit) continue
    row.speaker = hit.speaker
    row.speakerLabel = hit.speakerLabel
    row.speakerDiarized = true
    row.speakerBasis = hit.speakerBasis
    changed = true
  }
  // 洞察里冗余存了 speaker，归属改了要重算一遍，否则同一句话两处标注不一致
  if (changed) live.insights = deriveInsights(live.utterances)
}

function stopRecClock() {
  if (recClockTimer) {
    clearInterval(recClockTimer)
    recClockTimer = null
  }
}

function startRecClock() {
  if (recClockTimer) return
  recClockTimer = setInterval(() => {
    recElapsedMs.value = Date.now() - recStartedAt
  }, 250)
}

function releaseRecWav() {
  if (recWavUrl.value) {
    URL.revokeObjectURL(recWavUrl.value)
    recWavUrl.value = ''
  }
}

async function startRealRecording() {
  recError.value = ''
  if (!isMultiTrackSupported()) {
    recState.value = 'unsupported'
    recError.value = '当前环境不支持麦克风采集：需要 HTTPS 或 localhost，且浏览器允许麦克风权限'
    return
  }
  // 勾了设备就按勾的采（一人一麦按设备归属说话人）；没勾就用系统默认输入（单轨，不标说话人）
  const targets = micDeviceIds.value.length ? micDeviceIds.value : ['']
  try {
    // 先真正拿到音频流，再启动逐句推流，避免出现「界面在跑、麦克风没开」的假录音
    recHandle = await startMultiTrackCapture({
      deviceIds: targets,
      labels: Object.fromEntries(micDevices.value.map((d) => [d.deviceId, d.label])),
      onLevel: ({ index, rms }) => {
        recLevels[index] = rms
        recLevel.value = Object.values(recLevels).reduce((max, v) => (v > max ? v : max), 0)
      }
    })
  } catch (e) {
    recState.value = 'error'
    recError.value = `无法打开音频输入：${e.message}`
    // 失败了也让用户能改选设备
    refreshAudioInputs()
    return
  }
  recTracks.value = recHandle.tracks.map((t) => ({
    index: t.index,
    label: t.label,
    deviceId: t.deviceId
  }))
  recAttribution.value = null
  Object.keys(recLevels).forEach((k) => delete recLevels[k])
  recLevel.value = 0
  releaseRecWav()
  recResult.value = null
  resetAsrState()
  recStartedAt = Date.now()
  recElapsedMs.value = 0
  recState.value = 'recording'
  startRecClock()
  // 拿到麦克风后设备名才可见（未授权时 label 为空）：补刷一次清单
  refreshAudioInputs()
  // 用户在「重开确认」里点了取消 → 回滚已经打开的麦克风，不留半截录音
  if (!beginLive({ mode: 'mic' })) {
    resetRealRecording()
    return
  }
  // 会话已就绪：开始采集中增量转写（真实链路）
  startAsrTimer()
}

async function stopRealRecording() {
  await stopMicCapture()
  // 采集停了才收会议：先把尾巴转写完，再拿真实句子跑总结
  if (live.status !== 'idle') await finishMeeting()
}

// 停采集 + 归一化留档；不含会议收尾，供「停止录音」与「结束并生成总结」复用
async function stopMicCapture() {
  if (!recHandle) return
  const handle = recHandle
  recHandle = null
  stopRecClock()
  stopAsrTimer()
  recLevel.value = 0
  try {
    const result = await stopMultiTrackCapture(handle)
    recResult.value = result
    // 用完整录音的归属结果重算一遍全量句子（录制中的增量快照是局部的）
    applyFinalAttribution(result)
    recState.value = 'done'
    releaseRecWav()
    recWavUrl.value = URL.createObjectURL(new Blob([result.wav], { type: 'audio/wav' }))
  } catch (e) {
    recState.value = 'error'
    recError.value = `音频归一化失败：${e.message}`
  }
}

function resetRealRecording() {
  if (recHandle) {
    stopMultiTrackCapture(recHandle).catch(() => {})
    recHandle = null
  }
  stopRecClock()
  stopAsrTimer()
  recLevel.value = 0
  Object.keys(recLevels).forEach((k) => delete recLevels[k])
  recTracks.value = []
  recAttribution.value = null
  releaseRecWav()
  recResult.value = null
  recError.value = ''
  recElapsedMs.value = 0
  recState.value = 'idle'
}

// 清空本次转写游标与结果（新一场会议开始时调用，避免两场会议的句子混在一起）
function resetAsrState() {
  stopAsrTimer()
  asrError.value = ''
  asrErrorHint.value = ''
  asrErrorCode.value = ''
  asrBusy.value = false
  asrDoneMs.value = 0
  asrPendingMs.value = 0
  asrCommittedEndMs = 0
  asrIdCounter = 0
}

// ---- 本地 Whisper 离线转写：「实时记录」的真实内容来源 ----
// 边界（勿放宽）：
// 1. PCM 只在本页内存里过推理管线，不 fetch、不上传、不写后端；
// 2. 说话人分离本地未实现（Whisper 不做声纹聚类），行内一律「说话人未区分」，不编人名；
// 3. 转写失败/无语音就如实显示 0 句 + 错误，**绝不回落示例转写稿**。
const asrModel = ref(LOCAL_ASR_DEFAULT_MODEL)
const asrPhase = ref(ASR_PHASES.idle)
const asrDetail = ref('')
const asrError = ref('')
// 失败分类给出的「下一步怎么办」，与主文案分开渲染，避免一长句挤在状态条里
const asrErrorHint = ref('')
// 失败分类的 code（weights/assets/lib/engine/memory/runtime/noAudio/unknown）。
// 只存文案不够用：总结面板要据此区分「转写引擎/资源不可用」与「真的一段语音都没有」——
// 两者都是 0 句，但一个是故障、一个是真实结论，混成一句就是把故障说成会议室太安静。
const asrErrorCode = ref('')
const asrProgress = ref({ file: '', loaded: 0, total: 0, percent: 0 })
const asrBusy = ref(false)
const asrDoneMs = ref(0) // 已交给推理的音频时长（时间游标）
const asrPendingMs = ref(0) // 已采到但还没转写的音频时长
// 增量转写参数：攒够 3s 才送一次（再短中文识别质量明显下降）；
// 相邻窗口留 1.2s 重叠，重叠区重复识别的句段按时间游标丢弃；
// 单窗上限 30s，避免一次吃满 wasm 内存把页面卡死。
const ASR_MIN_CHUNK_MS = 3000
const ASR_TAIL_MIN_MS = 400
const ASR_OVERLAP_MS = 1200
const ASR_MAX_WINDOW_MS = 30000
const ASR_DEDUPE_GRACE_MS = 120
const ASR_TICK_MS = 2500
const ASR_LANGUAGE = 'chinese'

let asrEngine = null
let asrTimer = null
let asrCommittedEndMs = 0
let asrIdCounter = 0

const asrPhaseText = computed(() => ASR_PHASES[asrPhase.value] || '未加载')
const asrPercent = computed(() => asrProgress.value.percent || 0)
const asrLoadedText = computed(() =>
  asrProgress.value.total
    ? `${(asrProgress.value.loaded / 1048576).toFixed(1)} / ${(asrProgress.value.total / 1048576).toFixed(1)} MB`
    : ''
)
const asrModelLabel = computed(
  () => LOCAL_ASR_MODELS.find((m) => m.id === asrModel.value)?.label || asrModel.value
)
const asrStatusText = computed(() => {
  if (asrError.value) return asrError.value
  if (asrBusy.value) return `转写中 · 正在处理 ${(asrPendingMs.value / 1000).toFixed(1)}s 新音频`
  if (asrPhase.value === ASR_PHASES.loading) return '首次使用：正在下载模型权重到浏览器缓存'
  if (asrDoneMs.value > 0) return `已转写 ${(asrDoneMs.value / 1000).toFixed(1)}s 音频`
  if (asrPhase.value === ASR_PHASES.ready) return '模型已就绪，等待音频'
  return '尚未开始转写'
})

function ensureAsrEngine() {
  if (asrEngine) return asrEngine
  asrEngine = createLocalAsr({
    model: asrModel.value,
    onPhase: (phase, detail) => {
      asrPhase.value = phase
      asrDetail.value = detail || ''
    },
    onProgress: (p) => {
      asrProgress.value = p
    }
  })
  return asrEngine
}

function stopAsrTimer() {
  if (asrTimer) {
    clearInterval(asrTimer)
    asrTimer = null
  }
}

// 录制中按固定节奏取「到此刻为止」的按轨混音快照做增量转写；不打断采集、不清空缓冲。
// 快照同时带回各轨归属 runs，供逐句打「设备轨」标签（单轨时 runs 只有一条，不标）。
function startAsrTimer() {
  if (asrTimer) return
  asrTimer = setInterval(() => {
    if (!recHandle) return
    const snapshot = collectMultiTrackSnapshot(recHandle)
    if (!snapshot) return
    recAttribution.value = snapshot
    recTracks.value = snapshot.trackStats.map((s) => ({
      index: s.index,
      label: s.label,
      deviceId: s.deviceId
    }))
    runAsrWindow(snapshot.mixed, snapshot.sampleRate)
  }, ASR_TICK_MS)
}

function waitAsrIdle(maxMs = 120000) {
  const started = Date.now()
  return new Promise((resolve) => {
    const check = () => {
      if (!asrBusy.value || Date.now() - started > maxMs) return resolve()
      setTimeout(check, 200)
    }
    check()
  })
}

// 转写一个窗口。返回本次推进到的时间戳（ms）；0 = 跳过（窗口不足 / 上一次还没跑完 / 出错）。
// 即使这一段是静音也要推进游标，否则下一轮会在原地打转。
async function runAsrWindow(samples, sourceRate, { minMs = ASR_MIN_CHUNK_MS } = {}) {
  if (asrBusy.value) return 0
  if (!samples || !samples.length || !sourceRate) return 0
  const totalMs = (samples.length / sourceRate) * 1000
  asrPendingMs.value = Math.max(0, Math.round(totalMs - asrCommittedEndMs))
  if (totalMs - asrCommittedEndMs < minMs) return 0

  asrBusy.value = true
  try {
    const engine = ensureAsrEngine()
    const fromMs = asrCommittedEndMs > 0 ? Math.max(0, asrCommittedEndMs - ASR_OVERLAP_MS) : 0
    const toMs = Math.min(totalMs, fromMs + ASR_MAX_WINDOW_MS)
    const fromSample = Math.floor((fromMs / 1000) * sourceRate)
    const toSample = Math.min(samples.length, Math.ceil((toMs / 1000) * sourceRate))
    // 模型吃 16k mono；源采样率的样本先重采样
    const pcm = resampleTo16k(samples.subarray(fromSample, toSample), sourceRate)
    const result = await engine.transcribe(pcm, { offsetMs: fromMs, language: ASR_LANGUAGE })
    const attribution = recAttribution.value
    const rows = engine
      .toUtterances(result, { idPrefix: 'asr' })
      // 重叠区会被重复识别：丢掉结束时间早于上次提交点的句段
      .filter((u) => u.endMs > asrCommittedEndMs + ASR_DEDUPE_GRACE_MS)
      .map((u) => ({ ...u, id: `asr-${++asrIdCounter}` }))
      // 多轨时按「设备轨」覆写说话人；单轨 / 未命中保持 Whisper 的「说话人未区分」
      .map((u) => {
        const hit = trackSpeakerFields(attribution?.runs, recTracks.value.length, u.startMs)
        return hit ? { ...u, ...hit } : u
      })

    if (rows.length) {
      loadUtterances(live, rows)
      scrollStreamToEnd()
    }
    asrCommittedEndMs = Math.max(
      asrCommittedEndMs,
      ...rows.map((u) => u.endMs),
      Math.round(toMs)
    )
    asrDoneMs.value = Math.round(asrCommittedEndMs)
    asrPendingMs.value = Math.max(0, Math.round(totalMs - asrCommittedEndMs))
    asrError.value = ''
    asrErrorHint.value = ''
    asrErrorCode.value = ''
    return Math.round(toMs)
  } catch (e) {
    // 失败分类：区分「权重下载 / 库加载 / 推理环境 / 内存 / 推理期」，各自给一条可操作提示
    const failure = describeAsrFailure(e, asrPhase.value)
    asrError.value = failure.text
    asrErrorHint.value = failure.hint
    asrErrorCode.value = failure.code
    return 0
  } finally {
    asrBusy.value = false
  }
}

// 停录后把尾巴补齐：录音期间是「边录边转」，最后不足一个窗口的余量在这里一次结清
async function flushRealTranscription() {
  await waitAsrIdle()
  const result = recResult.value
  if (!result || !result.pcm || !result.pcm.length) {
    if (!asrError.value) {
      const failure = describeAsrNoAudio()
      asrError.value = failure.text
      asrErrorHint.value = failure.hint
      asrErrorCode.value = failure.code
    }
    return 0
  }
  let guard = 0
  let windows = 0
  while (guard < 400) {
    guard += 1
    const advanced = await runAsrWindow(result.pcm, 16000, { minMs: ASR_TAIL_MIN_MS })
    if (!advanced) break
    windows += 1
  }
  return windows
}

const sourceUtterances = computed(() => fixtures[selectedFixture.value]?.utterances || [])
const liveStats = computed(() => summarizeSession(live))
const liveProgress = computed(() => liveStats.value.progress)
// 记录来源：fixture = 示例会议演示；mic = 本机麦克风 + 本地 Whisper 真实转写
const liveSource = ref('fixture')
const isRealLive = computed(() => liveSource.value === 'mic')
// 说话人只在「确实有归属依据」时才报数字：多轨按「设备轨」归属（不是声纹），
// 单轨一律如实说未区分 —— 一只麦分不出谁在说，凑一个说话人数就是编数字。
const liveSpeakerText = computed(() => {
  const s = liveStats.value
  if (!s.utteranceCount) return '尚无转写内容'
  if (!s.speakerDiarized) return '说话人未区分 · 本地未做声纹分离'
  const hasDeviceTrack = live.utterances.some(
    (u) => u.speakerDiarized === true && u.speakerBasis === 'device_track'
  )
  if (hasDeviceTrack) return `${s.speakerCount} 路设备轨 · 按设备归属（非声纹）`
  return `${s.speakerCount} 位说话人`
})
// 真实转写的总时长录制前不可知，只报「已转写多少」；示例稿才有 N/总 的进度
const liveProgressText = computed(() =>
  isRealLive.value
    ? `${liveStats.value.utteranceCount} 句 · 已转写 ${(asrDoneMs.value / 1000).toFixed(1)}s`
    : `${liveStats.value.utteranceCount}/${live.total || 0} 句`
)
// 录音中优先显示真实采集时长（墙上时钟），未录音时回落到演示推流计时
const liveClock = computed(() =>
  formatDuration(recState.value === 'recording' ? recElapsedMs.value : liveElapsedMs.value)
)

// 命中标签：与 AI 分析同源（同一份 classifyUtterance），只标注本句，不跨句推断
const hitMap = computed(() => {
  const map = {}
  for (const row of live.utterances) {
    const kind = classifyUtterance(row.text)
    if (kind) map[row.id] = INSIGHT_KINDS.find((item) => item.id === kind).label
  }
  return map
})

const summaryStateText = computed(() => {
  if (article.value) return '已整合输出稿件'
  if (draft.value) return '已生成纪要草稿 · 待人工确认'
  if (live.status === 'idle') return '尚未开始记录'
  if (live.status === 'finished') return '记录已结束 · 待生成总结'
  return '记录中 · 可随时结束并生成总结'
})

function stopLiveTimers() {
  if (livePumpTimer) {
    clearInterval(livePumpTimer)
    livePumpTimer = null
  }
  if (liveClockTimer) {
    clearInterval(liveClockTimer)
    liveClockTimer = null
  }
}

function scrollStreamToEnd() {
  nextTick(() => {
    const el = streamEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function startLiveClock() {
  if (liveClockTimer) return
  liveClockTimer = setInterval(() => {
    liveElapsedMs.value += 1000
  }, 1000)
}

function pumpLive() {
  const pushed = pushNextUtterance(live, sourceUtterances.value)
  scrollStreamToEnd()
  // 转写稿推完即停推流；会话仍是「记录中」，等用户点「结束并生成总结」
  if (!pushed && livePumpTimer) {
    clearInterval(livePumpTimer)
    livePumpTimer = null
  }
}

function startLivePump() {
  if (livePumpTimer) return
  if (live.cursor >= sourceUtterances.value.length) return
  livePumpTimer = setInterval(pumpLive, LIVE_STEP_MS)
}

// 重建实时会话：同一个 reactive 代理原地重写，模板里的 ref 不失效
function resetLiveStream({ keepManual = false, keepTopic = true } = {}) {
  stopLiveTimers()
  const manualNotes = keepManual ? [...live.manualNotes] : []
  const projectId = live.projectId
  const topic = keepTopic ? live.topic : ''
  Object.assign(live, createLiveSession({ projectId, meetingType: config.meetingType }))
  // 主题留空交给用户填（输入框已有示例占位），不替用户编一个「未命名会议」
  live.topic = topic
  live.manualNotes = manualNotes
  liveElapsedMs.value = 0
  // 真实录音进行中不动采集时长（beginLive 会在 startRealRecording 之后调用本函数）
  if (recState.value !== 'recording') recElapsedMs.value = 0
}

// 清掉上一次会议的草稿 / 稿件 / 导出状态，避免两场会议的内容混在同一个工作台里
function clearSummaryOutput() {
  stopTimer()
  runner.value = null
  run.value = null
  running.value = false
  runMode.value = ''
  activeEvidence.value = ''
  article.value = null
  articleCheck.value = null
  articleError.value = ''
  exportError.value = ''
  savedNotice.value = ''
  storeError.value = ''
}

function onLiveProject(event) {
  setSessionProject(live, event.target.value)
}

// 返回 true = 会话已启动；false = 被用户取消或状态不允许（调用方需回滚）
// mode='mic' 时不推示例稿、不起推流计时器：句子等本地 Whisper 真实转写出来
function beginLive(options = {}) {
  const mode = options?.mode === 'mic' ? 'mic' : 'fixture'
  if (live.status === 'recording' || live.status === 'paused') return false
  const hasContent = live.utterances.length || live.manualNotes.length || Boolean(draft.value)
  if (
    hasContent &&
    !window.confirm(
      '开始新会议会清空当前实时记录与已生成的总结。\n（已保存到本地的草稿版本仍在保存列表里，可重新载入。）\n是否继续？'
    )
  ) {
    return false
  }
  resetLiveStream({ keepManual: false, keepTopic: true })
  clearSummaryOutput()
  live.meetingType = config.meetingType
  liveSource.value = mode
  if (mode === 'mic') {
    resetAsrState()
    live.total = 0
    startSession(live)
    startLiveClock()
    return true
  }
  live.total = sourceUtterances.value.length
  startSession(live)
  startLiveClock()
  pumpLive()
  startLivePump()
  return true
}

function pauseLive() {
  pauseSession(live)
  stopLiveTimers()
  // 暂停记录就是暂停采集侧增量转写
  if (isRealLive.value) stopAsrTimer()
}

function resumeLive() {
  resumeSession(live)
  startLiveClock()
  if (isRealLive.value) {
    startAsrTimer()
    return
  }
  startLivePump()
}

// 收尾会议：停表 → 补齐真实转写 → 用同一份真实句子跑总结
async function finishMeeting() {
  stopLiveTimers()
  stopAsrTimer()
  finishSession(live)
  scrollStreamToEnd()
  if (isRealLive.value) await flushRealTranscription()
  startRun({
    utterances: isRealLive.value ? live.utterances : null,
    audio: isRealLive.value ? realAudioFacts() : null
  })
}

// 总结面板的「生成总结 / 重新生成总结」：按**已采集到的内容**重跑一次链路。
//
// 这里绝不能写成 startRun()（不传参）：不传参 = 示例会议稿演示路径，
// createRun 会认为「没有真实内容」，把示例稿的演示文案（联调/压测/里程碑…）
// 当成这场会议的结论 —— 这就是「总结依旧是硬编码」的来源。
// 真实场次即使一句都没转出来，也要把空数组传下去，让草稿如实留空待人工确认。
function generateSummary() {
  if (isRealLive.value) {
    // 还在记录/暂停时先让用户走「结束会议」：那边会停表并 flush 尾段转写，
    // 直接在这里跑会漏掉最后一截音频。
    if (live.status !== 'finished') return
    // 拷贝一份快照，避免链路跑到一半时 live.utterances 又被增量转写改动
    startRun({ utterances: [...live.utterances], audio: realAudioFacts() })
    return
  }
  // 示例场次（演示路径）：明确用示例稿跑，来源标记与日志都写「示例转写稿」
  startRun()
}

// 真实录音的音频事实：交给链路报告真实时长/采样率，避免用示例稿时长冒充
function realAudioFacts() {
  const r = recResult.value
  if (!r) return null
  return {
    audioRef: 'browser_microphone_recording',
    source: 'browser_microphone',
    durationMs: r.durationMs,
    sampleRate: r.sampleRate,
    channels: r.channels,
    voiceSegments: r.segments?.length ?? 0
  }
}

// 「真实录音却 0 句」的成因判别 —— 实时记录面板与总结面板都靠它决定文案。
//
// 为什么必须分开：这几种情况表面都是「一句话都没转出来」，但性质完全不同，
// 混成一句「暂无内容」就会把**故障**说成**会议室太安静**，或者反过来把
// **真实结论（这段音频确实没人说话）**说成故障。判定依据只有两个真值：
//   asrErrorCode（转写引擎/资源是否挂了） + recResult.segments.length（有没有语音段）。
// 返回 '' = 不适用（示例链路 / 还没采到音频 / 已经转出句子）。
const liveEmptyCase = computed(() => {
  if (!isRealLive.value) return ''
  if (live.utterances.length) return ''
  // 有失败就是失败，优先于「没语音」——引擎没跑起来时根本没资格下「没人说话」的结论
  if (asrErrorCode.value) return asrErrorCode.value === 'noAudio' ? 'noAudio' : 'engine'
  const r = recResult.value
  if (!r) return ''
  return (r.segments?.length ?? 0) > 0 ? 'noText' : 'silent'
})

const liveEmptyInfo = computed(() => {
  const kind = liveEmptyCase.value
  if (!kind) return null
  const r = recResult.value
  const durSec = r ? (r.durationMs / 1000).toFixed(1) : '0'
  const segCount = r?.segments?.length ?? 0
  if (kind === 'engine') {
    return {
      tone: 'warn',
      title: asrError.value || '本机离线转写不可用',
      detail:
        asrErrorHint.value ||
        '转写引擎没跑起来，这段音频压根没进入识别。这是**故障**，不代表团里没人说话。'
    }
  }
  if (kind === 'noAudio') {
    return {
      tone: 'warn',
      title: '本次录音没有采到音频',
      detail:
        '麦克风可能被静音、选错了输入设备，或单段时长不足 0.4s。请确认输入设备后重新录一次。'
    }
  }
  if (kind === 'silent') {
    return {
      tone: 'plain',
      title: `录到 ${durSec}s 音频，但一段语音都没检测到`,
      detail:
        r && r.durationMs >= 3000
          ? '时长不短却全程静音或只有底噪：优先检查输入设备是否选错、系统与设备上的麦克风是否被静音。'
          : '有效时长太短（不足 3s），基本没有能成为纪要的内容。'
    }
  }
  return {
    tone: 'plain',
    title: `检测到 ${segCount} 段语音，但一个字都没转出来`,
    detail:
      '常见原因是语种不在模型支持范围、录音音量过低，或这几段其实是非人声噪声。音频时长与段数已保留，可下载留档核对。'
  }
})

let endingLive = false

async function endLive() {
  if (live.status === 'idle' || endingLive) return
  endingLive = true
  try {
    // 还在录就先把麦克风真正停掉，避免「会议结束了、采集还在跑」
    if (recHandle) await stopMicCapture()
    await finishMeeting()
  } finally {
    endingLive = false
  }
}

function resetLive() {
  resetRealRecording()
  resetLiveStream({ keepManual: false, keepTopic: true })
  clearSummaryOutput()
  liveSource.value = 'fixture'
  manualText.value = ''
  manualError.value = ''
  scrollStreamToEnd()
}

function submitManual() {
  const result = addManualNote(live, { kind: manualKind.value, text: manualText.value })
  if (!result.ok) {
    manualError.value =
      {
        EMPTY_TEXT: '记录内容不能为空',
        BAD_KIND: '记录类型不合法',
        NO_SESSION: '会话未就绪'
      }[result.error] || '添加失败'
    return
  }
  manualError.value = ''
  manualText.value = ''
}

function removeManual(id) {
  removeManualNote(live, id)
}

// ---- T-030 真实音频采集：浏览器本地，不接云、不上传 ----
const cloudDeps = CLOUD_DEPENDENCIES
const cloudMode = computed(() => cloudReadiness().adapterMode)
const audioState = ref('idle')
const audioResult = shallowRef(null)
const audioError = ref('')
const level = ref(0)
const capturing = computed(() => audioState.value === 'recording')
const levelPct = computed(() => Math.min(100, Math.round(level.value * 400)))
const audioStatusText = computed(
  () =>
    ({
      idle: '待采集',
      recording: '采集中（本地）',
      done: '归一化完成',
      error: '失败',
      unsupported: '环境不支持'
    })[audioState.value] || '—'
)
let captureHandle = null

async function beginCapture() {
  audioError.value = ''
  if (!isCaptureSupported()) {
    audioState.value = 'unsupported'
    audioError.value = '当前环境不支持 getUserMedia / AudioContext（需 HTTPS 或 localhost）'
    return
  }
  try {
    captureHandle = await startCapture({ onLevel: (v) => (level.value = v) })
    audioResult.value = null
    audioState.value = 'recording'
  } catch (e) {
    audioState.value = 'error'
    audioError.value = `无法开始采集：${e.message}`
  }
}

async function endCapture() {
  if (!captureHandle) return
  const handle = captureHandle
  captureHandle = null
  try {
    audioResult.value = await stopCapture(handle)
    audioState.value = 'done'
  } catch (e) {
    audioState.value = 'error'
    audioError.value = `归一化失败：${e.message}`
  } finally {
    level.value = 0
  }
}

// ---- S5 人工确认闭环：field_overlay 编辑 / 保存 / 定稿冻结 / 导出 ----
// AI 原草稿不可变；人工修改只写 overlay。dev 态持久化到 localStorage，生产为 DB（契约已定义，未实现）。
const store = shallowRef(null)
const storeTick = ref(0)
const savedNotice = ref('')
const storeError = ref('')
const editInputs = reactive({})
const rejectInputs = reactive({})
const savedIndex = ref([])
const publishBlockers = ref([])

const mergedFields = computed(() => {
  storeTick.value // 显式依赖，store 内部 state 变更后触发重算
  return store.value ? store.value.getMerged() : []
})
const displayFields = computed(() =>
  mergedFields.value.length ? mergedFields.value : draft.value?.fields || []
)
const storeKey = computed(() => store.value?.storageKey || `${STORAGE_PREFIX}<runVersion>`)
const isFrozen = computed(() => {
  storeTick.value
  return Boolean(store.value?.state.publishedAt)
})
const overlayCount = computed(() => {
  storeTick.value
  return store.value ? Object.keys(store.value.state.overlay).length : 0
})
const requiredKeys = computed(() =>
  schemaOf(draft.value?.template?.id || config.meetingType).required
)
const publishedSnapshot = computed(() => {
  storeTick.value
  return store.value?.state.snapshot || null
})
const savedAt = computed(() => {
  storeTick.value
  return store.value?.state.updatedAt || null
})
const auditCount = computed(() => {
  storeTick.value
  return store.value?.state.audit.length || 0
})
const auditRows = computed(() => {
  storeTick.value
  return (store.value?.state.audit || []).slice(-5).reverse()
})

function syncStore() {
  storeTick.value += 1
  savedIndex.value = listSaved()
  publishBlockers.value = store.value
    ? store.value.canPublish(requiredKeys.value).blockers
    : []
}

function resetInputs(fields) {
  Object.keys(editInputs).forEach((k) => delete editInputs[k])
  Object.keys(rejectInputs).forEach((k) => delete rejectInputs[k])
  fields.forEach((f) => {
    editInputs[f.fieldId] = f.value ?? ''
    rejectInputs[f.fieldId] = ''
  })
}

// ---- FR-14 数据生命周期（SEC-07）：留存期限 / 到期清理 / 主动删除 ----
// 留存默认 90 天是 Q-04 未确认前的估算值，页面必须标注「待确认」，不得当成已拍板策略。
// 删除对象是浏览器本地的纪要草稿与中间产物；音频在本页从未落盘（只在内存 + 用户手动下载），
// 因此不谎称「已删除服务端音频」。删除后只保留脱敏统计与审计记录。
const retentionPolicy = ref(readRetentionPolicy())
const retentionTick = ref(0)
const retentionNotice = ref('')
const retentionDays = computed(() => retentionPolicy.value.days)
const retentionIsDefault = computed(() => retentionPolicy.value.source !== 'admin')
const retentionDaysDraft = ref(retentionPolicy.value.days)
const retentionSourceText = computed(() =>
  retentionIsDefault.value
    ? `默认 ${DEFAULT_RETENTION_DAYS} 天 · Q-04 待确认`
    : `管理员配置 · ${retentionPolicy.value.configuredAt}`
)
const retentionAudit = computed(() => {
  retentionTick.value
  return listRetentionAudit()
})
const retentionPlan = computed(() => {
  retentionTick.value
  return buildPurgePlan(savedIndex.value, { days: retentionDays.value })
})
const retentionSummary = computed(() => {
  const c = retentionPlan.value.counts
  const parts = [`共 ${c.total} 条`, `到期 ${c.expired}`, `临期 ${c.expiring}`, `保留 ${c.active}`]
  // 时间无法解析的条目不动它：宁可留一条人工确认，也不误删用户数据
  if (c.unknown) parts.push(`时间未知 ${c.unknown}（不自动删）`)
  return parts.join(' · ')
})

function applyRetentionDays() {
  const raw = Number(retentionDaysDraft.value)
  if (!Number.isFinite(raw) || raw <= 0) {
    retentionNotice.value = `留存期限需为 ${RETENTION_DAYS_MIN}~${RETENTION_DAYS_MAX} 之间的整数天`
    return
  }
  retentionPolicy.value = writeRetentionPolicy(raw)
  retentionDaysDraft.value = retentionPolicy.value.days
  retentionTick.value += 1
  retentionNotice.value = `留存期限已设为 ${retentionPolicy.value.days} 天（本地配置；生产应由服务端策略下发）`
}

function runRetentionSweep() {
  const result = purgeExpired({ days: retentionDays.value })
  retentionTick.value += 1
  savedIndex.value = listSaved()
  if (!result.purged.length) {
    retentionNotice.value = `没有到期数据需要清理（扫描 ${result.summary.scanned} 条）`
    return
  }
  retentionNotice.value =
    `已清理 ${result.purged.length} 条到期草稿（音频 / 转写 / 中间产物 / embedding 一并删除）；` +
    `仅保留脱敏统计与审计记录`
}

function previewRetentionSweep() {
  const plan = retentionPlan.value
  retentionNotice.value = plan.counts.expired
    ? `待清理 ${plan.counts.expired} 条（最早到期 ${plan.expired[plan.expired.length - 1]?.expiry || '—'}）`
    : '当前没有到期数据'
}

// 用户主动删除权：删的是「本地保存副本」与中间产物，不动屏幕上正在看的内容
function deleteSavedDraft(runVersion) {
  const version = runVersion || store.value?.state.runVersion
  if (!version) {
    retentionNotice.value = '当前没有可删除的草稿版本'
    return
  }
  if (
    !window.confirm(
      `删除草稿 ${version} 的本地保存副本与中间产物？\n` +
        `保留：脱敏统计与审计记录。\n\n此操作不可恢复。`
    )
  ) {
    return
  }
  const result = deleteDraftByVersion(version, { reason: 'user_delete' })
  retentionTick.value += 1
  savedIndex.value = listSaved()
  if (!result.deleted) {
    retentionNotice.value =
      result.reason === 'NOT_FOUND' ? '该版本尚未保存到本地，无需删除' : `删除失败：${result.reason}`
    return
  }
  retentionNotice.value =
    `已删除 ${version} 的本地草稿（${result.stats.fields} 个字段 / ${result.stats.audit} 条审计一并清除）；` +
    `已写入删除审计 SM-${result.auditEntry.seq}`
}

// ---- P5 整合输出稿件：草稿 → 成稿 ----
// 云 LLM 密钥未就绪，走 localCompositionAdapter（规则式确定性整合）；云侧只固化同构骨架。
// 稿件必须基于 mergedFields（含人工 overlay），字段一变即判定过期，禁止导出与当前草稿不一致的旧稿。
const article = shallowRef(null)
const articleCheck = shallowRef(null)
const articleError = ref('')
const articleCopied = ref(false)
const compReadiness = cloudCompositionReadiness()
const compContractCheck = compositionAdapterContractCheck(localCompositionAdapter)

const compositionInput = computed(() => {
  storeTick.value // 显式依赖：人工编辑 / 确认 / 驳回都会改变输入指纹
  if (!draft.value || !store.value) return null
  return {
    draft: draft.value,
    mergedFields: mergedFields.value,
    utterances: run.value?.artifacts?.transcript?.utterances || [],
    backgroundSpans: contractArtifact.value?.backgroundSpans || [],
    injectionEvents: draft.value.injectionEvents || [],
    meetingLabel: fixtureOptions.find((f) => f.key === selectedFixture.value)?.label || ''
  }
})

const articleStale = computed(() => {
  const input = compositionInput.value
  if (!article.value || !input) return false
  return !isCompositionCurrent(article.value, input)
})

const canExportArticle = computed(() =>
  Boolean(article.value && isFrozen.value && !articleStale.value && articleCheck.value?.passed)
)

function doCompose() {
  const input = compositionInput.value
  if (!input) return
  try {
    const a = composeArticle(input)
    const check = validateArticle(a, input)
    article.value = a
    articleCheck.value = check
    articleCopied.value = false
    articleError.value = check.passed
      ? ''
      : `稿件校验未通过：${check.results.filter((r) => !r.passed).map((r) => r.id).join('、')}`
    savedNotice.value = debugMode.value
      ? `本地整合完成 ${a.stats.sectionCount} 段 / ${a.stats.evidenceRefCount} 处证据 · ${a.fingerprint}`
      : '已生成整合稿件，可直接阅读全文'
  } catch (e) {
    article.value = null
    articleCheck.value = null
    articleError.value = e.message
  }
}

async function copyArticle() {
  if (!canExportArticle.value) return
  articleCopied.value = await writeClipboard(article.value.markdown)
  setTimeout(() => (articleCopied.value = false), 1500)
}

watch(
  draft,
  (d) => {
    storeError.value = ''
    savedNotice.value = ''
    // 新草稿 = 新 RunVersion，旧稿件的输入指纹失效，必须重新整合
    article.value = null
    articleCheck.value = null
    articleError.value = ''
    articleCopied.value = false
    if (!d) {
      store.value = null
      resetInputs([])
      syncStore()
      return
    }
    const s = createDraftStore(d)
    const restored = s.load() // 刷新页面自动恢复上次的人工作业
    store.value = s
    resetInputs(s.getMerged())
    savedNotice.value = restored ? '已自动恢复本地保存的编辑' : ''
    syncStore()
  },
  { immediate: true }
)

function guardEditable() {
  if (!store.value) return false
  if (isFrozen.value) {
    storeError.value = '已定稿冻结，不可回草稿态；需重跑生成新版本'
    return false
  }
  return true
}

function doEdit(fieldId) {
  if (!guardEditable()) return
  try {
    store.value.edit(fieldId, editInputs[fieldId])
    storeError.value = ''
    savedNotice.value = '字段已修改（尚未保存到本地）'
    syncStore()
  } catch (e) {
    storeError.value = e.message
  }
}

function doConfirm(fieldId) {
  if (!guardEditable()) return
  const current = mergedFields.value.find((f) => f.fieldId === fieldId)
  store.value.confirm(fieldId, current?.value ?? editInputs[fieldId])
  savedNotice.value = '字段已确认（尚未保存到本地）'
  syncStore()
}

function doReject(fieldId) {
  if (!guardEditable()) return
  try {
    store.value.reject(fieldId, rejectInputs[fieldId])
    storeError.value = ''
    savedNotice.value = '字段已驳回（尚未保存到本地）'
    syncStore()
  } catch (e) {
    storeError.value = e.message
  }
}

function doResetField(fieldId) {
  if (!guardEditable()) return
  store.value.resetField(fieldId)
  const ai = draft.value.fields.find((f) => f.fieldId === fieldId)
  editInputs[fieldId] = ai?.value ?? ''
  rejectInputs[fieldId] = ''
  savedNotice.value = '已还原为 AI 原值'
  syncStore()
}

function doSave() {
  if (!store.value) return
  const r = store.value.save()
  savedNotice.value = debugMode.value ? `已保存 → ${r.key}` : '草稿已保存在本浏览器'
  storeError.value = ''
  syncStore()
}

function doLoad() {
  if (!store.value) return
  const ok = store.value.load()
  resetInputs(store.value.getMerged())
  savedNotice.value = ok ? '已载入保存的草稿' : '暂无该会议的保存草稿'
  syncStore()
}

function doClear() {
  if (!draft.value) return
  store.value.clear()
  const fresh = createDraftStore(draft.value)
  store.value = fresh
  resetInputs(fresh.getMerged())
  savedNotice.value = '已清除本地草稿'
  syncStore()
}

function doPublish() {
  if (!guardEditable()) return
  const check = store.value.canPublish(requiredKeys.value)
  if (!check.ok) {
    storeError.value = `不可定稿：${check.blockers.join('、')}`
    return
  }
  try {
    store.value.publish(requiredKeys.value)
    store.value.save()
    storeError.value = ''
    savedNotice.value = debugMode.value
      ? '已定稿冻结（快照已写入本地，不可回草稿态）'
      : '已定稿，内容已冻结；如需修改请重新生成'
    syncStore()
  } catch (e) {
    storeError.value = e.message
  }
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  savedNotice.value = debugMode.value
    ? `已导出 → 浏览器下载目录 / ${filename}`
    : '已导出到浏览器下载目录'
}

function doExport(format) {
  if (!store.value) return
  const base = `meeting-draft-${store.value.state.runVersion}`
  try {
    if (format === 'json') downloadText(`${base}.json`, store.value.exportJson(), 'application/json')
    else if (format === 'csv') downloadText(`${base}.csv`, store.value.exportCsv(), 'text/csv')
    else if (format === 'article') {
      if (!canExportArticle.value) throw new Error('仅已定稿、校验通过且未过期的整合稿件可导出')
      if (articleStale.value) throw new Error('稿件已过期：草稿字段已变更，请重新整合后再导出')
      downloadText(`${base}-article.md`, store.value.exportArticle(article.value), 'text/markdown')
      articleError.value = ''
    } else downloadText(`${base}.md`, store.value.exportMarkdown(), 'text/markdown')
    storeError.value = ''
  } catch (e) {
    storeError.value = e.message
    if (format === 'article') articleError.value = e.message
  }
}

// ---- Q-13 统一导出：内容范围 × 4 格式，全部经 draft-store.getExportPayload 过 FR-11 门禁 ----
const exportScope = ref('both')
const exportError = ref('')

const currentScopeNote = computed(
  () => EXPORT_SCOPES.find((s) => s.id === exportScope.value)?.note || ''
)

const canExportFormats = computed(() => {
  if (!isFrozen.value) return false
  if (exportScope.value === 'fields') return true
  return Boolean(article.value && !articleStale.value && articleCheck.value?.passed)
})

const exportGateText = computed(() => {
  if (!isFrozen.value) return '未定稿 · 所有格式已禁用，请先确认定稿'
  if (exportScope.value !== 'fields') {
    if (!article.value) return '尚未合成输出稿件：请先在上方整合，或改选「仅结构化定稿」'
    if (articleStale.value) return '稿件已过期：草稿字段已变更，请重新整合'
    if (!articleCheck.value?.passed) return '稿件校验未通过，不可导出'
  }
  return '已定稿 · 全部格式可用'
})

function printDocument(html) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0'
  document.body.appendChild(iframe)
  const frameWindow = iframe.contentWindow
  if (!frameWindow) {
    iframe.remove()
    throw new Error('打印预览被浏览器拦截，请改用 HTML 导出后自行打印')
  }
  frameWindow.document.open()
  frameWindow.document.write(html)
  frameWindow.document.close()
  let printed = false
  const trigger = () => {
    if (printed) return
    printed = true
    try {
      frameWindow.focus()
      frameWindow.print()
    } catch {
      exportError.value = '打印调用被拦截，可先导出 HTML 再在浏览器中打印'
    }
    setTimeout(() => iframe.remove(), 1500)
  }
  iframe.onload = trigger
  setTimeout(trigger, 600) // onload 未触发时的兜底，trigger 内部保证只打印一次
}

function doExportFormat(formatId) {
  if (!canExportFormats.value) return
  try {
    const payload = store.value.getExportPayload(article.value, exportScope.value)
    // SEC-07：导出内容一律不得夹带原始音频，构建 payload 后立即校验（不等到下载完才发现）
    assertNoRawAudio(payload)
    const result = exportDocument(payload, formatId)
    if (result.mode === 'browser_print') {
      printDocument(result.content)
      savedNotice.value = '已打开打印预览，请在打印对话框选择「另存为 PDF」'
    } else {
      downloadText(result.filename, result.content, result.mime)
      savedNotice.value = debugMode.value
        ? `已导出 → 浏览器下载目录 / ${result.filename}`
        : '已导出到浏览器下载目录'
    }
    exportError.value = ''
  } catch (e) {
    exportError.value = e.message
  }
}

// ---- A1 文件格式归一化：本地解码，不上传 ----
const fileAccept = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',')
const fileState = ref('idle')
const fileResult = shallowRef(null)
const fileError = ref('')

async function onAudioFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  fileState.value = 'decoding'
  fileError.value = ''
  fileResult.value = null
  try {
    const r = await decodeAudioFile(file)
    fileResult.value = {
      fileName: r.fileName,
      format: r.format,
      requestedFormat: r.requestedFormat,
      detectedFormat: r.detectedFormat,
      decodeVia: r.decodeVia,
      formatWarning: r.formatWarning,
      sourceRate: r.sourceRate,
      durationMs: r.durationMs,
      frameCount: r.frameCount,
      wavKB: (r.wav.byteLength / 1024).toFixed(1),
      segments: r.segments.length
    }
    fileState.value = 'done'
  } catch (e) {
    fileState.value = 'error'
    // 解码层已把 DOMException 翻成可操作文案（classifyDecodeError）；
    // debug 下额外暴露原始错误名，便于排查是编码不支持还是文件损坏。
    fileError.value = debugMode.value && e.originalMessage
      ? `${e.message}（原始：${e.hintCode || e.name}: ${e.originalMessage}）`
      : e.message
  } finally {
    event.target.value = ''
  }
}

// ---- E-18 语种清单门禁（Q-07 默认假设：L1 only，L2=[]）----
const langGate = computed(() => {
  if (!draft.value) return null
  const utterances = run.value?.artifacts?.transcript?.utterances || []
  return {
    allowed: L1_LANGUAGES,
    ...checkLanguageSupport(draft.value.detectedLanguages, L1_LANGUAGES),
    utterances: gateUtterances(utterances, L1_LANGUAGES)
  }
})

// ---- S3 / S4 契约层与产出落点 ----
const contractCheck = computed(() =>
  draft.value ? validateDraftShape(draft.value) : null
)
const backend = backendReadiness()
const outputTargets = OUTPUT_TARGETS
const genReadiness = cloudGenerationReadiness()
const genContractCheck = generationAdapterContractCheck(mockGenerationAdapter)
// FR-03 / FR-14 服务端契约形状自检（E-10~E-18 + 4 张新表 + 同意状态机）
const consentContractCheck = consentRetentionContractCheck()
const sec01Dependency = BACKEND_DEPENDENCIES.find((d) => d.id === 'SEC-01')
const q04Dependency = BACKEND_DEPENDENCIES.find((d) => d.id === 'Q-04')

// ---- 字号可读性：全站 px→rem 按 innerWidth/1920 等比缩放（见 utils/rem.js + vite postcss-pxtorem），
//      在宽 1600 的窗口下整页被压到 83.33%（13px 实算 10.83px），最小档只剩 8.3px。
//      本页是开发工作台、不参与 1920 大屏缩放体系，故锁定根字号下限 16px：
//      字号回到设计真实像素（13px 就是 13px），窗口变窄不再继续缩字；窗口 >1920 时仍保留放大。----
const ROOT_FONT_SIZE_FLOOR = 16
function applyRootFontSizeFloor() {
  document.documentElement.style.fontSize = Math.max(ROOT_FONT_SIZE_FLOOR, pxRem()) + 'px'
}

// ---- S6 评测与注入回归：页面展示真实跑批结果，不写死 PASS ----
const evalResult = shallowRef(null)
function runEvalNow() {
  evalResult.value = runAllChecks()
}
onMounted(runEvalNow)
onMounted(() => {
  // FR-14：进页面先按留存策略清一次到期数据，等价于服务端定时清理任务的本地版本
  const swept = purgeExpired({ days: retentionDays.value })
  retentionTick.value += 1
  savedIndex.value = listSaved()
  if (swept.purged.length) {
    retentionNotice.value = `已按留存策略自动清理 ${swept.purged.length} 条到期草稿（仅保留脱敏统计与审计记录）`
  }
})
onMounted(() => {
  // 在 rem.js 的 resize 监听之后注册，同一事件内后执行 ⇒ 覆盖其等比缩放值
  applyRootFontSizeFloor()
  window.addEventListener('resize', applyRootFontSizeFloor)
})
onMounted(() => {
  // 进页面先列一次音频输入：未授权时只有「系统默认输入」，授权后（首次录音成功）再补刷一次
  refreshAudioInputs()
})

onBeforeUnmount(() => {
  stopTimer()
  stopLiveTimers()
  if (captureHandle) stopCapture(captureHandle).catch(() => {})
  // 离开页面必须停掉真实录音并回收 WAV blob，避免麦克风常亮与内存泄漏
  stopRecClock()
  if (recHandle) {
    stopMultiTrackCapture(recHandle).catch(() => {})
    recHandle = null
  }
  releaseRecWav()
  // 还原全站等比缩放的根字号，避免把本页的字号下限污染到其他页面
  window.removeEventListener('resize', applyRootFontSizeFloor)
  document.documentElement.style.fontSize = pxRem() + 'px'
})
</script>

<style scoped>
/* 主题：默认浅色；系统切到深色时由 prefers-color-scheme 自动覆盖，无需 JS、无需手动开关 */
.mm-page {
  --mm-bg: #f5f7fa;
  --mm-panel: #ffffff;
  --mm-card: #f8fafc;
  --mm-inset: #f1f4f8;
  --mm-border: #e2e7ef;
  --mm-border-strong: #cbd3de;
  --mm-card-border: #e4e9f1;
  --mm-dash: #d9e0e9;
  --mm-chip: #eef2f7;
  --mm-text: #1f2733;
  --mm-text-2: #3d4757;
  --mm-text-3: #667085;
  --mm-text-4: #8a94a6;
  --mm-text-5: #aab2c0;
  --mm-value: #1f2733;
  --mm-dot-todo: #c9d1dc;
  --mm-primary: #2b6cb0;
  --mm-on-primary: #ffffff;
  --mm-ok: #0f9d6e;
  --mm-ok-bg: #e3f6ee;
  --mm-ok-fg: #0b7150;
  --mm-info-bg: #e8f0fc;
  --mm-info-fg: #1d5fa8;
  --mm-warn: #b8790b;
  --mm-warn-bg: #fff5e3;
  --mm-warn-fg: #8a5a08;
  --mm-pending-bg: #fdf1d8;
  --mm-pending-fg: #8a5a08;
  --mm-danger: #cf3b46;
  --mm-danger-bg: #fdebec;
  --mm-link: #2563b8;
  --mm-progress: #2b6cb0;
  color-scheme: light;

  min-height: 100vh;
  padding: 16px 20px 24px;
  background: var(--mm-bg);
  color: var(--mm-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  font-size: 13px;
  line-height: 1.6;
  box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  .mm-page {
    --mm-bg: #14161a;
    --mm-panel: #1c2026;
    --mm-card: #20262e;
    --mm-inset: #14161a;
    --mm-border: #2b313a;
    --mm-border-strong: #343c47;
    --mm-card-border: #2f3742;
    --mm-dash: #3a4350;
    --mm-chip: #262c34;
    --mm-text: #e5e9ef;
    --mm-text-2: #c3cbd6;
    --mm-text-3: #9aa4b2;
    --mm-text-4: #8b96a5;
    --mm-text-5: #6b7582;
    --mm-value: #d8dee7;
    --mm-dot-todo: #5a626d;
    --mm-primary: #2b6cb0;
    --mm-on-primary: #ffffff;
    --mm-ok: #4fd1a5;
    --mm-ok-bg: #1d4d3d;
    --mm-ok-fg: #7ee0b8;
    --mm-info-bg: #2a3d5c;
    --mm-info-fg: #9dc1f5;
    --mm-warn: #e6a23c;
    --mm-warn-bg: #3a2f1a;
    --mm-warn-fg: #e6c07b;
    --mm-pending-bg: #4a3a1c;
    --mm-pending-fg: #e6c07b;
    --mm-danger: #e06c75;
    --mm-danger-bg: #4a2626;
    --mm-link: #6aa8ff;
    --mm-progress: #2b6cb0;
    color-scheme: dark;
  }
}
.mm-page * { box-sizing: border-box; }
.mm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--mm-border);
}
.mm-title { display: flex; align-items: center; gap: 10px; }
.mm-title h1 { margin: 0; font-size: 17px; font-weight: 500; }
.mm-badge-dev {
  padding: 2px 8px;
  border: 1px solid var(--mm-warn);
  border-radius: 999px;
  color: var(--mm-warn);
  font-size: 13px;
  letter-spacing: 0.5px;
}
.mm-header-note { display: flex; flex-wrap: wrap; gap: 16px; color: var(--mm-text-3); font-size: 12px; }
.mm-theme-dark { display: none; }
.mm-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin: 12px 0;
  padding: 9px 12px;
  background: var(--mm-panel);
  border: 1px solid var(--mm-border);
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.mm-status-key, .mm-runbar-key { color: var(--mm-ok); font-weight: 500; }
.mm-status b { color: var(--mm-text); font-weight: 500; }
.mm-dot {
  display: inline-block;
  width: 7px; height: 7px;
  margin-left: 4px;
  border-radius: 50%;
}
.mm-dot.ok { background: var(--mm-ok); }
.mm-dot.todo { background: var(--mm-dot-todo); }
.mm-need { margin-left: auto; color: var(--mm-warn); }
.mm-need.ok { color: var(--mm-ok); }
.mm-runbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  padding: 9px 12px;
  background: var(--mm-panel);
  border: 1px solid var(--mm-border);
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.mm-runbar-field { display: flex; align-items: center; gap: 6px; color: var(--mm-text-3); }
.mm-runbar-field select {
  padding: 4px 8px;
  background: var(--mm-inset);
  color: var(--mm-text);
  border: 1px solid var(--mm-border-strong);
  border-radius: 999px;
  font-size: 12px;
  font-family: inherit;
}
.mm-runbar button,
.mm-actions button {
  padding: 5px 12px;
  background: var(--mm-primary);
  color: var(--mm-on-primary);
  border: 0;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}
.mm-runbar button:disabled,
.mm-actions button:disabled { opacity: 0.45; cursor: not-allowed; }
.mm-runbar .mm-btn-ghost, .mm-actions .mm-btn-ghost { background: var(--mm-chip); color: var(--mm-text-2); }
.mm-runbar-state { margin-left: auto; color: var(--mm-text-3); }
.mm-runbar-state.ok { color: var(--mm-ok); }
.mm-runbar-state.bad { color: var(--mm-danger); }
.mm-runbar-state.busy { color: var(--mm-warn); }
.mm-runbar-mode { color: var(--mm-link); }
.mm-grid {
  display: grid;
  grid-template-columns: 1fr 1.1fr 1.1fr;
  gap: 12px;
  align-items: start;
}
/* 默认工作台视图：两列（会前设置 / 纪要草稿），转写稿与产出说明各占整行 */
.mm-grid-workbench { grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); }
.mm-span-2 { grid-column: span 2; }
.mm-col {
  min-width: 0;
  padding: 12px;
  background: var(--mm-panel);
  border: 1px solid var(--mm-border);
  border-radius: 8px;
}
.mm-col h2 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.mm-col h2 small { color: var(--mm-text-3); font-size: 13px; font-weight: 400; }
.mm-scroll { max-height: min(58vh, 560px); overflow-y: auto; padding-right: 4px; }
/* 面板内滚动：固定上限高度 + 可见 Y 滚动条，内容再多也不把整页顶长 */
.mm-scroll-body {
  max-height: min(56vh, 540px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-right: 6px;
}
.mm-scroll-body > :last-child { margin-bottom: 0; }
.mm-scroll-bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0 6px;
  padding: 3px 8px;
  background: var(--mm-chip);
  border: 1px solid var(--mm-border);
  border-radius: 6px;
  color: var(--mm-text-3);
  font-size: 13px;
}
.mm-scroll-bar-tip { color: var(--mm-text-4); }
/* 滚动条跟随主题，避免浅色下出现系统深色条 */
.mm-scroll,
.mm-scroll-body,
.mm-ev-table,
.mm-article,
.mm-article-side,
.mm-log,
.mm-ep-list,
.mm-json { scrollbar-width: thin; scrollbar-color: var(--mm-border-strong) transparent; }
.mm-scroll::-webkit-scrollbar,
.mm-scroll-body::-webkit-scrollbar,
.mm-ev-table::-webkit-scrollbar,
.mm-article::-webkit-scrollbar,
.mm-article-side::-webkit-scrollbar { width: 8px; height: 8px; }
.mm-scroll::-webkit-scrollbar-thumb,
.mm-scroll-body::-webkit-scrollbar-thumb,
.mm-ev-table::-webkit-scrollbar-thumb,
.mm-article::-webkit-scrollbar-thumb,
.mm-article-side::-webkit-scrollbar-thumb {
  background: var(--mm-border-strong);
  border-radius: 999px;
}
.mm-scroll::-webkit-scrollbar-track,
.mm-scroll-body::-webkit-scrollbar-track,
.mm-ev-table::-webkit-scrollbar-track,
.mm-article::-webkit-scrollbar-track,
.mm-article-side::-webkit-scrollbar-track { background: transparent; }
.mm-group { margin-bottom: 12px; }
.mm-group h3 {
  margin: 0 0 4px;
  padding: 3px 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--mm-link);
  border-bottom: 1px dashed var(--mm-border);
}
.mm-task {
  display: grid;
  grid-template-columns: 14px 52px 1fr 34px;
  gap: 6px;
  align-items: start;
  padding: 3px 0;
  color: var(--mm-text-2);
  font-size: 12px;
}
.mm-task.done { color: var(--mm-text-5); text-decoration: line-through; }
.mm-task.current { color: var(--mm-ok); }
.mm-task-mark { font-family: ui-monospace, monospace; }
.mm-task-id { font-family: ui-monospace, monospace; color: var(--mm-text-4); }
.mm-task.done .mm-task-id, .mm-task.current .mm-task-id { color: inherit; }
.mm-task-est { text-align: right; color: var(--mm-text-4); font-family: ui-monospace, monospace; }
.mm-field { display: block; margin-bottom: 10px; }
.mm-field > span { display: block; margin-bottom: 4px; color: var(--mm-text-3); font-size: 12px; }
.mm-field select,
.mm-field textarea {
  width: 100%;
  padding: 6px 8px;
  background: var(--mm-inset);
  color: var(--mm-text);
  border: 1px solid var(--mm-border-strong);
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
}
.mm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mm-actions { display: flex; gap: 8px; margin: 8px 0; }
.mm-json {
  max-height: 130px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  background: var(--mm-inset);
  border: 1px solid var(--mm-border);
  border-radius: 6px;
  color: var(--mm-ok-fg);
  font-size: 13px;
  font-family: ui-monospace, monospace;
}
.mm-placeholder {
  margin-top: 12px;
  padding: 9px;
  background: var(--mm-card);
  border-left: 2px solid var(--mm-warn);
  border-radius: 4px;
  color: var(--mm-text-3);
  font-size: 12px;
}
.mm-placeholder b { color: var(--mm-warn); font-weight: 500; }
.mm-placeholder p { margin: 4px 0 0; }
.mm-audio {
  margin-top: 12px;
  padding: 10px;
  background: var(--mm-card);
  border: 1px solid var(--mm-card-border);
  border-radius: 6px;
}
.mm-audio-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.mm-audio-head b { font-weight: 500; color: var(--mm-text); }
.mm-audio-state { padding: 1px 8px; border-radius: 999px; font-size: 13px; background: var(--mm-chip); color: var(--mm-text-3); }
.mm-audio-state.recording { background: var(--mm-danger-bg); color: var(--mm-danger); }
.mm-audio-state.done { background: var(--mm-ok-bg); color: var(--mm-ok-fg); }
.mm-audio-state.error, .mm-audio-state.unsupported { background: var(--mm-warn-bg); color: var(--mm-warn-fg); }
.mm-audio-desc { margin: 6px 0; color: var(--mm-text-3); font-size: 13px; }
.mm-audio-desc b { color: var(--mm-warn); font-weight: 500; }
.mm-audio-meter { height: 6px; background: var(--mm-inset); border-radius: 999px; overflow: hidden; }
.mm-audio-meter > div { height: 100%; background: var(--mm-ok); transition: width 0.1s linear; }
.mm-audio-error { margin-top: 6px; color: var(--mm-danger); font-size: 13px; }
.mm-audio-warn { margin-top: 6px; color: var(--mm-warn-fg); background: var(--mm-warn-bg); padding: 4px 8px; border-radius: 4px; font-size: 13px; }
.mm-audio-stats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.mm-audio-stats span { padding: 1px 6px; background: var(--mm-chip); border-radius: 4px; color: var(--mm-text-3); font-size: 13px; font-family: ui-monospace, monospace; }
.mm-audio-segs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.mm-audio-segs code { padding: 1px 5px; background: var(--mm-inset); border-radius: 3px; color: var(--mm-link); font-size: 13px; }
.mm-audio-deps { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--mm-dash); }
.mm-audio-deps > b { color: var(--mm-text-3); font-size: 13px; font-weight: 500; }
.mm-audio-dep { display: grid; grid-template-columns: 40px 1fr 48px; gap: 6px; padding: 2px 0; font-size: 13px; color: var(--mm-text-3); }
.mm-dep-level { font-size: 12px; text-align: center; border-radius: 999px; }
.mm-dep-level.bad { background: var(--mm-danger-bg); color: var(--mm-danger); }
.mm-dep-level.warn { background: var(--mm-warn-bg); color: var(--mm-warn-fg); }
.mm-dep-level.ok { background: var(--mm-ok-bg); color: var(--mm-ok-fg); }
.mm-dep-name { color: var(--mm-text-2); }
.mm-audio-note { margin-top: 6px; color: var(--mm-text-4); font-size: 12px; }
.mm-empty {
  padding: 12px;
  background: var(--mm-card);
  border: 1px dashed var(--mm-dash);
  border-radius: 6px;
  color: var(--mm-text-4);
  font-size: 12px;
}
.mm-empty p { margin: 0 0 6px; }
.mm-inline-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.mm-inline-list code, .mm-evidence code, .mm-note code {
  padding: 1px 5px;
  background: var(--mm-inset);
  border-radius: 3px;
  color: var(--mm-link);
  font-size: 13px;
  font-family: ui-monospace, monospace;
}
.mm-meta, .mm-langs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
.mm-meta span, .mm-langs span {
  padding: 1px 7px;
  background: var(--mm-chip);
  border-radius: 4px;
  color: var(--mm-text-3);
  font-family: ui-monospace, monospace;
  font-size: 13px;
}
.mm-warning {
  margin-bottom: 6px;
  padding: 4px 8px;
  background: var(--mm-warn-bg);
  border-radius: 4px;
  color: var(--mm-warn-fg);
  font-size: 13px;
}
.mm-warning code { margin-left: 4px; color: var(--mm-warn); }
.mm-card {
  margin-bottom: 8px;
  padding: 9px;
  background: var(--mm-card);
  border: 1px solid var(--mm-card-border);
  border-radius: 6px;
}
.mm-card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.mm-card-head b { font-weight: 500; }
.mm-source { padding: 1px 7px; border-radius: 999px; font-size: 13px; }
.mm-source.from_meeting { background: var(--mm-ok-bg); color: var(--mm-ok-fg); }
.mm-source.from_background { background: var(--mm-info-bg); color: var(--mm-info-fg); }
.mm-source.unconfirmed { background: var(--mm-pending-bg); color: var(--mm-pending-fg); }
.mm-card-value { margin: 6px 0; color: var(--mm-value); }
.mm-card-value.empty { color: var(--mm-text-4); font-style: italic; }
.mm-card-foot { display: flex; flex-wrap: wrap; gap: 10px; color: var(--mm-text-4); font-size: 13px; font-family: ui-monospace, monospace; }
.mm-evidence { margin-top: 5px; color: var(--mm-text-3); font-size: 13px; }
.mm-ev-link {
  margin-left: 4px;
  padding: 0 5px;
  background: var(--mm-inset);
  border: 1px solid var(--mm-border-strong);
  border-radius: 999px;
  color: var(--mm-link);
  font-size: 13px;
  font-family: ui-monospace, monospace;
  cursor: pointer;
}
.mm-ev-link:hover { border-color: var(--mm-link); }
.mm-candidates { margin-top: 6px; border-top: 1px dashed var(--mm-dash); padding-top: 5px; }
.mm-candidate { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; color: var(--mm-text-2); }
.mm-candidate > span:first-child { color: var(--mm-warn); }
.mm-note { margin-top: 5px; color: var(--mm-text-4); font-size: 13px; }
.mm-progress {
  position: relative;
  height: 18px;
  margin-bottom: 8px;
  background: var(--mm-inset);
  border: 1px solid var(--mm-border);
  border-radius: 999px;
  overflow: hidden;
}
.mm-progress-bar { height: 100%; background: var(--mm-progress); transition: width 0.18s ease; }
.mm-progress > span {
  position: absolute;
  top: 0; right: 8px;
  color: var(--mm-text);
  font-size: 12px;
  font-family: ui-monospace, monospace;
  line-height: 18px;
}
.mm-stage {
  display: grid;
  grid-template-columns: 40px 52px 1fr 34px 60px;
  gap: 8px;
  align-items: center;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--mm-text-3);
}
.mm-stage.running { background: var(--mm-info-bg); color: var(--mm-info-fg); }
.mm-stage.failed { background: var(--mm-danger-bg); color: var(--mm-danger); }
.mm-stage.done { color: var(--mm-text-2); }
.mm-stage-pct, .mm-stage-meta { font-family: ui-monospace, monospace; font-size: 13px; text-align: right; }
.mm-stage-state { font-size: 13px; }
.mm-stage-state.done { color: var(--mm-ok); }
.mm-stage-state.failed { color: var(--mm-danger); }
.mm-stage-state.running { color: var(--mm-info-fg); }
.mm-log { max-height: 260px; overflow-y: auto; }
.mm-log-row {
  display: grid;
  grid-template-columns: 24px 46px 1fr;
  gap: 6px;
  padding: 2px 0;
  font-size: 13px;
  font-family: ui-monospace, monospace;
  color: var(--mm-text-3);
}
.mm-log-row.error .mm-log-msg { color: var(--mm-danger); }
.mm-log-row.warn .mm-log-msg { color: var(--mm-warn-fg); }
.mm-log-row.retry .mm-log-msg { color: var(--mm-info-fg); }
.mm-log-row.done .mm-log-msg { color: var(--mm-ok); }
.mm-log-seq { color: var(--mm-text-5); }
.mm-log-type { color: var(--mm-link); }
.mm-verdict {
  margin-bottom: 8px;
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-family: ui-monospace, monospace;
}
.mm-verdict.ok { background: var(--mm-ok-bg); color: var(--mm-ok-fg); }
.mm-verdict.bad { background: var(--mm-danger-bg); color: var(--mm-danger); }
.mm-vrow { display: grid; grid-template-columns: 40px 1fr; gap: 4px 8px; padding: 5px 0; border-bottom: 1px dashed var(--mm-border); }
.mm-vtag { font-family: ui-monospace, monospace; font-size: 13px; }
.mm-vtag.ok { color: var(--mm-ok); }
.mm-vtag.bad { color: var(--mm-danger); }
.mm-vname { font-size: 12px; color: var(--mm-text-2); }
.mm-vdetail { grid-column: 2; font-size: 13px; color: var(--mm-text-4); }
.mm-kv { display: grid; grid-template-columns: 76px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px dashed var(--mm-border); font-size: 13px; }
.mm-kv b { color: var(--mm-text-3); font-weight: 500; }
.mm-kv span { color: var(--mm-text-2); word-break: break-word; }
.mm-kv-alert span { color: var(--mm-warn); }
.mm-ev-table { max-height: min(46vh, 380px); overflow-y: auto; overscroll-behavior: contain; }
.mm-ev-row {
  display: grid;
  grid-template-columns: 62px 66px 66px 1fr 36px;
  gap: 6px;
  padding: 4px 5px;
  border-bottom: 1px solid var(--mm-chip);
  font-size: 13px;
  color: var(--mm-text-2);
}
.mm-ev-row.active { background: var(--mm-info-bg); }
.mm-ev-row.background { color: var(--mm-info-fg); }
.mm-ev-id { color: var(--mm-link); font-family: ui-monospace, monospace; }
.mm-ev-lang, .mm-ev-conf { color: var(--mm-text-4); font-family: ui-monospace, monospace; }
.mm-ev-speaker { color: var(--mm-text-3); }
.mm-ev-conf { text-align: right; }
.mm-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--mm-border);
  color: var(--mm-text-4);
  font-size: 13px;
}
.mm-footer b { color: var(--mm-text-3); font-weight: 500; }
.mm-footer code {
  margin-left: 6px;
  padding: 1px 6px;
  background: var(--mm-card);
  border-radius: 3px;
  color: var(--mm-info-fg);
  font-size: 13px;
}
/* A1 / S3~S6 新增面板：全部复用 --mm-* 变量，浅色 / 深色自动生效 */
.mm-file { margin-top: 12px; }
.mm-audio input[type='file'] { width: 100%; font-size: 13px; color: var(--mm-text-3); }
.mm-audio input[type='file']::file-selector-button {
  margin-right: 8px;
  padding: 4px 10px;
  border: 1px solid var(--mm-border-strong);
  border-radius: 999px;
  background: var(--mm-chip);
  color: var(--mm-text-2);
  cursor: pointer;
}
.mm-edited-tag {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--mm-info-bg);
  color: var(--mm-info-fg);
  font-size: 12px;
}
.mm-editor { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--mm-border); }
.mm-editor textarea, .mm-reject input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--mm-border);
  border-radius: 6px;
  background: var(--mm-inset);
  color: var(--mm-text);
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
}
.mm-editor textarea:disabled, .mm-reject input:disabled { opacity: 0.55; }
.mm-editor-actions { margin-top: 6px; }
.mm-editor-actions button { padding: 3px 10px; font-size: 13px; }
.mm-reject { display: flex; gap: 6px; margin-top: 6px; }
.mm-reject input { flex: 1; }
.mm-reject button { flex: 0 0 auto; padding: 3px 10px; font-size: 13px; }
.mm-store {
  margin-top: 12px;
  padding: 10px;
  border: 1px solid var(--mm-border);
  border-radius: 8px;
  background: var(--mm-card);
}
.mm-store-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.mm-store-head b { color: var(--mm-text-2); font-weight: 500; }
.mm-gap { margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--mm-border); }
.mm-store-state { padding: 1px 8px; border-radius: 999px; font-size: 12px; }
.mm-store-state.draft { background: var(--mm-pending-bg); color: var(--mm-pending-fg); }
.mm-store-state.frozen { background: var(--mm-ok-bg); color: var(--mm-ok-fg); }
.mm-store .mm-actions button { padding: 3px 10px; font-size: 13px; }
.mm-store .mm-kv { margin-top: 4px; }
.mm-store-notice { margin-top: 8px; color: var(--mm-ok); font-size: 13px; }
.mm-history { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--mm-border); }
.mm-history > b { display: block; margin-bottom: 5px; color: var(--mm-text-3); font-weight: 500; font-size: 13px; }
.mm-history-row {
  display: grid;
  grid-template-columns: 1fr 150px 36px;
  gap: 6px;
  padding: 3px 5px;
  border-bottom: 1px dashed var(--mm-border);
  font-size: 12px;
  color: var(--mm-text-3);
  word-break: break-all;
}
.mm-history-row.current { background: var(--mm-info-bg); }
.mm-audit-row { grid-template-columns: 170px 150px 1fr; }
.mm-history-row code { color: var(--mm-link); font-family: ui-monospace, monospace; }
.mm-history-tag { color: var(--mm-info-fg); }
.mm-store .mm-warning code { margin-right: 6px; }
.mm-ep-list { max-height: 190px; overflow-y: auto; margin-top: 8px; }
.mm-ep-row {
  display: grid;
  grid-template-columns: 44px 210px 1fr;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--mm-border);
  font-size: 12px;
  color: var(--mm-text-3);
}
.mm-ep-row code { color: var(--mm-link); font-family: ui-monospace, monospace; }
.mm-eval-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
.mm-eval-grid > div > b { display: block; margin-bottom: 6px; color: var(--mm-text-2); font-weight: 500; }
.mm-eval-row {
  display: grid;
  grid-template-columns: 40px 130px 1fr;
  gap: 6px;
  padding: 4px 6px;
  border-bottom: 1px dashed var(--mm-border);
  border-radius: 4px;
  font-size: 13px;
  color: var(--mm-text-2);
}
.mm-eval-row.ok { background: var(--mm-ok-bg); }
.mm-eval-row.bad { background: var(--mm-danger-bg); color: var(--mm-danger); }
.mm-eval-row code { color: var(--mm-link); font-family: ui-monospace, monospace; }
.mm-eval-detail { color: var(--mm-text-4); font-size: 12px; }
/* P5 整合输出稿件：左全文预览、右统计与稿件层校验，全部沿用 --mm-* 主题变量 */
.mm-article-note {
  margin: 6px 0 8px;
  padding: 7px 10px;
  background: var(--mm-chip);
  border: 1px solid var(--mm-border);
  border-radius: 6px;
  color: var(--mm-text-3);
  font-size: 13px;
}
.mm-article-note b { color: var(--mm-text-2); font-weight: 500; }
.mm-article-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 0.85fr);
  gap: 12px;
  margin-top: 8px;
}
.mm-article {
  margin: 0;
  padding: 12px 14px;
  max-height: min(56vh, 520px);
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--mm-inset);
  border: 1px solid var(--mm-border);
  border-radius: 8px;
  color: var(--mm-text-2);
  font: 12px/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.mm-article-side {
  min-width: 0;
  max-height: min(56vh, 520px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}
.mm-article-side .mm-kv { grid-template-columns: 76px 1fr; }
.mm-article-debug { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--mm-border); }
.mm-article-debug > b {
  display: block;
  margin-bottom: 6px;
  color: var(--mm-text-3);
  font-size: 13px;
  font-weight: 500;
}
.mm-article-check-row {
  display: grid;
  grid-template-columns: 38px 1fr 40px;
  gap: 6px;
  padding: 3px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--mm-text-2);
}
.mm-article-check-row.ok { background: var(--mm-ok-bg); }
.mm-article-check-row.bad { background: var(--mm-danger-bg); color: var(--mm-danger); }
.mm-article-check-row code { color: var(--mm-link); font-family: ui-monospace, monospace; }
/* Q-13 统一导出区：内容范围 chips + 4 张格式卡片，沿用 --mm-* 主题变量 */
.mm-export-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 6px 0; }
.mm-export-row > b { color: var(--mm-text-3); font-size: 13px; font-weight: 500; margin-right: 4px; }
.mm-format-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border: 1px solid var(--mm-border); border-radius: 999px;
  background: var(--mm-chip); color: var(--mm-text-2); font-size: 13px; cursor: pointer;
}
.mm-format-chip.active { border-color: var(--mm-primary); background: var(--mm-info-bg); color: var(--mm-info-fg); }
.mm-format-chip input { margin: 0; accent-color: var(--mm-primary); }
.mm-export-note { color: var(--mm-text-4); font-size: 12px; margin-bottom: 8px; }
.mm-format-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px; margin: 8px 0 12px;
}
.mm-format-card {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px; background: var(--mm-card);
  border: 1px solid var(--mm-card-border); border-radius: 8px;
}
.mm-format-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.mm-format-head b { color: var(--mm-text); font-weight: 500; }
.mm-format-head code { color: var(--mm-link); font-family: ui-monospace, monospace; font-size: 12px; }
.mm-format-card p { flex: 1; margin: 0; color: var(--mm-text-3); font-size: 13px; line-height: 1.55; }
.mm-format-card button { align-self: flex-start; padding: 4px 12px; font-size: 13px; }
.mm-export-ep { grid-template-columns: 70px 150px 1fr; }
@media (prefers-color-scheme: dark) {
  .mm-theme-light { display: none; }
  .mm-theme-dark { display: inline; }
}
@media (max-width: 1100px) {
  .mm-grid, .mm-grid-workbench { grid-template-columns: 1fr; }
  .mm-span-2 { grid-column: span 1; }
  .mm-scroll { max-height: 320px; }
  .mm-scroll-body { max-height: 62vh; }
  .mm-article, .mm-article-side, .mm-ev-table { max-height: 62vh; }
  .mm-eval-grid { grid-template-columns: 1fr; }
  .mm-article-grid { grid-template-columns: 1fr; }
  .mm-ep-row { grid-template-columns: 44px 1fr; }
  .mm-ep-row span { grid-column: 2; }
}

/* ============ 实时工作台：项目 / 主题 → 实时记录 + 人工记录 → AI 分析 → 会议总结 ============ */
.mm-live-top {
  margin: 12px 0;
  padding: 10px 12px;
  background: var(--mm-panel);
  border: 1px solid var(--mm-border);
  border-radius: 8px;
}
.mm-live-top-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) minmax(0, 0.75fr) auto;
  gap: 10px;
  align-items: end;
}
.mm-live-top-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--mm-border);
}
.mm-live-top-sub .mm-actions { margin: 0; flex-wrap: wrap; }
.mm-live-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.mm-live-field > span { color: var(--mm-text-3); font-size: 13px; }
.mm-live-field select,
.mm-live-field input {
  min-width: 0;
  padding: 5px 10px;
  background: var(--mm-inset);
  color: var(--mm-text);
  border: 1px solid var(--mm-border-strong);
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
}
.mm-live-clock { display: flex; align-items: center; gap: 8px; padding-bottom: 4px; }
.mm-live-clock b { color: var(--mm-text); font: 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.mm-live-clock small { color: var(--mm-text-4); font-size: 12px; }
.mm-live-state {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--mm-chip);
  color: var(--mm-text-3);
  font-size: 13px;
}
.mm-live-state.recording { background: var(--mm-danger-bg); color: var(--mm-danger); }
.mm-live-state.paused { background: var(--mm-pending-bg); color: var(--mm-pending-fg); }
.mm-live-state.finished { background: var(--mm-ok-bg); color: var(--mm-ok-fg); }
.mm-live-progress {
  position: relative;
  flex: 1 1 170px;
  min-width: 150px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 10px;
  background: var(--mm-inset);
  border: 1px solid var(--mm-border);
  border-radius: 999px;
  overflow: hidden;
  color: var(--mm-text-3);
  font-size: 13px;
}
.mm-live-progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: var(--mm-info-bg);
  border-right: 1px solid var(--mm-primary);
  transition: width 0.35s ease;
}
.mm-live-progress > span { position: relative; }

/* 真实录音条：状态灯 + 真实时长 + 真实电平 + 保存 WAV */
/* FR-14 留存操作行：数字输入不与按钮抢宽度 */
.mm-retention-ops { flex-wrap: wrap; }
.mm-retention-ops input {
  width: 72px;
  padding: 5px 8px;
  background: var(--mm-inset);
  color: var(--mm-text);
  border: 1px solid var(--mm-border-strong);
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
}

.mm-live-rec-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  padding: 8px 12px;
  background: var(--mm-inset);
  border: 1px solid var(--mm-border);
  border-radius: 10px;
}
.mm-live-rec-main { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.mm-live-rec-main b { color: var(--mm-text); font-size: 12px; font-weight: 500; }
.mm-live-rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mm-text-4);
  flex: none;
}
.mm-live-rec-bar.is-recording .mm-live-rec-dot {
  background: var(--mm-danger);
  animation: mm-rec-pulse 1.4s ease-in-out infinite;
}
.mm-live-rec-bar.is-recording .mm-live-rec-main b { color: var(--mm-danger); }
.mm-live-rec-bar.is-done .mm-live-rec-dot { background: var(--mm-ok-fg); }
.mm-live-rec-bar.is-error .mm-live-rec-dot,
.mm-live-rec-bar.is-unsupported .mm-live-rec-dot { background: var(--mm-danger); }
@keyframes mm-rec-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.82); }
}
.mm-live-rec-time {
  color: var(--mm-text);
  font: 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mm-live-rec-meter {
  width: 150px;
  height: 6px;
  border-radius: 999px;
  background: var(--mm-chip);
  overflow: hidden;
  flex: none;
}
.mm-live-rec-meter i {
  display: block;
  height: 100%;
  background: var(--mm-primary);
  transition: width 0.12s linear;
}
.mm-live-rec-bar.is-recording .mm-live-rec-meter i { background: var(--mm-danger); }
.mm-live-rec-level {
  color: var(--mm-text-4);
  font-size: 12px;
  min-width: 30px;
  text-align: right;
}
.mm-live-rec-save { text-decoration: none; }

/* 本机离线转写状态条：模型档位 / 阶段 / 进度 / 已处理时长 */
.mm-live-asr-bar {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--mm-card);
  border: 1px solid var(--mm-border);
  border-radius: 10px;
}
.mm-live-asr-bar.is-error { border-color: var(--mm-danger); }
.mm-live-asr-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.mm-live-asr-main b { color: var(--mm-text); font-size: 12px; font-weight: 500; }
.mm-live-asr-state {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--mm-chip);
  color: var(--mm-text-3);
  font-size: 12px;
}
.mm-live-asr-spin {
  color: var(--mm-primary);
  font-size: 12px;
  animation: mm-rec-pulse 1.4s ease-in-out infinite;
}
.mm-live-asr-status { color: var(--mm-text-3); font-size: 13px; min-width: 0; }
.mm-live-asr-bar.is-error .mm-live-asr-status { color: var(--mm-danger); }
.mm-live-asr-sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 4px;
  color: var(--mm-text-4);
  font-size: 12px;
}
.mm-live-asr-dl { color: var(--mm-text-3); }
.mm-live-asr-progress {
  position: relative;
  height: 6px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--mm-chip);
  overflow: hidden;
}
.mm-live-asr-progress i {
  display: block;
  height: 100%;
  background: var(--mm-primary);
}
.mm-live-asr-progress > span {
  display: block;
  margin-top: 4px;
  color: var(--mm-text-4);
  font-size: 12px;
}
/* 失败分类提示：状态条只给结论，这里给「下一步怎么做」 */
.mm-live-asr-hint {
  margin-top: 6px;
  padding: 8px 12px;
  background: var(--mm-danger-bg);
  border: 1px solid var(--mm-danger);
  border-radius: 10px;
  color: var(--mm-text-2);
  font-size: 12px;
  line-height: 1.6;
}
.mm-live-rec-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 8px;
  color: var(--mm-text-3);
  font-size: 13px;
}

/* 多轨采集：设备勾选 + 各轨实时电平 */
.mm-live-mic-pick {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--mm-card);
  border: 1px solid var(--mm-border);
  border-radius: 8px;
}
.mm-live-mic-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--mm-text-3);
}
.mm-live-mic-head b { color: var(--mm-text-2); }
.mm-live-mic-head .mm-btn-ghost { margin-left: auto; }
.mm-live-mic-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.mm-live-mic-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--mm-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--mm-text-3);
  cursor: pointer;
}
.mm-live-mic-item.active {
  background: var(--mm-inset);
  border-color: var(--mm-primary);
  color: var(--mm-text-2);
}
.mm-live-mic-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mm-live-mic-meter {
  width: 120px;
  height: 6px;
  flex: none;
  border-radius: 999px;
  background: var(--mm-chip);
  overflow: hidden;
}
.mm-live-mic-meter i {
  display: block;
  height: 100%;
  background: var(--mm-danger);
  transition: width 0.12s linear;
}
.mm-live-mic-note {
  margin-top: 6px;
  color: var(--mm-text-4);
  font-size: 12px;
}

/* 多轨归属结果：各轨发声占比 / 静音 / 抢话串音 / 归属依据 */
.mm-live-track-stats {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--mm-text-3);
}
.mm-live-track-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
}
.mm-live-track-name {
  font-family: ui-monospace, monospace;
  color: var(--mm-text-2);
}

.mm-live-note {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--mm-border);
  color: var(--mm-text-4);
  font-size: 12px;
}

.mm-live-bands {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.85fr);
  gap: 12px;
  margin-bottom: 12px;
}
.mm-live-ai { margin-bottom: 12px; }
.mm-live-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 10px 12px 12px;
  background: var(--mm-panel);
  border: 1px solid var(--mm-border);
  border-radius: 8px;
}
.mm-live-pane-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--mm-border);
}
.mm-live-pane-head b { color: var(--mm-text); font-size: 13px; font-weight: 500; }
.mm-live-pane-head > span { color: var(--mm-text-3); font-size: 13px; }
.mm-live-tag-plain {
  margin-left: auto;
  padding: 1px 8px;
  border: 1px dashed var(--mm-border-strong);
  border-radius: 999px;
  color: var(--mm-text-4) !important;
  font-size: 12px !important;
}
/* 演示路径的显式警示标：内容不是真实录制时，必须一眼可辨 */
.mm-live-tag-warn {
  margin-left: auto;
  padding: 1px 8px;
  border: 1px solid var(--mm-warn-border, #e6b800);
  border-radius: 999px;
  background: var(--mm-warn-bg, #fff8e1);
  color: var(--mm-warn-text, #8a6d00) !important;
  font-size: 12px !important;
  font-weight: 600;
}
.mm-live-rec {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--mm-danger-bg);
  color: var(--mm-danger) !important;
  font-size: 12px !important;
}
.mm-live-empty { padding: 14px 4px; color: var(--mm-text-4); font-size: 12px; line-height: 1.7; }
.mm-live-empty-sm { padding: 8px 2px; color: var(--mm-text-5); font-size: 13px; }
.mm-empty-title { display: block; margin-bottom: 4px; font-weight: 500; font-size: 13px; color: var(--mm-text-2); }
.mm-empty-title.is-warn { color: var(--mm-warn); }
.mm-empty-next { display: block; margin-top: 6px; color: var(--mm-text-3); }

.mm-live-stream {
  margin-top: 8px;
  max-height: min(38vh, 340px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-right: 4px;
  scrollbar-color: var(--mm-border-strong) transparent;
}
.mm-live-row {
  display: grid;
  grid-template-columns: 44px auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: baseline;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
}
.mm-live-row:nth-child(odd) { background: var(--mm-card); }
.mm-live-row.active { background: var(--mm-info-bg); }
.mm-live-ts,
.mm-live-spk {
  color: var(--mm-text-4);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
/* 本地未做声纹分离：不显示假人名，用弱化样式提示「未区分」 */
.mm-live-spk.is-unknown {
  font-family: inherit;
  font-size: 12px;
  color: var(--mm-text-4);
  opacity: 0.85;
}
.mm-live-text { color: var(--mm-text-2); word-break: break-word; }
.mm-live-hit {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--mm-info-bg);
  color: var(--mm-info-fg);
  font-size: 12px;
  white-space: nowrap;
}

.mm-live-manual-form { margin-top: 8px; }
.mm-live-kinds { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.mm-live-kind {
  padding: 3px 10px;
  background: var(--mm-chip);
  color: var(--mm-text-2);
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
}
.mm-live-kind.active { border-color: var(--mm-primary); background: var(--mm-info-bg); color: var(--mm-info-fg); }
.mm-live-manual-form textarea,
.mm-live-confirm-row textarea {
  width: 100%;
  padding: 7px 9px;
  background: var(--mm-inset);
  color: var(--mm-text);
  border: 1px solid var(--mm-border-strong);
  border-radius: 6px;
  font-family: inherit;
  font: 12px/1.6 inherit;
  resize: vertical;
}
.mm-live-manual-list {
  margin-top: 8px;
  max-height: min(26vh, 240px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.mm-live-note-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px dashed var(--mm-border);
  font-size: 12px;
}
.mm-live-note-row:last-child { border-bottom: 0; }
.mm-live-note-row .mm-live-text { flex: 1; min-width: 0; }
.mm-live-kind-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--mm-chip);
  color: var(--mm-text-3);
  font-size: 12px;
  white-space: nowrap;
}
.mm-live-kind-tag.decision { background: var(--mm-ok-bg); color: var(--mm-ok-fg); }
.mm-live-kind-tag.todo { background: var(--mm-info-bg); color: var(--mm-info-fg); }
.mm-live-kind-tag.risk { background: var(--mm-danger-bg); color: var(--mm-danger); }
.mm-live-kind-tag.question { background: var(--mm-pending-bg); color: var(--mm-pending-fg); }
.mm-live-del {
  padding: 1px 8px;
  background: transparent;
  color: var(--mm-text-4);
  border: 1px solid var(--mm-border);
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}
.mm-live-del:hover { color: var(--mm-danger); border-color: var(--mm-danger); }

.mm-live-insight-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
  max-height: min(34vh, 320px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-right: 4px;
}
.mm-live-insight-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px 10px;
  background: var(--mm-card);
  border: 1px solid var(--mm-card-border);
  border-radius: 8px;
}
.mm-live-insight-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; }
.mm-live-insight-head b { color: var(--mm-text); font-size: 12px; font-weight: 500; }
.mm-live-insight-head span {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--mm-chip);
  color: var(--mm-text-3);
  font-size: 12px;
}
.mm-live-insight-head i { width: 100%; color: var(--mm-text-5); font-size: 12px; font-style: normal; }
.mm-live-insight {
  padding: 6px 8px;
  background: var(--mm-panel);
  border: 1px solid var(--mm-border);
  border-radius: 6px;
}
.mm-live-insight p { margin: 0 0 4px; color: var(--mm-text-2); font-size: 13px; line-height: 1.6; word-break: break-word; }
.mm-live-insight-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--mm-text-4);
  font-size: 12px;
}

.mm-live-summary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 0.85fr);
  gap: 12px;
  margin-top: 10px;
}
.mm-live-summary-main { min-width: 0; }
.mm-live-summary-side {
  min-width: 0;
  max-height: min(60vh, 560px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-right: 4px;
}
.mm-live-summary-side .mm-actions { flex-wrap: wrap; margin-top: 0; }
.mm-live-sum-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(46vh, 440px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-right: 4px;
}
.mm-live-sum-row {
  padding: 8px 10px;
  background: var(--mm-card);
  border: 1px solid var(--mm-card-border);
  border-radius: 8px;
}
.mm-live-sum-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.mm-live-sum-head b { color: var(--mm-text); font-size: 12px; font-weight: 500; }
.mm-live-sum-head > span:last-child { margin-left: auto; color: var(--mm-text-4); font-size: 12px; }
.mm-live-sum-value { color: var(--mm-value); font-size: 12px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
.mm-live-sum-value.empty { color: var(--mm-pending-fg); }
.mm-live-sum-manual { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--mm-border); }
.mm-live-sum-manual > b { display: block; margin-bottom: 4px; color: var(--mm-text-3); font-size: 13px; font-weight: 500; }
.mm-live-publish { flex-wrap: wrap; }
.mm-live-sub-head { display: flex; align-items: baseline; gap: 6px; margin: 10px 0 4px; color: var(--mm-text-2); font-size: 12px; }
.mm-live-sub-head small { color: var(--mm-text-4); font-size: 12px; }
.mm-live-format-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 6px 0 10px; }
.mm-live-format {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  background: var(--mm-chip);
  color: var(--mm-text-2);
  border: 1px solid var(--mm-border);
  border-radius: 8px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.mm-live-format b { color: var(--mm-text); font-weight: 500; }
.mm-live-format span { color: var(--mm-text-4); font-size: 12px; }
.mm-live-format:disabled { opacity: 0.45; cursor: not-allowed; }
.mm-live-confirm { margin-top: 10px; }
.mm-live-confirm > summary { color: var(--mm-link); font-size: 12px; cursor: pointer; }
.mm-live-confirm-row { padding: 8px 0; border-bottom: 1px dashed var(--mm-border); }
.mm-live-confirm-row:last-child { border-bottom: 0; }
.mm-live-confirm-row textarea { margin: 6px 0; }
.mm-live-confirm-row .mm-actions { flex-wrap: wrap; }
.mm-live-confirm-row input {
  flex: 1;
  min-width: 130px;
  padding: 4px 8px;
  background: var(--mm-inset);
  color: var(--mm-text);
  border: 1px solid var(--mm-border-strong);
  border-radius: 6px;
  font-size: 13px;
}

/* 滚动条：与既有面板一致的浅灰槽 + 主题化滑块（实时记录 / 人工记录 / AI 分析 / 总结侧栏） */
.mm-live-stream::-webkit-scrollbar,
.mm-live-manual-list::-webkit-scrollbar,
.mm-live-insight-grid::-webkit-scrollbar,
.mm-live-summary-side::-webkit-scrollbar,
.mm-live-sum-list::-webkit-scrollbar { width: 8px; height: 8px; }
.mm-live-stream::-webkit-scrollbar-thumb,
.mm-live-manual-list::-webkit-scrollbar-thumb,
.mm-live-insight-grid::-webkit-scrollbar-thumb,
.mm-live-summary-side::-webkit-scrollbar-thumb,
.mm-live-sum-list::-webkit-scrollbar-thumb {
  background: var(--mm-border-strong);
  border-radius: 999px;
}
.mm-live-stream::-webkit-scrollbar-track,
.mm-live-manual-list::-webkit-scrollbar-track,
.mm-live-insight-grid::-webkit-scrollbar-track,
.mm-live-summary-side::-webkit-scrollbar-track,
.mm-live-sum-list::-webkit-scrollbar-track { background: transparent; }

@media (max-width: 1100px) {
  .mm-live-top-main { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mm-live-clock { grid-column: span 2; }
  .mm-live-bands { grid-template-columns: 1fr; }
  .mm-live-insight-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); max-height: min(50vh, 420px); }
  .mm-live-summary-grid { grid-template-columns: 1fr; }
  .mm-live-summary-side { max-height: min(70vh, 620px); }
}
</style>
