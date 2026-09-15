/**
 * R5-visible（2026-09-15）：pruneRedundantFields 过滤 Figma 隐藏节点（visible:false）。
 * 事故：「*数据实时更新」是设计师放的隐藏注释节点（* 前缀 + visible:false），在 Figma 界面
 * 不可见，但 Figma API 仍返回 name/characters。旧过滤只清 characters 不清 name →
 * extractFigmaHints 用 name 提取结构摘要 → 泄漏进 vision prompt → LLM 当 UI 文本照抄。
 * 治本：visible:false 节点清 name+characters（保留 bbox 供布局）。
 */
import { FigmaConnector } from '../figma-connector.js';

// backend-root.js 用 import.meta.url（ESM），jest CJS 下无法加载 → mock 掉路径解析
jest.mock('../../../config/backend-root.js', () => {
  const root = '/Users/smigoo/工作/mvgo/backend-node';
  return {
    backendRoot: root,
    projectRoot: '/Users/smigoo/工作/mvgo',
    workspaceRoot: `${root}/workspace`,
    customComponentsDir: `${root}/workspace/custom-components`,
    vue3ComponentsDir: `${root}/workspace/vue3-components`,
    resolveFrontendWorkspacePath: () => '/Users/smigoo/工作/mvgo/frontend/workspace',
    frontendCustomComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components',
    frontendVue3ComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/vue3-components',
    tempComponentsDir: '/Users/smigoo/工作/mvgo/temp-components',
    dataDir: `${root}/data`,
    logsDir: `${root}/logs`,
    configDir: `${root}/config`,
    chatAttachmentsDir: `${root}/temp-chat-attachments`,
    apifoxZipsDir: `${root}/data/apifox-zips`,
    apiCatalogsDir: `${root}/data/api-catalogs`,
  };
});

describe('pruneRedundantFields · visible:false 隐藏节点过滤', () => {
  const conn = new FigmaConnector({ figmaToken: 'fake-token-for-test' });

  const mkText = (id, name, visible) => ({
    id,
    name,
    type: 'TEXT',
    visible,
    absoluteBoundingBox: { x: 10, y: 10, width: 91, height: 21 },
    characters: name,
  });

  it('visible:false 节点：清 name + 不保留 characters，但保留 bbox/type', () => {
    const pruned = conn.pruneRedundantFields(
      mkText('2:1', '*数据实时更新', false),
    );
    expect(pruned.name).toBe('');
    expect(pruned.characters).toBeUndefined();
    expect(pruned.type).toBe('TEXT');
    expect(pruned.absoluteBoundingBox).toEqual({
      x: 10,
      y: 10,
      width: 91,
      height: 21,
    });
  });

  it('visible:true / visible 缺失节点：name + characters 正常保留', () => {
    const visibleTrue = conn.pruneRedundantFields(
      mkText('2:2', '设备监测', true),
    );
    expect(visibleTrue.name).toBe('设备监测');
    expect(visibleTrue.characters).toBe('设备监测');

    // 兼容旧数据：visible 字段缺失（undefined）≠ false，不受影响
    const noVisible = conn.pruneRedundantFields({
      id: '2:3',
      name: '设备总数',
      type: 'TEXT',
      characters: '设备总数',
    });
    expect(noVisible.name).toBe('设备总数');
    expect(noVisible.characters).toBe('设备总数');
  });

  it('嵌套子树：隐藏节点过滤，可见兄弟节点保留', () => {
    const tree = {
      id: '0:1',
      name: 'header',
      type: 'FRAME',
      children: [
        mkText('2:1', '*数据实时更新', false),
        mkText('2:2', '设备监测', true),
      ],
    };
    const pruned = conn.pruneRedundantFields(tree);
    expect(pruned.children[0].name).toBe('');
    expect(pruned.children[0].characters).toBeUndefined();
    expect(pruned.children[1].name).toBe('设备监测');
    expect(pruned.children[1].characters).toBe('设备监测');
  });
});
