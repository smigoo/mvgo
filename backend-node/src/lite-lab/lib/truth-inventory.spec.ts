/**
 * truth-inventory 组装层（S3 抽取）行为等价回归：
 * 逻辑逐段搬运自 lite-lab.service 内联版（抽取前），用例锁四段职责：
 * imageRef 三级对齐 / VECTOR 反哺 / 去重 / feed 统计。
 * 几何/锚定判据本体在 truth-matcher.spec 与 asset-feed.spec 已覆盖，此处只锁组装语义。
 */
import { buildTruthInventory } from './truth-inventory';

/** 最小 Figma 树：1 个 TEXT + 1 个 VECTOR 图标（无 IMAGE fill ⇒ 主采集收不到） */
function treeWithVector(nodeId: string, iconName: string, text = '部署节点概览'): any {
  return {
    id: '0:1',
    type: 'FRAME',
    name: 'root',
    absoluteBoundingBox: { x: 0, y: 0, width: 510, height: 665 },
    children: [
      { id: '0:2', type: 'TEXT', name: 'title', characters: text, style: { fontSize: 16 } },
      {
        id: nodeId,
        type: 'VECTOR',
        name: iconName,
        absoluteBoundingBox: { x: 480, y: 8, width: 10, height: 10 },
      },
    ],
  };
}

describe('truth-inventory（S3 共享组装层）', () => {
  it('VECTOR 反哺：下载成功但主采集收不到 ⇒ 造真值条目（含 nearbyTexts/几何/parentMeta）', () => {
    const tree = treeWithVector('48:5903', 'icon-关闭');
    const downloaded = [
      { ref: '48:5903', name: 'icon-关闭', localPath: '/tmp/x/icon-关闭-5903.png' },
    ];
    const { truth, feed } = buildTruthInventory(tree, downloaded);
    expect(feed.fed).toBe(1);
    expect(feed.aligned).toBe(0);
    const a = truth.assets.find((x) => x.nodeId === '48:5903');
    expect(a).toBeDefined();
    expect(a!.fileName).toBe('icon-关闭-5903.png');
    expect(a!.nearbyTexts).toContain('部署节点概览');
    expect(a!.width).toBe(10);
    expect(a!.x).toBe(480); // 🔴 S1：反哺必带 x/y
    expect(a!.y).toBe(8);
    expect(a!.parentFill).toBeNull();
  });

  it('imageRef 三级对齐：IMAGE fill 主采集条目 ↔ 下载文件名（imageRef 子树映射）', () => {
    const tree = {
      id: '0:1',
      type: 'FRAME',
      name: 'root',
      children: [
        {
          id: '2:8037',
          type: 'RECTANGLE',
          name: 'bg',
          fills: [
            { type: 'IMAGE', visible: true, imageRef: 'img-ref-abc' },
          ],
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
        },
        // 外层容器（downloadAssets 实际下载的命名对象）——子节点必须是完整节点
        // （buildImageRefIndex 的子树传播要求真实 children 结构）
        {
          id: '2:8036',
          type: 'GROUP',
          name: 'icon-8036',
          children: [
            {
              id: '2:8037',
              type: 'RECTANGLE',
              name: 'bg',
              fills: [{ type: 'IMAGE', visible: true, imageRef: 'img-ref-abc' }],
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
            },
          ],
        },
      ],
    };
    const downloaded = [
      { ref: '2:8036', name: 'icon-8036', localPath: '/tmp/x/bg-8036.png' },
    ];
    const { truth, feed } = buildTruthInventory(tree, downloaded);
    // 主采集按 imageRef 对齐到下载文件名；外层容器不重复造条目（去重）
    expect(feed.aligned).toBe(1);
    expect(feed.fed).toBe(0);
    const a = truth.assets.find((x) => x.imageRef === 'img-ref-abc');
    expect(a!.fileName).toBe('bg-8036.png');
  });

  it('feed 统计：unmatched = 有条目无 fileName（下载失败场景）；空下载清单 fed=0', () => {
    const tree = treeWithVector('48:5903', 'icon-关闭');
    const { truth, feed } = buildTruthInventory(tree, []);
    expect(feed.downloaded).toBe(0);
    expect(feed.fed).toBe(0);
    // 主采集收不到 VECTOR ⇒ assets 空 ⇒ unmatched=0
    expect(truth.assets.length).toBe(0);
    expect(feed.unmatched).toBe(0);
  });

  it('resolveFeedNodeId 兜底链：ref 无法解析节点时按文件名后缀反查（历史兼容）', () => {
    const tree = treeWithVector('48:5903', 'icon-关闭');
    // ref 给一个不存在的 id ⇒ 走后缀 5903 反查命中 48:5903
    const downloaded = [
      { ref: '999:999', name: 'icon-关闭', localPath: '/tmp/x/icon-关闭-5903.png' },
    ];
    const { truth, feed } = buildTruthInventory(tree, downloaded);
    expect(feed.fed).toBe(1);
    expect(truth.assets[0].nodeId).toBe('48:5903');
  });
});
