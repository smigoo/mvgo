/**
 * 根治⑫B spec：确定性产物缺陷判定应命中 SFC 语法错（编译期）。
 * 钉子：mc-1794490786159-c6e73f7a（2026-11-12 真机）——修复轮后置注入把
 * ContentVehicleDist.vue 的 :style 对象改坏 → 预览「组件加载失败」，
 * errorType='component-load'、loadError 无 SyntaxError 前缀 → 旧判据全漏 →
 * 降级 completed，坏产物带「成功」交付。
 */
import {
  hasDeterministicRuntimeMissing,
  DETERMINISTIC_MISSING_PATTERNS,
} from './runtime-error-classifier.js';

describe('runtime-error-classifier 根治⑫B：SFC 语法错 = 确定性产物缺陷', () => {
  /** c6e73f7a 真机 evidence 钉 */
  const REAL_GATE = {
    issues: [
      {
        id: 'RUNTIME-004',
        severity: 'BLOCK',
        category: 'preview-status',
        message: '真实预览状态为 load-error',
        evidence: {
          status: 'load-error',
          errorType: 'component-load',
          loadError:
            '组件加载失败 这是 组件自身的问题 （如文件缺失、样式编译错误或引用了不支持的资源）…原始错误：Unexpected token, expected "," (19:15)',
        },
      },
      {
        id: 'RUNTIME-010',
        severity: 'BLOCK',
        category: 'console',
        message: '组件预览输出 console.error',
        evidence: {
          errors: [
            {
              text: '[预览] 加载失败: SyntaxError: Unexpected token, expected "," (19:15)',
            },
          ],
        },
      },
    ],
  };

  test('真机钉：component-load + Unexpected token loadError ⇒ 确定性（不再降级 completed）', () => {
    expect(hasDeterministicRuntimeMissing(REAL_GATE)).toBe(true);
  });

  test('errors[].text 带 SyntaxError 前缀路径也命中', () => {
    expect(
      hasDeterministicRuntimeMissing({
        issues: [
          {
            id: 'RUNTIME-010',
            severity: 'BLOCK',
            evidence: {
              errors: [{ text: 'SyntaxError: Unexpected token' }],
            },
          },
        ],
      }),
    ).toBe(true);
  });

  test('环境类错误不被误伤：网络失败/导航错误仍走降级通道', () => {
    expect(
      hasDeterministicRuntimeMissing({
        issues: [
          {
            id: 'RUNTIME-004',
            severity: 'BLOCK',
            evidence: {
              status: 'load-error',
              errorType: 'component-load',
              loadError: 'net::ERR_CONNECTION_REFUSED at http://127.0.0.1:2610',
            },
          },
        ],
      }),
    ).toBe(false);
  });

  test('新模式确实在白名单里（防误删回归）', () => {
    expect(DETERMINISTIC_MISSING_PATTERNS.some((re) => re.test('Unexpected token, expected ","'))).toBe(true);
    expect(DETERMINISTIC_MISSING_PATTERNS.some((re) => re.test('SyntaxError: bad parse'))).toBe(true);
  });
});
