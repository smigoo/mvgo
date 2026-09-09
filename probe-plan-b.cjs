// 方案 B++ 探针：模型库与配置均为「独一份」，全局仅系统凭证
// 场景：1) 无用户配置 → 全空（不下发 models、无默认绑定、无 legacy 回退）
//       2) 用户自有库+绑定 → 完整生效
//       3) 老用户仅存 legacy 扁平字段 → legacy 生效
//       4) 全局文件残留旧格式模型字段 → 一律不下发
//       5) userId 为空 → 仅系统凭证
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'backend-node', 'data', 'ai-config.json');
const BACKUP = '/tmp/ai-config.probe-backup.json';

const GLOBAL_WITH_RESIDUE = {
  figmaToken: 'figd_GLOBAL',
  apifoxToken: 'afxp_GLOBAL',
  textModel: 'admin-personal-text-model',
  textApiKey: 'sk-admin',
  visionModel: 'admin-personal-vision-model',
  binding: { text: { primaryId: 'm1' }, vision: { primaryId: 'm2' } },
  modelMode: 'separate',
  models: [
    { id: 'm1', name: '库文本', apiKey: 'sk-lib1', baseURL: 'https://lib1', model: 'lib-text-1', capability: 'text' },
    { id: 'm2', name: '库视觉', apiKey: 'sk-lib2', baseURL: 'https://lib2', model: 'lib-vision-1', capability: 'vision' },
  ],
};

async function main() {
  fs.copyFileSync(DATA_FILE, BACKUP);
  const { AiConfigService } = require('./backend-node/dist/config/config.service.js');
  let pass = 0, fail = 0;
  const check = (name, cond, extra) => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' | ' + extra : ''}`); }
  };

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(GLOBAL_WITH_RESIDUE, null, 2));

    // ---- 场景 1：无用户配置 → 全空 ----
    {
      const svc = new AiConfigService({ getUserConfig: async () => null }, null);
      const cfg = await svc.getMergedAiConfig('userA');
      console.log('场景1 无用户配置（应全空）:');
      check('不下发 models', cfg.models === undefined, JSON.stringify(cfg.models)?.slice(0, 80));
      check('无 textModel（不推导不回退）', cfg.textModel === undefined, String(cfg.textModel));
      check('无 visionModel', cfg.visionModel === undefined, String(cfg.visionModel));
      check('无 binding', cfg.binding === undefined, JSON.stringify(cfg.binding));
      check('系统凭证仍继承（figmaToken）', cfg.figmaToken === 'figd_GLOBAL');
      check('系统凭证仍继承（apifoxToken）', cfg.apifoxToken === 'afxp_GLOBAL');
    }

    // ---- 场景 2：用户自有库 + 绑定 → 完整生效 ----
    {
      const userCfg = {
        modelMode: 'separate',
        models: [
          { id: 'u1', name: '我的文本', apiKey: 'sk-my1', baseURL: 'https://my1', model: 'my-text-1', capability: 'text' },
          { id: 'u2', name: '我的视觉', apiKey: 'sk-my2', baseURL: 'https://my2', model: 'my-vision-1', capability: 'vision' },
        ],
        binding: { text: { primaryId: 'u1' }, vision: { primaryId: 'u2' } },
      };
      const svc = new AiConfigService({ getUserConfig: async () => userCfg }, null);
      const cfg = await svc.getMergedAiConfig('userB');
      console.log('场景2 个人库 + 绑定:');
      check('个人库原样生效（2 条）', Array.isArray(cfg.models) && cfg.models.length === 2, String(cfg.models?.length));
      check('个人 text 绑定生效', cfg.binding?.text?.primaryId === 'u1');
      check('textModel 降维为 my-text-1', cfg.textModel === 'my-text-1', cfg.textModel);
      check('visionModel 降维为 my-vision-1', cfg.visionModel === 'my-vision-1', cfg.visionModel);
    }

    // ---- 场景 3：老用户仅存 legacy 扁平字段 ----
    {
      const userCfg = { textModel: 'my-old-text', textApiKey: 'sk-old', modelMode: 'separate' };
      const svc = new AiConfigService({ getUserConfig: async () => userCfg }, null);
      const cfg = await svc.getMergedAiConfig('userC');
      console.log('场景3 老用户 legacy 字段:');
      check('legacy textModel 保留生效', cfg.textModel === 'my-old-text', cfg.textModel);
      check('不下发全局 models', cfg.models === undefined);
    }

    // ---- 场景 4：全局旧格式残留模型字段 → 一律不下发 ----
    {
      const svc = new AiConfigService({ getUserConfig: async () => null }, null);
      const cfg = await svc.getMergedAiConfig('userD');
      console.log('场景4 全局残留不回退:');
      check('无 textModel（全局残留不下发）', cfg.textModel === undefined, String(cfg.textModel));
      check('无 binding', cfg.binding === undefined);
      check('无 models', cfg.models === undefined);
    }

    // ---- 场景 5：userId 为空 → 仅系统凭证 ----
    {
      const svc = new AiConfigService({ getUserConfig: async () => null }, null);
      const cfg = await svc.getMergedAiConfig();
      console.log('场景5 无 userId:');
      check('仅系统凭证', cfg.figmaToken === 'figd_GLOBAL' && cfg.apifoxToken === 'afxp_GLOBAL');
      check('无模型相关字段', cfg.textModel === undefined && cfg.models === undefined);
    }
  } finally {
    fs.copyFileSync(BACKUP, DATA_FILE);
    console.log('（已恢复原 ai-config.json）');
  }
  console.log(`\n结果: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(2); });
