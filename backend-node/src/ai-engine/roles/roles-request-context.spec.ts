const fs = require('fs');
const path = require('path');

describe('roles request context wiring', () => {
  function readRole(name) {
    return fs.readFileSync(path.join(__dirname, `${name}.js`), 'utf-8');
  }

  it('核心 roles 会把 signal 与请求预算透传给 invokeWithTimeout', () => {
    const layoutReviewer = readRole('layout-reviewer');
    const styleMapper = readRole('style-mapper');
    const layoutRefiner = readRole('layout-refiner');
    const styleRefiner = readRole('style-refiner');
    const mergedRefiner = readRole('layout-style-refiner');
    const adversarialChecker = readRole('adversarial-checker');
    // 🛡️ 2026-09-13：microcode 的 LLM 调用点已从 microcode-engineer.js 下沉到
    // microcode/code-generator.js（分块生成器持有 invokeWithTimeout 调用），
    // 故 signal / 请求预算透传的契约断言随之迁移到新位置（意图不变）。
    const codeGenerator = readRole('microcode/code-generator');
    const visualParser = readRole('visual-parser');
    const visualComparator = readRole('visual-comparator');

    expect(layoutReviewer).toContain('signal: options.signal');
    expect(layoutReviewer).toContain('requestTimeoutMs: options.requestTimeoutMs');

    expect(styleMapper).toContain('signal: options.signal');
    expect(styleMapper).toContain('requestConcurrency: options.requestConcurrency');

    expect(layoutRefiner).toContain('signal: params.signal');
    expect(styleRefiner).toContain('signal: params.signal');
    expect(mergedRefiner).toContain('signal: params.signal');

    expect(adversarialChecker).toContain('signal: options.signal');
    expect(adversarialChecker).toContain('requestMaxRetries: options.requestMaxRetries');
    expect(adversarialChecker).toContain('return await this.check(files, layoutStructure, retryCount + 1, componentType, sfcFacts, options)');

    expect(codeGenerator).toContain('signal: input.signal');
    expect(codeGenerator).toContain('requestTimeoutMs: Math.max(');

    expect(visualParser).toContain('signal = null');
    expect(visualParser).toContain('requestTimeoutMs,');
    // 🛡️ 2026-09-13：可选参数对象已更名 requestOptions → visionRequestOptions（同名断言同步）
    expect(visualParser).toContain('this.visionAgent.analyzeImage(imagePath, prompt, visionRequestOptions)');

    expect(visualComparator).toContain('async compare(figmaImagePath, renderedImagePath, options = {})');
    expect(visualComparator).toContain('COMPARISON_PROMPT,');
    expect(visualComparator).toContain('options');
  });
});
