import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;
const projectRoot = path.resolve(root, '..');

const figmaModule = await import(pathToFileURL(path.join(root, 'src/ai-engine/roles/figma-connector.js')).href);
const { FigmaConnector } = figmaModule;

const aiConfigPath = path.join(root, 'data', 'ai-config.json');
const aiConfig = fs.existsSync(aiConfigPath)
  ? JSON.parse(fs.readFileSync(aiConfigPath, 'utf-8'))
  : {};
const figmaToken = typeof aiConfig.figmaToken === 'string' ? aiConfig.figmaToken.trim() : '';
if (!figmaToken) {
  throw new Error('缺少 Figma Token：服务端已保存配置 data/ai-config.json 中不存在 figmaToken');
}

const connector = new FigmaConnector({ figmaToken });
const tasksPath = path.join(root, 'data', 'tasks.json');
const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));

function collectComponentDirs(baseDir, grouped) {
  if (!fs.existsSync(baseDir)) return [];
  const dirs = [];
  if (grouped) {
    for (const group of fs.readdirSync(baseDir)) {
      const groupPath = path.join(baseDir, group);
      if (!fs.statSync(groupPath).isDirectory()) continue;
      for (const comp of fs.readdirSync(groupPath)) {
        const compPath = path.join(groupPath, comp);
        if (fs.statSync(compPath).isDirectory()) dirs.push(compPath);
      }
    }
  } else {
    for (const comp of fs.readdirSync(baseDir)) {
      const compPath = path.join(baseDir, comp);
      if (fs.statSync(compPath).isDirectory()) dirs.push(compPath);
    }
  }
  return dirs;
}

function shouldSkipDir(dir) {
  const name = path.basename(dir);
  return name.includes('.quality-backup-') || name.startsWith('.') || name.includes('.backup');
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function findTaskMeta(componentId) {
  for (let i = tasks.length - 1; i >= 0; i--) {
    const task = tasks[i];
    if (task?.componentId !== componentId && task?.sessionId !== componentId) continue;
    if (task?.fileKey && task?.nodeId) {
      return {
        fileKey: task.fileKey,
        nodeId: task.nodeId,
        groupId: task.groupId || null,
        target: task.target || null,
      };
    }
  }
  return null;
}

function resolveMeta(dir) {
  const cacheMeta = readJsonIfExists(path.join(dir, '.mc-gen', 'cache', 'figma-node-data.json'));
  if (cacheMeta?.fileKey && cacheMeta?.nodeId) {
    return { fileKey: cacheMeta.fileKey, nodeId: cacheMeta.nodeId, source: 'cache' };
  }

  const componentId = path.basename(dir).split('.quality-backup-')[0];
  const taskMeta = findTaskMeta(componentId);
  if (taskMeta?.fileKey && taskMeta?.nodeId) {
    return { fileKey: taskMeta.fileKey, nodeId: taskMeta.nodeId, source: 'tasks' };
  }

  return null;
}

const scanTargets = [
  { label: 'backend-vue3', baseDir: path.join(root, 'workspace', 'vue3-components'), grouped: true },
  { label: 'backend-microcode', baseDir: path.join(root, 'workspace', 'custom-components'), grouped: false },
  { label: 'frontend-vue3', baseDir: path.join(projectRoot, 'frontend', 'workspace', 'vue3-components'), grouped: true },
  { label: 'frontend-microcode', baseDir: path.join(projectRoot, 'frontend', 'workspace', 'custom-components'), grouped: false },
];

const report = [];

for (const target of scanTargets) {
  const dirs = collectComponentDirs(target.baseDir, target.grouped);
  for (const dir of dirs) {
    if (shouldSkipDir(dir)) continue;

    const previewPath = path.join(dir, 'resources', 'images', 'mc-preview.png');
    if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 1000) {
      continue;
    }

    const meta = resolveMeta(dir);
    if (!meta) {
      report.push({ scope: target.label, dir, status: 'skipped', reason: 'missing fileKey/nodeId' });
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(previewPath), { recursive: true });
      await connector.downloadPreviewImage(meta.fileKey, meta.nodeId, previewPath);
      report.push({ scope: target.label, dir, status: 'fixed', source: meta.source, fileKey: meta.fileKey, nodeId: meta.nodeId });
    } catch (error) {
      report.push({ scope: target.label, dir, status: 'failed', source: meta.source, fileKey: meta.fileKey, nodeId: meta.nodeId, error: error.message });
    }
  }
}

console.log(JSON.stringify(report, null, 2));
