async page => {
  const step1 = await page.evaluate(() => {
    function findInst() {
      const el = document.querySelector('input.form-input');
      let inst = el && el.__vueParentComponent;
      while (inst) {
        if (inst.setupState && ('frameResize' in inst.setupState)) return inst;
        inst = inst.parent;
      }
      return null;
    }
    const inst = findInst();
    if (!inst) return { found: false };
    const ss = inst.setupState;
    const compName = (inst.type && (inst.type.__name || inst.type.name)) || '?';
    // 打开预览态 + 假 URL（避免真请求）
    ss.showPreview = true;
    ss.previewUrl = 'about:blank';
    // 注入「设计稿尺寸」真值（等价 /phase2/figma-preview 返回）
    ss.figmaPreview = { imageUrl: '', nodeName: 'mock-node', width: 420, height: 147, previewToken: 'mock' };
    // 进入响应式测试模式
    ss.responsiveTestMode = true;
    return {
      found: true,
      compName,
      hasFigmaPreview: 'figmaPreview' in ss,
      hasResponsiveTestMode: 'responsiveTestMode' in ss
    };
  });
  if (!step1.found) return { step1 };

  await page.waitForTimeout(600);

  const step2 = await page.evaluate(() => {
    const toolbar = document.querySelector('.rz-toolbar');
    const size = document.querySelector('.rz-toolbar .rz-size');
    const preset = document.querySelector('.rz-toolbar .rz-preset');
    const canvas = document.querySelector('.rz-canvas');
    const iframe = document.querySelector('.rz-canvas .preview-iframe');
    const r = canvas ? canvas.getBoundingClientRect() : null;
    return {
      toolbarExists: !!toolbar,
      sizeLabel: size ? size.textContent.trim() : null,
      presetName: preset ? preset.textContent.trim() : null,
      canvasRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      iframeInlineStyle: iframe ? iframe.getAttribute('style') : null
    };
  });
  return { step1, step2 };
}
